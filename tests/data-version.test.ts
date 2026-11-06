// Phiên bản dữ liệu cho cache báo cáo (lib/ops/data-version.ts): lượt đồng bộ không có gì mới thì phiên bản giữ nguyên (cache không
// mất hiệu lực), có đơn mới / đơn sửa thì phiên bản đổi ngay trong lượt đó (số trên web không đứng yên).
// D1 giả (node:sqlite) + Pancake giả; đơn không có tên, SĐT: không có dữ liệu cá nhân.
process.env.TZ = 'Asia/Ho_Chi_Minh';
import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';
import type { DatabaseSync } from 'node:sqlite';
import { emptyDb } from './support/d1-sqlite';
import { installFakeOrders, type FakeOrders } from './support/fake-orders';
import { DATA_CHANGED_KEY, isBookkeepingWrite, markDataChanged, readDataVersion, trackDataWrites } from '../lib/ops/data-version';
import { DEFAULT_BUDGET, runScheduledSync, type SyncBudget } from '../lib/pancake/sync';

const POS_ID = 'sieu-vo-gao';
const MIN = 60000;
const KEYS = ['counted_staff', 'uncounted_notes'];
let raw: DatabaseSync, db: D1Database, fake: FakeOrders, env: Cloudflare.Env;

beforeEach(() => {
  ({ raw, db } = emptyDb());
  fake = installFakeOrders('1');
  const now = new Date().toISOString();
  // Nhân viên / sản phẩm vừa đồng bộ, lịch sử đơn đã lấy đủ: lượt đồng bộ chỉ còn đơn mới/sửa và khách.
  raw.prepare("INSERT INTO pos_shops (id,name,shop_id,status,enabled,users_synced_at,products_synced_at,cursor) VALUES (?,?,'1','connected',1,?,?,?)")
    .run(POS_ID, POS_ID, now, now, JSON.stringify({ month: '2026-01', page: 1, oldestMonth: '2026-01', completed: true }));
  // Đã theo kịp tới 15 phút trước (như web đang chạy): lượt sau đọc đơn sửa từ mốc này.
  raw.prepare("UPDATE pos_shops SET last_sync_at=?,recent_watermark=?,recent_cursor='{}' WHERE id=?")
    .run(new Date(Date.now() - 15 * MIN).toISOString(), new Date(Math.floor((Date.now() - 15 * MIN) / 1000) * 1000).toISOString(), POS_ID);
  env = { DB: db, PANCAKE_POS_API_KEY: 'k' } as unknown as Cloudflare.Env;
});

const version = () => readDataVersion(db, KEYS);
const lastSync = () => (raw.prepare('SELECT last_sync_at FROM pos_shops WHERE id=?').get(POS_ID) as { last_sync_at: string | null }).last_sync_at;
const orderCount = () => Number((raw.prepare('SELECT COUNT(*) AS n FROM raw_pos_orders').get() as { n: number }).n);
const sync = (budget: SyncBudget = DEFAULT_BUDGET) => runScheduledSync(env, new Date(), 50000, budget);
const later = () => new Promise((r) => setTimeout(r, 5));

for (const [label, budget] of [
  ['ngân sách thường', DEFAULT_BUDGET],
  ['nhánh bị khoá ghi', { writesUsed: 0, backfillCap: 0, hardCap: 200000, recentPages: 3 }],
] as const) {
  void test(`${label}: lượt 0 thay đổi giữ phiên bản, đơn mới đổi phiên bản ngay lượt đó`, async () => {
    const t0 = Date.now();
    fake.orders.set(1, t0 - 10 * MIN);
    fake.orders.set(2, t0 - 9 * MIN);

    // Lượt 1: lần đầu lấy đơn → có ghi đơn → ghi mốc.
    const first = await sync(budget);
    assert.equal(first.dataChanged, true);
    assert.equal(orderCount(), 2);
    const v1 = await version();
    assert.ok(raw.prepare('SELECT value FROM app_settings WHERE key=?').get(DATA_CHANGED_KEY));

    // Lượt 2, 3: Pancake không có gì mới. Giờ đồng bộ vẫn tiến lên (thẻ "Đồng bộ lúc"), nhưng phiên bản dữ liệu giữ nguyên.
    for (let i = 0; i < 2; i++) {
      const before = lastSync();
      await later();
      const r = await sync(budget);
      assert.equal(r.dataChanged, false, `lượt ${i + 2} không đổi gì mà vẫn coi là dữ liệu đổi`);
      assert.notEqual(lastSync(), before);
      assert.deepEqual((await version()).v, v1.v);
      // Trang trạng thái đồng bộ vẫn mới mỗi lượt.
      assert.notEqual((await version()).s, v1.s);
    }

    // Lượt 4: có đơn mới → phiên bản đổi ngay trong lượt này (người mở sau tính lại từ D1).
    fake.orders.set(3, Date.now() - 2 * MIN - 1000);
    await later();
    const r4 = await sync(budget);
    assert.equal(r4.dataChanged, true);
    assert.equal(orderCount(), 3);
    const v4 = await version();
    assert.notEqual(v4.v, v1.v);

    // Lượt 5: đơn có sẵn bị sửa (giờ sửa mới) → phiên bản đổi.
    fake.edit(1, Date.now() - 2 * MIN);
    await later();
    const r5 = await sync(budget);
    assert.equal(r5.dataChanged, true);
    assert.notEqual((await version()).v, v4.v);
  });
}

