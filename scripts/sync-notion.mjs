// Đồng bộ Notion -> notion-data.js cho trang "Theo dõi bệnh nhân ở bệnh phòng" (Node 18+, không cần thư viện)
// Repo công khai: KHÔNG bao giờ xuất "Tên bệnh nhân" (chỉ nằm trong Notion).
// Xuất: mã ca, khoa, ngày gặp, tình trạng, cờ phân tích, chẩn đoán chính, chuyên đề đào sâu, nội dung các toggle (CLS, điều trị, 6 phần phân tích).
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const OUT = process.env.NOTION_DATA_OUT || fileURLToPath(new URL("../notion-data.js", import.meta.url));
const SRC = { ds: "b0f0ab4c-fb0b-4377-98ca-c3013b949f06", db: "67ea9d8556814c17a0ca8da9b32ecabb" };
const CD = { ds: "ac6f5ebb-66e2-46de-bf17-350b9645c30a", db: "f6d9e3ad00644e739d82987fcbc2df6c" };
// 6 phần phân tích = tiêu đề Toggle heading 1 trong thân trang (có nội dung bên trong thì tính là "đã có")
export const SECTIONS = ["Phân tích đề nghị CLS (AI)", "Phân tích điều trị (AI)", "Thắc mắc lâm sàng", "Kiến thức cần nắm", "Kiến thức cần đào sâu", "Tổng kết - bài học rút ra"];
const nfc = (s) => String(s).normalize("NFC");
const plain = (a) => (a || []).map((t) => t.plain_text).join("").trim();
const hex = (id) => String(id || "").replace(/-/g, "").toLowerCase();

export function flagsFromBlocks(blocks) {
  const on = new Set();
  for (const b of blocks || []) {
    if (b.type === "heading_1" && b.heading_1?.is_toggleable && b.has_children) on.add(nfc(plain(b.heading_1.rich_text)));
  }
  return SECTIONS.map((s) => (on.has(nfc(s)) ? "1" : "0")).join("");
}

// Các toggle được đưa lên web (mã hoá) để xem trong khung 2 cột: kết quả theo ngày | phân tích AI
export const VIEW_SECTIONS = ["CLS", "Điều trị", ...SECTIONS];
const rich = (rt) => (rt || []).map((t) => (t.annotations?.bold && t.plain_text.trim() ? "**" + t.plain_text.trim() + "**" : t.plain_text)).join("").trim();
// Ô bảng: chuỗi thường, hoặc {x, c} với c = "hi" (chữ đỏ = cao hơn tham chiếu) / "lo" (chữ xanh = thấp hơn)
const cell = (rt) => {
  const x = rich(rt);
  const col = (rt || []).map((t) => t.annotations?.color).find((c) => c && c !== "default") || "";
  const c = /red|orange|pink/.test(col) ? "hi" : /blue|purple/.test(col) ? "lo" : "";
  return c ? { x, c } : x;
};
// Rút gọn block Notion -> [{k:"p|b|n|h|t", x, d, r, h}] (không kèm định danh nào ngoài nội dung người dùng đã viết)
export async function simplify(blocks, getChildren, d = 0) {
  const out = [];
  for (const b of blocks || []) {
    const t = b.type, v = b[t] || {};
    const kids = b.has_children ? await getChildren(b.id) : [];
    if (t === "table") {
      const rows = [];
      for (const r of kids) rows.push((r.table_row?.cells || []).map(cell));
      out.push({ k: "t", h: !!v.has_column_header, r: rows });
      continue;
    }
    const x = rich(v.rich_text);
    if (t === "paragraph" || t === "quote" || t === "callout") { if (x) out.push({ k: "p", x, d }); }
    else if (t === "bulleted_list_item" || t === "to_do") out.push({ k: "b", x, d });
    else if (t === "numbered_list_item") out.push({ k: "n", x, d });
    else if (t.startsWith("heading_") || t === "toggle") { if (x) out.push({ k: "h", x, d }); }
    if (kids.length && !["table", "column_list"].includes(t)) out.push(...(await simplify(kids, getChildren, d + 1)));
  }
  return out;
}
export async function sectionsFromBlocks(blocks, getChildren) {
  const res = {};
  for (const b of blocks || []) {
    if (b.type !== "heading_1" || !b.heading_1?.is_toggleable || !b.has_children) continue;
    const name = nfc(plain(b.heading_1.rich_text)), hit = VIEW_SECTIONS.find((n) => nfc(n) === name);
    if (hit) res[hit] = await simplify(await getChildren(b.id), getChildren);
  }
  return res;
}

