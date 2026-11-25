// Bảng xếp hạng marketer gộp (anh Vũ 25/11/2026: gộp bảng Marketer của khối số chính vào bảng xếp hạng; "số thì ưu tiên hiển thị số đã chốt,
// khi rê chuột vào sẽ có tổng số là bao nhiêu, chưa chốt bao nhiêu"). Một bảng, nút chọn nhóm cột Chốt | Chi phí | Giao hàng.
// File này chỉ dựng nội dung khung rê chuột từ số trang đã có (lib/reports/marketing-overview.ts, lib/reports/mkt-analytics.ts);
// không tính lại số nào theo cách khác. Các cột cũ bỏ khỏi bảng (Đơn tạo, Sau HH, Tiền HH, DT/SĐT, AOV, Cho ĐVVC, % giao TC, Hoàn/hủy) nằm ở khung.
import type { DetailPart, NumDetailSpec } from './num-detail';

export type ColGroup = 'chot' | 'chiphi' | 'giao';
export const COL_GROUPS: { value: ColGroup; label: string }[] = [
  { value: 'chot', label: 'Chốt' }, { value: 'chiphi', label: 'Chi phí' }, { value: 'giao', label: 'Giao hàng' },
];

/** Số một dòng bảng xếp hạng (marketer, team, tổng) dùng cho khung. Tên trường như lib/reports/marketing-overview.ts. */
export type RankNums = {
  createdOrders: number; createdNewPhones: number; createdNewClosedPhones?: number;
  newConfirmed: number; newNet: number; newAfterRefund: number; newOrders: number;
  newPacked: number; newCancelled: number; newReturned: number; shipNet: number; shipAfterRefund: number;
  shippedOrders: number; deliveredOrders: number; deliveryRate: number | null;
  revenuePerPhone: number | null; averageOrder: number | null;
};
type Ctx = { name: string; scope: string };

const rate = (a: number, b: number) => b > 0 ? a / b * 100 : null;

/** Số đã chốt (số chính của nhóm Chốt) = SĐT chia Sale có ít nhất một đơn đã chốt. Khung: tổng số về = đã chốt + chưa chốt, kèm Đơn tạo. */
export function closedPhonesDetail(x: RankNums, ctx: Ctx): NumDetailSpec {
  const closed = x.createdNewClosedPhones ?? 0, total = x.createdNewPhones;
  return {
    title: 'Số đã chốt', scope: `${ctx.name} · ${ctx.scope}`, op: 'sum',
    parts: [
      { label: 'Số đã chốt (có đơn đã chốt)', value: closed, kind: 'count' },
      { label: 'Số chưa chốt (vẫn là số new)', value: Math.max(0, total - closed), kind: 'count', tone: 'warn' },
      { label: 'Tổng số về (SĐT chia Sale)', value: total, kind: 'count', strong: true },
    ],
    extra: [{ label: 'Đơn tạo trong kỳ', value: x.createdOrders, kind: 'count' }],
    how: 'Số = SĐT khác nhau trên đơn tạo trong kỳ đang chia cho Sale. Đã chốt = có ít nhất 1 đơn đã chốt, kể cả hủy / hoàn sau đó.',
  };
}

/** DT chốt: tiền đơn New đã chốt. Khung: sau hoàn hủy + tiền hoàn hủy = DT chốt; kèm DT/SĐT, AOV (cột cũ). */
export function newNetDetail(x: RankNums, ctx: Ctx): NumDetailSpec {
  return {
    title: 'Doanh thu chốt (New)', scope: `${ctx.name} · ${ctx.scope}`, op: 'sum',
    parts: [
      { label: 'Sau hoàn hủy', value: x.newAfterRefund, kind: 'money' },
      { label: 'Tiền hoàn / hủy', value: x.newNet - x.newAfterRefund, kind: 'money', tone: x.newNet > x.newAfterRefund ? 'bad' : undefined },
      { label: 'DT chốt', value: x.newNet, kind: 'money', strong: true },
    ],
    extra: [
      { label: 'Số đơn New', value: x.newOrders, kind: 'count' },
      { label: 'DT / SĐT (mọi đơn theo mốc)', value: x.revenuePerPhone, kind: 'money' },
      { label: 'AOV (mọi đơn theo mốc)', value: x.averageOrder, kind: 'money' },
    ],
    how: 'Mọi đơn New đã chốt trong kỳ, kể cả hủy / hoàn sau đó (đã chốt là chốt). Hoàn hủy trừ ở dòng sau hoàn hủy.',
  };
}

