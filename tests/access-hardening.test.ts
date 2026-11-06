// Siết quyền xem (05/11/2026): xuất Excel chỉ chủ hệ thống (kiểm ở máy chủ), khoá cache theo phạm vi người xem,
// MFA bắt buộc chặn cả ở API, KPI của nhân viên thường chỉ của chính họ. Số liệu demo, không có dữ liệu thật.
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import type { DatabaseSync } from 'node:sqlite';
import { demoWorld } from './support/d1-sqlite';
import { loginAs, logout } from './support/session';
import { NON_OWNER_MAX_ROWS, canExportView, parseAccess } from '../lib/auth/access';

const DAYS = ['2026-09-30', '2026-10-01'];
let raw: DatabaseSync;
before(async () => { ({ raw } = await demoWorld(DAYS, Date.parse('2026-10-02T05:00:00Z'))); });
after(logout);

const VIEWS = ['customers', 'dormant', 'calls', 'overview'];

void test('c. xuất Excel danh sách khách / cuộc gọi: nhân viên bị chặn, giám đốc và trưởng nhóm xuất được', async () => {
  const { POST } = await import('../app/api/activity/route');
  const exportLog = (view: string) => POST(new Request('https://x/api/activity', { method: 'POST', body: JSON.stringify({ view, export: { file: 'a.xlsx', rows: 10 } }) }));
  // Anh Vũ 06/11/2026: "giám đốc phải xuất được, trừ nhân viên mới k được".
  await loginAs(raw, 'staff', { views: VIEWS });
  for (const view of ['customers', 'dormant', 'calls']) assert.equal((await exportLog(view)).status, 403, `staff xuất ${view}`);
  assert.equal((await exportLog('overview')).status, 200);
  for (const role of ['owner', 'director', 'lead'] as const) {
    await loginAs(raw, role, { views: VIEWS });
    for (const view of ['customers', 'dormant', 'calls']) assert.equal((await exportLog(view)).status, 200, `${role} xuất ${view}`);
  }
  assert.equal(canExportView(parseAccess({ role: 'owner' }), 'customers'), true);
  assert.equal(canExportView(parseAccess({ role: 'director' }), 'customers'), true);
  assert.equal(canExportView(parseAccess({ role: 'staff' }), 'customers'), false);
});

void test('c. tải toàn bộ danh sách khách (cỡ xuất Excel): nhân viên bị chặn; cỡ thường vẫn xem được', async () => {
  const { GET } = await import('../app/api/reports/customers/route');
  const get = (size: number) => GET(new Request(`https://x/api/reports/customers?group=all&size=${size}`));
  await loginAs(raw, 'staff', { views: VIEWS });
  assert.equal((await get(20000)).status, 403);
  assert.equal((await get(NON_OWNER_MAX_ROWS)).status, 200, `staff vẫn xem toàn bộ ${NON_OWNER_MAX_ROWS} dòng`);
  assert.equal((await get(50)).status, 200);
  for (const role of ['owner', 'director', 'lead'] as const) { await loginAs(raw, role, { views: VIEWS }); assert.equal((await get(20000)).status, 200, role); }
});

void test('d. khoá cache báo cáo theo trang được cấp (Lý do hoàn, Gợi ý, Thẻ xu hướng): hai người cùng vai trò khác quyền không dùng chung', async () => {
  const { VIEWER_SCOPED_REPORTS, cacheScopeFor } = await import('../lib/auth/access');
  const a = parseAccess({ role: 'staff', views_json: JSON.stringify(['overview', 'returns']) });
  const b = parseAccess({ role: 'staff', views_json: JSON.stringify(['van-don']) });
  const c = parseAccess({ role: 'staff', views_json: JSON.stringify(['returns', 'overview']) });
  for (const path of ['/api/reports/returns', '/api/reports/advisor', '/api/reports/trend-cards']) {
    assert.ok(VIEWER_SCOPED_REPORTS.includes(path));
    assert.notEqual(cacheScopeFor(a, path), cacheScopeFor(b, path), path);
    assert.equal(cacheScopeFor(a, path), cacheScopeFor(c, path), 'cùng quyền (khác thứ tự) dùng chung được');
    const pos1 = parseAccess({ role: 'lead', views_json: '["overview"]', pos_ids_json: '["bio-nano"]' });
    const pos2 = parseAccess({ role: 'lead', views_json: '["overview"]', pos_ids_json: '["megaroot"]' });
    assert.notEqual(cacheScopeFor(pos1, path), cacheScopeFor(pos2, path));
  }
  // Báo cáo khác giữ khoá theo vai trò như cũ (URL đã thu hẹp theo POS / nhóm).
  assert.equal(cacheScopeFor(a, '/api/reports/overview'), '');
});

