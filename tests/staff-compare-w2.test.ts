import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { after, before, test } from 'node:test';
import type { DatabaseSync } from 'node:sqlite';
import { GET } from '../app/api/reports/staff-compare/route';
import { GET as productGroups } from '../app/api/reports/product-groups/route';
import { POS } from '../lib/shared/report-model';
import { demoWorld, emptyDb } from './support/d1-sqlite';
import { loginAs } from './support/session';

const fields = ['closed', 'closedNet', 'created', 'createdClosed'] as const;
type Cell = Record<(typeof fields)[number], number> & { closeRate: number | null };
type Series = { current: number[][]; previous: number[][] };
type Row = {
  current: Cell;
  previous: Cell;
  series: Series;
  seriesRate: { current: (number | null)[]; previous: (number | null)[] };
};
type Report = {
  bucket: 'hour' | 'day';
  group: number;
  current: { total: Cell };
  previous: { total: Cell };
  staff: (Row & { sellerId: string })[];
  rowsTotal: Row;
};
type ProductReport = { staff: { sellerId: string }[]; staffTotal: { people: number } };
let raw: DatabaseSync;
let requestId = 0;
async function report(params: Record<string, string>, product = false) {
  const path = product ? 'product-groups' : 'staff-compare';
  const query = new URLSearchParams({ ...params, test: `w2-${++requestId}` });
  const response = await (product ? productGroups : GET)(
    new Request(`https://test.invalid/api/reports/${path}?${query}`),
  );
  assert.equal(response.status, 200);
  return response.json();
}

before(async () => {
  ({ raw } = await demoWorld(
    ['2026-08-01', '2026-08-02', '2026-08-03', '2026-09-01', '2026-09-02', '2026-09-03'],
    Date.parse('2026-10-14T05:00:00Z'),
  ));
  await loginAs(raw, 'owner');
});
after(() => raw.close());

// Công thức pointValue của web: tính trên số chia đã gộp, không lấy trung bình tỷ lệ.
const pointValue = (t: number[]) => t[2] ? Math.min(t[2], t[3]) / t[2] * 100 : null;
function checkRates(row: Row) {
  for (const key of ['current', 'previous'] as const) {
    assert.deepEqual(row.seriesRate[key], row.series[key].map(pointValue));
    const c = row[key];
    assert.equal(c.closeRate, pointValue([c.closed, c.closedNet, c.created, c.createdClosed]));
  }
}

function checkRowsTotal(r: Report, ids: string[]) {
  const idSet = new Set(ids);
  const rows = r.staff.filter((s) => idSet.has(s.sellerId));
  assert.equal(rows.length, ids.length);
  assert.deepEqual(new Set(r.staff.filter((s) => s.current.closed || s.current.created).map((s) => s.sellerId)), idSet);
  for (const key of ['current', 'previous'] as const) {
    // Cùng phép cộng từng ô và từng điểm với dòng Tổng trong product-group-blocks.tsx.
    for (const field of fields)
      assert.equal(r.rowsTotal[key][field], rows.reduce((sum, s) => sum + s[key][field], 0), `${key}.${field}`);
    const series = rows.reduce<number[][]>((acc, s) => {
      s.series[key].forEach((t, i) => {
        acc[i] = (acc[i] ?? [0, 0, 0, 0]).map((v, j) => v + t[j]);
      });
      return acc;
    }, []);
    assert.deepEqual(r.rowsTotal.series[key], series);
  }
  for (const s of r.staff) checkRates(s);
  checkRates(r.rowsTotal);
}

void test('W2: JSON cũ giữ nguyên; seriesRate trùng pointValue và rowsTotal khớp dòng Tổng, staffTotal.people trên demo', async () => {
  // Hash chụp từ route trước W2, trên cùng dữ liệu demo và các bộ lọc dưới đây.
  const snapshots = JSON.parse(readFileSync(
    new URL('./fixtures/staff-compare-before-w2.json', import.meta.url), 'utf8',
  )) as { params: Record<string, string>; hash: string }[];
  const buckets = new Set<string>();
  const groups = new Set<number>();
  for (const { params, hash } of snapshots) {
    const r = await report(params) as Report;
    const old = JSON.parse(JSON.stringify(r)) as {
      rowsTotal?: unknown;
      chart?: unknown;
      staff: { seriesRate?: unknown; chart?: unknown }[];
    };
    delete old.rowsTotal;
    delete old.chart;
    for (const s of old.staff) {
      delete s.seriesRate;
      delete s.chart;
    }
    assert.equal(createHash('sha256').update(JSON.stringify(old)).digest('hex'), hash, JSON.stringify(params));
    const p = await report(params, true) as ProductReport;
    checkRowsTotal(r, p.staff.map((s) => s.sellerId));
    assert.equal(p.staff.length, p.staffTotal.people);
    buckets.add(r.bucket);
    groups.add(r.group);
  }
  assert.deepEqual(buckets, new Set(['hour', 'day']));
  assert.ok(groups.has(1));
  assert.ok([...groups].some((g) => g > 1));
});

