// Che SĐT khách theo vai trò ở máy chủ (lib/auth/phone-privacy.ts): chủ hệ thống, giám đốc thấy đủ; trưởng nhóm, nhân viên chỉ thấy
// 3 số cuối ở mọi báo cáo khách, và vẫn mở được hồ sơ khách bằng mã tham chiếu. Số liệu demo + SĐT giả, không có dữ liệu thật.
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import type { DatabaseSync } from 'node:sqlite';
import { env } from 'cloudflare:workers';
import { demoWorld } from './support/d1-sqlite';
import { loginAs, logout } from './support/session';
import { openPhoneRef, phonePseudonym, phoneRef, redactPhones } from '../lib/auth/phone-privacy';

const DAYS = ['2026-09-29', '2026-09-30', '2026-10-01'];
/** SĐT đầy đủ (VN) lẫn ở bất cứ đâu trong thân phản hồi. */
const FULL_PHONE = /(?<![\d+])(?:\+?84|0)\d{8,10}(?!\d)/;
const FAKE = ['0901000001', '0901000002'];
let raw: DatabaseSync, posId: string, authorId: string;

before(async () => {
  ({ raw } = await demoWorld(DAYS, Date.parse('2026-10-02T05:00:00Z')));
  Object.assign(env as object, { AUTH_SECRET: 'test-only-secret' });
  // Một nhân viên CSKH (trang Khách theo nhân viên chỉ lấy khách giao cho CSKH).
  const o = raw.prepare("SELECT u.pos_id, u.user_id FROM pos_users u JOIN hr_pos_team t ON t.pos_user_id=u.user_id WHERE t.team='cskh' LIMIT 1").get() as { pos_id: string; user_id: string };
  posId = o.pos_id; authorId = o.user_id;
  // Giờ lưu kiểu Pancake (UTC, không hậu tố Z) như ghi chú thật.
  const now = '2026-10-01T03:00:00.000';
  // Khách CSKH + ghi chú có SĐT lẫn trong chữ (Khách theo nhân viên, Lịch sử cuộc gọi).
  FAKE.forEach((phone, i) => {
    raw.prepare("INSERT INTO pos_customers (id,pos_id,customer_id,name,phone,phones_json,assigned_user_id,fetched_at,note_count,last_note_at) VALUES (?,?,?,?,?,?,?,?,1,?)")
      .run(`${posId}:c${i}`, posId, `c${i}`, `Khách thử ${i}`, phone, JSON.stringify([phone]), authorId, now, now);
    raw.prepare("INSERT INTO customer_notes (id,pos_id,customer_id,phone,author_id,author_name,message,created_at,fetched_at,source) VALUES (?,?,?,?,?,?,?,?,?,'customer')")
      .run(`n${i}`, posId, `c${i}`, phone, authorId, 'NV thử', `Gọi lại số ${phone} chiều nay`, now, now);
  });
});
after(logout);

type Role = 'owner' | 'director' | 'lead' | 'staff';
const ALL_VIEWS = ['customers', 'care', 'calls', 'raw-orders', 'custom', 'repurchase', 'customer360', 'cskh-overview'];
const call = async (role: Role, mod: string, url: string, opts: { posIds?: string[] } = {}) => {
  await loginAs(raw, role, { views: ALL_VIEWS, posIds: opts.posIds });
  const { GET } = await import(mod) as { GET: (r: Request) => Promise<Response> };
  const res = await GET(new Request(`https://x${url}`));
  return { status: res.status, text: await res.text() };
};

const ROUTES: [string, string, () => string][] = [
  ['Hồ sơ khách (top trong kỳ)', '../app/api/reports/customers/route', () => `/api/reports/customers?start=${DAYS[0]}&end=${DAYS[2]}&size=50`],
  ['Khách theo nhân viên', '../app/api/reports/care/route', () => `/api/reports/care?posIds=${posId}`],
  ['Lịch sử cuộc gọi', '../app/api/reports/calls/history/route', () => `/api/reports/calls/history?authorId=${encodeURIComponent(authorId)}&start=2026-10-01&end=2026-10-01&posIds=${posId}`],
  ['Đơn nguồn', '../app/api/raw/orders/route', () => `/api/raw/orders?posIds=${posId}`],
  ['Chi tiết đơn nguồn', '../app/api/raw/orders/detail/route', () => `/api/raw/orders/detail?id=${encodeURIComponent(firstOrderId())}`],
  ['Báo cáo tuỳ chỉnh (dữ liệu)', '../app/api/data/route', () => '/api/data'],
];
const otherPos = () => (raw.prepare('SELECT id FROM pos_shops WHERE id<>? LIMIT 1').get(posId) as { id: string }).id;
const firstPhone = () => (raw.prepare('SELECT phone FROM raw_pos_orders WHERE pos_id=? AND phone IS NOT NULL LIMIT 1').get(posId) as { phone: string }).phone;
const firstOrderId = () => (raw.prepare('SELECT id FROM raw_pos_orders WHERE pos_id=? AND phone IS NOT NULL LIMIT 1').get(posId) as { id: string }).id;

