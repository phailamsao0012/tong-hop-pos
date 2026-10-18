import { STATUS_PRESETS } from '../order-status';
import { allowedPos } from '../access';
import { scopeAllowed, type TaskData, type TaskScope, type TaskUser } from '../my-tasks';

const DAY = 86400000;
/** Việc ảo riêng, không ghi vào đơn hoặc làm đổi số báo cáo demo. */
export async function demoTaskData(db: D1Database, user: TaskUser, scope: TaskScope, now = Date.now()): Promise<TaskData> {
  const data: TaskData = { stuck: [], callback: [], dormant: [] };
  if (!scopeAllowed(user, scope) || !allowedPos(user).some((p) => p !== '__none__')) return data;
  const at = (days: number) => new Date(now - days * DAY).toISOString();
  const n = scope === 'mine' ? 1 : scope === 'team' ? 2 : 3;
  const posIds = allowedPos(user).filter((p) => p !== '__none__');
  const placeholders = posIds.map(() => '?').join(',');
  const codes = [...STATUS_PRESETS.new.codes, STATUS_PRESETS.processing.codes[0]];
  const orders = await db.prepare(`SELECT id,source_order_id FROM raw_pos_orders WHERE pos_id IN (${placeholders}) AND status_code IN (${codes.join(',')}) ORDER BY id LIMIT ?`)
    .bind(...posIds, n).all<{ id: string; source_order_id: string }>();
  const callbacks = await db.prepare(`SELECT id,phone FROM pos_customers WHERE pos_id IN (${placeholders}) ORDER BY id LIMIT ?`)
    .bind(...posIds, n).all<{ id: string; phone: string }>();
  const dormant = await db.prepare(`SELECT id,phone FROM pos_customers WHERE pos_id IN (${placeholders}) ORDER BY id LIMIT ? OFFSET ?`)
    .bind(...posIds, n, n).all<{ id: string; phone: string }>();
  data.stuck = orders.results.map((r, i) => ({ id: r.id, code: r.source_order_id, createdAt: at(i ? 1.5 : 3) }));
  data.callback = callbacks.results.map((r, i) => ({ id: r.id, phone: r.phone, lastNoteAt: at(i ? 17 : 21) }));
  data.dormant = dormant.results.map((r, i) => ({ customerId: r.id, phone: r.phone, lastAt: at(i ? 17 : 20), gap: 20 }));
  return data;
}
