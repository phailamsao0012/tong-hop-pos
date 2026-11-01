import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { PACKED_SQL, isPacked, isWhConfirmed } from '../lib/reports/van-don';
import { demoWorld, emptyDb } from './support/d1-sqlite';
import { loginAs } from './support/session';
import { GET } from '../app/api/reports/product-groups/route';
import { POS } from '../lib/shared/report-model';

void test('R2: isPacked và PACKED_SQL cùng đúng cho mọi trạng thái và lịch sử hỏng', () => {
  const db = new DatabaseSync(':memory:');
  try {
    const cases: [number, string | null, boolean][] = [
      ...[8, 9, 2, 3, 16, 4, 15, 5].map((s): [number, string, boolean] => [s, 'hỏng', true]),
      ...[0, 7, 1, 11, 12, 13, 20, 17].map((s): [number, string, boolean] => [s, '[{"status":8}]', false]),
      [6, '[{"status":1},{"status":8},{"status":6}]', true],
      [6, '[{"status":1},{"status":6}]', false],
      [6, 'hỏng', false], [6, null, false], [6, 'null', false],
      [6, '[]', false], [6, '[8,"hỏng",null]', false],
      [6, '{"event":{"status":8}}', false],
    ];
    for (const [status_code, status_history_json, expected] of cases) {
      assert.equal(isPacked({ status_code, status_history_json }), expected);
      for (const alias of ['o', 'sample']) {
        const result = db.prepare(`SELECT ${PACKED_SQL(alias)} AS packed FROM (SELECT ? AS status_code, ? AS status_history_json) ${alias}`)
          .get(status_code, status_history_json) as { packed: number };
        assert.equal(Boolean(result.packed), expected);
      }
    }
  } finally { db.close(); }
});

type Order = { id: string; seller_id: string | null; care_id: string | null; status_code: number; status_history_json: string | null; first_confirmed_at: string | null; first_confirmed_by: string | null; first_closed_at: string | null };
type Cell = { closed: number; packed: number; packedRate: number | null; confirmedNotPacked: number; cancelledBeforePack: number; waiting: number; whConfirmed: number; whRate: number | null; selfConfirmed: number; unknownConfirmer: number; waitingUnconfirmed: number };
type Report = { total: Cell; staffTotal: Cell; staff: (Cell & { sellerId: string })[]; orders: { id: string }[]; definitions: Record<string, string> };
let serial = 0;
async function report(params: Record<string, string> = {}): Promise<Report> {
  const q = new URLSearchParams({ start: '2026-10-07', end: '2026-10-13', team: 'all', dim: 'tag', test: String(++serial), ...params });
  const response = await GET(new Request(`https://test.invalid/api/reports/product-groups?${q}`));
  assert.equal(response.status, 200);
  return response.json() as Promise<Report>;
}
function check(c: Cell, orders: Order[], by: string) {
  const packed = orders.filter(isPacked).length;
  assert.equal(c.closed, orders.length);
  assert.equal(c.packed, packed);
  assert.equal(c.packedRate, orders.length ? packed / orders.length * 100 : null);
  assert.equal(c.confirmedNotPacked, orders.filter(o => [1,11,12,13,20].includes(o.status_code)).length);
  assert.equal(c.cancelledBeforePack, orders.filter(o => o.status_code === 6 && !isPacked(o)).length);
  assert.equal(c.waiting, orders.filter(o => o.status_code === 17).length);
  const sid = (o: Order) => by === 'care' ? o.care_id || o.seller_id : o.seller_id;
  // Công thức cũ được giữ nguyên, tính độc lập với trường packed mới.
  const confirmed = orders.filter(isWhConfirmed);
  const wh = confirmed.filter(o => o.first_confirmed_by && sid(o) !== null && o.first_confirmed_by !== sid(o)).length;
  assert.equal(c.whConfirmed, wh);
  assert.equal(c.whRate, orders.length ? wh / orders.length * 100 : null);
  assert.equal(c.selfConfirmed, confirmed.filter(o => o.first_confirmed_by && o.first_confirmed_by === sid(o)).length);
  assert.equal(c.unknownConfirmer, confirmed.filter(o => !o.first_confirmed_by).length);
  assert.equal(c.waitingUnconfirmed, orders.filter(o => o.status_code === 17 && !isWhConfirmed(o)).length);
}

