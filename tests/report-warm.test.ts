// Làm nóng cache báo cáo nặng (lib/reports/report-warm.ts): chọn URL, và hàm đọc bộ lọc dùng chung giữa route và lượt làm nóng.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { WARM_MAX, WARM_PATHS, WARM_RECENT_MS, pickWarm } from '../lib/reports/report-warm';
import { parseTrendsParams } from '../lib/reports/trends-report';
import { parseCareParams } from '../lib/reports/care-report';
import { parseCallsParams } from '../lib/reports/calls-report';
import { POS } from '../lib/shared/report-model';

void test('chỉ ba báo cáo nặng được làm nóng', () => {
  assert.deepEqual([...WARM_PATHS].sort(), ['/api/reports/calls', '/api/reports/care', '/api/reports/trends']);
});

void test('chọn URL làm nóng: vừa có người xem, bỏ Mentor, mới xem trước, tối đa 12', () => {
  const now = 10 * 60 * 60000;
  const entries = [
    { url: 'a', role: 'owner', at: now - 60000 },
    { url: 'b', role: 'mentor', at: now - 1000 },
    { url: 'c', role: 'staff', at: now - WARM_RECENT_MS - 1 },
    { url: 'd', role: 'lead', at: now - 5000 },
  ];
  assert.deepEqual(pickWarm(entries, now).map((e) => e.url), ['d', 'a']);
  const many = Array.from({ length: 20 }, (_, i) => ({ url: `u${i}`, role: 'owner', at: now - i * 1000 }));
  assert.equal(pickWarm(many, now).length, WARM_MAX);
});

void test('bộ lọc Xu hướng: POS mặc định là tất cả, nhóm hàng lạ về all, ngày sai báo lỗi', () => {
  const all = POS.map((x) => x.id);
  assert.deepEqual(parseTrendsParams(new URLSearchParams('start=2026-10-01&end=2026-10-07&posIds=&productSegment=xyz')), { posIds: all, productSegment: 'all', start: '2026-10-01', end: '2026-10-07' });
  assert.deepEqual(parseTrendsParams(new URLSearchParams(`start=2026-10-01&end=2026-10-07&posIds=${all[0]}`)), { posIds: [all[0]], productSegment: 'all', start: '2026-10-01', end: '2026-10-07' });
  assert.deepEqual(parseTrendsParams(new URLSearchParams('start=2026-10-08&end=2026-10-07')), { error: 'Khoảng ngày không hợp lệ.' });
  assert.deepEqual(parseTrendsParams(new URLSearchParams('start=2026-10-01&end=2026-10-07&posIds=khong_co')), { error: 'POS không hợp lệ.' });
});

void test('bộ lọc Khách theo nhân viên: giới hạn trang, sắp xếp lạ về note_old, minDays=-1 là chưa note', () => {
  const all = POS.map((x) => x.id);
  assert.deepEqual(parseCareParams(new URLSearchParams('posIds=&assigned=all&q=&minDays=0&sort=note_old&size=50&page=1&team=cskh')), { posIds: all, assigned: 'all', q: '', minDays: 0, size: 50, page: 1, sort: 'note_old' });
  assert.deepEqual(parseCareParams(new URLSearchParams('minDays=-1&sort=__proto__&size=99999&page=0&q=%20abc%20')), { posIds: all, assigned: 'all', q: 'abc', minDays: -1, size: 20000, page: 1, sort: 'note_old' });
  assert.deepEqual(parseCareParams(new URLSearchParams('posIds=khong_co')), { error: 'POS không hợp lệ.' });
});

void test('bộ lọc Cuộc gọi: ngày sai hay POS sai trả Response 400 trước khi hỏi D1', async () => {
  const bad = await parseCallsParams(new URLSearchParams('start=2026-10-08&end=2026-10-07'));
  assert.ok(bad instanceof Response); assert.equal(bad.status, 400);
  const badPos = await parseCallsParams(new URLSearchParams('start=2026-10-01&end=2026-10-07&posIds=khong_co'));
  assert.ok(badPos instanceof Response); assert.equal(badPos.status, 400);
});
