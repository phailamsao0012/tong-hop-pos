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
