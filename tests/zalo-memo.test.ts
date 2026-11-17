import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyDb } from './support/d1-sqlite';
import { saveContact, handleZaloUpdate } from '../lib/zalo/zalo-work';
import { addMemo, dueReminders, memoTick, memoTitle, openMemos, parseDue, reminderText, setMemoStatus, MEMO_SWITCH_KEY, type Memo } from '../lib/zalo/memo';

// Sổ nhắc việc trong bot Zalo (anh Vũ duyệt plan bản 5, 15/11/2026).
const at = (vn: string) => Date.parse(`${vn}+07:00`);
const T0 = at('2026-11-15T09:00:00');

async function fixture() {
  const { raw, db } = emptyDb();
  await saveContact(db, { id: 'boss-a', name: 'Sếp A', kind: 'boss', user_id: 'u1' }, T0);
  await saveContact(db, { id: 'boss-b', name: 'Anh B', kind: 'boss', user_id: 'u2' }, T0);
  await saveContact(db, { id: 'leader-1', name: 'Leader', kind: 'leader', team_id: 't1', team_name: 'Team', dept: 'sale' }, T0);
  raw.prepare("UPDATE zalo_contacts SET chat_id='chat-a' WHERE id='boss-a'").run();
  raw.prepare("UPDATE zalo_contacts SET chat_id='chat-b' WHERE id='boss-b'").run();
  raw.prepare("UPDATE zalo_contacts SET chat_id='chat-l' WHERE id='leader-1'").run();
  const sent: { chatId: string; text: string }[] = [];
  const send = async (chatId: string, text: string) => { sent.push({ chatId, text }); };
  const say = async (chat: string, text: string, now: number) => { sent.length = 0; await handleZaloUpdate(db, { message: { chat: { id: chat }, text } }, send, now); return sent.map((x) => x.text).join('\n---\n'); };
  return { raw, db, sent, send, say };
}

void test('B1: ghi, xong, bỏ, hoãn, liệt kê; hai người không thấy sổ của nhau', async () => {
  const { db } = await fixture();
  const a1 = await addMemo(db, 'boss-a', 'Duyệt bảng lương thử việc', T0);
  const a2 = await addMemo(db, 'boss-a', '16/11 15h gọi anh Tùng kho', T0);
  const b1 = await addMemo(db, 'boss-b', 'Việc của anh B', T0);
  assert.deepEqual([a1.no, a2.no, b1.no], [1, 2, 1], 'mỗi sổ đánh số riêng');
  assert.equal(a2.due_at, new Date(at('2026-11-16T15:00:00')).toISOString());
  assert.equal(a2.due_has_time, 1);
  assert.deepEqual((await openMemos(db, 'boss-a')).map((m) => m.body), ['Duyệt bảng lương thử việc', '16/11 15h gọi anh Tùng kho']);
  assert.deepEqual((await openMemos(db, 'boss-b')).map((m) => m.body), ['Việc của anh B'], 'anh B không thấy việc của sếp A');
  assert.equal((await setMemoStatus(db, 'boss-b', [1, 2], 'xong', T0)).length, 1, 'chỉ đổi được việc trong sổ của mình');
  assert.equal((await openMemos(db, 'boss-a')).length, 2, 'sổ sếp A không bị đổi');
  const d = parseDue('Họp với bên vận chuyển 20/11', T0)!;
  assert.equal(d.hasTime, false);
  assert.equal(d.at, at('2026-11-20T08:15:00'), 'chỉ có ngày → 8h15 sáng ngày đó');
  assert.equal(parseDue('mai 9h họp', T0)!.at, at('2026-11-16T09:00:00'));
  assert.equal(parseDue('3h chiều gọi khách', T0)!.at, at('2026-11-15T15:00:00'));
  assert.equal(parseDue('Tuần sau họp với bên vận chuyển về phí hoàn', T0), null);
});

