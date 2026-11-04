// Chép bảng do người dùng ghi từ web thật (Cloudflare D1) sang web PC, cho bản PC "chỉ xem" chạy song song
// (plan docs/plans/2026-11-04-pc-song-song). Chỉ ĐỌC web thật: một lần `wrangler d1 execute --remote` với nhiều câu SELECT.
// Đơn, khách, ghi chú, sản phẩm, số liệu: PC tự đồng bộ Pancake, không chép. Task "THP Chep bang" gọi mỗi 10 phút.
//   node scripts/pc/chep-bang.mjs [--db C:\thp\db\thp.sqlite] [--wrangler-dir C:\thp\node-main] [--thu]   (--thu: chỉ in, không ghi)
// Không có khoá ngoại giữa các bảng này, nên ghi bằng upsert (ON CONFLICT DO UPDATE) trong một giao dịch.
import { DatabaseSync } from 'node:sqlite';
import { spawnSync } from 'node:child_process';
import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const args = process.argv.slice(2);
const flag = (n, d) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : d; };
const DB = flag('db', 'C:\\thp\\db\\thp.sqlite');
const WDIR = flag('wrangler-dir', 'C:\\thp\\node-main');
const DRY = args.includes('--thu');
const LOG = 'C:\\thp\\log';
mkdirSync(LOG, { recursive: true });

// mirror: PC giống hệt web thật (xoá dòng web thật không còn). merge: chỉ thêm/cập nhật, giữ dòng riêng của PC.
const TABLES = {
  mirror: ['users', 'user_mfa', 'passkeys', 'targets', 'staff_settings', 'report_presets', 'alert_rules',
    'zalo_contacts', 'zalo_tasks', 'zalo_task_events', 'zalo_meetings', 'zalo_meeting_invites', 'zalo_messages', 'zalo_groups',
    'telegram_chats', 'telegram_requests', 'dispatch_pos', 'dispatch_staff', 'dispatch_log',
    'ad_costs', 'sheet_cost_sources', 'sheet_cost_keys', 'sheet_cost_aliases',
    'recruit_candidates', 'recruit_cv', 'recruit_sources', 'hr_handoffs'],
  merge: ['app_settings', 'alert_log'],
  // Bảng lớn chỉ thêm: lấy dòng mới theo giờ tạo (lùi 1 ngày cho chắc).
  incremental: { recruit_events: 'created_at' },
};
// app_settings: key là trạng thái máy của chính PC (mốc đồng bộ, khoá, canh) thì giữ của PC.
const KEEP_PC_KEY = /^(cf_usage|hr_sync|lock_.*|.*_lock|notes_gap_checked_v\d+|notes_pending_v\d+|cskh_watch_v\d+|stats_.*_ready|zalo_poll_v\d+|zalo_tick_v\d+|zalo_idle_v\d+|backup:last|trend_profile:.*|recent_.*|sync_.*)$/;

const db = new DatabaseSync(DB);
db.exec('PRAGMA busy_timeout=30000');
const cols = (t) => db.prepare(`PRAGMA table_info("${t}")`).all();
const exists = (t) => cols(t).length > 0;
const allTables = [...TABLES.mirror, ...TABLES.merge, ...Object.keys(TABLES.incremental)].filter(exists);

