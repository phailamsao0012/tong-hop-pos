import { env } from 'cloudflare:workers';
import { getSessionUser, unauthorized } from '@/lib/auth';
import { POS } from '@/lib/report-model';
import {
  currentMonth, loadShop, parseCursor, startBackfillCursor,
  syncBackfill, syncProducts, syncRecent, syncUsers, type BackfillCursor,
} from '@/lib/sync';

// Trạng thái đồng bộ. Mọi truy vấn đều chạy trên chỉ mục (COVERING INDEX) để không quét cả bảng đơn
// (bảng chứa JSON gốc rất nặng; quét toàn bộ từng làm D1 quá hạn CPU và reset, kéo theo lỗi 500 cho các trang khác).
type StatsRow = { records: number; earliest_created_at: string | null; latest_created_at: string | null };

export async function GET() {
  if (!(await getSessionUser())) return unauthorized('Đăng nhập để xem dữ liệu POS.');
  const perPos = POS.flatMap((p) => [
    env.DB.prepare('SELECT COUNT(*) AS records, MIN(created_at) AS earliest_created_at, MAX(created_at) AS latest_created_at FROM raw_pos_orders WHERE pos_id=?').bind(p.id),
    env.DB.prepare('SELECT COUNT(*) AS n FROM raw_pos_orders WHERE pos_id=? AND first_confirmed_at IS NOT NULL').bind(p.id),
    env.DB.prepare('SELECT SUM(seller_id IS NOT NULL) AS with_seller, SUM(seller_assigned_at IS NOT NULL) AS with_assignment_time FROM raw_pos_orders WHERE pos_id=?').bind(p.id),
  ]);
  const errors24h = await env.DB.prepare("SELECT pos_id, COUNT(*) AS n FROM sync_runs WHERE error IS NOT NULL AND started_at>=? GROUP BY pos_id").bind(new Date(Date.now() - 86400000).toISOString()).all<{ pos_id: string; n: number }>();
  const errorCount = new Map(errors24h.results.map((r) => [r.pos_id, r.n]));
  const [shops, users, products, runs, ...counts] = await env.DB.batch([
    env.DB.prepare('SELECT id,cursor,last_sync_at,users_synced_at,products_synced_at,last_error,status FROM pos_shops'),
    env.DB.prepare('SELECT pos_id, COUNT(*) AS n FROM pos_users GROUP BY pos_id'),
    env.DB.prepare('SELECT pos_id, COUNT(*) AS n FROM pos_products GROUP BY pos_id'),
    env.DB.prepare('SELECT pos_id,started_at,status,records,error FROM sync_runs ORDER BY started_at DESC LIMIT 60'),
    ...perPos,
  ]);
  const byPos = new Map(POS.map((p, i) => {
    const base = counts[i * 3].results[0] as StatsRow | undefined;
    const confirmed = counts[i * 3 + 1].results[0] as { n: number } | undefined;
    const seller = counts[i * 3 + 2].results[0] as { with_seller: number | null; with_assignment_time: number | null } | undefined;
    return [p.id, {
      records: Number(base?.records ?? 0), earliest_created_at: base?.earliest_created_at ?? null, latest_created_at: base?.latest_created_at ?? null,
      with_confirmation: Number(confirmed?.n ?? 0), with_seller: Number(seller?.with_seller ?? 0), with_assignment_time: Number(seller?.with_assignment_time ?? 0),
    }];
  }));
  const byShop = new Map((shops.results as { id: string; cursor: string | null; last_sync_at: string | null; users_synced_at: string | null; products_synced_at: string | null; last_error: string | null; status: string }[]).map((r) => [r.id, r]));
  const userCount = new Map((users.results as { pos_id: string; n: number }[]).map((r) => [r.pos_id, r.n]));
  const productCount = new Map((products.results as { pos_id: string; n: number }[]).map((r) => [r.pos_id, r.n]));
  return Response.json(POS.map((p) => {
    const shop = byShop.get(p.id);
    const cursor = parseCursor(shop?.cursor ?? null);
    return {
      posId: p.id,
      records: byPos.get(p.id)?.records ?? 0,
      earliestCreatedAt: byPos.get(p.id)?.earliest_created_at ?? null,
      latestCreatedAt: byPos.get(p.id)?.latest_created_at ?? null,
      fetchedAt: shop?.last_sync_at ?? null,
      withConfirmation: byPos.get(p.id)?.with_confirmation ?? 0,
      withSeller: byPos.get(p.id)?.with_seller ?? 0,
      withAssignmentTime: byPos.get(p.id)?.with_assignment_time ?? 0,
      backfillCursor: cursor,
      lastSyncAt: shop?.last_sync_at ?? null,
      usersSyncedAt: shop?.users_synced_at ?? null,
      productsSyncedAt: shop?.products_synced_at ?? null,
      users: userCount.get(p.id) ?? 0,
      products: productCount.get(p.id) ?? 0,
      lastError: shop?.last_error ?? null,
      status: shop?.status ?? 'pending',
      errors24h: errorCount.get(p.id) ?? 0,
      runs: (runs.results as { pos_id: string; started_at: string; status: string; records: number; error: string | null }[]).filter((r) => r.pos_id === p.id).slice(0, 10),
    };
  }), { headers: { 'Cache-Control': 'no-store' } });
}

type Action = 'recent' | 'backfill' | 'restart' | 'users' | 'products';

export async function POST(request: Request) {
  if (!(await getSessionUser())) return unauthorized('Không có quyền đồng bộ.');
  let body: { posId?: string; action?: Action };
  try { body = await request.json(); }
  catch { return Response.json({ error: 'JSON không hợp lệ.' }, { status: 400 }); }
  const posId = body.posId ?? '';
  if (!POS.some((p) => p.id === posId))
    return Response.json({ error: 'POS ngoài phạm vi.' }, { status: 400 });
  const shop = await loadShop(env.DB, posId);
  const apiKey = env.PANCAKE_POS_API_KEY?.trim();
  if (!apiKey || !shop?.shop_id || !/^\d+$/.test(shop.shop_id))
    return Response.json({ error: 'Thiếu API key bí mật hoặc Shop ID.' }, { status: 400 });
  const action: Action = ['recent', 'backfill', 'restart', 'users', 'products'].includes(body.action ?? '')
    ? body.action! : 'recent';
  try {
    if (action === 'users') return Response.json({ ok: true, posId, action, ...(await syncUsers(env.DB, shop, apiKey)) });
    if (action === 'products') return Response.json({ ok: true, posId, action, ...(await syncProducts(env.DB, shop, apiKey)) });
    if (action === 'recent') return Response.json({ ok: true, posId, action, ...(await syncRecent(env.DB, shop, apiKey)) });
    let cursor: BackfillCursor | null = action === 'restart' ? null : parseCursor(shop.cursor);
    if (cursor?.completed && cursor.month > currentMonth())
      return Response.json({ ok: true, posId, action, completed: true, records: 0, cursor });
    if (!cursor) cursor = await startBackfillCursor(shop.shop_id, apiKey);
    cursor.completed = false;
    return Response.json({ ok: true, posId, action, ...(await syncBackfill(env.DB, shop, apiKey, cursor, 8)) });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Đồng bộ thất bại.';
    await env.DB.prepare("UPDATE pos_shops SET status='error',last_error=? WHERE id=?").bind(message.slice(0, 500), posId).run();
    return Response.json({ error: message }, { status: 502 });
  }
}
