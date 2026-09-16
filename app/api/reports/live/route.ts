import { env } from 'cloudflare:workers';
import { getChatGPTUser } from '@/app/chatgpt-auth';
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
type PancakeUsers = {
  success?: boolean;
  data?: Array<{ user_id?: string; user?: { id?: string; name?: string } }>;
};

const userCache = new Map<string, { expiresAt: number; names: Map<string, string> }>();

async function employeeNames(shopId: string, apiKey: string) {
  const cached = userCache.get(shopId);
  if (cached && cached.expiresAt > Date.now()) return cached.names;
  const url = new URL(`https://pos.pages.fm/api/v1/shops/${shopId}/users`);
  url.searchParams.set('api_key', apiKey);
  const response = await fetch(url, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(12000),
    cache: 'no-store',
  });
  if (!response.ok) throw new Error('users_unavailable');
  const result = await response.json() as PancakeUsers;
  if (!result.success || !Array.isArray(result.data)) throw new Error('users_invalid');
  const names = new Map<string, string>();
  for (const row of result.data) {
    const id = row.user_id ?? row.user?.id;
    const name = row.user?.name?.trim();
    if (id && name) names.set(id, name);
  }
  userCache.set(shopId, { expiresAt: Date.now() + 10 * 60000, names });
  return names;
}

const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const numberValue = (value: unknown) => Number(value ?? 0);

