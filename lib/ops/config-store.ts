// Tách khỏi app/api/config/route.ts (cải tổ B5, 05/11/2026): chỉ dời chỗ, câu SQL giữ nguyên.
import { env } from 'cloudflare:workers';

export type AlertRuleInput = { enabled: boolean; threshold: number; minReceived: number; cooldownMinutes: number; shiftStart: string; shiftEnd: string; repeat: boolean; chatId: string; employeeIds: string[] };

/** Quy tắc cảnh báo của người đang xem và trạng thái 6 POS (trang Cấu hình). */
export const alertRuleAndShops = (user: { userId: string }) => Promise.all([
  env.DB.prepare('SELECT * FROM alert_rules WHERE owner_id=?')
    .bind(user.userId)
    .first<Record<string, unknown>>(),
  env.DB.prepare(
    'SELECT id,shop_id,status,last_sync_at,history_start,last_error FROM pos_shops',
  ).all<Record<string, unknown>>(),
]);

/** Lưu Shop ID của một POS; đổi Shop ID thì đặt lại mốc đồng bộ. */
export const saveShopId = (pos: { id: string; name: string }, shopId: string | undefined) => env.DB.prepare(
      'INSERT INTO pos_shops (id,name,shop_id,status) VALUES (?,?,?,?) ON CONFLICT(id) DO UPDATE SET shop_id=excluded.shop_id,status=?,last_sync_at=NULL,recent_watermark=NULL,recent_cursor=NULL,last_error=NULL',
    )
      .bind(pos.id, pos.name, shopId || null, 'pending', 'pending')
      .run();

/** Lưu quy tắc cảnh báo tỷ lệ chốt của người đang xem. */
export const saveAlertRule = (user: { userId: string }, a: AlertRuleInput, now: string) => env.DB.prepare(
      'INSERT INTO alert_rules (owner_id,enabled,threshold,min_received,cooldown_minutes,shift_start,shift_end,repeat,chat_id,employee_ids_json,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(owner_id) DO UPDATE SET enabled=excluded.enabled,threshold=excluded.threshold,min_received=excluded.min_received,cooldown_minutes=excluded.cooldown_minutes,shift_start=excluded.shift_start,shift_end=excluded.shift_end,repeat=excluded.repeat,chat_id=excluded.chat_id,employee_ids_json=excluded.employee_ids_json,updated_at=excluded.updated_at',
    )
      .bind(
        user.userId,
        a.enabled ? 1 : 0,
        a.threshold,
        a.minReceived,
        a.cooldownMinutes,
        a.shiftStart,
        a.shiftEnd,
        a.repeat ? 1 : 0,
        String(a.chatId ?? '').trim(),
        JSON.stringify(a.employeeIds),
        now,
      )
      .run();
