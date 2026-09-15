import { env } from 'cloudflare:workers';
import { getChatGPTUser } from '@/app/chatgpt-auth';
import { POS } from '@/lib/report-model';

type SourceOrder = {
  id?: number | string;
  bill_phone_number?: string | null;
  inserted_at?: string | null;
  updated_at?: string | null;
  status?: number | null;
  assigning_seller?: { id?: string } | null;
  assigning_care_id?: string | null;
  total_price?: number | null;
  status_history?: {
    old_status?: number;
    status?: number;
    editor_id?: string;
    updated_at?: string;
  }[];
  histories?: Record<string, unknown>[];
  items?: {
    product_id?: string;
    variation_id?: string;
    quantity?: number;
    returned_count?: number;
    variation_info?: { retail_price?: number };
  }[];
};

const sourceUrl = (shopId: string, apiKey: string) => {
  const url = new URL(`https://pos.pages.fm/api/v1/shops/${shopId}/orders`);
  url.searchParams.set('api_key', apiKey);
  url.searchParams.set('page_size', '50');
  url.searchParams.set('page_number', '1');
  url.searchParams.set('updateStatus', 'updated_at');
  url.searchParams.set('option_sort', 'last_updated_order_desc');
  return url;
};

export async function GET() {
  if (!(await getChatGPTUser()))
    return Response.json({ error: 'Đăng nhập để xem dữ liệu POS.' }, { status: 401 });
  const results = await env.DB.prepare(
    'SELECT pos_id, COUNT(*) AS records, MAX(fetched_at) AS fetched_at FROM raw_pos_orders GROUP BY pos_id',
  ).all<{ pos_id: string; records: number; fetched_at: string }>();
  const byPos = new Map(results.results.map((r) => [r.pos_id, r]));
  return Response.json(POS.map((p) => ({
    posId: p.id,
    records: byPos.get(p.id)?.records ?? 0,
    fetchedAt: byPos.get(p.id)?.fetched_at ?? null,
  })), { headers: { 'Cache-Control': 'no-store' } });
}

// Pilot ingestion of the 50 most recently changed orders. These are source
// records, not yet official hot-close metrics. Repeating the call upserts by
// POS + source order ID, so it does not duplicate orders.
export async function POST(request: Request) {
  if (!(await getChatGPTUser()))
    return Response.json({ error: 'Không có quyền đồng bộ.' }, { status: 401 });
  let body: { posId?: string };
  try { body = await request.json(); }
  catch { return Response.json({ error: 'JSON không hợp lệ.' }, { status: 400 }); }
  const posId = body.posId;
  if (!POS.some((p) => p.id === posId))
    return Response.json({ error: 'POS ngoài phạm vi.' }, { status: 400 });
  const shop = await env.DB.prepare('SELECT shop_id FROM pos_shops WHERE id=?')
    .bind(posId).first<{ shop_id: string | null }>();
  const shopId = shop?.shop_id;
  const apiKey = env.PANCAKE_POS_API_KEY?.trim();
  if (!apiKey || !shopId || !/^\d+$/.test(shopId))
    return Response.json({ error: 'Thiếu API key bí mật hoặc Shop ID.' }, { status: 400 });
  let source: { success?: boolean; data?: SourceOrder[]; total_entries?: number };
  try {
    const response = await fetch(sourceUrl(shopId, apiKey), {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(20000), cache: 'no-store',
    });
    if (!response.ok) throw new Error();
    source = await response.json();
  } catch {
    return Response.json({ error: 'Pancake POS chưa trả được trang đơn để đồng bộ.' }, { status: 502 });
  }
  if (!source.success || !Array.isArray(source.data) || source.data.length > 50)
    return Response.json({ error: 'Trang đơn từ Pancake POS không hợp lệ.' }, { status: 502 });
  const now = new Date().toISOString();
  const statements: D1PreparedStatement[] = [];
  let withConfirmation = 0;
  for (const o of source.data) {
    if (o.id === undefined || o.id === null) continue;
    const history = Array.isArray(o.status_history)
      ? o.status_history.map((h) => ({
          old_status: h.old_status ?? null,
          status: h.status ?? null,
          editor_id: h.editor_id ?? null,
          updated_at: h.updated_at ?? null,
        })) : [];
    const first = history
      .filter((h) => h.status === 1 && h.updated_at)
      .sort((a, b) => String(a.updated_at).localeCompare(String(b.updated_at)))[0];
    if (first) withConfirmation++;
    const other = Array.isArray(o.histories) ? o.histories : [];
    const otherJson = JSON.stringify(other);
    const historyLimited = other.length > 100 || otherJson.length > 30000;
    const items = Array.isArray(o.items) ? o.items.map((i) => ({
      product_id: i.product_id ?? null,
      variation_id: i.variation_id ?? null,
      quantity: i.quantity ?? null,
      returned_count: i.returned_count ?? null,
      retail_price: i.variation_info?.retail_price ?? null,
    })) : [];
    statements.push(env.DB.prepare(
      'INSERT INTO raw_pos_orders (id,pos_id,shop_id,source_order_id,phone,created_at,updated_at,status_code,seller_id,care_id,current_total,first_confirmed_at,first_confirmed_by,status_history_json,other_history_json,item_json,history_limited,fetched_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET phone=excluded.phone,created_at=excluded.created_at,updated_at=excluded.updated_at,status_code=excluded.status_code,seller_id=excluded.seller_id,care_id=excluded.care_id,current_total=excluded.current_total,first_confirmed_at=COALESCE(raw_pos_orders.first_confirmed_at,excluded.first_confirmed_at),first_confirmed_by=COALESCE(raw_pos_orders.first_confirmed_by,excluded.first_confirmed_by),status_history_json=excluded.status_history_json,other_history_json=excluded.other_history_json,item_json=excluded.item_json,history_limited=excluded.history_limited,fetched_at=excluded.fetched_at',
    ).bind(
      `${posId}:${o.id}`, posId, shopId, String(o.id), o.bill_phone_number ?? null,
      o.inserted_at ?? null, o.updated_at ?? null,
      Number.isInteger(o.status) ? o.status : null,
      o.assigning_seller?.id ?? null, o.assigning_care_id ?? null,
      typeof o.total_price === 'number' && Number.isFinite(o.total_price) ? o.total_price : null,
      first?.updated_at ?? null, first?.editor_id ?? null,
      JSON.stringify(history), historyLimited ? '[]' : otherJson,
      JSON.stringify(items), historyLimited ? 1 : 0, now,
    ));
  }
  statements.push(env.DB.prepare(
    'INSERT INTO sync_runs (id,pos_id,started_at,finished_at,status,records,error) VALUES (?,?,?,?,?,?,NULL)',
  ).bind(crypto.randomUUID(), posId, now, now, 'source_pilot', statements.length));
  await env.DB.batch(statements);
  return Response.json({
    ok: true, posId, records: statements.length - 1,
    sourceTotalEntries: source.total_entries ?? null,
    withConfirmation, fetchedAt: now,
    note: 'Chỉ lưu bản ghi nguồn để khảo sát; chưa tính báo cáo chốt nóng.',
  });
}
