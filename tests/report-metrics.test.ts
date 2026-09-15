import test from 'node:test';
import assert from 'node:assert/strict';
import { reportScope, upsellSummary } from '../lib/report-metrics';
import type { Dataset, Filters, Order } from '../lib/report-model';

const order = (
  id: string,
  phone: string,
  confirmedAt: string | null,
  createdAt: string,
  status: Order['status'] = 'confirmed',
  overrides: Partial<Order> = {},
): Order => ({
  id,
  posId: 'sieu-vo-gao',
  phone,
  closerId: 'anh',
  createdAt,
  confirmedAt,
  deliveredAt: status === 'delivered' ? createdAt : null,
  status,
  hotValue: 500000,
  currentValue: 700000,
  netMerchandise: 420000,
  returnValue: status === 'returned' ? 420000 : 0,
  items: [{ productId: 'feed', quantity: 1, netValue: 420000 }],
  ...overrides,
});
const date = '2026-09-15';
const filters: Filters = {
  start: date,
  end: date,
  posIds: [],
  employeeIds: [],
  productIds: [],
};
const data = (
  assignments: Dataset['assignments'],
  orders: Order[],
): Dataset => ({
  assignments,
  orders,
  customers: [],
  updatedAt: null,
  historyStart: null,
  mode: 'demo',
});
const assignment = (
  id: string,
  phone: string,
  assignedAt: string,
  employeeId = 'anh',
) => ({
  id,
  posId: 'sieu-vo-gao',
  phone,
  employeeId,
  assignedAt,
  batchId: 'sep',
});

test('one phone with repeated assignment and two confirmed orders counts once in conversion', () => {
  const fixture = data(
    [
      assignment('a1', '0901 111 111', `${date}T08:00:00+07:00`),
      assignment('a2', '0901111111', `${date}T09:00:00+07:00`),
    ],
    [
      order(
        'o1',
        '0901111111',
        `${date}T10:00:00+07:00`,
        `${date}T09:50:00+07:00`,
      ),
      order(
        'o2',
        '0901 111 111',
        `${date}T11:00:00+07:00`,
        `${date}T10:50:00+07:00`,
        'confirmed',
        { hotValue: 300000 },
      ),
    ],
  );
  const result = reportScope(fixture, filters);
  assert.equal(result.received, 1);
  assert.equal(result.closed, 1);
  assert.equal(result.rate, 100);
  assert.equal(result.hotOrders, 2);
  assert.equal(result.hotValue, 800000);
});

test('a phone assigned yesterday can close today in activity without entering today cohort', () => {
  const fixture = data(
    [assignment('a1', '0901111111', '2026-09-14T08:00:00+07:00')],
    [
      order(
        'o1',
        '0901111111',
        `${date}T10:00:00+07:00`,
        `${date}T09:50:00+07:00`,
      ),
    ],
  );
  const result = reportScope(fixture, filters);
  assert.equal(result.received, 0);
  assert.equal(result.closed, 0);
  assert.equal(result.rate, null);
  assert.equal(result.activityHotOrders, 1);
  assert.equal(result.hotOrders, 0);
});

test('month report recomputes unique phones across daily assignments', () => {
  const fixture = data(
    [
      assignment('a1', '0901111111', '2026-09-01T08:00:00+07:00'),
      assignment('a2', '0901111111', '2026-09-10T08:00:00+07:00'),
    ],
    [
      order(
        'o1',
        '0901111111',
        `${date}T10:00:00+07:00`,
        `${date}T09:50:00+07:00`,
      ),
    ],
  );
  const result = reportScope(fixture, { ...filters, start: '2026-09-01' });
  assert.equal(result.received, 1);
  assert.equal(result.closed, 1);
  assert.equal(result.rate, 100);
});

test('monthly revenue uses successful merchandise on order creation date and tracks returns separately', () => {
  const fixture = data(
    [],
    [
      order(
        'success',
        '0901111111',
        '2026-09-03T10:00:00+07:00',
        '2026-09-03T09:00:00+07:00',
        'delivered',
        { hotValue: 500000, currentValue: 750000, netMerchandise: 420000 },
      ),
      order(
        'returned',
        '0902222222',
        '2026-09-04T10:00:00+07:00',
        '2026-09-04T09:00:00+07:00',
        'returned',
      ),
      order(
        'old',
        '0903333333',
        '2026-08-31T10:00:00+07:00',
        '2026-08-31T09:00:00+07:00',
        'delivered',
      ),
    ],
  );
  const result = reportScope(fixture, { ...filters, start: '2026-09-01' });
  assert.equal(result.deliveredCount, 1);
  assert.equal(result.deliveredRevenue, 420000);
  assert.equal(result.returnedOrders.length, 1);
});

test('second successful purchase is upsell one from available history', () => {
  const fixture = data(
    [assignment('a1', '0901111111', '2026-09-01T08:00:00+07:00', 'bao')],
    [
      order(
        'first',
        '0901111111',
        '2026-08-01T10:00:00+07:00',
        '2026-08-01T09:00:00+07:00',
        'delivered',
      ),
      order(
        'second',
        '0901111111',
        '2026-09-10T10:00:00+07:00',
        '2026-09-10T09:00:00+07:00',
        'delivered',
      ),
    ],
  );
  const result = upsellSummary(fixture, { ...filters, start: '2026-09-01' });
  assert.equal(result.first, 1);
  assert.equal(result.customers, 1);
  assert.equal(result.orders, 1);
  assert.equal(result.revenue, 420000);
});
test('the same phone in two POS remains two report identities', () => {
  const a = assignment('a1', '0901111111', `${date}T08:00:00+07:00`);
  const b = { ...a, id: 'b1', posId: 'bio-nano' };
  const result = reportScope(data([a, b], []), filters);
  assert.equal(result.received, 2);
});

test('a transferred phone does not move hot results from the actual closer', () => {
  const a = assignment('a1', '0901111111', `${date}T08:00:00+07:00`, 'anh');
  const sold = order(
    'o1',
    '0901111111',
    `${date}T10:00:00+07:00`,
    `${date}T09:50:00+07:00`,
    'confirmed',
    { closerId: 'bao' },
  );
  const fixture = data([a], [sold]);
  const assigned = reportScope(fixture, { ...filters, employeeIds: ['anh'] });
  const closer = reportScope(fixture, { ...filters, employeeIds: ['bao'] });
  assert.equal(assigned.received, 1);
  assert.equal(assigned.closed, 0);
  assert.equal(closer.activityHotOrders, 1);
  assert.equal(closer.received, 0);
});
