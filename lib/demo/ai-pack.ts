import type { AiPack } from '@/lib/ai/ai-pack';
import type { Insight } from '@/lib/ai/ai-insight';
export function demoAiPack(date: string): AiPack {
  return { version: 1, date, start: date, end: date, scope: 'Số ảo toàn công ty', rows: [{ day: date, dept: 'sale', team: 'Team Sale 1', staff: 'NV A', metrics: { assigned: 40, closed: 10 } }], unavailable: ['Mẫu kiểm thử, không dùng khuyến nghị tuyển'] };
}
export function demoInsight(date: string): Insight {
  return { date, model: 'demo', summary: 'Phân tích minh họa bằng số ảo.', items: [{ dept: 'sale', kind: 'improve', title: 'Theo dõi tải chia số', detail: 'Mẫu dữ liệu có 40 số được chia.', evidence: [{ metric: 'rows.0.metrics.assigned', value: 40, compare: null }], action: 'Kiểm tra thêm lịch sử trước khi đổi phân bổ.', confidence: 'thấp' }], hiring: { sale: { have: 0, need: 0, why: 'Chưa đủ số; không khuyến nghị tuyển.' }, cskh: { have: 0, need: 0, why: 'Chưa đủ số; không khuyến nghị tuyển.' } } };
}

// Tên giả chỉ phục vụ hiển thị trên web, không nằm trong gói gửi PC.
export const demoStaffNames: Record<string, string> = { 'NV A': 'NV A' };