/** Đơn đi: đơn New đã đóng hàng trở đi; kèm Đã cho ĐVVC (cột cũ, mọi đơn theo mốc). */
export function packedDetail(x: RankNums, ctx: Ctx): NumDetailSpec {
  return {
    title: 'Đơn đi (New)', scope: `${ctx.name} · ${ctx.scope}`, op: 'div',
    parts: [
      { label: 'Đơn đi', value: x.newPacked, kind: 'count' },
      { label: 'Đơn New', value: x.newConfirmed, kind: 'count' },
      { label: 'Tỉ lệ đi', value: rate(x.newPacked, x.newConfirmed), kind: 'pct', strong: true },
    ],
    extra: [{ label: 'Đã cho ĐVVC (mọi đơn theo mốc)', value: x.shippedOrders, kind: 'count' }],
    how: 'Đơn New đã vào Đang đóng hàng trở đi (đóng hàng, chờ lấy, đã gửi, đã nhận, hoàn, hủy sau đóng hàng).',
  };
}

/** Tỉ lệ hủy / hoàn: số đơn ÷ Đơn New; kèm cả số đơn hủy và đơn hoàn. */
export function cancelReturnDetail(kind: 'cancel' | 'return', x: RankNums, ctx: Ctx): NumDetailSpec {
  const cancel = kind === 'cancel', n = cancel ? x.newCancelled : x.newReturned, r = rate(n, x.newConfirmed);
  const bad = r !== null && r >= (cancel ? 5 : 7);
  return {
    title: cancel ? 'Tỉ lệ hủy' : 'Tỉ lệ hoàn', scope: `${ctx.name} · ${ctx.scope}`, op: 'div',
    parts: [
      { label: cancel ? 'Đơn hủy chưa giao ĐVVC' : 'Đơn hoàn (kể cả hủy sau khi đã gửi)', value: n, kind: 'count' },
      { label: 'Đơn New', value: x.newConfirmed, kind: 'count' },
      { label: cancel ? 'Tỉ lệ hủy' : 'Tỉ lệ hoàn', value: r, kind: 'pct', strong: true, tone: bad ? 'bad' : undefined },
    ],
    extra: [
      { label: 'Đơn hủy', value: x.newCancelled, kind: 'count' },
      { label: 'Đơn hoàn', value: x.newReturned, kind: 'count' },
    ],
    how: cancel ? 'Chia trên mọi đơn New đã chốt (kể cả đơn hủy). Từ 5% tô đỏ.' : 'Chia trên mọi đơn New đã chốt (kể cả đơn hủy). Từ 7% tô đỏ.',
  };
}

/** Đã nhận: kèm % giao thành công (cột cũ) = đã nhận ÷ đã cho ĐVVC. */
export function deliveredDetail(x: RankNums, ctx: Ctx): NumDetailSpec {
  return {
    title: 'Đã nhận / thu tiền', scope: `${ctx.name} · ${ctx.scope}`, op: 'div',
    parts: [
      { label: 'Đã nhận', value: x.deliveredOrders, kind: 'count' },
      { label: 'Đã cho ĐVVC', value: x.shippedOrders, kind: 'count' },
      { label: '% giao thành công', value: x.deliveryRate, kind: 'pct', strong: true },
    ],
    how: 'Mọi đơn theo mốc đang chọn (gồm cả đơn CSKH), như cột Đã nhận cũ.',
  };
}

/** Ghép số chi phí (lib/reports/mkt-analytics.ts) vào dòng bảng theo id marketer / team. Không có dòng chi phí thì null (hiện "—"). */
export function costIndex<T extends { id: string }>(rows: T[] | undefined): Map<string, T> {
  return new Map((rows ?? []).map((r) => [r.id, r]));
}

/** Các dòng không thuộc phép tính (để test kiểm cột cũ còn trong khung). */
export const extraLabels = (s: NumDetailSpec): string[] => (s.extra ?? []).map((p: DetailPart) => p.label);
