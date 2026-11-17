// Plan sửa web Đợt 1 (17/11/2026): 1.1 lưu KPI không xoá cả tháng + hoàn tác, 1.2 quyền danh sách đơn Marketing,
// 1.3 KPI cá nhân chỉ người mình quản lý, 1.5 băm mật khẩu 600.000 vòng. Tên, số đều giả.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { emptyDb } from './support/d1-sqlite';
import { loginAs, logout } from './support/session';
import { parseAccess, scopeApi } from '../lib/auth/access';
import { PUT, GET, POST } from '../app/api/targets/route';

const M = '2026-10';
const put = (items: unknown[], only?: string[]) => PUT(new Request('http://local/api/targets', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ month: M, items, ...(only ? { only } : {}) }) }));
const undo = () => POST(new Request('http://local/api/targets', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ month: M, action: 'undo' }) }));
type Item = { scope: string; refId: string; revenue: number; closeRate?: number | null; costCeiling?: number | null };
const items = async () => {
  const r = await GET(new Request(`http://local/api/targets?month=${M}`));
  assert.equal(r.status, 200);
  return Object.fromEntries(((await r.json()) as { items: Item[] }).items.map((i) => [`${i.scope}:${i.refId}`, i]));
};

void test('1.1 lưu 1 dòng (không kèm only) không mất dòng khác, kể cả tỉ lệ chốt và chi phí trần team', async () => {
  const { raw } = emptyDb();
  await loginAs(raw, 'owner');
  const first = [
    { scope: 'employee', refId: 'nv-a', revenue: 100, closedOrders: 5, closeRate: 30 },
    { scope: 'employee', refId: 'nv-b', revenue: 200, closedOrders: 8, closeRate: 40 },
    { scope: 'team', refId: 'team-x', revenue: 300, closedOrders: 0, costCeiling: 25 },
  ];
  assert.equal((await put(first)).status, 200);
  const before = await items();
  assert.equal(before['employee:nv-b'].closeRate, 40);
  // Gửi đúng 1 dòng như trang Mục tiêu cũ (không có only): trước đây xoá cả tháng.
  assert.equal((await put([{ scope: 'employee', refId: 'nv-a', revenue: 150, closedOrders: 5, closeRate: 30 }])).status, 200);
  const after = await items();
  assert.equal(after['employee:nv-a'].revenue, 150);
  assert.equal(after['employee:nv-b'].revenue, 200);
  assert.equal(after['employee:nv-b'].closeRate, 40, 'tỉ lệ chốt dòng không gửi giữ nguyên');
  assert.equal(after['team:team-x'].revenue, 300);
  assert.equal(after['team:team-x'].costCeiling, 25, 'chi phí trần team giữ nguyên');
  raw.close();
});

void test('1.1 lỗi giữa chừng khi ghi: không đổi gì (ghi trọn một lần)', async () => {
  const { raw } = emptyDb();
  await loginAs(raw, 'owner');
  await put([{ scope: 'employee', refId: 'nv-a', revenue: 100, closedOrders: 1 }, { scope: 'employee', refId: 'nv-b', revenue: 200, closedOrders: 1 }]);
  // Giả lỗi ở câu ghi thứ hai (dòng nv-b), sau khi câu xoá / ghi dòng nv-a đã chạy.
  raw.exec("CREATE TRIGGER gia_loi BEFORE INSERT ON targets WHEN NEW.ref_id='nv-b' BEGIN SELECT RAISE(ABORT,'lỗi giả'); END;");
  await assert.rejects(async () => { const r = await put([{ scope: 'employee', refId: 'nv-a', revenue: 999, closedOrders: 1 }, { scope: 'employee', refId: 'nv-b', revenue: 888, closedOrders: 1 }]); if (r.status >= 500) throw new Error(String(r.status)); });
  raw.exec('DROP TRIGGER gia_loi;');
  const rows = raw.prepare("SELECT ref_id, revenue FROM targets WHERE month=? ORDER BY ref_id").all(M) as { ref_id: string; revenue: number }[];
  assert.deepEqual(rows.map((r) => [r.ref_id, r.revenue]), [['nv-a', 100], ['nv-b', 200]]);
  raw.close();
});

