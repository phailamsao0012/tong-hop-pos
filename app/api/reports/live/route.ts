import { env } from 'cloudflare:workers';
import { getSessionUser } from '@/lib/auth';
import { POS } from '@/lib/report-model';

type MetricRow = {
  received: number;
  closed: number;
  hot_orders: number;
  current_value: number;
  activity_orders: number;
  activity_current_value: number;
  delivered_orders: number;
  delivered_revenue: number;
  returned_orders: number;
  returned_value: number;
  cancelled_orders: number;
};

type EmployeeRow = MetricRow & { employee_id: string };
type ShopRow = { id: string; shop_id: string | null; last_sync_at: string | null };
type AssignmentSourceRow = { pos_id: string; phone: string; seller_id: string };
type ConfirmationSourceRow = {
  id: string;
  pos_id: string;
  phone: string;
  closer_id: string;
  current_total: number | null;
  first_confirmed_at: string;
};
const datePattern = /^\d{4}-\d{2}-\d{2}$/;
// Mọi giá trị tiền ở đây là doanh thu sau giảm giá/quà tặng (net_total), không dùng tổng hàng chưa trừ.
const numberValue = (value: unknown) => Number(value ?? 0);
const normalizedPhone = (value: string) => {
  const digits = value.replace(/\D/g, '');
  return digits.length === 11 && digits.startsWith('84') ? `0${digits.slice(2)}` : digits;
};

