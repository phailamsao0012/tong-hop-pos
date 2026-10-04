// Pancake POS giả cho chế độ demo: trả lời đúng các đường dẫn web gọi (/shops, /orders, /users, /customers...) bằng dữ liệu ảo
// của lib/demo/world.ts. Hàm thuần (nhận URL, trả JSON), không gọi mạng.
import { SHOPS, customerNotes, findOrder, listCustomers, listOrders, listUsers, listVariations, shopByShopId } from './world';

/** Trả lời một yêu cầu tới Pancake POS giả: [mã HTTP, nội dung JSON]. */
export function fakePancake(method: string, url: URL, now = Date.now()): [number, unknown] {
  const path = url.pathname.replace(/^\/api\/v1/, '').replace(/\/+$/, '');
  const p = url.searchParams;
  if (path === '/shops') return [200, { success: true, shops: SHOPS.map((s) => ({ id: Number(s.shopId), name: s.name })) }];
  const m = path.match(/^\/shops\/([^/]+)(\/.*)?$/);
  const shop = m ? shopByShopId(decodeURIComponent(m[1])) : null;
  if (!m || !shop) return [404, { success: false, message: 'Không tìm thấy cửa hàng.' }];
  const rest = m[2] ?? '';
  if (method !== 'GET') {
    // Ghi lên Pancake (Chia số): bản demo không có đơn thật để ghi, coi như thành công.
    return [200, { success: true }];
  }
  if (rest === '/orders') return [200, listOrders(shop.posId, p, now)];
  const one = rest.match(/^\/orders\/([^/]+)$/);
  if (one) { const o = findOrder(shop.posId, decodeURIComponent(one[1]), now); return o ? [200, { success: true, data: o }] : [404, { success: false }]; }
  if (rest === '/users') return [200, { success: true, data: listUsers(shop.posId) }];
  if (rest === '/products/variations') {
    const data = listVariations(shop.posId);
    return [200, { success: true, data: Number(p.get('page_number') ?? 1) > 1 ? [] : data, total_entries: data.length, page_size: 100 }];
  }
  if (rest === '/customers') return [200, listCustomers(shop.posId, p, now)];
  const notes = rest.match(/^\/customers\/([^/]+)\/load_customer_notes$/);
  if (notes) return [200, { customer_notes: [{ notes: customerNotes(shop.posId, decodeURIComponent(notes[1]), now) }] }];
  // Các mục khác (thống kê, danh mục...) bản demo chưa giả lập.
  return [200, { success: true, data: [] }];
}
