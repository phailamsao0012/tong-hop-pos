// Chia số thử nghiệm (03/10/2026, anh Vũ): sale vào ca thì bật, hết ca thì tắt. Mỗi phút web tổng lấy đơn mới
// chưa có người bán trên các POS đang bật chia số, chia lần lượt cho những sale đang bật và ghi người nhận vào đơn trên Pancake.
// Chạy thử (dry) chỉ ghi nhật ký, không đụng Pancake. Chạy thật (live) ghi xong đọc lại đơn để kiểm tra;
// có gì lạ (không nhận người bán, đơn đổi khác) thì tự tắt POS đó và ghi lỗi.
import { env } from 'cloudflare:workers';
import { getOrder, listOrdersPage, pancakeSend, type SourceOrder } from '@/lib/pancake';
import { MAX_PER_RUN, customerLabel, parseMode, pickCandidates, roundRobin, sellerOf, type DispatchMode, type Staff } from '@/lib/dispatch-core';
import { WORKING } from '@/lib/team';

const LOCK_KEY = 'dispatch_lock';
const LOCK_MS = 90000;
/** Nhìn lại tối đa 3 giờ (đơn tạo trước lúc bật chia số không bao giờ bị đụng tới). */
const LOOKBACK_MS = 3 * 3600000;

async function lock(now: number) {
  const at = new Date(now).toISOString();
  await env.DB.prepare('INSERT OR IGNORE INTO app_settings (key, value, updated_at) VALUES (?, ?, ?)').bind(LOCK_KEY, '0', at).run();
  const r = await env.DB.prepare('UPDATE app_settings SET value=?, updated_at=? WHERE key=? AND CAST(value AS INTEGER) < ?')
    .bind(String(now), at, LOCK_KEY, now - LOCK_MS).run();
  return (r.meta.changes ?? 0) > 0;
}
const unlock = () => env.DB.prepare('UPDATE app_settings SET value=? WHERE key=?').bind('0', LOCK_KEY).run();

type PosRow = { pos_id: string; mode: string; since: string | null; shop_id: string | null };

async function log(e: { posId: string; order: SourceOrder; seller?: Staff | null; mode: DispatchMode; result: string; detail?: string | null }) {
  await env.DB.prepare('INSERT INTO dispatch_log (id,at,pos_id,order_id,order_at,customer,seller_id,seller_name,mode,result,detail) VALUES (?,?,?,?,?,?,?,?,?,?,?)')
    .bind(crypto.randomUUID(), new Date().toISOString(), e.posId, String(e.order.id), e.order.inserted_at ?? null, customerLabel(e.order),
      e.seller?.id ?? null, e.seller?.name ?? null, e.mode, e.result, e.detail?.slice(0, 500) ?? null).run();
}

async function pausePos(posId: string, reason: string) {
  await env.DB.prepare("UPDATE dispatch_pos SET mode='off', last_error=?, updated_at=?, updated_by='Tự tắt' WHERE pos_id=?")
    .bind(reason.slice(0, 500), new Date().toISOString(), posId).run();
}

/** Sale đang bật nhận số và có tài khoản trên POS này (còn làm theo web nhân sự). */
async function staffFor(posId: string): Promise<Staff[]> {
  const rows = await env.DB.prepare(`SELECT d.user_id AS id, MAX(u.name) AS name, d.last_assigned_at AS last FROM dispatch_staff d
      JOIN pos_users u ON u.user_id=d.user_id AND u.pos_id=? AND u.is_active=1
    WHERE d.is_on=1 AND ${WORKING.replace('user_id', 'd.user_id')} GROUP BY d.user_id`).bind(posId)
    .all<{ id: string; name: string; last: string | null }>();
  return rows.results.map((r) => ({ id: r.id, name: r.name, lastAssignedAt: r.last }));
}

