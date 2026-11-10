import { forbidden, getSessionUser } from '@/lib/auth/auth';
import { isOwner } from '@/lib/auth/access';
import {
  POS,
  type Assignment,
  type Customer,
  type Order,
} from '@/lib/shared/report-model';
import { importRecords } from '@/lib/ops/import-data';

const validPos = new Set<string>(POS.map((p) => p.id));
const dateLike = (v: unknown) =>
  typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(v);
const amount = (v: unknown) =>
  typeof v === 'number' && Number.isFinite(v) && v >= 0;

// Receives already normalized records from an authorized POS adapter. It never infers
// historical assignment or first-confirmation timestamps from current status/notes.
export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) return Response.json({ error: 'Không có quyền đồng bộ.' }, { status: 401 });
  if (!isOwner(user)) return forbidden(); // chặn cả ở đây, không chỉ dựa vào worker (Đợt 0, K1)
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
  const now = await importRecords(posId, body, assignments, orders, customers);
  return Response.json({
    ok: true,
    posId,
    records: assignments.length + orders.length + customers.length,
    updatedAt: now,
  });
}
