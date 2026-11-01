import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { after, before, test } from 'node:test';
import type { DatabaseSync } from 'node:sqlite';
import { env } from 'cloudflare:workers';
import { escapeLike, maskSearchTerm, orderKeys, phoneVariants, searchTermType } from '../lib/shared/search-query';
import { audit, classifyApi, scrubSearch } from '../lib/ops/audit';
import { dayData, toSourceOrder } from '../lib/demo/world';
import { emptyDb } from './support/d1-sqlite';
import { loginAs, logout } from './support/session';

let raw: DatabaseSync;
const sqls: string[] = [];
const boundSqls: { sql: string; values: unknown[] }[] = [];
const forms = ['+84 900 000 001', '84900000001', '900000001', '0900.000.001', '0900000001'];
const pos = 'thuy-san';

before(async () => {
  const setup = emptyDb({ AUTH_SECRET: 'x', REPORT_TIMEZONE: 'Asia/Ho_Chi_Minh' });
  raw = setup.raw;
  const prepare = setup.db.prepare.bind(setup.db);
  env.DB.prepare = (sql: string) => {
    sqls.push(sql);
    const stmt = prepare(sql);
    const bind = stmt.bind.bind(stmt);
    stmt.bind = (...values: unknown[]) => { boundSqls.push({ sql, values }); return bind(...values); };
    return stmt;
  };
  await loginAs(raw, 'owner');
  const insert = raw.prepare(`INSERT INTO raw_pos_orders
    (id,pos_id,shop_id,source_order_id,phone,customer_name,created_at,status_code,fetched_at)
    VALUES (?,?,?,?,?,?,?,?,?)`);
  const samples = [
    ['12345', '0900000001', 'Khách A', '2026-09-10T03:00:00', 3],
    ['AB12', '84900000001', 'Khách B', '2026-10-14T03:00:00', 0],
    ['C123', '+84900000001', 'Khách C', '2026-10-14T04:00:00', 3],
    ['12', '0900000002', 'Khách %_\\', '2026-10-14T05:00:00', 3],
  ] as const;
  for (const [id, phone, name, at, status] of samples) {
    insert.run(`${pos}:${id}`, pos, '1', id, phone, name, at, status, at);
    raw.prepare(`INSERT INTO customer_stats (id,pos_id,phone,name,updated_at) VALUES (?,?,?,?,?)`)
      .run(`${pos}:${phone}`, pos, phone, name, at);
  }
  insert.run('bio-nano:12345', 'bio-nano', '1', '12345', '0900000001', 'Khách D', '2026-10-14T03:00:00', 3, '2026-10-14T03:00:00');
});
after(() => { logout(); raw.close(); });

void test('escapeLike: thoát %, _ và dấu gạch chéo ngược, SQL chỉ khớp ký tự nguyên văn', () => {
  assert.equal(escapeLike('a%_\\b'), 'a\\%\\_\\\\b');
  for (const q of ['%', '_', '\\']) {
    const rows = raw.prepare("SELECT customer_name FROM raw_pos_orders WHERE customer_name LIKE ? ESCAPE '\\'")
      .all(`%${escapeLike(q)}%`);
    assert.equal(rows.length, 1);
  }
});

void test('phoneVariants: số trong nước, 84, +84, 9 số và dấu phân cách cùng ba biến thể', () => {
  for (const q of forms) assert.deepEqual(phoneVariants(q), ['0900000001', '84900000001', '+84900000001']);
  for (const q of ['', '1234', 'Khách A', 'Khách 900000001', '123456789012']) assert.deepEqual(phoneVariants(q), []);
});

void test('orderKeys: bỏ #, khoá chính đúng POS được cấp, mã chữ số, chặn ký tự SQL', () => {
  assert.deepEqual(orderKeys('#12345', ['p1', 'p2']), ['p1:12345', 'p2:12345']);
  assert.deepEqual(orderKeys('AB12', ['p1', 'p1']), ['p1:AB12']);
  assert.deepEqual(orderKeys('12345', []), []);
  for (const q of ['Khách A', 'Khach', '##12345', "123' OR 1=1", '%', '_', '\\']) assert.deepEqual(orderKeys(q, ['p1']), []);
});

void test('maskSearchTerm: SĐT chỉ còn ba số cuối, tên chỉ còn ký tự đầu và độ dài', () => {
  for (const q of forms) assert.equal(maskSearchTerm(q), '•••001');
  assert.equal(maskSearchTerm('Khách A'), 'K… (7 ký tự)');
  assert.equal(maskSearchTerm('  Khách A  '), 'K… (7 ký tự)');
  assert.equal(maskSearchTerm(''), '');
  assert.equal(searchTermType('0900000001'), 'phone');
  assert.equal(searchTermType('#12345'), 'order');
  assert.equal(searchTermType('Khách A'), 'name');
});

