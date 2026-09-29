// Đồng bộ Notion -> notion-data.js cho trang "Theo dõi bệnh nhân ở bệnh phòng" (Node 18+, không cần thư viện)
// Công khai (không mã hoá): mã ca, khoa, ngày gặp, tình trạng, cờ 0/1 phần phân tích đã có.
// Mã hoá AES-256-GCM bằng mật khẩu BENH_PHONG_KEY: tên bệnh nhân, chẩn đoán, chuyên đề cần đào sâu.
// Không có BENH_PHONG_KEY thì các trường nhạy cảm KHÔNG được xuất ra (trang hiện ổ khoá).
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { pbkdf2Sync, createCipheriv, createHmac } from "node:crypto";

const OUT = process.env.NOTION_DATA_OUT || fileURLToPath(new URL("../notion-data.js", import.meta.url));
const SRC = { ds: "b0f0ab4c-fb0b-4377-98ca-c3013b949f06", db: "67ea9d8556814c17a0ca8da9b32ecabb" };
const CD = { ds: "ac6f5ebb-66e2-46de-bf17-350b9645c30a", db: "f6d9e3ad00644e739d82987fcbc2df6c" };
export const SALT = "benh-phong/v1", ITER = 200000;
// 6 phần phân tích = tiêu đề Toggle heading 1 trong thân trang (có nội dung bên trong thì tính là "đã có")
export const SECTIONS = ["Phân tích đề nghị CLS (AI)", "Phân tích điều trị (AI)", "Thắc mắc lâm sàng", "Kiến thức cần nắm", "Kiến thức cần đào sâu", "Tổng kết - bài học rút ra"];
const nfc = (s) => String(s).normalize("NFC");
const plain = (a) => (a || []).map((t) => t.plain_text).join("").trim();
const hex = (id) => String(id || "").replace(/-/g, "").toLowerCase();

export function deriveKey(password) { return pbkdf2Sync(password, SALT, ITER, 32, "sha256"); }
// IV xác định (HMAC của nội dung) => cùng nội dung ra cùng bản mã, không sinh commit thừa, không lặp IV cho nội dung khác nhau
export function encrypt(key, obj) {
  const pt = Buffer.from(JSON.stringify(obj), "utf8");
  const iv = createHmac("sha256", key).update(pt).digest().subarray(0, 12);
  const c = createCipheriv("aes-256-gcm", key, iv);
  const ct = Buffer.concat([c.update(pt), c.final()]);
  return Buffer.concat([iv, ct, c.getAuthTag()]).toString("base64");
}

export function flagsFromBlocks(blocks) {
  const on = new Set();
  for (const b of blocks || []) {
    if (b.type === "heading_1" && b.heading_1?.is_toggleable && b.has_children) on.add(nfc(plain(b.heading_1.rich_text)));
  }
  return SECTIONS.map((s) => (on.has(nfc(s)) ? "1" : "0")).join("");
}

// chuyên đề: Map<id32hex, tiêu đề>
export function rowCase(page, flags, cdTitles = new Map()) {
  const m = new Map(Object.entries(page.properties || {}).map(([k, v]) => [nfc(k), v]));
  const text = (n) => plain(m.get(nfc(n))?.rich_text);
  const name = plain((m.get(nfc("Tên ca / Mã ca")) ?? [...m.values()].find((v) => v?.type === "title"))?.title);
  if (!name) return null;
  const rel = (m.get(nfc("Chuyên đề đào sâu từ case"))?.relation || []).map((r) => hex(r.id));
  const secret = { n: text("Tên bệnh nhân"), d: text("Chẩn đoán chính"), c: rel.map((id) => [cdTitles.get(id) || "(chuyên đề)", id]) };
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

export function render(cases, at, extra = {}) {
  const head = `// TỰ ĐỘNG SINH bởi scripts/sync-notion.mjs - đừng sửa tay.\n// cases: [mã ca, khoa, ngày gặp, đáng đào sâu 0/1, id trang Notion, tình trạng, cờ 6 phần phân tích, bản mã (tên BN, chẩn đoán, chuyên đề) hoặc ""]\n`;
  return head + `window.BENH_PHONG = {\n  generatedAt: ${JSON.stringify(at)},\n  salt: ${JSON.stringify(SALT)}, iter: ${ITER},\n  verify: ${JSON.stringify(extra.verify || "")},\n  cases: [\n${cases.map((r) => "    " + JSON.stringify(r)).join(",\n")}\n  ]\n};\n`;
}

export async function main() {
  if (!process.env.NOTION_TOKEN) throw new Error("Thiếu NOTION_TOKEN");
  const pw = process.env.BENH_PHONG_KEY;
  const key = pw ? deriveKey(pw) : null;
  if (!key) console.warn("  Chưa có BENH_PHONG_KEY: không xuất tên BN/chẩn đoán/chuyên đề");
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
    let flags = "000000";
    try { flags = flagsFromBlocks(await blocksOf(page.id)); } catch (e) { console.warn("  Không đọc được nội dung trang: " + e.message); }
    const r = rowCase(page, flags, titles);
    if (r) rows.push([...r.row, key ? encrypt(key, r.secret) : ""]);
  }
  rows.sort((a, b) => b[2].localeCompare(a[2]) || a[0].localeCompare(b[0]));
  console.log(`  ${rows.length} ca`);
  writeFileSync(OUT, render(rows, new Date().toISOString(), { verify: key ? encrypt(key, { ok: 1 }) : "" }));
}
if (process.argv[1] === fileURLToPath(import.meta.url)) main().catch((e) => { console.error(e.message); process.exit(1); });
