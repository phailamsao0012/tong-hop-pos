import {
  EMPLOYEES,
  POS,
  PRODUCTS,
  customerKey,
  inRange,
  type Assignment,
  type Customer,
  type Dataset,
  type Filters,
  type Order,
} from './report-model';

export type ScopeResult = {
  assignments: Assignment[];
  cohortPhones: string[];
  closedPhones: string[];
  cohortOrders: Order[];
  activityOrders: Order[];
  activityPhones: string[];
  deliveredOrders: Order[];
  returnedOrders: Order[];
  cancelledOrders: Order[];
  received: number;
  closed: number;
  rate: number | null;
  hotOrders: number;
  hotValue: number;
  activityHotOrders: number;
  activityHotValue: number;
  deliveredRevenue: number;
  deliveredCount: number;
  avgOrder: number | null;
  repeatCustomers: number;
  repeatOrders: number;
  repeatRevenue: number;
  managedCustomers: number;
};

const hasProduct = (order: Order, filters: Filters) =>
  filters.productIds.length === 0 ||
  order.items.some((item) => filters.productIds.includes(item.productId));
const allowed = (id: string, selected: string[]) =>
  selected.length === 0 || selected.includes(id);
export function reportScope(data: Dataset, filters: Filters): ScopeResult {
  const assignments = data.assignments.filter(
    (a) =>
      inRange(a.assignedAt, filters.start, filters.end) &&
      allowed(a.posId, filters.posIds) &&
      allowed(a.employeeId, filters.employeeIds),
  );
  const cohortPhones = [
    ...new Set(assignments.map((a) => customerKey(a.posId, a.phone))),
  ];
  const cohortSet = new Set(cohortPhones);
  const relevantOrders = data.orders.filter(
    (o) =>
      allowed(o.posId, filters.posIds) &&
      allowed(o.closerId, filters.employeeIds) &&
      hasProduct(o, filters),
  );
  const activityOrders = relevantOrders.filter((o) =>
    inRange(o.confirmedAt, filters.start, filters.end),
  );
  const cohortOrders = activityOrders.filter((o) =>
    cohortSet.has(customerKey(o.posId, o.phone)),
  );
  const closedPhones = [
    ...new Set(cohortOrders.map((o) => customerKey(o.posId, o.phone))),
  ];
  const activityPhones = [
    ...new Set(activityOrders.map((o) => customerKey(o.posId, o.phone))),
  ];
  const deliveredOrders = relevantOrders.filter(
    (o) =>
      o.status === 'delivered' &&
      inRange(o.createdAt, filters.start, filters.end),
  );
  const returnedOrders = relevantOrders.filter(
    (o) =>
      o.status === 'returned' &&
      inRange(o.createdAt, filters.start, filters.end),
  );
  const cancelledOrders = relevantOrders.filter(
    (o) =>
      o.status === 'cancelled' &&
      inRange(o.createdAt, filters.start, filters.end),
  );
  const successfulHistory = data.orders
    .filter((o) => o.status === 'delivered')
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const purchaseOrdinal = new Map<string, number>();
  const repeats = new Set<string>();
  let repeatOrders = 0,
    repeatRevenue = 0;
  successfulHistory.forEach((o) => {
    const key = customerKey(o.posId, o.phone),
      ordinal = (purchaseOrdinal.get(key) ?? 0) + 1;
    purchaseOrdinal.set(key, ordinal);
    if (
      ordinal >= 2 &&
      deliveredOrders.some((selected) => selected.id === o.id)
    ) {
      repeats.add(key);
      repeatOrders++;
      repeatRevenue += o.netMerchandise;
    }
  });
  const deliveredRevenue = deliveredOrders.reduce(
    (n, o) => n + o.netMerchandise,
    0,
  );
  const latest = new Map<string, Assignment>();
  data.assignments.forEach((a) => {
    const key = customerKey(a.posId, a.phone);
    if (!latest.has(key) || latest.get(key)!.assignedAt < a.assignedAt)
      latest.set(key, a);
  });
  const managedCustomers = [...latest.values()].filter(
    (a) =>
      allowed(a.posId, filters.posIds) &&
      allowed(a.employeeId, filters.employeeIds),
  ).length;
  return {
    assignments,
    cohortPhones,
    closedPhones,
    cohortOrders,
    activityOrders,
    activityPhones,
    deliveredOrders,
    returnedOrders,
    cancelledOrders,
    received: cohortPhones.length,
    closed: closedPhones.length,
    rate: cohortPhones.length
      ? (closedPhones.length / cohortPhones.length) * 100
      : null,
    hotOrders: cohortOrders.length,
    hotValue: cohortOrders.reduce((n, o) => n + o.hotValue, 0),
    activityHotOrders: activityOrders.length,
    activityHotValue: activityOrders.reduce((n, o) => n + o.hotValue, 0),
    deliveredRevenue,
    deliveredCount: deliveredOrders.length,
    avgOrder: deliveredOrders.length
      ? deliveredRevenue / deliveredOrders.length
      : null,
    repeatCustomers: repeats.size,
    repeatOrders,
    repeatRevenue,
    managedCustomers,
  };
}

