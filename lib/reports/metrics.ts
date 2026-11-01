// Từ điển chỉ số dùng chung (Giai đoạn 0, 26/09/2026): mỗi chỉ số một tên, một công thức, một lời giải thích,
// dùng chung cho web, app, bot và gói phân tích AI. Chỗ nào có nhiều cách hiểu thì người xem tự chọn "Cách tính"
// (tỷ lệ chốt so với gì, hoàn chia cho gì, mua thành công gồm gì); mặc định theo cách Pancake tính.
// File thuần (không phụ thuộc Cloudflare) để dùng được cả ở giao diện.

export type RateBase = 'created' | 'assigned';
export type ReturnBase = 'shipped' | 'closed' | 'created';
export type SuccessBase = 'delivered' | 'sent';
export type MetricSettings = { rateBase: RateBase; returnBase: ReturnBase; success: SuccessBase };

export const DEFAULT_METRICS: MetricSettings = { rateBase: 'created', returnBase: 'shipped', success: 'delivered' };

export const RATE_BASES: Record<RateBase, { label: string; short: string; hint: string }> = {
  created: { label: 'Đơn lên', short: 'đơn lên đã chốt ÷ đơn lên', hint: 'Trong số đơn tạo trong kỳ (không tính xóa), bao nhiêu đơn đã chốt (xác nhận trở đi) — không vượt 100%' },
  assigned: { label: 'Data được chia', short: 'số chia đã chốt ÷ số chia', hint: 'Trong số đơn được chia cho người bán trong kỳ, bao nhiêu đơn đã chốt — không vượt 100%' },
};
export const RETURN_BASES: Record<ReturnBase, { label: string; short: string; hint: string }> = {
  shipped: { label: 'Đơn đã gửi ĐVVC', short: 'hoàn ÷ đã gửi', hint: 'Đơn hoàn ÷ đơn đã giao cho đơn vị vận chuyển (đã gửi, đã nhận, hoàn)' },
  closed: { label: 'Đơn chốt', short: 'hoàn ÷ đơn chốt', hint: 'Đơn hoàn ÷ đơn đã xác nhận trở đi' },
  created: { label: 'Đơn lên', short: 'hoàn ÷ đơn lên', hint: 'Đơn hoàn ÷ mọi đơn tạo trong kỳ' },
};
export const SUCCESS_BASES: Record<SuccessBase, { label: string; codes: number[]; hint: string }> = {
  delivered: { label: 'Đã nhận + Đã thu tiền', codes: [3, 16], hint: 'Khách đã nhận hàng' },
  sent: { label: 'Thêm cả Đã gửi hàng', codes: [2, 3, 16], hint: 'Tính cả đơn đang trên đường giao' },
};

export function parseMetricSettings(p: URLSearchParams | null | undefined): MetricSettings {
  const rate = p?.get('rateBase'), ret = p?.get('returnBase'), suc = p?.get('success');
  return {
    rateBase: rate === 'assigned' ? 'assigned' : 'created',
    returnBase: ret === 'closed' || ret === 'created' ? ret : 'shipped',
    success: suc === 'sent' ? 'sent' : 'delivered',
  };
}

/** Số liệu tối thiểu để tính các tỷ lệ (khớp kiểu Metrics của báo cáo tổng quan). */
type RateInput = {
  orders: number; closedOrders: number; assignedOrders?: number; assignedHidden?: boolean;
  /** Đơn tạo / đơn chia trong kỳ nay đã chốt (tử số của tỷ lệ chốt, để không vượt 100%). */
  createdClosedOrders?: number; assignedClosedOrders?: number;
  /** Mẫu số khi đang lọc một nhóm đơn (Gentadox, SK + GK): đơn lên / số chia của MỌI sản phẩm cùng phạm vi. Đơn mới lên chưa có
   *  sản phẩm nên không biết thuộc nhóm nào; chia cho "đơn lên của nhóm" (gần như chỉ còn đơn đã chốt) từng ra 100% (08/10/2026). */
  rateOrders?: number; rateAssigned?: number;
  groups?: Partial<Record<'new' | 'confirmed' | 'shipping' | 'delivered' | 'returned' | 'cancelled', { orders: number }>>;
};

