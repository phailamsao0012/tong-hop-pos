// Nạp bản xuất D1 (đã mã hoá) vào SQLite của web trên PC (plan docs/plans/2026-10-31-chuyen-sang-pc, bước B5).
// Chạy khi web trên PC đang TẮT (nap-du-lieu.ps1 lo việc tắt, sao lưu và bật lại).
// Cách làm: giải mã + giải nén theo luồng, tách từng câu SQL (dấu ; nằm ngoài chuỗi), chạy vào đúng file SQLite của D1 local.
// Giữ bảng nội bộ _cf_METADATA của miniflare; mọi bảng khác xoá rồi dựng lại từ bản xuất. Chỉ in số đếm, không in dữ liệu.
import { createDecipheriv, privateDecrypt, constants } from 'node:crypto';
import { createReadStream, readdirSync, readFileSync } from 'node:fs';
import { createGunzip } from 'node:zlib';
import { DatabaseSync } from 'node:sqlite';

const [bin, keyFile = '', dataDir = 'C:\\thp\\data', privPath = 'C:\\thp\\bi-mat\\khoa-rieng.pem'] = process.argv.slice(2);
const d1Dir = `${dataDir}/v3/d1/miniflare-D1DatabaseObject`;
const files = readdirSync(d1Dir).filter((f) => f.endsWith('.sqlite') && f !== 'metadata.sqlite');
if (files.length !== 1) throw new Error(`Cần đúng 1 file D1 trong ${d1Dir}, đang có ${files.length}`);

// Bản .sql thường (wrangler d1 export chạy thẳng trên PC) thì đọc luôn; bản .bin thì giải mã + giải nén.
const plain = bin.endsWith('.sql');
let source;
if (plain) source = createReadStream(bin);
else {
  const secret = privateDecrypt({ key: readFileSync(privPath), padding: constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256' }, readFileSync(keyFile));
  const decipher = createDecipheriv('aes-256-gcm', secret.subarray(0, 32), secret.subarray(32, 44));
  decipher.setAuthTag(secret.subarray(44, 60));
  source = createReadStream(bin).pipe(decipher).pipe(createGunzip());
}

const db = new DatabaseSync(`${d1Dir}/${files[0]}`);
const keep = new Set(['_cf_METADATA']);
for (const { type, name } of db.prepare("SELECT type,name FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' AND type IN ('view','trigger','table') ORDER BY type='table'").all())
  if (!keep.has(name)) db.exec(`DROP ${type.toUpperCase()} IF EXISTS "${name.replaceAll('"', '""')}"`);

// Tách câu: ; ngoài chuỗi '...' (SQLite viết '' cho dấu nháy trong chuỗi), ngoài tên "..."/`...` và ngoài chú thích
let buf = '', quote = '', prev = '', stmts = 0, inTx = false;
const run = (sql) => {
  if (/^\s*(BEGIN|COMMIT|PRAGMA defer_foreign_keys)/i.test(sql)) return;
  if (!inTx) { db.exec('BEGIN'); inTx = true; }
  db.exec(sql);
  if (++stmts % 20000 === 0) { db.exec('COMMIT'); inTx = false; console.log(`${stmts} câu`); }
};
const stream = source;
stream.setEncoding('utf8');
db.exec('PRAGMA foreign_keys=OFF');
for await (const chunk of stream) {
  let start = 0;
  for (let i = 0; i < chunk.length; i++) {
    const c = chunk[i];
    // Chú thích -- và /* */ trong lệnh tạo bảng có thể chứa ; (vd. zalo_messages): bỏ qua như chuỗi.
    if (quote === '\n') { if (c === '\n') quote = ''; continue; }
    if (quote === '*/') { if (c === '/' && prev === '*') quote = ''; prev = c; continue; }
    if (quote) { if (c === quote) quote = ''; continue; }
    if (c === "'" || c === '"' || c === '`') quote = c;
    else if (c === '-' && prev === '-') quote = '\n';
    else if (c === '*' && prev === '/') { quote = '*/'; prev = ''; continue; }
    else if (c === ';') { const sql = buf + chunk.slice(start, i + 1); buf = ''; start = i + 1; if (sql.trim() !== ';') run(sql); }
    prev = c;
  }
  buf += chunk.slice(start);
}
if (inTx) db.exec('COMMIT');
if (buf.trim()) throw new Error('Bản xuất kết thúc giữa chừng một câu SQL');
const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name<>'_cf_METADATA' ORDER BY name").all();
for (const { name } of tables) console.log(`${name}: ${db.prepare(`SELECT COUNT(*) AS n FROM "${name}"`).get().n}`);
console.log(`Xong: ${stmts} câu, ${tables.length} bảng`);
db.close();
