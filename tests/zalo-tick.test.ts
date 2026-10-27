import assert from 'node:assert/strict';
import { test } from 'node:test';
import { env } from 'cloudflare:workers';
import { emptyDb, demoWorld } from './support/d1-sqlite';
import { maybeZaloTick, zaloTeamSnapshot } from '../lib/zalo-tick';
import { saveContact, createTask, createMeeting, writeZaloSetting, DEFAULT_ZALO_SETTINGS, type Contact } from '../lib/zalo-work';
import { overviewReport } from '../lib/overview-report';
import { resolveHrUnit } from '../lib/hr-unit';
const at = (time: string) => Date.parse(`2026-10-27T${time}:00+07:00`);
async function fixture() {
  const { raw, db } = emptyDb({ DEMO_MODE: '1' });
  const boss = await saveContact(db, { name: 'Sếp demo', kind: 'boss' });
  const leader = await saveContact(db, { name: 'Leader demo', kind: 'leader', team_id: 'team-demo', team_name: 'Team demo', dept: 'sale' });
  raw.prepare('UPDATE zalo_contacts SET chat_id=id').run();
  const messages: { chat: string; text: string }[] = [];
  const send = async (chat: string, text: string) => { messages.push({ chat, text }); };
  const snapshot = async (_leader: Contact, day: string) => ({ total: day === '2026-10-26' ? 90 : new Date(clock + 7 * 3600000).getUTCHours() * 100, orders: new Date(clock + 7 * 3600000).getUTCHours(), people: { a: { name: 'Nhân viên demo SALE', total: new Date(clock + 7 * 3600000).getUTCHours() * 100, orders: new Date(clock + 7 * 3600000).getUTCHours() } } });
  let clock = at('07:59');
  const tick = async (time: string) => { clock = at(time); await maybeZaloTick(clock, { db, send, snapshot }); };
  return { raw, db, boss, leader, messages, tick, send };
}
void test('Z4 clock: morning once, slot deltas at 12/17/22, disabled reports', async () => {
  const f = await fixture();
  await f.tick('07:59'); assert.equal(f.messages.length, 0);
  await f.tick('08:00'); assert.equal(f.messages.length, 1); assert.match(f.messages[0].text, /Doanh số hôm qua: 90/);
  await f.tick('08:00'); await f.tick('08:01'); assert.equal(f.messages.length, 1);
  await f.tick('12:00'); assert.match(f.messages[1].text, /khung 8h–12h/); assert.match(f.messages[1].text, /Doanh số khung: 400/); assert.match(f.messages[1].text, /Đơn chốt: 4/);
  await f.tick('17:00'); await f.tick('22:00'); assert.match(f.messages.at(-2)!.text, /khung 17h–22h/); assert.match(f.messages.at(-2)!.text, /Doanh số khung: 500/);
  await writeZaloSetting(f.db, 'zalo_settings_v1', { ...DEFAULT_ZALO_SETTINGS, slotReports: false });
  await writeZaloSetting(f.db, 'zalo_tick_v1', {}); f.messages.length = 0; await f.tick('12:00'); assert.equal(f.messages.length, 0);
});
void test('Z4 missing snapshot explicitly says from start of day; morning disabled still captures 08', async () => {
  const f = await fixture(); await f.tick('12:00'); assert.match(f.messages[0].text, /từ đầu ngày tới 12h/);
  await writeZaloSetting(f.db, 'zalo_tick_v1', {});
  await writeZaloSetting(f.db, 'zalo_settings_v1', { ...DEFAULT_ZALO_SETTINGS, morningBrief: false });
  f.messages.length = 0; await f.tick('08:00'); assert.equal(f.messages.length, 0); await f.tick('12:00'); assert.match(f.messages[0].text, /Doanh số khung: 400/);
});
void test('Z4 due alerts go to recipient and assigner; meeting reminds once except declined/cancelled', async () => {
  const f = await fixture();
  await createTask(f.db, f.boss, { title: 'Việc thử', assigneeId: f.leader.id, dueDate: '2026-10-26' }, at('07:00'));
  await f.tick('08:00'); assert(f.messages.some(m => m.chat === f.boss.id && /Việc quá hạn/.test(m.text))); assert(f.messages.some(m => m.chat === f.leader.id && /V1/.test(m.text)));
  await createMeeting(f.db, f.boss, { title: 'Họp thử', place: '', startAt: new Date(at('10:00')).toISOString(), note: '', inviteeIds: [f.leader.id] }, at('07:00'));
  f.messages.length = 0; await f.tick('09:00'); assert.equal(f.messages.length, 1); assert.match(f.messages[0].text, /Nhắc họp/); await f.tick('09:01'); assert.equal(f.messages.length, 1);
});
void test('Z4 caps each tick at 30 messages; quiet minute performs one read returning one row', async () => {
  const f = await fixture();
  for (let n = 0; n < 40; n++) { const c = await saveContact(f.db, { name: `Leader demo ${n}`, kind: 'leader', team_id: `team-${n}`, dept: 'sale' }); f.raw.prepare('UPDATE zalo_contacts SET chat_id=id WHERE id=?').run(c.id); }
  await f.tick('12:00'); assert.equal(f.messages.length, 30);
  let reads = 0;
  const original = f.db.prepare.bind(f.db);
  f.db.prepare = ((sql: string) => { reads++; return original(sql); }) as typeof f.db.prepare;
  await f.tick('07:59'); assert.equal(reads, 1);
});
void test('Z4 real demo D1 revenue equals overviewReport for exactly the same team', async () => {
  const f = await demoWorld(['2026-10-27'], at('12:00')); Object.assign(env, { DEMO_MODE: '1' });
  const team = f.raw.prepare("SELECT department_id FROM hr_pos_team WHERE team='sale' LIMIT 1").get() as { department_id: string };
  const leader = await saveContact(f.db, { name: 'Leader demo', kind: 'leader', team_id: team.department_id, dept: 'sale', team_name: 'Team demo' });
  f.raw.prepare('UPDATE zalo_contacts SET chat_id=id').run();
  const scope = await resolveHrUnit(new URLSearchParams({ hrTeam: team.department_id }), 'sale'); assert(!(scope instanceof Response));
  const report = await overviewReport({ posIds: [], start: '2026-10-27', end: '2026-10-27', team: scope.team, unit: scope.unit });
  const snapshot = await zaloTeamSnapshot(leader, '2026-10-27'); assert.equal(snapshot!.total, report.current.total.closedNet);
  const messages: string[] = []; await maybeZaloTick(at('12:00'), { db: f.db, send: async (_chat, text) => { messages.push(text); } });
  assert.match(messages[0], new RegExp(`Doanh số khung: ${report.current.total.closedNet.toLocaleString('vi-VN')}`));
  // Unknown or mismatched team never falls back to all-team revenue.
  assert.equal(await zaloTeamSnapshot({ ...leader, team_id: 'missing' }, '2026-10-27'), null);
});
void test('Z4 idle: 10:01 once, 10:16 silent, new assignment 10:20 re-arms at 11:21; no data/outside hours silent', async () => {
  const f = await demoWorld(['2026-10-27'], at('12:00')); Object.assign(env, { DEMO_MODE: '1' });
  const member = f.raw.prepare("SELECT department_id,pos_user_id FROM hr_pos_team WHERE team='sale' AND status<>'da_nghi' LIMIT 1").get() as { department_id: string; pos_user_id: string };
  const leader = await saveContact(f.db, { name: 'Leader demo', kind: 'leader', team_id: member.department_id, dept: 'sale' });
  await saveContact(f.db, { name: 'Nhân viên demo', kind: 'staff', leader_id: leader.id, team_id: member.department_id, dept: 'sale', pos_seller_ids: JSON.stringify([member.pos_user_id]) });
  f.raw.prepare('UPDATE zalo_contacts SET chat_id=id').run();
  f.raw.prepare('UPDATE raw_pos_orders SET seller_assigned_at=NULL').run();
  const order = f.raw.prepare('SELECT id FROM raw_pos_orders LIMIT 1').get() as { id: string };
  f.raw.prepare('UPDATE raw_pos_orders SET seller_id=?,seller_assigned_at=? WHERE id=?').run(member.pos_user_id, '2026-10-27T02:00:00', order.id);
  const messages: string[] = [], send = async (_chat: string, text: string) => { messages.push(text); };
  await maybeZaloTick(at('10:01'), { db: f.db, send }); assert.equal(messages.length, 1); assert.match(messages[0], /61 phút/);
  await maybeZaloTick(at('10:16'), { db: f.db, send }); assert.equal(messages.length, 1);
  f.raw.prepare('UPDATE raw_pos_orders SET seller_assigned_at=? WHERE id=?').run('2026-10-27T03:20:00', order.id);
  await maybeZaloTick(at('11:21'), { db: f.db, send }); assert.equal(messages.length, 2);
  await maybeZaloTick(at('21:45'), { db: f.db, send }); assert.equal(messages.length, 2);
  f.raw.prepare('UPDATE raw_pos_orders SET seller_assigned_at=NULL').run();
  await maybeZaloTick(at('11:46'), { db: f.db, send }); assert.equal(messages.length, 2);
});
void test('Z4 meeting: declined, cancelled, inactive and unlinked recipients are excluded', async () => {
  const f = await fixture();
  const m = await createMeeting(f.db, f.boss, { title: 'Họp thử', place: '', startAt: new Date(at('10:00')).toISOString(), note: '', inviteeIds: [f.leader.id] }, at('07:00'));
  f.raw.prepare("UPDATE zalo_meeting_invites SET answer='khong' WHERE meeting_id=?").run(m.id);
  await f.tick('09:01'); assert.equal(f.messages.length, 0);
  f.raw.prepare('UPDATE zalo_meeting_invites SET answer=NULL').run();
  f.raw.prepare('UPDATE zalo_meetings SET cancelled_at=?').run(new Date(at('08:00')).toISOString());
  await f.tick('09:02'); assert.equal(f.messages.length, 0);
  f.raw.prepare('UPDATE zalo_meetings SET cancelled_at=NULL').run();
  f.raw.prepare('UPDATE zalo_contacts SET active=0 WHERE id=?').run(f.leader.id);
  await f.tick('09:03'); assert.equal(f.messages.length, 0);
});
