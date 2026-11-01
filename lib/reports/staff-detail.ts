import { isOperationalTag, productTags } from '@/lib/reports/product-groups';
import { STATUS_GROUPS, type GroupKey } from '@/lib/reports/stats';

export const STATUS_LABELS = { new: 'Mới', confirmed: 'Đã chốt (chờ XN, đã XN)', shipping: 'Chuyển hàng (đóng hàng, đã gửi)', delivered: 'Giao thành công', returned: 'Hoàn', cancelled: 'Hủy' } as const;
export const groupOf = (code: number): GroupKey | null => (Object.keys(STATUS_GROUPS) as GroupKey[]).find(k => (STATUS_GROUPS[k] as readonly number[]).includes(code)) ?? null;
export function reasonOf(tagsJson: string | null, note: string | null) {
  let tags: string[] = [];
  try {
    const parsed: unknown = JSON.parse(tagsJson ?? '[]');
    if (Array.isArray(parsed)) tags = [...new Set(parsed.flatMap(t => typeof t?.name === 'string' && t.name.trim() ? [t.name.trim()] : []))];
  } catch { /* Thẻ hỏng được coi như không có thẻ. */ }
  const reason = tags.find(isOperationalTag);
  return { tags, reason: reason ?? (note?.trim() ? 'Có ghi chú đơn, chưa gắn thẻ lý do' : 'Chưa ghi lý do'), kind: reason ? 'tag' as const : note?.trim() ? 'note' as const : 'none' as const };
}
export function aggregateReasons(rows: { tags_json: string | null; note: string | null; status_code: number }[]) {
  const reasons = new Map<string, { reason: string; kind: 'tag' | 'note' | 'none'; n: number; byStatus: { new: number; cancelled: number } }>();
  const tags = new Map<string, number>();
  for (const row of rows) {
    const r = reasonOf(row.tags_json, row.note);
    const key = JSON.stringify([r.kind, r.reason]);
    const entry = reasons.get(key) ?? { reason: r.reason, kind: r.kind, n: 0, byStatus: { new: 0, cancelled: 0 } };
    entry.n++;
    if (row.status_code === 0) entry.byStatus.new++;
    if (row.status_code === 6) entry.byStatus.cancelled++;
    reasons.set(key, entry);
    for (const tag of productTags(row.tags_json)) tags.set(tag, (tags.get(tag) ?? 0) + 1);
  }
  return {
    reasons: [...reasons.values()].sort((a,b) => Number(a.kind === 'none') - Number(b.kind === 'none') || b.n - a.n || a.reason.localeCompare(b.reason, 'vi')),
    otherTags: [...tags].sort((a,b) => b[1]-a[1] || a[0].localeCompare(b[0], 'vi')).slice(0,12).map(([tag,n]) => ({tag,n})),
  };
}
export function noteBatches(rows: { pos_id: string; customer_id: string | null }[]) {
  const pairs = [...new Map(rows.filter(r => r.customer_id).map(r => [JSON.stringify([r.pos_id,r.customer_id]), { pos_id: r.pos_id, customer_id: r.customer_id! }])).values()];
  return Array.from({length: Math.ceil(pairs.length / 45)}, (_,i) => pairs.slice(i*45,(i+1)*45));
}
export const definitions = {
  created: 'Đơn tạo: đơn có người bán là nhân viên này, tạo trong kỳ, trừ đơn đã xóa.',
  assigned: 'Đơn chia: đơn được giao cho nhân viên này trong kỳ (theo giờ chia), trừ đơn đã xóa.',
  closed: 'Đã chốt: đơn đang ở Chờ xác nhận trở đi (kể cả hoàn). Chưa chốt: đơn còn Mới hoặc đã hủy. Ô Đơn chốt ở trên tính theo ngày chốt, nên có cả đơn tạo hoặc chia từ trước kỳ.',
  reasons: 'Lý do lấy từ thẻ đơn trên Pancake (Không nghe máy, Hẹn gọi lại, Chưa tiếp cận, Giá đắt…). Đơn không có thẻ lý do nhưng có ghi chú đơn xếp vào "Có ghi chú đơn, chưa gắn thẻ lý do"; không có cả hai là "Chưa ghi lý do". Ghi chú khách gần nhất hiện kèm từng đơn để xem thêm.',
};