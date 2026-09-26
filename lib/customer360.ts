// Khách hàng 360 (kế hoạch quản trị, giai đoạn 4a · 26/09/2026): gộp khách theo SĐT trên các POS đang chọn (không đếm trùng),
// vòng đời khách, khoảng cách giữa hai lần mua, và danh sách khách tới hạn gọi lại.
// Đọc bảng tổng hợp theo khách (customer_stats: một dòng mỗi POS × SĐT), không quét đơn gốc.
// Mua thành công theo bảng này = đang giao, đã nhận, đã thu tiền (2, 3, 16).
import { env } from 'cloudflare:workers';
import { POS } from '@/lib/report-model';
import { todayVn, vnDayStartUtc } from '@/lib/report-time';

export const STAGES = [
  { key: 'new', label: 'Khách mới', hint: 'Mua thành công 1 lần, lần gần nhất trong 60 ngày' },
  { key: 'repeat', label: 'Mua lại', hint: 'Mua 2–3 lần, lần gần nhất trong 60 ngày' },
  { key: 'loyal', label: 'Thân thiết', hint: 'Mua từ 4 lần, lần gần nhất trong 60 ngày' },
  { key: 'risk', label: 'Có nguy cơ', hint: 'Lần mua gần nhất cách đây 61–90 ngày' },
  { key: 'sleep', label: 'Đang ngủ', hint: 'Lần mua gần nhất cách đây hơn 90 ngày' },
  { key: 'never', label: 'Chưa mua thành công', hint: 'Có đơn nhưng chưa đơn nào đang giao / đã nhận / đã thu tiền' },
] as const;
export const GAP_BUCKETS = [
  { key: 'g15', label: '≤ 15 ngày', max: 15 }, { key: 'g30', label: '16–30 ngày', max: 30 }, { key: 'g45', label: '31–45 ngày', max: 45 },
  { key: 'g60', label: '46–60 ngày', max: 60 }, { key: 'g90', label: '61–90 ngày', max: 90 }, { key: 'more', label: 'Trên 90 ngày', max: 1e9 },
] as const;

export type Customer360 = Awaited<ReturnType<typeof customer360>>;

