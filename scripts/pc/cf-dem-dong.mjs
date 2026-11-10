// CHỈ ĐỌC: đếm số dòng từng bảng của 1 D1 trên Cloudflare (trước khi xuất), ghi JSON vào thư mục sao lưu. Không in dữ liệu.
// Chạy: node scripts/pc/cf-dem-dong.mjs <tên D1> <thư mục ra>
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { mkdirSync, writeFileSync } from 'node:fs';

const [db, outDir] = process.argv.slice(2);
const W = 'C:\\thp\\node-main';
const run = (sql) => {
  const r = spawnSync(process.execPath, [join(W, 'node_modules', 'wrangler', 'bin', 'wrangler.js'), 'd1', 'execute', db, '--remote', '--json', '--command', sql], { cwd: W, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  const s = r.stdout.search(/^\[/m);
  if (s < 0) throw new Error((r.stdout + r.stderr).slice(-400));
  return JSON.parse(r.stdout.slice(s));
};
const tables = run("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' ORDER BY name")[0].results.map((r) => r.name);
const counts = {};
for (let i = 0; i < tables.length; i += 5) {
  const part = tables.slice(i, i + 5);
  const sql = part.map((t) => `SELECT '${t.replace(/'/g, "''")}' AS t, COUNT(*) AS n FROM "${t.replace(/"/g, '""')}"`).join(' UNION ALL ');
  for (const r of run(sql)[0].results) counts[r.t] = r.n;
}
const total = Object.values(counts).reduce((a, b) => a + b, 0);
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, `${db}-so-dong.json`), JSON.stringify({ db, at: new Date().toISOString(), tables: counts, total }, null, 1));
console.log(`${db}: ${tables.length} bảng, tổng ${total} dòng`);

