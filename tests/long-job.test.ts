import assert from 'node:assert/strict';
import { test } from 'node:test';

// Báo cáo kỳ dài chạy nền (lib/ops/long-job.ts): một lượt mỗi khoá, toàn web một lượt cùng lúc, nhớ 30 phút.
const tick = () => new Promise((r) => setTimeout(r, 0));

void test('kỳ dài: hơn 62 ngày mới chạy nền', async () => {
  const { isLongRange } = await import('../lib/ops/long-job');
  assert.equal(isLongRange('2026-11-01', '2026-11-26'), false);
  assert.equal(isLongRange('2026-09-26', '2026-11-26'), false, '62 ngày (đếm cả hai đầu) vẫn là kỳ ngắn');
  assert.equal(isLongRange('2026-09-25', '2026-11-26'), true);
  assert.equal(isLongRange('2026-01-01', '2026-11-26'), true);
});

void test('cùng khoá: hỏi lại nhiều lần chỉ tính MỘT lượt; xong thì trả kết quả đã nhớ', async () => {
  const { longJob, resetLongJobs } = await import('../lib/ops/long-job');
  resetLongJobs();
  let runs = 0, release!: () => void;
  const gate = new Promise<void>((r) => { release = r; });
  const run = async () => { runs++; await gate; return { n: 42 }; };
  const a = longJob('k1', run);
  assert.equal(a.state, 'running');
  for (let i = 0; i < 5; i++) assert.notEqual(longJob('k1', run).state, 'done', 'đang tính: Thử lại không tạo lượt mới');
  await tick();
  assert.equal(runs, 1);
  release(); await tick(); await tick();
  const done = longJob('k1', run);
  assert.deepEqual(done, { state: 'done', value: { n: 42 } });
  assert.equal(runs, 1, 'đã nhớ: không tính lại');
});

void test('toàn web một lượt cùng lúc: khoá thứ hai xếp hàng, chạy khi lượt trước xong', async () => {
  const { longJob, resetLongJobs } = await import('../lib/ops/long-job');
  resetLongJobs();
  const started: string[] = [];
  let r1!: () => void, r2!: () => void;
  const g1 = new Promise<void>((r) => { r1 = r; }), g2 = new Promise<void>((r) => { r2 = r; });
  assert.equal(longJob('a', async () => { started.push('a'); await g1; return 1; }).state, 'running');
  const b = longJob('b', async () => { started.push('b'); await g2; return 2; });
  assert.equal(b.state, 'queued');
  assert.equal(b.state === 'queued' && b.ahead, 1, 'còn một lượt phía trước');
  await tick();
  assert.deepEqual(started, ['a'], 'b chưa chạy khi a đang chạy');
  r1(); await tick(); await tick(); await tick();
  assert.deepEqual(started, ['a', 'b']);
  r2(); await tick(); await tick();
  assert.deepEqual(longJob('b', async () => 0), { state: 'done', value: 2 });
});

void test('nhớ 30 phút rồi bỏ; lỗi giữ 1 phút để Thử lại tính lượt mới', async () => {
  const { longJob, resetLongJobs, LONG_TTL_MS } = await import('../lib/ops/long-job');
  resetLongJobs();
  let now = 1_000_000, runs = 0;
  const clock = () => now;
  longJob('m', async () => ++runs, clock);
  await tick(); await tick();
  assert.deepEqual(longJob('m', async () => ++runs, clock), { state: 'done', value: 1 });
  now += LONG_TTL_MS + 1;
  assert.notEqual(longJob('m', async () => ++runs, clock).state, 'done', 'quá 30 phút: tính lại');
  await tick(); await tick();
  assert.deepEqual(longJob('m', async () => ++runs, clock), { state: 'done', value: 2 });
  longJob('e', async () => { throw new Error('hỏng'); }, clock);
  await tick(); await tick();
  assert.deepEqual(longJob('e', async () => 0, clock), { state: 'error', error: 'hỏng' });
  now += 61_000;
  assert.notEqual(longJob('e', async () => 7, clock).state, 'error', 'quá 1 phút: lỗi được bỏ, tính lại');
});