void test('chưa có mốc (lần đầu lên bản): phiên bản theo giờ đồng bộ như cũ', async () => {
  raw.prepare('UPDATE pos_shops SET last_sync_at=? WHERE id=?').run('2026-11-01T00:00:00.000Z', POS_ID);
  const a = await version();
  raw.prepare('UPDATE pos_shops SET last_sync_at=? WHERE id=?').run('2026-11-01T00:05:00.000Z', POS_ID);
  assert.notEqual((await version()).v, a.v);
  await markDataChanged(db);
  const b = await version();
  raw.prepare('UPDATE pos_shops SET last_sync_at=? WHERE id=?').run('2026-11-01T00:10:00.000Z', POS_ID);
  assert.equal((await version()).v, b.v);
});

void test('POS chuyển sang lỗi hoặc hết lỗi: phiên bản đổi; khoá cấu hình ảnh hưởng số đổi: phiên bản đổi', async () => {
  await markDataChanged(db);
  const a = await version();
  raw.prepare("UPDATE pos_shops SET status='error',last_error='x' WHERE id=?").run(POS_ID);
  const b = await version();
  assert.notEqual(b.v, a.v);
  raw.prepare("UPDATE pos_shops SET status='connected',last_error=NULL WHERE id=?").run(POS_ID);
  assert.equal((await version()).v, a.v);
  raw.prepare("INSERT INTO app_settings (key,value,updated_at) VALUES ('uncounted_notes','{}','2026-11-05T01:00:00.000Z')").run();
  assert.notEqual((await version()).v, a.v);
});

void test('mỗi lần ghi mốc là một phiên bản mới, kể cả cùng mili giây', async () => {
  const at = new Date('2026-11-05T01:00:00.000Z');
  await markDataChanged(db, at);
  const a = await version();
  await markDataChanged(db, at);
  assert.notEqual((await version()).v, a.v);
});

void test('isBookkeepingWrite: chỉ mốc đồng bộ / hàng chờ là ghi sổ, ghi đơn / khách / ghi chú / số liệu là dữ liệu', () => {
  for (const sql of [
    "UPDATE pos_shops SET last_sync_at=?,status='connected',last_error=NULL,recent_watermark=?,recent_cursor=? WHERE id=?",
    'UPDATE pos_shops SET recent_watermark=?,recent_cursor=? WHERE id=?',
    '  update pos_shops set customers_synced_at=? where id=?',
    'INSERT INTO app_settings (key,value,updated_at) VALUES (?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value',
    'INSERT OR IGNORE INTO app_settings (key,value,updated_at) VALUES (?,?,?)',
    'DROP INDEX IF EXISTS idx_old',
  ]) assert.equal(isBookkeepingWrite(sql), true, sql);
  for (const sql of [
    'INSERT INTO raw_pos_orders (id) VALUES (?)',
    'UPDATE raw_pos_orders SET status=? WHERE id=?',
    'INSERT INTO customer_notes (id) VALUES (?)',
    'DELETE FROM daily_stats WHERE pos_id=?',
    'INSERT INTO sync_runs (id) VALUES (?)',
    'UPDATE pos_users SET is_active=0 WHERE pos_id=?',
    'UPDATE pos_shops_extra SET x=1',
  ]) assert.equal(isBookkeepingWrite(sql), false, sql);
});

void test('trackDataWrites: đếm theo dòng thật sự ghi, qua run / batch / first; không đổi kết quả', async () => {
  const t = trackDataWrites(db);
  // Ghi sổ có ghi dòng: chưa đổi.
  await t.db.prepare('UPDATE pos_shops SET last_sync_at=? WHERE id=?').bind('2026-11-05T00:00:00.000Z', POS_ID).run();
  assert.equal(t.changed(), false);
  // Lệnh ghi dữ liệu nhưng không trúng dòng nào: chưa đổi.
  await t.db.prepare('UPDATE pos_users SET is_active=0 WHERE pos_id=?').bind('khong-co').run();
  assert.equal(t.changed(), false);
  // Đọc: không đổi, kết quả giữ nguyên.
  const row = await t.db.prepare('SELECT id FROM pos_shops WHERE id=?').bind(POS_ID).first<{ id: string }>();
  assert.equal(row?.id, POS_ID);
  assert.equal(t.changed(), false);
  // Batch có một lệnh ghi dữ liệu thật: đổi.
  const results = await t.db.batch([
    t.db.prepare('UPDATE pos_shops SET recent_cursor=? WHERE id=?').bind('{}', POS_ID),
    t.db.prepare("INSERT INTO sync_runs (id,pos_id,started_at,finished_at,status,records,error) VALUES ('r1',?,?,?,'source_recent',1,NULL)").bind(POS_ID, 'a', 'b'),
  ]);
  assert.equal(results.length, 2);
  assert.equal(t.changed(), true);

  // first() với lệnh ghi (không biết số dòng): coi là đổi.
  const t2 = trackDataWrites(db);
  await t2.db.prepare("INSERT INTO sync_runs (id,pos_id,started_at,finished_at,status,records,error) VALUES ('r2',?,?,?,'x',0,NULL) RETURNING id").bind(POS_ID, 'a', 'b').first();
  assert.equal(t2.changed(), true);
});
