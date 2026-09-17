import { env } from 'cloudflare:workers';
import { getSessionUser } from '@/lib/auth';
import {
  POS,
  customerKey,
  type Assignment,
  type Customer,
  type Order,
} from '@/lib/report-model';

const validPos = new Set<string>(POS.map((p) => p.id));
const dateLike = (v: unknown) =>
  typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(v);
const amount = (v: unknown) =>
  typeof v === 'number' && Number.isFinite(v) && v >= 0;
const key = (posId: string, id: string) => `${posId}:${id}`;

// Receives already normalized records from an authorized POS adapter. It never infers
// historical assignment or first-confirmation timestamps from current status/notes.
export async function POST(request: Request) {
  if (!(await getSessionUser()))
    return Response.json({ error: 'Không có quyền đồng bộ.' }, { status: 401 });
  if (Number(request.headers.get('content-length') ?? 0) > 1_000_000)
    return Response.json({ error: 'Tệp quá lớn.' }, { status: 413 });
  let body: {
    posId?: string;
    shopId?: string;
    historyStart?: string;
    assignments?: Assignment[];
    orders?: Order[];
    customers?: Customer[];
  };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'JSON không hợp lệ.' }, { status: 400 });
  }
  const posId = body.posId;
  if (!posId || !validPos.has(posId))
    return Response.json(
      { error: 'POS ngoài phạm vi 6 cửa hàng.' },
      { status: 400 },
    );
  const assignments = body.assignments ?? [],
    orders = body.orders ?? [],
    customers = body.customers ?? [];
  if (
    !Array.isArray(assignments) ||
    !Array.isArray(orders) ||
    !Array.isArray(customers) ||
    assignments.length + orders.length + customers.length > 500
  )
    return Response.json(
      { error: 'Tối đa 500 bản ghi mỗi lần.' },
      { status: 400 },
    );
  if (
    assignments.some(
      (a) =>
        a.posId !== posId ||
        !a.id ||
        !a.phone ||
        !a.employeeId ||
        !a.batchId ||
        !dateLike(a.assignedAt),
    )
  )
    return Response.json(
      { error: 'Thiếu lịch sử phân công chính xác.' },
      { status: 400 },
    );
  if (
    orders.some(
      (o) =>
        o.posId !== posId ||
        !o.id ||
        !o.phone ||
        !o.closerId ||
        !dateLike(o.createdAt) ||
        (o.confirmedAt !== null && !dateLike(o.confirmedAt)) ||
        (o.deliveredAt !== null && !dateLike(o.deliveredAt)) ||
        !['confirmed', 'delivered', 'returned', 'cancelled'].includes(
          o.status,
        ) ||
        ![o.hotValue, o.currentValue, o.netMerchandise, o.returnValue].every(
          amount,
        ) ||
        !Array.isArray(o.items),
    )
  )
    return Response.json(
      { error: 'Đơn thiếu trường hoặc giá trị không hợp lệ.' },
      { status: 400 },
    );
  if (customers.some((c) => c.posId !== posId || !c.phone))
    return Response.json(
      { error: 'Khách hàng không hợp lệ.' },
      { status: 400 },
    );
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
  return Response.json({
    ok: true,
    posId,
    records: assignments.length + orders.length + customers.length,
    updatedAt: now,
  });
}