void test('classifyApi: GET tìm đơn/khách thường là search, q rỗng không thành search', () => {
  for (const path of ['/api/raw/orders', '/api/reports/customers']) {
    for (const q of ['Khách A', '#12345', '0900000001']) {
      for (const size of ['25', '199']) {
        assert.equal(classifyApi('GET', path, new URLSearchParams({ q, size }))?.action, 'search');
      }
    }
    for (const q of ['', '  ']) assert.equal(classifyApi('GET', path, new URLSearchParams({ q })), null);
    assert.equal(classifyApi('GET', path, new URLSearchParams()), null);
    assert.equal(classifyApi('GET', path, new URLSearchParams('size=20000'))?.action, 'export');
    assert.notEqual(classifyApi('POST', path, new URLSearchParams('q=x'))?.action, 'search');
  }
  assert.equal(classifyApi('GET', '/api/raw/orders/detail', new URLSearchParams('id=p1:1'))?.action, 'order.view');
});

void test('classifyApi: export được ưu tiên khi có q và vẫn giữ các ngưỡng xuất cũ', () => {
  for (const path of ['/api/raw/orders', '/api/reports/customers']) {
    for (const q of ['Khách A', '#12345', '0900000001']) {
      for (const [key, value] of [['size', '200'], ['size', '1000'], ['size', '20000'], ['limit', '1000'], ['export', '1']]) {
        assert.deepEqual(classifyApi('GET', path, new URLSearchParams({ q, [key]: value })), {
          action: 'export', target: `GET ${path}`,
        });
      }
    }
  }
  for (const path of ['/api/reports/care', '/api/reports/customers/detail', '/api/raw/orders/detail']) {
    assert.equal(classifyApi('GET', path, new URLSearchParams({ q: 'Khách A', size: '200' }))?.action, 'export');
  }
  assert.equal(classifyApi('GET', '/api/reports/overview', new URLSearchParams({ q: 'Khách A', size: '200' })), null);
  assert.equal(classifyApi('GET', '/api/reports/overview', new URLSearchParams({ q: 'Khách A', size: '1000' }))?.action, 'export');
});

void test('nhật ký search: lưu loại và từ khoá đã che, không có nguyên văn q trong audit_log', async () => {
  for (const path of ['/api/raw/orders', '/api/reports/customers']) {
    for (const q of ['Khách A', '#12345', ...forms]) {
      const p = new URLSearchParams({ q, start: '2026-10-01' });
      const kind = classifyApi('GET', path, p)!;
      const detail = scrubSearch(p.toString());
      const masked = new URLSearchParams(detail);
      assert.equal(masked.get('q'), maskSearchTerm(q));
      assert.equal(masked.get('searchType'), searchTermType(q));
      assert.equal(masked.get('start'), '2026-10-01');
      assert.ok(!detail.includes(q));
      await audit({ ...kind, detail, status: 200 });
      const row = raw.prepare('SELECT action,detail FROM audit_log ORDER BY rowid DESC LIMIT 1').get();
      assert.equal(row?.action, 'search');
      assert.equal(row?.detail, detail);
    }
  }
  const duplicate = new URLSearchParams(scrubSearch(new URLSearchParams([['q', 'Khách A'], ['q', '0900000001']]).toString()));
  assert.equal(duplicate.get('q'), maskSearchTerm('Khách A'));
  assert.equal(duplicate.get('searchType'), 'name');
  const long = new URLSearchParams(scrubSearch(new URLSearchParams({ filter: 'x'.repeat(1000), q: '0900000001', searchType: 'name' }).toString()));
  assert.equal(long.get('q'), '•••001');
  assert.equal(long.get('searchType'), 'phone');
});

const orders = async (q: string, extra: Record<string, string> = {}) => {
  const { GET } = await import('../app/api/raw/orders/route');
  const r = await GET(new Request(`https://x/api/raw/orders?${new URLSearchParams({ q, posIds: pos, ...extra })}`));
  assert.equal(r.status, 200);
  return await r.json() as { orders: { id: string; statusCode: number }[] };
};

void test('tìm đơn: mọi dạng SĐT cùng kết quả, gồm đơn tháng trước và đơn Mới; giữ lọc ngày', async () => {
  for (const q of forms) {
    const ids = (await orders(q)).orders.map((o) => o.id).sort();
    assert.deepEqual(ids, [`${pos}:12345`, `${pos}:AB12`, `${pos}:C123`]);
    assert.deepEqual((await orders(q, { start: '2026-09-01', end: '2026-09-30' })).orders.map((o) => o.id), [`${pos}:12345`]);
  }
});

