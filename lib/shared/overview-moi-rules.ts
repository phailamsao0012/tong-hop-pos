// Tổng quan kiểu mới (bản demo giao diện, plan docs/plans/2026-11-26-tong-quan-kieu-moi): luật "việc cần xem" và câu tóm tắt.
// Chỉ đọc số đã tính sẵn ở lib/reports (Phân tích Sale, Marketing); không tính lại số nào, không gọi AI.
// Mốc dùng lại mốc đang có trên web: hủy từ 5%, hoàn từ 7%, TL chốt dưới 40% (lib/shared/close-rate.ts), ROAS dưới 1.
// Mốc "CSKH gọi dưới mức" chưa có: để trống tới khi anh Vũ cho số.

export const NEED_LIMITS = { cancel: 5, ret: 7, close: 40, roas: 1 } as const;

export type NeedInput = {
  /** Phân tích Sale cả kỳ: % hủy sau chốt, % hoàn, % chốt data (null = chưa có số). */
  sale: { cancelRate: number | null; returnRate: number | null; closeRate: number | null; closed: number; assigned: number };
  /** Người bán Sale có tỉ lệ hủy sau chốt từ mốc (đã lọc người có ít nhất vài đơn). */
  cancelStaff: { name: string; rate: number }[];
  /** Marketer có chi phí mà ROAS dưới mốc (null = người xem không có quyền xem chi phí). */
  lowRoas: { name: string; cost: number; net: number; roas: number }[] | null;
};

export type NeedItem = {
  key: 'cancel' | 'return' | 'close' | 'roas';
  tone: 'bad' | 'warn';
  title: string;
  detail: string;
  /** Trang mở khi bấm (id trang trên web). */
  view: string;
};

const p1 = (n: number) => `${n.toFixed(1).replace('.', ',')}%`;
const tr = (n: number) => `${(n / 1e6).toFixed(n >= 1e8 ? 0 : 1).replace('.', ',')}tr`;

/** Việc cần xem, xếp theo mức ảnh hưởng: hủy, hoàn, TL chốt, ROAS. */
export function needItems(x: NeedInput): NeedItem[] {
  const out: NeedItem[] = [];
  const s = x.sale;
  if (s.cancelRate !== null && s.cancelRate >= NEED_LIMITS.cancel) {
    const who = x.cancelStaff.length ? ` · ${x.cancelStaff.length} người bán từ mốc` : '';
    out.push({ key: 'cancel', tone: 'bad', title: `Hủy sau chốt ${p1(s.cancelRate)}`, detail: `Sale, mốc đỏ ${NEED_LIMITS.cancel}%${who}`, view: 'sale-analytics' });
  }
  if (s.returnRate !== null && s.returnRate >= NEED_LIMITS.ret)
    out.push({ key: 'return', tone: 'bad', title: `Hoàn ${p1(s.returnRate)}`, detail: `Sale, mốc đỏ ${NEED_LIMITS.ret}%`, view: 'sale-analytics' });
  if (s.closeRate !== null && s.assigned > 0 && s.closeRate < NEED_LIMITS.close)
    out.push({ key: 'close', tone: 'warn', title: `TL chốt data ${p1(s.closeRate)}`, detail: `Sale, dưới mốc ${NEED_LIMITS.close}%`, view: 'sale-analytics' });
  if (x.lowRoas?.length) {
    const cost = x.lowRoas.reduce((t, r) => t + r.cost, 0), net = x.lowRoas.reduce((t, r) => t + r.net, 0);
    out.push({ key: 'roas', tone: 'warn', title: `${x.lowRoas.length} marketer ROAS dưới ${NEED_LIMITS.roas}`, detail: `chi ${tr(cost)}, DT chốt ${tr(net)}`, view: 'mkt-roas' });
  }
  return out;
}

/** Câu tóm tắt đầu trang (sinh bằng luật). prevNet = doanh thu chốt kỳ trước cùng mốc (null = không so). */
export function briefSentence(x: { net: number; prevNet: number | null; needs: number; closed: number }): string {
  const parts: string[] = [];
  if (x.prevNet !== null && x.prevNet > 0) {
    const d = (x.net - x.prevNet) / x.prevNet * 100;
    parts.push(Math.abs(d) < 0.05 ? 'Doanh thu chốt ngang kỳ trước.' : `Doanh thu chốt ${d > 0 ? 'tăng' : 'giảm'} ${p1(Math.abs(d)).replace('%', '')}% so với kỳ trước.`);
  } else if (x.closed === 0) parts.push('Chưa có đơn chốt trong kỳ.');
  parts.push(x.needs ? `Có ${x.needs} việc cần anh xem.` : 'Chưa có việc nào vượt mốc.');
  return parts.join(' ');
}