export async function GET(request: Request) {
  if (!(await getSessionUser()))
    return Response.json({ error: 'Đăng nhập để xem báo cáo.' }, { status: 401 });

  const params = new URL(request.url).searchParams;
  const start = params.get('start') ?? '';
  const end = params.get('end') ?? '';
  if (!datePattern.test(start) || !datePattern.test(end) || start > end)
    return Response.json({ error: 'Khoảng ngày báo cáo không hợp lệ.' }, { status: 400 });
  const endDate = new Date(`${end}T00:00:00Z`);
  endDate.setUTCDate(endDate.getUTCDate() + 1);
  const endExclusive = endDate.toISOString().slice(0, 10);

  const requestedPos = (params.get('posIds') ?? '').split(',').filter(Boolean);
  const validPos = new Set(POS.map((pos) => pos.id));
  const posIds = requestedPos.length ? requestedPos : POS.map((pos) => pos.id);
  if (posIds.some((id) => !validPos.has(id as typeof POS[number]['id'])))
    return Response.json({ error: 'Bộ lọc POS không hợp lệ.' }, { status: 400 });

  const employeeIds = (params.get('employeeIds') ?? '').split(',').filter(Boolean);
  if (employeeIds.length > 50 || employeeIds.some((id) => id.length > 100))
    return Response.json({ error: 'Bộ lọc nhân viên không hợp lệ.' }, { status: 400 });

  const includeHours = params.get('includeHours') === '1';
  const includeMonthly = params.get('includeMonthly') === '1';
  const onlyMonthly = params.get('onlyMonthly') === '1';

  const posPlaceholders = posIds.map(() => '?').join(',');
  const employeePlaceholders = employeeIds.map(() => '?').join(',');
  let summaryResult: MetricRow | null = null;
  let employeeResult = { results: [] as EmployeeRow[] };
  let hoursResult = { results: [] as Array<{ hour: string; orders: number }> };
  if (!onlyMonthly) {
    const assignmentResult = await env.DB.prepare(`
      SELECT pos_id,phone,seller_id FROM raw_pos_orders
      WHERE pos_id IN (${posPlaceholders}) AND phone IS NOT NULL AND trim(phone)<>''
        AND seller_id IS NOT NULL AND seller_assigned_at>=? AND seller_assigned_at<?
        ${employeeIds.length ? `AND seller_id IN (${employeePlaceholders})` : ''}
    `).bind(...posIds, start, endExclusive, ...employeeIds).all<AssignmentSourceRow>();
    const confirmationResult = await env.DB.prepare(`
      SELECT id,pos_id,phone,COALESCE(first_confirmed_by,seller_id) AS closer_id,
        COALESCE(net_total,COALESCE(current_total,0)-COALESCE(total_discount,0)) AS current_total,first_confirmed_at FROM raw_pos_orders
      WHERE pos_id IN (${posPlaceholders}) AND phone IS NOT NULL AND trim(phone)<>''
        AND COALESCE(first_confirmed_by,seller_id) IS NOT NULL
        AND first_confirmed_at>=? AND first_confirmed_at<?
        ${employeeIds.length ? `AND COALESCE(first_confirmed_by,seller_id) IN (${employeePlaceholders})` : ''}
    `).bind(...posIds, start, endExclusive, ...employeeIds).all<ConfirmationSourceRow>();

    const assignments = new Map<string, AssignmentSourceRow & { normalized_phone: string }>();
    for (const row of assignmentResult.results) {
      const phone = normalizedPhone(row.phone);
      if (phone) assignments.set(`${row.pos_id}\u001f${phone}\u001f${row.seller_id}`, {
        ...row, normalized_phone: phone,
      });
    }
    const confirmations = confirmationResult.results.map((row) => ({
      ...row, normalized_phone: normalizedPhone(row.phone), current_total: numberValue(row.current_total),
    })).filter((row) => row.normalized_phone);
    const cohort = new Set([...assignments.values()].map((row) =>
      `${row.pos_id}\u001f${row.normalized_phone}`));
    const employeeMetrics = new Map<string, EmployeeRow & { closedPhones: Set<string> }>();
    const metricFor = (id: string) => {
      let metric = employeeMetrics.get(id);
      if (!metric) {
        metric = { employee_id: id, received: 0, closed: 0, hot_orders: 0,
          current_value: 0, activity_orders: 0, activity_current_value: 0,
          delivered_orders: 0, delivered_revenue: 0, returned_orders: 0,
          returned_value: 0, cancelled_orders: 0, closedPhones: new Set() };
        employeeMetrics.set(id, metric);
      }
      return metric;
    };
    for (const assignment of assignments.values()) metricFor(assignment.seller_id).received++;
    const closedPhones = new Set<string>();
    let hotOrders = 0, hotValue = 0, activityValue = 0;
    const hours = new Map<string, number>();
    for (const order of confirmations) {
      const phoneKey = `${order.pos_id}\u001f${order.normalized_phone}`;
      const closer = metricFor(order.closer_id);
      closer.activity_orders++;
      closer.activity_current_value += order.current_total;
      activityValue += order.current_total;
      if (includeHours) {
        const hour = order.first_confirmed_at.slice(11, 13);
        hours.set(hour, (hours.get(hour) ?? 0) + 1);
      }
      if (!cohort.has(phoneKey)) continue;
      closedPhones.add(phoneKey);
      hotOrders++;
      hotValue += order.current_total;
      const assignmentKey = `${phoneKey}\u001f${order.closer_id}`;
      if (assignments.has(assignmentKey)) {
        closer.closedPhones.add(phoneKey);
        closer.hot_orders++;
        closer.current_value += order.current_total;
      }
    }
    for (const metric of employeeMetrics.values()) metric.closed = metric.closedPhones.size;
    employeeResult = { results: [...employeeMetrics.values()]
      .sort((a, b) => b.received - a.received || b.closed - a.closed) };
    hoursResult = { results: [...hours.entries()].sort(([a], [b]) => a.localeCompare(b))
      .map(([hour, orders]) => ({ hour, orders })) };
    summaryResult = {
      received: cohort.size, closed: closedPhones.size, hot_orders: hotOrders,
      current_value: hotValue, activity_orders: confirmations.length,
      activity_current_value: activityValue, delivered_orders: 0, delivered_revenue: 0,
      returned_orders: 0, returned_value: 0, cancelled_orders: 0,
    };
  }
  const monthlyResult = includeMonthly
    ? await env.DB.prepare(`
        SELECT
          sum(CASE WHEN status_code IN (3,16) THEN 1 ELSE 0 END) AS delivered_orders,
          COALESCE(sum(CASE WHEN status_code IN (3,16) THEN COALESCE(net_total,COALESCE(current_total,0)-COALESCE(total_discount,0)) ELSE 0 END),0) AS delivered_revenue,
          sum(CASE WHEN status_code IN (4,5,15) THEN 1 ELSE 0 END) AS returned_orders,
          COALESCE(sum(CASE WHEN status_code IN (4,5,15) THEN COALESCE(net_total,COALESCE(current_total,0)-COALESCE(total_discount,0)) ELSE 0 END),0) AS returned_value,
          sum(CASE WHEN status_code IN (6,7) THEN 1 ELSE 0 END) AS cancelled_orders
        FROM raw_pos_orders
        WHERE pos_id IN (${posPlaceholders}) AND created_at>=? AND created_at<?
          ${employeeIds.length ? `AND COALESCE(first_confirmed_by,seller_id) IN (${employeePlaceholders})` : ''}
      `).bind(...posIds, start, endExclusive, ...employeeIds).first<MetricRow>()
    : null;
  const shops = await env.DB.prepare(`SELECT id,shop_id,last_sync_at FROM pos_shops WHERE id IN (${posPlaceholders})`)
    .bind(...posIds).all<ShopRow>();

  const nameRows = await env.DB.prepare(`SELECT user_id,name FROM pos_users WHERE pos_id IN (${posPlaceholders})`)
    .bind(...posIds).all<{ user_id: string; name: string }>();
  const nameMap = new Map<string, string>();
  for (const row of nameRows.results) if (row.name) nameMap.set(row.user_id, row.name);

  const summary = summaryResult ?? {
    received: 0, closed: 0, hot_orders: 0, current_value: 0,
    activity_orders: 0, activity_current_value: 0,
    delivered_orders: 0, delivered_revenue: 0, returned_orders: 0,
    returned_value: 0, cancelled_orders: 0,
  };
  const monthly = monthlyResult ?? {
    delivered_orders: 0, delivered_revenue: 0, returned_orders: 0,
    returned_value: 0, cancelled_orders: 0,
  };
  return Response.json({
    source: 'pancake_order_assignment_proxy',
    period: { start, end },
    updatedAt: shops.results.map((shop) => shop.last_sync_at).filter(Boolean).sort().at(-1) ?? null,
    summary: {
      received: numberValue(summary.received),
      closed: numberValue(summary.closed),
      rate: numberValue(summary.received)
        ? numberValue(summary.closed) / numberValue(summary.received) * 100 : null,
      hotOrders: numberValue(summary.hot_orders),
      currentConfirmedValue: numberValue(summary.current_value),
      activityOrders: numberValue(summary.activity_orders),
      activityCurrentValue: numberValue(summary.activity_current_value),
    },
    employees: employeeResult.results.map((row) => ({
      id: row.employee_id,
      name: nameMap.get(row.employee_id) ?? `Nhân viên ${row.employee_id.slice(0, 8)}`,
      received: numberValue(row.received),
      closed: numberValue(row.closed),
      rate: numberValue(row.received)
        ? numberValue(row.closed) / numberValue(row.received) * 100 : null,
      hotOrders: numberValue(row.hot_orders),
      currentConfirmedValue: numberValue(row.current_value),
      activityOrders: numberValue(row.activity_orders),
      activityCurrentValue: numberValue(row.activity_current_value),
    })),
    hours: hoursResult.results.map((row) => ({
      hour: /^\d{2}$/.test(row.hour) ? `${row.hour}:00` : '—',
      orders: numberValue(row.orders),
    })),
    monthly: {
      deliveredOrders: numberValue(monthly.delivered_orders),
      deliveredRevenue: numberValue(monthly.delivered_revenue),
      averageDeliveredValue: numberValue(monthly.delivered_orders)
        ? numberValue(monthly.delivered_revenue) / numberValue(monthly.delivered_orders) : null,
      returnedOrders: numberValue(monthly.returned_orders),
      returnedValue: numberValue(monthly.returned_value),
      cancelledOrders: numberValue(monthly.cancelled_orders),
      statusRule: 'Giao thành công: mã 3 hoặc 16; hoàn: 4, 5 hoặc 15; hủy/xóa: 6 hoặc 7',
    },
    coverage: {
      sourceOrders: 0,
      withAssignment: 0,
      withConfirmation: 0,
      assignmentSource: 'Thời điểm giao người bán đang lưu trên đơn Pancake',
      valueSource: 'Tổng hiện tại của đơn; chưa phải ảnh chụp giá trị tại lần xác nhận đầu tiên',
    },
  }, { headers: { 'Cache-Control': 'private, no-store' } });
}
