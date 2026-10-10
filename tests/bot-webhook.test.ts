// Webhook bot Telegram chạy thật trên D1 giả (node:sqlite), Telegram giả (bắt lời gọi fetch): kiểm luật dữ liệu cá nhân 10/10/2026.
import assert from 'node:assert/strict';
import { before, beforeEach, test } from 'node:test';
import type { DatabaseSync } from 'node:sqlite';
import { emptyDb } from './support/d1-sqlite';

type Sent = { method: string; body: Record<string, unknown> };
let sent: Sent[] = [];
let raw: DatabaseSync;
let POST: (r: Request) => Promise<Response>;
let recruitChatIds: () => Promise<string[]>;
let pairingCode: (offset?: number) => Promise<string>;

const OWNER_CHAT = '111', STAFF_ALERT_CHAT = '222', MEMBER_CHAT = '333', GROUP = '-100500', STRANGER = '999';
const now = new Date().toISOString();

before(async () => {
  ({ raw } = emptyDb({ TELEGRAM_WEBHOOK_SECRET: 's', TELEGRAM_BOT_TOKEN: 't', AUTH_SECRET: 'x' }));
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input instanceof Request ? input.url : input);
    if (!url.startsWith('https://api.telegram.org/')) throw new Error(`gọi mạng ngoài Telegram trong test: ${url}`);
    sent.push({ method: url.split('/').pop()!, body: typeof init?.body === 'string' ? JSON.parse(init.body) as Record<string, unknown> : {} });
    return Response.json({ ok: true, result: {} });
  }) as typeof fetch;
  ({ POST } = await import('../app/api/telegram/webhook/route'));
  ({ recruitChatIds } = await import('../lib/recruit'));
  ({ pairingCode } = await import('../lib/bot-menu'));
  const user = raw.prepare('INSERT INTO users (id,email,name,password_hash,role,disabled,created_at,updated_at) VALUES (?,?,?,?,?,0,?,?)');
  user.run('u-owner', 'o@x', 'Chủ', '-', 'owner', now, now);
  user.run('u-staff', 's@x', 'Nhân viên', '-', 'staff', now, now);
  const rule = raw.prepare('INSERT INTO alert_rules (owner_id,chat_id,updated_at) VALUES (?,?,?)');
  rule.run('u-owner', OWNER_CHAT, now);
  rule.run('u-staff', STAFF_ALERT_CHAT, now);
  const chat = raw.prepare("INSERT INTO telegram_chats (chat_id,name,added_by,added_at,role) VALUES (?,?,'test',?,?)");
  chat.run(MEMBER_CHAT, 'Thành viên', now, 'member');
  chat.run(GROUP, 'Nhóm', now, 'admin');
  const cs = raw.prepare('INSERT INTO customer_stats (id,pos_id,phone,name,success_orders,success_net,updated_at) VALUES (?,?,?,?,?,?,?)');
  cs.run('c1', 'p1', '0912345678', 'Nguyễn Văn An', 3, 3000000, now);
  cs.run('c2', 'p2', '0987654321', 'Nguyễn Văn Bình', 5, 9000000, now);
});
beforeEach(() => { sent = []; });

const msg = (chatId: string, text: string) => POST(new Request('https://x/api/telegram/webhook', {
  method: 'POST', headers: { 'x-telegram-bot-api-secret-token': 's' },
  body: JSON.stringify({ message: { chat: { id: Number(chatId), title: chatId.startsWith('-') ? 'Nhóm' : undefined, first_name: 'A' }, from: { id: 7, first_name: 'A' }, text } }),
}));
const replies = () => sent.filter((x) => x.method === 'sendMessage').map((x) => String(x.body.text)).join('\n');
const audits = (action: string) => (raw.prepare('SELECT COUNT(*) AS n FROM audit_log WHERE action=?').get(action) as { n: number }).n;

