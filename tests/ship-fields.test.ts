import assert from 'node:assert/strict';
import { test } from 'node:test';
import { shipFields, normalizeProvince, returnReasonOf, RETURN_REASONS, PARTNER_STATUS_LABELS } from '../lib/ship-fields';
import { orderStatements } from '../lib/sync';
import { fillShipFieldsMonth, shipFieldsReady, SHIP_FIELDS_READY_KEY } from '../lib/stats';
import { emptyDb, demoWorld } from './support/d1-sqlite';

void test('shipFields: đủ trường, thiếu partner, chuỗi trắng và ba tiền tố tỉnh', () => {
  assert.deepEqual(shipFields({}), { carrier: null, province: null, partnerStatus: null, undeliverableAt: null, returnedReason: null });
  assert.deepEqual(shipFields({ partner: { partner_name: ' Hãng A Express ', partner_status: ' undeliverable ', first_undeliverable_at: ' 2026-10-12T00:00:00 ' }, shipping_address: { province_name: 'Tỉnh Nghệ An' }, returned_reason: 1 }), { carrier: 'Hãng A Express', province: 'Nghệ An', partnerStatus: 'undeliverable', undeliverableAt: '2026-10-12T00:00:00', returnedReason: RETURN_REASONS[1] });
  for (const prefix of ['Tỉnh ', 'Thành phố ', 'TP. ']) assert.equal(normalizeProvince(prefix + 'Hà Nội'), 'Hà Nội');
  assert.equal(normalizeProvince('   '), null);
  assert.equal(shipFields({ partner: { partner_name: ' ', partner_status: '', first_undeliverable_at: ' ' } }).carrier, null);
  assert.equal(Object.keys(PARTNER_STATUS_LABELS).length, 20);
});

void test('returnReasonOf: tên ưu tiên, mã 1–5, mã lạ và thiếu lý do', () => {
  assert.equal(returnReasonOf({ returned_reason_name: ' Lý do mẫu ', returned_reason: 1 }), 'Lý do mẫu');
  for (let i = 1; i <= 5; i++) assert.equal(returnReasonOf({ returned_reason: i, returned_reason_name: ' ' }), RETURN_REASONS[i]);
  assert.equal(returnReasonOf({ returned_reason: 9 }), 'Lý do số 9');
  assert.equal(returnReasonOf({}), null);
});

void test('orderStatements: ghi năm cột, giữ giờ sớm nhất và hãng khi nguồn thiếu partner', async () => {
  const { raw, db } = emptyDb();
  try {
    const order = { id: 1, status: 2, inserted_at: '2026-10-10T00:00:00', partner: { partner_name: 'Hãng A Express', partner_status: 'undeliverable', first_undeliverable_at: '2026-10-12T00:00:00' }, shipping_address: { province_name: 'TP. Hà Nội' }, returned_reason: 9 };
    await db.batch(orderStatements(db, 'demo', '1', order, '2026-10-15T00:00:00'));
    const read = () => raw.prepare('SELECT carrier_name,province_name,partner_status,first_undeliverable_at,returned_reason FROM raw_pos_orders').get();
    assert.deepEqual({ ...read() }, { carrier_name: 'Hãng A Express', province_name: 'Hà Nội', partner_status: 'undeliverable', first_undeliverable_at: '2026-10-12T00:00:00', returned_reason: 'Lý do số 9' });
    await db.batch(orderStatements(db, 'demo', '1', { ...order, partner: { ...order.partner, first_undeliverable_at: '2026-10-13T00:00:00' } }, '2026-10-15T00:00:00'));
    await db.batch(orderStatements(db, 'demo', '1', { id: 1 }, '2026-10-15T00:00:00'));
    assert.equal(read()?.carrier_name, 'Hãng A Express');
    assert.equal(read()?.first_undeliverable_at, '2026-10-12T00:00:00');
  } finally { raw.close(); }
});

