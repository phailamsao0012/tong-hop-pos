import assert from 'node:assert/strict';
import { test } from 'node:test';
import { emptyDb } from './support/d1-sqlite';
import { loginAs } from './support/session';
import { GET } from '../app/api/employees/route';
import { HIDDEN_STAFF_SQL, REMOVED_STAFF_SQL } from '../lib/teams/team';
import { goneUsersStatement } from '../lib/pancake/sync';

// Anh Vũ 02/11/2026: người đã xoá khỏi POS thì loại khỏi danh sách doanh số và KPI, dữ liệu giữ nguyên.
// Số ảo: 2 POS, lượt đồng bộ người dùng mới nhất lúc 10:00.
void test('người bị xoá / khoá khỏi mọi POS: ra khỏi danh sách nhân viên và bảng theo người; còn ở 1 POS thì chỉ còn POS đó', async () => {
  const { raw } = emptyDb();
  await loginAs(raw, 'owner');
  const synced = '2026-11-02T10:00:00.000Z', old = '2026-10-30T10:00:00.000Z';
  for (const id of ['pa', 'pb']) raw.prepare("INSERT INTO pos_shops (id,name,status,enabled,users_synced_at) VALUES (?,?,'connected',1,?)").run(id, id, synced);
  const user = (pos: string, uid: string, name: string, active: number, at: string) =>
    raw.prepare('INSERT INTO pos_users (id,pos_id,user_id,name,is_active,fetched_at,department) VALUES (?,?,?,?,?,?,?)').run(`${pos}:${uid}`, pos, uid, name, active, at, 'Sale');
  user('pa', 'u1', 'An SALE', 1, old);               // còn, thông tin không đổi nên fetched_at cũ (lỗi 03/11: từng bị coi là đã xoá)
  user('pa', 'u2', 'Bình SALE', 1, old);             // Pancake không trả nữa = đã xoá
  user('pa', 'u3', 'Chi SALE', 0, synced);           // bị khoá
  user('pa', 'u4', 'Dũng SALE', 1, old);             // xoá ở pa…
  user('pb', 'u4', 'Dũng SALE', 1, old);             // …còn ở pb
  user('pa', 'u5', 'Em MỚI SALE', 1, synced);        // người mới vào POS
  // Lượt đồng bộ: pa trả u1, u3, u5; pb trả u4.
  const db = (await import('cloudflare:workers')).env.DB as D1Database;
  await goneUsersStatement(db, 'pa', ['u1', 'u3', 'u5']).run();
  await goneUsersStatement(db, 'pb', ['u4']).run();
  const list = await (await GET(new Request('http://local/api/employees'))).json() as { id: string; posIds: string[] }[];
  assert.deepEqual(list.map((e) => e.id).sort(), ['u1', 'u4', 'u5']);
  assert.deepEqual(list.find((e) => e.id === 'u4')?.posIds, ['pb']);
  const removed = (raw.prepare(REMOVED_STAFF_SQL).all() as { user_id: string }[]).map((r) => r.user_id).sort();
  assert.deepEqual(removed, ['u2', 'u3']);
  raw.prepare("INSERT INTO hr_pos_team (pos_user_id,employee_id,employee_name,team,department_id,status) VALUES ('u1','e1','NV A','sale','d','da_nghi')").run();
  assert.deepEqual((raw.prepare(HIDDEN_STAFF_SQL).all() as { user_id: string }[]).map((r) => r.user_id).sort(), ['u1', 'u2', 'u3']);
  raw.close();
});
