import assert from 'node:assert/strict';
import { test } from 'node:test';
import type Anthropic from '@anthropic-ai/sdk';
import { emptyDb } from './support/d1-sqlite';
import { loginAs } from './support/session';
import { POS } from '../lib/shared/report-model';
import { todayVn, addDays } from '../lib/shared/report-time';
import { askClaude } from '../lib/ai/ai-ask';
import { cachedAskPack, peopleCsv, hoursCsv } from '../lib/ai/ai-ask-pack';
import { createReview, pollReview, maybeReviewTick, readReview } from '../lib/kpi/forecast-review';
import { runForecast } from '../lib/kpi/forecast-run';
import { GET } from '../app/api/ai/forecast/route';
import { POST } from '../app/api/ai/forecast/review/route';
import { readSpend, pruneAiRows } from '../lib/ai/claude';

const message = (stop_reason = 'end_turn', content: unknown[] = [{ type: 'text', text: 'KET_QUA' }]) => ({ stop_reason, content, usage: { input_tokens: 100, output_tokens: 20 } });
const clientOf = (create: (p: Anthropic.MessageCreateParamsNonStreaming) => Promise<unknown>) => ({ messages: { create } }) as unknown as Pick<Anthropic, 'messages'>;
const request = (date: string) => new Request(`http://localhost/api/ai/forecast?date=${date}`);

void test('R1 forecast route: owner, director toàn quyền; chặn mọi phạm vi bị giới hạn', async () => {
  const { raw } = emptyDb({ DEMO_MODE: '1' });
  try {
    const date = todayVn();
    raw.prepare('INSERT INTO app_settings(key,value,updated_at) VALUES (?,?,?)').run(`ai_forecast:${date}`, JSON.stringify({ points: [{ t: '08:00', actual: 10, today: 20, week: 100, weekActual: 40 }], morning: { people: [{ id: 'NV_DEMO' }] } }), date);
    for (const role of ['owner', 'director'] as const) {
      await loginAs(raw, role, { views: ['center'] });
      const res = await GET(request(date)), body = await res.json() as Record<string, unknown>;
      assert.equal(res.status, 200); assert.equal(body.actual, 10); assert.equal(body.weekActual, 40);
      assert.equal('people' in body, role === 'owner');
    }
    for (const role of ['lead', 'staff'] as const) {
      await loginAs(raw, role, { views: ['center'] }); assert.equal((await GET(request(date))).status, 403);
    }
    for (const opts of [{ posIds: [POS[0].id] }, { team: 'sale' }]) {
      await loginAs(raw, 'director', { views: ['center'], ...opts });
      const res = await GET(request(date)); assert.equal(res.status, 403); assert.ok(!JSON.stringify(await res.json()).includes('weekActual'));
    }
  } finally { raw.close(); }
});

void test('R1 UUID và ranh giới Unicode; chỉ giữ chữ lượt cuối, một ghi sổ cho nhiều lượt và khi SDK lỗi', async () => {
  let writes = 0;
  const { raw, db } = emptyDb({ DEMO_MODE: '1' }, { onWrite(sql) { if (sql.includes("'calls'")) writes++; } });
  try {
    const today = todayVn(), id = '12345678-9012-4123-8123-123456789012';
    raw.prepare('INSERT INTO pos_users(id,pos_id,user_id,name,fetched_at) VALUES (?,?,?,?,?)').run('fake', POS[0].id, id, 'NGẮN', today);
    let calls = 0;
    const client = clientOf(async p => {
      calls++;
      const body = JSON.stringify(p.messages[0]);
      assert.ok(body.includes(`[[nv:${id}]]`)); assert.ok(body.includes('DÀINGẮN')); assert.ok(body.includes('NGẮNĐUÔI'));
      return calls === 1 ? message('tool_use', [{ type: 'text', text: 'CHU_TRUNG_GIAN' }, { type: 'tool_use', id: 'T', name: 'unknown', input: {} }]) : message();
    });
    const r = await askClaude(db, 'NGẮN DÀINGẮN NGẮNĐUÔI', { userId: 'OWNER_DEMO' }, { mode: 'live', client });
    assert.equal(r.answer, 'KET_QUA'); assert.equal(writes, 1); assert.equal((await readSpend(db, today.slice(0, 7))).calls, 2);
    calls = 0;
    await assert.rejects(askClaude(db, 'NGẮN DÀINGẮN NGẮNĐUÔI', { userId: 'OWNER_DEMO' }, { mode: 'live', client: clientOf(async p => {
      if (calls++) throw new Error('SDK_PRIVATE');
      assert.ok(p.messages.length); return message('tool_use', [{ type: 'tool_use', id: 'T', name: 'unknown', input: {} }]);
    }) }), /Không thể trả lời/);
    assert.equal(writes, 2); assert.equal((await readSpend(db, today.slice(0, 7))).calls, 3);
  } finally { raw.close(); }
});

