import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { basketOf, careBasketSql, parseCareBasket } from '../lib/reports/care-basket';

const CASES: [string, string, { name: string; total: number }[], 'ks' | 'skgk' | null][] = [
  ['k1', 'one', [{ name: 'GENTADOX 100g', total: 500 }], 'ks'],
  ['k2', 'one', [{ name: 'Gentadox', total: 500 }, { name: 'DETOX gan', total: 300 }], 'ks'],
  ['k3', 'one', [{ name: 'Gentadox', total: 500 }, { name: 'Bencid', total: 200 }], null],
  ['k4', 'one', [{ name: 'Gentadox', total: 500 }, { name: 'Bencid', total: 0 }], 'ks'], // hàng tặng không tính
  ['k5', 'one', [{ name: 'SK + GK 500ml', total: 400 }], 'skgk'],
  ['k6', 'one', [{ name: 'SK', total: 400 }, { name: 'GK', total: 400 }], 'skgk'],
  ['k7', 'one', [{ name: 'SK', total: 400 }, { name: 'Gentadox', total: 400 }], null],
  ['k8', 'one', [{ name: 'Bencid SKY', total: 400 }], null], // chữ "sk" nằm giữa tên không phải SK
  ['k9', 'one', [], null],
  ['k10', 'sieu-vo-gao', [{ name: 'OXY + BỔ HUYẾT', total: 400 }], 'ks'],
  ['k11', 'mgt-apex', [{ name: 'OXY + BỔ HUYẾT', total: 400 }], null],
];

void test('basketOf: chỉ kháng sinh / chỉ SK + GK, hàng tặng bỏ qua (anh Vũ 04/11/2026)', () => {
  for (const [id, pos, products, want] of CASES) assert.equal(basketOf(products, pos), want, id);
});

void test('careBasketSql cho cùng kết quả với basketOf', () => {
  const db = new DatabaseSync(':memory:');
  db.exec('CREATE TABLE c(id TEXT, pos_id TEXT, phone TEXT); CREATE TABLE cs(id TEXT, products_json TEXT);');
  for (const [id, pos, products] of CASES) {
    db.prepare('INSERT INTO c VALUES (?,?,?)').run(id, pos, id);
    db.prepare('INSERT INTO cs VALUES (?,?)').run(`${pos}:${id}`, JSON.stringify(products));
  }
  db.exec("INSERT INTO c VALUES ('bad','one','bad'); INSERT INTO cs VALUES ('one:bad','không phải json');");
  for (const basket of ['ks', 'skgk'] as const) {
    const got = (db.prepare(`SELECT c.id FROM c JOIN cs ON cs.id=c.pos_id||':'||c.phone WHERE 1${careBasketSql(basket)} ORDER BY c.id`).all() as { id: string }[]).map((r) => r.id);
    const want = CASES.filter((x) => x[3] === basket).map((x) => x[0]).sort();
    assert.deepEqual(got, want, basket);
  }
  assert.equal(careBasketSql('all'), '');
  db.close();
});

void test('parseCareBasket chỉ nhận giá trị biết trước', () => {
  assert.equal(parseCareBasket('ks'), 'ks');
  assert.equal(parseCareBasket('skgk'), 'skgk');
  assert.equal(parseCareBasket("x' OR 1"), 'all');
  assert.equal(parseCareBasket(null), 'all');
});