// Anh Vũ 06/11/2026: CSKH và trưởng nhóm "cho thấy đủ chứ" (để gọi từ web): mọi vai trò thấy đủ SĐT khách.
for (const [label, mod, url] of ROUTES) {
  void test(`${label}: mọi vai trò thấy đủ SĐT (anh Vũ 06/11/2026)`, async () => {
    // /api/data đọc bảng nhập tay (rỗng trong dữ liệu demo): chỉ kiểm không bị chặn.
    for (const role of ['owner', 'director', 'lead', 'staff'] as const) {
      const r = await call(role, mod, url());
      assert.equal(r.status, 200, `${role} ${r.text.slice(0, 200)}`);
      if (!mod.endsWith('/data/route')) assert.match(r.text, FULL_PHONE, `${label}: ${role} phải thấy đủ SĐT`);
    }
  });
}

void test('hồ sơ khách: nhân viên mở bằng SĐT và mã tham chiếu; POS ngoài phạm vi bị chặn; mã hỏng bị từ chối', async () => {
  const list = JSON.parse((await call('staff', '../app/api/reports/customers/route', ROUTES[0][2]())).text) as { customers: { phone: string; phoneRef?: string; posId: string }[] };
  const c = list.customers.find((x) => x.posId === posId)!;
  for (const role of ['owner', 'director', 'lead', 'staff'] as const) {
    const full = await call(role, '../app/api/reports/customers/detail/route', `/api/reports/customers/detail?posId=${posId}&phone=${firstPhone()}`);
    assert.equal(full.status, 200, role);
    assert.match(full.text, FULL_PHONE);
  }
  const other = await call('staff', '../app/api/reports/customers/detail/route', `/api/reports/customers/detail?posId=${posId}&phone=${firstPhone()}`, { posIds: ['pos-khac'] });
  assert.equal(other.status, 403);
  if (c.phoneRef) {
    const bad = await call('staff', '../app/api/reports/customers/detail/route', `/api/reports/customers/detail?ref=${encodeURIComponent(c.phoneRef.slice(0, -2) + 'AA')}`);
    assert.equal(bad.status, 400);
  }
});

void test('Báo cáo tuỳ chỉnh: chỉ dữ liệu POS của tài khoản; SĐT đủ', async () => {
  const now = '2026-10-01T03:00:00.000Z';
  raw.prepare("INSERT INTO assignments (id,pos_id,phone,employee_id,assigned_at,batch_id) VALUES ('a1',?,?,?,?,'b'),('a2',?,?,?,?,'b')").run(posId, FAKE[0], authorId, now, otherPos(), FAKE[1], authorId, now);
  try {
    const staff = JSON.parse((await call('staff', '../app/api/data/route', '/api/data', { posIds: [posId] })).text) as { assignments: { posId: string; phone: string }[] };
    assert.deepEqual(staff.assignments.map((a) => a.posId), [posId]);
    assert.equal(staff.assignments[0].phone, FAKE[0]);
    const owner = JSON.parse((await call('owner', '../app/api/data/route', '/api/data')).text) as { assignments: { phone: string }[] };
    assert.deepEqual(owner.assignments.map((a) => a.phone).sort(), [...FAKE].sort());
  } finally { raw.exec("DELETE FROM assignments WHERE id IN ('a1','a2')"); }
});

void test('redactPhones: trường SĐT, danh sách SĐT, SĐT lẫn trong chữ; giữ nguyên đường dẫn và số tiền', async () => {
  const out = await redactPhones({ rows: [{ posId: 'p', phone: FAKE[0], phones: [FAKE[1]], note: `gọi ${FAKE[1]}`, orderLink: `https://x/?q=${FAKE[0]}`, net: 1000 }] });
  const row = out.rows[0] as Record<string, unknown>;
  assert.equal(row.phone, '•••••••001');
  assert.deepEqual(row.phones, ['•••••••002']);
  assert.equal(row.note, 'gọi •••002');
  assert.equal(row.orderLink, `https://x/?q=${FAKE[0]}`);
  assert.equal(row.net, 1000);
  assert.deepEqual(await openPhoneRef(row.phoneRef as string), { posId: 'p', phone: FAKE[0] });
  assert.equal(await openPhoneRef('khong-hop-le'), null);
  assert.notEqual(await phoneRef('p', FAKE[0]), await phoneRef('p', FAKE[0]), 'mã tham chiếu không lặp lại (không dò ngược được)');
  assert.equal(await phonePseudonym(FAKE[0]), await phonePseudonym(FAKE[0]));
  assert.notEqual(await phonePseudonym(FAKE[0]), await phonePseudonym(FAKE[1]));
});
