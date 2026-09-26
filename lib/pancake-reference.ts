// "Số tham chiếu Pancake": các ô như màn Thống kê của Pancake POS (Tổng cộng / Online / Bán tại quầy,
// Doanh số, Doanh thu, Lợi nhuận, Đơn chốt, GTTB, SL sản phẩm, SP trung bình, hàng hoàn).
// Ưu tiên lấy thẳng từ Pancake (/analytics/sale); POS nào gọi lỗi thì tự tính từ đơn đã đồng bộ theo đúng
// công thức Pancake (đơn chốt = xác nhận trở đi, xếp theo ngày xác nhận lần đầu). Không phụ thuộc "Cách tính".
import { env } from 'cloudflare:workers';
import { PANCAKE_BASE } from '@/lib/pancake';
import { vnRangeUtc } from '@/lib/report-time';

import { emptyRefBlock as empty, emptyRefPart as emptyPart, type RefBlock, type RefPart, type RefPos } from '@/lib/pancake-ref-types';
export type { RefBlock, RefPart, RefPos };
const n = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : Number(v) || 0);

// ---- Tự tính từ D1 ----
// Đọc bảng tổng hợp theo ngày (stats_daily, cột closed_* theo ngày xác nhận lần đầu) — nhẹ, không đọc JSON gốc của đơn.
// Bảng này không tách Online / Bán tại quầy, không có giá vốn và hàng hoàn theo ngày hoàn: các ô đó chỉ có khi lấy được từ Pancake.
async function webPart(posIds: string[], start: string, end: string): Promise<Map<string, RefPart>> {
  const ph = posIds.map(() => '?').join(',');
  const rows = await env.DB.prepare(`SELECT pos_id, SUM(closed_orders) AS orders, SUM(closed_gross) AS sales, SUM(closed_net) AS revenue, SUM(closed_quantity) AS quantity
    FROM stats_daily WHERE pos_id IN (${ph}) AND day>=? AND day<=? GROUP BY pos_id`).bind(...posIds, start, end)
    .all<{ pos_id: string; orders: number; sales: number; revenue: number; quantity: number }>();
  const out = new Map<string, RefPart>(posIds.map((id) => [id, { ...emptyPart(), split: false, hasReturned: false }]));
  for (const r of rows.results) {
    const part = out.get(r.pos_id)!;
    part.total = { orders: n(r.orders), sales: n(r.sales), revenue: n(r.revenue), quantity: n(r.quantity), profit: null };
    part.online = { ...part.total }; part.counter = empty(); part.counter.profit = null;
  }
  for (const part of out.values()) if (part.total.orders === 0) part.total.profit = null;
  return out;
}

// ---- Gọi Pancake ----
type Stat = Record<string, unknown> | null | undefined;
const FIELDS = ['price', 'sales', 'revenue', 'capital', 'profit', 'order_count', 'product_count', 'discount'];
const cache = new Map<string, { at: number; value: unknown }>();
const TTL = 3 * 60 * 1000;

async function analytics(shopId: string, start: string, end: string, filter?: Record<string, string[]>) {
  const { startUtc, endUtc } = vnRangeUtc(start, end);
  const url = new URL(`${PANCAKE_BASE}/shops/${encodeURIComponent(shopId)}/analytics/sale`);
  url.searchParams.set('since', startUtc);
  url.searchParams.set('until', new Date(Date.parse(endUtc) - 1000).toISOString());
  url.searchParams.set('success_status', '1');
  url.searchParams.set('success_record', 'updated_at');
  url.searchParams.set('returned_record', 'updated_at');
  for (const f of FIELDS) url.searchParams.append('select_fields[]', f);
  for (const [key, values] of Object.entries(filter ?? {})) for (const v of values) url.searchParams.append(`filter[${key}][]`, v);
  const key = url.toString();
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL) return hit.value as { success?: Stat; returned?: Stat }[];
  url.searchParams.set('api_key', env.PANCAKE_POS_API_KEY ?? '');
  const res = await fetch(url, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(9000), cache: 'no-store' });
  if (!res.ok) throw new Error(`Pancake HTTP ${res.status}`);
  const body = await res.json() as { success?: boolean; data?: { success?: Stat; returned?: Stat }[] };
  if (body.success === false || !Array.isArray(body.data)) throw new Error('Pancake trả dữ liệu thống kê không đúng dạng');
  cache.set(key, { at: Date.now(), value: body.data });
  if (cache.size > 300) cache.delete(cache.keys().next().value!);
  return body.data;
}

