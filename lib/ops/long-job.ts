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

type Entry = { label: string; prio: number; state: 'queued' | 'running' | 'done' | 'error'; queuedAt: number; startedAt: number | null; finishedAt: number | null; value?: unknown; error?: string; run: () => Promise<unknown> };
export type LongStatus =
  | { state: 'done'; value: unknown }
  | { state: 'error'; error: string }
  | { state: 'queued' | 'running'; waitedMs: number; ahead: number };

const jobs = new Map<string, Entry>();
const waiting: string[] = [];
let active: string | null = null;
// Nhịp gom (Đầu não 26/11/2026, anh Vũ "khối này tính sau được nhé"): khi đang rảnh mà có lượt kỳ dài tới, chờ một nhịp ngắn để các API
// cùng trang tới gần nhau được xếp theo ưu tiên (báo cáo Marketing chính trước, số chính / xu hướng sau) thay vì ai tới trước chạy trước.
let gatherMs = 1500;
let gatherTimer: ReturnType<typeof setTimeout> | null = null;

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
  // Nhật ký lượt kỳ dài (26/11/2026, để đo): chỉ đường dẫn API và số giây, không ghi tham số (tên, mã nhân viên) hay số liệu.
  console.log(`long job start ${e.label} (chờ ${Math.round((e.startedAt - e.queuedAt) / 1000)}s, còn ${waiting.length} lượt xếp sau)`);
  Promise.resolve().then(e.run).then(
    (v) => { e.state = 'done'; e.value = v; },
    (err: unknown) => { e.state = 'error'; e.error = err instanceof Error ? err.message : String(err); },
  ).finally(() => {
    e.finishedAt = clock();
    const secs = Math.round((e.finishedAt - (e.startedAt ?? e.finishedAt)) / 1000);
    if (e.state === 'error') console.error(`long job error ${e.label} sau ${secs}s`);
    else console.log(`long job done ${e.label} ${secs}s`);
    active = null; pump(clock);
  });
}

/** Xin kết quả của một khoá: chưa có thì xếp hàng tính (một lượt cho mỗi khoá); đang tính thì báo trạng thái; xong thì trả kết quả đã nhớ. */
/** Thứ tự ưu tiên trong hàng chờ (số nhỏ chạy trước; cùng mức thì ai đến trước chạy trước): báo cáo Marketing chính trước,
 * số chính / xu hướng sau, các khối phụ (cross, trend-cards, hồ sơ…) cuối (Đầu não 26/11/2026). */
export function longPriority(pathname: string) {
  if (pathname === '/api/reports/marketing') return 0;
  if (pathname === '/api/marketing/analytics' || pathname === '/api/marketing/trend') return 1;
  return 2;
}

/** label: đường dẫn API (không tham số) để ghi nhật ký. prio: longPriority. */
export function longJob(key: string, run: () => Promise<unknown>, clock: () => number = Date.now, label = 'kỳ dài', prio = 2): LongStatus {
  const now = clock();
  prune(now);
  let e = jobs.get(key);
  if (!e) {
    e = { label, prio, state: 'queued', queuedAt: now, startedAt: null, finishedAt: null, run };
    jobs.set(key, e);
    // Chen vào hàng chờ theo mức ưu tiên: đứng sau mọi lượt cùng mức hoặc ưu tiên hơn đang chờ.
    const at = waiting.findIndex((k) => (jobs.get(k)?.prio ?? 2) > prio);
    if (at < 0) waiting.push(key); else waiting.splice(at, 0, key);
    // Đang rảnh: chờ nhịp gom rồi mới chọn lượt; đang có lượt chạy thì cứ xếp hàng, lượt sau tự chạy khi lượt trước xong.
    if (gatherMs > 0 && !active) { if (!gatherTimer) gatherTimer = setTimeout(() => { gatherTimer = null; pump(clock); }, gatherMs); }
    else pump(clock);
  }
  if (e.state === 'done') return { state: 'done', value: e.value };
  if (e.state === 'error') return { state: 'error', error: e.error ?? 'Lỗi khi tính.' };
  return { state: e.state, waitedMs: now - e.queuedAt, ahead: e.state === 'queued' ? waiting.indexOf(key) + (active ? 1 : 0) : 0 };
}

/** Chỉ dùng trong test: xoá mọi lượt đã nhớ; gather = nhịp gom (mặc định 0 để test cũ chạy ngay như trước). */
export function resetLongJobs(gather = 0) { jobs.clear(); waiting.length = 0; active = null; if (gatherTimer) clearTimeout(gatherTimer); gatherTimer = null; gatherMs = gather; }
