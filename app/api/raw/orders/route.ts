import { env } from 'cloudflare:workers';
import { getSessionUser } from '@/lib/auth';
import { POS } from '@/lib/report-model';

type RawOrder = {
  source_order_id: string;
  phone: string | null;
  created_at: string | null;
  updated_at: string | null;
  status_code: number | null;
  seller_id: string | null;
  seller_assigned_at: string | null;
  current_total: number | null;
  first_confirmed_at: string | null;
};

export async function GET(request: Request) {
  if (!(await getSessionUser()))
    return Response.json({ error: 'Đăng nhập để xem đơn nguồn.' }, { status: 401 });

  const params = new URL(request.url).searchParams;
  const posId = params.get('posId') ?? '';
  if (!POS.some((pos) => pos.id === posId))
    return Response.json({ error: 'Chọn một POS hợp lệ.' }, { status: 400 });

  const page = Number(params.get('page') ?? '1');
  if (!Number.isInteger(page) || page < 1 || page > 1000)
    return Response.json({ error: 'Trang không hợp lệ.' }, { status: 400 });

  const start = params.get('start') ?? '';
  const end = params.get('end') ?? '';
  if ((start && !/^\d{4}-\d{2}-\d{2}$/.test(start)) ||
      (end && !/^\d{4}-\d{2}-\d{2}$/.test(end)) ||
      (start && end && start > end))
    return Response.json({ error: 'Khoảng ngày không hợp lệ.' }, { status: 400 });

  let query = 'SELECT source_order_id,phone,created_at,updated_at,status_code,seller_id,seller_assigned_at,current_total,first_confirmed_at FROM raw_pos_orders WHERE pos_id=?';
  const bindings: (string | number)[] = [posId];
  if (start) { query += ' AND created_at>=?'; bindings.push(start); }
  if (end) { query += ' AND created_at<?'; bindings.push(`${end}T23:59:59.999999Z`); }
  query += ' ORDER BY created_at DESC,id DESC LIMIT 51 OFFSET ?';
  bindings.push((page - 1) * 50);

  const result = await env.DB.prepare(query).bind(...bindings).all<RawOrder>();
  return Response.json({
    posId, page, hasMore: result.results.length > 50,
    orders: result.results.slice(0, 50).map((order) => ({
      orderId: order.source_order_id,
      phone: order.phone,
      createdAt: order.created_at,
      updatedAt: order.updated_at,
      statusCode: order.status_code,
      sellerId: order.seller_id,
      sellerAssignedAt: order.seller_assigned_at,
      currentTotal: order.current_total,
      firstConfirmedAt: order.first_confirmed_at,
    })),
    note: 'Đây là trạng thái và tổng tiền hiện tại của đơn nguồn, chưa phải chỉ số chốt nóng.',
  }, { headers: { 'Cache-Control': 'no-store' } });
}
