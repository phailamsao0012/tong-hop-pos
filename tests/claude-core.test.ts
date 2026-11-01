import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { env } from 'cloudflare:workers';
import { d1 } from './support/d1-sqlite';
import { addSpend, budgetLeft, claudeClient, claudeMode, costUsd, pruneAiRows, readSpend, takeAskSlot, usageOf } from '../lib/ai/claude';
import { fakeAnswer } from '../lib/demo/fake-claude';

function database() {
  const raw = new DatabaseSync(':memory:');
  raw.exec('CREATE TABLE app_settings(key TEXT PRIMARY KEY,value TEXT NOT NULL,updated_at TEXT NOT NULL)');
  return { raw, db: d1(raw) };
}
void test('costUsd: từng loại token, Batch một nửa, thiếu/null bằng 0, không làm tròn sớm', () => {
  assert.deepEqual(usageOf(), { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 });
  assert.deepEqual(usageOf({ input_tokens: null, output_tokens: null, cache_read_input_tokens: null, cache_creation_input_tokens: null }), usageOf());
  for (const [key, price] of Object.entries({ input: 2, output: 10, cacheRead: 0.2, cacheWrite: 2.5 })) {
    const usage = { ...usageOf(), [key]: 1_000_000 };
    assert.equal(costUsd(usage), price);
    assert.equal(costUsd(usage, { batch: true }), price / 2);
  }
  assert.ok(Math.abs(costUsd(usageOf({ cache_read_input_tokens: 1 })) - 0.0000002) < 1e-20);
});
void test('takeAskSlot: 41 yêu cầu đồng thời, đúng thứ tự và dừng ở 40', async () => {
  const { raw, db } = database();
  try {
    const slots = await Promise.all(Array.from({ length: 41 }, () => takeAskSlot(db, '2026-10-19')));
    assert.deepEqual(slots.slice(0, 40).map((s) => s.used), Array.from({ length: 40 }, (_, i) => i + 1));
    assert.ok(slots.slice(0, 40).every((s) => s.ok));
    assert.deepEqual(slots[40], { ok: false, used: 40 });
    assert.equal(raw.prepare('SELECT value FROM app_settings').get()!.value, '40');
    assert.deepEqual(await takeAskSlot(db, '2026-10-20'), { ok: true, used: 1 });
  } finally { raw.close(); }
});
void test('addSpend: hai lần cộng nguyên tử vào một dòng, tháng VN và trần riêng', async (t) => {
  t.mock.method(Date, 'now', () => Date.parse('2026-10-31T18:00:00Z'));
  const { raw, db } = database();
  try {
    assert.equal((await budgetLeft(db, 'ask')).ok, true);
    const usage = usageOf({ input_tokens: 1_000_000, output_tokens: 1_000_000, cache_read_input_tokens: 1_000_000, cache_creation_input_tokens: 1_000_000 });
    await addSpend(db, usage);
    await addSpend(db, usage, { batch: true });
    assert.deepEqual(await readSpend(db, '2026-11'), { usd: 22.05, calls: 2, input: 2_000_000, output: 2_000_000, cacheRead: 2_000_000, cacheWrite: 2_000_000 });
    assert.equal(raw.prepare('SELECT count(*) AS n FROM app_settings').get()!.n, 1);
    assert.equal((await readSpend(db, '2026-10')).usd, 0);
    await addSpend(db, usageOf({ output_tokens: 795_000 }));
    assert.deepEqual(await budgetLeft(db, 'ask'), { ok: false, usd: 30, cap: 30 });
    assert.deepEqual(await budgetLeft(db, 'review'), { ok: true, usd: 30, cap: 35 });
    await addSpend(db, usageOf({ output_tokens: 500_000 }));
    assert.deepEqual(await budgetLeft(db, 'review'), { ok: false, usd: 35, cap: 35 });
  } finally { raw.close(); }
});
void test('claudeMode: không khoá, demo/off; client không có khoá trả null', () => {
  // Shim env rỗng, không đọc hoặc dùng khoá thật.
  const before = env.DEMO_MODE;
  try {
    env.DEMO_MODE = '1';
    assert.equal(claudeMode(), 'demo');
    assert.equal(claudeClient(), null);
    env.DEMO_MODE = '0';
    assert.equal(claudeMode(), 'off');
  } finally { env.DEMO_MODE = before; }
});
void test('pruneAiRows: biên lưu giữ, hậu tố nhật ký và không xoá sổ tháng/khóa khác', async () => {
  const { raw, db } = database();
  try {
    const put = raw.prepare("INSERT INTO app_settings VALUES (?, '{}', '')");
    for (const [prefix, boundary] of [['ai_ask_count:', '2026-10-13'], ['ai_ask:', '2026-09-20'], ['ai_forecast:', '2026-08-21'], ['ai_review:', '2026-08-21'], ['ai_week:', '2026-08-21']]) {
      const old = new Date(Date.parse(boundary) - 86400_000).toISOString().slice(0, 10);
      put.run(`${prefix}${old}:001`);
      put.run(`${prefix}${boundary}:001`);
    }
    put.run('ai_spend:2026-01');
    put.run('other:2020-01-01');
    await pruneAiRows(db, '2026-10-19');
    assert.equal(raw.prepare('SELECT count(*) AS n FROM app_settings').get()!.n, 7);
    assert.ok(raw.prepare("SELECT key FROM app_settings WHERE key='ai_ask:2026-09-20:001'").get());
  } finally { raw.close(); }
});
void test('fakeAnswer: ba loại, không chép tên/ghi chú giả, không mạng và không ghi chi tiêu', (t) => {
  t.mock.method(globalThis, 'fetch', () => { throw new Error('Không được gọi mạng'); });
  const input = 'ma;ten;ghi_chu\nNV_DEMO;TEN_GIA_LAP;GHI_CHU_GIA_LAP';
  const { raw } = database();
  try {
    for (const kind of ['ask', 'review', 'week'] as const) {
      const answer = fakeAnswer(kind, input);
      assert.ok(answer.startsWith('(Trả lời mẫu của bản demo, chưa gắn khoá Claude)'));
      assert.ok(answer.includes('2 dòng'));
      assert.ok(!answer.includes('TEN_GIA_LAP') && !answer.includes('GHI_CHU_GIA_LAP'));
      assert.equal(answer, fakeAnswer(kind, input));
    }
    assert.equal(raw.prepare('SELECT count(*) AS n FROM app_settings').get()!.n, 0);
  } finally { raw.close(); }
});
