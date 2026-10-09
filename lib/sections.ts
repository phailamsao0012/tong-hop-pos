// Tổng quan 4 mục (anh Vũ 08/10/2026): Sale, CSKH, MKT, Vận đơn trên đầu trang Tổng quan POS.
// Truy vấn trả hai bảng gộp theo (nhóm người bán, đơn có Marketer hay không); hàm dưới đây ráp thành 4 mục.
export type SellerTeam = 'sale' | 'cskh' | 'other';
/** Đơn chốt trong kỳ (theo ngày chốt) và trạng thái vận chuyển hiện tại. */
export type ClosedAgg = { team: SellerTeam; mkt: number; closed: number; net: number; sent: number; sent_net: number; returned: number; returned_net: number };
/** Đơn tạo trong kỳ (cohort): bao nhiêu đơn nay đã chốt (từ Chờ XN), đã xác nhận (MKT); mẫu số của tỷ lệ chốt. */
export type CohortAgg = { team: SellerTeam; mkt: number; created: number; closed_now: number; confirmed_now: number };
/** Đơn MKT đã xác nhận trong kỳ (theo ngày xác nhận lần đầu): MKT tính chốt = đã xác nhận trên Pancake. */
export type MktAgg = { orders: number; net: number };

type Ship = { orders: number; net: number; returned: number; returnedNet: number; rateOrders: number | null; rateNet: number | null };
const ratio = (a: number, b: number) => (b ? a / b * 100 : null);

export function buildSections(closed: ClosedAgg[], cohort: CohortAgg[], mktConfirmed: MktAgg) {
  const sum = <T,>(rows: T[], pick: (r: T) => number) => rows.reduce((a, r) => a + Number(pick(r) ?? 0), 0);
  const of = (team?: SellerTeam, mkt?: boolean) => closed.filter((r) => (!team || r.team === team) && (mkt === undefined || !!Number(r.mkt) === mkt));
  const coh = (team?: SellerTeam, mkt?: boolean) => cohort.filter((r) => (!team || r.team === team) && (mkt === undefined || !!Number(r.mkt) === mkt));
  const money = (rows: ClosedAgg[]) => ({ orders: sum(rows, (r) => r.closed), net: sum(rows, (r) => r.net) });
  const rate = (rows: CohortAgg[]) => ({ created: sum(rows, (r) => r.created), closedNow: sum(rows, (r) => r.closed_now), rate: ratio(sum(rows, (r) => r.closed_now), sum(rows, (r) => r.created)) });
  const ship = (rows: ClosedAgg[]): Ship => {
    const orders = sum(rows, (r) => r.sent), net = sum(rows, (r) => r.sent_net), returned = sum(rows, (r) => r.returned), returnedNet = sum(rows, (r) => r.returned_net);
    return { orders, net, returned, returnedNet, rateOrders: ratio(returned, orders), rateNet: ratio(returnedNet, net) };
  };
  const aov = (m: { orders: number; net: number }) => (m.orders ? m.net / m.orders : null);
  const sale = money(of('sale')), cskh = money(of('cskh')), mkt = { orders: Number(mktConfirmed.orders ?? 0), net: Number(mktConfirmed.net ?? 0) };
  const mktCohort = coh(undefined, true), mktCreated = sum(mktCohort, (r) => r.created), mktConfirmedNow = sum(mktCohort, (r) => r.confirmed_now);
  return {
    sale: { ...sale, ...rate(coh('sale')) },
    cskh: { ...cskh, aov: aov(cskh), self: money(of('cskh', false)), fromMkt: money(of('cskh', true)) },
    // Chi phí MKT: Pancake không có; route điền từ ad_costs (nhập tay / Excel / Google Sheet).
    mkt: { ...mkt, aov: aov(mkt), cost: null as number | null, created: mktCreated, closedNow: mktConfirmedNow, rate: ratio(mktConfirmedNow, mktCreated) },
    // other = người bán ngoài Sale / CSKH (kể cả người không có hậu tố): có trong Tổng nên bảng hiện thêm dòng Khác cho khớp (QA 09/10).
    shipping: { total: ship(of()), sale: ship(of('sale')), cskh: ship(of('cskh')), other: ship(of('other')) },
  };
}
export type Sections = ReturnType<typeof buildSections>;
