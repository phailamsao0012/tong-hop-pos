import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { d1 } from './support/d1-sqlite';
import { STATUS_LABELS, canMove, parseCommand, taskState, weekOfMonth, saveContact, createPairCode, redeemPairCode, contactByChat, deactivateContact, teamStaff, createTask, moveTask, addTaskNote, editTask, listTasks, createMeeting, answerMeeting, cancelMeeting, listMeetings, weekSummary, formatTaskMessage, formatMeetingMessage, formatHelp, formatList, formatWeek, formatSlotReport, formatMorning, formatIdleAlert, formatOverdue, type Task, type Status, type Actor, type Command } from '../lib/zalo-work';
const now = Date.parse('2026-10-27T03:00:00Z');
function database() {
  const raw = new DatabaseSync(':memory:');
  raw.exec(readFileSync(new URL('../drizzle/0047_giao_viec_zalo.sql', import.meta.url), 'utf8')); raw.exec(readFileSync(new URL('../drizzle/0048_zalo_task_time.sql', import.meta.url), 'utf8').replaceAll('--> statement-breakpoint', ''));
  raw.exec('CREATE TABLE app_settings (key TEXT PRIMARY KEY,value TEXT NOT NULL,updated_at TEXT NOT NULL)');
  return { raw, db: d1(raw) };
}
const base: Actor = { id: 'staff-a', name: 'Trần Thị Thu Hằng', kind: 'staff', user_id: null, team_id: 'a', team_name: '', dept: 'sale', leader_id: 'leader-a', pos_seller_ids: '[]', chat_id: null, active: 1 };
const task: Task = { id: 't', no: 12, title: 'Việc thử', detail: '', assignee_id: base.id, assigner_id: 'leader-a', parent_id: null, urgent: 0, due_date: null, status: 'moi', reason: '', created_at: '', updated_at: '', done_at: null };
const cases: [string, Command][] = [
  ['123456', { cmd: 'pair', code: '123456' }], ['000001', { cmd: 'pair', code: '000001' }],
  ['12 xong', { cmd: 'status', no: 12, to: 'xong' }], ['V12 xong', { cmd: 'status', no: 12, to: 'xong' }],
  ['v12 chưa khách không nghe', { cmd: 'status', no: 12, to: 'chua_xong', reason: 'khách không nghe' }], ['V12 chua', { cmd: 'status', no: 12, to: 'chua_xong' }],
  [' V12   NHẬN ', { cmd: 'status', no: 12, to: 'da_nhan' }], ['v12 nhan', { cmd: 'status', no: 12, to: 'da_nhan' }],
  ['12 đang', { cmd: 'status', no: 12, to: 'dang_lam' }], ['V12 DANG', { cmd: 'status', no: 12, to: 'dang_lam' }], ['V12 ĐANG', { cmd: 'status', no: 12, to: 'dang_lam' }],
  ['12 chua bận', { cmd: 'status', no: 12, to: 'chua_xong', reason: 'bận' }], ['V12 đã gọi 20 khách', { cmd: 'note', no: 12, body: 'đã gọi 20 khách' }],
  ['V12 xong rồi', { cmd: 'note', no: 12, body: 'xong rồi' }], ['H5 co', { cmd: 'meeting', no: 5, answer: 'co' }],
  ['h5 CÓ', { cmd: 'meeting', no: 5, answer: 'co' }], ['H5 không bận việc nhà', { cmd: 'meeting', no: 5, answer: 'khong', reason: 'bận việc nhà' }],
  ['H5 khong', { cmd: 'meeting', no: 5, answer: 'khong' }], ['viec', { cmd: 'list' }], [' VIỆC ', { cmd: 'list' }],
  ['team', { cmd: 'team' }], ['TEAM', { cmd: 'team' }], ['tuần', { cmd: 'week' }], ['tuan', { cmd: 'week' }],
  ['?', { cmd: 'help' }], ['HD', { cmd: 'help' }], ['hướng dẫn', { cmd: 'help' }], ['huong dan', { cmd: 'help' }],
  ['giao 2: gọi lại khách han 30/10', { cmd: 'assign', who: '2', title: 'gọi lại khách', due: '30/10' }],
  ['giao Trần Thị Thu Hằng: việc thử', { cmd: 'assign', who: 'Trần Thị Thu Hằng', title: 'việc thử' }],
  ['GIAO 1 : việc HẠN 31/10', { cmd: 'assign', who: '1', title: 'việc', due: '31/10' }],
  ['nhận việc 12', { cmd: 'status', no: 12, to: 'da_nhan' }], ['nhan viec so 12', { cmd: 'status', no: 12, to: 'da_nhan' }], ['Đang làm việc 12', { cmd: 'status', no: 12, to: 'dang_lam' }],
  ['xong việc 12', { cmd: 'status', no: 12, to: 'xong' }], ['Xong 12', { cmd: 'status', no: 12, to: 'xong' }], ['đã xong việc 12', { cmd: 'status', no: 12, to: 'xong' }],
  ['chưa xong việc 12: Khách không nghe máy', { cmd: 'status', no: 12, to: 'chua_xong', reason: 'Khách không nghe máy' }], ['chua xong viec 12', { cmd: 'status', no: 12, to: 'chua_xong' }],
  ['ghi chú việc 12: Đã gọi 20 khách', { cmd: 'note', no: 12, body: 'Đã gọi 20 khách' }],
  ['đi họp 5', { cmd: 'meeting', no: 5, answer: 'co' }], ['tham gia họp 5', { cmd: 'meeting', no: 5, answer: 'co' }],
  ['không đi họp 5: Bận việc nhà', { cmd: 'meeting', no: 5, answer: 'khong', reason: 'Bận việc nhà' }], ['khong di hop 5', { cmd: 'meeting', no: 5, answer: 'khong' }],
  ['việc của tôi', { cmd: 'list' }], ['việc tuần này', { cmd: 'week' }], ['Nhân viên', { cmd: 'team' }], ['menu', { cmd: 'help' }],
  ['giao việc: Thu Hằng, gọi lại khách cũ, hạn 3/11', { cmd: 'assign', who: 'Thu Hằng', title: 'gọi lại khách cũ', due: '03/11' }],
  ['giao việc: 2, gọi lại khách, nhắn tin', { cmd: 'assign', who: '2', title: 'gọi lại khách, nhắn tin' }],
  ['thêm nhân viên: Lê Văn Bình', { cmd: 'add', name: 'Lê Văn Bình' }], ['them Lê Văn Bình', { cmd: 'add', name: 'Lê Văn Bình' }],
  ['giao việc: Hằng', { cmd: 'unknown' }], ['nhận việc 0', { cmd: 'unknown' }],
  ['', { cmd: 'unknown' }], ['tin rác', { cmd: 'unknown' }], ['12345', { cmd: 'unknown' }], ['1234567', { cmd: 'unknown' }], ['V0 xong', { cmd: 'unknown' }], ['H0 co', { cmd: 'unknown' }], ['giao 2:', { cmd: 'unknown' }], ['V12', { cmd: 'unknown' }],
];
for (const [input, expected] of cases) void test(`parseCommand ${JSON.stringify(input)}`, () => assert.deepEqual(parseCommand(input), expected));
void test('canMove: toàn bộ bảng chuyển, người giao, người nhận, leader khác và người lạ', () => {
  const allowed: Record<Status, Status[]> = { moi: ['da_nhan', 'dang_lam', 'chua_xong'], da_nhan: ['dang_lam', 'xong', 'chua_xong'], dang_lam: ['xong', 'chua_xong'], chua_xong: ['dang_lam', 'xong'], xong: ['dang_lam'], huy: [] };
  for (const from of Object.keys(STATUS_LABELS) as Status[]) for (const to of Object.keys(STATUS_LABELS) as Status[]) {
    const t = { ...task, status: from };
    assert.equal(canMove(base, t, to), allowed[from].includes(to));
    assert.equal(canMove({ ...base, id: t.assigner_id, kind: 'leader' }, t, to), true);
    assert.equal(canMove({ ...base, id: 'owner', owner: true }, t, to), true);
    assert.equal(canMove({ ...base, id: 'other' }, t, to), false);
    assert.equal(canMove({ ...base, id: 'other-leader', kind: 'leader' }, t, to), false);
    assert.equal(canMove({ ...base, active: 0 }, t, to), false);
  }
  assert.equal(canMove({ ...base, id: 'leader-a', kind: 'leader' }, { ...task, assigner_id: 'boss' }, 'xong'), false);
});
void test('weekOfMonth: Chủ nhật, tháng 2, tuần 6 và giao năm', () => {
  assert.deepEqual(weekOfMonth('2026-11-01'), { month: '2026-11', week: 1, from: '2026-10-26', to: '2026-11-01' });
  assert.equal(weekOfMonth('2026-11-30').week, 6);
  assert.equal(weekOfMonth('2024-02-29').week, 5);
  assert.equal(weekOfMonth('2026-02-28').week, 5);
  assert.equal(weekOfMonth('2027-01-01').from, '2026-12-28');
  assert.throws(() => weekOfMonth('2026-02-30'));
});
void test('taskState: đủ bảy tình trạng hạn', () => {
  for (const [status, due_date, expected] of [['xong', null, 'done'], ['huy', null, 'cancelled'], ['moi', null, 'none'], ['moi', '2026-10-26', 'overdue'], ['moi', '2026-10-27', 'today'], ['moi', '2026-10-29', 'soon'], ['moi', '2026-10-30', 'later']] as const) assert.equal(taskState({ status, due_date }, '2026-10-27'), expected);
});
async function fixture() {
  const data = database(), { db } = data;
  const boss = await saveContact(db, { name: 'Đỗ Quang Huy', kind: 'boss', id: 'boss' }, now);
  const a = await saveContact(db, { name: 'Nguyễn Đức Mạnh', kind: 'leader', id: 'leader-a', team_id: 'a', dept: 'sale' }, now);
  const b = await saveContact(db, { name: 'Bùi Thanh Tùng', kind: 'leader', id: 'leader-b', team_id: 'b', dept: 'sale' }, now);
  const staff = await saveContact(db, { name: base.name, kind: 'staff', id: base.id, leader_id: a.id }, now);
  const other = await saveContact(db, { name: 'Đinh Thị Phương Thảo', kind: 'staff', id: 'staff-b', leader_id: b.id }, now);
  return { ...data, boss, a, b, staff, other };
}
void test('mã nối: đúng, sai, hết hạn, dùng lại, chuyển chat, mã mới thay mã cũ và khoá một giờ', async () => {
  const { db, a, b } = await fixture();
  let code = await createPairCode(db, a.id, now);
  assert.match(code, /^\d{6}$/);
  assert.equal((await redeemPairCode(db, 'invalid', 'chat', now)).ok, false);
  assert.equal((await redeemPairCode(db, code, 'chat', now)).ok, true);
  assert.equal((await redeemPairCode(db, code, 'other-chat', now)).ok, false);
  code = await createPairCode(db, b.id, now);
  assert.equal((await redeemPairCode(db, code, 'chat', now)).ok, true);
  assert.equal((await contactByChat(db, 'chat'))?.id, b.id);
  code = await createPairCode(db, b.id, now);
  assert.equal((await redeemPairCode(db, code, 'new-chat', now)).ok, true);
  assert.equal(await contactByChat(db, 'chat'), null);
  const old = await createPairCode(db, a.id, now);
  code = await createPairCode(db, a.id, now);
  assert.equal((await redeemPairCode(db, old, 'expired', now)).ok, false);
  assert.equal((await redeemPairCode(db, code, 'expired', now + 86400000)).ok, false);
  for (let i = 0; i < 5; i++) { const r = await redeemPairCode(db, 'invalid', 'blocked', now); assert.equal('silent' in r && r.silent, i === 4); }
  code = await createPairCode(db, a.id, now);
  assert.deepEqual(await redeemPairCode(db, code, 'blocked', now + 3599999), { ok: false, silent: true });
  assert.equal((await redeemPairCode(db, code, 'blocked', now + 3600000)).ok, true);
});
void test('danh bạ: kiểm tên, leader, POS, đánh số và vô hiệu hoá', async () => {
  const { db, a, staff } = await fixture();
  await assert.rejects(saveContact(db, { name: '', kind: 'leader' }));
  await assert.rejects(saveContact(db, { name: 'x'.repeat(61), kind: 'leader' }));
  await assert.rejects(saveContact(db, { name: base.name, kind: 'staff', leader_id: 'missing' }));
  await assert.rejects(saveContact(db, { name: base.name, kind: 'staff', leader_id: a.id, pos_seller_ids: '[1]' }));
  assert.equal((await teamStaff(db, a.id))[0].no, 1);
  assert.equal(staff.team_id, a.team_id);
  const code = await createPairCode(db, staff.id, now); await redeemPairCode(db, code, 'staff-chat', now);
  await deactivateContact(db, staff.id, now);
  assert.equal(await contactByChat(db, 'staff-chat'), null);
  assert.deepEqual(await teamStaff(db, a.id), []);
});
void test('việc: cách ly team, nhân viên, lý do, event, sửa và tổng hợp tuần', async () => {
  const { db, raw, boss, a, b, staff, other } = await fixture();
  const parent = await createTask(db, boss, { title: 'Việc leader', assigneeId: a.id }, now);
  const t = await createTask(db, a, { title: 'Việc nhân viên', assigneeId: staff.id, parentId: parent.id, dueDate: '2026-10-26' }, now);
  assert.equal(t.no, parent.no + 1);
  await assert.rejects(createTask(db, a, { title: 'Sai team', assigneeId: other.id }, now));
  assert.equal((await listTasks(db, { actor: b, status: 'all' }, now)).length, 0);
  assert.equal((await listTasks(db, { actor: a, status: 'all' }, now)).length, 2);
  await assert.rejects(moveTask(db, b, t.no, 'dang_lam', '', now));
  await assert.rejects(moveTask(db, other, t.no, 'dang_lam', '', now));
  await assert.rejects(moveTask(db, staff, t.no, 'chua_xong', '', now));
  await assert.rejects(moveTask(db, staff, t.no, 'xong', '', now));
  await moveTask(db, staff, t.no, 'dang_lam', '', now);
  await moveTask(db, staff, t.no, 'chua_xong', 'Chưa gọi được', now);
  await addTaskNote(db, staff, t.no, 'Ghi chú thử', now);
  await assert.rejects(addTaskNote(db, b, t.no, 'Sai team', now));
  await assert.rejects(editTask(db, staff, t.no, { title: 'Sai quyền' }, now));
  await editTask(db, a, t.no, { urgent: true }, now);
  assert.equal((await weekSummary(db, a.id, '2026-10-27'))[0].overdue, 1);
  await moveTask(db, staff, t.no, 'xong', '', now);
  assert.equal((await weekSummary(db, a.id, '2026-10-27'))[0].done, 1);
  assert.equal((await listTasks(db, { actor: staff, status: 'closed' }, now)).length, 1);
  assert.equal((await listTasks(db, { actor: staff, status: 'closed' }, now + 46 * 86400000)).length, 0);
  assert.equal(raw.prepare('SELECT COUNT(*) AS n FROM zalo_task_events').get()!.n, 5);
});
void test('moveTask: trạng thái cũ sai không ghi event hoặc đè trạng thái', async () => {
  const { db, raw, boss, a } = await fixture(); const t = await createTask(db, boss, { title: 'Việc thử', assigneeId: a.id }, now);
  const raced = { prepare: db.prepare.bind(db), batch: async (statements: D1PreparedStatement[]) => { raw.prepare("UPDATE zalo_tasks SET status='huy' WHERE id=?").run(t.id); return db.batch(statements); } } as D1Database;
  await assert.rejects(moveTask(raced, a, t.no, 'dang_lam', '', now), /Trạng thái đã thay đổi/);
  assert.equal(raw.prepare('SELECT status FROM zalo_tasks WHERE id=?').get(t.id)!.status, 'huy');
  assert.equal(raw.prepare('SELECT COUNT(*) AS n FROM zalo_task_events').get()!.n, 0);
});
void test('lọc tháng/tuần, 45 ngày và trần 500', async () => {
  const { db, raw, boss, a } = await fixture();
  await createTask(db, boss, { title: 'Tuần 1', assigneeId: a.id, dueDate: '2026-11-01' }, now);
  await createTask(db, boss, { title: 'Tuần 6', assigneeId: a.id, dueDate: '2026-11-30' }, now);
  assert.equal((await listTasks(db, { actor: boss, month: '2026-11', week: 6, status: 'all' }, now))[0].title, 'Tuần 6');
  assert.equal((await listTasks(db, { actor: boss, month: '2026-11', week: 1, status: 'all' }, now)).length, 1);
  const insert = raw.prepare("INSERT INTO zalo_tasks (id,no,title,assignee_id,assigner_id,created_at,updated_at) VALUES (?,?,'Thử',?,?,?,?)");
  for (let i = 3; i < 510; i++) insert.run(String(i), i, a.id, boss.id, new Date(now).toISOString(), new Date(now).toISOString());
  assert.equal((await listTasks(db, { actor: boss, status: 'all' }, now)).length, 500);
});
void test('họp: số ngắn, lời mời, trả lời, lý do, đếm và huỷ', async () => {
  const { db, boss, a, b, staff } = await fixture();
  const m = await createMeeting(db, boss, { title: 'Họp thử', place: 'Phòng demo', startAt: '2026-10-28T03:00:00Z', note: '', inviteeIds: [a.id, b.id, a.id] }, now);
  assert.equal(m.no, 1);
  await assert.rejects(createMeeting(db, a, { title: 'Sai quyền', place: '', startAt: new Date(now).toISOString(), note: '', inviteeIds: [] }, now));
  await assert.rejects(answerMeeting(db, staff.id, m.no, 'co', '', now));
  await assert.rejects(answerMeeting(db, b.id, m.no, 'khong', '', now));
  await answerMeeting(db, a.id, m.no, 'co', '', now);
  await answerMeeting(db, b.id, m.no, 'khong', 'Bận việc', now);
  const list = await listMeetings(db, { from: '2026-10-27', to: '2026-10-29' });
  assert.equal(list[0].yes, 1); assert.equal(list[0].noAnswer, 1); assert.equal(list[0].pending, 0);
  await assert.rejects(cancelMeeting(db, a, m.no, now));
  await cancelMeeting(db, boss, m.no, now);
  await assert.rejects(answerMeeting(db, a.id, m.no, 'co', '', now));
});
void test('định dạng: tiếng Việt, phạm vi số và giới hạn 2000 ký tự', () => {
  const t = { ...task, title: 'x'.repeat(3000), detail: 'x'.repeat(3000) };
  const m = { id: 'm', no: 5, title: t.title, place: '', start_at: new Date(now).toISOString(), note: t.detail, created_by: 'boss', cancelled_at: null };
  const messages = [formatTaskMessage(t), formatMeetingMessage(m), formatHelp('leader'), formatList([t]), formatWeek([{ name: t.title, open: 1, overdue: 1, done: 0 }]), formatSlotReport({ team: 'Demo', slot: 'khung 8h–12h', total: 10, cumulative: 20, orders: 1, top: [], noOrders: [t.title] }), formatMorning({ team: 'Demo', yesterday: 10, tasks: [t], meetings: [m] }), formatIdleAlert(t.title, 75, '09:40'), formatOverdue([t])];
  for (const text of messages) assert.ok(text.length <= 2000);
  assert.match(formatOverdue([t]), /quá hạn/);
});
void test('mã nối: hai lần đổi đồng thời chỉ một lần thành công', async () => {
  const { db, a } = await fixture();
  const code = await createPairCode(db, a.id, now);
  const results = await Promise.all([redeemPairCode(db, code, 'chat-1', now), redeemPairCode(db, code, 'chat-2', now)]);
  assert.equal(results.filter(r => r.ok).length, 1);
  assert.equal(Number(Boolean(await contactByChat(db, 'chat-1'))) + Number(Boolean(await contactByChat(db, 'chat-2'))), 1);
});
void test('migration: chạy lại không đổi bảng cũ và chỉ tạo chỉ mục trên bảng Zalo', () => {
  const { raw } = database();
  raw.exec(readFileSync(new URL('../drizzle/0047_giao_viec_zalo.sql', import.meta.url), 'utf8'));
  const indexes = raw.prepare("SELECT tbl_name FROM sqlite_master WHERE type='index' AND name LIKE 'idx_%'").all();
  assert.ok(indexes.length > 0);
  assert.ok(indexes.every(r => String(r.tbl_name).startsWith('zalo_')));
});
void test('mã nối: giới hạn 50, dọn mã hết hạn và bỏ mã người đã vô hiệu hoá', async () => {
  const { db, a } = await fixture();
  let code = '';
  for (let i = 0; i < 50; i++) {
    const c = await saveContact(db, { id: 'extra-' + i, name: base.name, kind: 'leader' }, now);
    code = await createPairCode(db, c.id, now);
  }
  await assert.rejects(createPairCode(db, a.id, now), /50 mã/);
  const next = await createPairCode(db, a.id, now + 86400000);
  assert.equal((await redeemPairCode(db, code, 'expired-cap', now + 86400000)).ok, false);
  await deactivateContact(db, a.id, now + 86400000);
  assert.equal((await redeemPairCode(db, next, 'inactive-chat', now + 86400000)).ok, false);
});
void test('tin họp dùng giờ Việt Nam và dd/mm hh:mm', () => {
  assert.match(formatMeetingMessage({ id: 'm', no: 1, title: 'Họp thử', place: '', start_at: '2026-10-27T20:30:00Z', note: '', created_by: 'boss', cancelled_at: null }), /28\/10 03:30 \(giờ Việt Nam\)/);
});
void test('taskState: hạn có giờ, qua giờ trong ngày hạn là quá hạn', () => {
  const t = { status: 'moi' as Status, due_date: '2026-10-28', due_time: '17:00' };
  assert.equal(taskState(t, '2026-10-28', '16:59'), 'today');
  assert.equal(taskState(t, '2026-10-28', '17:01'), 'overdue');
  assert.equal(taskState({ ...t, due_time: null }, '2026-10-28', '23:00'), 'today');
});
