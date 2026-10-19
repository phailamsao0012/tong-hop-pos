import assert from 'node:assert/strict';
import { test } from 'node:test';
import type Anthropic from '@anthropic-ai/sdk';
import { accuracy, buildDayReview, buildWeekReview, createReview, maybeReviewTick, pollReview, readReview, splitReview, withNames } from '../lib/forecast-review';
import { readSpend } from '../lib/claude';
import { GET, POST } from '../app/api/ai/forecast/review/route';
import { emptyDb } from './support/d1-sqlite';
import { loginAs } from './support/session';
import { parseAccess, scopeApi } from '../lib/access';
import { POS } from '../lib/report-model';
import { addDays } from '../lib/report-time';

void test('splitReview: nghỉ, mới, chưa gán, top có dấu và tổng khớp tuyệt đối', () => {
  const p = (id: string, assigned: number, closed: number, net: number) => ({ id, assigned, closed, net });
  const result = splitReview([p('A', 10, 5, 100), p('B', 10, 5, 100), p('C', 10, 5, 100), p('', 0, 0, 20)],
    [p('B', 10, 3, 60), p('C', 10, 8, 160), p('D', 5, 2, 40), p('', 0, 0, 30)], 350, 290);
  assert.equal(result.people.find(p => p.id === 'A')?.group, 'nghi');
  assert.equal(result.people.find(p => p.id === 'D')?.group, 'moi');
  assert.equal(result.parts.nghi, -100); assert.equal(result.parts.moi, 40); assert.equal(result.parts.chuaGan, 10);
  assert.equal(Object.values(result.parts).reduce((s, n) => s + n, 0), result.delta);
  assert.deepEqual(result.top.slice(0, 2).map(p => [p.id, p.impact]), [['C', 60], ['B', -40]]);
  for (let i = 0; i < 100; i++) {
    const r = splitReview([p('A', 7, 3, 91)], [p('A', i, i % 7, i * 3)], 117, i * 3);
    assert.equal(Object.values(r.parts).reduce((s, n) => s + n, 0), r.delta);
  }
});
void test('accuracy: điểm gần nhất trước mốc, không dùng tương lai, thực tế 0 trả null', () => {
  const points = [{ t: '11:30', today: 80, actual: 30, week: null }, { t: '12:30', today: 200, actual: 50, week: null }];
  assert.equal(accuracy(points, 100)[0].forecast, null);
  assert.equal(accuracy(points, 100)[1].errorPct, -20);
  assert.equal(accuracy(points, 0)[1].errorPct, null);
});
void test('withNames: thay tên phía máy chủ, mã lạ và thuộc tính prototype không lộ', () => {
  assert.equal(withNames('[[nv:A]] [[nv:UNKNOWN]] [[nv:toString]]', { A: 'TEN_GIA_LAP' }), 'TEN_GIA_LAP nhân viên không rõ nhân viên không rõ');
});
function seed(raw: ReturnType<typeof emptyDb>['raw'], date: string) {
  const pos = POS[0].id;
  raw.prepare('INSERT INTO pos_users(id,pos_id,user_id,name,fetched_at) VALUES (?,?,?,?,?)').run('demo', pos, 'NV_DEMO', 'TEN_GIA_LAP SALE', date);
  for (let i = -56; i <= 0; i++) {
    const day = addDays(date, i);
    raw.prepare('INSERT INTO stats_daily(id,pos_id,day,seller_id,assigned_orders,closed_orders,closed_net,updated_at) VALUES (?,?,?,?,10,2,100,?)').run(day, pos, day, 'NV_DEMO', date);
    raw.prepare(`INSERT INTO raw_pos_orders(id,pos_id,shop_id,source_order_id,seller_id,status_code,first_closed_at,net_total,fetched_at,raw_json) VALUES (?,?,?,?,?,1,?,100,?,?)`).run(day, pos, 'demo', day, 'NV_DEMO', `${day}T00:00:00`, date, JSON.stringify({ name: 'TEN_GIA_LAP', note: 'GHI_CHU_GIA_LAP' }));
  }
  raw.prepare('INSERT INTO app_settings(key,value,updated_at) VALUES (?,?,?)').run(`ai_forecast:${date}`, JSON.stringify({ date, morning: { total: 120, people: [{ id: 'NV_DEMO', assigned: 10, closed: 2, net: 120, name: 'TEN_GIA_LAP', note: 'GHI_CHU_GIA_LAP' }] }, points: [{ t: '11:30', actual: 60, today: 110, week: 700 }] }), date);
}
void test('Day/Week: morning, tính lại, tuần đủ 7 ngày, chỉ số và mã; demo SQLite local done', async (t) => {
  t.mock.method(globalThis, 'fetch', () => { throw new Error('Không gọi mạng'); });
  const { raw, db } = emptyDb({ DEMO_MODE: '1' });
  try {
    const date = '2026-10-18'; seed(raw, date);
    const day = await buildDayReview(db, date);
    assert.equal(day.basis, 'morning'); assert.equal(day.actual, 100); assert.equal(day.delta, -20);
    assert.equal(day.accuracy[1].errorPct, 10);
    assert.ok(!JSON.stringify(day).includes('TEN_GIA_LAP')); assert.ok(!JSON.stringify(day).includes('GHI_CHU_GIA_LAP'));
    const week = await buildWeekReview(db, '2026-10-12');
    assert.equal(week.forecast, 700); assert.equal(week.actual, 700); assert.equal(week.noonMeanErrorPct, 10);
    assert.equal(Object.values(week.parts).reduce((s, n) => s + n, 0), 0);
    await maybeReviewTick(new Date('2026-10-19T00:15:00+07:00'), { mode: 'demo' });
    assert.equal(await readReview(db, 'review', date), null);
    await maybeReviewTick(new Date('2026-10-19T00:20:00+07:00'), { mode: 'demo' });
    const r = await readReview(db, 'review', date);
    assert.equal(r?.status, 'done'); assert.ok(r?.text?.startsWith('(Trả lời mẫu')); assert.equal(r?.usd, 0);
    t.diagnostic(`Mẫu demo local SQLite: ${JSON.stringify(r)}`);
    await maybeReviewTick(new Date('2026-10-19T00:40:00+07:00'), { mode: 'demo' });
    assert.equal((await readReview(db, 'week', '2026-10-12'))?.status, 'done');
    assert.equal((await readSpend(db, new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 7))).calls, 0);
    raw.prepare('DELETE FROM app_settings WHERE key=?').run(`ai_forecast:${date}`);
    const rebuilt = await buildDayReview(db, date);
    assert.equal(rebuilt.basis, 'tinh-lai'); assert.equal(rebuilt.forecast, 100);
    assert.equal((await createReview(db, 'review', date, new Date(), false, { mode: 'off' })).status, 'off');
  } finally { raw.close(); }
});
void test('Batch giả: create, running, ended, khớp custom_id; lỗi, refusal, timeout, budget và trực tiếp', async (t) => {
  t.mock.method(globalThis, 'fetch', () => { throw new Error('Không gọi mạng'); });
  const { raw, db } = emptyDb({ DEMO_MODE: '1' });
  try {
    const date = '2026-10-18'; seed(raw, date);
    const now = new Date('2026-10-19T00:20:00+07:00');
    let ended = false, outcome = 'succeeded', reason = 'end_turn', retrieves = 0, direct = 0, creates = 0;
    const message = () => ({ stop_reason: reason, content: [{ type: 'text', text: '[[nv:NV_DEMO]]' }], usage: { input_tokens: 100, output_tokens: 20 } });
    const client = { messages: {
      create: async () => { direct++; return message(); },
      batches: {
        create: async (request: unknown) => { creates++; const requests = (request as { requests: { custom_id: string }[] }).requests; for (const r of requests) assert.match(r.custom_id, /^[a-zA-Z0-9_-]{1,64}$/); const json = JSON.stringify(request); assert.ok(!json.includes('TEN_GIA_LAP')); assert.ok(!json.includes('GHI_CHU_GIA_LAP')); return { id: `batch-demo-${creates}` }; },
        retrieve: async () => { retrieves++; return { processing_status: ended ? 'ended' : 'in_progress' }; },
        results: async function* () {
          yield { custom_id: 'other', result: { type: 'errored' } };
          yield { custom_id: `review-${date}`, result: outcome === 'succeeded' ? { type: outcome, message: message() } : { type: outcome } };
        },
      },
    } } as unknown as Pick<Anthropic, 'messages'>;
    const options = { mode: 'live' as const, client };
    let r = await createReview(db, 'review', date, now, false, options);
    assert.equal(r.status, 'batch');
    r = await pollReview(db, r, new Date(now.getTime() + 60_000), client); assert.equal(retrieves, 0);
    r = await pollReview(db, r, new Date(now.getTime() + 300_000), client); assert.equal(r.status, 'batch');
    ended = true;
    r = await pollReview(db, r, new Date(now.getTime() + 600_000), client); assert.equal(r.status, 'done'); assert.equal(r.text, '[[nv:NV_DEMO]]'); assert.equal(r.usd, 0.0002);
    for (outcome of ['errored', 'expired', 'canceled']) {
      r = await createReview(db, 'review', date, now, false, options);
      assert.equal((await pollReview(db, r, new Date(now.getTime() + 300_000), client)).status, 'error');
    }
    outcome = 'succeeded'; reason = 'refusal'; r = await createReview(db, 'review', date, now, false, options);
    assert.equal((await pollReview(db, r, new Date(now.getTime() + 300_000), client)).error, 'Claude từ chối trả lời câu này');
    reason = 'end_turn'; r = await createReview(db, 'review', date, now, false, options);
    assert.match((await pollReview(db, r, new Date(now.getTime() + 27 * 3600_000), client)).error!, /26 giờ/);
    assert.equal((await createReview(db, 'review', date, now, true, options)).status, 'done'); assert.equal(direct, 1);
    const month = new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 7);
    assert.equal((await readSpend(db, month)).calls, 3);
    raw.prepare('UPDATE app_settings SET value=? WHERE key=?').run(JSON.stringify({ usd: 35, calls: 3 }), `ai_spend:${month}`);
    const count = creates;
    assert.equal((await createReview(db, 'review', date, now, false, options)).status, 'error'); assert.equal(creates, count);
    await assert.rejects(createReview(db, 'review', date, now, true, options), /chi ph?/); assert.equal(direct, 1);
  } finally { raw.close(); }
});
void test('Route review: owner-only trước forecast, GET/POST, ngày sai và tuần chưa hết', async () => {
  const { raw, db } = emptyDb({ DEMO_MODE: '1' });
  try {
    const date = '2026-10-18'; seed(raw, date);
    for (const role of ['director', 'lead', 'staff'] as const) {
      await loginAs(raw, role, { views: ['center'] });
      const access = parseAccess({ role, views_json: '["center"]' });
      for (const method of ['GET', 'POST']) assert.ok(scopeApi(access, method, new URL('http://localhost/api/ai/forecast/review')).blocked);
      assert.equal((await GET(new Request(`http://localhost/api/ai/forecast/review?date=${date}`))).status, 403);
      assert.equal((await POST(new Request('http://localhost/api/ai/forecast/review', { method: 'POST', body: '{}' }))).status, 403);
    }
    await loginAs(raw, 'owner');
    assert.equal((await GET(new Request('http://localhost/api/ai/forecast/review?date=2026-02-30'))).status, 400);
    assert.equal((await GET(new Request('http://localhost/api/ai/forecast/review?week=2026-10-13'))).status, 400);
    assert.equal((await POST(new Request('http://localhost/api/ai/forecast/review', { method: 'POST', body: 'null' }))).status, 400);
    await createReview(db, 'review', date, new Date(), false, { mode: 'demo' });
    const response = await GET(new Request(`http://localhost/api/ai/forecast/review?date=${date}`));
    assert.equal(response.status, 200); assert.equal(response.headers.get('Cache-Control'), 'no-store');
    const post = await POST(new Request('http://localhost/api/ai/forecast/review', { method: 'POST', body: JSON.stringify({ date }) }));
    assert.equal(post.status, 200); assert.equal(((await post.json()) as { status: string }).status, 'done');
  } finally { raw.close(); }
});
