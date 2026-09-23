import { env } from 'cloudflare:workers';
import { getSessionUser, unauthorized } from '@/lib/auth';
import { POS } from '@/lib/report-model';
import { DATE_RE, vnRangeUtc } from '@/lib/report-time';
import { NET } from '@/lib/stats';
import { ORDER_STATUS } from '@/lib/pancake';
import { STAGES, SOURCE_FIELD, itemKey, productExists, saleItemPredicate, stageSql, type MarketingStage } from '@/lib/marketing-report';
import { parseTeam, teamFilter } from '@/lib/team';

const BASES = ['created', 'confirmed'] as const;
type Basis = typeof BASES[number];

type AggregateRow = {
  orders: number; phones: number; gross: number; net: number;
  confirmed: number; shipped: number; delivered: number; returned: number; cancelled: number;
};
type MarketerRow = AggregateRow & { marketer_id: string };
type ProductRow = { product_key: string; product_name: string; orders: number; phones: number; quantity: number; line_total: number };
type RecentOrder = { id: string; source_order_id: string; pos_id: string; phone: string | null; created_at: string; first_confirmed_at: string | null; status_code: number; marketer_id: string | null; seller_id: string | null; care_id: string | null; net: number; source: string | null; note: string | null };

const num = (v: unknown) => Number(v ?? 0);
const aggregate = (r?: Partial<AggregateRow>) => ({
  orders: num(r?.orders), phones: num(r?.phones), gross: num(r?.gross), net: num(r?.net),
  confirmed: num(r?.confirmed), shipped: num(r?.shipped), delivered: num(r?.delivered), returned: num(r?.returned), cancelled: num(r?.cancelled),
});

