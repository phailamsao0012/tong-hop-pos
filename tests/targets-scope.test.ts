import assert from 'node:assert/strict';
import { test } from 'node:test';
import { emptyDb } from './support/d1-sqlite';
import { loginAs } from './support/session';
import { parseAccess, scopeApi } from '../lib/auth/access';
import { canWriteTarget, mergeTargetRates, targetStaff, withTargetRates } from '../lib/kpi/targets';
import { PUT, GET } from '../app/api/targets/route';

const req = (items: unknown[], only?: string[]) => new Request('http://local/api/targets', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ month: '2026-10', items, ...(only ? { only } : {}) }) });
void test('C2: chủ đặt team MKT, lưu chi phí trần và nhật ký', async () => {
  const { raw } = emptyDb();
  await loginAs(raw, 'owner');
  assert.equal((await PUT(req([{ scope: 'team', refId: 'hr:team-mkt', revenue: 100, closedOrders: 2, costCeiling: 40 }], ['team:hr:team-mkt']))).status, 200);
  const body = await (await GET(new Request('http://local/api/targets?month=2026-10'))).json() as { items: { costCeiling: number }[] };
  assert.equal(body.items[0].costCeiling, 40);
  assert.equal(raw.prepare("SELECT COUNT(*) AS n FROM audit_log WHERE action='targets.set'").get()?.n, 1);
  raw.close();
});
void test('C2: kiểm từng refId, team chỉ chủ, nhân viên không ghi', () => {
  for (const role of ['director', 'lead', 'mentor', 'staff'] as const) {
    const user = parseAccess({ role });
    assert.equal(canWriteTarget(user, ['staff-a'], 'employee', 'staff-a'), role !== 'staff');
    assert.equal(canWriteTarget(user, ['staff-a'], 'employee', 'staff-b'), false);
    assert.equal(canWriteTarget(user, ['staff-a'], 'team', 'team-a'), false);
    assert.equal(canWriteTarget(user, ['staff-a'], 'pos', 'pos-a'), false);
  }
  assert.equal(scopeApi(parseAccess({ role: 'mentor' }), 'PUT', new URL('http://local/api/targets')).blocked, undefined);
});
void test('C2: giám đốc không xóa cả tháng hoặc refId ngoài quyền; không thay số khi bị từ chối', async () => {
  const { raw, db } = emptyDb();
  await loginAs(raw, 'owner');
  await PUT(req([{ scope: 'employee', refId: 'staff-a', revenue: 100 }]));
  const id = await loginAs(raw, 'director');
  assert.deepEqual(await targetStaff(db, { ...parseAccess({ role: 'director' }), userId: id }), []);
  assert.equal((await PUT(req([{ scope: 'team', refId: 'team-a', revenue: 200 }], ['team:team-a']))).status, 403);
  assert.equal((await PUT(req([], ['employee:staff-a']))).status, 403);
  assert.equal((await PUT(req([]))).status, 400);
  assert.equal(raw.prepare('SELECT revenue FROM targets').get()?.revenue, 100);
  await loginAs(raw, 'staff');
  assert.equal((await PUT(req([]))).status, 403);
  assert.equal((await PUT(req([{ scope: 'employee', refId: 'staff-a', revenue: 200 }], ['employee:staff-a']))).status, 403);
  raw.close();
});

