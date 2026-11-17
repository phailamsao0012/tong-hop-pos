import assert from 'node:assert/strict';
import { test } from 'node:test';
import { demoWorld } from './support/d1-sqlite';
import { mktCross } from '../lib/reports/mkt-cross';
import { marketerDetail } from '../lib/reports/mkt-marketer-detail';
import { kpiDayReport } from '../lib/kpi/kpi-day-report';
import { POS } from '../lib/shared/report-model';

// Chạy thật câu SQL trên thế giới demo (bắt lỗi kiểu GROUP BY sai cột), và đối chiếu: tổng bảng chéo = tổng chi tiết các marketer.
void test('mktCross + marketerDetail + kpiDayReport chạy được và khớp nhau', async () => {
  const days = ['2026-10-15', '2026-10-16'];
  await demoWorld(days, Date.parse('2026-10-17T03:00:00Z'));
  const posIds = POS.map((p) => p.id);
  const cross = await mktCross(posIds, days[0], days[1]);
  assert.ok(cross.pairs.length > 0, 'thế giới demo có đơn MKT');
  const byMkt = new Map<string, { closed: number; net: number; phones: number }>();
  for (const p of cross.pairs) {
    const a = byMkt.get(p.marketerId) ?? { closed: 0, net: 0, phones: 0 };
    a.closed += p.closed; a.net += p.net; a.phones += p.phones;
    byMkt.set(p.marketerId, a);
  }
  const [mid, want] = [...byMkt.entries()].sort((a, b) => b[1].closed - a[1].closed)[0];
  const d = await marketerDetail(mid, posIds, days[0], days[1]);
  assert.equal(d.current.closed, want.closed);
  assert.equal(Math.round(d.current.net), Math.round(want.net));
  assert.equal(d.bySale.reduce((a, s) => a + s.closed, 0), d.current.closed, 'tổng dòng Sale = số marketer');
  assert.ok(d.current.packed >= d.current.cancelled + d.current.returned);
  const k = await kpiDayReport(posIds);
  assert.ok(['sale', 'cskh', 'mkt'].every((x) => x in k.depts));
});
