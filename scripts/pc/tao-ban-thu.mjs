// Tạo bản THỬ chế độ đầy đủ (có ghi) trên PC, tách hẳn khỏi bản đang chạy:
// - DB: C:\thp\db-thu\thp.sqlite (VACUUM INTO từ C:\thp\db\thp.sqlite, bản nhất quán, không khoá bản đang chạy lâu).
// - Biến: C:\thp\db-thu\.dev.vars với AUTH_SECRET mới sinh riêng cho bản thử (không đọc khoá thật), không có khoá Pancake,
//   Telegram, Zalo, Brevo → bản thử không gọi ra ngoài, không gửi tin, không ghi Pancake.
// Chạy: node scripts/pc/tao-ban-thu.mjs   (rồi chạy web bằng chay-node.ps1 -Db ... -Vars ... -Port 8788)
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, existsSync, rmSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';

const SRC = 'C:\\thp\\db\\thp.sqlite';
const DIR = 'C:\\thp\\db-thu';
const DST = `${DIR}\\thp.sqlite`;
mkdirSync(DIR, { recursive: true });
for (const f of [DST, `${DST}-wal`, `${DST}-shm`, `${DIR}\\do.sqlite`]) if (existsSync(f)) rmSync(f);
const t = Date.now();
const src = new DatabaseSync(SRC, { readOnly: true });
src.exec('PRAGMA busy_timeout=30000');
src.exec(`VACUUM INTO '${DST.replace(/'/g, "''")}'`);
src.close();
const dst = new DatabaseSync(DST);
dst.exec('PRAGMA journal_mode=WAL');
dst.exec('DELETE FROM sessions');
dst.close();
writeFileSync(`${DIR}\\.dev.vars`, [
  `AUTH_SECRET=${randomBytes(32).toString('hex')}`,
  'PANCAKE_READ_ONLY=1',
  'THP_SWR=1',
  '',
].join('\n'));
console.log(`bản thử xong trong ${Math.round((Date.now() - t) / 1000)} s: ${DST}`);
