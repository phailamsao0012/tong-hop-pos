import test from 'node:test';
import assert from 'node:assert/strict';
import { STAFF, dayData, findOrder, hrSnapshot, listCustomers, listOrders, toSourceOrder } from '../lib/demo/world';
import { fakePancake } from '../lib/demo/fake-pancake';
import { computePosTeams } from '../lib/hr-copy';

const now = Date.parse('2026-10-04T11:00:00Z');
const sec = (iso: string) => String(Date.parse(iso) / 1000);

test('demo data is deterministic', () => {
  const a = JSON.stringify(dayData('thuy-san', '2026-09-10').orders.map((o) => toSourceOrder(o, now)));
  const b = JSON.stringify(dayData('thuy-san', '2026-09-10').orders.map((o) => toSourceOrder(o, now)));
  assert.equal(a, b);
  assert.ok(dayData('thuy-san', '2026-09-10').orders.length > 20);
});

test('orders never show events from the future', () => {
  const early = Date.parse('2026-10-04T02:00:00Z');
  for (const o of dayData('bio-nano', '2026-10-04').orders) {
    const src = toSourceOrder(o, early);
    if (o.t0 > early) { assert.equal(src, null); continue; }
    for (const h of src!.status_history!) assert.ok(Date.parse(`${h.updated_at}Z`) <= early);
  }
});

test('order list filters by creation window and pages without overlap', () => {
  const params = (page: number) => new URLSearchParams({ page_size: '50', page_number: String(page), updateStatus: 'inserted_at', option_sort: 'inserted_at_asc',
    startDateTime: sec('2026-08-31T17:00:00Z'), endDateTime: sec('2026-09-30T16:59:59Z') });
  const first = listOrders('megaroot', params(1), now);
  const second = listOrders('megaroot', params(2), now);
  assert.ok(first.total_entries > 100);
  const ids = new Set(first.data.map((o) => o.id));
  assert.ok(second.data.every((o) => !ids.has(o.id)));
  for (const o of first.data) assert.ok(o.inserted_at! >= '2026-08-31T17:00:00' && o.inserted_at! <= '2026-09-30T16:59:59');
  assert.equal(findOrder('megaroot', String(first.data[0].id), now)?.id, first.data[0].id);
});

test('recent updates include orders whose status changed in the window', () => {
  const r = listOrders('thuy-san', new URLSearchParams({ page_size: '100', updateStatus: 'updated_at', startDateTime: String(now / 1000 - 6 * 3600), endDateTime: String(now / 1000) }), now);
  assert.ok(r.total_entries > 0);
  for (const o of r.data) assert.ok(Date.parse(`${o.updated_at}Z`) >= now - 6 * 3600000 - 1000);
});

test('customers carry CSKH notes and a holder', () => {
  const r = listCustomers('sieu-vo-gao', new URLSearchParams({ page_size: '100', start_time_updated_at: String(now / 1000 - 2 * 86400), end_time_updated_at: String(now / 1000) }), now);
  assert.ok(r.data.some((c) => (c.notes ?? []).length > 0));
  assert.ok(r.data.every((c) => STAFF.some((s) => s.id === c.assigned_user_id)));
});

test('fake Pancake answers the shop list and users', () => {
  const [, shops] = fakePancake('GET', new URL('https://pos.pages.fm/api/v1/shops')) as [number, { shops: unknown[] }];
  assert.equal(shops.shops.length, 6);
  const [status] = fakePancake('GET', new URL('https://pos.pages.fm/api/v1/shops/999/orders'));
  assert.equal(status, 404);
});

test('HR snapshot puts every seller in a team with a Leader and a head', () => {
  const rows = computePosTeams(hrSnapshot(), '2026-10-04');
  const sellers = rows.filter((r) => r.team === 'sale' || r.team === 'cskh');
  assert.ok(sellers.length >= 25);
  for (const r of sellers) {
    assert.ok(r.department && r.head_name, r.employee_name);
    if (r.level !== 'Leader') assert.ok(r.leader_name, r.employee_name);
  }
  assert.ok(rows.some((r) => r.status === 'da_nghi'));
});
