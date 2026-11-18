import { env } from 'cloudflare:workers';
import { forbidden, getSessionUser, unauthorized } from '@/lib/auth/auth';
import { isOwner } from '@/lib/auth/access';
import { markDataChanged, trackDataWrites } from '@/lib/ops/data-version';
import { POS } from '@/lib/shared/report-model';
import {
  currentMonth, loadShop, parseCursor, startBackfillCursor,
  syncBackfill, syncProducts, syncRecent, syncUsers, type BackfillCursor,
} from '@/lib/pancake/sync';
import { markSyncError, syncStatus } from '@/lib/pancake/sync-status';
import { allowedPos } from '@/lib/auth/access';

// Trạng thái đồng bộ (lib/pancake/sync-status.ts).
export async function GET() {
  const user = await getSessionUser();
  if (!user) return unauthorized('Đăng nhập để xem dữ liệu POS.');
  const status = await syncStatus();
  if (isOwner(user)) return Response.json(status, { headers: { 'Cache-Control': 'no-store' } });
  // Người không phải chủ (1.4, Đầu não kiểm 17–18/11): chỉ POS được cấp, không trả nội dung lỗi thô của Pancake / máy chủ.
  const allowed = allowedPos(user), HIDDEN = 'Đồng bộ đang lỗi, chủ hệ thống xem chi tiết.';
  return Response.json(status.filter((s) => allowed.includes(s.posId)).map((s) => ({
    ...s, lastError: s.lastError ? HIDDEN : null, runs: s.runs.map((r) => ({ ...r, error: r.error ? HIDDEN : null })),
  })), { headers: { 'Cache-Control': 'no-store' } });
}

type Action = 'recent' | 'backfill' | 'restart' | 'users' | 'products';

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) return unauthorized('Không có quyền đồng bộ.');
  if (!isOwner(user)) return forbidden(); // Đợt 0, QA L2
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
  // Đồng bộ bấm tay có ghi dữ liệu thì ghi mốc "dữ liệu đổi" để cache báo cáo tính lại (lib/ops/data-version.ts).
  const tracker = trackDataWrites(env.DB);
  const db = tracker.db;
  try {
    if (action === 'users') return Response.json({ ok: true, posId, action, ...(await syncUsers(db, shop, apiKey)) });
    if (action === 'products') return Response.json({ ok: true, posId, action, ...(await syncProducts(db, shop, apiKey)) });
    if (action === 'recent') return Response.json({ ok: true, posId, action, ...(await syncRecent(db, shop, apiKey)) });
    let cursor: BackfillCursor | null = action === 'restart' ? null : parseCursor(shop.cursor);
    if (cursor?.completed && cursor.month > currentMonth())
      return Response.json({ ok: true, posId, action, completed: true, records: 0, cursor });
    if (!cursor) cursor = await startBackfillCursor(shop.shop_id, apiKey);
    cursor.completed = false;
    return Response.json({ ok: true, posId, action, ...(await syncBackfill(db, shop, apiKey, cursor, 8)) });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Đồng bộ thất bại.';
    await markSyncError(posId, message);
    return Response.json({ error: message }, { status: 502 });
  } finally {
    if (tracker.changed()) await markDataChanged(env.DB).catch((error) => console.error('mark data changed failed', error));
  }
}
