// Tách khỏi app/api/dispatch/route.ts (cải tổ B5, 05/11/2026): chỉ dời chỗ, câu SQL giữ nguyên.
import { env } from 'cloudflare:workers';
import type { DispatchMode } from '@/lib/zalo/dispatch-core';
import { WORKING, teamFilter } from '@/lib/teams/team';

/** Trang Chia số: chế độ từng POS, sale nhận số, số đã chia hôm nay (từ `dayStart`), nhật ký chia. */
export const dispatchOverview = (dayStart: string) => Promise.all([
  env.DB.prepare('SELECT s.id, s.shop_id, d.mode, d.since, d.last_run_at, d.last_error, d.waiting, d.updated_by FROM pos_shops s LEFT JOIN dispatch_pos d ON d.pos_id=s.id')
    .all<{ id: string; shop_id: string | null; mode: string | null; since: string | null; last_run_at: string | null; last_error: string | null; waiting: number | null; updated_by: string | null }>(),
  env.DB.prepare(`SELECT u.user_id AS id, MAX(u.name) AS name, GROUP_CONCAT(DISTINCT u.pos_id) AS pos_ids,
        COALESCE(MAX(h.department), MAX(u.sale_group), '') AS team, COALESCE(MAX(d.is_on),0) AS is_on, MAX(d.on_since) AS on_since, MAX(d.last_assigned_at) AS last_assigned_at
      FROM pos_users u LEFT JOIN hr_pos_team h ON h.pos_user_id=u.user_id LEFT JOIN dispatch_staff d ON d.user_id=u.user_id
      WHERE u.name<>'' AND u.is_active=1 AND ${WORKING.replace('user_id', 'u.user_id')}${teamFilter('u.user_id', 'sale', false)} GROUP BY u.user_id ORDER BY team, name`)
    .all<{ id: string; name: string; pos_ids: string; team: string; is_on: number; on_since: string | null; last_assigned_at: string | null }>(),
  env.DB.prepare('SELECT seller_id, result, COUNT(*) AS n FROM dispatch_log WHERE at>=? GROUP BY seller_id, result').bind(dayStart)
    .all<{ seller_id: string | null; result: string; n: number }>(),
  env.DB.prepare('SELECT at, pos_id, order_id, order_at, customer, seller_name, mode, result, detail FROM dispatch_log ORDER BY at DESC LIMIT 150').all(),
]);

/** Bật / tắt nhận số cho các sale; trả tên để ghi nhật ký. */
export async function setStaffDispatch(ids: string[], on: boolean, now: string, by: string) {
  await env.DB.batch(ids.map((id) => env.DB.prepare(`INSERT INTO dispatch_staff (user_id, is_on, on_since, updated_at, updated_by) VALUES (?,?,?,?,?)
      ON CONFLICT(user_id) DO UPDATE SET is_on=excluded.is_on, on_since=CASE WHEN excluded.is_on=1 AND dispatch_staff.is_on=0 THEN excluded.on_since WHEN excluded.is_on=0 THEN NULL ELSE dispatch_staff.on_since END,
        updated_at=excluded.updated_at, updated_by=excluded.updated_by`).bind(id, on ? 1 : 0, on ? now : null, now, by)));
  const names = await env.DB.prepare(`SELECT MAX(name) AS name FROM pos_users WHERE user_id IN (${ids.map(() => '?').join(',')}) GROUP BY user_id`).bind(...ids).all<{ name: string }>();
  return names;
}

/** Đổi chế độ chia số của một POS; đổi chế độ thì mốc bắt đầu tính lại từ bây giờ. */
export const setPosDispatch = (posId: string, mode: DispatchMode, now: string, by: string) =>
  env.DB.prepare(`INSERT INTO dispatch_pos (pos_id, mode, since, last_error, waiting, updated_at, updated_by) VALUES (?,?,?,NULL,0,?,?)
      ON CONFLICT(pos_id) DO UPDATE SET mode=excluded.mode, since=CASE WHEN excluded.mode<>dispatch_pos.mode THEN excluded.since ELSE dispatch_pos.since END,
        last_error=NULL, waiting=0, updated_at=excluded.updated_at, updated_by=excluded.updated_by`)
      .bind(posId, mode, mode === 'off' ? null : now, now, by).run();

/** Dừng chia số mọi POS. */
export const stopAllDispatch = (now: string, by: string) =>
  env.DB.prepare("UPDATE dispatch_pos SET mode='off', updated_at=?, updated_by=? WHERE mode<>'off'").bind(now, by).run();
