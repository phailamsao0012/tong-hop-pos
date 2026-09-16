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
type ShopRow = { id: string; shop_id: string | null };
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

  const posPlaceholders = posIds.map(() => '?').join(',');
  const employeePlaceholders = employeeIds.map(() => '?').join(',');
  const employeeAssignmentFilter = employeeIds.length
    ? ` AND seller_id IN (${employeePlaceholders})` : '';
  const employeeConfirmationFilter = employeeIds.length
    ? ` AND COALESCE(first_confirmed_by,seller_id) IN (${employeePlaceholders})` : '';
  const phoneExpression = "CASE WHEN length(phone_digits)=11 AND substr(phone_digits,1,2)='84' THEN '0'||substr(phone_digits,3) ELSE phone_digits END";
  const ctes = `
    WITH source AS (
      SELECT id,pos_id,created_at,status_code,seller_id,seller_assigned_at,first_confirmed_at,
        COALESCE(first_confirmed_by,seller_id) AS closer_id,
        COALESCE(current_total,0) AS current_total,
        replace(replace(replace(replace(replace(replace(phone,' ',''),'.',''),'-',''),'(',''),')',''),'+','') AS phone_digits
      FROM raw_pos_orders
      WHERE pos_id IN (${posPlaceholders}) AND phone IS NOT NULL AND trim(phone)<>''
    ), normalized AS (
      SELECT id,pos_id,created_at,status_code,seller_id,seller_assigned_at,first_confirmed_at,closer_id,current_total,
        ${phoneExpression} AS phone
      FROM source
      WHERE phone_digits<>''
    ), assignments AS (
      SELECT DISTINCT pos_id,phone,seller_id AS employee_id
      FROM normalized
      WHERE seller_id IS NOT NULL AND seller_assigned_at IS NOT NULL
        AND seller_assigned_at>=? AND seller_assigned_at<?${employeeAssignmentFilter}
    ), cohort AS (
      SELECT DISTINCT pos_id,phone FROM assignments
    ), confirmed AS (
      SELECT id,pos_id,phone,closer_id,current_total,first_confirmed_at
      FROM normalized
      WHERE closer_id IS NOT NULL AND first_confirmed_at IS NOT NULL
        AND first_confirmed_at>=? AND first_confirmed_at<?${employeeConfirmationFilter}
    ), monthly_orders AS (
      SELECT id,pos_id,phone,closer_id,current_total,status_code
      FROM normalized
      WHERE created_at IS NOT NULL AND created_at>=? AND created_at<?
        ${employeeIds.length ? `AND closer_id IN (${employeePlaceholders})` : ''}
    )`;
  const bindings = [
    ...posIds, start, endExclusive, ...employeeIds,
    start, endExclusive, ...employeeIds,
    start, endExclusive, ...employeeIds,
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
      (SELECT COALESCE(sum(current_total),0) FROM confirmed) AS activity_current_value,
      (SELECT count(*) FROM monthly_orders WHERE status_code IN (3,16)) AS delivered_orders,
      (SELECT COALESCE(sum(current_total),0) FROM monthly_orders WHERE status_code IN (3,16)) AS delivered_revenue,
      (SELECT count(*) FROM monthly_orders WHERE status_code IN (4,5,15)) AS returned_orders,
      (SELECT COALESCE(sum(current_total),0) FROM monthly_orders WHERE status_code IN (4,5,15)) AS returned_value,
      (SELECT count(*) FROM monthly_orders WHERE status_code IN (6,7)) AS cancelled_orders`;

  const employeeSql = `${ctes},
    employee_ids AS (
      SELECT employee_id FROM assignments
      UNION SELECT closer_id FROM confirmed
    )
    SELECT e.employee_id,
      (SELECT count(*) FROM assignments a WHERE a.employee_id=e.employee_id) AS received,
      (SELECT count(DISTINCT a.pos_id||char(31)||a.phone)
        FROM assignments a JOIN confirmed o ON o.pos_id=a.pos_id AND o.phone=a.phone
        WHERE a.employee_id=e.employee_id AND o.closer_id=e.employee_id) AS closed,
      (SELECT count(*) FROM assignments a JOIN confirmed o ON o.pos_id=a.pos_id AND o.phone=a.phone
        WHERE a.employee_id=e.employee_id AND o.closer_id=e.employee_id) AS hot_orders,
      (SELECT COALESCE(sum(o.current_total),0) FROM assignments a
        JOIN confirmed o ON o.pos_id=a.pos_id AND o.phone=a.phone
        WHERE a.employee_id=e.employee_id AND o.closer_id=e.employee_id) AS current_value,
      (SELECT count(*) FROM confirmed o WHERE o.closer_id=e.employee_id) AS activity_orders,
      (SELECT COALESCE(sum(o.current_total),0) FROM confirmed o
        WHERE o.closer_id=e.employee_id) AS activity_current_value
    FROM employee_ids e ORDER BY received DESC, closed DESC`;

  const hoursSql = `${ctes}
    SELECT substr(first_confirmed_at,12,2) AS hour, count(*) AS orders
    FROM confirmed GROUP BY hour ORDER BY hour`;

  const [summaryResult, employeeResult, hoursResult, freshness, shops] = await Promise.all([
    env.DB.prepare(summarySql).bind(...bindings).first<MetricRow>(),
    env.DB.prepare(employeeSql).bind(...bindings).all<EmployeeRow>(),
    env.DB.prepare(hoursSql).bind(...bindings).all<{ hour: string; orders: number }>(),
    env.DB.prepare(`SELECT max(fetched_at) AS updated_at,
      sum(CASE WHEN seller_assigned_at IS NOT NULL THEN 1 ELSE 0 END) AS with_assignment,
      sum(CASE WHEN first_confirmed_at IS NOT NULL THEN 1 ELSE 0 END) AS with_confirmation,
      count(*) AS source_orders FROM raw_pos_orders WHERE pos_id IN (${posPlaceholders})`)
      .bind(...posIds).first<{ updated_at: string | null; with_assignment: number; with_confirmation: number; source_orders: number }>(),
    env.DB.prepare(`SELECT id,shop_id FROM pos_shops WHERE id IN (${posPlaceholders})`)
      .bind(...posIds).all<ShopRow>(),
  ]);

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
  return Response.json({
    source: 'pancake_order_assignment_proxy',
    period: { start, end },
    updatedAt: freshness?.updated_at ?? null,
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
      deliveredOrders: numberValue(summary.delivered_orders),
      deliveredRevenue: numberValue(summary.delivered_revenue),
      averageDeliveredValue: numberValue(summary.delivered_orders)
        ? numberValue(summary.delivered_revenue) / numberValue(summary.delivered_orders) : null,
      returnedOrders: numberValue(summary.returned_orders),
      returnedValue: numberValue(summary.returned_value),
      cancelledOrders: numberValue(summary.cancelled_orders),
      statusRule: 'Giao thành công: mã 3 hoặc 16; hoàn: 4, 5 hoặc 15; hủy/xóa: 6 hoặc 7',
    },
    coverage: {
      sourceOrders: numberValue(freshness?.source_orders),
      withAssignment: numberValue(freshness?.with_assignment),
      withConfirmation: numberValue(freshness?.with_confirmation),
      assignmentSource: 'Thời điểm giao người bán đang lưu trên đơn Pancake',
      valueSource: 'Tổng hiện tại của đơn; chưa phải ảnh chụp giá trị tại lần xác nhận đầu tiên',
    },
  }, { headers: { 'Cache-Control': 'private, no-store' } });
}
