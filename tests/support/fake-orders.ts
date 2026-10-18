// Pancake giả cho test đồng bộ đơn vừa sửa (rủi ro 1, QA 11/10/2026 điểm 5): danh sách /orders lọc, sắp, phân trang như Pancake
// (mốc giây tính cả hai đầu, cùng giờ sửa thì theo mã đơn), và sửa được đơn GIỮA hai lần lấy trang (`before`), khác Pancake giả
// của demo (lib/demo/world.ts) trả danh sách cố định mỗi lần gọi. Đơn không có SĐT, tên: không có dữ liệu cá nhân.
import { setPancakeTransport, type SourceOrder } from '../../lib/pancake';

/** Giờ kiểu Pancake: UTC không hậu tố; có phần lẻ thì 6 chữ số (micro giây) như Pancake thật. */
export const pancakeTime = (ms: number) => new Date(ms).toISOString().slice(0, 19) + (ms % 1000 ? `.${String(ms % 1000).padStart(3, '0')}000` : '');

export type FakeOrders = {
  /** Mã đơn → giờ sửa (ms). Sửa trực tiếp hoặc qua `edit`. */
  orders: Map<number, number>;
  /** Số lần gọi /orders của mỗi shop. */
  calls: Map<string, number>;
  /** Chạy trước mỗi lần gọi /orders (n = lần gọi thứ n của shop đó): chỗ để sửa đơn giữa hai trang. */
  before: ((n: number, shopId: string) => void) | null;
  /** Lần gọi /orders thứ n trả HTTP 400 (Pancake lỗi giữa chừng). */
  failAt: number | null;
  edit: (id: number, ms: number) => void;
  /** Giờ sửa đúng như Pancake trả (để so với D1). */
  updatedAt: (id: number) => string;
};

/** Cài Pancake giả: chỉ shop `shopId` có đơn, các đường khác trả danh sách rỗng. */
export function installFakeOrders(shopId = '1'): FakeOrders {
  const fake: FakeOrders = {
    orders: new Map(), calls: new Map(), before: null, failAt: null,
    edit: (id, ms) => { fake.orders.set(id, ms); },
    updatedAt: (id) => pancakeTime(fake.orders.get(id)!),
  };
  const toOrder = (id: number, ms: number): SourceOrder => ({
    id, inserted_at: pancakeTime(Date.parse('2026-10-01T02:00:00Z') + id * 1000), updated_at: pancakeTime(ms),
    status: 0, items: [], status_history: [],
  });
  setPancakeTransport(async (url) => {
    const m = url.pathname.match(/\/shops\/([^/]+)\/orders$/);
    if (!m) return Response.json({ success: true, data: [], total_entries: 0, shops: [] });
    const n = (fake.calls.get(m[1]) ?? 0) + 1;
    fake.calls.set(m[1], n);
    fake.before?.(n, m[1]);
    if (m[1] === shopId && fake.failAt === n) return Response.json({ success: false }, { status: 400 });
    const p = url.searchParams;
    const size = Number(p.get('page_size') ?? 30), page = Number(p.get('page_number') ?? 1);
    const from = p.has('startDateTime') ? Number(p.get('startDateTime')) * 1000 : -Infinity;
    const to = p.has('endDateTime') ? Number(p.get('endDateTime')) * 1000 : Infinity;
    const byUpdate = p.get('updateStatus') === 'updated_at';
    const asc = (p.get('option_sort') ?? '').endsWith('_asc');
    const rows = m[1] !== shopId ? [] : [...fake.orders].map(([id, ms]) => ({ id, ms, key: byUpdate ? ms : Date.parse('2026-10-01T02:00:00Z') + id * 1000 }))
      .filter((r) => r.key >= from && r.key <= to)
      .sort((a, b) => (asc ? a.key - b.key || a.id - b.id : b.key - a.key || b.id - a.id));
    return Response.json({
      success: true, data: rows.slice((page - 1) * size, page * size).map((r) => toOrder(r.id, r.ms)),
      total_entries: rows.length, page_size: size, page_number: page,
    });
  });
  return fake;
}
