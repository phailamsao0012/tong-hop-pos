import test from 'node:test';
import assert from 'node:assert/strict';

// Ảnh báo cáo sếp chưa gửi được thì chờ gửi lại, không gửi bản chữ thay ảnh (anh Vũ 20/11/2026). Tên, số đều giả.
const T0 = Date.parse('2026-11-20T08:00:00+07:00');
const min = (n: number) => T0 + n * 60000;

void test('hàng chờ ảnh: thử lại mỗi 2 phút, gửi được thì bỏ, không thêm trùng', async () => {
  const { emptyDb } = await import('./support/d1-sqlite');
  const { queuePhoto, retryWaitingPhotos, PHOTO_WAIT_KEY } = await import('../lib/zalo/photo-wait');
  const { db, raw } = emptyDb();
  await queuePhoto(db, { imageId: 'a'.repeat(32), chatId: 'chat-1', caption: 'Báo cáo giả 8h', label: 'tổng quan 8h thứ Sáu 20/11', first: T0 }, T0);
  await queuePhoto(db, { imageId: 'a'.repeat(32), chatId: 'chat-1', caption: 'Báo cáo giả 8h', label: 'tổng quan 8h thứ Sáu 20/11', first: T0 }, T0);
  const sent: string[] = [], texts: string[] = [];
  let ok = false;
  const photo = async (chat: string, url: string) => { sent.push(`${chat} ${url}`); return ok; };
  const text = async (_chat: string, t: string) => { texts.push(t); };
  const url = (id: string) => `https://web.gia/api/zalo/anh/${id}`;
  assert.equal(await retryWaitingPhotos(db, min(1), photo, text, url), 0);
  assert.equal(sent.length, 0); // chưa đủ 2 phút
  assert.equal(await retryWaitingPhotos(db, min(2), photo, text, url), 0);
  assert.equal(sent.length, 1); // thử 1 lần, chỉ 1 ảnh (không trùng)
  assert.equal(await retryWaitingPhotos(db, min(3), photo, text, url), 0);
  assert.equal(sent.length, 1); // vừa thử lúc phút 2, chưa đủ 2 phút
  ok = true;
  assert.equal(await retryWaitingPhotos(db, min(4), photo, text, url), 1);
  assert.equal(sent.length, 2);
  assert.equal(await retryWaitingPhotos(db, min(10), photo, text, url), 0);
  assert.equal(sent.length, 2); // đã gửi xong thì không gửi lại
  assert.deepEqual(texts, []);
  const row = raw.prepare('SELECT value FROM app_settings WHERE key=?').get(PHOTO_WAIT_KEY) as { value: string };
  assert.deepEqual(JSON.parse(row.value), []);
});

void test('hàng chờ ảnh: quá 60 phút vẫn lỗi thì nhắn một tin ngắn không kèm số rồi bỏ', async () => {
  const { emptyDb } = await import('./support/d1-sqlite');
  const { queuePhoto, retryWaitingPhotos } = await import('../lib/zalo/photo-wait');
  const { db } = emptyDb();
  await queuePhoto(db, { imageId: 'b'.repeat(32), chatId: 'chat-2', caption: 'Doanh số giả 123 tr', label: 'tổng quan 12h thứ Sáu 20/11', first: T0 }, T0);
  const texts: string[] = [];
  let tries = 0;
  const photo = async () => { tries++; return false; };
  const text = async (_chat: string, t: string) => { texts.push(t); };
  for (let m = 2; m <= 70; m++) await retryWaitingPhotos(db, min(m), photo, text, (id) => id);
  assert.equal(texts.length, 1);
  assert.equal(texts[0], 'Báo cáo tổng quan 12h thứ Sáu 20/11 chưa gửi được ảnh, em đang kiểm.');
  assert.doesNotMatch(texts[0], /\d+ tr/);
  assert.ok(tries >= 25 && tries <= 31, `thử ${tries} lần trong 60 phút`);
  await retryWaitingPhotos(db, min(80), photo, text, (id) => id);
  assert.equal(texts.length, 1); // đã bỏ, không nhắn lại
});

void test('hàng chờ ảnh: hai lượt cron chạy chồng không gửi trùng', async () => {
  const { emptyDb } = await import('./support/d1-sqlite');
  const { queuePhoto, retryWaitingPhotos } = await import('../lib/zalo/photo-wait');
  const { db } = emptyDb();
  await queuePhoto(db, { imageId: 'c'.repeat(32), chatId: 'chat-3', caption: 'giả', label: 'chi tiết 17h', first: T0 }, T0);
  let sent = 0;
  const photo = async () => { sent++; await new Promise((r) => setTimeout(r, 20)); return true; };
  await Promise.all([retryWaitingPhotos(db, min(3), photo, async () => {}, (id) => id), retryWaitingPhotos(db, min(3), photo, async () => {}, (id) => id)]);
  assert.equal(sent, 1);
});

void test('báo cáo sếp: ảnh lỗi thì vào hàng chờ, sếp không nhận bản chữ; leader vẫn nhận bản chữ', async () => {
  const { emptyDb } = await import('./support/d1-sqlite');
  const { saveContact } = await import('../lib/zalo/zalo-work');
  const { maybeZaloTick } = await import('../lib/zalo/zalo-tick');
  const { PHOTO_WAIT_KEY } = await import('../lib/zalo/photo-wait');
  const { db, raw } = emptyDb({ DEMO_MODE: '1' });
  const boss = await saveContact(db, { name: 'Sếp giả', kind: 'boss' });
  await saveContact(db, { name: 'Leader giả', kind: 'leader', team_id: 'team-gia', team_name: 'Team giả', dept: 'sale' });
  raw.prepare('UPDATE zalo_contacts SET chat_id=id').run();
  raw.prepare("INSERT INTO app_settings (key,value,updated_at) VALUES ('zalo_tick_v1','{\"morningTest\":\"anh-1\"}','2026-11-20T00:00:00Z')").run();
  const messages: { chat: string; text: string }[] = [];
  const at = Date.parse('2026-11-20T12:00:00+07:00');
  await maybeZaloTick(at, {
    db, send: async (chat, text) => { messages.push({ chat, text }); },
    snapshot: async () => ({ total: 100, orders: 1, people: {} }), sendPhoto: async () => false, legacyBossSlot: true,
  });
  assert.ok(messages.length >= 1); // leader nhận bản chữ như cũ
  assert.ok(!messages.some((m) => m.chat === boss.id)); // sếp không nhận chữ
  const wait = JSON.parse((raw.prepare('SELECT value FROM app_settings WHERE key=?').get(PHOTO_WAIT_KEY) as { value: string }).value) as { chatId: string }[];
  assert.ok(wait.length >= 1 && wait.every((w) => w.chatId === boss.id));
});
