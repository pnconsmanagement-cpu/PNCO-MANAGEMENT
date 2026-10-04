# HƯỚNG DẪN TRIỂN KHAI (DEPLOY) LÊN VERCEL & CẤU HÌNH SUPABASE
### CÔNG TY TNHH XÂY DỰNG - CƠ ĐIỆN PHÚC NGUYÊN (PNCONS)

Ứng dụng Quản lý Chấm công, Tính lương 3 nhóm nhân sự, Dự án, Tạm ứng và Báo cáo tài chính đã được cấu trúc hoàn chỉnh, sẵn sàng 100% để deploy lên **Vercel** và lưu trữ cơ sở dữ liệu trên **Supabase Cloud**.

---

## PHẦN 1: CẤU HÌNH CƠ SỞ DỮ LIỆU SUPABASE (7 BẢNG / SHEETS RIÊNG BIỆT)

### Bước 1: Tạo Project trên Supabase
1. Truy cập [https://supabase.com](https://supabase.com) và đăng nhập (hoặc đăng ký miễn phí bằng GitHub/Google).
2. Nhấn nút **New Project**.
3. Điền các thông tin:
   - **Name**: `PhucNguyen-Payroll-System` (hoặc tên tùy thích).
   - **Database Password**: Nhập mật khẩu quản trị và lưu lại cẩn thận.
   - **Region**: Chọn `Singapore (ap-southeast-1)` để có tốc độ truy cập nhanh nhất tại Việt Nam.
4. Nhấn **Create new project** và đợi khoảng 1-2 phút để Supabase khởi tạo hệ thống.

---

### Bước 2: Tạo tự động 7 Bảng (Sheets) bằng SQL Schema
1. Trong menu bên trái của Supabase Dashboard, chọn biểu tượng **SQL Editor** (icon `>_`).
2. Nhấn **New query**.
3. Mở file `supabase_schema.sql` có sẵn trong mã nguồn dự án, copy toàn bộ nội dung và dán vào ô soạn thảo SQL của Supabase.
4. Nhấn nút **RUN** (màu xanh lá cây) ở góc dưới bên phải.
5. Khi thấy thông báo `Success. No rows returned`, 7 bảng dữ liệu riêng biệt đã được khởi tạo:
   - 🏢 `company_config`: Thông tin công ty Phúc Nguyên, kỳ lương, ngày công chuẩn, mẫu 02-LĐTL.
   - 👥 `employees`: Danh sách nhân viên chính thức (Văn phòng, Kỹ sư chỉ huy, Ban giám đốc).
   - 👷 `seasonal_workers`: Danh sách nhân lực thời vụ, thợ khoán công trình (lương tuần, chấm công ngày).
   - 🏗️ `team_workers`: Danh sách nhân viên tổ đội thi công (cai thầu, quân số, đơn giá khoán/ngày).
   - 📌 `projects`: Danh sách dự án & công trình (ngân sách nhân công, tiến độ, chi phí thực tế).
   - 💳 `salary_advances`: Bản lương ứng / phiếu tạm ứng tiền lương từng nhân viên.
   - 📅 `attendance_records`: Bản chấm công chi tiết 31 ngày trong tháng cho cả 3 nhóm nhân sự.

---

### Bước 3: Lấy thông tin kết nối Supabase
1. Vào menu **Project Settings** (icon bánh răng ở góc dưới bên trái).
2. Chọn mục **API** (hoặc Data API).
3. Copy 2 thông số quan trọng sau:
   - **Project URL**: Ví dụ dạng `https://xyzabc12345.supabase.co`
   - **Project API Keys**: Copy khóa có nhãn `anon` / `public` (dạng chuỗi token dài bắt đầu bằng `eyJ...`).

---

## PHẦN 2: TRIỂN KHAI (DEPLOY) LÊN VERCEL

Dự án đã được tích hợp sẵn file `vercel.json` cấu hình Single-Page Application (SPA) Routing để không bị lỗi 404 khi người dùng chuyển tab hoặc làm mới trang (F5).

### Cách 1: Deploy qua GitHub (Khuyên dùng - Tự động cập nhật khi có code mới)
1. Đưa mã nguồn lên GitHub Repository của bạn.
2. Truy cập [https://vercel.com](https://vercel.com) và đăng nhập bằng tài khoản GitHub.
3. Nhấn **Add New...** -> **Project**.
4. Chọn kho mã nguồn (repository) vừa tạo và nhấn **Import**.
5. Trong phần **Environment Variables** (Biến môi trường), thêm 2 biến sau:
   - Key: `VITE_SUPABASE_URL` | Value: Dán Project URL từ Supabase Bước 3.
   - Key: `VITE_SUPABASE_ANON_KEY` | Value: Dán anon public key từ Supabase Bước 3.
6. Nhấn nút **Deploy**.
7. Vercel sẽ tự động build Vite trong khoảng 1 phút và cấp cho bạn tên miền miễn phí dạng:
   `https://phucnguyen-payroll.vercel.app`

### Cách 2: Deploy trực tiếp qua Vercel CLI (Dòng lệnh)
Nếu bạn cài đặt Vercel CLI trên máy tính:
```bash
npm i -g vercel
vercel login
vercel
```
Khi được hỏi thiết lập biến môi trường, nhập `VITE_SUPABASE_URL` và `VITE_SUPABASE_ANON_KEY`.

---

## PHẦN 3: KẾT NỐI & ĐỒNG BỘ TRỰC TIẾP TRONG GIAO DIỆN APP

Bạn cũng có thể kết nối hoặc thay đổi Supabase bất cứ lúc nào ngay trên giao diện web mà không cần deploy lại:
1. Mở ứng dụng, nhìn lên thanh Header trên cùng.
2. Bấm vào nút **"Đồng bộ Supabase Cloud"** (hoặc icon Đám mây).
3. Nhập **Project URL** và **API Anon Key**.
4. Bấm **"Kiểm tra kết nối"** -> Hệ thống sẽ kiểm tra tự động xem cả 7 bảng đã sẵn sàng chưa.
5. Bấm **"Đẩy dữ liệu mẫu lên Supabase"** để nạp dữ liệu đầy đủ ban đầu của Công ty Phúc Nguyên lên Cloud.
6. Kích hoạt tính năng **Đồng bộ thời gian thực (Supabase Realtime)** để khi chấm công trên điện thoại hoặc máy tính khác, dữ liệu sẽ tự nhảy tức thì!