// Câu đọc web thật (một lần gọi, nhiều câu).
const since = {};
for (const [t, c] of Object.entries(TABLES.incremental)) if (exists(t)) since[t] = db.prepare(`SELECT COALESCE(MAX(${c}),'') AS m FROM "${t}"`).get().m;
const selects = allTables.map((t) => {
  const c = TABLES.incremental[t];
  if (!c) return `SELECT * FROM "${t}"`;
  const from = since[t] ? new Date(Date.parse(since[t].endsWith('Z') ? since[t] : since[t] + 'Z') - 86400000).toISOString().replace('Z', '') : '';
  return `SELECT * FROM "${t}" WHERE ${c} >= '${from}'`;
});
const wrangler = join(WDIR, 'node_modules', 'wrangler', 'bin', 'wrangler.js');
const t0 = Date.now();
// API D1 có lúc báo lỗi tạm (vd. 7403 ngày 04/11, gọi lại ngay thì được): thử tối đa 3 lần, cách 5 giây.
let r, start = -1;
for (let attempt = 1; attempt <= 3; attempt++) {
  r = spawnSync(process.execPath, [wrangler, 'd1', 'execute', 'tong-hop-pos', '--remote', '--json', '--command', selects.join(';\n')],
    { cwd: WDIR, encoding: 'utf8', timeout: 300000, maxBuffer: 256 * 1024 * 1024 });
  start = r.stdout.search(/^\[/m);
  if (r.status === 0 && start >= 0) break;
  if (attempt < 3) spawnSync(process.execPath, ['-e', 'setTimeout(()=>{},5000)']);
}
if (r.status !== 0 || start < 0) {
  const msg = `${new Date().toISOString()} LỖI đọc web thật (mã ${r.status}): ${(r.stderr || r.stdout).slice(-300).replace(/\s+/g, ' ')}`;
  appendFileSync(join(LOG, 'chep-bang.log'), msg + '\n');
  console.error(msg); process.exit(1);
}
const results = JSON.parse(r.stdout.slice(start));
const readMs = Date.now() - t0;

// Ghi PC: mỗi bảng chỉ dùng cột có ở cả hai bên; upsert theo khoá chính.
const summary = [];
if (!DRY) db.exec('BEGIN');
try {
  allTables.forEach((t, i) => {
    let rows = results[i]?.results ?? [];
    const info = cols(t), names = info.map((c) => c.name), pk = info.filter((c) => c.pk).sort((a, b) => a.pk - b.pk).map((c) => c.name);
    if (t === 'app_settings') rows = rows.filter((x) => !KEEP_PC_KEY.test(x.key));
    const use = names.filter((n) => rows.length === 0 || n in rows[0]);
    let up = 0, del = 0;
    if (!DRY && rows.length) {
      const q = (n) => `"${n}"`;
      const sql = pk.length
        ? `INSERT INTO "${t}" (${use.map(q)}) VALUES (${use.map(() => '?')}) ON CONFLICT(${pk.map(q)}) DO UPDATE SET ${use.filter((n) => !pk.includes(n)).map((n) => `${q(n)}=excluded.${q(n)}`).join(',') || `${q(pk[0])}=excluded.${q(pk[0])}`}`
        : `INSERT INTO "${t}" (${use.map(q)}) VALUES (${use.map(() => '?')})`;
      const st = db.prepare(sql);
      if (!pk.length) db.exec(`DELETE FROM "${t}"`); // không khoá chính: thay cả bảng
      for (const row of rows) { st.run(...use.map((n) => (row[n] === undefined ? null : Array.isArray(row[n]) ? new Uint8Array(row[n]) : row[n]))); up++; }
    }
    if (!DRY && TABLES.mirror.includes(t) && pk.length) {
      // Xoá dòng web thật không còn (so theo khoá chính).
      const keyOf = (x) => JSON.stringify(pk.map((k) => x[k]));
      const remote = new Set(rows.map(keyOf));
      const local = db.prepare(`SELECT ${pk.map((n) => `"${n}"`).join(',')} FROM "${t}"`).all();
      const delSt = db.prepare(`DELETE FROM "${t}" WHERE ${pk.map((n) => `"${n}"=?`).join(' AND ')}`);
      for (const x of local) if (!remote.has(keyOf(x))) { delSt.run(...pk.map((k) => x[k])); del++; }
    }
    summary.push(`${t} ${rows.length}${up ? ` ghi ${up}` : ''}${del ? ` xoá ${del}` : ''}`);
  });
  if (!DRY) db.exec('COMMIT');
} catch (e) {
  if (!DRY) db.exec('ROLLBACK');
  const msg = `${new Date().toISOString()} LỖI ghi PC: ${e.message}`;
  appendFileSync(join(LOG, 'chep-bang.log'), msg + '\n');
  console.error(msg); process.exit(1);
}
db.close();
const line = `${new Date().toISOString()} ${DRY ? '(thử) ' : ''}đọc web thật ${Math.round(readMs / 1000)} s, ${allTables.length} bảng: ${summary.join(', ')}`;
appendFileSync(join(LOG, 'chep-bang.log'), line + '\n');
writeFileSync(join(LOG, 'chep-bang-cuoi.txt'), new Date().toISOString() + '\n');
console.log(line);
