import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyDb } from './support/d1-sqlite';
import { seedZaloWork } from '../lib/demo/zalo-work';
import { STAFF } from '../lib/demo/world';
import { saveContact, createTask, createMeeting, handleZaloUpdate, type Actor } from '../lib/zalo/zalo-work';
import { listConversations, listMessages, markRead, sendChat, remindInChat, pruneMessages, logMessage, saveGroup, listGroups, sendGroup, groupMessages, deleteGroup } from '../lib/zalo/zalo-chat';

const now = Date.parse('2026-10-29T03:00:00Z');
async function fixture() {
  const { raw, db } = emptyDb();
  const boss: Actor = await saveContact(db, { id: 'boss-1', name: 'Sếp Thử', kind: 'boss', user_id: 'u1' }, now);
  const leader = await saveContact(db, { id: 'leader-1', name: 'Leader Thử', kind: 'leader', team_id: 't1', team_name: 'Team Thử', dept: 'sale' }, now);
  const unlinked = await saveContact(db, { id: 'leader-2', name: 'Leader Chưa Nối', kind: 'leader', team_id: 't2', team_name: 'Team Hai', dept: 'sale' }, now);
  raw.prepare("UPDATE zalo_contacts SET chat_id='chat-1' WHERE id='leader-1'").run();
  raw.prepare("UPDATE zalo_contacts SET chat_id='chat-boss' WHERE id='boss-1'").run();
  const sent: { chatId: string; text: string }[] = [];
  const send = async (chatId: string, text: string) => { sent.push({ chatId, text }); };
  const rows = (contactId: string) => raw.prepare('SELECT dir,kind,ref_no,body,delivered,author_id,read_at FROM zalo_messages WHERE contact_id=? ORDER BY created_at,rowid').all(contactId) as { dir: string; kind: string; ref_no: number | null; body: string; delivered: number; author_id: string | null; read_at: string | null }[];
  return { raw, db, boss, leader: { ...leader, chat_id: 'chat-1' }, unlinked, sent, send, rows };
}

void test('chat: giao việc ghi 1 tin out kind task; leader nhắn "nhận việc" ghi tin in status + lời bot trả lời', async () => {
  const { db, boss, leader, send, rows } = await fixture();
  const t = await createTask(db, boss, { title: 'Gọi lại khách cũ', assigneeId: leader.id, dueDate: '2026-10-30' }, now, send);
  assert.deepEqual(rows(leader.id).map(r => [r.dir, r.kind, r.ref_no, r.delivered]), [['out', 'task', t.no, 1]]);
  await handleZaloUpdate(db, { message: { chat: { id: 'chat-1' }, text: `nhận việc ${t.no}` } }, send, now + 60000);
  const after = rows(leader.id);
  assert.deepEqual(after.slice(1).map(r => [r.dir, r.kind, r.ref_no]), [['in', 'status', t.no], ['out', 'text', null]]);
  assert.match(after[2].body, /Đã ghi: việc số \d+ Đã nhận/);
  // Tin báo về cho sếp (người giao) không ghi vào chat.
  assert.equal(rows('boss-1').length, 0);
});

void test('chat: mã nối 6 số và tin của người chưa nối không ghi', async () => {
  const { raw, db, send } = await fixture();
  await handleZaloUpdate(db, { message: { chat: { id: 'chat-1' }, text: '123456' } }, send, now);
  await handleZaloUpdate(db, { message: { chat: { id: 'chat-la' }, text: 'xin chào' } }, send, now);
  assert.equal((raw.prepare('SELECT COUNT(*) n FROM zalo_messages').get() as { n: number }).n, 0);
});

void test('chat: người chưa nối Zalo vẫn có tin out với delivered=0', async () => {
  const { db, boss, unlinked, send, sent, rows } = await fixture();
  await createTask(db, boss, { title: 'Việc cho người chưa nối', assigneeId: unlinked.id }, now, send);
  assert.equal(sent.length, 0);
  assert.deepEqual(rows(unlinked.id).map(r => [r.dir, r.delivered]), [['out', 0]]);
  const r = await sendChat(db, boss, unlinked.id, 'Anh nối Zalo giúp em nhé', now, send);
  assert.equal(r.delivered, false);
});