void test('R2: D1 giả — số mới, trường cũ, dòng tổng và packed=1 giữ mọi bộ lọc', async () => {
  const { raw } = await demoWorld(['2026-10-07','2026-10-08','2026-10-09','2026-10-10','2026-10-11','2026-10-12','2026-10-13'], Date.parse('2026-10-14T05:00:00Z'));
  try {
    await loginAs(raw, 'owner');
    const all = raw.prepare('SELECT id,seller_id,care_id,status_code,status_history_json,first_confirmed_at,first_confirmed_by,first_closed_at FROM raw_pos_orders WHERE COALESCE(first_closed_at,created_at)>=? AND COALESCE(first_closed_at,created_at)<?').all('2026-10-06T17:00:00.000Z','2026-10-13T17:00:00.000Z') as Order[];
    assert.ok(all.some(o => o.status_code === 6 && isPacked(o)), 'demo có đơn hủy sau khi vào 8');
    for (const by of ['seller', 'care']) {
      for (const dim of ['tag', 'main', 'product']) {
        for (const custom of [false, true]) {
          const params = { by, dim, ...(custom ? { status: 'c:0,1,2,3,4,5,6,7,8,9,11,12,13,15,16,17,20' } : {}) };
          const r = await report(params);
          const selected = custom ? all : all.filter(o => o.first_closed_at !== null && ![0,6,7].includes(o.status_code));
          check(r.total, selected, by);
          check(r.staffTotal, selected.filter(o => (by === 'care' ? o.care_id || o.seller_id : o.seller_id)), by);
          for (const s of r.staff) {
            const orders = selected.filter(o => (by === 'care' ? o.care_id || o.seller_id : o.seller_id) === s.sellerId);
            check(s, orders, by);
            const picked = await report({ ...params, staffId: s.sellerId, packed: '1' });
            assert.deepEqual(picked.orders.map(o => o.id).sort(), orders.filter(isPacked).map(o => o.id).sort());
            const old = await report({ ...params, staffId: s.sellerId, wh: '1' });
            assert.equal(old.orders.length, s.whConfirmed);
          }
          assert.match(r.definitions.packed, /Pancake không ghi riêng bước kho gọi khách/);
          assert.match(r.definitions.whConfirmed, /tự bấm hoặc không rõ người bấm không tính/);
        }
      }
      const r = await report({ by });
      const rates = new Set(r.staff.filter(s => s.closed).map(s => s.packedRate));
      assert.ok(rates.size > 1, 'demo có tỷ lệ khác nhau giữa người');
      assert.ok(r.staff.some(s => s.packedRate! > 0 && s.packedRate! < 100));
    }
    for (const team of ['sale','cskh']) {
      for (const dim of ['tag','main','product']) {
        const filters = { team, dim, by: team === 'cskh' ? 'care' : 'seller', posIds: POS[0].id, tag: 'BIO NANO', start: '2026-10-10', end: '2026-10-12' };
        const r = await report(filters);
        for (const s of r.staff) {
          const unfiltered = await report({ ...filters, staffId: s.sellerId });
          const expected = unfiltered.orders.filter(o => isPacked(all.find(a => a.id === o.id)!)).map(o => o.id).sort();
          const picked = await report({ ...filters, staffId: s.sellerId, packed: '1' });
          assert.equal(expected.length, s.packed);
          assert.deepEqual(picked.orders.map(o => o.id).sort(), expected);
        }
      }
    }
  } finally { raw.close(); }
});

void test('R2: không có đơn thì packedRate null', async () => {
  const { raw } = emptyDb();
  try { await loginAs(raw, 'owner'); const r = await report(); check(r.total, [], 'seller'); check(r.staffTotal, [], 'seller'); }
  finally { raw.close(); }
});