void test('R1 cache: cùng ngày dùng cùng promise, đổi ngày dựng mới; SQL dùng chỉ mục POS và khoảng ngày', async t => {
  const { raw, db } = emptyDb({ DEMO_MODE: '1' });
  const queries: { sql: string; args: (string | number | null)[] }[] = [];
  // Quan sát đúng SQL chạy thật, gồm cả lời gọi từ overviewReport qua env.DB.
  const prepare = db.prepare.bind(db);
  db.prepare = ((sql: string) => {
    const wrap = (stmt: D1PreparedStatement, args: (string | number | null)[]): D1PreparedStatement => new Proxy(stmt, { get(target, key) {
      if (key === 'bind') return (...binds: (string | number | null)[]) => wrap(target.bind(...binds), binds);
      if (key === 'all' || key === 'first' || key === 'run') return (...rest: unknown[]) => {
        queries.push({ sql, args }); return (target[key] as (...a: unknown[]) => unknown)(...rest);
      };
      return Reflect.get(target, key);
    } });
    return wrap(prepare(sql), []);
  }) as typeof db.prepare;
  try {
    const countReads = () => queries.filter(q => /FROM (raw_pos_orders|stats_daily)\b/.test(q.sql)).length;
    const today = todayVn(), a = cachedAskPack(db, today);
    assert.equal(cachedAskPack(db, today), a); await a;
    const packReads = countReads();
    const count = queries.length; await cachedAskPack(db, today); assert.equal(queries.length, count);
    const b = cachedAskPack(db, addDays(today, 1)); assert.notEqual(b, a); await b;
    await peopleCsv(db, today, today, null, 'ngay'); await hoursCsv(db, today, today, null);
    queries.length = 0;
    await runForecast(db, new Date(`${today}T08:00:00+07:00`));
    t.diagnostic(`SQL đọc hai bảng: forecast sau=${countReads()}, trước=${countReads() - 4}; pack lịch sử=${packReads}; câu hỏi trước=${packReads + 1}, sau lần đầu=${packReads + 1}, sau cache=1; công cụ thêm 1 hoặc 2 câu/lượt.`);
    const hourly = queries.filter(q => q.sql.includes(' AS dh,'));
    assert.equal(hourly.length, 5);
    for (const q of hourly) {
      assert.ok(!q.sql.includes(' OR (first_closed_at')); assert.ok(q.sql.includes('pos_id IN'));
      assert.ok(raw.prepare(`EXPLAIN QUERY PLAN ${q.sql}`).all(...q.args).some(r => String(r.detail).includes('idx_raw_orders_pos_closed_status_money')));
    }
    // Thêm SQL pack/review vào tập kiểm EXPLAIN.
    await peopleCsv(db, today, today, null, 'ngay'); await hoursCsv(db, today, today, null);
    await createReview(db, 'review', addDays(today, -1), new Date(), false, { mode: 'demo' });
    let checked = 0;
    for (const q of queries.filter(q => q.sql.startsWith('SELECT') && /FROM (raw_pos_orders|stats_daily) WHERE/.test(q.sql))) {
      const details = raw.prepare(`EXPLAIN QUERY PLAN ${q.sql}`).all(...q.args).map(r => String(r.detail));
      assert.ok(!details.some(d => /SCAN (raw_pos_orders|stats_daily)\b/.test(d)), details.join('\n'));
      assert.ok(details.some(d => /SEARCH (raw_pos_orders|stats_daily) USING .*INDEX/.test(d)), details.join('\n'));
      checked++;
    }
    assert.ok(checked >= 9);
  } finally { raw.close(); }
});