void test('trả lời API: kỳ ngắn trả ngay; kỳ dài trả 202 rồi trả kết quả đã nhớ, mỗi người một khoá', async () => {
  const { resetLongJobs } = await import('../lib/ops/long-job');
  const { longOrNow } = await import('../lib/ops/long-response');
  resetLongJobs();
  let runs = 0;
  const compute = async () => { runs++; return { status: 200, body: { ok: runs } }; };
  const short = await longOrNow(new Request('http://x/api/m?start=2026-11-01&end=2026-11-26'), 'u1', '2026-11-01', '2026-11-26', compute);
  assert.equal(short.status, 200);
  const req = () => new Request('http://x/api/m?end=2026-11-26&start=2026-01-01');
  const first = await longOrNow(req(), 'u1', '2026-01-01', '2026-11-26', compute);
  assert.equal(first.status, 202);
  assert.equal(first.headers.get('x-thp-long'), '1');
  await tick(); await tick();
  const again = await longOrNow(new Request('http://x/api/m?start=2026-01-01&end=2026-11-26'), 'u1', '2026-01-01', '2026-11-26', compute);
  assert.equal(again.status, 200, 'thứ tự tham số khác vẫn cùng khoá');
  assert.deepEqual(await again.json(), { ok: 2 });
  const other = await longOrNow(req(), 'u2', '2026-01-01', '2026-11-26', compute);
  assert.equal(other.status, 202, 'người khác: khoá riêng, không dùng kết quả của người kia');
});

void test('phản hồi "đang tính" không được nhớ vào cache báo cáo; gộp báo cáo báo cờ để trình duyệt gọi riêng', async () => {
  const { isLongPending } = await import('../lib/ops/long-response');
  assert.equal(isLongPending(new Response('{}', { status: 202 })), true);
  assert.equal(isLongPending(new Response('{}', { status: 200, headers: { 'x-thp-long': '1' } })), true);
  assert.equal(isLongPending(new Response('{}', { status: 200 })), false);
  const { readFileSync } = await import('node:fs');
  const src = readFileSync(new URL('../worker.ts', import.meta.url), 'utf8');
  const cap = src.slice(src.indexOf('async function capture('), src.indexOf('async function capture(') + 400);
  assert.match(cap, /if \(isLongPending\(response\)\) return null;/, 'capture bỏ qua 202 trước mọi tầng nhớ (reportCache, bản gần nhất, shared, stale)');
  assert.match(src, /isLongPending\(res\) \? \{ long: true \}/, 'gộp báo cáo báo cờ long');
  // Hai lần hỏi liên tiếp qua lớp trả lời: lần đầu 202, xong thì 200 (cache không giữ 202 nên lần hai tới được longJob).
  const { resetLongJobs } = await import('../lib/ops/long-job');
  const { longOrNow } = await import('../lib/ops/long-response');
  resetLongJobs();
  const req = () => new Request('http://x/api/reports/marketing?start=2026-01-01&end=2026-11-26');
  const a = await longOrNow(req(), 'u', '2026-01-01', '2026-11-26', async () => ({ status: 200, body: { ok: 1 } }));
  assert.equal(a.status, 202);
  assert.equal(isLongPending(a), true);
  await tick(); await tick();
  const b = await longOrNow(req(), 'u', '2026-01-01', '2026-11-26', async () => ({ status: 200, body: { ok: 2 } }));
  assert.equal(b.status, 200);
  assert.equal(isLongPending(b), false, 'kết quả xong được nhớ bình thường');
});