function toBlock(rows: { success?: Stat }[]): RefBlock {
  const b = empty();
  let hasProfit = true;
  for (const row of rows) {
    const s = row.success;
    if (!s) continue;
    const price = n(s.price), discount = n(s.discount);
    const sales = s.sales != null ? n(s.sales) : price;
    const revenue = s.revenue != null ? n(s.revenue) : price - discount;
    b.orders += n(s.order_count); b.sales += sales; b.revenue += revenue; b.quantity += n(s.product_count);
    if (s.profit != null) b.profit! += n(s.profit);
    else if (s.capital != null) b.profit! += revenue - n(s.capital);
    else hasProfit = false;
  }
  if (!hasProfit) b.profit = null;
  return b;
}

async function pancakePart(shopId: string, start: string, end: string): Promise<RefPart> {
  const [all, counter] = await Promise.all([
    analytics(shopId, start, end),
    analytics(shopId, start, end, { 'Order.received_at_shop': ['true'] }).catch(() => null),
  ]);
  const total = toBlock(all);
  const part: RefPart = { ...emptyPart(), split: !!counter, hasReturned: true };
  part.total = total;
  if (counter) {
    part.counter = toBlock(counter);
    const c = part.counter;
    part.online = { orders: total.orders - c.orders, sales: total.sales - c.sales, revenue: total.revenue - c.revenue, quantity: total.quantity - c.quantity, profit: total.profit === null || c.profit === null ? null : total.profit - c.profit };
  } else part.online = total;
  for (const row of all) {
    const r = row.returned;
    if (!r) continue;
    part.returned.orders += n(r.order_count);
    part.returned.revenue += r.revenue != null ? n(r.revenue) : n(r.price) - n(r.discount);
    part.returned.quantity += n(r.product_count);
  }
  return part;
}

/** Số tham chiếu từng POS trong kỳ; `source` cho biết số lấy từ Pancake hay web tự tính. */
export async function pancakeReference(posIds: string[], start: string, end: string): Promise<RefPos[]> {
  const shops = await env.DB.prepare(`SELECT id,shop_id FROM pos_shops WHERE id IN (${posIds.map(() => '?').join(',')})`)
    .bind(...posIds).all<{ id: string; shop_id: string | null }>();
  const shopOf = new Map(shops.results.map((r) => [r.id, r.shop_id]));
  const web = await webPart(posIds, start, end).catch((e) => { console.error('pancake-ref web', e); return new Map<string, RefPart>(); });
  const useApi = !env.LOCAL_DEV && !!env.PANCAKE_POS_API_KEY;
  return Promise.all(posIds.map(async (posId): Promise<RefPos> => {
    const own = web.get(posId) ?? { ...emptyPart(), split: false, hasReturned: false };
    const shopId = shopOf.get(posId);
    if (!useApi || !shopId) return { posId, source: 'web', web: own, error: useApi ? 'POS chưa ghép cửa hàng Pancake' : undefined };
    try {
      return { posId, source: 'pancake', web: own, pancake: await pancakePart(shopId, start, end) };
    } catch (error) {
      console.error('pancake-ref api', posId, error instanceof Error ? error.message : error);
      return { posId, source: 'web', web: own, error: error instanceof Error ? error.message : 'Không gọi được Pancake' };
    }
  }));
}
