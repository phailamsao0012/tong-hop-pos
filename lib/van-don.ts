// Đo team Vận đơn (anh Vũ 08/10/2026): Sale/CSKH chốt đơn vào Chờ xác nhận, người Vận đơn gọi khách xác nhận (Đã xác nhận) rồi gửi đi.
// Hàng hoàn tính cho cả hai phía: người chốt đơn (Sale / CSKH) và người gọi xác nhận (Vận đơn), theo từng người, từng team, từng bộ phận,
// để biết hoàn do chốt kém hay do xác nhận kém. Đơn không xác nhận được (hủy khi đang Chờ xác nhận) đếm theo lý do.
import { DELIVERED_CODES, RETURNED_CODES, SENT_CODES } from '@/lib/shipping-lines';

/** Một nhóm đơn chốt trong kỳ, gom theo người chốt, người xác nhận, người hủy, trạng thái và lý do. */
export type VdRow = {
  seller_id: string | null; confirm_by: string | null; cancel_by: string | null; confirmed: number;
  status_code: number; reason: string | null; n: number; net: number;
};
export type VdStat = {
  closed: number; closedNet: number;
  /** Đã qua bước Đã xác nhận (kể cả đã đi, hoàn, hủy sau đó). */ confirmed: number;
  /** Đang Chờ xác nhận. */ waiting: number;
  /** Hủy khi đang Chờ xác nhận (không xác nhận được). */ failed: number;
  /** Hủy sau khi đã xác nhận. */ cancelledAfter: number;
  sent: number; sentNet: number; delivered: number; returned: number; returnedNet: number;
  reasons: Record<string, number>;
};
export type VdRates = { confirmRate: number | null; failRate: number | null; returnRate: number | null; returnRateNet: number | null };
export type VdPerson = { id: string; name: string; team: string; dept: VdDept };
export type VdDept = 'Sale' | 'CSKH' | 'Vận đơn' | 'Khác';
export type VdLine = VdStat & VdRates & { key: string; label: string; team?: string; dept?: VdDept; self?: number };
export type VdReport = {
  total: VdLine;
  sellers: VdLine[]; sellerTeams: VdLine[]; sellerDepts: VdLine[];
  confirmers: VdLine[]; confirmerTeams: VdLine[]; confirmerDepts: VdLine[];
  reasons: { reason: string; n: number; byConfirmer: { key: string; label: string; n: number }[] }[];
};

export const NO_REASON = 'Chưa ghi lý do';
export const NOBODY = 'Chưa rõ người';
const ratio = (a: number, b: number) => b ? a / b * 100 : null;
const blank = (): VdStat => ({ closed: 0, closedNet: 0, confirmed: 0, waiting: 0, failed: 0, cancelledAfter: 0, sent: 0, sentNet: 0, delivered: 0, returned: 0, returnedNet: 0, reasons: {} });

function add(s: VdStat, r: VdRow) {
  s.closed += r.n; s.closedNet += r.net;
  if (r.confirmed) s.confirmed += r.n;
  if (r.status_code === 17) s.waiting += r.n;
  if (r.status_code === 6 && !r.confirmed) { s.failed += r.n; const k = r.reason || NO_REASON; s.reasons[k] = (s.reasons[k] ?? 0) + r.n; }
  if (r.status_code === 6 && r.confirmed) s.cancelledAfter += r.n;
  if (SENT_CODES.includes(r.status_code)) { s.sent += r.n; s.sentNet += r.net; }
  if (DELIVERED_CODES.includes(r.status_code)) s.delivered += r.n;
  if (RETURNED_CODES.includes(r.status_code)) { s.returned += r.n; s.returnedNet += r.net; }
}
const rates = (s: VdStat): VdRates => ({
  // Tỷ lệ xác nhận được = đã xác nhận ÷ (đã xác nhận + không xác nhận được); đơn còn chờ chưa tính.
  confirmRate: ratio(s.confirmed, s.confirmed + s.failed),
  failRate: ratio(s.failed, s.confirmed + s.failed),
  returnRate: ratio(s.returned, s.sent),
  returnRateNet: ratio(s.returnedNet, s.sentNet),
});
const line = (key: string, label: string, s: VdStat, extra: Partial<VdLine> = {}): VdLine => ({ key, label, ...s, ...rates(s), ...extra });