void test('B2: "nhắc việc" mở sổ, mỗi tin một việc, "hết" đóng; ngoài lúc mở sổ không lưu; lệnh cũ chạy như trước', async () => {
  const { db, say, raw } = await fixture();
  assert.match(await say('chat-a', 'nhắc việc', T0), /Em đang ghi/);
  assert.equal(await say('chat-a', 'Tuần sau họp với bên vận chuyển về phí hoàn', T0 + 60000), 'Đã ghi số 1.');
  assert.match(await say('chat-a', '16/11 15h gọi anh Tùng kho', T0 + 120000), /^Đã ghi số 2, hẹn 15h ngày mai\.$/);
  assert.match(await say('chat-a', 'Việc A\nViệc B', T0 + 180000), /Đã ghi số 3\.\nĐã ghi số 4\./, 'tin nhiều dòng: mỗi dòng một việc');
  const closed = await say('chat-a', 'hết', T0 + 240000);
  assert.match(closed, /Em đóng sổ\. Vừa lưu 4 việc:\n1\. Tuần sau họp/);
  assert.match(closed, /Ghi nhầm thì gõ: bỏ 1/);
  // Ngoài lúc mở sổ: câu thường không lưu, bot trả lời hướng dẫn như cũ.
  const help = await say('chat-a', 'chào bot', T0 + 300000);
  assert.match(help, /Sổ nhắc việc:/);
  assert.equal((await openMemos(db, 'boss-a')).length, 4);
  // Leader: không có sổ, lệnh cũ y như trước.
  assert.match(await say('chat-l', 'nhắc việc', T0), /Cách nhắn bot/);
  assert.equal((raw.prepare("SELECT COUNT(*) n FROM zalo_memos WHERE contact_id='leader-1'").get() as { n: number }).n, 0);
});

void test('B2: đang mở sổ mà gõ lệnh → hỏi lưu hay chạy; im 15 phút tự đóng (sổ lưu trong dữ liệu, web khởi động lại không mất)', async () => {
  const { db, say, send, sent } = await fixture();
  await say('chat-a', 'nhắc việc', T0);
  await say('chat-a', 'Gọi anh Tùng', T0 + 60000);
  const ask = await say('chat-a', 'việc nhớ', T0 + 120000);
  assert.match(ask, /lưu câu "việc nhớ" thành việc hay chạy lệnh\?\nGõ 1: lưu thành việc · 2: chạy lệnh/);
  const run = await say('chat-a', '2', T0 + 150000);
  assert.match(run, /Việc sếp đang nhớ \(1 việc\):\n1\. Gọi anh Tùng/);
  await say('chat-a', 'xong 1', T0 + 160000);
  assert.match(await say('chat-a', '1', T0 + 170000), /Đã ghi số 2/, 'chọn 1 thì lưu câu đó thành việc');
  // Im 14 phút: chưa đóng. 15 phút: tick tự đóng và gửi danh sách vừa lưu.
  sent.length = 0;
  const closes = () => sent.filter((x) => /Em đóng sổ/.test(x.text));
  await memoTick(db, T0 + 170000 + 14 * 60000, send);
  assert.equal(closes().length, 0);
  await memoTick(db, T0 + 170000 + 15 * 60000, send);
  assert.equal(closes().length, 1);
  assert.match(closes()[0].text, /^Em đóng sổ\. Vừa lưu 2 việc:\n1\. Gọi anh Tùng\n2\. xong 1/);
  // Sau khi đóng: tin thường không lưu.
  await say('chat-a', 'Câu thường', T0 + 40 * 60000);
  assert.equal((await openMemos(db, 'boss-a')).length, 2);
});

void test('B2: lệnh sổ ngoài lúc mở: xong, xong hết, bỏ, hoãn, đã xong tuần này; câu tự nhiên hỏi lại "đúng không"', async () => {
  const { db, say } = await fixture();
  for (const t of ['Duyệt bảng lương thử việc', 'Họp với bên vận chuyển về phí hoàn', 'Gọi anh Tùng kho']) await addMemo(db, 'boss-a', t, T0);
  assert.match(await say('chat-a', 'xong 1', T0), /Đã xong số 1: Duyệt bảng lương thử việc\. Còn 2 việc\./);
  assert.match(await say('chat-a', 'vụ phí hoàn xử lý rồi nhé', T0), /Sếp muốn đánh dấu xong số 2 “Họp với bên vận chuyển về phí hoàn” đúng không\? Gõ: có hoặc không/);
  assert.match(await say('chat-a', 'có', T0), /Đã xong số 2/);
  assert.match(await say('chat-a', 'hoãn 3 tới 20/11', T0), /Đã hoãn số 3, tới 20\/11/);
  assert.equal(await say('chat-a', 'việc nhớ', T0), 'Đang hoãn: 3. Gọi anh Tùng kho (tới 20/11)', 'việc đang hoãn chỉ ở dòng Đang hoãn');
  assert.match(await say('chat-a', 'bỏ 3', T0), /Đã bỏ số 3/);
  assert.match(await say('chat-a', 'đã xong tuần này', T0), /Đã xong tuần này \(2 việc\)/);
  assert.match(await say('chat-a', 'xong 9', T0), /Không thấy việc số 9/);
  assert.equal((await openMemos(db, 'boss-a')).length, 0);
});