async function runPos(p: PosRow, apiKey: string, now: Date) {
  const mode = parseMode(p.mode);
  if (!p.shop_id || !p.since) throw new Error(p.shop_id ? 'Chưa có mốc bật.' : 'POS chưa ghép Shop ID Pancake.');
  const start = Math.max(Date.parse(p.since), now.getTime() - LOOKBACK_MS);
  const page = await listOrdersPage(p.shop_id, apiKey, {
    page_size: '100', page_number: '1', updateStatus: 'inserted_at', option_sort: 'inserted_at_desc',
    startDateTime: String(Math.floor(start / 1000) - 60), endDateTime: String(Math.floor(now.getTime() / 1000) + 3600),
  });
  const orders = Array.isArray(page.data) ? page.data : [];
  const ids = orders.map((o) => String(o.id ?? '')).filter(Boolean);
  const handled = new Set<string>();
  if (ids.length) {
    const done = await env.DB.prepare(`SELECT order_id FROM dispatch_log WHERE pos_id=? AND result IN ('ok','dry') AND order_id IN (${ids.map(() => '?').join(',')})`)
      .bind(p.pos_id, ...ids).all<{ order_id: string }>();
    for (const r of done.results) handled.add(r.order_id);
  }
  const candidates = pickCandidates(orders, p.since, handled);
  const staff = await staffFor(p.pos_id);
  const plan = roundRobin(candidates.slice(0, MAX_PER_RUN), staff, now);
  let assigned = 0;
  for (const { order, staff: s } of plan) {
    if (mode === 'dry') {
      await log({ posId: p.pos_id, order, seller: s, mode, result: 'dry', detail: 'Chạy thử: chưa ghi lên Pancake.' });
    } else {
      const orderId = String(order.id);
      try {
        await pancakeSend('PUT', `/shops/${p.shop_id}/orders/${encodeURIComponent(orderId)}`, apiKey, { assigning_seller_id: s.id });
        const after = await getOrder(p.shop_id, orderId, apiKey);
        const got = sellerOf(after);
        const itemsBefore = order.items?.length ?? 0, itemsAfter = after.items?.length ?? 0;
        if (got !== s.id) {
          const why = `Pancake không nhận người bán (đơn ${orderId} đang là ${got ?? 'trống'}). Đã tự tắt chia số POS này.`;
          await log({ posId: p.pos_id, order, seller: s, mode, result: 'error', detail: why });
          await pausePos(p.pos_id, why);
          return { assigned, waiting: candidates.length - assigned };
        }
        if (itemsBefore !== itemsAfter || (order.total_price ?? null) !== (after.total_price ?? null)) {
          const why = `Đơn ${orderId} đổi sản phẩm/tiền sau khi ghi (${itemsBefore}→${itemsAfter} dòng). Đã tự tắt chia số POS này, cần kiểm tra trên Pancake.`;
          await log({ posId: p.pos_id, order, seller: s, mode, result: 'error', detail: why });
          await pausePos(p.pos_id, why);
          return { assigned, waiting: candidates.length - assigned };
        }
        await log({ posId: p.pos_id, order, seller: s, mode, result: 'ok' });
      } catch (error) {
        const why = error instanceof Error ? error.message : String(error);
        await log({ posId: p.pos_id, order, seller: s, mode, result: 'error', detail: why });
        await pausePos(p.pos_id, `Lỗi ghi lên Pancake: ${why} Đã tự tắt chia số POS này.`);
        return { assigned, waiting: candidates.length - assigned };
      }
    }
    assigned++;
    await env.DB.prepare('UPDATE dispatch_staff SET last_assigned_at=? WHERE user_id=?').bind(s.lastAssignedAt, s.id).run();
  }
  return { assigned, waiting: candidates.length - assigned };
}

/** Một lượt chia số cho mọi POS đang bật (Cron mỗi phút gọi). */
export async function runDispatch(now = new Date()) {
  let rows: PosRow[];
  try {
    rows = (await env.DB.prepare(`SELECT d.pos_id, d.mode, d.since, s.shop_id FROM dispatch_pos d LEFT JOIN pos_shops s ON s.id=d.pos_id WHERE d.mode IN ('dry','live')`)
      .all<PosRow>()).results;
  } catch { return; } // bảng chưa có (migration chưa chạy)
  if (!rows.length) return;
  const apiKey = env.PANCAKE_POS_API_KEY?.trim();
  if (!apiKey) return;
  if (!(await lock(now.getTime()))) return;
  try {
    for (const p of rows) {
      try {
        const r = await runPos(p, apiKey, now);
        await env.DB.prepare("UPDATE dispatch_pos SET last_run_at=?, waiting=?, last_error=CASE WHEN mode='off' THEN last_error ELSE NULL END WHERE pos_id=?")
          .bind(now.toISOString(), r.waiting, p.pos_id).run();
      } catch (error) {
        const why = error instanceof Error ? error.message : String(error);
        console.error('dispatch failed', p.pos_id, error);
        await env.DB.prepare('UPDATE dispatch_pos SET last_run_at=?, last_error=? WHERE pos_id=?').bind(now.toISOString(), `Không đọc được đơn mới: ${why}`.slice(0, 500), p.pos_id).run();
      }
    }
  } finally { await unlock(); }
}
