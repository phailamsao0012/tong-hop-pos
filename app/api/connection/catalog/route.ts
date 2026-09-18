import { env } from 'cloudflare:workers';
import { forbidden, getSessionUser, unauthorized } from '@/lib/auth';
import { POS } from '@/lib/report-model';

// Khảo sát danh mục dữ liệu Pancake POS: gọi thử từng endpoint (1 bản ghi) bằng khóa hiện tại
// và báo cái nào lấy được, bao nhiêu bản ghi, có những trường gì. Chỉ quản trị viên; không ghi gì vào D1.
type Probe = { key: string; label: string; group: string; path: string; params?: Record<string, string>; have: 'yes' | 'part' | 'no'; note?: string };
const PROBES: Probe[] = [
  { key: 'shops', label: 'Danh sách cửa hàng', group: 'Cửa hàng', path: '/shops', have: 'yes' },
  { key: 'orders', label: 'Đơn hàng (danh sách)', group: 'Đơn hàng', path: '/shops/{s}/orders', params: { page_size: '1', page_number: '1' }, have: 'yes' },
  { key: 'order_detail', label: 'Chi tiết một đơn', group: 'Đơn hàng', path: '/shops/{s}/orders/{o}', have: 'part', note: 'Web lưu JSON gốc từ danh sách; endpoint chi tiết có thể đủ trường hơn.' },
  { key: 'order_returns', label: 'Đơn hoàn / đổi trả', group: 'Đơn hàng', path: '/shops/{s}/order_returns', params: { page_size: '1', page_number: '1' }, have: 'no' },
  { key: 'returns', label: 'Phiếu trả hàng', group: 'Đơn hàng', path: '/shops/{s}/returns', params: { page_size: '1', page_number: '1' }, have: 'no' },
  { key: 'tags', label: 'Thẻ đơn hàng', group: 'Đơn hàng', path: '/shops/{s}/tags', have: 'no' },
  { key: 'order_sources', label: 'Nguồn đơn', group: 'Đơn hàng', path: '/shops/{s}/order_sources', have: 'no' },
  { key: 'partners', label: 'Đơn vị vận chuyển', group: 'Đơn hàng', path: '/shops/{s}/partners', have: 'no' },
  { key: 'cod', label: 'Đối soát COD', group: 'Đơn hàng', path: '/shops/{s}/cod_transactions', params: { page_size: '1', page_number: '1' }, have: 'no' },
  { key: 'customers', label: 'Khách hàng (ghi chú, phân công, thẻ)', group: 'Khách hàng', path: '/shops/{s}/customers', params: { page_size: '1', page_number: '1' }, have: 'yes' },
  { key: 'customer_levels', label: 'Cấp độ khách', group: 'Khách hàng', path: '/shops/{s}/customer_levels', have: 'no' },
  { key: 'customer_tags', label: 'Thẻ khách hàng', group: 'Khách hàng', path: '/shops/{s}/customer_tags', have: 'no' },
  { key: 'users', label: 'Nhân viên', group: 'Nhân sự', path: '/shops/{s}/users', have: 'yes' },
  { key: 'products', label: 'Sản phẩm', group: 'Sản phẩm', path: '/shops/{s}/products', params: { page_size: '1', page_number: '1' }, have: 'part', note: 'Web mới lưu mẫu mã (variations).' },
  { key: 'variations', label: 'Mẫu mã sản phẩm', group: 'Sản phẩm', path: '/shops/{s}/products/variations', params: { page_size: '1', page_number: '1' }, have: 'yes' },
  { key: 'categories', label: 'Danh mục sản phẩm', group: 'Sản phẩm', path: '/shops/{s}/categories', have: 'no' },
  { key: 'combos', label: 'Combo', group: 'Sản phẩm', path: '/shops/{s}/combos', params: { page_size: '1', page_number: '1' }, have: 'no' },
  { key: 'promotions', label: 'Khuyến mãi', group: 'Sản phẩm', path: '/shops/{s}/promotions', params: { page_size: '1', page_number: '1' }, have: 'no' },
  { key: 'warehouses', label: 'Kho hàng', group: 'Kho', path: '/shops/{s}/warehouses', have: 'no' },
  { key: 'quantities', label: 'Tồn kho theo kho', group: 'Kho', path: '/shops/{s}/variations/quantities', params: { page_size: '1', page_number: '1' }, have: 'no' },
  { key: 'purchase_orders', label: 'Phiếu nhập hàng', group: 'Kho', path: '/shops/{s}/purchase_orders', params: { page_size: '1', page_number: '1' }, have: 'no' },
  { key: 'stock_transfers', label: 'Phiếu chuyển kho', group: 'Kho', path: '/shops/{s}/stock_transfers', params: { page_size: '1', page_number: '1' }, have: 'no' },
  { key: 'inventory_checks', label: 'Kiểm kho', group: 'Kho', path: '/shops/{s}/inventory_checks', params: { page_size: '1', page_number: '1' }, have: 'no' },
  { key: 'expenses', label: 'Chi phí', group: 'Tài chính', path: '/shops/{s}/expenses', params: { page_size: '1', page_number: '1' }, have: 'no' },
  { key: 'payments', label: 'Thanh toán', group: 'Tài chính', path: '/shops/{s}/payments', params: { page_size: '1', page_number: '1' }, have: 'no' },
  { key: 'pages', label: 'Kênh bán (page)', group: 'Kênh', path: '/shops/{s}/pages', have: 'no' },
  { key: 'conversations', label: 'Hội thoại chat', group: 'Kênh', path: '/shops/{s}/conversations', params: { page_size: '1', page_number: '1' }, have: 'no', note: 'Thuộc Pancake Chat, thường không có ở API POS.' },
  { key: 'statistics', label: 'Thống kê dựng sẵn', group: 'Khác', path: '/shops/{s}/statistics', have: 'no' },
  { key: 'geo', label: 'Địa giới (tỉnh/huyện)', group: 'Khác', path: '/shops/{s}/geo/provinces', have: 'no' },
  { key: 'settings', label: 'Cấu hình cửa hàng', group: 'Khác', path: '/shops/{s}/settings', have: 'no' },
];
type Result = { key: string; label: string; group: string; path: string; have: Probe['have']; note?: string; status: 'available' | 'empty' | 'forbidden' | 'missing' | 'error'; httpStatus: number | null; count: number | null; fields: string[]; message: string | null; ms: number };

