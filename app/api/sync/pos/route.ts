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
  time_assign_seller?: string | null;
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

type SourcePage = { success?: boolean; data?: SourceOrder[]; total_entries?: number };
type BackfillCursor = { month: string; page: number; completed?: boolean };

const sourceUrl = (shopId: string, apiKey: string, params: Record<string, string>) => {
  const url = new URL(`https://pos.pages.fm/api/v1/shops/${shopId}/orders`);
  url.searchParams.set('api_key', apiKey);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  return url;
};
const getSourcePage = async (shopId: string, apiKey: string, params: Record<string, string>): Promise<SourcePage> => {
  const response = await fetch(sourceUrl(shopId, apiKey, params), {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(20000), cache: 'no-store',
  });
  if (!response.ok) throw new Error('source_http_error');
  return await response.json() as SourcePage;
};
const nextMonth = (month: string) => {
  const date = new Date(`${month}-01T00:00:00Z`);
  date.setUTCMonth(date.getUTCMonth() + 1);
  return date.toISOString().slice(0, 7);
};
const currentMonth = () => new Intl.DateTimeFormat('en-CA', {
  year: 'numeric', month: '2-digit', timeZone: 'Asia/Ho_Chi_Minh',
}).format(new Date());
const monthBounds = (month: string) => ({
  startDateTime: String(Date.parse(`${month}-01T00:00:00Z`) / 1000),
  endDateTime: String(Date.parse(`${nextMonth(month)}-01T00:00:00Z`) / 1000 - 1),
});

export async function GET() {
  if (!(await getChatGPTUser()))
    return Response.json({ error: 'Đăng nhập để xem dữ liệu POS.' }, { status: 401 });
  const [results, progress] = await Promise.all([env.DB.prepare(
    'SELECT pos_id, COUNT(*) AS records, MIN(created_at) AS earliest_created_at, MAX(created_at) AS latest_created_at, MAX(fetched_at) AS fetched_at, SUM(CASE WHEN first_confirmed_at IS NOT NULL THEN 1 ELSE 0 END) AS with_confirmation, SUM(CASE WHEN seller_id IS NOT NULL THEN 1 ELSE 0 END) AS with_seller, SUM(CASE WHEN seller_assigned_at IS NOT NULL THEN 1 ELSE 0 END) AS with_assignment_time FROM raw_pos_orders GROUP BY pos_id',
  ).all<{ pos_id: string; records: number; earliest_created_at: string | null; latest_created_at: string | null; fetched_at: string; with_confirmation: number; with_seller: number; with_assignment_time: number }>(),
  env.DB.prepare('SELECT id,cursor FROM pos_shops WHERE cursor IS NOT NULL').all<{ id: string; cursor: string }>()]);
  const byPos = new Map(results.results.map((r) => [r.pos_id, r]));
  const byProgress = new Map(progress.results.map((r) => [r.id, r.cursor]));
  return Response.json(POS.map((p) => ({
    posId: p.id,
    records: byPos.get(p.id)?.records ?? 0,
    earliestCreatedAt: byPos.get(p.id)?.earliest_created_at ?? null,
    latestCreatedAt: byPos.get(p.id)?.latest_created_at ?? null,
    fetchedAt: byPos.get(p.id)?.fetched_at ?? null,
    withConfirmation: byPos.get(p.id)?.with_confirmation ?? 0,
    withSeller: byPos.get(p.id)?.with_seller ?? 0,
    withAssignmentTime: byPos.get(p.id)?.with_assignment_time ?? 0,
    backfillCursor: byProgress.get(p.id)
      ? (() => {
          const saved = JSON.parse(byProgress.get(p.id)!) as BackfillCursor;
          return saved.completed && saved.month <= currentMonth()
            ? { ...saved, completed: false } : saved;
        })() : null,
  })), { headers: { 'Cache-Control': 'no-store' } });
}

