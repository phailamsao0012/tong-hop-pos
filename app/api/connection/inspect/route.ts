import { env } from 'cloudflare:workers';
import { getChatGPTUser } from '@/app/chatgpt-auth';
import { POS } from '@/lib/report-model';

type PosOrder = {
  id?: number;
  inserted_at?: string;
  status?: number;
  bill_phone_number?: string;
  assigning_seller?: { id?: string } | null;
  time_assign_care?: string | null;
  status_history?: { status?: number; editor_id?: string; updated_at?: string }[];
  histories?: Record<string, unknown>[];
  items?: Record<string, unknown>[];
};
type ListResponse = {
  success?: boolean;
  data?: PosOrder[];
  total_entries?: number;
};

export async function GET(request: Request) {
  if (!(await getChatGPTUser()))
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
    const [latest, oldest, users] = await Promise.all([
      fetchPos<ListResponse>(path, { page_size: '30', page_number: '1', option_sort: 'inserted_at_desc' }),
      fetchPos<ListResponse>(path, { page_size: '1', page_number: '1', option_sort: 'inserted_at_asc' }),
      fetchPos<{ success?: boolean; data?: unknown[] }>(`/shops/${shopId}/users`),
    ]);
    if (!latest.success || !Array.isArray(latest.data) || !oldest.success || !Array.isArray(oldest.data))
      return Response.json({ error: 'API không trả danh sách đơn hợp lệ.' }, { status: 502 });
    const sample = latest.data;
    const count = (predicate: (o: PosOrder) => boolean) => sample.filter(predicate).length;
    return Response.json({
      posId,
      shopId,
      totalOrders: latest.total_entries ?? null,
      sampledOrders: sample.length,
      earliestCreatedAt: oldest.data[0]?.inserted_at ?? null,
      latestCreatedAt: sample[0]?.inserted_at ?? null,
      employeesReturned: Array.isArray(users.data) ? users.data.length : null,
      coverage: {
        phone: count((o) => Boolean(o.bill_phone_number)),
        seller: count((o) => Boolean(o.assigning_seller?.id)),
        careAssignmentTime: count((o) => Boolean(o.time_assign_care)),
        statusHistory: count((o) => Array.isArray(o.status_history) && o.status_history.length > 0),
        firstConfirmationEvent: count((o) => o.status_history?.some((h) => h.status === 1 && Boolean(h.updated_at)) ?? false),
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
