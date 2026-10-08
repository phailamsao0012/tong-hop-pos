import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NO_TEAM, OTHER_LINE, orderLines, returnRates, shippingByLine, type ShippingOrder } from '../lib/shipping-lines';

const tags = (...names: string[]) => JSON.stringify(names.map((name) => ({ name })));
const o = (id: string, status: number, net: number, tag: string[], marketerId: string | null): ShippingOrder => ({ id, status, net, tagsJson: tags(...tag), marketerId, items: [] });

test('vận đơn theo nhãn: đi, hoàn, tỷ lệ theo đơn và doanh số; team MKT có dòng tổng', () => {
  const orders = [
    o('1', 3, 100, ['OXY'], 'dat'), o('2', 5, 200, ['OXY'], 'dat'), o('3', 1, 50, ['OXY'], 'dat'),
    o('4', 2, 300, ['THỦY SẢN'], 'dang'), o('5', 4, 100, ['OXY', 'THỦY SẢN'], 'dang'), o('6', 6, 80, ['OXY'], null),
  ];
  const teams = new Map([['apex', 'APEX'], ['dang', 'Team Đăng']]);
  const r = shippingByLine(orders, { dim: 'tag', basis: 'both', teamOf: (id) => id === 'dat' ? 'apex' : id === 'dang' ? 'dang' : NO_TEAM, teamNames: teams });
  const oxy = r.lines.find((l) => l.line === 'OXY')!;
  assert.deepEqual([oxy.closed.orders, oxy.sent.orders, oxy.returned.orders, oxy.pending.orders, oxy.cancelled.orders], [4, 3, 2, 1, 1]);
  assert.deepEqual(returnRates(oxy), { byOrders: 2 / 3 * 100, byNet: 300 / 400 * 100 });
  // Tổng đếm mỗi đơn một lần dù đơn 5 có hai dòng.
  assert.equal(r.total.sent.orders, 4);
  const dang = r.teams.find((t) => t.teamId === 'dang')!;
  assert.equal(dang.lines.length, 2);
  assert.equal(dang.total.sent.net, 400);
  assert.equal(r.teams.at(-1)!.teamId, NO_TEAM);
});

test('loại đơn theo combo: Oxy kèm Bổ đậm đặc, SK + GK, Vita Plus và Mega Green tách dòng', () => {
  assert.deepEqual(orderLines(['OXY 1kg', 'Bổ Đậm Đặc'], null), ['Oxy']);
  assert.deepEqual(orderLines(['SK 500ml', 'GK 250ml'], null), ['SK + GK']);
  assert.deepEqual(orderLines(['Gentadox 100g'], null), ['Gentadox']);
  assert.deepEqual(orderLines(['Vita Plus', 'Mega Green'], null), ['Vita Plus', 'Mega Green']);
  // Chưa có sản phẩm thì xét nhãn đơn; không khớp gì là Khác.
  assert.deepEqual(orderLines([], tags('OXY')), ['Oxy']);
  assert.deepEqual(orderLines(['Quà tặng lạ'], tags('KHÁC')), [OTHER_LINE]);
  const r = shippingByLine([
    { id: 'a', status: 2, net: 100, tagsJson: null, marketerId: null, items: ['Mega Green'] },
    { id: 'b', status: 2, net: 100, tagsJson: null, marketerId: null, items: ['OXY 1kg'] },
  ], { dim: 'line', basis: 'both', teamOf: () => NO_TEAM, teamNames: new Map() });
  assert.deepEqual(r.lines.map((l) => l.line), ['Oxy', 'Mega Green']);
});
