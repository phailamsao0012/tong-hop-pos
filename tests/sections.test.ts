import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildSections } from '../lib/sections';

test('tổng quan 4 mục: Sale, CSKH tách tự upsell / từ MKT, MKT theo Marketer, vận đơn tỷ lệ hoàn', () => {
  const s = buildSections([
    { team: 'sale', mkt: 1, closed: 10, net: 1000, sent: 8, sent_net: 800, returned: 2, returned_net: 100 },
    { team: 'cskh', mkt: 0, closed: 4, net: 600, sent: 4, sent_net: 600, returned: 0, returned_net: 0 },
    { team: 'cskh', mkt: 1, closed: 2, net: 200, sent: 2, sent_net: 200, returned: 1, returned_net: 100 },
  ], [
    { team: 'sale', mkt: 1, created: 40, closed_now: 10 },
    { team: 'cskh', mkt: 1, created: 10, closed_now: 2 },
  ]);
  assert.deepEqual([s.sale.orders, s.sale.net, s.sale.rate], [10, 1000, 25]);
  assert.deepEqual([s.cskh.orders, s.cskh.aov, s.cskh.self.orders, s.cskh.fromMkt.net], [6, 800 / 6, 4, 200]);
  assert.deepEqual([s.mkt.orders, s.mkt.net, s.mkt.rate, s.mkt.cost], [12, 1200, 12 / 50 * 100, null]);
  assert.deepEqual([s.shipping.total.orders, s.shipping.total.returned, s.shipping.total.rateOrders, s.shipping.total.rateNet], [14, 3, 3 / 14 * 100, 200 / 1600 * 100]);
  assert.equal(s.shipping.sale.rateOrders, 25);
});
