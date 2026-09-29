# Theo Dõi Bệnh Nhân Ở Bệnh Phòng

Trang theo dõi ca bệnh, đọc từ Notion (CSDL "Case bệnh nhân — 12 tháng hành nghề") mỗi 30 phút bằng GitHub Actions.

- `index.html`: trang hiển thị (GitHub Pages)
- `notion-data.js`: dữ liệu tự sinh, đừng sửa tay
- `scripts/sync-notion.mjs`: script đọc Notion
- `.github/workflows/sync-notion.yml`: lịch chạy

Cài đặt: Settings → Secrets → Actions → `NOTION_TOKEN` (dùng lại token của on-thi-dashboard); Settings → Pages → `main` / root; Actions → "Đồng bộ Notion" → Run workflow.

**Quyền riêng tư:** repo công khai, chỉ đồng bộ mã ca, khoa, ngày gặp, tình trạng và cờ đã điền phần phân tích. Không đưa họ tên, tuổi, giường, bệnh sử, CLS hay nội dung phân tích vào đây.
