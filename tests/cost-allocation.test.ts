import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { adCostSource, sheetStatsSource } from '../lib/ops/cost-allocation';
import { POS } from '../lib/shared/report-model';

// Quy tắc POS mục A1 (anh Vũ 12/11/2026): chia chi phí marketer theo tỉ lệ số điện thoại về từng POS trong ngày.
function db() {
  const d = new DatabaseSync(':memory:');
  d.exec(`CREATE TABLE raw_pos_orders (id TEXT, pos_id TEXT, marketer_id TEXT, phone TEXT, created_at TEXT, status_code INTEGER);
    CREATE TABLE ad_costs (id TEXT, day TEXT, marketer_id TEXT, amount INTEGER, campaign TEXT, note TEXT, created_at TEXT);
    CREATE TABLE sheet_mkt_stats (marketer_id TEXT, day TEXT, phones INTEGER, orders INTEGER, revenue INTEGER);`);
  const o = d.prepare('INSERT INTO raw_pos_orders VALUES (?,?,?,?,?,?)');
  // Marketer A ngày 05/11 (giờ VN): 3 số ở bio-nano, 1 số ở oxytetra; ngày 06/11 không có số nào (dùng tỉ lệ cả khoảng).
  [['1', 'bio-nano', '0901'], ['2', 'bio-nano', '0902'], ['3', 'bio-nano', '0903'], ['4', 'oxytetra', '0904']].forEach(([id, pos, ph]) => o.run(id, pos, 'A', ph, '2026-11-05T03:00:00', 1));
  // Marketer B chỉ chạy sieu-vo-gao.
  o.run('5', 'sieu-vo-gao', 'B', '0905', '2026-11-05T03:00:00', 1);
  const c = d.prepare('INSERT INTO ad_costs VALUES (?,?,?,?,?,?,?)');
  c.run('c1', '2026-11-05', 'A', 100, null, null, 'x'); c.run('c2', '2026-11-06', 'A', 40, null, null, 'x'); c.run('c3', '2026-11-05', 'B', 50, null, null, 'x');
  d.prepare('INSERT INTO sheet_mkt_stats VALUES (?,?,?,?,?)').run('A', '2026-11-05', 8, 4, 1000);
  return d;
}
const sum = (d: DatabaseSync, src: string, mk: string) => Number((d.prepare(`SELECT COALESCE(SUM(amount),0) AS s FROM ${src} WHERE marketer_id=?`).get(mk) as { s: number }).s);

void test('chi phí chia theo tỉ lệ số trong ngày, ngày không có số dùng tỉ lệ cả khoảng; cộng các POS = tổng gốc', () => {
  const d = db();
  const bn = adCostSource(['bio-nano'], '2026-11-01', '2026-11-10');
  const oxy = adCostSource(['oxytetra'], '2026-11-01', '2026-11-10');
  assert.equal(sum(d, bn, 'A'), 100 * 0.75 + 40 * 0.75);
  assert.equal(sum(d, oxy, 'A'), 100 * 0.25 + 40 * 0.25);
  assert.equal(sum(d, bn, 'A') + sum(d, oxy, 'A'), 140);
  assert.equal(sum(d, adCostSource(['sieu-vo-gao'], '2026-11-01', '2026-11-10'), 'B'), 50, 'marketer chỉ chạy 1 POS: chi phí về đúng POS đó');
  assert.equal(sum(d, bn, 'B'), 0);
});

void test('chọn đủ mọi POS: dùng nguyên bảng; số sheet chia cùng tỉ lệ; ngày sai thì báo lỗi', () => {
  assert.equal(adCostSource(POS.map((p) => p.id), '2026-11-01', '2026-11-10'), 'ad_costs');
  assert.equal(adCostSource([], '2026-11-01', '2026-11-10'), 'ad_costs');
  const d = db();
  const r = d.prepare(`SELECT SUM(revenue) AS r, SUM(phones) AS p FROM ${sheetStatsSource(['bio-nano'], '2026-11-01', '2026-11-10')}`).get() as { r: number; p: number };
  assert.equal(r.r, 750);
  assert.equal(r.p, 6);
  assert.throws(() => adCostSource(['bio-nano'], "2026-11-01' OR 1=1 --", '2026-11-10'));
});
