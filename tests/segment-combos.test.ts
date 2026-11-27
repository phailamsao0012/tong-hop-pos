// Combo thực tế của thẻ nhóm đơn (lib/reports/segment-combos.ts): tổ hợp món trong một đơn chốt, không tính quà, không lặp món,
// cùng tổ hợp khác thứ tự là một; lọc theo thẻ, POS, kỳ chốt. Dữ liệu ảo.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { emptyDb } from './support/d1-sqlite';
import { segmentCombos } from '../lib/reports/segment-combos';
import { EMPTY_ORDER_FILTERS } from '../lib/pancake/order-segments';

void test('combo: gom tổ hợp món theo đơn chốt, bỏ quà, theo thẻ và POS', async () => {
  const { raw, db } = emptyDb();
  try {
    const order = raw.prepare('INSERT INTO raw_pos_orders (id,pos_id,shop_id,source_order_id,status_code,first_confirmed_at,first_closed_at,created_at,fetched_at,net_total) VALUES (?,?,?,?,?,?,?,?,?,?)');
    const item = raw.prepare('INSERT INTO raw_pos_order_items (id,order_id,pos_id,product_id,name,quantity,retail_price,line_total,is_bonus) VALUES (?,?,?,?,?,?,?,?,?)');
    const at = '2026-11-20T03:00:00.000Z';
    let n = 0;
    const add = (id: string, pos: string, names: [string, number?][], status = 1, net = 100, when = at) => {
      order.run(id, pos, pos, id, status, when, status === 0 ? null : when, when, when, net);
      for (const [name, bonus] of names) item.run(`${id}:${++n}`, id, pos, `p${n}`, name, 1, 10, 10, bonus ?? 0);
    };
    add('a1', 'sieu-vo-gao', [['THUỐC THÚ Y GENTADOX'], ['Men tỏi ảo']]);
    add('a2', 'sieu-vo-gao', [['Men tỏi ảo'], ['THUỐC THÚ Y GENTADOX'], ['Quà ảo', 1]]);          // cùng tổ hợp, khác thứ tự, có quà
    add('a3', 'sieu-vo-gao', [['THUỐC THÚ Y GENTADOX'], ['THUỐC THÚ Y GENTADOX']], 1, 50);       // món lặp → một tên
    add('a4', 'sieu-vo-gao', [['Thuốc thú y Oxytetra'], ['Bổ đậm đặc ảo']]);                      // thẻ Combo Oxytetra
    add('a5', 'sieu-vo-gao', [['THUỐC THÚ Y GENTADOX'], ['Men tỏi ảo']], 0);                       // chưa chốt
    add('a6', 'sieu-vo-gao', [['THUỐC THÚ Y GENTADOX'], ['Men tỏi ảo']], 1, 100, '2026-10-01T03:00:00.000Z'); // ngoài kỳ
    add('b1', 'bio-nano', [['Thuốc thú y Doxytylo ảo 10g'], ['Men tỏi ảo']]);
    const base = { posIds: ['sieu-vo-gao'], start: '2026-11-01', end: '2026-11-30', team: 'all' as const };
    const all = await segmentCombos(db, base);
    assert.deepEqual(all, [
      { items: ['Men tỏi ảo', 'THUỐC THÚ Y GENTADOX'], orders: 2, net: 200 },
      { items: ['Bổ đậm đặc ảo', 'Thuốc thú y Oxytetra'], orders: 1, net: 100 },
      { items: ['THUỐC THÚ Y GENTADOX'], orders: 1, net: 50 },
    ]);
    const genta = await segmentCombos(db, { ...base, filters: { ...EMPTY_ORDER_FILTERS, productSegment: 'gentadox' } });
    assert.deepEqual(genta.map((c) => c.orders), [2, 1]);
    const oxy = await segmentCombos(db, { ...base, filters: { ...EMPTY_ORDER_FILTERS, productSegment: 'oxy' } });
    assert.deepEqual(oxy.map((c) => c.items), [['Bổ đậm đặc ảo', 'Thuốc thú y Oxytetra']]);
    const doxy = await segmentCombos(db, { ...base, posIds: ['bio-nano'], filters: { ...EMPTY_ORDER_FILTERS, productSegment: 'doxytylo' } });
    assert.equal(doxy[0].orders, 1);
    assert.equal((await segmentCombos(db, { ...base, limit: 1 })).length, 1);
    assert.deepEqual(await segmentCombos(db, { ...base, posIds: [] }), []);
  } finally { raw.close(); }
});