void test('ghi nhật ký mỗi lượt kỳ dài: đường dẫn API và số giây, không tham số; 202 kèm số lượt xếp trước', async () => {
  const { longJob, resetLongJobs } = await import('../lib/ops/long-job');
  const { longOrNow } = await import('../lib/ops/long-response');
  resetLongJobs();
  const logs: string[] = [];
  const orig = console.log;
  console.log = (...a: unknown[]) => { logs.push(a.join(' ')); };
  try {
    let release!: () => void;
    const gate = new Promise<void>((r) => { release = r; });
    longJob('x', async () => { await gate; return 1; }, Date.now, '/api/reports/marketing');
    const q = await longOrNow(new Request('http://x/api/marketing/cross?start=2026-01-01&end=2026-11-26&marketerId=NV999'), 'u', '2026-01-01', '2026-11-26', async () => ({ status: 200, body: {} }));
    assert.equal(q.status, 202);
    const body = await q.json() as { longJob: { state: string; ahead: number } };
    assert.equal(body.longJob.state, 'queued');
    assert.equal(body.longJob.ahead, 1, 'một lượt đang chạy phía trước');
    release();
    for (let i = 0; i < 6; i++) await tick();
    const text = logs.join('\n');
    assert.match(text, /long job start \/api\/reports\/marketing/);
    assert.match(text, /long job done \/api\/reports\/marketing \d+s/);
    assert.match(text, /long job start \/api\/marketing\/cross/);
    assert.doesNotMatch(text, /NV999|marketerId|start=/, 'không ghi tham số');
  } finally { console.log = orig; }
});

void test('hàng chờ ưu tiên: báo cáo Marketing chính chạy trước khối phụ dù đến sau', async () => {
  const { longJob, longPriority, resetLongJobs } = await import('../lib/ops/long-job');
  assert.equal(longPriority('/api/reports/marketing'), 0);
  assert.equal(longPriority('/api/marketing/analytics'), 1);
  assert.equal(longPriority('/api/marketing/trend'), 1);
  assert.equal(longPriority('/api/marketing/cross'), 2);
  assert.equal(longPriority('/api/reports/trend-cards'), 2);
  resetLongJobs();
  const order: string[] = [];
  let r0!: () => void;
  const g0 = new Promise<void>((r) => { r0 = r; });
  const job = (name: string) => async () => { order.push(name); if (name === 'dau') await g0; return name; };
  longJob('dau', job('dau'), Date.now, '/api/marketing/cross', 2);
  longJob('cross', job('cross'), Date.now, '/api/marketing/cross', 2);
  longJob('cards', job('cards'), Date.now, '/api/reports/trend-cards', 2);
  longJob('trend', job('trend'), Date.now, '/api/marketing/trend', 1);
  const main = longJob('main', job('main'), Date.now, '/api/reports/marketing', 0);
  assert.equal(main.state === 'queued' && main.ahead, 1, 'chỉ còn lượt đang chạy phía trước');
  r0();
  for (let i = 0; i < 20; i++) await tick();
  assert.deepEqual(order, ['dau', 'main', 'trend', 'cross', 'cards']);
});

void test('nhịp gom: analytics tới trước 200 ms, báo cáo Marketing chính tới sau vẫn chạy trước; một lượt thì chạy sau nhịp gom', async () => {
  const { longJob, resetLongJobs } = await import('../lib/ops/long-job');
  const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
  resetLongJobs(600);
  const order: string[] = [];
  const job = (name: string) => async () => { order.push(name); return name; };
  const a = longJob('analytics', job('analytics'), Date.now, '/api/marketing/analytics', 1);
  assert.equal(a.state, 'queued', 'đang rảnh: chưa chạy ngay, chờ nhịp gom');
  await wait(200);
  longJob('main', job('main'), Date.now, '/api/reports/marketing', 0);
  await wait(800);
  for (let i = 0; i < 10; i++) await tick();
  assert.deepEqual(order, ['main', 'analytics'], 'báo cáo chính chạy trước dù tới sau');
  resetLongJobs(300);
  const one: string[] = [];
  const s = longJob('solo', async () => { one.push('solo'); return 1; }, Date.now, '/api/marketing/cross', 2);
  assert.equal(s.state, 'queued');
  await wait(100);
  assert.deepEqual(one, [], 'chưa hết nhịp gom');
  await wait(400);
  for (let i = 0; i < 5; i++) await tick();
  assert.deepEqual(one, ['solo'], 'hết nhịp gom thì chạy');
  resetLongJobs();
});
