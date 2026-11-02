// So số web tổng trên PC với web thật (Cloudflare D1) mỗi ngày (plan docs/plans/2026-10-31-chuyen-sang-pc, B5:
// "số Tổng quan trên PC khớp web thật 3 ngày liền"). So bảng stats_daily (nguồn của các báo cáo Tổng quan) cộng theo POS và ngày.
// Chỉ ĐỌC cả hai bên: PC đọc file SQLite, web thật đọc bằng `wrangler d1 execute --remote` (vài trăm dòng tổng, không đụng dữ liệu).
// Ngày đã qua phải khớp từng số; hôm nay chỉ ghi để xem (hai bên đồng bộ Pancake lệch nhau vài phút).
//   node scripts/pc/so-so-ngay.mjs [--ngay 3] [--db C:\thp\db\thp.sqlite] [--wrangler-dir C:\thp\node-main] [--log C:\thp\log]
// Kết quả: C:\thp\log\so-so-<ngày>.json, dòng tóm tắt thêm vào so-so.log, so-so-cuoi.txt ("khop"/"lech" + ngày).
import { DatabaseSync } from 'node:sqlite';
import { spawnSync } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const args = process.argv.slice(2);
const flag = (n, d) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : d; };
const DAYS = Number(flag('ngay', 3));
const webMode = existsSync('C:\\thp\\che-do-web.txt') ? readFileSync('C:\\thp\\che-do-web.txt', 'utf8').trim() : 'wrangler';
const DB = flag('db', webMode === 'node' ? 'C:\\thp\\db\\thp.sqlite' : null);
if (!DB) throw new Error('Thiếu --db (web PC chưa chạy bằng Node)');
const WDIR = flag('wrangler-dir', 'C:\\thp\\node-main');
const LOG = flag('log', 'C:\\thp\\log');
mkdirSync(LOG, { recursive: true });

const vnDay = (n) => new Date(Date.now() + 7 * 3600000 - n * 86400000).toISOString().slice(0, 10);
const days = Array.from({ length: DAYS }, (_, i) => vnDay(i)); // hôm nay, hôm qua, ...
const today = days[0];
const METRICS = ['orders', 'deleted_orders', 'net', 'closed_orders', 'closed_net', 'new_orders', 'new_net', 'confirmed_orders', 'confirmed_net',
  'shipping_orders', 'delivered_orders', 'delivered_net', 'returned_orders', 'cancelled_orders', 'assigned_orders'];
const SQL = `SELECT pos_id, day, ${METRICS.map((m) => `SUM(${m}) AS ${m}`).join(', ')} FROM stats_daily WHERE day IN (${days.map((d) => `'${d}'`).join(',')}) GROUP BY pos_id, day ORDER BY day, pos_id`;

// PC
const db = new DatabaseSync(DB, { readOnly: true });
db.exec('PRAGMA busy_timeout=10000');
const pc = db.prepare(SQL).all().map((r) => ({ ...r }));
db.close();

// Web thật: chạy thẳng wrangler.js (không qua shell, khỏi lo dấu nháy trong SQL).
const wrangler = join(WDIR, 'node_modules', 'wrangler', 'bin', 'wrangler.js');
const r = spawnSync(process.execPath, [wrangler, 'd1', 'execute', 'tong-hop-pos', '--remote', '--json', '--command', SQL], { cwd: WDIR, encoding: 'utf8', timeout: 300000 });
if (r.status !== 0) throw new Error(`wrangler lỗi (mã ${r.status}): ${(r.stderr || r.stdout).slice(-400)}`);
const live = JSON.parse(r.stdout.slice(r.stdout.indexOf('[')))[0].results;

// So
const key = (x) => `${x.day}|${x.pos_id}`;
const map = (rows) => new Map(rows.map((x) => [key(x), x]));
const a = map(pc), b = map(live);
const result = { at: new Date().toISOString(), days, today, lech: [], khopNgayCu: true };
for (const k of new Set([...a.keys(), ...b.keys()])) {
  const [day, pos] = k.split('|');
  const x = a.get(k), y = b.get(k);
  const diffs = METRICS.filter((m) => Number(x?.[m] ?? 0) !== Number(y?.[m] ?? 0)).map((m) => `${m} PC ${x?.[m] ?? 0} / thật ${y?.[m] ?? 0}`);
  if (diffs.length) {
    result.lech.push({ day, pos, homNay: day === today, diffs });
    if (day !== today) result.khopNgayCu = false;
  }
}
const stamp = vnDay(0);
writeFileSync(join(LOG, `so-so-${stamp}.json`), JSON.stringify(result, null, 1));
const oldDays = days.slice(1).join(', ');
const line = `${result.at} ngày cũ (${oldDays}): ${result.khopNgayCu ? 'KHỚP' : 'LỆCH'}; hôm nay ${today}: ${result.lech.some((l) => l.homNay) ? 'lệch (bình thường nếu vài phút)' : 'khớp'}`;
appendFileSync(join(LOG, 'so-so.log'), line + '\n');
writeFileSync(join(LOG, 'so-so-cuoi.txt'), `${result.khopNgayCu ? 'khop' : 'lech'} ${result.at}\n`);
console.log(line);
for (const l of result.lech) console.log(`- ${l.day} ${l.pos}${l.homNay ? ' (hôm nay)' : ''}: ${l.diffs.slice(0, 4).join('; ')}`);