void test('1.1 hoàn tác trả lần lưu gần nhất về bản trước; hết bản thì báo 404; chỉ chủ hệ thống', async () => {
  const { raw } = emptyDb();
  await loginAs(raw, 'owner');
  await put([{ scope: 'employee', refId: 'nv-a', revenue: 100, closedOrders: 1, closeRate: 30 }]);
  await put([{ scope: 'employee', refId: 'nv-a', revenue: 500, closedOrders: 1, closeRate: 55 }, { scope: 'employee', refId: 'nv-c', revenue: 70, closedOrders: 1 }]);
  assert.equal((await items())['employee:nv-a'].revenue, 500);
  const r = await undo();
  assert.equal(r.status, 200);
  const back = await items();
  assert.equal(back['employee:nv-a'].revenue, 100);
  assert.equal(back['employee:nv-a'].closeRate, 30, 'tỉ lệ chốt cũng về bản trước');
  assert.equal(back['employee:nv-c'], undefined, 'dòng mới thêm ở lần lưu đó bị gỡ');
  // Hoàn tác tiếp: về trước lần lưu đầu (tháng trống).
  assert.equal((await undo()).status, 200);
  assert.equal(Object.keys(await items()).length, 0);
  assert.equal((await undo()).status, 404);
  assert.equal(raw.prepare("SELECT COUNT(*) n FROM audit_log WHERE action='targets.undo'").get()?.n, 2);
  await loginAs(raw, 'director');
  assert.equal((await undo()).status, 403);
  raw.close();
});

void test('1.2 danh sách đơn / chi tiết marketer / bảng chéo Marketing cần quyền trang Marketing', () => {
  const sale = parseAccess({ role: 'staff', views_json: JSON.stringify(['sales']) });
  const marketer = parseAccess({ role: 'staff', views_json: JSON.stringify(['marketing']) });
  const roas = parseAccess({ role: 'staff', views_json: JSON.stringify(['mkt-roas']) });
  const owner = parseAccess({ role: 'owner' });
  for (const p of ['/api/marketing/orders', '/api/marketing/marketer-detail', '/api/marketing/cross']) {
    const u = new URL(`http://local${p}?from=2026-10-01&to=2026-10-31`);
    assert.notEqual(scopeApi(sale, 'GET', u).blocked, undefined, `Sale bị chặn ${p}`);
    assert.equal(scopeApi(marketer, 'GET', u).blocked, undefined, `marketer vào được ${p}`);
    assert.equal(scopeApi(owner, 'GET', u).blocked, undefined, `chủ vào được ${p}`);
  }
  assert.equal(scopeApi(roas, 'GET', new URL('http://local/api/marketing/orders')).blocked, undefined, 'ô số ở Chi phí & ROAS mở được danh sách đơn');
  assert.notEqual(scopeApi(roas, 'GET', new URL('http://local/api/marketing/cross')).blocked, undefined);
});

