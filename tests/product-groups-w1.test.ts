import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { after, before, test } from 'node:test';
import type { DatabaseSync } from 'node:sqlite';
import { GET } from '../app/api/reports/product-groups/route';
import { dayData, toSourceOrder } from '../lib/demo/world';
import { POS } from '../lib/report-model';
import { demoWorld, emptyDb } from './support/d1-sqlite';
import { loginAs } from './support/session';

const added = [
  'warehouseConfirmed', 'otherUnconfirmed', 'closedFromCreated',
  'closedFromEarlier', 'createdOpen', 'backToWaiting',
] as const;
const counts = [
  'closed', 'closedNet', 'created', 'createdClosed', 'whConfirmed',
  'selfConfirmed', 'unknownConfirmer', 'waiting', 'waitingUnconfirmed',
  ...added,
] as const;
type Cell = Record<(typeof counts)[number], number> & {
  closeRate: number | null;
  whRate: number | null;
  aov: number | null;
};
type Report = {
  total: Cell;
  staff: (Cell & { sellerId: string })[];
  staffTotal: Cell & { people: number };
  definitions: Record<string, string>;
  orders: { id: string; status_code: number; confirmed_at: string | null }[] | null;
};
let raw: DatabaseSync;
let requestId = 0;
async function report(params: Record<string, string> = {}): Promise<Report> {
  const query = new URLSearchParams({
    start: '2026-10-12', end: '2026-10-13', team: 'all', dim: 'tag',
    ...params, test: `w1-${++requestId}`,
  });
  const response = await GET(new Request(`https://test.invalid/api/reports/product-groups?${query}`));
  assert.equal(response.status, 200);
  return response.json() as Promise<Report>;
}

before(async () => {
  ({ raw } = await demoWorld(
    ['2026-10-12', '2026-10-13'], Date.parse('2026-10-14T05:00:00Z'),
  ));
  await loginAs(raw, 'owner');
});
after(() => raw.close());

function checkSplits(s: Cell) {
  for (const key of added) assert.equal(typeof s[key], 'number', key);
  assert.equal(s.warehouseConfirmed, s.whConfirmed);
  assert.equal(s.backToWaiting, s.waiting - s.waitingUnconfirmed);
  assert.equal(s.otherUnconfirmed, Math.max(0,
    s.closed - s.whConfirmed - s.selfConfirmed - s.unknownConfirmer -
      (s.waiting - s.backToWaiting),
  ));
  assert.equal(
    s.warehouseConfirmed + s.selfConfirmed + s.unknownConfirmer +
      (s.waiting - s.backToWaiting) + s.otherUnconfirmed,
    s.closed,
  );
  assert.equal(s.closedFromCreated, Math.min(s.closed, s.createdClosed));
  assert.equal(s.closedFromEarlier, Math.max(0, s.closed - s.createdClosed));
  assert.equal(s.createdOpen, Math.max(0, s.created - s.createdClosed));
}

function checkTotal(r: Report) {
  const t = r.staffTotal;
  assert.equal(t.people, r.staff.length);
  for (const key of counts)
    assert.equal(t[key], r.staff.reduce((n, s) => n + s[key], 0), key);
  // Cùng công thức dòng Tổng của bảng web, không lấy trung bình tỷ lệ từng người.
  assert.equal(t.whRate, t.closed ? t.whConfirmed / t.closed * 100 : null);
  assert.equal(t.closeRate, t.created ? Math.min(t.created, t.createdClosed) / t.created * 100 : null);
  assert.equal(t.aov, t.closed ? t.closedNet / t.closed : null);
}

const canonical = (v: unknown): unknown =>
  Array.isArray(v) ? v.map(canonical) : v && typeof v === 'object'
    ? Object.fromEntries(Object.entries(v)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, x]) => [k, canonical(x)])) : v;

void test('W1: JSON demo bỏ trường mới khớp nguyên bản sau X1 ở mọi dim và bộ lọc', async () => {
  // Chụp trước khi sửa route W1, trên cùng dữ liệu demo có đơn quay lại Chờ xác nhận.
  // SHA-256 của toàn bộ JSON chuẩn hóa, gồm cả definitions cũ và các nhóm.
  const snapshots = JSON.parse(readFileSync(
    new URL('./fixtures/product-groups-after-x1.json', import.meta.url), 'utf8',
  )) as { params: Record<string, string>; hash: string }[];
  for (const { params, hash } of snapshots) {
    const r = await report(params);
    const old = JSON.parse(JSON.stringify(r)) as {
      staffTotal?: unknown;
      staff: Record<string, unknown>[];
      definitions: Record<string, unknown>;
    };
    delete old.staffTotal;
    for (const s of old.staff) for (const key of added) delete s[key];
    for (const key of [...added, 'staffTotal']) delete old.definitions[key];
    assert.equal(createHash('sha256').update(JSON.stringify(canonical(old))).digest('hex'), hash, JSON.stringify(params));
    for (const s of r.staff) checkSplits(s);
    checkTotal(r);
  }
});