void test('chat: đếm chưa đọc, markRead về 0, danh sách có việc mở/quá hạn/họp', async () => {
  const { db, boss, leader, send } = await fixture();
  await createTask(db, boss, { title: 'Quá hạn', assigneeId: leader.id, dueDate: '2026-10-28' }, now, send);
  await createTask(db, boss, { title: 'Còn hạn', assigneeId: leader.id, dueDate: '2026-11-02' }, now, send);
  await createMeeting(db, boss, { title: 'Họp tuần', place: 'Phòng 1', startAt: new Date(now + 3 * 3600000).toISOString(), note: '', inviteeIds: [leader.id] }, now, send);
  for (const text of ['em chào anh', 'em gửi báo cáo rồi']) await handleZaloUpdate(db, { message: { chat: { id: 'chat-1' }, text } }, send, now + 60000);
  let c = (await listConversations(db, now + 120000)).find(x => x.id === leader.id)!;
  assert.equal(c.unread, 2); assert.equal(c.open, 2); assert.equal(c.overdue, 1); assert.ok(c.nextMeeting); assert.equal(c.linked, true);
  assert.equal(c.last?.dir, 'out');
  await markRead(db, leader.id, now + 180000);
  c = (await listConversations(db, now + 180000)).find(x => x.id === leader.id)!;
  assert.equal(c.unread, 0);
});

void test('chat: listMessages trả thẻ việc/họp mới nhất; after chỉ trả tin mới; before tải tin cũ', async () => {
  const { db, boss, leader, send } = await fixture();
  const t = await createTask(db, boss, { title: 'Việc có thẻ', assigneeId: leader.id }, now, send);
  const m = await createMeeting(db, boss, { title: 'Họp có thẻ', place: 'Phòng 2', startAt: new Date(now + 86400000).toISOString(), note: '', inviteeIds: [leader.id] }, now + 1000, send);
  await handleZaloUpdate(db, { message: { chat: { id: 'chat-1' }, text: `nhận việc ${t.no}` } }, send, now + 2000);
  const all = await listMessages(db, leader.id, {}, now + 3000);
  assert.equal(all.messages.length, 4);
  assert.equal(all.tasks.find(x => x.no === t.no)?.status, 'da_nhan');
  assert.equal(all.meetings.find(x => x.no === m.no)?.pending, 1);
  const fresh = await listMessages(db, leader.id, { after: new Date(now + 2000).toISOString() }, now + 3000);
  assert.deepEqual(fresh.messages.map(x => x.dir), ['in', 'out']);
  const older = await listMessages(db, leader.id, { before: new Date(now + 1000).toISOString() }, now + 3000);
  assert.deepEqual(older.messages.map(x => x.kind), ['task']);
  await assert.rejects(listMessages(db, 'boss-1'), /Không tìm thấy/);
});

void test('chat: sếp nhắn và nhắc trên web gửi Zalo, ghi author; kiểm độ dài và người nhận', async () => {
  const { db, boss, leader, send, sent, rows } = await fixture();
  assert.deepEqual(await sendChat(db, boss, leader.id, '  Chiều nay gửi số giúp anh  ', now, send), { delivered: true });
  assert.deepEqual(sent.at(-1), { chatId: 'chat-1', text: 'Chiều nay gửi số giúp anh' });
  assert.equal(rows(leader.id)[0].author_id, 'boss-1');
  await assert.rejects(sendChat(db, boss, leader.id, '   ', now, send), /1 đến 1000/);
  await assert.rejects(sendChat(db, boss, leader.id, 'x'.repeat(1001), now, send), /1 đến 1000/);
  await assert.rejects(sendChat(db, boss, 'boss-1', 'hi', now, send), /Không tìm thấy/);
  await assert.rejects(sendChat(db, { ...leader, owner: false }, leader.id, 'hi', now, send), /quyền/);
  const t = await createTask(db, boss, { title: 'Việc cần nhắc', assigneeId: leader.id }, now, send);
  await remindInChat(db, boss, leader.id, { kind: 'task', no: t.no }, now, send);
  assert.match(sent.at(-1)!.text, new RegExp(`cập nhật giúp việc số ${t.no}: Việc cần nhắc`));
  await assert.rejects(remindInChat(db, boss, leader.id, { kind: 'task', no: 999 }, now, send), /Không tìm thấy việc/);
  await assert.rejects(remindInChat(db, boss, leader.id, { kind: 'x', no: 1 }, now, send), /không hợp lệ/);
});

void test('chat: pruneMessages chỉ xoá tin cũ hơn 180 ngày', async () => {
  const { raw, db, leader } = await fixture();
  await logMessage(db, { contactId: leader.id, dir: 'in', body: 'cũ', now: now - 181 * 86400000 });
  await logMessage(db, { contactId: leader.id, dir: 'in', body: 'mới', now: now - 179 * 86400000 });
  assert.equal(await pruneMessages(db, now), 1);
  assert.deepEqual(raw.prepare('SELECT body FROM zalo_messages').all().map(r => r.body), ['mới']);
});

