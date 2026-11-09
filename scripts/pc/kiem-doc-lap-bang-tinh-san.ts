// KIỂM ĐỘC LẬP (09/11/2026). CHỈ ĐỌC: mở file DB ở chế độ chỉ đọc, không ghi, không điền bảng, không gọi web.
// So đường MỚI (đọc stats_daily_segment do hệ thống tự điền) với đường CŨ (quét đơn gốc, WITH segment_orders)
// theo tổng, theo POS, theo ngày, theo người bán, theo marketer; đủ team × nhóm × nguồn × có/không lọc người bán;
// các kỳ hôm nay, tuần, tháng và kỳ trước cắt cùng mốc giờ. In số khớp/lệch và thời gian, KHÔNG in số liệu kinh doanh.
// Chạy: npx tsx --import ./tests/support/register.mjs scripts/pc/kiem-doc-lap-bang-tinh-san.ts <đường dẫn file .sqlite>
import { DatabaseSync } from 'node:sqlite';
import { STAT_COLUMNS } from '../../lib/reports/stats';
import { segmentedStats, segmentsFor, EMPTY_ORDER_FILTERS, type OrderFilters } from '../../lib/pancake/order-segments';
import { vnDayStartUtc, addDays } from '../../lib/shared/report-time';
import { setHrTeams, type Team } from '../../lib/teams/team';

const file = process.argv[2];
if (!file) throw new Error('Thiếu đường dẫn file DB');
const db = new DatabaseSync(file, { readOnly: true });
db.exec('PRAGMA busy_timeout=10000');
const all = (sql: string, binds: unknown[] = []) => db.prepare(sql).all(...(binds as never[])) as Record<string, unknown>[];

const src = all("SELECT value FROM app_settings WHERE key='team_source'")[0];
setHrTeams(src?.value === 'hr');
const ready = all("SELECT value FROM app_settings WHERE key='stats_segment_epoch'")[0];
console.log(`cờ sẵn sàng: ${ready?.value ?? 'chưa có'}; nguồn team: ${src?.value ?? 'pancake'}`);

const posIds = all('SELECT id FROM pos_shops ORDER BY id').map((r) => String(r.id));
const vnNow = new Date(Date.now() + 7 * 3600000).toISOString();
const today = vnNow.slice(0, 10), hhmm = vnNow.slice(11, 19);
const dow = (new Date(`${today}T00:00:00Z`).getUTCDay() + 6) % 7; // 0 = thứ Hai
const weekStart = addDays(today, -dow), monthStart = `${today.slice(0, 7)}-01`;
const prevMonth = (() => { const d = new Date(`${monthStart}T00:00:00Z`); d.setUTCMonth(d.getUTCMonth() - 1); return d.toISOString().slice(0, 10); })();
const cut = (day: string) => new Date(Date.parse(`${day}T${hhmm}Z`) - 7 * 3600000).toISOString();
const sameOffset = (start: string, end: string, newStart: string) => addDays(newStart, Math.round((Date.parse(end) - Date.parse(start)) / 86400000));
const cases: { name: string; start: string; end: string; cutoff: string | null }[] = [
  { name: 'hôm nay', start: today, end: today, cutoff: null },
  { name: 'tuần này', start: weekStart, end: today, cutoff: null },
  { name: 'tuần trước cắt giờ', start: addDays(weekStart, -7), end: addDays(today, -7), cutoff: cut(addDays(today, -7)) },
  { name: 'tháng này', start: monthStart, end: today, cutoff: null },
  { name: 'tháng trước cắt giờ', start: prevMonth, end: sameOffset(monthStart, today, prevMonth), cutoff: cut(sameOffset(monthStart, today, prevMonth)) },
  { name: '30 ngày', start: addDays(today, -29), end: today, cutoff: null },
  { name: 'tháng trước đủ', start: prevMonth, end: addDays(monthStart, -1), cutoff: null },
  { name: 'tháng trước nữa', start: (() => { const d = new Date(`${prevMonth}T00:00:00Z`); d.setUTCMonth(d.getUTCMonth() - 1); return d.toISOString().slice(0, 10); })(), end: addDays(prevMonth, -1), cutoff: null },
];
const topMarketer = String(all("SELECT TRIM(marketer_id) AS m FROM raw_pos_orders WHERE created_at>=? AND TRIM(COALESCE(marketer_id,''))<>'' GROUP BY 1 ORDER BY COUNT(*) DESC LIMIT 1", [vnDayStartUtc(prevMonth)])[0]?.m ?? '');
const topSellers = all('SELECT seller_id FROM stats_daily WHERE day>=? AND seller_id<>\'\' GROUP BY 1 ORDER BY SUM(closed_orders) DESC LIMIT 3', [prevMonth]).map((r) => String(r.seller_id));
const sum = STAT_COLUMNS.map((c) => `COALESCE(SUM(${c}),0) AS ${c}`).join(',');
const groupings = ['', 'day', 'seller_id', 'marketer_id'];

