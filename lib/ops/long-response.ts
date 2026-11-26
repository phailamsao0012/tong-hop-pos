// Trả lời API cho báo cáo có thể chạy nền (lib/ops/long-job.ts). Kỳ ngắn: tính và trả ngay như cũ.
// Kỳ dài: một lượt nền cho mỗi khoá; đang tính thì 202 + "x-thp-long: 1" để trình duyệt hỏi lại (app/api-fetch.ts); xong thì trả kết quả đã nhớ.
import { isLongRange, longJob } from '@/lib/ops/long-job';

export type Computed = { status: number; body: unknown };
/** Phản hồi "đang tính" của báo cáo kỳ dài: KHÔNG được nhớ vào cache báo cáo (worker.ts cachedReport) hay dùng làm bản cũ,
 * không thì lần hỏi lại nhận mãi 202 và không tới được longJob (Đầu não thử số ảo 26/11/2026). */
export const isLongPending = (r: { status: number; headers: Headers }) => r.status === 202 || r.headers.get('x-thp-long') === '1';
const HEADERS = { 'Cache-Control': 'private, no-store' };

/** key: người xem + đường dẫn đầy đủ (gồm mọi bộ lọc), để mỗi người chỉ thấy đúng kết quả theo quyền của mình. */
export async function longOrNow(request: Request, userId: string, start: string, end: string, compute: () => Promise<Computed>): Promise<Response> {
  if (!isLongRange(start, end)) {
    const r = await compute();
    return Response.json(r.body, { status: r.status, headers: HEADERS });
  }
  const u = new URL(request.url);
  const s = longJob(`${userId}|${u.pathname}?${[...u.searchParams].sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${k}=${v}`).join('&')}`, compute);
  if (s.state === 'done') {
    const r = s.value as Computed;
    return Response.json(r.body, { status: r.status, headers: HEADERS });
  }
  if (s.state === 'error') return Response.json({ error: `Không tính được kỳ dài: ${s.error}` }, { status: 500, headers: HEADERS });
  return Response.json({ longJob: { state: s.state, waitedMs: s.waitedMs, ahead: s.ahead } }, { status: 202, headers: { ...HEADERS, 'x-thp-long': '1' } });
}
