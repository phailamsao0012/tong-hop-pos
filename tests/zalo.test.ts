import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { createHmac } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { env } from 'cloudflare:workers';
import { d1 } from './support/d1-sqlite';
import { sendZalo, setWebhook, webhookSecret, createZaloSender, deleteWebhook, pollZaloUpdates, zaloDiagnose } from '../lib/zalo';
import { POST } from '../app/api/zalo/webhook/route';
import { scopeApi, type Access } from '../lib/access';
import { saveContact, createPairCode, createTask, moveTask, editTask, createMeeting, cancelMeeting, handleZaloUpdate, formatTaskMessage, formatMeetingMessage } from '../lib/zalo-work';
const now = Date.parse('2026-10-27T03:00:00Z');
async function fixture() {
  const raw = new DatabaseSync(':memory:');
  raw.exec(readFileSync(new URL('../drizzle/0047_giao_viec_zalo.sql', import.meta.url), 'utf8'));
  raw.exec('CREATE TABLE app_settings (key TEXT PRIMARY KEY,value TEXT NOT NULL,updated_at TEXT NOT NULL)');
  const db = d1(raw);
  const boss = await saveContact(db, { id: 'boss', name: 'Đỗ Quang Huy', kind: 'boss' }, now);
  const leader = await saveContact(db, { id: 'leader', name: 'Nguyễn Đức Mạnh', kind: 'leader', team_id: 'a', dept: 'sale' }, now);
  const other = await saveContact(db, { id: 'other', name: 'Bùi Thanh Tùng', kind: 'leader', team_id: 'b' }, now);
  const staff = await saveContact(db, { id: 'staff', name: 'Trần Thị Thu Hằng', kind: 'staff', leader_id: leader.id }, now);
  for (const c of [boss, leader, other, staff]) raw.prepare('UPDATE zalo_contacts SET chat_id=? WHERE id=?').run('demo-' + c.id, c.id);
  const sent: { to: string; text: string }[] = [];
  const send = async (to: string, text: string) => { sent.push({ to, text }); };
  const message = (who: string, text: string) => handleZaloUpdate(db, { message: { chat: { id: 'demo-' + who }, text } }, send, now);
  return { raw, db, boss, leader, other, staff, sent, send, message };
}
void test('webhook: HMAC, sai/thiếu secret 401, JSON sai và update rỗng 200', async () => {
  const f = await fixture();
  Object.assign(env, { DB: f.db, ZALO_BOT_TOKEN: 'test-bot', DEMO_MODE: '1' });
  const secret = await webhookSecret('test-bot');
  assert.equal(secret, createHmac('sha256', 'test-bot').update('zalo-webhook-v1').digest('hex'));
  for (const header of ['', 'wrong', secret.slice(0, -1) + (secret.endsWith('0') ? '1' : '0')]) {
    assert.equal((await POST(new Request('http://localhost/api/zalo/webhook', { method: 'POST', headers: { 'X-Bot-Api-Secret-Token': header }, body: '{}' }))).status, 401);
  }
  for (const body of ['{}', 'invalid']) assert.equal((await POST(new Request('http://localhost/api/zalo/webhook', { method: 'POST', headers: { 'X-Bot-Api-Secret-Token': secret }, body }))).status, 200);
  env.ZALO_BOT_TOKEN = '';
  assert.equal((await POST(new Request('http://localhost/api/zalo/webhook', { method: 'POST' }))).status, 401);
  f.raw.close();
});
void test('scopeApi: webhook Zalo được cho qua như webhook Telegram', () => {
  const access = { role: 'staff', views: [], posIds: [], team: 'all' } as unknown as Access;
  assert.equal(scopeApi(access, 'POST', new URL('http://localhost/api/zalo/webhook')).blocked, undefined);
});
void test('chat chưa nối: hướng dẫn, nối đúng mã, sai 5 lần thì im lặng', async () => {
  const f = await fixture();
  await f.message('stranger', 'xin chào');
  assert.match(f.sent.pop()!.text, /Gửi mã 6 số/);
  const code = await createPairCode(f.db, f.staff.id, now);
  await f.message('stranger', code);
  assert.match(f.sent.pop()!.text, /Đã nối Zalo/);
  assert.equal(f.raw.prepare('SELECT chat_id FROM zalo_contacts WHERE id=?').get(f.staff.id)!.chat_id, 'demo-stranger');
  for (let i = 0; i < 7; i++) await f.message('unknown', '999999');
  assert.equal(f.sent.length, 4);
  f.raw.close();
});
void test('webhook dạng Zalo thật: tin nằm trong result, chat_type PRIVATE nối được, GROUP bỏ qua', async () => {
  const f = await fixture();
  const real = (chatId: string, chatType: string, text: string) => handleZaloUpdate(f.db, { ok: true, result: { message: { from: { id: chatId, display_name: 'Ảo', is_bot: false }, chat: { id: chatId, chat_type: chatType }, text, message_id: 'm1', date: now }, event_name: 'message.text.received' } }, f.send, now);
  const code = await createPairCode(f.db, f.staff.id, now);
  await real('zalo-group', 'GROUP', code);
  assert.equal(f.sent.length, 0);
  await real('zalo-real', 'PRIVATE', code);
  assert.match(f.sent.pop()!.text, /Đã nối Zalo/);
  assert.equal(f.raw.prepare('SELECT chat_id FROM zalo_contacts WHERE id=?').get(f.staff.id)!.chat_id, 'zalo-real');
  f.raw.close();
});
void test('giao việc, trạng thái, ghi chú gửi đúng người và đúng mẫu', async () => {
  const f = await fixture();
  const t = await createTask(f.db, f.boss, { title: 'Việc thử', assigneeId: f.leader.id, urgent: true }, now, f.send);
  assert.deepEqual(f.sent.splice(0), [{ to: 'demo-leader', text: formatTaskMessage(t, f.boss.name) }]);
  for (const [cmd, label] of [['nhan', 'Đã nhận'], ['dang', 'Đang triển khai'], ['xong', 'Đã hoàn thành'], ['dang', 'Đang triển khai'], ['chua bận', 'Chưa hoàn thành']]) {
    await f.message('leader', `V${t.no} ${cmd}`);
    assert.equal(f.sent.length, 2);
    assert.equal(f.sent[0].to, 'demo-boss');
    assert.match(f.sent[0].text, new RegExp(label));
    assert.equal(f.sent[1].to, 'demo-leader');
    f.sent.length = 0;
  }
  await f.message('leader', `V${t.no} ghi chú thử`);
  assert.equal(f.sent.length, 2);
  assert.deepEqual(f.sent[0], { to: 'demo-boss', text: `${f.leader.name} ghi chú V${t.no}: ghi chú thử` });
  f.raw.close();
});
void test('leader giao số/tên chỉ trong team; nhân viên chưa xong báo leader', async () => {
  const f = await fixture();
  await f.message('leader', 'giao 1: Việc thử han 30/10');
  assert.equal(f.sent.length, 2);
  assert.equal(f.sent[0].to, 'demo-staff');
  assert.match(f.sent[0].text, /Hạn: 30\/10/);
  assert.equal(f.sent[1].text, `Đã giao V1 cho ${f.staff.name}.`);
  f.sent.length = 0;
  await f.message('staff', 'V1 chua bận');
  assert.equal(f.sent[0].to, 'demo-leader');
  assert.match(f.sent[0].text, /Chưa hoàn thành: bận/);
  f.sent.length = 0;
  await f.message('other', 'V1 dang');
  await f.message('other', 'V1 ghi chú');
  await f.message('other', 'giao 1: Việc khác');
  assert.ok(f.sent.every(s => s.to === 'demo-other' && !s.text.includes('Việc thử')));
  f.sent.length = 0;
  await f.message('leader', `giao ${f.staff.name}: Theo tên`);
  assert.equal(f.sent[0].to, 'demo-staff');
  await f.message('leader', 'giao 1: Hạn sai han 31/02');
  assert.equal(f.sent.at(-1)!.text, 'Hạn không hợp lệ. Dùng han dd/mm.');
  f.raw.close();
});
void test('thiếu lý do không ghi, list/team/week/help không lộ team khác', async () => {
  const f = await fixture();
  const t = await createTask(f.db, f.leader, { title: 'Việc riêng', assigneeId: f.staff.id }, now);
  await f.message('staff', `V${t.no} chua`);
  assert.match(f.sent.pop()!.text, /ghi thêm lý do/);
  assert.equal(f.raw.prepare('SELECT status FROM zalo_tasks').get()!.status, 'moi');
  for (const cmd of ['viec', 'team', 'tuan', '?', 'rác']) await f.message('other', cmd);
  assert.ok(f.sent.every(s => s.to === 'demo-other' && !s.text.includes('Việc riêng') && !s.text.includes(f.staff.name)));
  await f.message('leader', 'team');
  assert.match(f.sent.at(-1)!.text, /1\./);
  await f.message('leader', 'tuan');
  assert.match(f.sent.at(-1)!.text, /Việc trong tuần/);
  f.raw.close();
});
void test('sửa hạn, đổi người và huỷ việc gửi người nhận liên quan', async () => {
  const f = await fixture();
  const t = await createTask(f.db, f.boss, { title: 'Việc thử', assigneeId: f.leader.id }, now);
  await editTask(f.db, f.boss, t.no, { dueDate: '2026-10-30' }, now, f.send);
  assert.equal(f.sent[0].to, 'demo-leader');
  assert.match(f.sent[0].text, /2026-10-30/);
  f.sent.length = 0;
  await editTask(f.db, f.boss, t.no, { assigneeId: f.other.id }, now, f.send);
  assert.deepEqual(f.sent.map(s => s.to), ['demo-leader', 'demo-other']);
  f.sent.length = 0;
  await moveTask(f.db, f.boss, t.no, 'huy', '', now, f.send);
  assert.deepEqual(f.sent, [{ to: 'demo-other', text: `${f.boss.name}: V${t.no} Đã huỷ` }]);
  f.raw.close();
});
void test('họp: mời, có/không, thiếu lý do, người không được mời và huỷ', async () => {
  const f = await fixture();
  const m = await createMeeting(f.db, f.boss, { title: 'Họp thử', place: 'Phòng demo', startAt: '2026-10-28T02:00:00Z', note: '', inviteeIds: [f.leader.id] }, now, f.send);
  assert.deepEqual(f.sent.splice(0), [{ to: 'demo-leader', text: formatMeetingMessage(m) }]);
  await f.message('leader', `H${m.no} khong`);
  assert.equal(f.sent.length, 1);
  assert.match(f.sent.pop()!.text, /ghi thêm lý do/);
  for (const [cmd, expected] of [['co', 'tham gia'], ['khong bận', 'không tham gia']]) {
    await f.message('leader', `H${m.no} ${cmd}`);
    assert.equal(f.sent.length, 2);
    assert.equal(f.sent[0].to, 'demo-boss');
    assert.match(f.sent[0].text, new RegExp(expected));
    f.sent.length = 0;
  }
  await f.message('other', `H${m.no} co`);
  assert.equal(f.sent.length, 1);
  assert.equal(f.sent.pop()!.to, 'demo-other');
  await cancelMeeting(f.db, f.boss, m.no, now, f.send);
  assert.deepEqual(f.sent, [{ to: 'demo-leader', text: `Đã huỷ H${m.no}: Họp thử` }]);
  f.raw.close();
});
void test('lỗi gửi không làm mất việc/trạng thái; update sai hoặc nhóm không gửi', async () => {
  const f = await fixture();
  const broken = async () => { throw new Error('lỗi giả'); };
  const t = await createTask(f.db, f.leader, { title: 'Việc thử', assigneeId: f.staff.id }, now, broken);
  assert.equal((await moveTask(f.db, f.staff, t.no, 'da_nhan', '', now, broken)).status, 'da_nhan');
  for (const u of [null, {}, { message: null }, { message: { text: 'viec', chat: { id: {}, type: 'private' } } }, { message: { text: 'viec', chat: { id: 'demo-staff', type: 'group' } } }]) await handleZaloUpdate(f.db, u, f.send, now);
  assert.equal(f.sent.length, 0);
  f.raw.close();
});
void test('demo không fetch, giữ 100 tin; thiếu token bỏ qua; setWebhook không mạng', async () => {
  const f = await fixture();
  const original = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error('không được fetch'); };
  Object.assign(env, { DB: f.db, DEMO_MODE: '1' });
  try {
    for (let i = 0; i < 102; i++) await sendZalo('test-bot', 'demo-staff', String(i), f.db, now);
    const rows = JSON.parse(String(f.raw.prepare("SELECT value FROM app_settings WHERE key='demo_zalo_outbox'").get()!.value));
    assert.equal(rows.length, 100);
    assert.deepEqual(rows[0], { to: 'demo-staff', name: f.staff.name, text: '2', at: new Date(now).toISOString() });
    assert.deepEqual(await setWebhook('test-bot', 'https://example.invalid/webhook'), { skipped: true });
    env.DEMO_MODE = '0';
    assert.deepEqual(await sendZalo(undefined, 'demo-staff', 'thử', f.db), { skipped: true });
    assert.deepEqual(await setWebhook(undefined, 'https://example.invalid'), { skipped: true });
  } finally { globalThis.fetch = original; f.raw.close(); }
});
void test('transport giả: timeout, payload, HMAC setup, lỗi trả kết quả an toàn', async () => {
  const original = globalThis.fetch;
  env.DEMO_MODE = '0';
  const calls: { url: string; body: Record<string, string> }[] = [];
  globalThis.fetch = async (url, init) => {
    assert.ok(init?.signal);
    assert.equal(typeof url, 'string');
    assert.equal(typeof init?.body, 'string');
    calls.push({ url: url as string, body: JSON.parse(init?.body as string) });
    return Response.json({ ok: true });
  };
  try {
    await sendZalo('test-bot', 'demo-staff', 'thử');
    assert.deepEqual(calls[0].body, { chat_id: 'demo-staff', text: 'thử' });
    assert.match(calls[0].url, /\/sendMessage$/);
    await setWebhook('test-bot', 'https://example.invalid/webhook');
    assert.equal(calls[1].body.secret_token, await webhookSecret('test-bot'));
    globalThis.fetch = async () => { throw new Error('lỗi giả'); };
    assert.deepEqual(await sendZalo('test-bot', 'demo-staff', 'thử'), { ok: false });
  } finally { globalThis.fetch = original; }
});
void test('getUpdates: nhận tin đơn lẻ hoặc mảng, lỗi/hết tin thì dừng; deleteWebhook gọi đúng', async () => {
  const original = globalThis.fetch;
  env.DEMO_MODE = '0';
  const msg = (text: string) => ({ message: { chat: { id: 'u1', chat_type: 'PRIVATE' }, text }, event_name: 'message.text.received' });
  const replies: unknown[] = [{ ok: true, result: msg('a') }, { ok: false, description: 'Request timeout' }, { ok: true, result: [msg('b'), msg('c')] }, { ok: false, error_code: 401, description: 'Unauthorized' }];
  const urls: string[] = [];
  globalThis.fetch = async url => { urls.push(String(url)); return Response.json(String(url).endsWith('/deleteWebhook') ? { ok: true } : replies.shift() ?? { ok: false }); };
  try {
    const got: unknown[] = [];
    assert.equal(await pollZaloUpdates('test-bot', async u => { got.push(u); }, 60000, 1), 3);
    assert.deepEqual(got.map(u => (u as { result: { message: { text: string } } }).result.message.text), ['a', 'b', 'c']);
    assert.ok(urls[0].endsWith('/deleteWebhook') && urls.slice(1).every(u => u.endsWith('/getUpdates')));
    assert.equal(urls.length, 5);
    globalThis.fetch = async url => { urls.push(String(url)); return Response.json({ ok: true, result: { url: '' } }); };
    assert.equal((await deleteWebhook('test-bot') as { ok: boolean }).ok, true);
    assert.match(urls.at(-1)!, /\/deleteWebhook$/);
    assert.equal(await pollZaloUpdates(undefined, async () => {}), 0);
  } finally { globalThis.fetch = original; }
});
void test('zaloDiagnose: gỡ webhook, xem webhook, lấy tin thử và xử lý tin; tóm tắt không chứa token', async () => {
  const original = globalThis.fetch;
  env.DEMO_MODE = '0';
  const replies: Record<string, unknown> = { deleteWebhook: { ok: true, result: { url: '' } }, getWebhookInfo: { ok: true, result: { url: '', updated_at: 1 } }, getUpdates: { ok: true, result: { message: { chat: { id: 'u1', chat_type: 'PRIVATE' }, text: '123456' }, event_name: 'message.text.received' } } };
  globalThis.fetch = async url => Response.json(replies[String(url).split('/').pop()!]);
  try {
    const got: unknown[] = [];
    const r = await zaloDiagnose('secret-token', async u => { got.push(u); }) as { ok: boolean; steps: string[] };
    assert.equal(r.ok, true);
    assert.equal(got.length, 1);
    assert.equal(r.steps.length, 4);
    assert.ok(!r.steps.join(' ').includes('secret-token'));
    globalThis.fetch = async () => new Response('Not Found', { status: 404 });
    const bad = await zaloDiagnose('secret-token', async () => {}) as { ok: boolean; steps: string[] };
    assert.equal(bad.ok, false);
    assert.match(bad.steps[2], /HTTP 404/);
  } finally { globalThis.fetch = original; }
});
void test('sender giới hạn 30 tin và gửi tuần tự cách nhau 300 ms', async () => {
  const f = await fixture();
  Object.assign(env, { DB: f.db, DEMO_MODE: '0', ZALO_BOT_TOKEN: 'test-bot' });
  const originalFetch = globalThis.fetch, originalTimeout = globalThis.setTimeout;
  let calls = 0;
  const waits: number[] = [];
  globalThis.fetch = async () => { calls++; return Response.json({ ok: true }); };
  globalThis.setTimeout = ((fn: () => void, ms: number) => { waits.push(ms); fn(); return 0; }) as unknown as typeof setTimeout;
  try {
    const send = createZaloSender(f.db, now);
    await Promise.all(Array.from({ length: 35 }, () => send('demo-staff', 'thử')));
    assert.equal(calls, 30);
    assert.deepEqual(waits, Array(29).fill(300));
  } finally { globalThis.fetch = originalFetch; globalThis.setTimeout = originalTimeout; f.raw.close(); }
});
void test('leader thêm nhân viên trả mã nối; staff không được thêm hoặc giao', async () => {
  const f = await fixture();
  await f.message('leader', `thêm ${f.staff.name}`);
  assert.equal(f.sent.length, 1);
  assert.equal(f.sent[0].to, 'demo-leader');
  assert.match(f.sent[0].text, /nhắn mã \d{6}/);
  const added = f.raw.prepare("SELECT * FROM zalo_contacts WHERE kind='staff' AND id<>?").get(f.staff.id)!;
  assert.equal(added.leader_id, f.leader.id);
  assert.equal(added.team_id, f.leader.team_id);
  await f.message('staff', `them ${f.staff.name}`);
  await f.message('staff', 'giao 1: Không được giao');
  assert.equal(f.raw.prepare('SELECT COUNT(*) AS n FROM zalo_tasks').get()!.n, 0);
  assert.equal(f.raw.prepare("SELECT COUNT(*) AS n FROM zalo_contacts WHERE kind='staff'").get()!.n, 2);
  f.raw.close();
});
void test('webhook hợp lệ dùng chung handler và hộp thư demo; staff khác không sửa được việc', async () => {
  const f = await fixture();
  Object.assign(env, { DB: f.db, DEMO_MODE: '1', ZALO_BOT_TOKEN: 'test-bot' });
  const t = await createTask(f.db, f.leader, { title: 'Việc thử', assigneeId: f.staff.id }, now);
  const sibling = await saveContact(f.db, { name: f.staff.name, kind: 'staff', leader_id: f.leader.id }, now);
  f.raw.prepare('UPDATE zalo_contacts SET chat_id=? WHERE id=?').run('demo-sibling', sibling.id);
  await f.message('sibling', `V${t.no} nhan`);
  assert.equal(f.sent.length, 1);
  assert.match(f.sent[0].text, /Không thể thực hiện/);
  const secret = await webhookSecret('test-bot');
  const response = await POST(new Request('http://localhost/api/zalo/webhook', {
    method: 'POST', headers: { 'X-Bot-Api-Secret-Token': secret },
    body: JSON.stringify({ message: { chat: { id: 'demo-staff' }, text: `V${t.no} nhan` } }),
  }));
  assert.equal(response.status, 200);
  const outbox = JSON.parse(String(f.raw.prepare("SELECT value FROM app_settings WHERE key='demo_zalo_outbox'").get()!.value));
  assert.equal(outbox.length, 2);
  assert.deepEqual(outbox.map((r: { to: string }) => r.to), ['demo-leader', 'demo-staff']);
  assert.equal(f.raw.prepare('SELECT status FROM zalo_tasks').get()!.status, 'da_nhan');
  f.raw.close();
});