let ok = 0, bad = 0; const lech: string[] = []; const oldT: number[] = [], newT: number[] = [];
const runOne = (v: { sql: string; binds: unknown[] }, g: string) => {
  const t = performance.now();
  const rows = all(v.sql + `SELECT ${g ? `${g} AS k,` : ''}${sum} FROM stats_daily${g ? ` GROUP BY ${g}` : ''}`, v.binds);
  return { rows, ms: performance.now() - t };
};
const key = (rows: Record<string, unknown>[]) => new Map(rows.map((r) => [String(r.k ?? ''), STAT_COLUMNS.map((c) => Number(r[c] ?? 0)).join(',')]));
const same = (a: Map<string, string>, b: Map<string, string>) => {
  const zero = STAT_COLUMNS.map(() => 0).join(',');
  for (const k of new Set([...a.keys(), ...b.keys()])) if ((a.get(k) ?? zero) !== (b.get(k) ?? zero)) return false;
  return true;
};
for (const c of cases) {
  const startUtc = vnDayStartUtc(c.start), endUtc = c.cutoff ?? vnDayStartUtc(addDays(c.end, 1));
  const base = c.cutoff ? { start: c.start, lastDay: c.end, lastDayStartUtc: vnDayStartUtc(c.end) } : null;
  for (const team of ['all', 'sale', 'cskh'] as Team[]) {
    const origins: [OrderFilters['orderOrigin'], string][] = team === 'cskh' ? [['all', ''], ['self', ''], ['mkt', ''], ['mkt', topMarketer]] : [['all', '']];
    for (const productSegment of ['all', ...segmentsFor(posIds)] as OrderFilters['productSegment'][]) for (const [orderOrigin, marketerId] of origins) for (const emp of (team === 'sale' ? [[], topSellers] : [[]])) {
      if (productSegment === 'all' && orderOrigin === 'all' && team !== 'cskh') continue; // không lọc thì báo cáo đọc stats_daily như cũ
      const f: OrderFilters = { ...EMPTY_ORDER_FILTERS, productSegment, orderOrigin, marketerId };
      const oldV = segmentedStats(posIds, startUtc, endUtc, team, f, emp, null, null, null);
      const newV = segmentedStats(posIds, startUtc, endUtc, team, f, emp, base, null, { start: c.start, end: c.end, ready: true, withProducts: false });
      for (const g of groupings.filter((x) => x !== 'marketer_id' || team === 'cskh')) {
        let a = runOne(oldV, g), b = runOne(newV, g);
        if (!same(key(a.rows), key(b.rows)) && c.end === today) { a = runOne(oldV, g); b = runOne(newV, g); } // hôm nay: đồng bộ có thể ghi xen giữa, đo lại một lần
        oldT.push(a.ms); newT.push(b.ms);
        if (same(key(a.rows), key(b.rows))) ok++;
        else { bad++; lech.push(`${c.name} team=${team} nhóm=${productSegment} nguồn=${orderOrigin}${marketerId ? '+1 MKT' : ''}${emp.length ? ' +3 NV' : ''} theo=${g || 'tổng'}`); }
      }
    }
  }
}
const p = (xs: number[], q: number) => { const s = [...xs].sort((x, y) => x - y); return Math.round(s[Math.min(s.length - 1, Math.floor(q * s.length))] ?? 0); };
console.log(`so sánh: ${ok} khớp, ${bad} lệch`);
for (const l of lech.slice(0, 40)) console.log('  lệch: ' + l);
console.log(`đường cũ: trung vị ${p(oldT, 0.5)} ms, p95 ${p(oldT, 0.95)} ms, chậm nhất ${p(oldT, 1)} ms`);
console.log(`đường mới: trung vị ${p(newT, 0.5)} ms, p95 ${p(newT, 0.95)} ms, chậm nhất ${p(newT, 1)} ms`);

// Đối chiếu như kiểm đêm, cho MỌI ngày đã điền (trừ hôm nay): tổng theo POS × ngày của bảng mới phải bằng stats_daily.
const sums = STAT_COLUMNS.map((x) => `SUM(${x})`).join("||','||");
const q = (t: string) => new Map(all(`SELECT pos_id||'|'||day AS k, ${sums} AS v FROM ${t} WHERE day<? GROUP BY pos_id, day`, [today]).map((r) => [String(r.k), String(r.v)]));
const A = q('stats_daily'), B = q('stats_daily_segment');
let dOk = 0, dBad = 0, missing = 0;
for (const k of A.keys()) { if (!B.has(k)) { if (A.get(k)!.split(',').some((x) => x !== '0')) missing++; continue; } if (A.get(k) === B.get(k)) dOk++; else dBad++; }
console.log(`ngày × POS: ${dOk} khớp stats_daily, ${dBad} lệch, ${missing} chưa có trong bảng mới; bảng mới có ${all('SELECT COUNT(*) AS n FROM stats_daily_segment')[0].n} dòng`);
db.close();