/** Gom theo khóa rồi sắp theo số đơn giảm dần. */
function group(rows: VdRow[], keyOf: (r: VdRow) => string | null, labelOf: (k: string) => Partial<VdLine> & { label: string }, onSelf?: (r: VdRow, s: { self: number }) => void) {
  const map = new Map<string, VdStat & { self: number }>();
  for (const r of rows) {
    const k = keyOf(r);
    if (k === null) continue;
    const s = map.get(k) ?? { ...blank(), self: 0 };
    add(s, r); onSelf?.(r, s);
    map.set(k, s);
  }
  return [...map].map(([k, s]) => { const { label, ...extra } = labelOf(k); return line(k, label, s, { ...extra, self: s.self }); })
    .sort((a, b) => b.closed - a.closed || a.label.localeCompare(b.label));
}

/**
 * Báo cáo Vận đơn từ các nhóm đơn. Người chốt = người bán trên đơn. Người xác nhận = người bấm Đã xác nhận lần đầu; đơn không
 * xác nhận được tính cho người bấm hủy. Người chốt tự bấm Đã xác nhận (không qua Vận đơn) đếm riêng ở cột "tự xác nhận".
 */
export function buildVanDon(rows: VdRow[], people: Map<string, VdPerson>): VdReport {
  const person = (id: string) => people.get(id);
  const name = (id: string) => id === NOBODY ? NOBODY : person(id)?.name ?? `Mã ${id.slice(0, 8)}`;
  const teamOf = (id: string | null) => (id && person(id)?.team) || 'Chưa gắn team';
  const deptOf = (id: string | null): VdDept => (id && person(id)?.dept) || 'Khác';
  const handler = (r: VdRow) => r.confirmed ? r.confirm_by ?? NOBODY : r.status_code === 6 ? r.cancel_by ?? NOBODY : null;
  const selfCount = (r: VdRow, s: { self: number }) => { if (r.confirmed && r.confirm_by && r.confirm_by === r.seller_id) s.self += r.n; };
  const total = blank();
  for (const r of rows) add(total, r);
  const confirmers = group(rows, handler, (k) => ({ label: name(k), team: k === NOBODY ? '' : teamOf(k), dept: k === NOBODY ? 'Khác' : deptOf(k) }));
  const reasons = Object.entries(total.reasons).sort((a, b) => b[1] - a[1]).map(([reason, n]) => ({
    reason, n,
    byConfirmer: confirmers.filter((c) => c.reasons[reason]).map((c) => ({ key: c.key, label: c.label, n: c.reasons[reason] })).sort((a, b) => b.n - a.n),
  }));
  return {
    total: line('total', 'Tổng', total),
    sellers: group(rows, (r) => r.seller_id ?? NOBODY, (k) => ({ label: name(k), team: k === NOBODY ? '' : teamOf(k), dept: k === NOBODY ? 'Khác' : deptOf(k) }), selfCount),
    sellerTeams: group(rows, (r) => teamOf(r.seller_id), (k) => ({ label: k }), selfCount),
    sellerDepts: group(rows, (r) => deptOf(r.seller_id), (k) => ({ label: k }), selfCount),
    confirmers,
    confirmerTeams: group(rows, (r) => { const h = handler(r); return h === null ? null : teamOf(h === NOBODY ? null : h); }, (k) => ({ label: k })),
    confirmerDepts: group(rows, (r) => { const h = handler(r); return h === null ? null : deptOf(h === NOBODY ? null : h); }, (k) => ({ label: k })),
    reasons,
  };
}

/** Bộ phận theo team trên web nhân sự (sale / cskh) hoặc tên phòng có chữ Vận đơn / Kho. */
export function deptFor(team: string | null, unitNames: string[]): VdDept {
  if (team === 'sale') return 'Sale';
  if (team === 'cskh') return 'CSKH';
  return unitNames.some((n) => /vận đơn|van don|kho/i.test(n)) ? 'Vận đơn' : 'Khác';
}
