import { SENT_CODES, RETURNED_CODES, DELIVERED_CODES } from './shipping-lines';
import { NO_CARRIER, NO_PROVINCE, NO_RETURN_REASON } from './ship-fields';

export type RbOrder = { status: number; net: number; carrier: string | null; province: string | null; reason: string | null; line: string; lines?: string[] };
export type RbCell = { sent: number; sentNet: number; returned: number; returnedNet: number; delivered: number; rate: number | null; rateNet: number | null };
export type RbReport = {
  matrixProvinces: string[];
  total: RbCell;
  carriers: (RbCell & { key: string })[];
  provinces: (RbCell & { key: string })[];
  matrix: { carrier: string; province: string; cell: RbCell }[];
  reasons: { key: string; returned: number; share: number | null }[];
  reasonByLine: { reason: string; line: string; returned: number }[];
};
export const MIN_SENT = 20;
const empty = (): RbCell => ({ sent: 0, sentNet: 0, returned: 0, returnedNet: 0, delivered: 0, rate: null, rateNet: null });
function add(cell: RbCell, o: RbOrder) {
  cell.sent++; cell.sentNet += o.net;
  if (RETURNED_CODES.includes(o.status)) { cell.returned++; cell.returnedNet += o.net; }
  if (DELIVERED_CODES.includes(o.status)) cell.delivered++;
}
function finish(cell: RbCell): RbCell {
  return { ...cell, rate: cell.sent ? cell.returned / cell.sent * 100 : null, rateNet: cell.sentNet ? cell.returnedNet / cell.sentNet * 100 : null };
}
export function buildReturnBreakdown(orders: RbOrder[]): RbReport {
  const total = empty(), carriers = new Map<string, RbCell>(), provinces = new Map<string, RbCell>();
  const matrix = new Map<string, { carrier: string; province: string; cell: RbCell }>();
  const reasons = new Map<string, number>(), reasonByLine = new Map<string, { reason: string; line: string; returned: number }>();
  const put = (map: Map<string, RbCell>, key: string, o: RbOrder) => { const c = map.get(key) ?? empty(); add(c, o); map.set(key, c); };
  for (const o of orders) {
    if (!SENT_CODES.includes(o.status)) continue;
    const carrier = o.carrier?.trim() || NO_CARRIER, province = o.province?.trim() || NO_PROVINCE;
    add(total, o); put(carriers, carrier, o); put(provinces, province, o);
    const key = JSON.stringify([carrier, province]);
    const entry = matrix.get(key) ?? { carrier, province, cell: empty() };
    add(entry.cell, o); matrix.set(key, entry);
    if (!RETURNED_CODES.includes(o.status)) continue;
    const reason = o.reason?.trim() || NO_RETURN_REASON;
    reasons.set(reason, (reasons.get(reason) ?? 0) + 1);
    for (const line of new Set(o.lines?.length ? o.lines : [o.line])) {
      const k = JSON.stringify([reason, line]), r = reasonByLine.get(k) ?? { reason, line, returned: 0 };
      r.returned++; reasonByLine.set(k, r);
    }
  }
  const small = empty(), provinceRows: RbReport['provinces'] = [];
  for (const [key, cell] of provinces) {
    if (cell.sent >= MIN_SENT) provinceRows.push({ key, ...finish(cell) });
    else { small.sent += cell.sent; small.sentNet += cell.sentNet; small.returned += cell.returned; small.returnedNet += cell.returnedNet; small.delivered += cell.delivered; }
  }
  if (small.sent) provinceRows.push({ key: 'Tỉnh khác (ít đơn)', ...finish(small) });
  return {
    matrixProvinces: [...provinces].sort((a, b) => b[1].sent - a[1].sent || a[0].localeCompare(b[0], 'vi')).slice(0, 15).map(([key]) => key),
    total: finish(total),
    carriers: [...carriers].map(([key, c]) => ({ key, ...finish(c) })).sort((a, b) => b.sent - a.sent || a.key.localeCompare(b.key, 'vi')),
    provinces: provinceRows.sort((a, b) => (b.rate ?? -1) - (a.rate ?? -1)),
    matrix: [...matrix.values()].filter((r) => r.cell.sent >= MIN_SENT).map((r) => ({ ...r, cell: finish(r.cell) })),
    reasons: [...reasons].map(([key, returned]) => ({ key, returned, share: total.returned ? returned / total.returned * 100 : null })).sort((a, b) => b.returned - a.returned),
    reasonByLine: [...reasonByLine.values()].sort((a, b) => b.returned - a.returned),
  };
}