/** Tỷ lệ chốt theo cách tính đang chọn (null khi không có mẫu số hoặc số chia bị ẩn với tài khoản này). */
export function closeRateOf(m: RateInput, base: RateBase): number | null {
  if (base === 'assigned' && m.assignedHidden) return null;
  const den = closeRateBase(m, base);
  return den ? closeRateTop(m, base) / den * 100 : null;
}
/** Mẫu số của tỷ lệ chốt (để ghi "a / b"). */
/** Tử số của tỷ lệ chốt: đơn của mẫu số đã chốt (dữ liệu cũ chưa có thì lấy đơn chốt, chặn không quá mẫu số). */
export function closeRateTop(m: RateInput, base: RateBase) {
  const den = closeRateBase(m, base);
  const own = base === 'assigned' ? m.assignedClosedOrders : m.createdClosedOrders;
  return Math.min(den, own ?? m.closedOrders);
}
export function closeRateBase(m: RateInput, base: RateBase) { return base === 'assigned' ? (m.rateAssigned ?? m.assignedOrders ?? 0) : (m.rateOrders ?? m.orders); }

/** Tỷ lệ hoàn theo cách tính đang chọn. Đơn nhóm theo trạng thái hiện tại của đơn tạo trong kỳ. */
export function returnRateOf(m: RateInput, base: ReturnBase): number | null {
  const g = m.groups ?? {};
  const returned = g.returned?.orders ?? 0;
  const den = base === 'shipped' ? (g.shipping?.orders ?? 0) + (g.delivered?.orders ?? 0) + returned
    : base === 'closed' ? m.closedOrders : m.orders;
  return den ? returned / den * 100 : null;
}
/** Tỷ lệ hủy = đơn hủy ÷ đơn lên (không tính đơn xóa). */
export function cancelRateOf(m: RateInput & { deletedOrders?: number }): number | null {
  const cancelled = (m.groups?.cancelled?.orders ?? 0) - (m.deletedOrders ?? 0);
  return m.orders ? Math.max(0, cancelled) / m.orders * 100 : null;
}

/** Định nghĩa hiển thị (tooltip) — một chỗ duy nhất. */
export const METRIC_DEFS = {
  orders: { name: 'Đơn lên', def: 'Đơn tạo trong kỳ, không tính đơn đã xóa. Tính theo ngày tạo đơn (giờ Việt Nam).' },
  closed: { name: 'Đơn chốt', def: 'Đơn từ Chờ xác nhận trở đi (theo bộ lọc Trạng thái chung), tính theo ngày chốt (lần đầu vào Chờ xác nhận hoặc sau đó).' },
  revenue: { name: 'Doanh thu', def: 'Tổng tiền đơn chốt sau mọi giảm trừ (như Doanh thu trên Pancake), chưa gồm phí vận chuyển.' },
  aov: { name: 'GTTB (AOV)', def: 'Doanh thu ÷ Đơn chốt, như GTTB trên Pancake.' },
  aovDelivered: { name: 'GTTB giao thành công', def: 'Doanh thu đơn giao thành công ÷ số đơn giao thành công.' },
  rate: (b: RateBase) => ({ name: 'Tỷ lệ chốt', def: `Tỷ lệ chốt đang tính theo: ${RATE_BASES[b].hint}. Đổi ở nút "Cách tính" trên thanh trên cùng.` }),
  returned: (b: ReturnBase) => ({ name: 'Tỷ lệ hoàn', def: `${RETURN_BASES[b].hint}. Đổi ở nút "Cách tính".` }),
  cancelled: { name: 'Tỷ lệ hủy', def: 'Đơn hủy ÷ Đơn lên (không tính đơn đã xóa), theo trạng thái hiện tại của đơn tạo trong kỳ.' },
  success: (b: SuccessBase) => ({ name: 'Mua thành công', def: `Đơn ${SUCCESS_BASES[b].label.toLowerCase()}. Đổi ở nút "Cách tính".` }),
} as const;

/** Ngưỡng màu tỷ lệ chốt dùng chung web, app, bot: ≥ good xanh, ≥ warn vàng, dưới là đỏ. */
export const RATE_THRESHOLDS = { good: 40, warn: 25 } as const;
export const rateLevel = (rate: number | null | undefined): 'good' | 'warn' | 'bad' =>
  (rate ?? 0) >= RATE_THRESHOLDS.good ? 'good' : (rate ?? 0) >= RATE_THRESHOLDS.warn ? 'warn' : 'bad';