void test('B3: 4 mốc nhắc trước, 3 lần nhắc lại sau giờ hẹn, mỗi mốc một lần; 22h–6h dời / bỏ', async () => {
  const mkMemo = (due: string, created = '2026-11-14T08:00:00', sent = '{}'): Memo => ({ id: 'x', contact_id: 'boss-a', no: 8, body: 'gọi anh Tùng kho', due_at: new Date(at(due)).toISOString(), due_has_time: 1, snooze_day: null, status: 'mo', sent, created_at: new Date(at(created)).toISOString(), done_at: null });
  const m = mkMemo('2026-11-16T15:00:00');
  const step = (now: string, prev: Memo) => { const r = dueReminders(prev, at(now)); return { r, next: { ...prev, sent: JSON.stringify({ ...JSON.parse(prev.sent), ...r.mark }) } }; };
  let x = step('2026-11-15T14:59:00', m); assert.equal(x.r.send, null);
  x = step('2026-11-15T15:00:00', x.next); assert.equal(x.r.send, 'd1');
  x = step('2026-11-15T15:01:00', x.next); assert.equal(x.r.send, null, 'mỗi mốc chỉ gửi một lần');
  x = step('2026-11-15T21:30:00', x.next); assert.equal(x.r.send, 'h12', 'mốc 12 tiếng = 3h sáng rơi vào đêm → gửi sớm 21h30');
  x = step('2026-11-16T14:00:00', x.next); assert.equal(x.r.send, 'h1');
  x = step('2026-11-16T15:00:00', x.next); assert.equal(x.r.send, 'h0');
  x = step('2026-11-16T17:00:00', x.next); assert.equal(x.r.send, 'r1');
  x = step('2026-11-16T19:00:00', x.next); assert.equal(x.r.send, 'r2');
  x = step('2026-11-16T21:00:00', x.next); assert.equal(x.r.send, 'r3');
  // Hẹn 7h sáng: mốc trước 1 tiếng (6h) giữ; trước 12 tiếng (19h hôm trước) giữ; trước 1 ngày 7h. Hẹn 23h: nhắc lại 1h, 3h, 5h sáng → bỏ.
  const late = mkMemo('2026-11-16T23:00:00');
  let y = step('2026-11-16T21:29:00', { ...late, sent: JSON.stringify({ d1: 'x', h12: 'x' }) }); assert.equal(y.r.send, null, 'h1 = 22h, đúng giờ = 23h rơi vào giờ đêm → gửi sớm 21h30');
  y = step('2026-11-16T21:30:00', { ...late, sent: JSON.stringify({ d1: 'x', h12: 'x' }) }); assert.ok(y.r.send, 'gửi 1 tin lúc 21h30');
  const { reminderText } = await import('../lib/zalo/memo');
  assert.match(reminderText(late, y.r.send!, at('2026-11-16T21:30:00')), /còn 1 tiếng 30 phút nữa, 23h hôm nay/);
  y = step('2026-11-17T05:30:00', { ...late, sent: JSON.stringify({ d1: 'x', h12: 'x', h1: 'x', h0: 'x' }) });
  assert.equal(y.r.send, null, 'nhắc lại rơi vào 22h–6h thì bỏ');
  assert.deepEqual(Object.keys(y.r.mark).sort(), ['r1', 'r2', 'r3']);
  // Đã xong: thôi nhắc.
  assert.equal(dueReminders({ ...m, status: 'xong' }, at('2026-11-16T15:00:00')).send, null);
});