void test('1.3 KPI cá nhân: quản lý A không thấy người của B; chủ thấy hết', async () => {
  const { raw } = emptyDb();
  const now = '2026-10-01T00:00:00Z';
  for (const [scope, ref] of [['employee', 'nv-a'], ['employee', 'nv-b'], ['employee', 'nv-tu-do'], ['team', 'team-b']])
    raw.prepare('INSERT INTO targets (id,month,scope,ref_id,revenue,closed_orders,updated_by,updated_at) VALUES (?,?,?,?,1000,1,NULL,?)').run(`${M}:${scope}:${ref}`, M, scope, ref, now);
  // Hai quản lý giả: A quản lý nv-a, B quản lý nv-b (manager_id → hồ sơ → tài khoản POS).
  const link = (mgr: string, n: string) => {
    raw.prepare("INSERT INTO users (id,email,name,password_hash,role,created_at,updated_at,manager_id) VALUES (?,?,?,'-','staff',?,?,?)").run(`u-${n}`, `${n}@test`, n, now, now, mgr);
    raw.prepare("INSERT INTO hr_employees (id,code,full_name,status,main_user_id) VALUES (?,?,?,'dang_lam',?)").run(`e-${n}`, n, n, `u-${n}`);
    raw.prepare("INSERT INTO hr_pos_team (pos_user_id,employee_id,employee_name,team,status) VALUES (?,?,?,'sale','dang_lam')").run(n, `e-${n}`, n);
    raw.prepare("INSERT INTO pos_users (id,pos_id,user_id,name,fetched_at) VALUES (?,'pos-a',?,?,?)").run(`pos-a:${n}`, n, n, now);
  };
  const b = await loginAs(raw, 'director');
  link(b, 'nv-b');
  const a = await loginAs(raw, 'director');
  link(a, 'nv-a');
  const seenA = Object.keys(await items());
  assert.ok(seenA.includes('employee:nv-a'), 'A thấy người mình quản lý');
  assert.ok(!seenA.includes('employee:nv-b'), 'A không thấy người của B');
  assert.ok(!seenA.includes('employee:nv-tu-do'), 'A không thấy người ngoài team');
  assert.ok(!seenA.includes('team:team-b'), 'A không thấy KPI team B');
  const lead = await loginAs(raw, 'lead');
  raw.prepare("UPDATE users SET manager_id=? WHERE id='u-nv-a'").run(lead);
  const seenLead = Object.keys(await items());
  assert.ok(seenLead.includes('employee:nv-a') && !seenLead.includes('employee:nv-b') && !seenLead.includes('team:team-b'));
  await loginAs(raw, 'owner');
  assert.deepEqual(Object.keys(await items()).sort(), ['employee:nv-a', 'employee:nv-b', 'employee:nv-tu-do', 'team:team-b']);
  logout();
  raw.close();
});

// Băm theo mức cũ 30.000 vòng (giống hệt cách băm trước đây) để thử đăng nhập bằng mật khẩu cũ.
async function oldHash(password: string, secret: string) {
  const enc = new TextEncoder();
  const k = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const peppered = await crypto.subtle.sign('HMAC', k, enc.encode(password));
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const material = await crypto.subtle.importKey('raw', peppered, 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: 30000 }, material, 256);
  const b64 = (u: Uint8Array) => btoa(String.fromCharCode(...u));
  return `pbkdf2$30000$${b64(salt)}$${b64(new Uint8Array(bits))}`;
}

