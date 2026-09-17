import { env } from 'cloudflare:workers';
import { getSessionUser } from '@/lib/auth';
import {
  customerKey,
  type Assignment,
  type Customer,
  type Dataset,
  type Order,
} from '@/lib/report-model';

export async function GET() {
  if (!(await getSessionUser()))
    return Response.json(
      { error: 'Đăng nhập để xem dữ liệu.' },
      { status: 401 },
    );
  const db = env.DB;
  const [assignmentRows, orderRows, customerRows, shops, coverage] =
    await Promise.all([
      db
        .prepare(
          'SELECT * FROM assignments ORDER BY assigned_at DESC LIMIT 5001',
        )
        .all<Record<string, unknown>>(),
      db
        .prepare('SELECT * FROM orders ORDER BY created_at DESC LIMIT 5001')
        .all<Record<string, unknown>>(),
      db
        .prepare('SELECT * FROM customers LIMIT 5001')
        .all<Record<string, unknown>>(),
      db
        .prepare(
          'SELECT last_sync_at, history_start FROM pos_shops WHERE last_sync_at IS NOT NULL ORDER BY last_sync_at DESC LIMIT 1',
        )
        .first<{ last_sync_at: string; history_start: string | null }>(),
      db
        .prepare(
          'SELECT COUNT(*) AS connected_pos, MIN(last_sync_at) AS oldest_sync_at, MAX(history_start) AS latest_history_start, SUM(CASE WHEN history_start IS NULL THEN 1 ELSE 0 END) AS missing_history_start FROM pos_shops WHERE status=?',
        )
        .bind('connected')
        .first<{
          connected_pos: number;
          oldest_sync_at: string | null;
          latest_history_start: string | null;
          missing_history_start: number;
        }>(),
    ]);
  if (!assignmentRows.results.length && !orderRows.results.length)
    return Response.json({ mode: 'empty' }, { headers: { 'Cache-Control': 'no-store' } });
  if (
    [assignmentRows, orderRows, customerRows].some(
      (r) => r.results.length > 5000,
    )
  )
    return Response.json(
      {
        error:
          'Dữ liệu POS vượt giới hạn bản báo cáo thử. Cần mở rộng bộ tính trên máy chủ trước khi dùng số liệu chính thức.',
      },
      { status: 422 },
    );
  const assignments: Assignment[] = assignmentRows.results.map((r) => ({
    id: String(r.id),
    posId: String(r.pos_id),
    phone: String(r.phone),
    employeeId: String(r.employee_id),
    assignedAt: String(r.assigned_at),
    batchId: String(r.batch_id),
  }));
  const orders: Order[] = orderRows.results.map((r) => ({
    id: String(r.id),
    posId: String(r.pos_id),
    phone: String(r.phone),
    closerId: String(r.closer_id),
    createdAt: String(r.created_at),
    confirmedAt: r.confirmed_at ? String(r.confirmed_at) : null,
    deliveredAt: r.delivered_at ? String(r.delivered_at) : null,
    status: String(r.status) as Order['status'],
    hotValue: Number(r.hot_value),
    currentValue: Number(r.current_value),
    netMerchandise: Number(r.net_merchandise),
    returnValue: Number(r.return_value),
    items: JSON.parse(String(r.items_json)),
  }));
  const customers: Customer[] = customerRows.results.map((r) => ({
    posId: String(r.pos_id),
    phone: String(r.phone),
    name: String(r.name),
    note: String(r.note),
  }));
  const existing = new Set(customers.map((c) => customerKey(c.posId, c.phone)));
  for (const o of orders) {
    const key = customerKey(o.posId, o.phone);
    if (!existing.has(key)) {
      customers.push({
        posId: o.posId,
        phone: o.phone,
        name: 'Khách chưa có tên',
        note: '',
      });
      existing.add(key);
    }
  }
  const twoYearsAgo = new Date();
  twoYearsAgo.setUTCFullYear(twoYearsAgo.getUTCFullYear() - 2);
  const data: Dataset = {
    assignments,
    orders,
    customers,
    updatedAt: shops?.last_sync_at ?? null,
    historyStart: shops?.history_start ?? null,
    mode: 'live',
    quality: {
      missingConfirmed: orders.filter(
        (o) =>
          ['confirmed', 'delivered', 'returned'].includes(o.status) &&
          !o.confirmedAt,
      ).length,
      limitedHistory:
        Number(coverage?.missing_history_start ?? 0) > 0 ||
        !coverage?.latest_history_start ||
        coverage.latest_history_start > twoYearsAgo.toISOString().slice(0, 10),
      connectedPos: Number(coverage?.connected_pos ?? 0),
      oldestSyncAt: coverage?.oldest_sync_at ?? null,
    },
  };
  return Response.json(data, { headers: { 'Cache-Control': 'no-store' } });
}