void test('tìm mã đơn: id IN theo POS, mã ngắn giữ tìm đuôi SĐT, không dùng source_order_id=', async () => {
  for (const q of ['#12345', 'AB12', '12', '12345']) {
    sqls.length = 0;
    const result = await orders(q);
    assert.equal(result.orders.length, 1);
    assert.match(result.orders[0].id, new RegExp(`:${q.replace('#', '')}$`));
    const sql = sqls.find((s) => /FROM raw_pos_orders/.test(s))!;
    assert.match(sql, /id IN \(/);
    assert.doesNotMatch(sql, /source_order_id\s*=/);
  }
  assert.equal((await orders('#12345', { posIds: 'bio-nano' })).orders[0].id, 'bio-nano:12345');
  assert.equal((await orders('#12345', { start: '2026-10-01', end: '2026-10-15' })).orders.length, 0);
  assert.equal((await orders('0001')).orders.length, 3);
});

void test('tìm khách: SĐT 0, 84, +84 và 9 số cho cùng khách ở nhánh thường và theo kỳ', async () => {
  const { GET } = await import('../app/api/reports/customers/route');
  const periods: Record<string, string>[] = [{}, { start: '2026-09-01', end: '2026-10-15' }];
  for (const dates of periods) {
    const customers = async (q: string) => {
      const p = new URLSearchParams({ q, posIds: pos, ...dates });
      const res = await GET(new Request(`https://x/api/reports/customers?${p}`));
      assert.equal(res.status, 200);
      return await res.json() as { customers: { phone: string; name: string }[]; total: number };
    };
    const expected = await customers('0900000001');
    assert.equal(expected.total, 1);
    assert.deepEqual(expected.customers.map((c) => [c.phone, c.name]), [['0900000001', 'Khách A']]);
    for (const q of forms) assert.deepEqual(await customers(q), expected, `${q}, ${JSON.stringify(dates)}`);
  }
});

void test('tìm tên và ký tự đặc biệt: hai route, cả hai chế độ hồ sơ khách đều hiểu LIKE nguyên văn', async () => {
  const { GET } = await import('../app/api/reports/customers/route');
  for (const q of ['%', '_', '\\', 'Khách A']) {
    assert.equal((await orders(q)).orders.length, 1);
    const periods: Record<string, string>[] = [{}, { start: '2026-09-01', end: '2026-10-15' }];
    for (const dates of periods) {
      const p = new URLSearchParams({ q, posIds: pos, ...dates });
      const res = await GET(new Request(`https://x/api/reports/customers?${p}`));
      assert.equal(res.status, 200);
      const body = await res.json() as { customers: unknown[] };
      assert.equal(body.customers.length, 1);
    }
  }
  for (const path of ['../app/api/raw/orders/route.ts', '../app/api/reports/customers/route.ts']) {
    const source = readFileSync(new URL(path, import.meta.url), 'utf8');
    for (const match of source.matchAll(/\bLIKE\s+\?/g)) {
      assert.match(source.slice(match.index + match[0].length), /^ ESCAPE /);
    }
    assert.doesNotMatch(source, /source_order_id\s*=/);
  }
});

void test('EXPLAIN local: SQL thật tìm mã đơn dùng khoá chính, tìm SĐT dùng chỉ mục POS × SĐT', async () => {
  for (const [q, index] of [
    ['#12345', 'sqlite_autoindex_raw_pos_orders_1'],
    ['0900000001', 'idx_raw_orders_phone'],
  ] as const) {
    for (const posIds of [pos, `${pos},bio-nano`]) {
      boundSqls.length = 0;
      await orders(q, { posIds });
      const query = boundSqls.find((s) => /FROM raw_pos_orders/.test(s.sql))!;
      const plan = raw.prepare(`EXPLAIN QUERY PLAN ${query.sql}`).all(...query.values as (string | number | null)[]);
      const details = plan.map((r) => String(r.detail)).join('\n');
      assert.ok(details.includes(index), details);
      assert.doesNotMatch(details, /SCAN raw_pos_orders/);
    }
  }
});

void test('demo: có SĐT giả cố định ở đơn tháng trước và đơn Mới để QA tìm', () => {
  const now = Date.parse('2026-10-15T06:00:00Z');
  const previous = dayData(pos, '2026-09-10').orders.find((o) => o.phone === '0900000001');
  const fresh = dayData(pos, '2026-10-14').orders.find((o) => o.phone === '0900000002');
  assert.ok(previous);
  assert.ok(fresh);
  assert.equal(toSourceOrder(previous, now)?.bill_phone_number, '0900000001');
  assert.equal(toSourceOrder(fresh, now)?.status, 0);
});
