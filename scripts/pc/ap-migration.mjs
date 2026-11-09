// CHỈ CHẠY TRÊN PC: áp 1 file migration drizzle lên DB của bản PC, sau khi sao lưu bản nhất quán (VACUUM INTO).
// Chạy: node scripts/pc/ap-migration.mjs <file .sql> [db] [thư mục sao lưu]
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, mkdirSync } from 'node:fs';
import { basename } from 'node:path';

const sqlFile = process.argv[2];
const dbFile = process.argv[3] ?? 'C:\\thp\\db\\thp.sqlite';
const backupDir = process.argv[4] ?? 'C:\\thp\\sao-luu';
if (!sqlFile) throw new Error('thiếu file migration');
mkdirSync(backupDir, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const backup = `${backupDir}\\thp-truoc-${basename(sqlFile, '.sql')}-${stamp}.sqlite`;
const db = new DatabaseSync(dbFile);
db.exec('PRAGMA busy_timeout=30000');
let t = Date.now();
db.exec(`VACUUM INTO '${backup.replace(/'/g, "''")}'`);
console.log(`sao lưu xong ${Math.round((Date.now() - t) / 1000)} s: ${backup}`);
const statements = readFileSync(sqlFile, 'utf8').split('--> statement-breakpoint').map((s) => s.trim()).filter(Boolean);
t = Date.now();
db.exec('BEGIN IMMEDIATE');
try {
  for (const s of statements) db.exec(s);
  db.exec('COMMIT');
} catch (e) { db.exec('ROLLBACK'); throw e; }
console.log(`áp ${statements.length} câu từ ${basename(sqlFile)} trong ${Date.now() - t} ms`);
db.close();
