import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import multer from "multer";
import fs from "node:fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || "CHANGE_THIS_SECRET_IN_PRODUCTION";

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "data");
const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(DATA_DIR, "uploads");
fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const db = new Database(path.join(DATA_DIR, "thong-audio.db"));
db.pragma("foreign_keys = ON");
db.exec(fs.readFileSync(path.join(__dirname, "schema.sql"), "utf8"));

const adminUser = process.env.ADMIN_USER || "admin";
const adminPass = process.env.ADMIN_PASS || "admin123";
const exists = db.prepare("SELECT id FROM users WHERE username=?").get(adminUser);
if (!exists) {
  const hash = bcrypt.hashSync(adminPass, 12);
  db.prepare("INSERT INTO users(username,password_hash,role) VALUES(?,?,?)")
    .run(adminUser, hash, "admin");
  console.log(`Created admin account: ${adminUser}`);
}

app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true }));
app.use("/uploads", express.static(UPLOAD_DIR));
app.use(express.static(path.join(__dirname, "public")));

const upload = multer({
  dest: UPLOAD_DIR,
  limits: { fileSize: 5 * 1024 * 1024 }
});

function sign(user) {
  return jwt.sign({ id: user.id, username: user.username, role: user.role }, JWT_SECRET, { expiresIn: "7d" });
}
function auth(req, res, next) {
  const h = req.headers.authorization || "";
  if (!h.startsWith("Bearer ")) return res.status(401).json({ error: "Bạn chưa đăng nhập" });
  try { req.user = jwt.verify(h.slice(7), JWT_SECRET); next(); }
  catch { res.status(401).json({ error: "Phiên đăng nhập hết hạn" }); }
}
function admin(req, res, next) {
  if (req.user?.role !== "admin") return res.status(403).json({ error: "Chỉ Admin được phép" });
  next();
}

app.post("/api/auth/register", (req,res) => {
  const username = String(req.body.username || "").trim();
  const password = String(req.body.password || "");
  if (username.length < 3 || password.length < 6) return res.status(400).json({error:"Tên tài khoản >= 3 ký tự, mật khẩu >= 6 ký tự"});
  try {
    const hash = bcrypt.hashSync(password, 12);
    const info = db.prepare("INSERT INTO users(username,password_hash) VALUES(?,?)").run(username, hash);
    const user = db.prepare("SELECT id,username,role FROM users WHERE id=?").get(info.lastInsertRowid);
    res.json({ user, token: sign(user) });
  } catch { res.status(409).json({error:"Tên tài khoản đã tồn tại"}); }
});

app.post("/api/auth/login", (req,res) => {
  const username = String(req.body.username || "").trim();
  const password = String(req.body.password || "");
  const user = db.prepare("SELECT * FROM users WHERE username=?").get(username);
  if (!user || !bcrypt.compareSync(password, user.password_hash)) return res.status(401).json({error:"Sai tài khoản hoặc mật khẩu"});
  const safe = { id:user.id, username:user.username, role:user.role };
  res.json({ user:safe, token:sign(safe) });
});

app.get("/api/me", auth, (req,res) => res.json({user:req.user}));

app.get("/api/stories", (req,res) => {
  const q = String(req.query.q || "").trim();
  const genre = String(req.query.genre || "").trim();
  let sql = `SELECT s.id,s.title,s.author,s.genre,s.description,s.cover_url,s.status,s.views,s.created_at,
             COUNT(c.id) chapters
             FROM stories s LEFT JOIN chapters c ON c.story_id=s.id
             WHERE s.status='published'`;
  const args = [];
  if (q) { sql += " AND (s.title LIKE ? OR s.author LIKE ?)"; args.push(`%${q}%`,`%${q}%`); }
  if (genre) { sql += " AND s.genre=?"; args.push(genre); }
  sql += " GROUP BY s.id ORDER BY s.updated_at DESC";
  res.json(db.prepare(sql).all(...args));
});

app.get("/api/genres", (req,res) => {
  res.json(db.prepare("SELECT DISTINCT genre FROM stories WHERE status='published' ORDER BY genre").all().map(x=>x.genre));
});

app.get("/api/stories/:id", (req,res) => {
  const story = db.prepare(`SELECT s.*, COUNT(c.id) chapters FROM stories s
    LEFT JOIN chapters c ON c.story_id=s.id WHERE s.id=? AND s.status='published' GROUP BY s.id`).get(req.params.id);
  if (!story) return res.status(404).json({error:"Không tìm thấy truyện"});
  db.prepare("UPDATE stories SET views=views+1 WHERE id=?").run(req.params.id);
  story.views += 1;
  story.chapters = db.prepare("SELECT id,chapter_number,title FROM chapters WHERE story_id=? ORDER BY chapter_number").all(req.params.id);
  res.json(story);
});

