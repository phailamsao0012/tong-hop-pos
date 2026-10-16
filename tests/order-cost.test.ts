import assert from 'node:assert/strict';
import { test } from 'node:test';
import { itemUnitCost, orderCost, carrierFee } from '../lib/order-cost';
import { orderStatements } from '../lib/sync';
import { fillCostMonth, costReady, COST_READY_KEY } from '../lib/stats';
import { emptyDb, demoWorld } from './support/d1-sqlite';

void test('itemUnitCost: avg, fallback, combo, missing and invalid prices', () => {
  assert.equal(itemUnitCost({ variation_info: { avg_price: 100, last_imported_price: 80 } }), 100);
  assert.equal(itemUnitCost({ variation_info: { avg_price: 0, last_imported_price: 80 } }), 80);
  const combo = { components: [{ quantity: 2, variation_info: { avg_price: 30 } }, { quantity: 3, variation_info: { last_imported_price: 20 } }] };
  assert.equal(itemUnitCost(combo), 120);
  assert.equal(itemUnitCost({ ...combo, variation_info: { avg_price: 90 } }), 90);
  assert.equal(itemUnitCost({ components: [{ quantity: 1 }] }), null);
  assert.equal(itemUnitCost({ variation_info: { avg_price: NaN, last_imported_price: -1 } }), null);
});

void test('orderCost: gifts count, missing lines and zero quantity', () => {
  assert.deepEqual(orderCost({ items: [{ quantity: 2, is_bonus_product: true, variation_info: { avg_price: 30 } }, { quantity: 1 }, { quantity: 0 }] }), { cost: 60, missing: 1 });
  assert.deepEqual(orderCost({}), { cost: 0, missing: 0 });
});

void test('carrierFee: total_fee > partner_fee > null', () => {
  assert.equal(carrierFee({ partner: { total_fee: 30 }, partner_fee: 20 }), 30);
  assert.equal(carrierFee({ partner: { total_fee: 0 }, partner_fee: 20 }), 20);
  assert.equal(carrierFee({ partner_fee: -1 }), null);
  assert.equal(carrierFee({}), null);
});

void test('orderStatements: three cost columns, replace costs and retain absent fee', async () => {
  const { raw, db } = emptyDb();
  try {
    await db.batch(orderStatements(db, 'demo', '1', { id: 1, items: [{ quantity: 2, variation_info: { avg_price: 40 } }], partner: { total_fee: 30 } }, '2026-10-15'));
    const read = () => ({ ...raw.prepare('SELECT cost_total,cost_missing,carrier_fee FROM raw_pos_orders').get() });
    assert.deepEqual(read(), { cost_total: 80, cost_missing: 0, carrier_fee: 30 });
    await db.batch(orderStatements(db, 'demo', '1', { id: 1, items: [{ quantity: 1 }] }, '2026-10-15'));
    assert.deepEqual(read(), { cost_total: 0, cost_missing: 1, carrier_fee: 30 });
  } finally { raw.close(); }
});

void test('fillCostMonth: shared calculation, invalid JSON, scope, deadline and idempotence', async () => {
  const { raw, db } = emptyDb();
  try {
    const sources = [JSON.stringify({ items: [{ quantity: 3, variation_info: { last_imported_price: 20 } }], partner_fee: 25 }), '{broken', '{}', '{}', '{}'];
    sources.forEach((json, i) => raw.prepare('INSERT INTO raw_pos_orders (id,pos_id,shop_id,source_order_id,created_at,first_sent_at,fetched_at,raw_json) VALUES (?,?,?,?,?,?,?,?)').run(String(i), i === 3 ? 'other' : 'demo', '1', String(i), i === 4 ? '2026-09-10' : '2026-10-10', i === 2 ? null : '2026-10-11', '2026-10-15', json));
    assert.deepEqual(await fillCostMonth(db, 'demo', '2026-10', 0), { writes: 0, done: false });
    assert.deepEqual(await fillCostMonth(db, 'demo', '2026-10'), { writes: 2, done: true });
    const rows = raw.prepare('SELECT cost_total,cost_missing,carrier_fee FROM raw_pos_orders ORDER BY id').all();
    assert.deepEqual({ ...rows[0] }, { cost_total: 60, cost_missing: 0, carrier_fee: 25 });
    assert.deepEqual({ ...rows[1] }, { cost_total: 0, cost_missing: -1, carrier_fee: null });
    for (const row of rows.slice(2)) assert.equal(row.cost_missing, null);
    assert.deepEqual(await fillCostMonth(db, 'demo', '2026-10'), { writes: 0, done: true });
    assert.equal(await costReady(db), false);
    raw.prepare('INSERT INTO app_settings (key,value,updated_at) VALUES (?,?,?)').run(COST_READY_KEY, '1', '2026-10-15');
    assert.equal(await costReady(db), true);
  } finally { raw.close(); }
});

void test('demoWorld: at least 95% sent item lines have cost and carrier fees are stored', async () => {
  const { raw } = await demoWorld(Array.from({ length: 7 }, (_, i) => `2026-10-${String(9 + i).padStart(2, '0')}`), Date.parse('2026-10-16T12:00:00Z'));
  try {
    const orders = raw.prepare('SELECT raw_json,carrier_fee FROM raw_pos_orders WHERE first_sent_at IS NOT NULL').all();
    let lines = 0, covered = 0, fallback = 0, missing = 0;
    for (const row of orders) {
      const source = JSON.parse(String(row.raw_json)) as Parameters<typeof orderCost>[0];
      for (const item of source.items ?? []) {
        lines++;
        if (itemUnitCost(item) !== null) covered++; else missing++;
        if (item.variation_info?.last_imported_price) fallback++;
      }
      assert.ok(Number(row.carrier_fee) >= 22000 && Number(row.carrier_fee) <= 38000);
    }
    assert.ok(lines > 0 && covered / lines >= 0.95);
    assert.ok(fallback > 0 && missing > 0);
  } finally { raw.close(); }
});
