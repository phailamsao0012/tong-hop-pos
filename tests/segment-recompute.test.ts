// Tính lại stats_daily_segment theo bộ thẻ mới (lib/reports/segment-recompute.ts) trên DB ảo: xoá dòng thẻ cũ (skgk),
// tổng doanh thu / đơn từng tháng trước và sau bằng nhau, đọc bảng tính sẵn ra đúng như đọc đơn gốc, mốc sẵn sàng chỉ bật khi xong hết.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { demoWorld } from './support/d1-sqlite';
import { recomputeSegments } from '../lib/reports/segment-recompute';
import { SEGMENT_EPOCH, SEGMENT_READY_KEY, STATS_DONE_KEY, STATS_EPOCH, resetSegmentReadyMemo, segmentStatsReady } from '../lib/reports/stats';
import { EMPTY_ORDER_FILTERS, segmentedStats, segmentsFor, type ProductSegment } from '../lib/pancake/order-segments';
import { SHOPS } from '../lib/demo/world';
import { vnDayStartUtc } from '../lib/shared/report-time';

const DAYS = ['2026-10-14', '2026-11-05'];
const POS_IDS = SHOPS.map((s) => s.posId);

void test('tính lại thẻ: dọn thẻ cũ, tổng từng tháng không đổi, bảng tính sẵn khớp đơn gốc, mốc chỉ bật khi xong', async () => {
  const { raw, db } = await demoWorld(DAYS, Date.parse('2026-11-06T03:00:00Z'));
  try {
    const sums = () => raw.prepare("SELECT substr(day,1,7) m, SUM(closed_net) net, SUM(closed_orders) n, SUM(orders) o FROM stats_daily_segment GROUP BY 1 ORDER BY 1").all();
    // stats_daily chưa dựng xong theo STATS_EPOCH (chưa có mốc): lệnh dừng ngay, không ghi gì, không bật mốc thẻ (27/11/2026).
    const count = () => { let seg = -1; try { seg = Number(raw.prepare('SELECT COUNT(*) AS n FROM stats_daily_segment').get()?.n); } catch { /* chưa có bảng */ } return [raw.prepare('SELECT key, value FROM app_settings ORDER BY key').all(), seg]; };
    const n0 = count();
    const blocked = await recomputeSegments(db);
    assert.equal(blocked.statsNotReady, true);
    assert.equal(blocked.ready, false);
    assert.equal(blocked.done, 0);
    assert.deepEqual(count(), n0, 'không ghi gì (app_settings, bảng thẻ)');
    // Mốc sai epoch cũng chưa tính.
    raw.prepare('INSERT INTO app_settings (key,value,updated_at) VALUES (?,?,?)').run(STATS_DONE_KEY, String(STATS_EPOCH - 1), '2026-11-06T03:00:00Z');
    assert.equal((await recomputeSegments(db)).statsNotReady, true);
    raw.prepare('UPDATE app_settings SET value=? WHERE key=?').run(String(STATS_EPOCH), STATS_DONE_KEY);
    // Lần đầu: điền đủ, rồi giả có dòng thẻ cũ SK GK còn sót trong bảng (như DB thật trước khi đổi thẻ).
    const first = await recomputeSegments(db);
    assert.equal(first.ready, true);
    const before = sums();
    raw.prepare("INSERT INTO stats_daily_segment (id,pos_id,day,seller_id,segment,marketer_id,orders,updated_at) SELECT id||':cu', pos_id, day, seller_id, 'skgk', marketer_id, 0, updated_at FROM stats_daily_segment LIMIT 3").run();
    raw.prepare('DELETE FROM app_settings WHERE key=?').run(SEGMENT_READY_KEY);
    resetSegmentReadyMemo();
    assert.equal(await segmentStatsReady(db), false);

    // Dừng giữa chừng: chưa bật mốc.
    let calls = 0;
    const part = await recomputeSegments(db, { stop: () => ++calls > 1, sleep: async () => {} });
    assert.equal(part.stopped, true);
    assert.equal(part.ready, false);
    resetSegmentReadyMemo();
    assert.equal(await segmentStatsReady(db), false);

    const steps: string[] = [];
    const full = await recomputeSegments(db, { pauseMs: 1, sleep: async () => {}, onStep: (s) => steps.push(s.key) });
    assert.equal(full.ready, true);
    assert.equal(full.done, full.total);
    assert.ok(steps.length > 0);
    assert.equal(raw.prepare("SELECT COUNT(*) n FROM stats_daily_segment WHERE segment='skgk'").get()?.n, 0, 'dọn thẻ cũ');
    assert.deepEqual(sums(), before, 'tổng từng tháng không đổi');
    resetSegmentReadyMemo();
    assert.equal(await segmentStatsReady(db), true);
    assert.equal(raw.prepare('SELECT value FROM app_settings WHERE key=?').get(SEGMENT_READY_KEY)?.value, String(SEGMENT_EPOCH));

    // Đọc bảng tính sẵn = đọc đơn gốc cho từng thẻ.
    const start = '2026-10-01', end = '2026-11-30';
    const read = (k: ProductSegment, ready: boolean) => {
      const v = segmentedStats(POS_IDS, vnDayStartUtc(start), vnDayStartUtc('2026-12-01'), 'all', { ...EMPTY_ORDER_FILTERS, productSegment: k }, [], null, null, { start, end, ready, withProducts: false });
      return raw.prepare(v.sql + 'SELECT SUM(closed_net) net, SUM(closed_orders) n FROM stats_daily').get(...(v.binds as (string | number)[]));
    };
    for (const k of ['all', ...segmentsFor(POS_IDS)] as ProductSegment[]) assert.deepEqual(read(k, true), read(k, false), k);
    // Có đủ thẻ mới trên dữ liệu ảo.
    const keys = raw.prepare('SELECT DISTINCT segment FROM stats_daily_segment').all().map((r) => String(r.segment)).sort();
    for (const k of ['doxytylo', 'gentadox', 'khac', 'oxy']) assert.ok(keys.includes(k), k);
  } finally { raw.close(); }
});
