import { DELIVERED_CODES, RETURNED_CODES } from './shipping-lines';
import { NO_CARRIER, PARTNER_STATUS_LABELS } from './ship-fields';

export type FdOrder = { id: string; posId: string; sourceOrderId: string; status: number; net: number; carrier: string | null; province: string | null; partnerStatus: string | null; undeliverableAt: string; sentAt: string | null; sellerId: string | null; careId: string | null; customerName: string | null; phone: string | null };
export type FdRow = FdOrder & { partnerStatusLabel: string; hoursSince: number; sellerName: string; careName: string };
export type FdReport = {
  open: FdRow[];
  stats: { failed: number; saved: number; lost: number; pending: number; saveRate: number | null };
  byCarrier: { key: string; failed: number; saved: number; saveRate: number | null }[];
};
export function buildFailedDelivery(orders: FdOrder[], names: Map<string, string>, nowMs: number): FdReport {
  const stats = { failed: orders.length, saved: 0, lost: 0, pending: 0, saveRate: null as number | null };
  const carriers = new Map<string, { key: string; failed: number; saved: number; lost: number }>();
  for (const o of orders) {
    const key = o.carrier?.trim() || NO_CARRIER;
    const c = carriers.get(key) ?? { key, failed: 0, saved: 0, lost: 0 };
    c.failed++;
    if (DELIVERED_CODES.includes(o.status)) { stats.saved++; c.saved++; }
    if (RETURNED_CODES.includes(o.status)) { stats.lost++; c.lost++; }
    if (o.status === 2) stats.pending++;
    carriers.set(key, c);
  }
  const rate = (saved: number, lost: number) => saved + lost ? saved / (saved + lost) * 100 : null;
  stats.saveRate = rate(stats.saved, stats.lost);
  const open = orders.filter((o) => o.status === 2).sort((a, b) => b.net - a.net || a.undeliverableAt.localeCompare(b.undeliverableAt)).map((o) => ({ ...o,
    partnerStatusLabel: o.partnerStatus ? PARTNER_STATUS_LABELS[o.partnerStatus] ?? o.partnerStatus : 'Chưa có trạng thái hãng',
    hoursSince: Math.round((nowMs - Date.parse(o.undeliverableAt)) / 360000) / 10,
    sellerName: names.get(o.sellerId ?? '') ?? 'Chưa rõ', careName: names.get(o.careId ?? '') ?? 'Chưa rõ',
  }));
  return { open, stats, byCarrier: [...carriers.values()].map((c) => ({ key: c.key, failed: c.failed, saved: c.saved, saveRate: rate(c.saved, c.lost) })).sort((a, b) => b.failed - a.failed) };
}
