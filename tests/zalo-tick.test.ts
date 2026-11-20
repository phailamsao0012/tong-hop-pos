import assert from 'node:assert/strict';
import { test } from 'node:test';
import { env } from 'cloudflare:workers';
import { emptyDb, demoWorld } from './support/d1-sqlite';
import { maybeZaloTick, zaloTeamSnapshot, zaloMorningData } from '../lib/zalo/zalo-tick';
import { saveContact, createTask, createMeeting, writeZaloSetting, DEFAULT_ZALO_SETTINGS, type Contact } from '../lib/zalo/zalo-work';
import { overviewReport } from '../lib/reports/overview-report';
import { resolveHrUnit } from '../lib/teams/hr-unit';
import { millions } from '../lib/kpi/kpi-pace';
const at = (time: string) => Date.parse(`2026-10-27T${time}:00+07:00`);
async function fixture() {
  const { raw, db } = emptyDb({ DEMO_MODE: '1' });
  const boss = await saveContact(db, { name: 'Sếp demo', kind: 'boss' });
  const leader = await saveContact(db, { name: 'Leader demo', kind: 'leader', team_id: 'team-demo', team_name: 'Team demo', dept: 'sale' });
  raw.prepare('UPDATE zalo_contacts SET chat_id=id').run();
  const messages: { chat: string; text: string }[] = [];
  const send = async (chat: string, text: string) => { messages.push({ chat, text }); };
  const snapshot = async (_leader: Contact, day: string) => ({ total: day === '2026-10-26' ? 90 : new Date(clock + 7 * 3600000).getUTCHours() * 100, orders: new Date(clock + 7 * 3600000).getUTCHours(), people: { a: { name: 'Nhân viên demo SALE', total: new Date(clock + 7 * 3600000).getUTCHours() * 100, orders: new Date(clock + 7 * 3600000).getUTCHours() } } });
  const morningData = async (_leader: Contact, today: string) => ({ team: 'Team demo', dept: 'sale' as const, today, days: [{ day: '2026-10-26', net: 90_000_000, orders: 9, created: 20, createdClosed: 8 }], monthNet: 900_000_000, goal: null, workingDays: null, people: [] });
  const photos: { chat: string; url: string; caption: string }[] = [];
  const photoOk = { value: false };
  const sendPhoto = async (chat: string, url: string, caption: string) => { photos.push({ chat, url, caption }); return photoOk.value; };
  // Lượt gửi thử cho sếp chỉ chạy một lần; test giờ giấc coi như đã gửi.
  raw.prepare("INSERT INTO app_settings (key,value,updated_at) VALUES ('zalo_tick_v1','{\"morningTest\":\"anh-1\"}','2026-10-27T00:00:00Z')").run();
  let clock = at('07:59');
  const tick = async (time: string) => { clock = at(time); await maybeZaloTick(clock, { db, send, snapshot, morningData, sendPhoto, legacyBossSlot: true }); };
  return { raw, db, boss, leader, messages, tick, send, photos, photoOk, morningData, sendPhoto };
}
void test('Z4 clock: morning once, slot deltas at 12/17/22, disabled reports', async () => {
  const f = await fixture();
  await f.tick('07:59'); assert.equal(f.messages.length, 0);
  await f.tick('08:00'); assert.equal(f.messages.length, 1); assert.match(f.messages[0].text, /Doanh số hôm qua: 90 tr/);
  await f.tick('08:00'); await f.tick('08:01'); assert.equal(f.messages.length, 1);
  await f.tick('12:00'); assert.match(f.messages[1].text, /^📊 Team demo\nBáo cáo 12h thứ Ba 27\/10 · số từ 0h tới 12h\nDoanh số tới 12h: 0 tr/); assert.match(f.messages[1].text, /Đơn chốt 12 ·/);
  await f.tick('17:00'); await f.tick('22:00'); assert.match(f.messages.at(-1)!.text, /Báo cáo 22h/); assert.match(f.messages.at(-1)!.text, /Đơn chốt 22/);
  // Sếp không nhận bản chữ thay ảnh nữa (20/11/2026): ảnh lỗi thì chờ gửi lại; nội dung nằm ở chữ kèm ảnh.
  assert.match(f.photos.at(-1)!.caption, /^Doanh số các team\nTeam demo · khung 17h–22h: 500/); assert(!f.messages.some((m) => m.chat === f.boss.id));
  await writeZaloSetting(f.db, 'zalo_settings_v1', { ...DEFAULT_ZALO_SETTINGS, slotReports: false });
  await writeZaloSetting(f.db, 'zalo_tick_v1', { morningTest: 'anh-1' }); f.messages.length = 0; await f.tick('12:00'); assert.equal(f.messages.length, 0);
});
void test('báo cáo 8h: gửi ảnh kèm chữ; Zalo không nhận ảnh thì gửi chữ; gửi thử cho sếp đúng một lần', async () => {
  const f = await fixture();
  await f.tick('08:00');
  assert.equal(f.photos.length, 1); assert.match(f.photos[0].url, /\/api\/zalo\/anh\/[0-9a-f]{32}$/); assert.match(f.photos[0].caption, /Doanh số hôm qua: 90 tr/);
  assert.equal(f.messages.length, 1); // ảnh bị từ chối → bản chữ
  f.photoOk.value = true; f.photos.length = 0; f.messages.length = 0;
  await writeZaloSetting(f.db, 'zalo_tick_v1', {});
  await f.tick('09:30');
  assert.equal(f.photos.length, 1); assert.equal(f.photos[0].chat, f.boss.id); assert.match(f.photos[0].caption, /^Gửi thử báo cáo 8h/);
  assert.equal(f.messages.length, 0);
  await f.tick('09:31'); assert.equal(f.photos.length, 1);
});
void test('Z4 missing snapshot explicitly says from start of day; morning disabled still captures 08', async () => {
  const f = await fixture(); await f.tick('12:00'); assert.match(f.messages[0].text, /số từ 0h tới 12h/); assert.match(f.photos.at(-1)!.caption, /từ đầu ngày tới 12h|khung 8h–12h/);
  await writeZaloSetting(f.db, 'zalo_tick_v1', {});
  await writeZaloSetting(f.db, 'zalo_settings_v1', { ...DEFAULT_ZALO_SETTINGS, morningBrief: false });
  f.messages.length = 0; await f.tick('08:00'); assert.equal(f.messages.length, 0); await f.tick('12:00'); assert.match(f.messages[0].text, /Đơn chốt 12/); assert.match(f.photos.at(-1)!.caption, /khung 8h–12h: 400/);
});
void test('Z4 due alerts go to recipient and assigner; meeting reminds once except declined/cancelled', async () => {
  const f = await fixture();
  await createTask(f.db, f.boss, { title: 'Việc thử', assigneeId: f.leader.id, dueDate: '2026-10-26' }, at('07:00'));
  await f.tick('08:00'); assert(f.messages.some(m => m.chat === f.boss.id && /Việc quá hạn/.test(m.text))); assert(f.messages.some(m => m.chat === f.leader.id && /Việc số 1/.test(m.text)));
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
  const messages: string[] = []; await maybeZaloTick(at('12:00'), { db: f.db, legacyBossSlot: true, send: async (_chat, text) => { messages.push(text); }, sendPhoto: async (_chat, _url, caption) => { messages.push(caption); return true; } });
  assert.match(messages[0], new RegExp(`Doanh số tới 12h: ${millions(report.current.total.closedNet)}`));
  // Báo cáo 8h: doanh số hôm qua khớp báo cáo tổng quan cùng team, cùng ngày.
  const morning = await zaloMorningData(leader, '2026-10-28');
  assert.equal(morning!.days.find((d) => d.day === '2026-10-27')?.net ?? 0, report.current.total.closedNet);
  assert.equal(morning!.people.reduce((a, p) => a + p.net, 0) <= report.current.total.closedNet, true);
  assert.equal(await zaloMorningData({ ...leader, team_id: 'missing' }, '2026-10-28'), null);
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
void test('báo cáo 12h/17h/22h: leader và sếp đều nhận ảnh kèm chữ (03/11/2026)', async () => {
  const f = await fixture();
  f.photoOk.value = true;
  await f.tick('08:00'); f.photos.length = 0; f.messages.length = 0;
  await f.tick('12:00');
  const leader = f.photos.find((p) => p.chat === f.leader.id), boss = f.photos.find((p) => p.chat === f.boss.id);
  assert.ok(leader && boss);
  assert.match(leader.url, /\/api\/zalo\/anh\/[0-9a-f]{32}$/);
  assert.match(leader.caption, /Báo cáo 12h thứ Ba 27\/10/); assert.match(leader.caption, /Đơn chốt 12 ·/);
  assert.match(boss.caption, /^Doanh số các team\nTeam demo · khung 8h–12h: 400 · Luỹ kế: 1\.200/);
  assert.equal(f.messages.length, 0);
});
void test('báo cáo ca: Leader gắn tài khoản nhận ảnh của từng team mình quản ở Chia team', async () => {
  const f = await fixture();
  f.raw.prepare("UPDATE zalo_contacts SET user_id='lead-1' WHERE id=?").run(f.leader.id);
  await writeZaloSetting(f.db, 'web_teams_v1', [
    { id: 'wt_a', name: 'Team A', dept: 'sale', office: null, memberIds: [], leaderUserId: 'lead-1' },
    { id: 'wt_b', name: 'Team B', dept: 'sale', office: null, memberIds: [], leaderUserId: 'lead-1' },
  ]);
  f.photoOk.value = true;
  await f.tick('08:00'); f.photos.length = 0;
  await f.tick('12:00');
  const mine = f.photos.filter((p) => p.chat === f.leader.id).map((p) => p.caption.split('\n')[0]);
  assert.deepEqual(mine, ['📊 Team A', '📊 Team B']);
  assert.match(f.photos.find((p) => p.chat === f.boss.id)!.caption, /Team A[\s\S]*Team B|Team B[\s\S]*Team A/);
});

void test('báo cáo tổng quan cho sếp (14/11/2026): 8h và mỗi ca, sếp nhận 2 ảnh bossReport, không còn ảnh gộp cũ', async () => {
  const f = await fixture();
  const calls: { day: string; hour: string; morning: boolean }[] = [];
  const bossData = async (day: string, hour: string, morning: boolean) => {
    calls.push({ day, hour, morning });
    return { day, until: morning ? null : `${Number(hour)}h`, title: 't', range: 'r', company: { net: 0, orders: 0, yesterday: 0 },
      sale: { kpi: { goal: null, monthNet: 0, todayNet: 0 }, base: 0, closed: 0, prevBase: 0, prevClosed: 0, packed: 0, returned: 0, cancelled: 0, teams: [], people: [] },
      cskh: { kpi: { goal: null, monthNet: 0, todayNet: 0 }, orders: 0, prevOrders: 0, base: 0, closed: 0, prevBase: 0, prevClosed: 0, teams: [], people: [] },
      mkt: { kpi: { goal: null, monthNet: 0, todayNet: 0 }, leads: 0, monthLeads: 0, leadsGoal: null, cost: 0, teams: [], people: [] },
      pos: [], ship: { packed: 0, closed: 0, vtp: 0, spx: 0 }, overdueTasks: 0 };
  };
  f.photoOk.value = true;
  const tick = (time: string) => maybeZaloTick(at(time), { db: f.db, send: f.send, snapshot: async () => ({ total: 100, orders: 1, people: {} }), morningData: f.morningData, sendPhoto: f.sendPhoto, bossData });
  await tick('08:00');
  await tick('12:00');
  // 8h: 2 báo cáo riêng — trọn ngày hôm qua và hôm nay 0h→8h (anh Vũ 15/11/2026); 12h: 1 báo cáo.
  assert.deepEqual(calls.map((c) => [c.hour, c.morning]), [['08', true], ['08', false], ['12', false]]);
  const toBoss = f.photos.filter((p) => p.chat === f.boss.id);
  assert.equal(toBoss.length, 6, '2 ảnh mỗi báo cáo');
  const kinds = f.raw.prepare("SELECT value FROM app_settings WHERE key LIKE 'zalo_img:%'").all().map((r) => JSON.parse((r as { value: string }).value).kind);
  assert.ok(kinds.includes('bossReport'));
  assert.ok(!kinds.includes('bossSlot'), 'không gửi ảnh gộp cũ');
});

void test('gửi ngay báo cáo sếp (14/11/2026): sendBossReportNow gửi 2 ảnh mốc 22h, cắt số đúng 22h', async () => {
  const f = await fixture();
  const { sendBossReportNow } = await import('../lib/zalo/zalo-tick');
  const calls: { day: string; hour: string; morning: boolean; now: number }[] = [];
  const bossData = async (day: string, hour: string, morning: boolean, now?: number) => {
    calls.push({ day, hour, morning, now: now ?? 0 });
    return { day, until: `${Number(hour)}h`, title: 't', range: 'r', company: { net: 0, orders: 0, yesterday: 0 },
      sale: { kpi: { goal: null, monthNet: 0, todayNet: 0 }, base: 0, closed: 0, prevBase: 0, prevClosed: 0, packed: 0, returned: 0, cancelled: 0, teams: [], people: [] },
      cskh: { kpi: { goal: null, monthNet: 0, todayNet: 0 }, orders: 0, prevOrders: 0, base: 0, closed: 0, prevBase: 0, prevClosed: 0, teams: [], people: [] },
      mkt: { kpi: { goal: null, monthNet: 0, todayNet: 0 }, leads: 0, monthLeads: 0, leadsGoal: null, cost: 0, teams: [], people: [] },
      pos: [], ship: { packed: 0, closed: 0, vtp: 0, spx: 0 }, overdueTasks: 0 };
  };
  f.photoOk.value = true;
  const out = await sendBossReportNow(f.db, '2026-11-14', '22', { sendPhoto: f.sendPhoto, send: f.send, bossData });
  assert.deepEqual(calls.map((c) => [c.day, c.hour, c.morning, new Date(c.now).toISOString()]), [['2026-11-14', '22', false, '2026-11-14T15:00:00.000Z']]);
  assert.equal(f.photos.filter((p) => p.chat === f.boss.id).length, 2);
  assert.ok(out.every((o) => o.photo) && out.length === 2);
});
