# Theo Dõi Bệnh Nhân Ở Bệnh Phòng

Trang theo dõi ca bệnh, đọc từ Notion (CSDL "Case bệnh nhân — 12 tháng hành nghề") mỗi 30 phút bằng GitHub Actions.

- `index.html`: trang hiển thị (GitHub Pages)
- `notion-data.js`: dữ liệu tự sinh, đừng sửa tay
- `scripts/sync-notion.mjs`: script đọc Notion
- `.github/workflows/sync-notion.yml`: lịch chạy

Cài đặt: Settings → Secrets → Actions → `NOTION_TOKEN` (dùng lại token của on-thi-dashboard); Settings → Pages → `main` / root; Actions → "Đồng bộ Notion" → Run workflow.

**Quyền riêng tư:** repo công khai, chỉ đồng bộ mã ca, khoa, ngày gặp, tình trạng và cờ đã điền phần phân tích. Không đưa họ tên, tuổi, giường, bệnh sử, CLS hay nội dung phân tích vào đây.

## Tên bệnh nhân, chẩn đoán, chuyên đề đào sâu (mã hoá)

Repo và trang này công khai, nên 3 trường nhạy cảm được **mã hoá AES-256-GCM** trước khi ghi vào `notion-data.js`; người ngoài chỉ thấy chuỗi ký tự vô nghĩa. Bạn bấm **🔓 Mở khoá** trên trang, nhập mật khẩu, trình duyệt tự giải mã (không gửi mật khẩu đi đâu).

Thiết lập một lần: GitHub → repo → Settings → Secrets and variables → Actions → New repository secret, tên `BENH_PHONG_KEY`, giá trị là mật khẩu bạn chọn (dài, khó đoán). Sau đó Actions → "Đồng bộ Notion" → Run workflow.

- Chưa đặt `BENH_PHONG_KEY`: các trường này **không được xuất ra**, trang hiện ổ khoá 🔒.
- Đổi mật khẩu: đổi secret rồi chạy lại workflow. Mất mật khẩu thì đặt cái mới, không khôi phục được bản mã cũ.
- Mã hoá không thay thế được việc giữ bí mật: mật khẩu yếu có thể bị dò. Lịch sử git vẫn giữ các bản mã cũ.

## Bố cục trang ca trong Notion

Thuộc tính chỉ giữ ý chính: Mã ca, Tên bệnh nhân, Khoa, Ngày gặp, Tình trạng, Chẩn đoán chính, Trạng thái, Chuyên đề đào sâu. Nội dung dài nằm trong thân trang dưới dạng **Toggle heading 1**. Ô "Phân tích AI" trên trang này được tính theo 6 toggle: Phân tích đề nghị CLS (AI), Phân tích điều trị (AI), Thắc mắc lâm sàng, Kiến thức cần nắm, Kiến thức cần đào sâu, Tổng kết - bài học rút ra. Toggle có nội dung bên trong thì tính là "đã có".
