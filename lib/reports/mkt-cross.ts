// Bảng chéo Team Sale × Team MKT (anh Vũ 12/11/2026). Trả số theo cặp (người chốt, marketer); trang gom thành team Sale / team MKT
// theo cùng danh sách team đang hiện, nên tổng dòng / cột khớp nhau.
// - SĐT nhận: số điện thoại khác nhau trên đơn MKT TẠO trong kỳ đang chia cho bộ phận Sale (cùng quy tắc số về 07/11/2026), theo Sale được gán.
// - Đơn chốt / doanh thu / đơn đi / hủy / hoàn: đơn XÁC NHẬN lần đầu trong kỳ ("đã chốt là chốt", kể cả hủy / hoàn về sau, trừ xoá),
//   theo người bấm xác nhận (anh Vũ: "tính cho người bấm xác nhận đơn").
import { env } from 'cloudflare:workers';
import { vnRangeUtc } from '@/lib/shared/report-time';
import { MKT_STAFF, teamSubquery } from '@/lib/teams/team';
import { NET } from '@/lib/reports/stats';
import { mktReadSource, type MktSource } from '@/lib/reports/mkt-source';
import { CLOSER_SQL } from '@/lib/teams/sale-team-filter';

export type CrossPair = { closerId: string; marketerId: string; phones: number; closed: number; saleClosed: number; net: number; packed: number; cancelled: number; returned: number };

/** source: nguồn đọc (mặc định chọn theo kỳ, lib/reports/mkt-source.ts); test truyền thẳng để so hai nguồn. */
export async function mktCross(posIds: string[], start: string, end: string, source?: MktSource): Promise<{ pairs: CrossPair[]; names: Record<string, string> }> {
  const src = source ?? await mktReadSource(env.DB, env, start, end);
  const PACKED_SQL = src.packed, AFTER_PACK_CANCELLED_SQL = src.afterPackCancelled, AFTER_PACK_RETURNED_SQL = src.afterPackReturned;
  const { startUtc, endUtc } = vnRangeUtc(start, end);
  const ph = posIds.map(() => '?').join(',');
  const mk = "NULLIF(TRIM(o.marketer_id),'')";
  const net = NET.replaceAll(/\b(net_total|current_total|total_discount)\b/g, 'o.$1');
  const base = `o.pos_id IN (${ph}) AND ${mk} IS NOT NULL AND ${mk} IN ${MKT_STAFF}`;
  const [leads, closed, names] = await env.DB.batch([
    env.DB.prepare(`SELECT COALESCE(NULLIF(o.seller_id,''),'') AS sid, ${mk} AS mid, COUNT(DISTINCT NULLIF(TRIM(o.phone),'')) AS phones
      FROM ${src.orders} o WHERE ${base} AND o.created_at>=? AND o.created_at<? AND o.status_code<>7 AND o.seller_id IN ${teamSubquery('sale')} GROUP BY 1,2`).bind(...posIds, startUtc, endUtc),
    env.DB.prepare(`SELECT COALESCE(${CLOSER_SQL},'') AS sid, ${mk} AS mid, COUNT(*) AS closed, SUM(CASE WHEN COALESCE(${CLOSER_SQL},'') IN ${teamSubquery('sale')} THEN 1 ELSE 0 END) AS sale_closed, COALESCE(SUM(${net}),0) AS net,
        SUM(CASE WHEN ${PACKED_SQL('o')} THEN 1 ELSE 0 END) AS packed,
        SUM(CASE WHEN ${AFTER_PACK_CANCELLED_SQL('o')} THEN 1 ELSE 0 END) AS cancelled,
        SUM(CASE WHEN ${PACKED_SQL('o')} AND ${AFTER_PACK_RETURNED_SQL('o')} THEN 1 ELSE 0 END) AS returned
      FROM ${src.orders} o WHERE ${base} AND o.first_confirmed_at>=? AND o.first_confirmed_at<? AND o.status_code NOT IN (0,17,7) GROUP BY 1,2`).bind(...posIds, startUtc, endUtc),
    env.DB.prepare("SELECT user_id, MAX(name) AS name FROM pos_users WHERE name<>'' GROUP BY user_id"),
  ]);
  const key = (s: string, m: string) => `${s}\u0000${m}`;
  const map = new Map<string, CrossPair>();
  const get = (sid: string, mid: string) => {
    const k = key(sid, mid);
    let p = map.get(k);
    if (!p) { p = { closerId: sid, marketerId: mid, phones: 0, closed: 0, saleClosed: 0, net: 0, packed: 0, cancelled: 0, returned: 0 }; map.set(k, p); }
    return p;
  };
  for (const r of leads.results as { sid: string; mid: string; phones: number }[]) get(r.sid, r.mid).phones += Number(r.phones);
  for (const r of closed.results as { sid: string; mid: string; closed: number; sale_closed: number; net: number; packed: number; cancelled: number; returned: number }[]) {
    const p = get(r.sid, r.mid);
    p.closed += Number(r.closed); p.saleClosed += Number(r.sale_closed); p.net += Number(r.net); p.packed += Number(r.packed); p.cancelled += Number(r.cancelled); p.returned += Number(r.returned);
  }
  const used = new Set([...map.values()].flatMap((p) => [p.closerId, p.marketerId]));
  const nameMap = Object.fromEntries((names.results as { user_id: string; name: string }[]).filter((r) => used.has(String(r.user_id))).map((r) => [String(r.user_id), r.name]));
  return { pairs: [...map.values()], names: nameMap };
}