void test('C2: giám đốc ghi người có manager_id, từ chối người ngoài; lead theo bộ phận/POS', async () => {
  const { raw, db } = emptyDb();
  const directorId = await loginAs(raw, 'director');
  raw.exec("INSERT INTO users (id,email,name,password_hash,role,created_at,updated_at,manager_id) VALUES ('member-user','nv-a@test','NV A','-','staff','2026-10-01','2026-10-01','" + directorId + "');");
  raw.exec("INSERT INTO hr_employees (id,code,full_name,status,main_user_id) VALUES ('employee-a','NV-A','NV A','dang_lam','member-user');");
  raw.exec("INSERT INTO hr_pos_team (pos_user_id,employee_id,employee_name,team,status) VALUES ('staff-a','employee-a','NV A','sale','dang_lam');");
  raw.exec("INSERT INTO pos_users (id,pos_id,user_id,name,fetched_at) VALUES ('pos-user-a','pos-a','staff-a','NV A SALE','2026-10-01');");
  assert.deepEqual(await targetStaff(db, { ...parseAccess({ role: 'director' }), userId: directorId }), ['staff-a']);
  assert.equal((await PUT(req([{ scope: 'employee', refId: 'staff-a', revenue: 200 }], ['employee:staff-a']))).status, 200);
  assert.equal((await PUT(req([{ scope: 'employee', refId: 'staff-b', revenue: 900 }], ['employee:staff-b']))).status, 403);
  assert.deepEqual(await targetStaff(db, { role: 'lead', userId: 'lead-a', views: [], posIds: ['pos-b'], team: 'sale' }), []);
  assert.deepEqual(await targetStaff(db, { role: 'lead', userId: 'lead-a', views: [], posIds: ['pos-a'], team: 'sale' }), []);
  assert.deepEqual(await targetStaff(db, { role: 'mentor', userId: 'member-user', views: [], posIds: null, team: 'all' }), ['staff-a']);
  assert.deepEqual(await targetStaff(db, { role: 'mentor', userId: 'unlinked', views: [], posIds: null, team: 'all' }), []);
  const mentorId = await loginAs(raw, 'staff');
  raw.prepare("UPDATE users SET role='mentor' WHERE id=?").run(mentorId);
  raw.prepare("UPDATE hr_employees SET main_user_id=? WHERE id='employee-a'").run(mentorId);
  assert.deepEqual(await targetStaff(db, { role: 'mentor', userId: mentorId, views: [], posIds: null, team: 'all' }), ['staff-a']);
  assert.deepEqual(await targetStaff(db, { role: 'mentor', userId: mentorId, views: [], posIds: ['pos-b'], team: 'all' }), []);
  assert.equal((await PUT(req([{ scope: 'employee', refId: 'staff-a', revenue: 300 }], ['employee:staff-a']))).status, 200);
  assert.equal((await PUT(req([{ scope: 'employee', refId: 'staff-b', revenue: 900 }], ['employee:staff-b']))).status, 403);
  const visible = await (await GET(new Request('http://local/api/targets?month=2026-10'))).json() as { items: { refId: string; revenue: number }[] };
  assert.deepEqual(visible.items.map((item) => [item.refId, item.revenue]), [['staff-a', 300]]);
  assert.equal((await PUT(req([{ scope: 'employee', refId: 'staff-a', revenue: -1 }], ['employee:staff-a']))).status, 400);
  raw.close();
});

void test('S1: lead chỉ ghi cấp dưới, director thêm bộ phận; GET/PUT giữ POS và CSKH trong quyền; JSON hỏng an toàn', async () => {
 const {raw,db}=emptyDb();
 try {
  const lead=await loginAs(raw,'lead',{team:'sale'});
  for(const [id,team] of [['a','sale'],['b','sale'],['c','cskh'],['d','cskh'],['e','sale']]) {
   raw.prepare("INSERT INTO users(id,email,name,password_hash,role,created_at,updated_at,manager_id) VALUES (?,?,?,'-','staff','2026-10-01','2026-10-01',?)").run('user-'+id,'nv-'+id+'@test','NV '+id,['a','c','e'].includes(id)?lead:null);
   raw.prepare("INSERT INTO hr_employees(id,code,full_name,status,main_user_id) VALUES (?,?,?,'dang_lam',?)").run('emp-'+id,id,'NV '+id,id==='e'?null:'user-'+id);
   raw.prepare("INSERT INTO hr_pos_team(pos_user_id,employee_id,employee_name,team,status) VALUES (?,?,?,?,'dang_lam')").run(id,'emp-'+id,'NV '+id,team);
   raw.prepare("INSERT INTO pos_users(id,pos_id,user_id,name,fetched_at) VALUES (?,?,?,?, '2026-10-01')").run(id,'pos-a',id,'NV '+id+' '+team.toUpperCase());
  }
  raw.prepare("INSERT INTO app_settings(key,value,updated_at) VALUES ('user_employee:user-e','emp-e','2026-10-01')").run();
  assert.deepEqual((await targetStaff(db,{...parseAccess({role:'lead',team:'sale'}),userId:lead}))?.sort(),['a','c','e']);
  assert.deepEqual(await targetStaff(db,{...parseAccess({role:'lead',team:'sale',pos_ids_json:'["pos-b"]'}),userId:lead}),[]);
  const put=(id:string)=>PUT(req([{scope:'employee',refId:id,revenue:200}],['employee:'+id]));
  assert.equal((await put('b')).status,403);
  assert.equal((await put('a')).status,200);
  assert.equal((await put('c')).status,200);
  assert.equal((await put('e')).status,200);
  const director=await loginAs(raw,'director',{team:'sale'});
  raw.prepare('UPDATE users SET manager_id=? WHERE id=?').run(director,'user-c');
  assert.equal((await put('b')).status,200);
  await loginAs(raw,'owner');
  raw.prepare("INSERT INTO app_settings(key,value,updated_at) VALUES ('target_cost:2026-10','{broken','2026-10-01')").run();
  assert.equal((await PUT(req([{scope:'pos',refId:'pos-a',revenue:100},{scope:'employee',refId:'d',revenue:100},{scope:'team',refId:'team-a',revenue:100}],['pos:pos-a','employee:d','team:team-a']))).status,200);
  const {POS}=await import('../lib/shared/report-model');
  raw.prepare("INSERT INTO targets(id,month,scope,ref_id,revenue,updated_at) VALUES ('pos-target','2026-10','pos',?,100,'2026-10-01')").run(POS[0].id);
  raw.prepare("UPDATE app_settings SET value='{broken' WHERE key='target_cost:2026-10'").run();
  const director2=await loginAs(raw,'director',{team:'sale'});
  raw.prepare('UPDATE users SET manager_id=? WHERE id=?').run(director2,'user-c');
  const check=(body:{items:{scope:string;refId:string}[];editable?:string[]})=>{
   assert.ok(body.items.some(i=>i.scope==='pos'));
   assert.ok(body.items.some(i=>i.refId==='c'));
   assert.ok(!body.items.some(i=>i.refId==='d'||i.scope==='team'));
   assert.equal(body.items.filter(i=>i.refId==='b').length,1);
   assert.ok(body.editable?.includes('c'));
  };
  const response=await GET(new Request('http://local/api/targets?month=2026-10'));
  assert.equal(response.status,200); check(await response.json());
  const saved=await put('b'); assert.equal(saved.status,200); check(await saved.json());
 } finally {raw.close();}
});

