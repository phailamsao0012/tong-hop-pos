// Tách khỏi app/api/sync/pos/route.ts (cải tổ B4/B5, 05/11/2026): chỉ dời chỗ, câu SQL giữ nguyên.
import { env } from 'cloudflare:workers';
import { POS } from '@/lib/shared/report-model';
import { parseCursor } from '@/lib/pancake/sync';

// Trạng thái đồng bộ. Mọi truy vấn đều chạy trên chỉ mục (COVERING INDEX) để không quét cả bảng đơn
// (bảng chứa JSON gốc rất nặng; quét toàn bộ từng làm D1 quá hạn CPU và reset, kéo theo lỗi 500 cho các trang khác).
const COUNTS_TTL = 30 * 60 * 1000;
let countsMemo: { at: number; results: unknown[][] } | null = null;
type StatsRow = { records: number; earliest_created_at: string | null; latest_created_at: string | null };

/** Trạng thái đồng bộ từng POS: số đơn (nhớ 30 phút), mốc đồng bộ, lỗi 24 giờ, lượt chạy gần đây. */
export async function syncStatus() {
  const perPos = POS.flatMap((p) => [
    env.DB.prepare('SELECT COUNT(*) AS records, MIN(created_at) AS earliest_created_at, MAX(created_at) AS latest_created_at FROM raw_pos_orders WHERE pos_id=?').bind(p.id),
    env.DB.prepare('SELECT COUNT(*) AS n FROM raw_pos_orders WHERE pos_id=? AND first_confirmed_at IS NOT NULL').bind(p.id),
    env.DB.prepare('SELECT SUM(seller_id IS NOT NULL) AS with_seller, SUM(seller_assigned_at IS NOT NULL) AS with_assignment_time FROM raw_pos_orders WHERE pos_id=?').bind(p.id),
  ]);
  const errors24h = await env.DB.prepare("SELECT pos_id, COUNT(*) AS n FROM sync_runs WHERE error IS NOT NULL AND started_at>=? GROUP BY pos_id").bind(new Date(Date.now() - 86400000).toISOString()).all<{ pos_id: string; n: number }>();
  const errorCount = new Map(errors24h.results.map((r) => [r.pos_id, r.n]));
  // Số đếm theo POS (đếm lại mọi đơn qua chỉ mục, ~0,8 s) gần như không đổi: nhớ 30 phút trong isolate.
  // Trạng thái đồng bộ (pos_shops, sync_runs) vẫn đọc mới mỗi lần. Trước đây trang gọi 1.700 lần/ngày × 6 POS.
  const fresh = countsMemo && Date.now() - countsMemo.at < COUNTS_TTL;
  const [shops, users, products, runs, ...countRes] = await env.DB.batch([
    env.DB.prepare('SELECT id,cursor,last_sync_at,users_synced_at,products_synced_at,last_error,status FROM pos_shops'),
    env.DB.prepare('SELECT pos_id, COUNT(*) AS n FROM pos_users GROUP BY pos_id'),
    env.DB.prepare('SELECT pos_id, COUNT(*) AS n FROM pos_products GROUP BY pos_id'),
    env.DB.prepare('SELECT pos_id,started_at,status,records,error FROM sync_runs ORDER BY started_at DESC LIMIT 60'),
    ...(fresh ? [] : perPos),
  ]);
  if (!fresh) countsMemo = { at: Date.now(), results: countRes.map((r) => r.results) };
  const counts = countsMemo!.results.map((results) => ({ results }));
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
  return POS.map((p) => {
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
  });
}

/** Ghi lỗi đồng bộ bấm tay của một POS. */
export const markSyncError = (posId: string, message: string) => env.DB.prepare("UPDATE pos_shops SET status='error',last_error=? WHERE id=?").bind(message.slice(0, 500), posId).run();