export async function customer360(opts: { posIds: string[] }) {
  const db = env.DB;
  const ph = opts.posIds.map(() => '?').join(',');
  const now = vnDayStartUtc(todayVn()); // mốc "hôm nay" theo giờ VN
  // Một dòng mỗi SĐT: gộp mọi POS đang chọn.
  const merged = `SELECT phone, COUNT(*) AS pos_n, MAX(name) AS name, SUM(orders) AS orders, SUM(success_orders) AS so, SUM(success_net) AS net,
      MIN(first_success_at) AS fs, MAX(last_success_at) AS ls, MAX(seller_id) AS seller_id, GROUP_CONCAT(pos_id) AS pos_list
    FROM customer_stats WHERE pos_id IN (${ph}) AND phone<>'' GROUP BY phone`;
  const days = `(julianday(?) - julianday(ls))`;
  const stage = `CASE WHEN so=0 OR ls IS NULL THEN 'never' WHEN ${days}>90 THEN 'sleep' WHEN ${days}>60 THEN 'risk' WHEN so>=4 THEN 'loyal' WHEN so>=2 THEN 'repeat' ELSE 'new' END`;
  const gap = `((julianday(ls) - julianday(fs)) / (so - 1))`;
  const [stages, rows, gaps] = await db.batch([
    db.prepare(`SELECT ${stage} AS stage, COUNT(*) AS n, COALESCE(SUM(net),0) AS net, SUM(pos_n>1) AS multi FROM (${merged}) GROUP BY 1`).bind(now, now, ...opts.posIds),
    db.prepare(`SELECT COUNT(*) AS n FROM customer_stats WHERE pos_id IN (${ph}) AND phone<>''`).bind(...opts.posIds),
    db.prepare(`SELECT CASE ${GAP_BUCKETS.map((b) => `WHEN ${gap}<=${b.max} THEN '${b.key}'`).join(' ')} END AS b, COUNT(*) AS n FROM (${merged}) WHERE so>=2 AND fs IS NOT NULL AND ls>fs GROUP BY 1`).bind(...opts.posIds),
  ]);
  const gapRows = gaps.results as { b: string; n: number }[];
  const gapTotal = gapRows.reduce((t, r) => t + Number(r.n), 0);
  // Trung vị khoảng cách mua lại: lấy đúng khách ở giữa.
  const med = gapTotal ? await db.prepare(`SELECT ${gap} AS g FROM (${merged}) WHERE so>=2 AND fs IS NOT NULL AND ls>fs ORDER BY g LIMIT 1 OFFSET ?`)
    .bind(...opts.posIds, Math.floor(gapTotal / 2)).first<{ g: number }>() : null;
  const medianGap = med?.g ?? null;
  // Tới hạn gọi lại: đã mua, chưa mua lại, hôm nay đã qua (khoảng cách riêng của khách, khách mua 1 lần lấy trung vị) − 3 ngày,
  // và chưa quá 30 ngày sau hạn (quá nữa thì thuộc nhóm nguy cơ / ngủ, xem ở Khách lâu chưa mua).
  const due = `CASE WHEN so>=2 AND ls>fs THEN ${gap} ELSE ? END`;
  const dueList = medianGap === null ? { results: [] } : await db.prepare(`SELECT phone, name, pos_n, pos_list, so, net, ls, seller_id, ${due} AS gap, ${days} AS since FROM (${merged})
      WHERE so>=1 AND ls IS NOT NULL AND ${days} >= ${due} - 3 AND ${days} <= ${due} + 30 ORDER BY net DESC LIMIT 300`)
    .bind(medianGap, now, ...opts.posIds, now, medianGap, now, medianGap).all<{ phone: string; name: string; pos_n: number; pos_list: string; so: number; net: number; ls: string; seller_id: string | null; gap: number; since: number }>();
  const names = await db.prepare("SELECT user_id, MAX(name) AS name FROM pos_users WHERE name<>'' GROUP BY user_id").all<{ user_id: string; name: string }>();
  const who = new Map(names.results.map((r) => [r.user_id, r.name]));
  const st = new Map((stages.results as { stage: string; n: number; net: number; multi: number }[]).map((r) => [r.stage, r]));
  const unique = [...st.values()].reduce((t, r) => t + Number(r.n), 0);
  const multi = [...st.values()].reduce((t, r) => t + Number(r.multi), 0);
  return {
    posIds: opts.posIds.length === POS.length ? null : opts.posIds,
    total: { unique, perPosRows: Number((rows.results[0] as { n?: number } | undefined)?.n ?? 0), multiPos: multi,
      buyers: unique - Number(st.get('never')?.n ?? 0), net: [...st.values()].reduce((t, r) => t + Number(r.net), 0) },
    stages: STAGES.map((s) => ({ ...s, n: Number(st.get(s.key)?.n ?? 0), net: Number(st.get(s.key)?.net ?? 0) })),
    gaps: GAP_BUCKETS.map((b) => ({ key: b.key, label: b.label, n: Number(gapRows.find((r) => r.b === b.key)?.n ?? 0) })),
    medianGap,
    due: dueList.results.map((r) => ({
      phone: r.phone, name: r.name || 'Khách', posN: Number(r.pos_n), posNames: String(r.pos_list ?? '').split(',').map((id) => POS.find((p) => p.id === id)?.name ?? id),
      orders: Number(r.so), net: Number(r.net), lastAt: r.ls, since: Math.floor(Number(r.since)), gap: Math.round(Number(r.gap)), overdue: Math.floor(Number(r.since) - Number(r.gap)),
      seller: r.seller_id ? who.get(r.seller_id) ?? null : null,
    })),
    definitions: {
      merge: 'Khách = số điện thoại khác nhau trên các POS đang chọn. Khách mua ở nhiều POS chỉ tính một lần (trước đây mỗi POS tính riêng).',
      stages: 'Vòng đời theo lần mua thành công gần nhất (đang giao, đã nhận, đã thu tiền) tính tới hôm nay và số lần mua thành công trên mọi POS đang chọn.',
      gap: 'Khoảng cách mua lại của một khách = (lần mua gần nhất − lần mua đầu) ÷ (số lần mua − 1), chỉ khách mua từ 2 lần.',
      due: 'Tới hạn gọi lại = số ngày từ lần mua gần nhất đã đạt khoảng cách mua lại quen thuộc của khách (trừ 3 ngày để gọi sớm); khách mua 1 lần dùng trung vị của mọi khách. Quá hạn hơn 30 ngày thì xem ở Khách lâu chưa mua. Xếp theo tiền đã mua.',
    },
  };
}