// Anh Vũ 02/11/2026: Sale đặt KPI tỉ lệ chốt + doanh số; tỉ lệ lưu riêng app_settings target_rate:<tháng>, không thêm cột.
void test('KPI tỉ lệ chốt: lưu, đọc lại, người chỉ có tỉ lệ vẫn hiện, xoá khi bỏ trống', async () => {
  const { raw } = emptyDb();
  await loginAs(raw, 'owner');
  assert.equal((await PUT(req([{ scope: 'employee', refId: 's1', revenue: 300e6, closeRate: 35.5 }, { scope: 'employee', refId: 's2', closeRate: 40 }, { scope: 'team', refId: 't1', revenue: 1e9, closeRate: 30 }], ['employee:s1', 'employee:s2', 'team:t1']))).status, 200);
  type Item = { scope: string; refId: string; revenue: number; closeRate?: number | null };
  const read = async () => ((await (await GET(new Request('http://local/api/targets?month=2026-10'))).json()) as { items: Item[] }).items;
  let items = await read();
  assert.equal(items.find((i) => i.refId === 's1')?.closeRate, 35.5);
  assert.deepEqual(items.find((i) => i.refId === 's2') && { r: items.find((i) => i.refId === 's2')!.revenue, c: items.find((i) => i.refId === 's2')!.closeRate }, { r: 0, c: 40 });
  assert.equal(items.find((i) => i.scope === 'team' && i.refId === 't1')?.closeRate, 30);
  // Sửa riêng s1 (only) bỏ trống tỉ lệ: s1 mất tỉ lệ, s2 giữ nguyên.
  assert.equal((await PUT(req([{ scope: 'employee', refId: 's1', revenue: 300e6, closeRate: null }], ['employee:s1']))).status, 200);
  items = await read();
  assert.equal(items.find((i) => i.refId === 's1')?.closeRate, null);
  assert.equal(items.find((i) => i.refId === 's2')?.closeRate, 40);
  assert.equal((await PUT(req([{ scope: 'employee', refId: 's1', closeRate: 120 }], ['employee:s1']))).status, 400);
  assert.equal((await PUT(req([{ scope: 'pos', refId: 'x', closeRate: 20 }], ['pos:x']))).status, 400);
  raw.close();
});

void test('mergeTargetRates / withTargetRates: thuần, làm tròn 0,1%, chặn 100%', () => {
  assert.deepEqual(mergeTargetRates({ 'employee:a': 10, 'employee:b': 20 }, [{ scope: 'employee', refId: 'a', closeRate: 33.333 }], ['employee:a']), { 'employee:a': 33.3, 'employee:b': 20 });
  assert.deepEqual(mergeTargetRates({ 'employee:a': 10 }, [{ scope: 'employee', refId: 'b', closeRate: 0 }], null), {});
  const rows = withTargetRates([{ scope: 'pos', refId: 'p', revenue: 1, closedOrders: 0, workingDays: null, updatedAt: '' }], { 'employee:x': 25 });
  assert.equal(rows.length, 2);
  assert.equal(rows[1].closeRate, 25);
});