void test('1.5 mật khẩu: băm mới 600.000 vòng; băm cũ 30.000 vẫn đăng nhập được và tự nâng; đăng nhập dưới 1 giây', async () => {
  const SECRET = 'bi-mat-gia-chi-de-test-0123456789';
  const { raw } = emptyDb({ AUTH_SECRET: SECRET, THP_NO_MFA: '1' });
  const { hashPassword, verifyPassword, needsRehash, PBKDF2_ITERATIONS } = await import('../lib/auth/auth');
  assert.equal(PBKDF2_ITERATIONS, 600000);
  const fresh = await hashPassword('Mat-khau-gia-2026!');
  assert.ok(fresh.startsWith('pbkdf2$600000$'));
  assert.equal(await verifyPassword('Mat-khau-gia-2026!', fresh), true);
  assert.equal(await verifyPassword('sai-mat-khau', fresh), false);
  assert.equal(needsRehash(fresh), false);
  const old = await oldHash('Mat-khau-cu-2026!', SECRET);
  assert.equal(needsRehash(old), true);
  assert.equal(await verifyPassword('Mat-khau-cu-2026!', old), true, 'băm cũ vẫn kiểm được');
  const now = new Date().toISOString();
  raw.prepare("INSERT INTO users (id,email,name,password_hash,role,disabled,created_at,updated_at) VALUES ('u-cu','nv-cu@test.vn','NV cũ',?,'staff',0,?,?)").run(old, now, now);
  const { POST: login } = await import('../app/api/auth/login/route');
  const call = (password: string) => login(new Request('https://x.test/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'nv-cu@test.vn', password }) }));
  assert.equal((await call('sai-mat-khau')).status, 401);
  assert.equal((raw.prepare("SELECT password_hash h FROM users WHERE id='u-cu'").get() as { h: string }).h, old, 'sai mật khẩu không đổi băm');
  let t = performance.now();
  assert.equal((await call('Mat-khau-cu-2026!')).status, 200);
  const ms1 = performance.now() - t;
  const upgraded = (raw.prepare("SELECT password_hash h FROM users WHERE id='u-cu'").get() as { h: string }).h;
  assert.ok(upgraded.startsWith('pbkdf2$600000$'), 'đăng nhập đúng thì nâng lên 600.000 vòng');
  t = performance.now();
  assert.equal((await call('Mat-khau-cu-2026!')).status, 200, 'đăng nhập lại bằng băm mới');
  const ms2 = performance.now() - t;
  assert.equal((raw.prepare("SELECT password_hash h FROM users WHERE id='u-cu'").get() as { h: string }).h, upgraded, 'đã ở mức mới thì không băm lại');
  console.log(`đăng nhập lần nâng cấp ${Math.round(ms1)} ms, lần sau ${Math.round(ms2)} ms`);
  assert.ok(ms2 < 1000, `đăng nhập mức mới ${ms2} ms phải dưới 1 giây`);
  logout();
  raw.close();
});

void test('1.1 hoàn tác chỉ trả khoá trong bản chụp còn y nguyên; khoá đã bị người khác (bot Zalo) đổi sau đó thì giữ nguyên', async () => {
  const { raw } = emptyDb();
  await loginAs(raw, 'owner');
  await put([{ scope: 'employee', refId: 'nv-a', revenue: 100, closedOrders: 1, closeRate: 30 }, { scope: 'employee', refId: 'nv-b', revenue: 100, closedOrders: 1, closeRate: 30 }]);
  await put([{ scope: 'employee', refId: 'nv-a', revenue: 500, closedOrders: 1, closeRate: 50 }, { scope: 'employee', refId: 'nv-b', revenue: 200, closedOrders: 1, closeRate: 50 }]);
  // Sau lần lưu: bot Zalo đổi KPI nv-b (không qua hàm lưu web), và có người thêm KPI nv-c ngoài bản chụp.
  raw.prepare("UPDATE targets SET revenue=777, updated_by='Zalo: Người khác', updated_at='2026-10-20T00:00:00.000Z' WHERE id=?").run(`${M}:employee:nv-b`);
  raw.prepare("INSERT INTO targets (id,month,scope,ref_id,revenue,closed_orders,updated_by,updated_at) VALUES (?,?,'employee','nv-c',90,0,'khac','2026-10-20')").run(`${M}:employee:nv-c`, M);
  const r = await undo();
  assert.equal(r.status, 200);
  const body = await r.json() as { count: number; skipped: string[]; by: string };
  assert.equal(body.count, 1);
  assert.deepEqual(body.skipped, ['employee:nv-b']);
  assert.match(body.by, /@test$/, 'ghi lần lưu của ai');
  const now = await items();
  assert.equal(now['employee:nv-a'].revenue, 100, 'khoá còn y nguyên thì trả về bản trước');
  assert.equal(now['employee:nv-a'].closeRate, 30);
  assert.equal(now['employee:nv-b'].revenue, 777, 'không đè thay đổi của người khác');
  assert.equal(now['employee:nv-b'].closeRate, 50, 'tỉ lệ chốt của khoá bỏ qua cũng giữ nguyên');
  assert.equal(now['employee:nv-c'].revenue, 90, 'khoá ngoài bản chụp không đụng tới');
  raw.close();
});

void test('1.1 bản chụp KPI: người không phải chủ không thấy; không vào file sao lưu xuất ra', async () => {
  const { raw } = emptyDb();
  await loginAs(raw, 'owner');
  await put([{ scope: 'employee', refId: 'nv-a', revenue: 100, closedOrders: 1 }]);
  assert.ok(((await (await GET(new Request(`http://local/api/targets?month=${M}`))).json()) as { undo?: unknown }).undo, 'chủ thấy nút hoàn tác');
  for (const role of ['director', 'lead', 'staff'] as const) {
    await loginAs(raw, role);
    const b = await (await GET(new Request(`http://local/api/targets?month=${M}`))).json() as Record<string, unknown>;
    assert.equal(b.undo, undefined, `${role} không thấy bản chụp`);
    assert.ok(!JSON.stringify(b).includes('targets_backup'), `${role} không nhận được bản chụp`);
  }
  const { ROW_FILTERS } = await import('../lib/ops/backup');
  const kept = raw.prepare(`SELECT key FROM app_settings WHERE ${ROW_FILTERS.app_settings}`).all() as { key: string }[];
  assert.ok(raw.prepare("SELECT COUNT(*) n FROM app_settings WHERE key LIKE 'targets_backup:%'").get()!.n as number > 0, 'có bản chụp trong DB');
  assert.ok(!kept.some((k) => k.key.startsWith('targets_backup:')), 'file sao lưu bỏ bản chụp KPI');
  logout();
  raw.close();
});

void test('1.3 seeKpiOf: trang biết xem được KPI của ai để không cộng thiếu (giám đốc, trưởng nhóm, chủ)', async () => {
  const { raw } = emptyDb();
  const now = '2026-10-01T00:00:00Z';
  for (const ref of ['nv-a', 'nv-b']) raw.prepare("INSERT INTO targets (id,month,scope,ref_id,revenue,closed_orders,updated_by,updated_at) VALUES (?,?,'employee',?,1000,1,NULL,?)").run(`${M}:employee:${ref}`, M, ref, now);
  const link = (mgr: string, n: string) => {
    raw.prepare("INSERT INTO users (id,email,name,password_hash,role,created_at,updated_at,manager_id) VALUES (?,?,?,'-','staff',?,?,?)").run(`u-${n}`, `${n}@test`, n, now, now, mgr);
    raw.prepare("INSERT INTO hr_employees (id,code,full_name,status,main_user_id) VALUES (?,?,?,'dang_lam',?)").run(`e-${n}`, n, n, `u-${n}`);
    raw.prepare("INSERT INTO hr_pos_team (pos_user_id,employee_id,employee_name,team,status) VALUES (?,?,?,'sale','dang_lam')").run(n, `e-${n}`, n);
    raw.prepare("INSERT INTO pos_users (id,pos_id,user_id,name,fetched_at) VALUES (?,'pos-a',?,?,?)").run(`pos-a:${n}`, n, n, now);
  };
  const seeOf = async () => ((await (await GET(new Request(`http://local/api/targets?month=${M}`))).json()) as { seeKpiOf?: string[] | null }).seeKpiOf;
  const a = await loginAs(raw, 'director');
  link(a, 'nv-a');
  assert.deepEqual(await seeOf(), ['nv-a'], 'giám đốc A chỉ xem được người mình quản lý');
  const lead = await loginAs(raw, 'lead');
  link(lead, 'nv-b');
  assert.deepEqual(await seeOf(), ['nv-b'], 'trưởng nhóm chỉ xem được người mình quản lý');
  await loginAs(raw, 'owner');
  assert.equal(await seeOf(), null, 'chủ xem hết');
  const { seesAllKpi, seesKpi } = await import('../lib/kpi/kpi-seen');
  assert.equal(seesAllKpi(['nv-a'], ['nv-a', 'nv-b']), false, 'team có người không xem được: không cộng');
  assert.equal(seesAllKpi(null, ['nv-a', 'nv-b']), true);
  assert.equal(seesKpi(['nv-a'], 'nv-b'), false);
  logout();
  raw.close();
});