void test('chat: logMessage không ném lỗi khi bảng lỗi', async () => {
  const { raw, db, leader } = await fixture();
  raw.exec('DROP TABLE zalo_messages');
  await logMessage(db, { contactId: leader.id, dir: 'in', body: 'x', now });
});

void test('chat: demo có sẵn tin hai chiều, có tin chưa đọc, chỉ tên ảo', async () => {
  const { raw, db } = emptyDb({ DEMO_MODE: '1' });
  for (const [id, email, role, name] of [['owner', 'chu@demo.megatech.vn', 'owner', STAFF[0].name], ['director', 'giamdoc@demo.megatech.vn', 'director', STAFF[1].name]]) raw.prepare('INSERT INTO users (id,email,name,password_hash,role,created_at,updated_at) VALUES (?,?,?,?,?,?,?)').run(id, email, name, '-', role, new Date(now).toISOString(), new Date(now).toISOString());
  await seedZaloWork(db, now);
  const list = await listConversations(db, now);
  assert.ok(list.some(c => c.unread > 0));
  assert.ok((raw.prepare("SELECT COUNT(*) n FROM zalo_messages WHERE dir='in'").get() as { n: number }).n >= 5);
  assert.ok((raw.prepare("SELECT COUNT(*) n FROM zalo_messages WHERE kind='task'").get() as { n: number }).n >= 10);
  assert.ok(list.every(c => STAFF.some(s => s.name === c.name)));
});

void test('nhóm tổng: tạo nhóm, nhắn một lần gửi riêng từng người, đếm đã tới, trả lời trong 24 giờ hiện trong nhóm', async () => {
  const { db, boss, leader, unlinked, send, sent, rows } = await fixture();
  await assert.rejects(saveGroup(db, boss, { name: '', memberIds: [leader.id] }), /Tên nhóm/);
  await assert.rejects(saveGroup(db, boss, { name: 'Nhóm', memberIds: [] }), /1 đến 100/);
  await assert.rejects(saveGroup(db, boss, { name: 'Nhóm', memberIds: ['boss-1'] }), /không còn/);
  await assert.rejects(saveGroup(db, { ...leader, owner: false }, { name: 'Nhóm', memberIds: [leader.id] }), /quyền/);
  const g = await saveGroup(db, boss, { name: 'Nhóm tổng leader', memberIds: [leader.id, unlinked.id] }, now);
  assert.deepEqual((await listGroups(db)).map(x => [x.name, x.memberIds.length]), [['Nhóm tổng leader', 2]]);
  const r = await sendGroup(db, boss, g.id, 'Chiều nay họp nhanh 15 phút', now, send);
  assert.deepEqual(r, { reached: 1, total: 2, missed: ['Leader Chưa Nối'] });
  assert.deepEqual(sent.at(-1), { chatId: 'chat-1', text: '[Nhóm tổng leader] Chiều nay họp nhanh 15 phút' });
  assert.equal(rows(leader.id).at(-1)!.body, '[Nhóm tổng leader] Chiều nay họp nhanh 15 phút');
  assert.equal(rows(unlinked.id).at(-1)!.delivered, 0);
  await handleZaloUpdate(db, { message: { chat: { id: 'chat-1' }, text: 'Dạ em nhận' } }, send, now + 60000);
  await handleZaloUpdate(db, { message: { chat: { id: 'chat-1' }, text: 'tin hôm sau' } }, send, now + 25 * 3600000);
  const view = await groupMessages(db, g.id);
  assert.deepEqual(view.messages.map(m => [m.dir, m.body, m.author_name]), [['out', 'Chiều nay họp nhanh 15 phút', 'Sếp Thử'], ['in', 'Dạ em nhận', 'Leader Thử']]);
  assert.equal(view.messages[0].delivered, 1); assert.equal(view.messages[0].ref_no, 2);
  assert.deepEqual(view.members.map(m => m.linked), [false, true]);
  const fresh = await groupMessages(db, g.id, { after: new Date(now + 30000).toISOString() });
  assert.deepEqual(fresh.messages.map(m => m.body), ['Dạ em nhận']);
  await deleteGroup(db, boss, g.id, now);
  assert.equal((await listGroups(db)).length, 0);
  await assert.rejects(sendGroup(db, boss, g.id, 'x', now, send), /Không tìm thấy nhóm/);
});
