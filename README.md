# THÔNG AUDIO — Full-stack starter

## Có gì
- Đăng ký / đăng nhập
- JWT session
- Tài khoản Admin
- SQLite database
- Truyện + chương
- Xuất bản / ẩn truyện
- Xóa truyện
- Yêu thích
- Lưu tiến độ đọc
- Lượt xem
- TTS tiếng Việt ngay trên trình duyệt
- Upload cover API
- Giao diện mobile

## Chạy trên máy
Cài Node.js 20+.

```bash
npm install
npm start
```

Mở: http://localhost:3000

Tài khoản Admin mặc định:
- username: admin
- password: admin123

Nên đổi bằng biến môi trường:
- ADMIN_USER
- ADMIN_PASS
- JWT_SECRET
- PORT

Ví dụ:
```bash
ADMIN_USER=admin ADMIN_PASS=matkhau_manh JWT_SECRET=chuoi-bi-mat npm start
```

## Đưa lên máy chủ
Có thể chạy trên VPS hoặc dịch vụ Node.js. Database SQLite nằm ở `data/thong-audio.db`.
Để chạy nhiều máy/traffic lớn, nên chuyển SQLite sang PostgreSQL và file upload sang object storage.

## Lưu ý
Đây là source chạy thật được, nhưng chưa phải hệ thống production hoàn chỉnh. Cần HTTPS, secret mạnh, rate-limit, backup database, kiểm soát upload, phân quyền kỹ hơn và PostgreSQL/object storage nếu lượng người dùng lớn.


## Deploy Railway (khuyến nghị cho bản SQLite hiện tại)

1. Đưa thư mục này lên GitHub.
2. Railway → New Project → Deploy from GitHub Repo.
3. Chọn repository.
4. Service → Variables:
   - `NODE_ENV=production`
   - `JWT_SECRET=` một chuỗi bí mật dài
   - `ADMIN_USER=` tài khoản admin
   - `ADMIN_PASS=` mật khẩu admin mạnh
   - `DATA_DIR=/data`
   - `UPLOAD_DIR=/data/uploads`
5. Service → Volumes → Add Volume.
   - Mount Path: `/data`
   Railway xác nhận volume giúp dữ liệu tồn tại qua deploy/restart; SQLite có thể nằm trong volume. 
6. Settings → Networking → Generate Domain.
7. Mở domain và kiểm tra `/health`.

Lưu ý: SQLite phù hợp cho bản đầu/traffic nhỏ. Khi lượng người dùng tăng, nên chuyển sang PostgreSQL và object storage.