void test('R1 Batch: mã hợp lệ, không ghi khi còn chờ; chặn phân tích lại, giới hạn 3 và trần 30', async () => {
  let writes = 0, creates = 0;
  const { raw, db } = emptyDb({ DEMO_MODE: '1' }, { onWrite(sql) { if (sql.startsWith('INSERT INTO app_settings(key,value,updated_at)')) writes++; } });
  try {
    const today = todayVn(), date = addDays(today, -1), now = new Date();
    const validate = (id: string) => { if (!/^[a-zA-Z0-9_-]{1,64}$/.test(id)) throw new Error('invalid custom_id'); };
    assert.throws(() => validate(`ai_review:${date}`), /invalid/);
    const client = { messages: { create: async (p: { max_tokens: number }) => { assert.equal(p.max_tokens, 16000); return message(); }, batches: {
      create: async (p: { requests: { custom_id: string }[] }) => { creates++; p.requests.forEach(r => validate(r.custom_id)); assert.equal(p.requests[0].custom_id, `review-${date}`); return { id: 'batch-demo' }; },
      retrieve: async () => ({ processing_status: 'in_progress' }),
    } } } as unknown as Pick<Anthropic, 'messages'>;
    const options = { mode: 'live' as const, client };
    const r = await createReview(db, 'review', date, now, false, options);
    assert.equal(writes, 1); assert.equal(creates, 1);
    await pollReview(db, r, new Date(now.getTime() + 300_000), client); assert.equal(writes, 1);
    await assert.rejects(createReview(db, 'review', date, now, true, options), /Đang chờ/);
    await loginAs(raw, 'owner');
    assert.equal((await POST(new Request('http://localhost/api/ai/forecast/review', { method: 'POST', body: JSON.stringify({ date }) }))).status, 409);
    raw.prepare('DELETE FROM app_settings WHERE key=?').run(`ai_review:${date}`);
    for (let n = 0; n < 3; n++) assert.equal((await createReview(db, 'review', date, now, true, options)).status, 'done');
    await assert.rejects(createReview(db, 'review', date, now, true, options), /3 lần/);
    raw.prepare('DELETE FROM app_settings WHERE key=?').run(`ai_review_count:${today}`);
    raw.prepare('UPDATE app_settings SET value=? WHERE key=?').run(JSON.stringify({ usd: 30, calls: 3 }), `ai_spend:${today.slice(0, 7)}`);
    await assert.rejects(createReview(db, 'review', date, now, true, options), /chi phí/);
    raw.prepare('UPDATE app_settings SET value=? WHERE key=?').run(JSON.stringify({ usd: 35, calls: 3 }), `ai_spend:${today.slice(0, 7)}`);
    const stopped = await createReview(db, 'review', date, now, false, options);
    assert.equal(stopped.status, 'error'); assert.match(stopped.error!, /chi phí/);
    raw.prepare('INSERT INTO app_settings(key,value,updated_at) VALUES (?,?,?)').run(`ai_review_count:${addDays(today, -7)}`, '3', today);
    await pruneAiRows(db, today);
    assert.equal(raw.prepare('SELECT value FROM app_settings WHERE key=?').get(`ai_review_count:${addDays(today, -7)}`), undefined);
  } finally { raw.close(); }
});

void test('R1 lịch đêm: lỗi API được thử lại đúng một lần trong khung giờ', async t => {
  const logs: unknown[][] = [];
  t.mock.method(console, 'error', (...args: unknown[]) => { logs.push(args); });
  const { raw, db } = emptyDb({ DEMO_MODE: '1' });
  try {
    let calls = 0;
    const client = { messages: { batches: { create: async () => { calls++; throw new Error('SDK_PRIVATE'); } } } } as unknown as Pick<Anthropic, 'messages'>;
    for (const minute of [20, 25, 30]) await maybeReviewTick(new Date(`2026-10-20T00:${minute}:00+07:00`), { mode: 'live', client });
    assert.equal(calls, 2); assert.equal((await readReview(db, 'review', '2026-10-19'))?.status, 'error');
    assert.equal(logs.length, 2); assert.ok(!JSON.stringify(logs).includes('SDK_PRIVATE'));
  } finally { raw.close(); }
});