export async function GET(request: Request) {
  if (!(await getSessionUser())) return unauthorized();
  const p = new URL(request.url).searchParams;
  const start = p.get('start') ?? '', end = p.get('end') ?? '';
  if (!DATE_RE.test(start) || !DATE_RE.test(end) || start > end) return Response.json({ error: 'Khoảng ngày không hợp lệ.' }, { status: 400 });
  const requested = (p.get('posIds') ?? '').split(',').filter(Boolean);
  const validPos = new Set<string>(POS.map((x) => x.id));
  if (requested.some((id) => !validPos.has(id))) return Response.json({ error: 'POS không hợp lệ.' }, { status: 400 });
  const posIds = requested.length ? requested : POS.map((x) => x.id);
  const basis = BASES.includes(p.get('basis') as Basis) ? p.get('basis') as Basis : 'created';
  const stage = STAGES.includes(p.get('stage') as MarketingStage) ? p.get('stage') as MarketingStage : 'all';
  const marketerId = (p.get('marketerId') ?? '').trim().slice(0, 100);
  const sellerId = (p.get('sellerId') ?? '').trim().slice(0, 100);
  const careId = (p.get('careId') ?? '').trim().slice(0, 100);
  const productKey = (p.get('productKey') ?? '').trim().slice(0, 180);
  const source = (p.get('source') ?? '').trim().slice(0, 180);
  const team = parseTeam(p.get('team'));
  const { startUtc, endUtc } = vnRangeUtc(start, end);
  const ph = posIds.map(() => '?').join(',');
  const marketer = `NULLIF(TRIM(o.marketer_id),'')`;
  const namesSql = "SELECT user_id,MAX(name) AS name FROM pos_users WHERE name<>'' GROUP BY user_id";
  const timeCol = basis === 'confirmed' ? 'o.first_confirmed_at' : 'o.created_at';

  const extra: string[] = [];
  const extraBinds: string[] = [];
  if (marketerId) { extra.push(`${marketer}=?`); extraBinds.push(marketerId); }
  if (sellerId) { extra.push('o.seller_id=?'); extraBinds.push(sellerId); }
  if (careId) { extra.push('o.care_id=?'); extraBinds.push(careId); }
  if (productKey) { extra.push(productExists('o')); extraBinds.push(productKey); }
  if (source) { extra.push(`${SOURCE_FIELD}=?`); extraBinds.push(source); }
  const scoped = `o.pos_id IN (${ph}) AND ${marketer} IS NOT NULL${teamFilter('o.seller_id', team)}${extra.length ? ` AND ${extra.join(' AND ')}` : ''}`;
  const period = `${timeCol}>=? AND ${timeCol}<?`;
  const selectedWhere = `${scoped} AND ${period} AND ${stageSql(stage)}`;
  const selectedBinds = [...posIds, ...extraBinds, startUtc, endUtc];

  // Phễu luôn là cohort đơn tạo trong kỳ. Đây là phần Pancake có đủ trên đơn, không suy ra lead chưa tạo đơn.
  const cohortWhere = `${scoped} AND o.created_at>=? AND o.created_at<? AND o.status_code<>7`;
  const cohortBinds = [...posIds, ...extraBinds, startUtc, endUtc];
  const sums = `COUNT(*) AS orders,COUNT(DISTINCT NULLIF(TRIM(o.phone),'')) AS phones,COALESCE(SUM(COALESCE(o.current_total,0)),0) AS gross,COALESCE(SUM(${NET.replaceAll(/\b(net_total|current_total|total_discount)\b/g, 'o.$1')}),0) AS net,
    SUM(o.first_confirmed_at IS NOT NULL AND o.status_code NOT IN (0,17,6,7)) AS confirmed,SUM(o.status_code IN (2,3,16,4,5,15)) AS shipped,SUM(o.status_code IN (3,16)) AS delivered,SUM(o.status_code IN (4,5,15)) AS returned,SUM(o.status_code=6) AS cancelled`;

  const optionScope = `o.pos_id IN (${ph}) AND ${marketer} IS NOT NULL${teamFilter('o.seller_id', team)} AND o.created_at>=? AND o.created_at<? AND o.status_code<>7`;
  const [selected, cohort, selectedMarketers, cohortMarketers, products, productOptions, peopleOptions, sourceOptions, recentOrders, names] = await env.DB.batch([
    env.DB.prepare(`SELECT ${sums} FROM raw_pos_orders o WHERE ${selectedWhere}`).bind(...selectedBinds),
    env.DB.prepare(`SELECT ${sums} FROM raw_pos_orders o WHERE ${cohortWhere}`).bind(...cohortBinds),
    env.DB.prepare(`SELECT ${marketer} AS marketer_id,${sums} FROM raw_pos_orders o WHERE ${selectedWhere} GROUP BY 1`).bind(...selectedBinds),
    env.DB.prepare(`SELECT ${marketer} AS marketer_id,${sums} FROM raw_pos_orders o WHERE ${cohortWhere} GROUP BY 1`).bind(...cohortBinds),
    env.DB.prepare(`SELECT ${itemKey('i')} AS product_key,MAX(i.name) AS product_name,COUNT(DISTINCT o.id) AS orders,COUNT(DISTINCT NULLIF(TRIM(o.phone),'')) AS phones,COALESCE(SUM(COALESCE(i.quantity,0)),0) AS quantity,COALESCE(SUM(COALESCE(i.line_total,0)),0) AS line_total
      FROM raw_pos_orders o JOIN raw_pos_order_items i ON i.order_id=o.id
      WHERE ${selectedWhere} AND ${saleItemPredicate('i')}${productKey ? ` AND ${itemKey('i')}=?` : ''}
      GROUP BY 1 ORDER BY line_total DESC,quantity DESC`).bind(...selectedBinds, ...(productKey ? [productKey] : [])),
    env.DB.prepare(`SELECT ${itemKey('i')} AS product_key,MAX(i.name) AS product_name,COUNT(DISTINCT o.id) AS orders
      FROM raw_pos_orders o JOIN raw_pos_order_items i ON i.order_id=o.id
      WHERE ${optionScope} AND ${saleItemPredicate('i')}
      GROUP BY 1 ORDER BY orders DESC,product_name`).bind(...posIds, startUtc, endUtc),
    env.DB.prepare(`SELECT ${marketer} AS marketer_id,o.seller_id,o.care_id FROM raw_pos_orders o WHERE ${optionScope} GROUP BY 1,2,3`).bind(...posIds, startUtc, endUtc),
    env.DB.prepare(`SELECT ${SOURCE_FIELD} AS source FROM raw_pos_orders o WHERE ${optionScope} AND ${SOURCE_FIELD} IS NOT NULL GROUP BY 1`).bind(...posIds, startUtc, endUtc),
    env.DB.prepare(`SELECT o.id,o.source_order_id,o.pos_id,o.phone,o.created_at,o.first_confirmed_at,o.status_code,o.marketer_id,o.seller_id,o.care_id,
      ${NET.replaceAll(/\b(net_total|current_total|total_discount)\b/g, 'o.$1')} AS net,${SOURCE_FIELD} AS source,o.note
      FROM raw_pos_orders o WHERE ${selectedWhere} ORDER BY ${timeCol} DESC,o.id DESC LIMIT 60`).bind(...selectedBinds),
    env.DB.prepare(namesSql),
  ]);

  const nameMap = new Map((names.results as { user_id: string; name: string }[]).map((r) => [String(r.user_id), r.name]));
  const selectedMap = new Map((selectedMarketers.results as MarketerRow[]).map((r) => [String(r.marketer_id), aggregate(r)]));
  const cohortMap = new Map((cohortMarketers.results as MarketerRow[]).map((r) => [String(r.marketer_id), aggregate(r)]));
  const people = peopleOptions.results as { marketer_id: string | null; seller_id: string | null; care_id: string | null }[];
  const ids = [...new Set([...selectedMap.keys(), ...cohortMap.keys()])];
  const personOptions = (field: 'marketer_id' | 'seller_id' | 'care_id') => [...new Set(people.map((r) => r[field]).filter((id): id is string => !!id))]
    .map((id) => ({ id, name: nameMap.get(id) ?? `NV ${id.slice(0, 8)}` })).sort((a, b) => a.name.localeCompare(b.name, 'vi'));
  const sources = sourceOptions.results as { source: string | null }[];
  const byMarketer = ids.map((id) => {
    const current = selectedMap.get(id) ?? aggregate();
    const base = cohortMap.get(id) ?? aggregate();
    return {
      marketerId: id, marketerName: nameMap.get(id) ?? `MKT ${id.slice(0, 8)}`,
      ...current, createdOrders: base.orders, createdPhones: base.phones, confirmedOrders: base.confirmed,
      confirmationRate: base.orders ? base.confirmed / base.orders * 100 : null,
      shippedOrders: base.shipped, shippingRate: base.confirmed ? base.shipped / base.confirmed * 100 : null,
      deliveredOrders: base.delivered, deliveryRate: base.shipped ? base.delivered / base.shipped * 100 : null,
      returnedOrders: base.returned, cancelledOrders: base.cancelled,
      averageOrder: current.orders ? current.net / current.orders : null,
      revenuePerPhone: current.phones ? current.net / current.phones : null,
    };
  });

  const current = aggregate(selected.results[0] as AggregateRow | undefined);
  const base = aggregate(cohort.results[0] as AggregateRow | undefined);
  return Response.json({
    period: { start, end }, basis, stage,
    filters: { marketerId, sellerId, careId, productKey, source },
    summary: {
      ...current, createdOrders: base.orders, createdPhones: base.phones, confirmedOrders: base.confirmed,
      confirmationRate: base.orders ? base.confirmed / base.orders * 100 : null,
      shippedOrders: base.shipped, shippingRate: base.confirmed ? base.shipped / base.confirmed * 100 : null,
      deliveredOrders: base.delivered, deliveryRate: base.shipped ? base.delivered / base.shipped * 100 : null,
      returnedOrders: base.returned, cancelledOrders: base.cancelled,
      averageOrder: current.orders ? current.net / current.orders : null,
      revenuePerPhone: current.phones ? current.net / current.phones : null,
      selectedRate: base.orders ? current.orders / base.orders * 100 : null,
    },
    byMarketer,
    byProduct: (products.results as ProductRow[]).map((r) => ({ productKey: r.product_key, productName: r.product_name, orders: num(r.orders), phones: num(r.phones), quantity: num(r.quantity), lineTotal: num(r.line_total) })),
    recentOrders: (recentOrders.results as RecentOrder[]).map((r) => ({
      id: r.id, orderId: r.source_order_id, posName: POS.find((x) => x.id === r.pos_id)?.name ?? r.pos_id,
      phone: r.phone, createdAt: r.created_at, confirmedAt: r.first_confirmed_at,
      status: ORDER_STATUS[Number(r.status_code)] ?? String(r.status_code),
      marketer: r.marketer_id ? nameMap.get(r.marketer_id) ?? `MKT ${r.marketer_id.slice(0, 8)}` : null,
      seller: r.seller_id ? nameMap.get(r.seller_id) ?? `NV ${r.seller_id.slice(0, 8)}` : null,
      care: r.care_id ? nameMap.get(r.care_id) ?? `NV ${r.care_id.slice(0, 8)}` : null,
      net: num(r.net), source: r.source, note: r.note,
    })),
    marketerOptions: personOptions('marketer_id'), sellerOptions: personOptions('seller_id'), careOptions: personOptions('care_id'),
    sourceOptions: [...new Set(sources.map((r) => r.source).filter((v): v is string => !!v))].sort((a, b) => a.localeCompare(b, 'vi')),
    productOptions: (productOptions.results as ProductRow[]).map((r) => ({ key: r.product_key, name: r.product_name, orders: num(r.orders) })),
    definitions: {
      scope: 'Chỉ tính đơn Pancake có trường Marketer. Không suy ra khách chưa tạo đơn và không dùng số chi phí quảng cáo bên ngoài Pancake.',
      cohort: 'Phễu và tỷ lệ dùng các đơn do marketer mang về, tạo trong kỳ đang chọn. SĐT là số duy nhất có trên các đơn này.',
      selected: basis === 'confirmed' ? 'Chỉ số chính xếp theo ngày xác nhận lần đầu và trạng thái/mốc đang chọn.' : 'Chỉ số chính xếp theo ngày tạo đơn và trạng thái/mốc đang chọn.',
      products: 'Sản phẩm lấy từ dòng hàng bán trên Pancake, loại dòng được đánh dấu quà tặng hoặc có tên bắt đầu bằng Quà Tặng. Một đơn có nhiều sản phẩm được tính vào từng dòng liên quan; hàng tổng đơn dùng số đơn duy nhất.',
      attribution: 'Sale và CSKH lấy từ người bán và người chăm sóc gắn trên đơn. Nguồn đơn lấy từ trường order_sources của Pancake. Page, bài viết và mã quảng cáo chưa có trường chuẩn đủ để lập bộ lọc toàn bộ lịch sử. Bảng đơn chỉ hiện ghi chú của đơn; ghi chú khách chi tiết xem tại Cuộc gọi CSKH.',
    },
  }, { headers: { 'Cache-Control': 'private, no-store' } });
}
