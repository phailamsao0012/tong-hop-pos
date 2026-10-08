// Vận đơn theo dòng sản phẩm và team MKT (yêu cầu anh Vũ 08/10/2026): mỗi dòng (Gentadox, SK-GK, Oxy, Thủy sản…) đi được bao nhiêu đơn,
// hoàn bao nhiêu đơn, doanh số đi, doanh số hoàn, tỷ lệ hoàn theo đơn và theo doanh số. Xem theo team MKT (người Marketer trên đơn),
// team nhiều dòng có thêm dòng Tổng. File thuần (không phụ thuộc Cloudflare) để test được.
import { groupsOf, type GroupBasis, type GroupDim } from './product-groups';

export type Money = { orders: number; net: number };
export type LineStats = { closed: Money; pending: Money; sent: Money; delivered: Money; returned: Money; cancelled: Money };
export type LineRow = { line: string } & LineStats;
export type TeamBlock = { teamId: string; teamName: string; lines: LineRow[]; total: LineStats };
export type ShippingOrder = { id: string; status: number; net: number; tagsJson: string | null; marketerId: string | null; items: string[] };

/** Đơn đi = đã giao cho đơn vị vận chuyển (đã gửi, đã nhận, đã thu tiền, hoàn). Hoàn = đang hoàn, hoàn một phần, đã hoàn. */
export const SENT_CODES = [2, 3, 16, 4, 15, 5];
export const RETURNED_CODES = [4, 15, 5];
export const DELIVERED_CODES = [3, 16];
export const NO_TEAM = '__none';

const zero = (): LineStats => ({ closed: m(), pending: m(), sent: m(), delivered: m(), returned: m(), cancelled: m() });
function m(): Money { return { orders: 0, net: 0 }; }
function add(s: LineStats, status: number, net: number) {
  const put = (k: keyof LineStats) => { s[k].orders += 1; s[k].net += net; };
  if (status === 6) { put('cancelled'); return; }
  put('closed');
  if (SENT_CODES.includes(status)) put('sent'); else put('pending');
  if (DELIVERED_CODES.includes(status)) put('delivered');
  if (RETURNED_CODES.includes(status)) put('returned');
}

/** Tỷ lệ hoàn theo đơn và theo doanh số (hoàn ÷ đi), null khi chưa có đơn đi. */
export const returnRates = (s: LineStats) => ({
  byOrders: s.sent.orders ? s.returned.orders / s.sent.orders * 100 : null,
  byNet: s.sent.net ? s.returned.net / s.sent.net * 100 : null,
});

/**
 * Gom đơn đã chốt (kể cả hủy sau khi chốt) theo dòng sản phẩm, và theo team MKT × dòng.
 * Một đơn có nhiều dòng thì tính ở mỗi dòng; dòng Tổng đếm mỗi đơn một lần (không cộng các dòng).
 */
export function shippingByLine(orders: ShippingOrder[], opts: { dim: GroupDim; basis: GroupBasis; teamOf: (marketerId: string | null) => string; teamNames: Map<string, string> }) {
  const lines = new Map<string, LineStats>();
  const teams = new Map<string, { lines: Map<string, LineStats>; total: LineStats }>();
  const total = zero();
  for (const o of orders) {
    const ls = groupsOf(o.tagsJson, o.items, opts.dim, opts.basis);
    const teamId = opts.teamOf(o.marketerId);
    if (!teams.has(teamId)) teams.set(teamId, { lines: new Map(), total: zero() });
    const t = teams.get(teamId)!;
    add(total, o.status, o.net); add(t.total, o.status, o.net);
    for (const l of ls) {
      if (!lines.has(l)) lines.set(l, zero());
      add(lines.get(l)!, o.status, o.net);
      if (!t.lines.has(l)) t.lines.set(l, zero());
      add(t.lines.get(l)!, o.status, o.net);
    }
  }
  const sortRows = (map: Map<string, LineStats>): LineRow[] => [...map.entries()].sort((a, b) => b[1].sent.orders - a[1].sent.orders || b[1].closed.orders - a[1].closed.orders).map(([line, s]) => ({ line, ...s }));
  const teamBlocks: TeamBlock[] = [...teams.entries()]
    .map(([teamId, t]) => ({ teamId, teamName: opts.teamNames.get(teamId) ?? (teamId === NO_TEAM ? 'Không có Marketer / chưa vào team' : teamId), lines: sortRows(t.lines), total: t.total }))
    .sort((a, b) => (a.teamId === NO_TEAM ? 1 : 0) - (b.teamId === NO_TEAM ? 1 : 0) || b.total.sent.orders - a.total.sent.orders);
  return { total, lines: sortRows(lines), teams: teamBlocks };
}