void test('W2: loại người chỉ có kỳ so và mã trống; giữ người chỉ có đơn chốt hoặc số chia, tỷ lệ có trọng số và null', async () => {
  raw.close();
  ({ raw } = emptyDb());
  await loginAs(raw, 'owner');
  const insert = (id: string, seller: string | null, created: string, closed: string | null, status = 1, pos: string = POS[0].id) => {
    raw.prepare(`INSERT INTO raw_pos_orders
      (id,pos_id,shop_id,source_order_id,seller_id,status_code,created_at,first_closed_at,net_total,tags_json,fetched_at)
      VALUES (?,?,?,?,?,?,?,?,100,'[]',?)`)
      .run(id, pos, 'fake-shop', id, seller, status, created, closed, created);
  };
  const current = '2026-09-01T03:00:00';
  const second = '2026-09-02T03:00:00';
  const previous = '2026-08-01T03:00:00';
  const earlier = '2026-07-01T03:00:00';
  insert('a-closed', 'a', current, current);
  for (let i = 0; i < 3; i++) insert(`a-open-${i}`, 'a', second, null, 0);
  for (let i = 0; i < 2; i++) insert(`b-closed-${i}`, 'b', earlier, second);
  insert('c-open', 'c', '2026-09-03T03:00:00', null, 0);
  insert('a-previous', 'a', previous, previous);
  for (let i = 0; i < 3; i++) insert(`previous-only-${i}`, 'previous-only', previous, previous);
  insert('no-id', null, current, current);
  insert('empty-id', '', current, current);
  insert('other-pos', 'other-pos', current, current, 1, POS[1].id);
  insert('deleted', 'deleted', current, null, 7);
  const params = {
    start: '2026-09-01', end: '2026-10-13', team: 'all', posIds: POS[0].id,
    mode: 'custom', cstart: '2026-08-01', cend: '2026-08-31',
  };
  const r = await report(params) as Report;
  assert.equal(r.group, 2);
  assert.equal(r.staff.length, 4);
  const p = await report(params, true) as ProductReport;
  assert.equal(p.staffTotal.people, 3);
  checkRowsTotal(r, p.staff.map((s) => s.sellerId));
  assert.deepEqual(r.rowsTotal.current, { closed: 3, closedNet: 300, created: 5, createdClosed: 1, closeRate: 20 });
  assert.deepEqual(r.rowsTotal.previous, { closed: 1, closedNet: 100, created: 1, createdClosed: 1, closeRate: 100 });
  assert.equal(r.previous.total.closed, 4);
  const a = r.staff.find((s) => s.sellerId === 'a')!;
  assert.equal(a.seriesRate.current[0], 25);
  assert.equal(a.seriesRate.current[1], null);
  assert.equal(r.staff.find((s) => s.sellerId === 'b')!.current.closeRate, null);
  assert.equal(r.staff.find((s) => s.sellerId === 'c')!.current.closeRate, 0);
  assert.equal(r.rowsTotal.series.current.length, 22);
  assert.equal(r.rowsTotal.series.previous.length, 16);
  // Lọc người vẫn giữ đúng phạm vi đã truyền; người chỉ có kỳ so không vào dòng Tổng.
  const selected = await report({ ...params, staffIds: 'a,previous-only' }) as Report;
  checkRowsTotal(selected, ['a']);
  assert.equal(selected.staff.length, 2);
  // Có người ở kỳ so nhưng kỳ hiện tại rỗng: dòng Tổng giống phép cộng [] của web.
  const empty = await report({ ...params, staffIds: 'previous-only' }) as Report;
  checkRowsTotal(empty, []);
  assert.equal(empty.staff.length, 1);
  assert.deepEqual(empty.rowsTotal.series, { current: [], previous: [] });
  assert.deepEqual(empty.rowsTotal.seriesRate, { current: [], previous: [] });
  assert.deepEqual(empty.rowsTotal.current, { closed: 0, closedNet: 0, created: 0, createdClosed: 0, closeRate: null });
  const none = await report({ ...params, staffIds: 'absent' }) as Report;
  assert.deepEqual(none.staff, []);
  checkRowsTotal(none, []);
});