export async function GET(request: Request) {
  if (!(await getChatGPTUser()))
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
  const employeeAssignmentFilter = employeeIds.length
    ? ` AND seller_id IN (${employeePlaceholders})` : '';
  const employeeConfirmationFilter = employeeIds.length
    ? ` AND COALESCE(first_confirmed_by,seller_id) IN (${employeePlaceholders})` : '';
  const phoneDigits = "replace(replace(replace(replace(replace(replace(phone,' ',''),'.',''),'-',''),'(',''),')',''),'+','')";
  const phoneExpression = `CASE WHEN length(${phoneDigits})=11 AND substr(${phoneDigits},1,2)='84' THEN '0'||substr(${phoneDigits},3) ELSE ${phoneDigits} END`;
  const ctes = `
    WITH assignments AS (
      SELECT DISTINCT pos_id,${phoneExpression} AS phone,seller_id AS employee_id
      FROM raw_pos_orders
      WHERE pos_id IN (${posPlaceholders}) AND phone IS NOT NULL AND trim(phone)<>''
        AND seller_id IS NOT NULL AND seller_assigned_at IS NOT NULL
        AND seller_assigned_at>=? AND seller_assigned_at<?${employeeAssignmentFilter}
    ), cohort AS (
      SELECT DISTINCT pos_id,phone FROM assignments
    ), confirmed AS (
      SELECT id,pos_id,${phoneExpression} AS phone,
        COALESCE(first_confirmed_by,seller_id) AS closer_id,
        COALESCE(current_total,0) AS current_total,first_confirmed_at
      FROM raw_pos_orders
      WHERE pos_id IN (${posPlaceholders}) AND phone IS NOT NULL AND trim(phone)<>''
        AND COALESCE(first_confirmed_by,seller_id) IS NOT NULL AND first_confirmed_at IS NOT NULL
        AND first_confirmed_at>=? AND first_confirmed_at<?${employeeConfirmationFilter}
    )`;
  const reportBindings = [
    ...posIds, start, endExclusive, ...employeeIds,
    ...posIds, start, endExclusive, ...employeeIds,
  ];

  const summarySql = `${ctes}
    SELECT
      (SELECT count(*) FROM cohort) AS received,
      (SELECT count(DISTINCT c.pos_id||char(31)||c.phone)
        FROM cohort c JOIN confirmed o ON o.pos_id=c.pos_id AND o.phone=c.phone) AS closed,
      (SELECT count(*) FROM cohort c
        JOIN confirmed o ON o.pos_id=c.pos_id AND o.phone=c.phone) AS hot_orders,
      (SELECT COALESCE(sum(o.current_total),0) FROM cohort c
        JOIN confirmed o ON o.pos_id=c.pos_id AND o.phone=c.phone) AS current_value,
      (SELECT count(*) FROM confirmed) AS activity_orders,
      (SELECT COALESCE(sum(current_total),0) FROM confirmed) AS activity_current_value`;

  const employeeSql = `${ctes},
    assignment_metrics AS (
      SELECT a.employee_id,
        count(DISTINCT a.pos_id||char(31)||a.phone) AS received,
        count(DISTINCT CASE WHEN o.closer_id=a.employee_id
          THEN a.pos_id||char(31)||a.phone END) AS closed,
        sum(CASE WHEN o.closer_id=a.employee_id THEN 1 ELSE 0 END) AS hot_orders,
        COALESCE(sum(CASE WHEN o.closer_id=a.employee_id THEN o.current_total ELSE 0 END),0) AS current_value
      FROM assignments a
      LEFT JOIN confirmed o ON o.pos_id=a.pos_id AND o.phone=a.phone
      GROUP BY a.employee_id
    ), activity_metrics AS (
      SELECT closer_id AS employee_id,count(*) AS activity_orders,
        COALESCE(sum(current_total),0) AS activity_current_value
      FROM confirmed GROUP BY closer_id
    ), employee_ids AS (
      SELECT employee_id FROM assignment_metrics
      UNION SELECT employee_id FROM activity_metrics
    )
    SELECT e.employee_id,
      COALESCE(a.received,0) AS received,COALESCE(a.closed,0) AS closed,
      COALESCE(a.hot_orders,0) AS hot_orders,COALESCE(a.current_value,0) AS current_value,
      COALESCE(m.activity_orders,0) AS activity_orders,
      COALESCE(m.activity_current_value,0) AS activity_current_value
    FROM employee_ids e
    LEFT JOIN assignment_metrics a ON a.employee_id=e.employee_id
    LEFT JOIN activity_metrics m ON m.employee_id=e.employee_id
    ORDER BY received DESC,closed DESC`;

  const hoursSql = `${ctes}
    SELECT substr(first_confirmed_at,12,2) AS hour, count(*) AS orders
    FROM confirmed GROUP BY hour ORDER BY hour`;

  const summaryResult = onlyMonthly
    ? null
    : await env.DB.prepare(summarySql).bind(...reportBindings).first<MetricRow>();
  const employeeResult = onlyMonthly
    ? { results: [] as EmployeeRow[] }
    : await env.DB.prepare(employeeSql).bind(...reportBindings).all<EmployeeRow>();
  const hoursResult = includeHours && !onlyMonthly
    ? await env.DB.prepare(hoursSql).bind(...reportBindings).all<{ hour: string; orders: number }>()
    : { results: [] as Array<{ hour: string; orders: number }> };
  const monthlyResult = includeMonthly
    ? await env.DB.prepare(`
        SELECT
          sum(CASE WHEN status_code IN (3,16) THEN 1 ELSE 0 END) AS delivered_orders,
          COALESCE(sum(CASE WHEN status_code IN (3,16) THEN current_total ELSE 0 END),0) AS delivered_revenue,
          sum(CASE WHEN status_code IN (4,5,15) THEN 1 ELSE 0 END) AS returned_orders,
          COALESCE(sum(CASE WHEN status_code IN (4,5,15) THEN current_total ELSE 0 END),0) AS returned_value,
          sum(CASE WHEN status_code IN (6,7) THEN 1 ELSE 0 END) AS cancelled_orders
        FROM raw_pos_orders
        WHERE pos_id IN (${posPlaceholders}) AND created_at>=? AND created_at<?
          ${employeeIds.length ? `AND COALESCE(first_confirmed_by,seller_id) IN (${employeePlaceholders})` : ''}
      `).bind(...posIds, start, endExclusive, ...employeeIds).first<MetricRow>()
    : null;
  const shops = await env.DB.prepare(`SELECT id,shop_id,last_sync_at FROM pos_shops WHERE id IN (${posPlaceholders})`)
    .bind(...posIds).all<ShopRow>();

  const nameMap = new Map<string, string>();
  const apiKey = env.PANCAKE_POS_API_KEY?.trim();
  if (apiKey) {
    const userResults = await Promise.allSettled(
      shops.results.filter((shop) => shop.shop_id).map((shop) =>
        employeeNames(shop.shop_id!, apiKey)),
    );
    for (const result of userResults)
      if (result.status === 'fulfilled')
        for (const [id, name] of result.value) nameMap.set(id, name);
  }

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