app.get("/api/stories/:id/chapters/:chapterId", (req,res) => {
  const c = db.prepare(`SELECT c.*,s.title story_title FROM chapters c JOIN stories s ON s.id=c.story_id
    WHERE c.id=? AND c.story_id=? AND s.status='published'`).get(req.params.chapterId, req.params.id);
  if (!c) return res.status(404).json({error:"Không tìm thấy chương"});
  res.json(c);
});

app.post("/api/favorites/:storyId", auth, (req,res) => {
  const found = db.prepare("SELECT 1 FROM favorites WHERE user_id=? AND story_id=?").get(req.user.id, req.params.storyId);
  if (found) db.prepare("DELETE FROM favorites WHERE user_id=? AND story_id=?").run(req.user.id, req.params.storyId);
  else db.prepare("INSERT OR IGNORE INTO favorites(user_id,story_id) VALUES(?,?)").run(req.user.id, req.params.storyId);
  res.json({favorite:!found});
});

app.get("/api/favorites", auth, (req,res) => {
  res.json(db.prepare(`SELECT s.id,s.title,s.author,s.genre,s.cover_url FROM favorites f
    JOIN stories s ON s.id=f.story_id WHERE f.user_id=? ORDER BY f.created_at DESC`).all(req.user.id));
});

app.post("/api/progress", auth, (req,res) => {
  const {storyId,chapterId} = req.body;
  db.prepare(`INSERT INTO progress(user_id,story_id,chapter_id) VALUES(?,?,?)
    ON CONFLICT(user_id,story_id) DO UPDATE SET chapter_id=excluded.chapter_id,updated_at=CURRENT_TIMESTAMP`)
    .run(req.user.id, storyId, chapterId);
  res.json({ok:true});
});

app.get("/api/progress/:storyId", auth, (req,res) => {
  res.json(db.prepare("SELECT * FROM progress WHERE user_id=? AND story_id=?").get(req.user.id, req.params.storyId) || null);
});

// Admin API
app.get("/api/admin/stories", auth, admin, (req,res) => {
  res.json(db.prepare(`SELECT s.*,COUNT(c.id) chapters FROM stories s LEFT JOIN chapters c ON c.story_id=s.id
    GROUP BY s.id ORDER BY s.updated_at DESC`).all());
});

app.post("/api/admin/stories", auth, admin, (req,res) => {
  const {title,author,genre="Khác",description="",cover_url="",status="draft"} = req.body;
  if (!title || !author) return res.status(400).json({error:"Thiếu tên truyện hoặc tác giả"});
  const info = db.prepare(`INSERT INTO stories(title,author,genre,description,cover_url,status,created_by)
    VALUES(?,?,?,?,?,?,?)`).run(title,author,genre,description,cover_url,status,req.user.id);
  res.json(db.prepare("SELECT * FROM stories WHERE id=?").get(info.lastInsertRowid));
});

app.put("/api/admin/stories/:id", auth, admin, (req,res) => {
  const {title,author,genre,description,cover_url,status} = req.body;
  db.prepare(`UPDATE stories SET title=?,author=?,genre=?,description=?,cover_url=?,status=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`)
    .run(title,author,genre,description||"",cover_url||"",status||"draft",req.params.id);
  res.json({ok:true});
});

app.delete("/api/admin/stories/:id", auth, admin, (req,res) => {
  db.prepare("DELETE FROM stories WHERE id=?").run(req.params.id);
  res.json({ok:true});
});

app.post("/api/admin/stories/:id/chapters", auth, admin, (req,res) => {
  const {title,content} = req.body;
  const row = db.prepare("SELECT COALESCE(MAX(chapter_number),0)+1 n FROM chapters WHERE story_id=?").get(req.params.id);
  const info = db.prepare("INSERT INTO chapters(story_id,chapter_number,title,content) VALUES(?,?,?,?)")
    .run(req.params.id,row.n,title,content);
  db.prepare("UPDATE stories SET updated_at=CURRENT_TIMESTAMP WHERE id=?").run(req.params.id);
  res.json(db.prepare("SELECT * FROM chapters WHERE id=?").get(info.lastInsertRowid));
});

app.put("/api/admin/chapters/:id", auth, admin, (req,res) => {
  db.prepare("UPDATE chapters SET title=?,content=? WHERE id=?")
    .run(req.body.title,req.body.content,req.params.id);
  res.json({ok:true});
});

app.delete("/api/admin/chapters/:id", auth, admin, (req,res) => {
  db.prepare("DELETE FROM chapters WHERE id=?").run(req.params.id);
  res.json({ok:true});
});

app.post("/api/admin/upload-cover", auth, admin, upload.single("cover"), (req,res) => {
  if (!req.file) return res.status(400).json({error:"Chưa chọn ảnh"});
  res.json({url:`/uploads/${req.file.filename}`});
});

app.get("/health", (req,res) => res.json({ok:true,service:"thong-audio"}));
app.get("*", (req,res) => res.sendFile(path.join(__dirname,"public","index.html")));
app.listen(PORT, () => console.log(`THÔNG AUDIO running on http://localhost:${PORT}`));