// Source records are not official hot-close metrics. Every page is upserted by
// POS + source order ID. Backfill advances a persisted monthly cursor only after
// the page and the cursor write succeed together.
export async function POST(request: Request) {
  if (!(await getChatGPTUser()))
    return Response.json({ error: 'Không có quyền đồng bộ.' }, { status: 401 });
  let body: { posId?: string; action?: 'recent' | 'backfill' | 'restart' };
  try { body = await request.json(); }
  catch { return Response.json({ error: 'JSON không hợp lệ.' }, { status: 400 }); }
  const posId = body.posId;
  if (!POS.some((p) => p.id === posId))
    return Response.json({ error: 'POS ngoài phạm vi.' }, { status: 400 });
  const shop = await env.DB.prepare('SELECT shop_id,cursor FROM pos_shops WHERE id=?')
    .bind(posId).first<{ shop_id: string | null; cursor: string | null }>();
  const shopId = shop?.shop_id;
  const apiKey = env.PANCAKE_POS_API_KEY?.trim();
  if (!apiKey || !shopId || !/^\d+$/.test(shopId))
    return Response.json({ error: 'Thiếu API key bí mật hoặc Shop ID.' }, { status: 400 });
  const action = body.action === 'restart' ? 'restart'
    : body.action === 'backfill' ? 'backfill' : 'recent';
  let cursor: BackfillCursor | null = null;
  if (action === 'backfill' && shop?.cursor) {
    try { cursor = JSON.parse(shop.cursor) as BackfillCursor; }
    catch { return Response.json({ error: 'Tiến độ lịch sử không hợp lệ.' }, { status: 500 }); }
    if (!/^\d{4}-\d{2}$/.test(cursor.month) ||
        !Number.isInteger(cursor.page) || cursor.page < 1 || cursor.page > 100000)
      return Response.json({ error: 'Tiến độ lịch sử không hợp lệ.' }, { status: 500 });
    if (cursor.completed && cursor.month > currentMonth())
      return Response.json({ ok: true, posId, action, completed: true, records: 0, cursor });
    cursor.completed = false;
  }
  if (action !== 'recent' && !cursor) {
    try {
      const oldest = await getSourcePage(shopId, apiKey, {
        page_size: '1', page_number: '1', option_sort: 'inserted_at_asc',
      });
      const month = oldest.data?.[0]?.inserted_at?.slice(0, 7);
      if (!oldest.success || !month || !/^\d{4}-\d{2}$/.test(month)) throw new Error();
      cursor = { month, page: 1 };
    } catch {
      return Response.json({ error: 'Không xác định được đơn cũ nhất của POS.' }, { status: 502 });
    }
  }
  const params = action !== 'recent' && cursor
    ? { page_size: '50', page_number: String(cursor.page), updateStatus: 'inserted_at',
        option_sort: 'inserted_at_asc', ...monthBounds(cursor.month) }
    : { page_size: '50', page_number: '1', updateStatus: 'updated_at',
        option_sort: 'last_updated_order_desc' };
  let source: SourcePage;
  try {
    source = await getSourcePage(shopId, apiKey, params);
  } catch {
    return Response.json({ error: 'Pancake POS chưa trả được trang đơn để đồng bộ.' }, { status: 502 });
  }
  if (!source.success || !Array.isArray(source.data) || source.data.length > 50)
    return Response.json({ error: 'Trang đơn từ Pancake POS không hợp lệ.' }, { status: 502 });
  if (cursor && source.data.some((o) =>
    o.inserted_at && o.inserted_at.slice(0, 7) !== cursor.month))
    return Response.json({ error: 'Bộ lọc thời gian của Pancake POS chưa trả đúng tháng; dừng để tránh bỏ sót lịch sử.' }, { status: 502 });
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
      'INSERT INTO raw_pos_orders (id,pos_id,shop_id,source_order_id,phone,created_at,updated_at,status_code,seller_id,seller_assigned_at,care_id,current_total,first_confirmed_at,first_confirmed_by,status_history_json,other_history_json,item_json,history_limited,fetched_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET phone=excluded.phone,created_at=excluded.created_at,updated_at=excluded.updated_at,status_code=excluded.status_code,seller_id=excluded.seller_id,seller_assigned_at=excluded.seller_assigned_at,care_id=excluded.care_id,current_total=excluded.current_total,first_confirmed_at=COALESCE(raw_pos_orders.first_confirmed_at,excluded.first_confirmed_at),first_confirmed_by=COALESCE(raw_pos_orders.first_confirmed_by,excluded.first_confirmed_by),status_history_json=excluded.status_history_json,other_history_json=excluded.other_history_json,item_json=excluded.item_json,history_limited=excluded.history_limited,fetched_at=excluded.fetched_at',
    ).bind(
      `${posId}:${o.id}`, posId, shopId, String(o.id), o.bill_phone_number ?? null,
      o.inserted_at ?? null, o.updated_at ?? null,
      Number.isInteger(o.status) ? o.status : null,
      o.assigning_seller?.id ?? null, o.time_assign_seller ?? null,
      o.assigning_care_id ?? null,
      typeof o.total_price === 'number' && Number.isFinite(o.total_price) ? o.total_price : null,
      first?.updated_at ?? null, first?.editor_id ?? null,
      JSON.stringify(history), historyLimited ? '[]' : otherJson,
      JSON.stringify(items), historyLimited ? 1 : 0, now,
    ));
  }
  let nextCursor: BackfillCursor | null = null;
  if (cursor) {
    const total = typeof source.total_entries === 'number' &&
      Number.isFinite(source.total_entries) ? source.total_entries : null;
    const morePages = source.data.length > 0 && (total !== null
      ? cursor.page * 50 < total : source.data.length === 50);
    nextCursor = morePages
      ? { month: cursor.month, page: cursor.page + 1 }
      : { month: nextMonth(cursor.month), page: 1 };
    if (nextCursor.month > currentMonth())
      nextCursor.completed = true;
    statements.push(env.DB.prepare(
      'UPDATE pos_shops SET cursor=? WHERE id=?',
    ).bind(JSON.stringify(nextCursor), posId));
  }
  const records = statements.length - (nextCursor ? 1 : 0);
  statements.push(env.DB.prepare(
    'INSERT INTO sync_runs (id,pos_id,started_at,finished_at,status,records,error) VALUES (?,?,?,?,?,?,NULL)',
  ).bind(crypto.randomUUID(), posId, now, now,
    action === 'restart' ? 'source_restart'
      : action === 'backfill' ? 'source_backfill' : 'source_recent', records));
  await env.DB.batch(statements);
  return Response.json({
    ok: true, posId, action, records,
    sourceTotalEntries: source.total_entries ?? null,
    withConfirmation, fetchedAt: now,
    cursor: nextCursor,
    completed: nextCursor?.completed ?? false,
    note: 'Chỉ lưu bản ghi nguồn để khảo sát; chưa tính báo cáo chốt nóng.',
  });
}