void test('e. MFA bắt buộc chưa bật: chặn API dữ liệu ở máy chủ; bật rồi thì qua; vai trò không bắt buộc không bị chặn', async () => {
  const { forgetSession, getSessionUser } = await import('../lib/auth/auth');
  const { mfaBlocks } = await import('../lib/auth/mfa-gate');
  for (const role of ['owner', 'director'] as const) {
    const id = await loginAs(raw, role);
    const before = (await getSessionUser())!;
    assert.equal(before.mfaRequired, true, role);
    assert.equal(mfaBlocks(before), true, `${role} chưa bật MFA phải bị chặn`);
    raw.prepare("INSERT INTO user_mfa (user_id,totp_secret,totp_enabled_at,updated_at) VALUES (?,'x',?,?)").run(id, '2026-11-05T00:00:00Z', '2026-11-05T00:00:00Z');
    // Bật MFA thì quên phiên đã nhớ (như route bật 2FA), lượt sau đọc lại.
    await forgetSession((globalThis as { __testCookie?: string }).__testCookie ?? null);
    assert.equal(mfaBlocks((await getSessionUser())!), false, `${role} đã bật MFA vẫn xem đủ`);
  }
  for (const role of ['lead', 'staff'] as const) {
    await loginAs(raw, role);
    assert.equal(mfaBlocks((await getSessionUser())!), false, role);
  }
  // Cổng nằm trong worker, trước phân quyền và trước gộp báo cáo; phần /api/auth/* (để bật MFA) không qua cổng này.
  const { readFileSync } = await import('node:fs');
  const full = readFileSync(new URL('../worker.ts', import.meta.url), 'utf8');
  const src = full.slice(full.indexOf('async fetch(request'));
  const gate = src.indexOf('if (mfaBlocks(user))');
  assert.ok(gate > 0, 'worker.ts phải gọi mfaBlocks');
  assert.ok(gate < src.indexOf("pathname === '/api/reports/batch'") && gate < src.indexOf('const r = scopeApi(user'), 'chặn MFA phải đứng trước gộp báo cáo và phân quyền');
  assert.ok(src.lastIndexOf("!pathname.startsWith('/api/auth/')", gate) > 0);
});

void test('f. KPI (GET /api/targets): nhân viên thường chỉ thấy KPI cá nhân của mình; chủ hệ thống thấy đủ; giám đốc giữ như cũ', async () => {
  const { GET } = await import('../app/api/targets/route');
  const month = '2026-10';
  const now = '2026-10-01T00:00:00Z';
  const pos = (raw.prepare('SELECT id FROM pos_shops LIMIT 1').get() as { id: string }).id;
  // Hai người Sale giả (không thuộc CSKH): một là chính nhân viên đăng nhập, một là người khác.
  for (const [ref, scope] of [[pos, 'pos'], ['kpi-own', 'employee'], ['kpi-other', 'employee'], ['team-x', 'team']] as const)
    raw.prepare('INSERT INTO targets (id,month,scope,ref_id,revenue,closed_orders,updated_by,updated_at) VALUES (?,?,?,?,1000,1,NULL,?)').run(`${month}:${scope}:${ref}`, month, scope, ref, now);
  const keys = async () => {
    const r = await GET(new Request(`https://x/api/targets?month=${month}`));
    assert.equal(r.status, 200);
    return ((await r.json()) as { items: { scope: string; refId: string }[] }).items.map((i) => `${i.scope}:${i.refId}`).sort();
  };
  try {
    const id = await loginAs(raw, 'staff');
    raw.prepare("INSERT INTO pos_users (id,pos_id,user_id,name,email,is_active,fetched_at) VALUES (?,?,?,?,?,1,?)").run(`${pos}:kpi-own`, pos, 'kpi-own', 'NV thử', `${id}@test`, now);
    raw.prepare("INSERT INTO pos_users (id,pos_id,user_id,name,email,is_active,fetched_at) VALUES (?,?,?,?,?,1,?)").run(`${pos}:kpi-other`, pos, 'kpi-other', 'NV khác', 'khac@test', now);
    const mine = await keys();
    assert.ok(mine.includes('employee:kpi-own'), 'thấy KPI của chính mình');
    assert.ok(!mine.includes('employee:kpi-other'), 'không thấy KPI người khác');
    assert.ok(!mine.some((k) => k.startsWith('team:')), 'không thấy KPI team');
    // Nhân viên khác không có tài khoản POS khớp email: chỉ còn KPI cấp POS.
    await loginAs(raw, 'staff');
    assert.ok((await keys()).every((k) => k.startsWith('pos:')));
    await loginAs(raw, 'owner');
    assert.deepEqual(await keys(), [`employee:kpi-other`, 'employee:kpi-own', `pos:${pos}`, 'team:team-x'].sort());
    await loginAs(raw, 'director');
    const dir = await keys();
    for (const k of ['employee:kpi-own', 'employee:kpi-other', `pos:${pos}`]) assert.ok(dir.includes(k), `giám đốc vẫn thấy ${k}`);
  } finally {
    raw.exec(`DELETE FROM targets WHERE month='${month}'; DELETE FROM pos_users WHERE user_id IN ('kpi-own','kpi-other')`);
  }
});
