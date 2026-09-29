// Đồng bộ Notion -> notion-data.js cho trang "Theo dõi bệnh nhân ở bệnh phòng" (Node 18+, không cần thư viện)
// CHỈ lấy dữ liệu không định danh: mã ca, khoa, ngày gặp, tình trạng, cờ 0/1 phần phân tích đã điền.
// KHÔNG lấy tuổi/giường/bệnh sử/CLS/nội dung phân tích vì repo công khai.
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const OUT = process.env.NOTION_DATA_OUT || fileURLToPath(new URL("../notion-data.js", import.meta.url));
const SRC = { ds: "b0f0ab4c-fb0b-4377-98ca-c3013b949f06", db: "67ea9d8556814c17a0ca8da9b32ecabb" };
const nfc = (s) => String(s).normalize("NFC");
const plain = (a) => (a || []).map((t) => t.plain_text).join("").trim();

export function rowCase(page) {
  const m = new Map(Object.entries(page.properties || {}).map(([k, v]) => [nfc(k), v]));
  const text = (n) => plain(m.get(nfc(n))?.rich_text);
  const name = plain((m.get(nfc("Tên ca / Mã ca")) ?? [...m.values()].find((v) => v?.type === "title"))?.title);
  if (!name) return null;
  const flags = ["Phân tích đề nghị CLS (AI)", "Phân tích điều trị (AI)", "Thắc mắc lâm sàng", "Kiến thức cần nắm", "Kiến thức cần đào sâu", "Tổng kết - bài học rút ra"]
    .map((n) => (text(n) ? "1" : "0")).join("");
  return [name, m.get(nfc("Khoa"))?.select?.name || "", (m.get(nfc("Ngày gặp"))?.date?.start || "").slice(0, 10),
    m.get(nfc("Case đáng đào sâu"))?.checkbox ? 1 : 0, String(page.id || "").replace(/-/g, "").toLowerCase(),
    m.get(nfc("Tình trạng"))?.select?.name || "", flags];
}

async function api(path, version) {
  const pages = []; let cursor;
  do {
    const res = await fetch("https://api.notion.com/v1" + path, {
      method: "POST",
      headers: { Authorization: "Bearer " + process.env.NOTION_TOKEN, "Notion-Version": version, "Content-Type": "application/json" },
      body: JSON.stringify({ page_size: 100, ...(cursor ? { start_cursor: cursor } : {}) }),
    });
    if (!res.ok) { const e = new Error(`Notion ${res.status}: ${(await res.text()).slice(0, 300)}`); e.status = res.status; throw e; }
    const r = await res.json(); pages.push(...r.results); cursor = r.has_more ? r.next_cursor : undefined;
  } while (cursor);
  return pages;
}
async function fetchPages() {
  try { return await api(`/data_sources/${SRC.ds}/query`, "2025-09-03"); }
  catch (e) { if (![400, 404].includes(e.status)) throw e; return await api(`/databases/${SRC.db}/query`, "2022-06-28"); }
}
export function render(cases, at) {
  return `// TỰ ĐỘNG SINH bởi scripts/sync-notion.mjs - đừng sửa tay.\n// cases: [mã ca, khoa, ngày gặp, đáng đào sâu 0/1, id trang Notion, tình trạng, cờ 6 phần phân tích CLS,ĐT,thắc mắc,nắm,đào sâu,tổng kết]\nwindow.BENH_PHONG = {\n  generatedAt: ${JSON.stringify(at)},\n  cases: [\n${cases.map((r) => "    " + JSON.stringify(r)).join(",\n")}\n  ]\n};\n`;
}
export async function main() {
  if (!process.env.NOTION_TOKEN) throw new Error("Thiếu NOTION_TOKEN");
  const cases = (await fetchPages()).map(rowCase).filter(Boolean).sort((a, b) => b[2].localeCompare(a[2]) || a[0].localeCompare(b[0]));
  console.log(`  ${cases.length} ca`);
  writeFileSync(OUT, render(cases, new Date().toISOString()));
}
if (process.argv[1] === fileURLToPath(import.meta.url)) main().catch((e) => { console.error(e.message); process.exit(1); });
