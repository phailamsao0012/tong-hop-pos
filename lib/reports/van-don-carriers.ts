// Vận đơn theo đơn vị vận chuyển (anh Vũ 12/11/2026: "xem được là đơn có thẻ viettel post (vtp) và đơn shopee express (spx) là bao nhiêu").
// - ĐVVC thật lấy từ dữ liệu đơn Pancake (raw_json.partner), chuẩn hoá tên: VTP, SPX, J&T, GHN, GHTK, khác.
// - Thẻ VTP / SPX: thẻ người dùng gắn trên đơn (tags_json), đếm riêng để thấy đơn gắn thẻ lệch với ĐVVC thật.
// - Phạm vi: đơn gửi lần đầu trong kỳ (first_sent_at), POS đang chọn. Doanh số chuyển đi = giá trị đơn (giữ đúng tên cột của trang Vận đơn).
import { env } from 'cloudflare:workers';
import { vnRangeUtc } from '@/lib/shared/report-time';
import { NET } from '@/lib/reports/stats';

export type CarrierKey = 'VTP' | 'SPX' | 'J&T' | 'GHN' | 'GHTK' | 'Khác';
export type CarrierRow = { carrier: CarrierKey; orders: number; shipping: number; delivered: number; returned: number; cancelled: number; net: number; tagVtp: number; tagSpx: number };

/** Tên ĐVVC trên Pancake → nhãn gọn. */
export function carrierKey(name: string | null | undefined): CarrierKey {
  const n = (name ?? '').toLowerCase();
  if (/viettel|\bvtp\b/.test(n)) return 'VTP';
  if (/spx|shopee/.test(n)) return 'SPX';
  if (/j\s*&\s*t|\bjt\b|j&t/.test(n)) return 'J&T';
  if (/ghn|giao hàng nhanh|giao hang nhanh/.test(n)) return 'GHN';
  if (/ghtk|tiết kiệm|tiet kiem/.test(n)) return 'GHTK';
  return 'Khác';
}
const ORDER: CarrierKey[] = ['VTP', 'SPX', 'J&T', 'GHN', 'GHTK', 'Khác'];

/** untilUtc: cắt tới giờ này (báo cáo sếp theo ca); không có thì hết ngày end. */
export async function vanDonCarriers(posIds: string[], start: string, end: string, untilUtc?: string): Promise<{ rows: CarrierRow[]; total: CarrierRow }> {
  const range = vnRangeUtc(start, end), startUtc = range.startUtc, endUtc = untilUtc && untilUtc < range.endUtc ? untilUtc : range.endUtc;
  const ph = posIds.map(() => '?').join(',');
  const net = NET.replaceAll(/\b(net_total|current_total|total_discount)\b/g, 'o.$1');
  const partner = "COALESCE(json_extract(o.raw_json,'$.partner.partner_name'), json_extract(o.raw_json,'$.partner_name'), json_extract(o.raw_json,'$.partner.name'), '')";
  const tag = (t: string) => `EXISTS (SELECT 1 FROM json_each(CASE WHEN json_valid(o.tags_json) THEN o.tags_json ELSE '[]' END) g WHERE UPPER(TRIM(COALESCE(json_extract(g.value,'$.name'), g.value)))='${t}')`;
  const rows = await env.DB.prepare(`SELECT ${partner} AS partner, COUNT(*) AS orders,
      SUM(CASE WHEN o.status_code=2 THEN 1 ELSE 0 END) AS shipping,
      SUM(CASE WHEN o.status_code IN (3,16) THEN 1 ELSE 0 END) AS delivered,
      SUM(CASE WHEN o.status_code IN (4,15,5) THEN 1 ELSE 0 END) AS returned,
      SUM(CASE WHEN o.status_code=6 THEN 1 ELSE 0 END) AS cancelled,
      COALESCE(SUM(${net}),0) AS net,
      SUM(CASE WHEN ${tag('VTP')} THEN 1 ELSE 0 END) AS tag_vtp,
      SUM(CASE WHEN ${tag('SPX')} THEN 1 ELSE 0 END) AS tag_spx
    FROM raw_pos_orders o WHERE o.pos_id IN (${ph}) AND o.first_sent_at IS NOT NULL AND o.first_sent_at>=? AND o.first_sent_at<? AND o.status_code<>7
    GROUP BY 1`).bind(...posIds, startUtc, endUtc).all<{ partner: string; orders: number; shipping: number; delivered: number; returned: number; cancelled: number; net: number; tag_vtp: number; tag_spx: number }>();
  const by = new Map<CarrierKey, CarrierRow>();
  const zero = (carrier: CarrierKey): CarrierRow => ({ carrier, orders: 0, shipping: 0, delivered: 0, returned: 0, cancelled: 0, net: 0, tagVtp: 0, tagSpx: 0 });
  for (const r of rows.results) {
    const k = carrierKey(r.partner);
    const a = by.get(k) ?? zero(k);
    a.orders += Number(r.orders); a.shipping += Number(r.shipping); a.delivered += Number(r.delivered); a.returned += Number(r.returned);
    a.cancelled += Number(r.cancelled); a.net += Number(r.net); a.tagVtp += Number(r.tag_vtp); a.tagSpx += Number(r.tag_spx);
    by.set(k, a);
  }
  const list = ORDER.map((k) => by.get(k)).filter((r): r is CarrierRow => !!r && r.orders > 0);
  const total = list.reduce((t, r) => { for (const k of ['orders', 'shipping', 'delivered', 'returned', 'cancelled', 'net', 'tagVtp', 'tagSpx'] as const) t[k] += r[k]; return t; }, zero('Khác'));
  return { rows: list, total };
}
