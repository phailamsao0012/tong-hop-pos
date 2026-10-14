import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import type { DatabaseSync } from 'node:sqlite';
import { demoWorld, emptyDb } from './support/d1-sqlite';
import { loginAs } from './support/session';
import { GET } from '../app/api/reports/product-groups/route';
import { GET as vanDon } from '../app/api/reports/van-don/route';
import { POS } from '../lib/report-model';

const fields = [
  'whConfirmed',
  'selfConfirmed',
  'unknownConfirmer',
  'waiting',
] as const;
type Cell = {
  closed: number;
  closedNet: number;
  created: number;
  createdClosed: number;
  whRate: number | null;
} & Record<(typeof fields)[number], number>;
type Report = {
  total: Cell;
  staff: (Cell & { sellerId: string; byGroup: Record<string, Cell> })[];
  groups: (Cell & { label: string })[];
  orders: {
    id: string;
    status_code: number;
    first_confirmed_at: string | null;
    confirmed_at: string | null;
    confirm_by_name: string | null;
  }[];
};
let raw: DatabaseSync;
let requestId = 0;
async function report(
  params: Record<string, string> = {},
  start = '2026-10-07',
  end = '2026-10-13',
): Promise<Report> {
  const query = new URLSearchParams({
    start,
    end,
    team: 'all',
    dim: 'tag',
    ...params,
    test: String(++requestId),
  });
  const response = await GET(
    new Request(`https://test.invalid/api/reports/product-groups?${query}`),
  );
  assert.equal(response.status, 200);
  return response.json() as Promise<Report>;
}

before(async () => {
  ({ raw } = await demoWorld(
    [
      '2026-10-07',
      '2026-10-08',
      '2026-10-09',
      '2026-10-10',
      '2026-10-11',
      '2026-10-12',
      '2026-10-13',
    ],
    Date.parse('2026-10-14T05:00:00Z'),
  ));
  await loginAs(raw, 'owner');
});
after(() => raw.close());

void test('demo 7 ngày: Sale khớp Vận đơn trừ hủy sau XN; ba chế độ có cùng tổng', async () => {
  const response = await vanDon(
    new Request(
      'https://test.invalid/api/reports/van-don?start=2026-10-07&end=2026-10-13&team=all',
    ),
  );
  assert.equal(response.status, 200);
  const vd = (await response.json()) as {
    sellers: { key: string; confirmed: number; cancelledAfter: number }[];
  };
  const expected = new Map(
    vd.sellers.map((s) => [s.key, s.confirmed - s.cancelledAfter]),
  );
  const tagged = await report();
  assert.ok(tagged.staff.length > 0);
  for (const dim of ['tag', 'main', 'product']) {
    const r = await report({ dim });
    assert.deepEqual(r.total, tagged.total);
    for (const s of r.staff) {
      assert.equal(s.whConfirmed, expected.get(s.sellerId) ?? 0);
      assert.equal(s.whConfirmed + s.waiting, s.closed);
      assert.equal(
        s.whRate,
        s.closed ? (s.whConfirmed / s.closed) * 100 : null,
      );
      for (const g of Object.values(s.byGroup))
        for (const f of fields) assert.equal(g[f], 0);
    }
    for (const f of fields)
      assert.equal(
        r.total[f],
        r.staff.reduce((n, s) => n + s[f], 0),
      );
  }
});

void test('demo: CSKH tính theo care_id; danh sách wh=1 giữ POS, ngày, team và thẻ', async () => {
  const r = await report({ by: 'care' });
  assert.equal(r.total.whConfirmed, (await report()).total.whConfirmed);
  for (const s of r.staff) {
    const expected = raw
      .prepare(
        `SELECT COUNT(*) AS n FROM raw_pos_orders WHERE COALESCE(NULLIF(care_id,''),seller_id)=? AND first_closed_at>=? AND first_closed_at<? AND status_code NOT IN (0,6,7) AND (first_confirmed_at IS NOT NULL OR status_code NOT IN (17,6))`,
      )
      .get(
        s.sellerId,
        '2026-10-06T17:00:00.000Z',
        '2026-10-13T17:00:00.000Z',
      ) as { n: number };
    assert.equal(s.whConfirmed, expected.n);
    const list = await report({ by: 'care', staffId: s.sellerId, wh: '1' });
    assert.equal(list.orders.length, s.whConfirmed);
    assert.equal(
      new Set(list.orders.map((o) => o.id)).size,
      list.orders.length,
    );
  }
  for (const team of ['all', 'sale', 'cskh']) {
    for (const dim of ['tag', 'main', 'product']) {
      const filters = {
        team,
        dim,
        posIds: POS[0].id,
        tag: 'BIO NANO',
        by: team === 'cskh' ? 'care' : 'seller',
      };
      const filtered = await report(filters, '2026-10-10', '2026-10-12');
      for (const s of filtered.staff) {
        const list = await report(
          { ...filters, staffId: s.sellerId, wh: '1' },
          '2026-10-10',
          '2026-10-12',
        );
        assert.equal(list.orders.length, s.whConfirmed);
      }
    }
  }
});

