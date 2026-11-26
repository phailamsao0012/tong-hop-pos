// Báo cáo kỳ dài chạy nền (anh Vũ 26/11/2026 14h02: "ok sửa kỳ dài marketing, build và lên web thật luôn").
// Vấn đề: báo cáo Marketing kỳ dài (vd 01/01–26/11) quét bảng đơn gốc mất 2–4 phút; trình duyệt chờ 45 giây, Cloudflare cắt ở 100 giây,
// người xem bấm Thử lại thì máy chủ tính chồng thêm một lượt và chiếm hết luồng đọc, làm cả web kẹt.
// Cách làm: mỗi khoá (đường dẫn + bộ lọc + người xem) chỉ tính MỘT lượt ở nền; toàn web chỉ một lượt kỳ dài chạy cùng lúc, lượt khác xếp hàng;
// API trả ngay "đang tính" (202), trình duyệt hỏi lại; tính xong nhớ kết quả 30 phút. Không đổi cách tính số nào.

export const LONG_DAYS = 62;
export const LONG_TTL_MS = 30 * 60_000;
const ERROR_TTL_MS = 60_000;

/** Kỳ dài hơn 62 ngày (đếm cả hai đầu) thì chạy nền. */
export const isLongRange = (start: string, end: string) => (Date.parse(end) - Date.parse(start)) / 86_400_000 + 1 > LONG_DAYS;

type Entry = { state: 'queued' | 'running' | 'done' | 'error'; queuedAt: number; startedAt: number | null; finishedAt: number | null; value?: unknown; error?: string; run: () => Promise<unknown> };
export type LongStatus =
  | { state: 'done'; value: unknown }
  | { state: 'error'; error: string }
  | { state: 'queued' | 'running'; waitedMs: number; ahead: number };

const jobs = new Map<string, Entry>();
const waiting: string[] = [];
let active: string | null = null;

function prune(now: number) {
  for (const [k, e] of jobs) {
    if (e.state === 'done' && e.finishedAt !== null && now - e.finishedAt > LONG_TTL_MS) jobs.delete(k);
    else if (e.state === 'error' && e.finishedAt !== null && now - e.finishedAt > ERROR_TTL_MS) jobs.delete(k);
  }
}

function pump(clock: () => number) {
  if (active) return;
  const key = waiting.shift();
  if (!key) return;
  const e = jobs.get(key);
  if (!e) { pump(clock); return; }
  active = key;
  e.state = 'running'; e.startedAt = clock();
  Promise.resolve().then(e.run).then(
    (v) => { e.state = 'done'; e.value = v; },
    (err: unknown) => { e.state = 'error'; e.error = err instanceof Error ? err.message : String(err); },
  ).finally(() => { e.finishedAt = clock(); active = null; pump(clock); });
}

/** Xin kết quả của một khoá: chưa có thì xếp hàng tính (một lượt cho mỗi khoá); đang tính thì báo trạng thái; xong thì trả kết quả đã nhớ. */
export function longJob(key: string, run: () => Promise<unknown>, clock: () => number = Date.now): LongStatus {
  const now = clock();
  prune(now);
  let e = jobs.get(key);
  if (!e) {
    e = { state: 'queued', queuedAt: now, startedAt: null, finishedAt: null, run };
    jobs.set(key, e);
    waiting.push(key);
    pump(clock);
  }
  if (e.state === 'done') return { state: 'done', value: e.value };
  if (e.state === 'error') return { state: 'error', error: e.error ?? 'Lỗi khi tính.' };
  return { state: e.state, waitedMs: now - e.queuedAt, ahead: e.state === 'queued' ? waiting.indexOf(key) + (active ? 1 : 0) : 0 };
}

/** Chỉ dùng trong test: xoá mọi lượt đã nhớ. */
export function resetLongJobs() { jobs.clear(); waiting.length = 0; active = null; }
