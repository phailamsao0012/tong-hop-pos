// CHỈ CHẠY TRÊN PC, trên BẢN CHÉP DB (từ chối C:\thp\db\thp.sqlite). Đo 5 API Marketing kỳ dài (plan Marketing kỳ dài nhanh):
//   reports/marketing (Tổng quan MKT), marketing/analytics, marketing/trend, marketing/cross, reports/trend-cards.
// Chế độ:
//   goc  — bước 0: chạy từng báo cáo bằng nguồn bảng gốc, đo TỪNG CÂU SQL (chạy lần lượt thay cho batch), ghi giây.
//   gon  — như goc nhưng nguồn bảng gọn (cần mốc "đã điền đủ").
//   so   — chạy cả hai nguồn, so JSON: in khớp / lệch và tên trường lệch (tối đa 20), kèm tổng giây mỗi nguồn.
// Kỳ: thang (đầu tháng tới hôm nay), 90 (90 ngày tới hôm nay), nam (01/01 tới hôm nay); mặc định cả ba.
// KHÔNG in số liệu, tên người, tham số lọc: chỉ tên báo cáo, số thứ tự câu, 60 ký tự đầu câu SQL (không có giá trị bind), giây.
// Chạy:
//   npx tsx --import ./tests/support/register.mjs scripts/pc/do-mkt-ky-dai.ts <db-ban-chep> goc|gon|so [thang,90,nam] [--chi analytics,cross,...]
import { openD1 } from '../../pc/d1';
import { POS } from '../../lib/shared/report-model';
import { addDays, todayVn } from '../../lib/shared/report-time';
import { RAW_SOURCE, SLIM_SOURCE, type MktSource } from '../../lib/reports/mkt-source';
import { slimReady } from '../../lib/reports/mkt-slim-fill';

const [file, mode = 'so', periodArg = 'thang,90,nam'] = process.argv.slice(2);
const only = (() => { const i = process.argv.indexOf('--chi'); return i >= 0 ? process.argv[i + 1].split(',') : null; })();
if (!file || !['goc', 'gon', 'so'].includes(mode)) { console.error('Cách chạy: <db-ban-chep> goc|gon|so [thang,90,nam] [--chi overview,analytics,trend,cross,cards]'); process.exit(2); }
if (/[\\/]thp[\\/]db[\\/]thp\.sqlite$/i.test(file)) { console.error('Đây là DB thật. Chỉ chạy trên bản chép.'); process.exit(2); }

const db = await openD1(file, { readers: 1 });
const env = (globalThis as { __THP_ENV__?: Record<string, unknown> }).__THP_ENV__ ??= {};
env.DB = db;
// Các module báo cáo đọc env lúc gọi: nạp sau khi gán env.DB.
const { marketingOverviewRaw } = await import('../../lib/reports/marketing-overview');
const { mktAnalytics } = await import('../../lib/reports/mkt-analytics');
const { mktCross } = await import('../../lib/reports/mkt-cross');
const { mktTrend, defaultBucket } = await import('../../lib/reports/mkt-trend');
const { trendCards, TREND_DEPTS } = await import('../../lib/reports/trend-period');

const today = todayVn();
const periods: Record<string, [string, string]> = { thang: [`${today.slice(0, 7)}-01`, today], 90: [addDays(today, -89), today], nam: [`${today.slice(0, 4)}-01-01`, today] };
const posIds = POS.map((p) => p.id);

// Đo từng câu: thay batch bằng chạy lần lượt (cùng kết quả dạng D1Result[]), ghi giây mỗi câu.
type Timing = { sql: string; ms: number };
let timings: Timing[] = [];
const prepare = db.prepare.bind(db), batch = db.batch.bind(db);
let perQuery = false;
db.prepare = ((sql: string) => {
  const stmt = prepare(sql);
  const wrap = (s: D1PreparedStatement): D1PreparedStatement => new Proxy(s, { get(t, k) {
    if (k === 'bind') return (...a: unknown[]) => wrap(t.bind(...a));
    if (perQuery && (k === 'all' || k === 'first' || k === 'run' || k === 'raw')) return async (...a: unknown[]) => {
      const t0 = performance.now();
      try { return await (t[k] as (...x: unknown[]) => Promise<unknown>)(...a); } finally { timings.push({ sql, ms: performance.now() - t0 }); }
    };
    const v = Reflect.get(t, k); return typeof v === 'function' ? v.bind(t) : v;
  } });
  return wrap(stmt);
}) as typeof db.prepare;
db.batch = (async (stmts: D1PreparedStatement[]) => {
  if (!perQuery) return batch(stmts);
  const out: D1Result[] = [];
  for (const s of stmts) out.push(await s.all());
  return out;
}) as typeof db.batch;