const pickList = (body: unknown): unknown[] | null => {
  if (Array.isArray(body)) return body;
  if (!body || typeof body !== 'object') return null;
  const o = body as Record<string, unknown>;
  for (const k of ['data', 'shops', 'users', 'items', 'results', 'products', 'variations', 'warehouses', 'tags', 'list']) if (Array.isArray(o[k])) return o[k] as unknown[];
  return null;
};

export async function GET(request: Request) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  if (user.role !== 'admin') return forbidden();
  const p = new URL(request.url).searchParams;
  const posId = p.get('posId');
  if (!POS.some((p) => p.id === posId)) return Response.json({ error: 'POS ngoài phạm vi.' }, { status: 400 });
  const [row, order] = await Promise.all([
    env.DB.prepare('SELECT shop_id FROM pos_shops WHERE id=?').bind(posId).first<{ shop_id: string | null }>(),
    env.DB.prepare('SELECT source_order_id FROM raw_pos_orders WHERE pos_id=? ORDER BY created_at DESC LIMIT 1').bind(posId).first<{ source_order_id: string }>(),
  ]);
  const shopId = row?.shop_id, apiKey = env.PANCAKE_POS_API_KEY?.trim();
  if (!apiKey || !shopId || !/^\d+$/.test(shopId)) return Response.json({ error: 'Thiếu API key bí mật hoặc Shop ID dạng số.' }, { status: 400 });

  // Tra một khách theo SĐT: trả JSON gốc Pancake (để đối chiếu cách phân công). Chỉ quản trị viên, không lưu gì.
  const phone = (p.get('phone') ?? '').replace(/\D/g, '').slice(0, 15);
  if (phone) {
    const out: Record<string, unknown> = {};
    for (const key of ['search', 'phone_number', 'phone']) {
      const url = new URL(`https://pos.pages.fm/api/v1/shops/${shopId}/customers`);
      url.searchParams.set('api_key', apiKey); url.searchParams.set('page_size', '3'); url.searchParams.set('page_number', '1'); url.searchParams.set(key, phone);
      try {
        const r = await fetch(url, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(15000) });
        const body = await r.json().catch(() => null) as { data?: unknown[] } | null;
        const list = Array.isArray(body?.data) ? body!.data as Record<string, unknown>[] : [];
        const hit = list.filter((c) => JSON.stringify(c.phone_numbers ?? '').includes(phone));
        out[key] = { status: r.status, matched: hit.length, customers: hit.slice(0, 2) };
        if (hit.length) break;
      } catch (e) { out[key] = String(e); }
    }
    return Response.json({ posId, shopId, phone, lookup: out }, { headers: { 'Cache-Control': 'private, no-store' } });
  }

  const probe = async (p: Probe): Promise<Result> => {
    const path = p.path.replace('{s}', shopId).replace('{o}', order?.source_order_id ?? '0');
    const url = new URL(`https://pos.pages.fm/api/v1${path}`);
    url.searchParams.set('api_key', apiKey);
    for (const [k, v] of Object.entries(p.params ?? {})) url.searchParams.set(k, v);
    const started = Date.now();
    const base = { key: p.key, label: p.label, group: p.group, path: p.path, have: p.have, note: p.note };
    try {
      const res = await fetch(url, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(12000) });
      const text = await res.text();
      let body: unknown = null; try { body = JSON.parse(text); } catch { /* không phải JSON */ }
      const o = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;
      const message = typeof o.message === 'string' ? o.message : typeof o.error === 'string' ? o.error : null;
      const ms = Date.now() - started;
      if (res.status === 401 || res.status === 403) return { ...base, status: 'forbidden', httpStatus: res.status, count: null, fields: [], message, ms };
      if (res.status === 404 || (res.status >= 400 && /not found|route|no route|không tồn tại/i.test(message ?? ''))) return { ...base, status: 'missing', httpStatus: res.status, count: null, fields: [], message, ms };
      if (!res.ok || o.success === false) return { ...base, status: 'error', httpStatus: res.status, count: null, fields: [], message: message ?? text.slice(0, 120), ms };
      const list = pickList(body);
      const first = list ? list[0] : (p.key === 'order_detail' ? (o.data ?? o.order ?? body) : body);
      const fields = first && typeof first === 'object' ? Object.keys(first as object).slice(0, 40) : [];
      const count = typeof o.total_entries === 'number' ? o.total_entries : typeof o.total === 'number' ? o.total : list ? list.length : first ? 1 : 0;
      return { ...base, status: count > 0 || (!list && fields.length) ? 'available' : 'empty', httpStatus: res.status, count, fields, message: null, ms };
    } catch (error) {
      return { ...base, status: 'error', httpStatus: null, count: null, fields: [], message: error instanceof Error ? error.message : String(error), ms: Date.now() - started };
    }
  };
  // Gọi 4 endpoint một lúc để không dồn Pancake.
  const results: Result[] = [];
  for (let i = 0; i < PROBES.length; i += 4) results.push(...await Promise.all(PROBES.slice(i, i + 4).map(probe)));
  return Response.json({ posId, shopId, checkedAt: new Date().toISOString(), sampleOrderId: order?.source_order_id ?? null, results }, { headers: { 'Cache-Control': 'private, no-store' } });
}