export function employeeOptions(data: Dataset) {
  const ids = new Set<string>();
  data.assignments.forEach((assignment) => ids.add(assignment.employeeId));
  data.orders.forEach((order) => ids.add(order.closerId));
  if (data.mode === 'demo') EMPLOYEES.forEach((employee) => ids.add(employee.id));
  return [...ids].sort((a, b) => employeeName(a).localeCompare(employeeName(b), 'vi'))
    .map((id) => ({ id, name: employeeName(id) }));
}

export function employeeComparison(data: Dataset, filters: Filters) {
  return employeeOptions(data).filter((e) => allowed(e.id, filters.employeeIds)).map(
    (e) => ({
      ...e,
      scope: reportScope(data, { ...filters, employeeIds: [e.id] }),
    }),
  );
}

export function customerProfiles(
  data: Dataset,
  filters: Filters,
  asOf: string,
) {
  const latestAssignment = new Map<string, Assignment>();
  data.assignments.forEach((a) => {
    const key = customerKey(a.posId, a.phone);
    if (
      !latestAssignment.has(key) ||
      latestAssignment.get(key)!.assignedAt < a.assignedAt
    )
      latestAssignment.set(key, a);
  });
  const delivered = data.orders
    .filter((o) => o.status === 'delivered')
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  return data.customers
    .filter((c) => allowed(c.posId, filters.posIds))
    .map((c: Customer) => {
      const key = customerKey(c.posId, c.phone),
        purchases = delivered.filter(
          (o) => customerKey(o.posId, o.phone) === key,
        );
      const last = purchases.at(-1)?.deliveredAt ?? null;
      const daysSince = last
        ? Math.max(
            0,
            Math.floor(
              (Date.parse(`${asOf}T00:00:00+07:00`) - Date.parse(last)) /
                86400000,
            ),
          )
        : null;
      const productQuantities = new Map<string, number>();
      purchases
        .flatMap((o) => o.items)
        .forEach((item) =>
          productQuantities.set(
            item.productId,
            (productQuantities.get(item.productId) ?? 0) + item.quantity,
          ),
        );
      const assignment = latestAssignment.get(key);
      return {
        ...c,
        key,
        employeeId: assignment?.employeeId ?? null,
        assignedAt: assignment?.assignedAt ?? null,
        batchId: assignment?.batchId ?? null,
        purchases,
        total: purchases.reduce((n, o) => n + o.netMerchandise, 0),
        count: purchases.length,
        avg: purchases.length
          ? purchases.reduce((n, o) => n + o.netMerchandise, 0) /
            purchases.length
          : null,
        upsell: Math.max(0, purchases.length - 1),
        last,
        daysSince,
        products: [...productQuantities.entries()].map(([id, quantity]) => ({
          name: PRODUCTS.find((p) => p.id === id)?.name ?? id,
          quantity,
        })),
      };
    })
    .filter((c) => allowed(c.employeeId ?? '', filters.employeeIds));
}

export function dormantGroup(days: number | null) {
  if (days === null) return 'Chưa từng mua';
  if (days >= 30 && days <= 45) return '30–45 ngày';
  if (days >= 46 && days <= 60) return '46–60 ngày';
  if (days >= 61 && days <= 90) return '61–90 ngày';
  if (days > 90) return 'Trên 90 ngày';
  return 'Dưới 30 ngày';
}