void test('W1: đơn demo trạng thái 17 đã XN kho không cộng hai lần ở mọi dim và cách tính người', async () => {
  const sample = dayData('thuy-san', '2026-10-12').orders.find((o) => o.phone === '0900000003')!;
  assert.ok(sample);
  const source = toSourceOrder(sample, Date.parse('2026-10-14T05:00:00Z'))!;
  assert.equal(source.status, 17);
  assert.deepEqual(source.status_history!.map((h) => h.status), [0, 17, 1, 17]);
  const stored = raw.prepare('SELECT first_confirmed_at,first_confirmed_by FROM raw_pos_orders WHERE id=?')
    .get(`thuy-san:${sample.orderId}`) as { first_confirmed_at: string; first_confirmed_by: string };
  assert.ok(stored.first_confirmed_at);
  assert.notEqual(stored.first_confirmed_by, sample.sellerId);
  for (const dim of ['tag', 'main', 'product']) for (const by of ['seller', 'care']) {
    const r = await report({ dim, by });
    const s = r.staff.find((s) => s.sellerId === sample.sellerId)!;
    assert.ok(s.backToWaiting >= 1);
    checkSplits(s);
    checkTotal(r);
    const list = await report({ dim, by, staffId: s.sellerId, wh: '1' });
    assert.ok(list.orders!.some((o) => o.id === `thuy-san:${sample.orderId}` && o.status_code === 17 && o.confirmed_at));
    assert.match(r.definitions.backToWaiting, /waiting vẫn đếm mọi đơn 17/);
    assert.match(r.definitions.otherUnconfirmed, /selfConfirmed.*unknownConfirmer/);
  }
});

void test('W1: tổng chỉ cộng người có mã; các phép min/max cộng theo từng người', async () => {
  raw.close();
  ({ raw } = emptyDb());
  await loginAs(raw, 'owner');
  const inside = '2026-10-12T03:00:00.000Z';
  const earlier = '2026-10-01T03:00:00.000Z';
  const later = '2026-10-20T03:00:00.000Z';
  const rows = [
    ['a-closed', 'a', 1, inside, inside, 'warehouse', inside],
    ['a-later-1', 'a', 1, inside, later, 'warehouse', later],
    ['a-later-2', 'a', 1, inside, later, 'warehouse', later],
    ['b-earlier-1', 'b', 17, earlier, inside, 'warehouse', inside],
    ['b-earlier-2', 'b', 1, earlier, inside, 'b', inside],
    ['b-back-self', 'b', 17, earlier, inside, 'b', inside],
    ['b-back-unknown', 'b', 17, earlier, inside, null, inside],
    ['b-pending', 'b', 17, earlier, inside, null, null],
    ['b-unknown', 'b', 2, earlier, inside, null, null],
    ['b-open', 'b', 0, inside, null, null, null],
    ['no-id', null, 1, inside, inside, null, inside],
    ['empty-id', '', 17, inside, inside, null, null],
  ] as const;
  for (const [id, seller, status, created, closed, confirmer, confirmed] of rows) {
    raw.prepare(`INSERT INTO raw_pos_orders
      (id,pos_id,shop_id,source_order_id,seller_id,status_code,created_at,first_closed_at,first_confirmed_at,first_confirmed_by,tags_json,net_total,fetched_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`)
      .run(id, POS[0].id, 'fake-shop', id, seller, status, created, closed, confirmed, confirmer,
        '[{"name":"BIO NANO"},{"name":"COMBO"}]', 100, inside);
    raw.prepare('INSERT INTO raw_pos_order_items (id,order_id,pos_id,name,quantity,is_bonus) VALUES (?,?,?,?,1,0)')
      .run(`item-${id}`, id, POS[0].id, 'BIO NANO SHIELD');
  }
  for (const dim of ['tag', 'main', 'product']) {
    const r = await report({ dim });
    assert.equal(r.staffTotal.people, 2);
    assert.equal(r.total.closed, 9);
    assert.equal(r.staffTotal.closed, 7);
    assert.equal(r.staffTotal.created, 4);
    assert.equal(r.staffTotal.createdClosed, 3);
    assert.equal(r.staffTotal.closedFromCreated, 1);
    assert.equal(r.staffTotal.closedFromEarlier, 6);
    assert.equal(r.staffTotal.createdOpen, 1);
    const b = r.staff.find((s) => s.sellerId === 'b')!;
    assert.equal(b.warehouseConfirmed, 1);
    assert.equal(b.selfConfirmed, 2);
    assert.equal(b.unknownConfirmer, 2);
    assert.equal(b.waiting, 4);
    assert.equal(b.backToWaiting, 3);
    for (const s of r.staff) checkSplits(s);
    checkTotal(r);
    const custom = await report({ dim, status: 'c:0,1,17' });
    assert.equal(custom.staffTotal.otherUnconfirmed, 1);
    for (const s of custom.staff) checkSplits(s);
    checkTotal(custom);
    const empty = await report({ dim, posIds: POS[1].id });
    assert.deepEqual(empty.staff, []);
    assert.equal(empty.staffTotal.people, 0);
    checkTotal(empty);
    for (const key of counts) assert.equal(empty.staffTotal[key], 0, key);
  }
});
