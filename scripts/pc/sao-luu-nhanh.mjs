// CHỈ CHẠY TRÊN PC: sao lưu nhất quán DB bản PC (VACUUM INTO) trước một thao tác lớn. Chạy: node scripts/pc/sao-luu-nhanh.mjs <tên> [db]
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, statSync } from 'node:fs';
const name = process.argv[2] ?? 'thu-cong';
const dbFile = process.argv[3] ?? 'C:\\thp\\db\\thp.sqlite';
mkdirSync('C:\\thp\\sao-luu', { recursive: true });
const out = `C:\\thp\\sao-luu\\thp-${name}-${new Date().toISOString().replace(/[:.]/g, '-')}.sqlite`;
const t = Date.now();
const db = new DatabaseSync(dbFile);
db.exec('PRAGMA busy_timeout=30000');
db.exec(`VACUUM INTO '${out.replace(/'/g, "''")}'`);
db.close();
console.log(`sao lưu xong ${Math.round((Date.now() - t) / 1000)} s, ${(statSync(out).size / 1e9).toFixed(2)} GB: ${out}`);