void test('đơn hai thẻ chỉ cộng XN một lần; tự XN theo người của trang; tên người XN không nhân đôi', async () => {
  raw.close();
  ({ raw } = emptyDb());
  await loginAs(raw, 'owner');
  const at = '2026-10-12T03:00:00.000Z',
    confirmed = '2026-10-12T04:00:00.000Z';
  for (const [id, status, time, confirmer] of [
    ['two-tags', 1, confirmed, 'care'],
    ['unknown', 2, null, ''],
    ['waiting', 17, null, null],
    ['cancelled-after', 6, confirmed, 'warehouse'],
    ['cancelled-before', 6, null, null],
    ['new', 0, confirmed, 'warehouse'],
    ['deleted', 7, confirmed, 'warehouse'],
  ] as const) {
    raw
      .prepare(
        `INSERT INTO raw_pos_orders (id,pos_id,shop_id,source_order_id,seller_id,care_id,status_code,created_at,first_closed_at,first_confirmed_at,first_confirmed_by,tags_json,net_total,fetched_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      )
      .run(
        id,
        POS[0].id,
        'fake-shop',
        id,
        'seller',
        'care',
        status,
        at,
        at,
        time,
        confirmer,
        JSON.stringify([{ name: 'BIO NANO' }, { name: 'COMBO' }]),
        100,
        at,
      );
    raw
      .prepare(
        `INSERT INTO raw_pos_order_items (id,order_id,pos_id,name,quantity,is_bonus) VALUES (?,?,?,?,1,0)`,
      )
      .run(`item-${id}`, id, POS[0].id, 'BIO NANO SHIELD');
  }
  for (const [i, pos] of POS.slice(0, 2).entries())
    raw
      .prepare(
        `INSERT INTO pos_users (id,pos_id,user_id,name,fetched_at) VALUES (?,?,?,?,?)`,
      )
      .run(`fake-care-${i}`, pos.id, 'care', 'Người chăm sóc demo', at);
  for (const dim of ['tag', 'main', 'product']) {
    const seller = await report({ dim });
    assert.equal(seller.total.closed, 3);
    assert.equal(seller.total.whConfirmed, 2);
    assert.equal(seller.total.selfConfirmed, 0);
    assert.equal(seller.total.unknownConfirmer, 1);
    assert.equal(seller.total.waiting, 1);
    const care = await report({ dim, by: 'care' });
    assert.equal(care.total.selfConfirmed, 1);
    for (const g of Object.values(care.staff[0].byGroup))
      for (const f of fields) assert.equal(g[f], 0);
  }
  const list = await report({ staffId: 'care', by: 'care', wh: '1' });
  assert.deepEqual(list.orders.map((o) => o.id).sort(), [
    'two-tags',
    'unknown',
  ]);
  const twoTags = list.orders.find((o) => o.id === 'two-tags')!;
  assert.equal(twoTags.first_confirmed_at, at);
  assert.equal(twoTags.confirmed_at, confirmed);
  assert.equal(twoTags.confirm_by_name, 'Người chăm sóc demo');
  assert.equal(list.orders.find((o) => o.id === 'unknown')!.confirmed_at, null);
  assert.equal(
    (await report({ staffId: 'care', by: 'care', wh: '1', group: 'COMBO' }))
      .orders.length,
    2,
  );
  for (const dim of ['tag', 'main', 'product']) {
    const custom = await report({ dim, status: 'c:0,1,2,6,7,17' });
    assert.equal(custom.total.closed, 7);
    assert.equal(custom.total.whConfirmed, 3);
    const picked = await report({
      dim,
      status: 'c:0,1,2,6,7,17',
      staffId: 'seller',
      wh: '1',
    });
    assert.deepEqual(picked.orders.map((o) => o.id).sort(), [
      'cancelled-after',
      'two-tags',
      'unknown',
    ]);
  }
  const empty = await report({ status: 'new', posIds: POS[1].id });
  assert.equal(empty.total.whRate, null);
});
