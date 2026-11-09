// CHỈ CHẠY TRÊN PC, trên bản sao DB thử (mặc định C:\thp\db-thu\thp.sqlite), không đụng web thật.
// Điền bảng stats_daily_segment cho các tháng gần đây, rồi so số đường MỚI (đọc bảng tính sẵn) với đường CŨ (quét đơn gốc, WITH segment_orders)
// cho nhiều khoảng ngày × nhóm sản phẩm × team × nguồn đơn. In số tổ hợp khớp/lệch và thời gian, KHÔNG in số liệu kinh doanh.
// Chạy: npx tsx --import ./tests/support/register.mjs scripts/pc/so-bang-tinh-san.ts [db] [tháng,...]
import { openD1 } from '../../pc/d1';
import { STAT_COLUMNS, backfillSegmentMonth, ensureSegmentSchema, ensureStatsSchema } from '../../lib/reports/stats';
import { segmentedStats, segmentsFor, EMPTY_ORDER_FILTERS, type OrderFilters } from '../../lib/pancake/order-segments';
import { vnDayStartUtc, addDays } from '../../lib/shared/report-time';
import type { Team } from '../../lib/teams/team';

const file = process.argv[2] ?? 'C:\\thp\\db-thu\\thp.sqlite';
const months = (process.argv[3] ?? '2026-10,2026-11').split(',');
const db = await openD1(file, { readers: 4 });
await ensureStatsSchema(db);
await ensureSegmentSchema(db);
const posIds = (await db.prepare('SELECT id FROM pos_shops ORDER BY id').all<{ id: string }>()).results.map((r) => r.id);

let t = Date.now();
for (const posId of posIds) for (const month of months) await backfillSegmentMonth(db, posId, month);
console.log(`điền bảng ${posIds.length} POS × ${months.length} tháng: ${Math.round((Date.now() - t) / 1000)} s`);

const marketer = (await db.prepare("SELECT TRIM(marketer_id) AS m FROM raw_pos_orders WHERE created_at>='2026-11-01' AND TRIM(COALESCE(marketer_id,''))<>'' GROUP BY 1 ORDER BY COUNT(*) DESC LIMIT 1").first<{ m: string }>())?.m ?? '';
const sum = STAT_COLUMNS.map((c) => `COALESCE(SUM(${c}),0) AS ${c}`).join(',');
const ranges: [string, string][] = [['2026-10-10', '2026-11-08'], ['2026-11-01', '2026-11-08'], ['2026-11-05', '2026-11-05'], ['2026-10-01', '2026-10-31']];
const teams: Team[] = ['all', 'sale', 'cskh'];
let ok = 0, bad = 0, oldMs = 0, newMs = 0;
const lech: string[] = [];
for (const [start, end] of ranges) {
  const startUtc = vnDayStartUtc(start), endUtc = vnDayStartUtc(addDays(end, 1));
  for (const team of teams) {
    const origins: [OrderFilters['orderOrigin'], string][] = team === 'cskh' ? [['all', ''], ['self', ''], ['mkt', ''], ['mkt', marketer]] : [['all', '']];
    for (const productSegment of ['all', ...segmentsFor(posIds)] as OrderFilters['productSegment'][]) {
      for (const [orderOrigin, marketerId] of origins) {
        if (productSegment === 'all' && orderOrigin === 'all') continue; // không lọc thì báo cáo đọc stats_daily như cũ
        const f: OrderFilters = { ...EMPTY_ORDER_FILTERS, productSegment, orderOrigin, marketerId };
        const run = async (ready: boolean) => {
          const v = segmentedStats(posIds, startUtc, endUtc, team, f, [], null, null, ready ? { start, end, ready: true, withProducts: false } : null);
          const s = Date.now();
          const row = await db.prepare(v.sql + `SELECT ${sum} FROM stats_daily`).bind(...v.binds).first<Record<string, number>>();
          return { row: row ?? {}, ms: Date.now() - s };
        };
        const a = await run(false), b = await run(true);
        oldMs += a.ms; newMs += b.ms;
        const diff = STAT_COLUMNS.filter((c) => Number(a.row[c] ?? 0) !== Number(b.row[c] ?? 0));
        if (diff.length) { bad++; lech.push(`${start}..${end} team=${team} nhóm=${productSegment} nguồn=${orderOrigin}${marketerId ? '+1 marketer' : ''}: lệch cột ${diff.join(',')}`); }
        else ok++;
      }
    }
  }
}
console.log(`tổ hợp khớp: ${ok}, lệch: ${bad}`);
for (const l of lech.slice(0, 30)) console.log('  ' + l);
console.log(`tổng thời gian đường cũ: ${oldMs} ms, đường mới: ${newMs} ms`);
await db.close();
