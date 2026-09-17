import { env } from 'cloudflare:workers';
import { getSessionUser } from '@/lib/auth';
import { POS } from '@/lib/report-model';

type PosOrder = {
  id?: number;
  inserted_at?: string;
  status?: number;
  bill_phone_number?: string;
  assigning_seller?: { id?: string } | null;
  time_assign_seller?: string | null;
  time_assign_care?: string | null;
  status_history?: { status?: number; editor_id?: string; updated_at?: string }[];
  histories?: Record<string, unknown>[];
  items?: Record<string, unknown>[];
};
type ListResponse = {
  success?: boolean;
  data?: PosOrder[];
  total_entries?: number;
  page_size?: number;
};
type PosCustomer = {
  phone_numbers?: string[];
  assigned_user_id?: string | null;
  inserted_at?: string | null;
  time_assign_user?: string | null;
  assigned_at?: string | null;
};

export async function GET(request: Request) {
  if (!(await getSessionUser()))
    return Response.json({ error: 'Đăng nhập để khảo sát POS.' }, { status: 401 });
  const posId = new URL(request.url).searchParams.get('posId');
  if (!POS.some((p) => p.id === posId))
    return Response.json({ error: 'POS ngoài phạm vi.' }, { status: 400 });
  const row = await env.DB.prepare('SELECT shop_id FROM pos_shops WHERE id=?')
    .bind(posId).first<{ shop_id: string | null }>();
  const shopId = row?.shop_id;
  const apiKey = env.PANCAKE_POS_API_KEY?.trim();
  if (!apiKey || !shopId || !/^\d+$/.test(shopId))
    return Response.json({ error: 'Thiếu API key bí mật hoặc Shop ID dạng số.' }, { status: 400 });

  const fetchPos = async <T>(path: string, params?: Record<string, string>): Promise<T> => {
    const url = new URL(`https://pos.pages.fm/api/v1${path}`);
    url.searchParams.set('api_key', apiKey);
    for (const [key, value] of Object.entries(params ?? {})) url.searchParams.set(key, value);
    const response = await fetch(url, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(15000),
      cache: 'no-store',
    });
    if (!response.ok) throw new Error(`Pancake POS HTTP ${response.status}`);
    return await response.json() as T;
  };
  try {
    const path = `/shops/${shopId}/orders`;
    const [latest, oldest, users, customers, largePage] = await Promise.all([
      fetchPos<ListResponse>(path, { page_size: '30', page_number: '1', option_sort: 'inserted_at_desc' }),
      fetchPos<ListResponse>(path, { page_size: '1', page_number: '1', option_sort: 'inserted_at_asc' }),
      fetchPos<{ success?: boolean; data?: unknown[] }>(`/shops/${shopId}/users`),
      fetchPos<{ success?: boolean; data?: PosCustomer[]; total_entries?: number }>(
        `/shops/${shopId}/customers`, { page_size: '30', page_number: '1' })
        .catch(() => ({ success: false, data: [] as PosCustomer[], total_entries: undefined })),
      fetchPos<ListResponse>(path, {
        page_size: '100', page_number: '1', option_sort: 'inserted_at_asc',
      }).catch(() => ({ success: false, data: [] as PosOrder[], page_size: undefined })),
    ]);
    if (!latest.success || !Array.isArray(latest.data) || !oldest.success || !Array.isArray(oldest.data))
      return Response.json({ error: 'API không trả danh sách đơn hợp lệ.' }, { status: 502 });
    const sample = latest.data;
    const count = (predicate: (o: PosOrder) => boolean) => sample.filter(predicate).length;
    const detailCandidates = sample.filter((o) => o.id &&
      o.status_history?.some((h) => h.status === 1 && Boolean(h.updated_at))).slice(0, 3);
    const detailResults = await Promise.allSettled(detailCandidates.map((o) =>
      fetchPos<PosOrder | { data?: PosOrder }>(`${path}/${o.id}`)));
    const details: PosOrder[] = detailResults.flatMap((result) => {
      if (result.status !== 'fulfilled') return [];
      const value = result.value;
      return [value && 'data' in value ? value.data ?? {} : value as PosOrder];
    });
    const valueAtConfirmation = (o: PosOrder) => o.histories?.some((h) =>
      Number(h.status) === 1 && Boolean(h.updated_at) &&
      (typeof h.total_price === 'number' || Array.isArray(h.items))) ?? false;
    const firstConfirmedAt = (o: PosOrder) => o.status_history
      ?.filter((h) => h.status === 1 && h.updated_at)
      .map((h) => h.updated_at!)
      .sort()[0];
    const beforeConfirmation = (o: PosOrder, predicate: (h: Record<string, unknown>) => boolean) => {
      const confirmedAt = firstConfirmedAt(o);
      return Boolean(confirmedAt && o.histories?.some((h) =>
        typeof h.updated_at === 'string' && h.updated_at <= confirmedAt && predicate(h)));
    };
    const itemEvents = sample.flatMap((o) => o.histories ?? [])
      .filter((h) => 'items' in h);
    const itemWithArray = itemEvents.find((h) => Array.isArray(h.items));
    return Response.json({
      posId,
      shopId,
      totalOrders: latest.total_entries ?? null,
      sampledOrders: sample.length,
      earliestCreatedAt: oldest.data[0]?.inserted_at ?? null,
      latestCreatedAt: sample[0]?.inserted_at ?? null,
      employeesReturned: Array.isArray(users.data) ? users.data.length : null,
      pageSizeProbe: {
        requested: 100,
        returned: Array.isArray(largePage.data) ? largePage.data.length : 0,
        reported: largePage.page_size ?? null,
        success: largePage.success === true,
      },
      customersReadable: customers.success === true,
      totalCustomers: customers.total_entries ?? null,
      sampledCustomers: Array.isArray(customers.data) ? customers.data.length : 0,
      customerCoverage: {
        phone: customers.data?.filter((c) => Array.isArray(c.phone_numbers) && c.phone_numbers.length > 0).length ?? 0,
        assignedUser: customers.data?.filter((c) => Boolean(c.assigned_user_id)).length ?? 0,
        assignmentTime: customers.data?.filter((c) => Boolean(c.time_assign_user || c.assigned_at)).length ?? 0,
      },
      customerFields: [...new Set((customers.data ?? []).flatMap((c) => Object.keys(c)))].sort(),
      detailOrdersChecked: details.length,
      detailConfirmationValueInHistory: details.filter(valueAtConfirmation).length,
      historyItemEvents: itemEvents.length,
      historyItemShape: itemEvents[0]
        ? Array.isArray(itemEvents[0].items) ? 'array' : typeof itemEvents[0].items
        : 'missing',
      historyItemFields: Array.isArray(itemWithArray?.items)
        ? Object.keys(itemWithArray.items[0] ?? {}) : [],
      historyCoverage: {
        itemSnapshotBeforeConfirmation: count((o) => beforeConfirmation(o, (h) => Array.isArray(h.items))),
        discountBeforeConfirmation: count((o) => beforeConfirmation(o, (h) =>
          typeof h.discount === 'number' || typeof h.total_discount === 'number')),
        itemEventAfterConfirmation: count((o) => {
          const confirmedAt = firstConfirmedAt(o);
          return Boolean(confirmedAt && o.histories?.some((h) =>
            typeof h.updated_at === 'string' && h.updated_at > confirmedAt && Array.isArray(h.items)));
        }),
      },
      coverage: {
        phone: count((o) => Boolean(o.bill_phone_number)),
        seller: count((o) => Boolean(o.assigning_seller?.id)),
        sellerAssignmentTime: count((o) => Boolean(o.time_assign_seller)),
        careAssignmentTime: count((o) => Boolean(o.time_assign_care)),
        statusHistory: count((o) => Array.isArray(o.status_history) && o.status_history.length > 0),
        firstConfirmationEvent: count((o) => o.status_history?.some((h) => h.status === 1 && Boolean(h.updated_at)) ?? false),
        firstConfirmationValueInHistory: count(valueAtConfirmation),
      },
      statusHistoryFields: Object.keys(sample.find((o) => o.status_history?.length)?.status_history?.[0] ?? {}),
      otherHistoryFields: [...new Set(sample.flatMap((o) =>
        (o.histories ?? []).flatMap((h) => Object.keys(h ?? {}))))].sort(),
      orderFields: [...new Set(sample.flatMap((o) => Object.keys(o)))].sort(),
      itemFields: Object.keys(sample.find((o) => o.items?.length)?.items?.[0] ?? {}),
      // No order, staff, customer, phone, or key values leave this inspector.
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return Response.json({ error: error instanceof Error && /^Pancake POS HTTP \d+$/.test(error.message)
      ? error.message : 'Không khảo sát được dữ liệu POS.' }, { status: 502 });
  }
}