void test('fillShipFieldsMonth: JSON nguồn, thiếu hãng, JSON hỏng, ngoài phạm vi và chạy lại', async () => {
  const { raw, db } = emptyDb();
  try {
    const sources = [JSON.stringify({ partner: { partner_name: ' Hãng B Post ', partner_status: ' undeliverable ', first_undeliverable_at: '2026-10-12T00:00:00' }, shipping_address: { province_name: 'Thành phố Hà Nội' }, returned_reason: 9 }), '{}', '{hỏng'];
    sources.forEach((json, i) => raw.prepare('INSERT INTO raw_pos_orders (id,pos_id,shop_id,source_order_id,created_at,first_sent_at,fetched_at,raw_json) VALUES (?,?,?,?,?,?,?,?)').run(String(i), 'demo', '1', String(i), '2026-10-10T00:00:00', '2026-10-11T00:00:00', '2026-10-15T00:00:00', json));
    assert.deepEqual(await fillShipFieldsMonth(db, 'demo', '2026-09'), { writes: 0, done: true });
    assert.deepEqual(await fillShipFieldsMonth(db, 'demo', '2026-10'), { writes: 3, done: true });
    const rows = raw.prepare('SELECT * FROM raw_pos_orders ORDER BY id').all();
    assert.equal(rows[0].carrier_name, 'Hãng B Post');
    assert.equal(rows[0].province_name, 'Hà Nội');
    assert.equal(rows[0].returned_reason, 'Lý do số 9');
    assert.equal(rows[0].first_undeliverable_at, '2026-10-12T00:00:00');
    assert.equal(rows[1].carrier_name, '');
    assert.equal(rows[2].carrier_name, '');
    assert.deepEqual(await fillShipFieldsMonth(db, 'demo', '2026-10'), { writes: 0, done: true });
    assert.equal(await shipFieldsReady(db), false);
    raw.prepare('INSERT INTO app_settings (key,value,updated_at) VALUES (?,?,?)').run(SHIP_FIELDS_READY_KEY, '1', '2026-10-15');
    assert.equal(await shipFieldsReady(db), true);
  } finally { raw.close(); }
});

void test('demoWorld bảy ngày: có giao thất bại, lý do hoàn, ít nhất ba hãng và năm tỉnh', async () => {
  const days = Array.from({ length: 7 }, (_, i) => `2026-10-${String(9 + i).padStart(2, '0')}`);
  const { raw } = await demoWorld(days, Date.parse('2026-10-16T12:00:00Z'));
  try {
    const count = (where: string) => Number(raw.prepare(`SELECT COUNT(*) AS n FROM raw_pos_orders WHERE ${where}`).get()?.n);
    assert.ok(count('status_code=2 AND first_undeliverable_at IS NOT NULL') > 0);
    assert.ok(count('status_code IN (4,5) AND returned_reason IS NOT NULL') > 0);
    assert.ok(raw.prepare('SELECT DISTINCT carrier_name FROM raw_pos_orders WHERE carrier_name IS NOT NULL').all().length >= 3);
    assert.ok(raw.prepare('SELECT DISTINCT province_name FROM raw_pos_orders WHERE province_name IS NOT NULL').all().length >= 5);
  } finally { raw.close(); }
});

void test('fillShipFieldsMonth: khớp hàm thuần cho tiền tố tỉnh và lý do, chỉ chọn đúng POS và đơn đã gửi', async () => {
  const { raw, db } = emptyDb();
  try {
    const sources = Array.from({ length: 6 }, (_, i) => ({
      partner: { partner_name: ' Hãng C Fast ', partner_status: ' delivered ' },
      shipping_address: { province_name: ['Tỉnh Hà Nội', 'Thành phố Hà Nội', 'TP. Hà Nội'][i % 3] },
      returned_reason: i + 1,
      returned_reason_name: i === 5 ? ' Lý do mẫu ' : ' ',
    }));
    for (const [i, source] of sources.entries()) {
      raw.prepare('INSERT INTO raw_pos_orders (id,pos_id,shop_id,source_order_id,created_at,first_sent_at,fetched_at,raw_json) VALUES (?,?,?,?,?,?,?,?)')
        .run(String(i), 'demo', '1', String(i), '2026-10-10T00:00:00', '2026-10-11T00:00:00', '2026-10-15', JSON.stringify(source));
    }
    raw.exec("UPDATE raw_pos_orders SET pos_id='other' WHERE id='4'; UPDATE raw_pos_orders SET first_sent_at=NULL WHERE id='5'");
    assert.deepEqual(await fillShipFieldsMonth(db, 'demo', '2026-10', 0), { writes: 0, done: false });
    assert.deepEqual(await fillShipFieldsMonth(db, 'demo', '2026-10'), { writes: 4, done: true });
    for (let i = 0; i < 4; i++) {
      const row = raw.prepare('SELECT * FROM raw_pos_orders WHERE id=?').get(String(i));
      const expected = shipFields(sources[i]);
      assert.equal(row?.province_name, expected.province);
      assert.equal(row?.returned_reason, expected.returnedReason);
      assert.equal(row?.partner_status, expected.partnerStatus);
    }
    assert.equal(raw.prepare("SELECT carrier_name FROM raw_pos_orders WHERE id='4'").get()?.carrier_name, null);
    assert.equal(raw.prepare("SELECT carrier_name FROM raw_pos_orders WHERE id='5'").get()?.carrier_name, null);
  } finally { raw.close(); }
});