void test('B3: ghi sát giờ chỉ nhắc các mốc còn lại; tick gửi đúng người; 8h15 mỗi ngày một lần, không có việc thì không gửi', async () => {
  const { db, send, sent } = await fixture();
  const m = await addMemo(db, 'boss-a', '15/11 10h gọi khách', T0);
  assert.deepEqual(Object.keys(JSON.parse(m.sent)).sort(), ['d1', 'h12'], 'ghi lúc 9h cho hẹn 10h: bỏ mốc trước 1 ngày, 12 tiếng');
  await memoTick(db, at('2026-11-15T09:00:00'), send);
  const rem = sent.filter((x) => x.text.startsWith('Nhắc sếp'));
  assert.equal(rem.length, 1);
  assert.match(rem[0].text, /^Nhắc sếp: còn 1 tiếng nữa, 10h hôm nay: gọi khách \(việc số 1\)\.$/, 'không lặp ngày giờ trong tên việc');
  assert.equal(rem[0].chatId, 'chat-a');
  sent.length = 0;
  await memoTick(db, at('2026-11-16T08:15:00'), send);
  const daily = sent.filter((s) => /Việc sếp đang nhớ/.test(s.text));
  assert.equal(daily.length, 1, 'chỉ sếp A có việc; anh B sổ trống không nhận');
  assert.match(daily[0].text, /1\. gọi khách · quá hẹn/);
  sent.length = 0;
  await memoTick(db, at('2026-11-16T08:16:00'), send);
  assert.equal(sent.filter((s) => /Việc sếp đang nhớ/.test(s.text)).length, 0, 'mỗi ngày một lần');
});

void test('B4 + B5: nội dung sổ không vào tab Chat trên web; công tắc tắt thì bot như cũ', async () => {
  const { db, raw, say } = await fixture();
  await say('chat-a', 'nhắc việc', T0);
  await say('chat-a', 'Bí mật: đàm phán giá với nhà cung cấp X', T0 + 1000);
  const chat = raw.prepare("SELECT body FROM zalo_messages WHERE body LIKE '%nhà cung cấp X%'").all();
  assert.equal(chat.length, 0, 'không ghi nội dung vào zalo_messages');
  raw.prepare('INSERT INTO app_settings (key,value,updated_at) VALUES (?,?,?)').run(MEMO_SWITCH_KEY, '{"on":false}', 'x');
  const r = await say('chat-a', 'nhắc việc', T0 + 20 * 60000);
  assert.doesNotMatch(r, /Em đang ghi/);
  assert.equal((await openMemos(db, 'boss-a')).length, 1, 'dữ liệu sổ vẫn giữ khi tắt');
});

void test('Hiện tên việc: tách ngày giờ hẹn khỏi tên việc, dữ liệu giữ nguyên câu gốc', async () => {
  const { db } = await fixture();
  const m = await addMemo(db, 'boss-a', '16/11 15h gọi anh Tùng kho', T0);
  assert.equal(m.body, '16/11 15h gọi anh Tùng kho', 'dữ liệu giữ câu gốc');
  assert.equal(memoTitle(m), 'gọi anh Tùng kho');
  const due = (t: string) => ({ body: t, due_at: 'x' });
  assert.equal(memoTitle(due('Họp với bên vận chuyển lúc 9h30 sáng ngày 20/11')), 'Họp với bên vận chuyển');
  assert.equal(memoTitle(due('mai 9h họp giao ban')), 'họp giao ban');
  assert.equal(memoTitle(due('20/11')), '20/11', 'bỏ hết thành rỗng thì giữ câu gốc');
  assert.equal(memoTitle({ body: 'Tuần sau 2h chiều', due_at: null }), 'Tuần sau 2h chiều', 'không có hẹn thì giữ nguyên');
  assert.equal(reminderText({ ...m }, 'd1', at('2026-11-15T15:00:00')), 'Nhắc sếp: còn 1 ngày nữa, 15h ngày mai: gọi anh Tùng kho (việc số 1).');
});