// chuyên đề: Map<id32hex, tiêu đề>
export function rowCase(page, flags, cdTitles = new Map(), sections = {}) {
  const m = new Map(Object.entries(page.properties || {}).map(([k, v]) => [nfc(k), v]));
  const text = (n) => plain(m.get(nfc(n))?.rich_text);
  const name = plain((m.get(nfc("Tên ca / Mã ca")) ?? [...m.values()].find((v) => v?.type === "title"))?.title);
  if (!name) return null;
  const rel = (m.get(nfc("Chuyên đề đào sâu từ case"))?.relation || []).map((r) => hex(r.id));
  const secret = { d: text("Chẩn đoán chính"), c: rel.map((id) => [cdTitles.get(id) || "(chuyên đề)", id]), s: sections };
  return {
    row: [name, m.get(nfc("Khoa"))?.select?.name || "", (m.get(nfc("Ngày gặp"))?.date?.start || "").slice(0, 10),
      m.get(nfc("Case đáng đào sâu"))?.checkbox ? 1 : 0, hex(page.id), m.get(nfc("Tình trạng"))?.select?.name || "", flags || "000000"],
    secret,
  };
}

async function call(path, version, body) {
  const res = await fetch("https://api.notion.com/v1" + path, {
    method: body ? "POST" : "GET",
    headers: { Authorization: "Bearer " + process.env.NOTION_TOKEN, "Notion-Version": version, "Content-Type": "application/json" },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  if (!res.ok) { const e = new Error(`Notion ${res.status}: ${(await res.text()).slice(0, 300)}`); e.status = res.status; throw e; }
  return res.json();
}
async function queryAll(path, version) {
  const pages = []; let cursor;
  do { const r = await call(path, version, { page_size: 100, ...(cursor ? { start_cursor: cursor } : {}) }); pages.push(...r.results); cursor = r.has_more ? r.next_cursor : undefined; } while (cursor);
  return pages;
}
async function fetchDb(src) {
  try { return await queryAll(`/data_sources/${src.ds}/query`, "2025-09-03"); }
  catch (e) { if (![400, 404].includes(e.status)) throw e; return await queryAll(`/databases/${src.db}/query`, "2022-06-28"); }
}
async function blocksOf(id) {
  const out = []; let cursor;
  do { const r = await call(`/blocks/${id}/children?page_size=100${cursor ? "&start_cursor=" + cursor : ""}`, "2022-06-28"); out.push(...r.results); cursor = r.has_more ? r.next_cursor : undefined; } while (cursor);
  return out;
}

export function render(cases, at) {
  const head = `// TỰ ĐỘNG SINH bởi scripts/sync-notion.mjs - đừng sửa tay.\n// cases: [mã ca, khoa, ngày gặp, đáng đào sâu 0/1, id trang Notion, tình trạng, cờ 6 phần phân tích, {d: chẩn đoán, c: chuyên đề [[tên,id]], s: nội dung các toggle}]\n`;
  return head + `window.BENH_PHONG = {\n  generatedAt: ${JSON.stringify(at)},\n  cases: [\n${cases.map((r) => "    " + JSON.stringify(r)).join(",\n")}\n  ]\n};\n`;
}

export async function main() {
  if (!process.env.NOTION_TOKEN) throw new Error("Thiếu NOTION_TOKEN");
  const titles = new Map();
  try {
    for (const p of await fetchDb(CD)) {
      const t = Object.values(p.properties || {}).find((v) => v?.type === "title");
      titles.set(hex(p.id), plain(t?.title) || "(chưa đặt tên)");
    }
  } catch (e) { console.warn("  Không đọc được CSDL Chuyên đề: " + e.message); }
  const rows = [];
  for (const page of await fetchDb(SRC)) {
    const hasName = Object.values(page.properties || {}).some((v) => v?.type === "title" && plain(v.title));
    if (!hasName) continue;
    let flags = "000000", sections = {};
    try {
      const top = await blocksOf(page.id);
      flags = flagsFromBlocks(top);
      sections = await sectionsFromBlocks(top, blocksOf);
    } catch (e) { console.warn("  Không đọc được nội dung trang: " + e.message); }
    const r = rowCase(page, flags, titles, sections);
    if (r) rows.push([...r.row, r.secret]);
  }
  rows.sort((a, b) => b[2].localeCompare(a[2]) || a[0].localeCompare(b[0]));
  console.log(`  ${rows.length} ca`);
  writeFileSync(OUT, render(rows, new Date().toISOString()));
}
if (process.argv[1] === fileURLToPath(import.meta.url)) main().catch((e) => { console.error(e.message); process.exit(1); });
