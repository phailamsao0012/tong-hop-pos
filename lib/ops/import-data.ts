// Tách khỏi app/api/import/route.ts (cải tổ B5, 05/11/2026): chỉ dời chỗ, câu SQL giữ nguyên.
import { env } from 'cloudflare:workers';
import { POS, customerKey, type Assignment, type Customer, type Order } from '@/lib/shared/report-model';

const key = (posId: string, id: string) => `${posId}:${id}`;

/** Ghi bản ghi đã chuẩn hoá của một POS (khách, lịch sử phân công, đơn) và đánh dấu POS đã nối; trả giờ ghi. */
export async function importRecords(posId: string, body: { shopId?: string; historyStart?: string }, assignments: Assignment[], orders: Order[], customers: Customer[]) {
  const db = env.DB,
    now = new Date().toISOString(),
    statements: D1PreparedStatement[] = [];
  for (const c of customers)
    statements.push(
      db
        .prepare(
          'INSERT INTO customers (key,pos_id,phone,name,note) VALUES (?,?,?,?,?) ON CONFLICT(key) DO UPDATE SET name=excluded.name,note=excluded.note',
        )
        .bind(
          customerKey(posId, c.phone),
          posId,
          c.phone,
          c.name ?? '',
          c.note ?? '',
        ),
    );
  for (const a of assignments)
    statements.push(
      db
        .prepare(
          'INSERT INTO assignments (id,pos_id,phone,employee_id,assigned_at,batch_id) VALUES (?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET phone=excluded.phone,employee_id=excluded.employee_id,assigned_at=excluded.assigned_at,batch_id=excluded.batch_id',
        )
        .bind(
          key(posId, a.id),
          posId,
          a.phone,
          a.employeeId,
          a.assignedAt,
          a.batchId,
        ),
    );
  for (const o of orders)
    statements.push(
      db
        .prepare(
          'INSERT INTO orders (id,pos_id,phone,closer_id,created_at,confirmed_at,delivered_at,status,hot_value,current_value,net_merchandise,return_value,items_json) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET phone=excluded.phone,closer_id=CASE WHEN orders.confirmed_at IS NOT NULL THEN orders.closer_id ELSE excluded.closer_id END,created_at=excluded.created_at,confirmed_at=COALESCE(orders.confirmed_at,excluded.confirmed_at),delivered_at=excluded.delivered_at,status=excluded.status,hot_value=CASE WHEN orders.confirmed_at IS NOT NULL THEN orders.hot_value ELSE excluded.hot_value END,current_value=excluded.current_value,net_merchandise=excluded.net_merchandise,return_value=excluded.return_value,items_json=excluded.items_json',
        )
        .bind(
          key(posId, o.id),
          posId,
          o.phone,
          o.closerId,
          o.createdAt,
          o.confirmedAt,
          o.deliveredAt,
          o.status,
          o.hotValue,
          o.currentValue,
          o.netMerchandise,
          o.returnValue,
          JSON.stringify(o.items),
        ),
    );
  statements.push(
    db
      .prepare(
        'INSERT INTO pos_shops (id,name,shop_id,status,last_sync_at,history_start) VALUES (?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET shop_id=COALESCE(excluded.shop_id,pos_shops.shop_id),status=excluded.status,last_sync_at=excluded.last_sync_at,history_start=COALESCE(excluded.history_start,pos_shops.history_start),last_error=NULL',
      )
      .bind(
        posId,
        POS.find((p) => p.id === posId)!.name,
        body.shopId ?? null,
        'connected',
        now,
        body.historyStart ?? null,
      ),
  );
  for (let i = 0; i < statements.length; i += 75)
    await db.batch(statements.slice(i, i + 75));
  return now;
}
