// Kiểm bản xuất D1 (.sql): nạp vào SQLite tạm, đếm dòng từng bảng, so với <db>-so-dong.json đếm trên Cloudflare. Không in dữ liệu.
// Chạy: node scripts/pc/cf-kiem-ban-xuat.mjs <tên D1> <thư mục>   (nạp theo từng câu để file lớn không phải đọc hết vào bộ nhớ)
import { DatabaseSync } from 'node:sqlite';
import { createReadStream, readFileSync, rmSync, existsSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { join } from 'node:path';

const [name, dir] = process.argv.slice(2);
const expected = JSON.parse(readFileSync(join(dir, `${name}-so-dong.json`), 'utf8')).tables;
const tmp = join(dir, `_kiem-${name}.sqlite`);
if (existsSync(tmp)) rmSync(tmp);
const db = new DatabaseSync(tmp);
db.exec('PRAGMA journal_mode=OFF; PRAGMA synchronous=OFF; PRAGMA foreign_keys=OFF;');
db.exec('BEGIN');
let buf = '', n = 0;
const rl = createInterface({ input: createReadStream(join(dir, `${name}.sql`), { encoding: 'utf8' }), crlfDelay: Infinity });
for await (const line of rl) {
  buf += line + '\n';
  // CREATE TRIGGER ... BEGIN ...; ...; END; chứa nhiều dấu ; bên trong: chỉ coi là trọn khi gặp END;
  const inTrigger = /^\s*CREATE\s+TRIGGER/i.test(buf) && !/\bEND\s*;\s*$/i.test(line);
  if (!inTrigger && /;\s*$/.test(line) && isComplete(buf)) {
    try { db.exec(buf); } catch (e) { if (!/^\s*(PRAGMA|BEGIN|COMMIT)/i.test(buf)) throw new Error(`câu ${n + 1}: ${String(e).slice(0, 200)}`); }
    buf = ''; n++;
  }
}
db.exec('COMMIT');
function isComplete(s) { try { return db.prepare !== undefined && sqliteComplete(s); } catch { return false; } }
function sqliteComplete(s) {
  // đếm dấu nháy đơn: câu đã đóng hết chuỗi thì coi là trọn
  let q = 0; for (const c of s) if (c === "'") q++; return q % 2 === 0;
}
let bad = 0;
for (const [t, want] of Object.entries(expected)) {
  let got = -1;
  try { got = db.prepare(`SELECT COUNT(*) AS n FROM "${t.replace(/"/g, '""')}"`).get().n; } catch {}
  if (got !== want) { bad++; console.log(`LỆCH ${t}: Cloudflare ${want}, bản xuất ${got}`); }
}
db.close();
// --giu: giữ file SQLite đã nạp (đổi tên <db>.sqlite) để mã hoá bằng scripts/pc/sao-luu.mjs --file.
if (process.argv.includes('--giu')) { const keep = join(dir, `${name}.sqlite`); if (existsSync(keep)) rmSync(keep); (await import('node:fs')).renameSync(tmp, keep); }
else rmSync(tmp);
console.log(`${name}: ${n} câu, ${Object.keys(expected).length} bảng, lệch ${bad}`);