export function batchRows(data: Dataset, filters: Filters) {
  const groups = new Map<string, Assignment[]>();
  data.assignments
    .filter(
      (a) =>
        inRange(a.assignedAt, filters.start, filters.end) &&
        allowed(a.posId, filters.posIds) &&
        allowed(a.employeeId, filters.employeeIds),
    )
    .forEach((a) =>
      groups.set(a.batchId, [...(groups.get(a.batchId) ?? []), a]),
    );
  return [...groups.entries()]
    .map(([batchId, items]) => {
      const phones = new Set(items.map((a) => customerKey(a.posId, a.phone)));
      const orders = data.orders.filter(
        (o) =>
          phones.has(customerKey(o.posId, o.phone)) &&
          o.status === 'delivered' &&
          o.createdAt >= items[0].assignedAt &&
          hasProduct(o, filters),
      );
      const months = new Map<string, Order[]>();
      orders.forEach((o) =>
        months.set(o.createdAt.slice(0, 7), [
          ...(months.get(o.createdAt.slice(0, 7)) ?? []),
          o,
        ]),
      );
      return {
        batchId,
        posId: items[0].posId,
        assignedAt: items[0].assignedAt.slice(0, 7),
        received: phones.size,
        phones: [...phones],
        relatedOrders: orders,
        buyers: new Set(orders.map((o) => customerKey(o.posId, o.phone))).size,
        orders: orders.length,
        revenue: orders.reduce((n, o) => n + o.netMerchandise, 0),
        employeeIds: [...new Set(items.map((a) => a.employeeId))],
        months: [...months.entries()]
          .map(([month, monthOrders]) => ({
            month,
            orders: monthOrders.length,
            revenue: monthOrders.reduce((n, o) => n + o.netMerchandise, 0),
          }))
          .sort((a, b) => a.month.localeCompare(b.month)),
      };
    })
    .sort(
      (a, b) =>
        b.assignedAt.localeCompare(a.assignedAt) ||
        a.posId.localeCompare(b.posId),
    );
}

export function productRows(data: Dataset, filters: Filters) {
  const scope = reportScope(data, filters);
  return PRODUCTS.map((product) => {
    const orders = scope.deliveredOrders.filter((o) =>
      o.items.some((item) => item.productId === product.id),
    );
    return {
      ...product,
      orders: orders.length,
      quantity: orders
        .flatMap((o) => o.items)
        .filter((item) => item.productId === product.id)
        .reduce((n, item) => n + item.quantity, 0),
      revenue: orders
        .flatMap((o) => o.items)
        .filter((item) => item.productId === product.id)
        .reduce((n, item) => n + item.netValue, 0),
    };
  }).sort((a, b) => b.revenue - a.revenue);
}

export function upsellSummary(data: Dataset, filters: Filters) {
  const history = data.orders
    .filter((o) => o.status === 'delivered')
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const ordinal = new Map<string, number>(),
    customers = new Set<string>();
  const counts = [0, 0, 0],
    orders: Order[] = [];
  for (const o of history) {
    const key = customerKey(o.posId, o.phone),
      purchase = (ordinal.get(key) ?? 0) + 1;
    ordinal.set(key, purchase);
    if (
      purchase < 2 ||
      !inRange(o.createdAt, filters.start, filters.end) ||
      !allowed(o.posId, filters.posIds) ||
      !allowed(o.closerId, filters.employeeIds) ||
      !hasProduct(o, filters)
    )
      continue;
    orders.push(o);
    customers.add(key);
    if (purchase <= 4) counts[purchase - 2]++;
  }
  return {
    first: counts[0],
    second: counts[1],
    third: counts[2],
    customers: customers.size,
    orders: orders.length,
    revenue: orders.reduce((n, o) => n + o.netMerchandise, 0),
  };
}

export const posName = (id: string) => POS.find((p) => p.id === id)?.name ?? id;
export const employeeName = (id: string | null) =>
  id ? EMPLOYEES.find((e) => e.id === id)?.name ?? id : 'Chưa rõ';