const user = { role: 'owner' as const };
const reports: Record<string, (start: string, end: string, src: MktSource) => Promise<unknown>> = {
  'overview-created': (s, e, src) => marketingOverviewRaw(user, new URLSearchParams({ basis: 'created', stage: 'all', team: 'all' }), posIds, s, e, null, src),
  'overview-confirmed': (s, e, src) => marketingOverviewRaw(user, new URLSearchParams({ basis: 'confirmed', stage: 'confirmed', team: 'all' }), posIds, s, e, null, src),
  analytics: (s, e, src) => mktAnalytics({ posIds, start: s, end: e, team: 'all', db, source: src }),
  trend: (s, e, src) => mktTrend({ start: s, end: e, posIds, bucket: defaultBucket(s, e), team: 'all', source: src }),
  cross: (s, e, src) => mktCross(posIds, s, e, src),
  cards: async (s, e, src) => {
    // Hồ sơ giờ lưu trong app_settings của bản chép: xoá để mỗi lượt tự tính như lần đầu trong ngày.
    await db.prepare("DELETE FROM app_settings WHERE key LIKE 'trend_profile:%'").run();
    return trendCards(db, { start: s, end: e, posIds, team: 'all', unit: null }, [...TREND_DEPTS], Date.now(), src);
  },
};
const picked = Object.keys(reports).filter((k) => !only || only.some((o) => k.startsWith(o)));

/** Đường dẫn các trường khác nhau (không in giá trị). */
function diffPaths(a: unknown, b: unknown, path = '$', out: string[] = []) {
  if (out.length >= 20) return out;
  if (typeof a !== typeof b || Array.isArray(a) !== Array.isArray(b) || (a === null) !== (b === null)) { out.push(path); return out; }
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) out.push(`${path}.length`);
    for (let i = 0; i < Math.min(a.length, b.length); i++) diffPaths(a[i], b[i], `${path}[${i}]`, out);
  } else if (a && typeof a === 'object') {
    for (const k of new Set([...Object.keys(a), ...Object.keys(b as object)])) diffPaths((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k], `${path}.${k}`, out);
  } else if (a !== b) out.push(path);
  return out;
}
const sec = (ms: number) => (ms / 1000).toFixed(2);
const short = (sql: string) => sql.replace(/\s+/g, ' ').trim().slice(0, 60);

if (mode !== 'goc' && !(await slimReady(db))) { console.error('Bản chép chưa có mốc "đã điền đủ" bảng gọn: chạy scripts/pc/dien-bang-gon.ts trước.'); process.exit(3); }
for (const key of periodArg.split(',')) {
  const range = periods[key];
  if (!range) { console.error(`Kỳ không hợp lệ: ${key}`); continue; }
  const [start, end] = range;
  console.log(`\n=== Kỳ ${key}: ${start} → ${end} ===`);
  for (const name of picked) {
    if (mode === 'so') {
      perQuery = false;
      const t0 = performance.now(); const a = JSON.parse(JSON.stringify(await reports[name](start, end, RAW_SOURCE))); const ta = performance.now() - t0;
      const t1 = performance.now(); const b = JSON.parse(JSON.stringify(await reports[name](start, end, SLIM_SOURCE))); const tb = performance.now() - t1;
      const d = diffPaths(a, b);
      console.log(`${name}: gốc ${sec(ta)}s, gọn ${sec(tb)}s — ${d.length ? `LỆCH ${d.length >= 20 ? '≥20' : d.length} trường: ${d.join(', ')}` : 'KHỚP'}`);
    } else {
      perQuery = true; timings = [];
      const t0 = performance.now();
      try { await reports[name](start, end, mode === 'gon' ? SLIM_SOURCE : RAW_SOURCE); } catch (e) { console.log(`${name}: LỖI ${e instanceof Error ? e.message.slice(0, 120) : 'không rõ'}`); }
      const total = performance.now() - t0;
      console.log(`${name} (${mode}): tổng ${sec(total)}s, ${timings.length} câu`);
      for (const [i, t] of timings.entries()) if (t.ms >= 200) console.log(`  #${i + 1} ${sec(t.ms)}s  ${short(t.sql)}`);
      const small = timings.filter((t) => t.ms < 200);
      if (small.length) console.log(`  (${small.length} câu dưới 0,2s, cộng ${sec(small.reduce((s, t) => s + t.ms, 0))}s)`);
    }
  }
}
// Dung lượng hai bảng gọn (dbstat có thì dùng, không thì đếm dòng).
try {
  const r = await db.prepare("SELECT name, SUM(pgsize) AS bytes FROM dbstat WHERE name IN ('mkt_orders_slim','mkt_order_items_slim','idx_mkt_orders_slim_pos_created','idx_mkt_orders_slim_pos_confirmed','idx_mkt_order_items_slim_order') GROUP BY name").all<{ name: string; bytes: number }>();
  for (const x of r.results) console.log(`dung lượng ${x.name}: ${(Number(x.bytes) / 1048576).toFixed(1)} MB`);
} catch {
  const n = await db.prepare('SELECT (SELECT COUNT(*) FROM mkt_orders_slim) AS o, (SELECT COUNT(*) FROM mkt_order_items_slim) AS i').first<{ o: number; i: number }>().catch(() => null);
  if (n) console.log(`bảng gọn: ${n.o} dòng đơn, ${n.i} dòng món (không đọc được dbstat)`);
}
await db.close();
process.exit(0);