void test('Mốc nhắc đã quá thì bỏ, chỉ gửi mốc gần nhất còn đúng, "còn X nữa" theo giờ thật; web bật lại không gửi dồn', async () => {
  const { db, send, sent } = await fixture();
  await addMemo(db, 'boss-a', '16/11 15h gọi anh Tùng kho', T0);
  const rems = () => sent.filter((x) => /[vV]iệc số 1/.test(x.text)).map((x) => x.text);
  // Web tắt từ 13h50 tới 14h40 ngày 16/11: mốc trước 1 tiếng (14h) đã quá 40 phút → bỏ, không gửi.
  await memoTick(db, at('2026-11-15T15:00:00'), send);
  await memoTick(db, at('2026-11-16T03:00:00'), send);
  sent.length = 0;
  await memoTick(db, at('2026-11-16T14:40:00'), send);
  assert.deepEqual(rems(), [], 'mốc 14h đã quá 40 phút: bỏ');
  await memoTick(db, at('2026-11-16T15:00:00'), send);
  assert.deepEqual(rems(), ['Tới giờ (15h hôm nay): gọi anh Tùng kho (việc số 1). Xong thì gõ: xong 1'], 'chỉ gửi mốc gần nhất còn đúng');
  // Web tắt từ 16h tới 17h30: lần nhắc lại +2 tiếng (17h) quá 30 phút → bỏ; +4 tiếng (19h) gửi đúng giờ.
  sent.length = 0;
  await memoTick(db, at('2026-11-16T17:30:00'), send);
  assert.deepEqual(rems(), []);
  await memoTick(db, at('2026-11-16T19:00:00'), send);
  assert.equal(rems().length, 1);
  assert.match(rems()[0], /quá hẹn 4 tiếng/);
  // Web bật lại 5 phút sau mốc: vẫn gửi, chữ "còn X nữa" tính theo giờ thật lúc gửi.
  const { db: db2, send: send2, sent: sent2 } = await fixture();
  await addMemo(db2, 'boss-a', '16/11 15h gọi anh Tùng kho', T0);
  await memoTick(db2, at('2026-11-15T15:00:00'), send2);
  await memoTick(db2, at('2026-11-16T03:00:00'), send2);
  sent2.length = 0;
  await memoTick(db2, at('2026-11-16T14:05:00'), send2);
  assert.deepEqual(sent2.map((x) => x.text).filter((t) => /việc số 1/.test(t)), ['Nhắc sếp: còn 55 phút nữa, 15h hôm nay: gọi anh Tùng kho (việc số 1).']);
});

void test('Việc chỉ có ngày thì nhắc lúc 8h15 ngày đó', async () => {
  const { db, send, sent } = await fixture();
  const m = await addMemo(db, 'boss-a', '20/11 họp với bên vận chuyển', T0);
  assert.equal(m.due_has_time, 0);
  assert.equal(m.due_at, new Date(at('2026-11-20T08:15:00')).toISOString());
  await memoTick(db, at('2026-11-20T08:15:00'), send);
  assert.ok(sent.some((x) => x.text === 'Tới giờ (hôm nay): họp với bên vận chuyển (việc số 1). Xong thì gõ: xong 1'));
});

void test('Mỗi tin tính lại 15 phút; web bật lại giữa lúc mở sổ không mất sổ', async () => {
  const { db, send, sent, say } = await fixture();
  await say('chat-a', 'nhắc việc', T0);
  await say('chat-a', 'Việc một', T0 + 10 * 60000);
  // Web khởi động lại: trạng thái sổ nằm trong dữ liệu (app_settings), không ở bộ nhớ. Tin 14 phút sau tin trước vẫn vào sổ.
  assert.equal(await say('chat-a', 'Việc hai', T0 + 24 * 60000), 'Đã ghi số 2.');
  sent.length = 0;
  await memoTick(db, T0 + 38 * 60000, send);
  assert.equal(sent.filter((x) => /Em đóng sổ/.test(x.text)).length, 0, '14 phút sau tin cuối: chưa đóng');
  await memoTick(db, T0 + 39 * 60000, send);
  const closed = sent.filter((x) => /Em đóng sổ/.test(x.text));
  assert.equal(closed.length, 1, '15 phút sau tin cuối: tự đóng');
  assert.match(closed[0].text, /Vừa lưu 2 việc:\n1\. Việc một\n2\. Việc hai/);
});

