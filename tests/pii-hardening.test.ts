// Vá dữ liệu cá nhân theo QA 11/10/2026 (kiem-web.md): L1 che SĐT ở Nguồn khách CSKH, L2 nhật ký không lưu SĐT,
// M1 tin cập nhật ứng viên chỉ gửi giá trị cột tuyển dụng, M2 nhật ký tải Excel không nhận trang lạ / số dòng lạ.
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import type { DatabaseSync } from 'node:sqlite';
import { demoWorld } from './support/d1-sqlite';
import { loginAs, logout } from './support/session';

const DAYS = ['2026-09-29', '2026-09-30', '2026-10-01'];
let raw: DatabaseSync;
before(async () => { ({ raw } = await demoWorld(DAYS, Date.parse('2026-10-02T05:00:00Z'))); });
after(logout);

const origin = async (qs: string) => {
  const { GET } = await import('../app/api/reports/cskh-origin/route');
  const res = await GET(new Request(`https://x/api/reports/cskh-origin?start=${DAYS[0]}&end=${DAYS[2]}${qs}`));
  assert.equal(res.status, 200);
  return res.json() as Promise<{ staff: { staffId: string }[]; customers: { phone: string }[] | null }>;
};

void test('L1: danh sách khách Nguồn khách CSKH: chủ hệ thống thấy đủ SĐT, nhân viên chỉ thấy 3 số cuối', async () => {
  await loginAs(raw, 'owner');
  const { staff } = await origin('');
  assert.ok(staff.length > 0, 'dữ liệu demo phải có nhân viên CSKH');
  const sid = staff[0].staffId;
  const full = (await origin(`&staffId=${encodeURIComponent(sid)}`)).customers ?? [];
  assert.ok(full.length > 0);
  assert.ok(full.every((c) => /^\+?\d{9,}$/.test(c.phone)), 'chủ hệ thống thấy số đầy đủ');
  await loginAs(raw, 'staff');
  const masked = (await origin(`&staffId=${encodeURIComponent(sid)}`)).customers ?? [];
  assert.equal(masked.length, full.length);
  for (const c of masked) assert.match(c.phone, /^•+\d{3}$/);
});

void test('L2: tham số tìm kiếm ghi vào nhật ký không chứa SĐT', async () => {
  const { scrubSearch } = await import('../lib/audit');
  const out = scrubSearch('?phone=0901234567&q=0912 345 678&start=2026-10-01&tel=+84901234567&name=Hoa&id=12');
  for (const leak of ['0901234567', '0912', '84901234567']) assert.ok(!out.includes(leak), `lộ ${leak}: ${out}`);
  const p = new URLSearchParams(out);
  assert.equal(p.get('phone'), '•••567');
  assert.equal(p.get('start'), '2026-10-01');
  assert.equal(p.get('name'), 'Hoa');
  assert.equal(p.get('id'), '12');
  assert.ok(scrubSearch(`q=${'a'.repeat(1000)}`).length <= 400);
});

void test('M1: chỉ cột tuyển dụng nhận diện được mới gửi giá trị; cột cá nhân và cột lạ chỉ báo đã đổi', async () => {
  const { isRecruitCol } = await import('../lib/recruit');
  for (const col of ['Vị trí', 'Ngày CV về', 'Lịch phỏng vấn', 'Nhân sự phụ trách']) assert.ok(isRecruitCol(col), col);
  for (const col of ['SĐT', 'Năm sinh', 'Ghi chú', 'Sức khoẻ', 'Tình trạng hôn nhân', 'Cột lạ', 'Họ và tên', 'Link CV']) assert.ok(!isRecruitCol(col), col);
});

void test('M2: nhật ký tải Excel chỉ nhận trang có thật mà tài khoản được xem, số dòng hợp lệ', async () => {
  const { POST } = await import('../app/api/activity/route');
  const send = (body: unknown) => POST(new Request('https://x/api/activity', { method: 'POST', body: JSON.stringify(body) }));
  await loginAs(raw, 'staff', { views: ['dashboard'] });
  assert.equal((await send({ view: '__proto__', export: { file: 'a.xlsx', rows: 1 } })).status, 400);
  assert.equal((await send({ view: 'trang-la', export: { file: 'a.xlsx', rows: 1 } })).status, 400);
  assert.equal((await send({ view: 'customers', export: { file: 'a.xlsx', rows: 1 } })).status, 400, 'không được xem trang Khách thì không ghi xuất Excel trang đó');
  assert.equal((await send({ view: 'export', export: { file: 'x\u0000\u001fy.xlsx', rows: 'Infinity' } })).status, 200);
  const row = raw.prepare("SELECT detail FROM audit_log WHERE action='export.file' ORDER BY at DESC LIMIT 1").get() as { detail: string };
  for (let i = 0; i < row.detail.length; i++) assert.ok(row.detail.charCodeAt(i) >= 32, 'còn ký tự điều khiển');
  assert.match(row.detail, /xy\.xlsx · 0 dòng/);
});