void test('nhóm chat, chat thành viên, chat cảnh báo của nhân viên: không tra được khách', async () => {
  for (const chat of [GROUP, MEMBER_CHAT, STAFF_ALERT_CHAT]) {
    sent = [];
    await msg(chat, '/khach 0912345678');
    assert.match(replies(), /chỉ dùng trong chat riêng/);
    assert.ok(!replies().includes('0912345678') && !replies().includes('Nguyễn Văn An'), `lộ khách ở chat ${chat}`);
  }
  assert.equal(audits('bot.customer.denied'), 3);
});

void test('chat riêng của chủ hệ thống: tra được, gõ 1 ký tự thì không ra danh sách, nhiều kết quả thì che SĐT, tin chặn chuyển tiếp', async () => {
  await msg(OWNER_CHAT, '/khach 9');
  assert.match(replies(), /ít nhất 9 chữ số/);
  assert.ok(!replies().includes('0987654321'));
  sent = [];
  await msg(OWNER_CHAT, '/khach Nguyễn Văn');
  const text = replies();
  assert.match(text, /Có 2 khách khớp/);
  assert.ok(!text.includes('0912345678') && !text.includes('0987654321'), 'danh sách nhiều khách phải che SĐT');
  assert.match(text, /•+678/);
  assert.ok(sent.filter((x) => x.method === 'sendMessage').some((x) => x.body.protect_content === true));
  assert.ok(audits('bot.customer.lookup') >= 2);
});

void test('/tuyendung: chỉ chat tin cậy; chat khác bật cũng không nhận tin ứng viên', async () => {
  await msg(GROUP, '/tuyendung bat');
  assert.match(replies(), /chỉ gửi tới chat của chủ hệ thống hoặc giám đốc/);
  raw.prepare("INSERT INTO app_settings (key,value,updated_at) VALUES (?,?,?)").run(`recruit_chat:${MEMBER_CHAT}`, 'on', now);
  assert.deepEqual(await recruitChatIds(), [OWNER_CHAT]);
  await msg(OWNER_CHAT, '/tuyendung tat');
  assert.deepEqual(await recruitChatIds(), []);
  await msg(OWNER_CHAT, '/tuyendung bat');
  assert.deepEqual(await recruitChatIds(), [OWNER_CHAT]);
  assert.equal(audits('bot.recruit.denied'), 1);
});

void test('dò mã ghép nối: sai 5 lần thì khoá, mã đúng cũng không vào được', async () => {
  for (let i = 0; i < 5; i++) await msg(STRANGER, '/start 000001');
  assert.equal(audits('bot.pair.fail'), 5);
  sent = [];
  await msg(STRANGER, `/start ${await pairingCode(0)}`);
  assert.match(replies(), /Nhập sai quá nhiều lần/);
  assert.equal(raw.prepare('SELECT 1 FROM telegram_chats WHERE chat_id=?').get(STRANGER), undefined);
});

void test('ghép nối đúng mã không biến chat thành nơi nhận cảnh báo (chat tin cậy)', async () => {
  raw.prepare("UPDATE alert_rules SET chat_id='' WHERE owner_id='u-owner'").run();
  await msg('555', `/start ${await pairingCode(0)}`);
  assert.match(replies(), /Đã kết nối/);
  assert.equal((raw.prepare("SELECT chat_id FROM alert_rules WHERE owner_id='u-owner'").get() as { chat_id: string }).chat_id, '');
  raw.prepare("UPDATE alert_rules SET chat_id=? WHERE owner_id='u-owner'").run(OWNER_CHAT);
});

void test('duyệt người lạ: nhóm và chat cảnh báo của nhân viên không duyệt được', async () => {
  for (const chat of [GROUP, STAFF_ALERT_CHAT]) {
    sent = [];
    await POST(new Request('https://x/api/telegram/webhook', { method: 'POST', headers: { 'x-telegram-bot-api-secret-token': 's' },
      body: JSON.stringify({ callback_query: { id: 'q', data: `acc:allow:${STRANGER}`, from: { id: 8, first_name: 'B' }, message: { message_id: 1, chat: { id: Number(chat) } } } }) }));
    assert.match(replies(), /Chỉ chat của chủ hệ thống hoặc giám đốc/);
  }
  assert.equal(raw.prepare('SELECT 1 FROM telegram_chats WHERE chat_id=?').get(STRANGER), undefined);
});