void test('Lệnh hết, bỏ N, xong hết, đã xong tuần này; việc nhớ có dòng "Đang hoãn"', async () => {
  const { db, say } = await fixture();
  await say('chat-a', 'nhắc việc', T0);
  for (const t of ['Việc A', 'Việc B', 'Việc C', 'Việc D']) await say('chat-a', t, T0 + 60000);
  assert.match(await say('chat-a', 'hết', T0 + 120000), /Em đóng sổ\. Vừa lưu 4 việc/);
  assert.match(await say('chat-a', 'bỏ 4', T0 + 180000), /Đã bỏ số 4: Việc D\. Còn 3 việc\./);
  assert.match(await say('chat-a', 'hoãn 3 tới 20/11', T0 + 200000), /Đã hoãn số 3/);
  const list = await say('chat-a', 'việc nhớ', T0 + 210000);
  assert.match(list, /Việc sếp đang nhớ \(2 việc\):\n1\. Việc A\n2\. Việc B\nĐang hoãn: 3\. Việc C \(tới 20\/11\)/);
  assert.match(await say('chat-a', 'xong hết', T0 + 240000), /Đã xong số 1: Việc A; số 2: Việc B; số 3: Việc C\. Còn 0 việc\./);
  assert.match(await say('chat-a', 'đã xong tuần này', T0 + 300000), /Đã xong tuần này \(3 việc\):\n1\. Việc A\n2\. Việc B\n3\. Việc C/);
  assert.equal((await openMemos(db, 'boss-a')).length, 0);
});

void test('Ảnh hoặc ghi âm: trả "em chỉ lưu được chữ"; leader gửi ảnh thì bot im như cũ', async () => {
  const { send, sent, db } = await fixture();
  const { handleZaloUpdate } = await import('../lib/zalo/zalo-work');
  await handleZaloUpdate(db, { message: { chat: { id: 'chat-a', type: 'private' }, photo: 'https://x/anh.jpg' } }, send, T0);
  await handleZaloUpdate(db, { message: { chat: { id: 'chat-a' }, voice: { url: 'x' } } }, send, T0);
  assert.deepEqual(sent.map((x) => [x.chatId, x.text]), [['chat-a', 'Em chỉ lưu được chữ. Sếp gõ lại bằng chữ giúp em.'], ['chat-a', 'Em chỉ lưu được chữ. Sếp gõ lại bằng chữ giúp em.']]);
  sent.length = 0;
  await handleZaloUpdate(db, { message: { chat: { id: 'chat-l' }, photo: 'x' } }, send, T0);
  assert.equal(sent.length, 0);
});

void test('Nội dung sổ không vào tab Chat trên web và không vào nhật ký (console)', async () => {
  const { raw, say, db, send } = await fixture();
  const logs: string[] = [];
  const orig = { log: console.log, error: console.error, warn: console.warn, info: console.info };
  for (const k of ['log', 'error', 'warn', 'info'] as const) console[k] = (...a: unknown[]) => { logs.push(a.map(String).join(' ')); };
  try {
    await say('chat-a', 'nhắc việc', T0);
    await say('chat-a', 'Bí mật 16/11 15h đàm phán giá nhà cung cấp X', T0 + 1000);
    await say('chat-a', 'hết', T0 + 2000);
    await memoTick(db, at('2026-11-16T14:00:00'), send);
    await say('chat-a', 'xong 1', at('2026-11-16T14:10:00'));
  } finally { Object.assign(console, orig); }
  assert.equal(raw.prepare("SELECT COUNT(*) n FROM zalo_messages WHERE body LIKE '%nhà cung cấp X%'").get()!.n, 0, 'tab Chat');
  assert.ok(!logs.some((l) => l.includes('nhà cung cấp X')), 'nhật ký');
});

void test('Tắt công tắc thì bot chạy y như cũ (trả lời giống hệt khi chưa có sổ nhắc việc)', async () => {
  const off = await fixture();
  off.raw.prepare('INSERT INTO app_settings (key,value,updated_at) VALUES (?,?,?)').run(MEMO_SWITCH_KEY, '{"on":false}', 'x');
  const helpOff = await off.say('chat-a', 'nhắc việc', T0);
  assert.doesNotMatch(helpOff, /Sổ nhắc việc|Em đang ghi/);
  assert.match(helpOff, /Cách nhắn bot/);
  assert.equal(off.raw.prepare('SELECT COUNT(*) n FROM zalo_memos').get()!.n, 0);
  off.sent.length = 0;
  await memoTick(off.db, at('2026-11-16T08:15:00'), off.send);
  assert.equal(off.sent.length, 0, 'không gửi nhắc / danh sách');
  // Lệnh cũ của leader và sếp vẫn như cũ khi tắt.
  assert.match(await off.say('chat-l', 'việc', T0), /Không có việc|Việc số/);
});
