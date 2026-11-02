// Làm nóng cache báo cáo nặng (worker.ts, cachedReport): sau mỗi lượt đồng bộ, khóa cache đổi theo phiên bản dữ liệu nên người mở
// đầu tiên của từng báo cáo phải chờ D1 tính lại (thử tải trên PC 01/11/2026: Xu hướng 20 s, Cuộc gọi 13 s, Chăm sóc 12 s lần đầu).
// Cron mỗi phút gọi tính trước các URL vừa có người xem, cùng hàm đọc bộ lọc với route nên thân JSON giống từng byte.
import { withSegLens } from '@/lib/shared/seg-lens';
import { parseTrendsParams, trendsBody } from '@/lib/reports/trends-report';
import { callsReport, parseCallsParams } from '@/lib/reports/calls-report';
import { careReport, parseCareParams } from '@/lib/reports/care-report';

/** Chỉ ba báo cáo nặng nhất; các báo cáo khác tính dưới 1–2 giây, chưa đáng tốn D1 để làm nóng. */
export const WARM_PATHS = new Set(['/api/reports/trends', '/api/reports/calls', '/api/reports/care']);
/** Chỉ làm nóng URL có người xem trong khoảng này. */
export const WARM_RECENT_MS = 30 * 60000;
/** Mỗi lượt tối đa chừng này URL, trong ngân sách thời gian. */
export const WARM_MAX = 12;
export const WARM_BUDGET_MS = 20000;

export type RecentReport = { url: string; role: string; at: number };

/** URL cần làm nóng: vừa có người xem, không phải Mentor (Mentor thấy bản riêng), mới xem trước, tối đa WARM_MAX. */
export function pickWarm(entries: RecentReport[], now: number, max = WARM_MAX, recent = WARM_RECENT_MS): RecentReport[] {
  return entries.filter((e) => e.role !== 'mentor' && now - e.at < recent).sort((a, b) => b.at - a.at).slice(0, max);
}

/** Thân JSON đúng như route trả cho URL này (null nếu bộ lọc sai hoặc không phải báo cáo làm nóng được). */
export async function warmBody(url: URL): Promise<string | null> {
  if (!WARM_PATHS.has(url.pathname)) return null;
  const p = url.searchParams;
  return withSegLens(url, async () => {
    if (url.pathname === '/api/reports/trends') {
      const opts = parseTrendsParams(p);
      return 'error' in opts ? null : JSON.stringify(await trendsBody(opts));
    }
    if (url.pathname === '/api/reports/calls') {
      const opts = await parseCallsParams(p);
      return opts instanceof Response ? null : JSON.stringify(await callsReport(opts));
    }
    const opts = parseCareParams(p);
    // Tìm kiếm theo tên/SĐT là mỗi người một kiểu, không làm nóng.
    return 'error' in opts || opts.q ? null : JSON.stringify(await careReport(opts));
  });
}
