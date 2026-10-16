import type { Access } from './access';
import { allowedPos } from './access';
import { maskPhone } from './bot-guard-core';
import { STATUS_PRESETS } from './order-status';
import { todayVn } from './report-time';
import { teamFilter } from './team';

const DAY = 86400000;
export type TaskScope = 'mine' | 'team' | 'all';
export type TaskUser = Access & { email: string };
export type TaskState = 'overdue' | 'today' | 'planned';
export type MyTask = { kind: 'stuck' | 'callback' | 'dormant'; id: string; customerId?: string; title: string; subtitle: string; dueAt: string | null; state: TaskState; link: { view: 'raw-orders' | 'customer360'; hint: Record<string, string> } };
export type TaskData = {
  stuck: { id: string; code: string; createdAt: string }[];
  callback: { id: string; phone: string; lastNoteAt: string | null }[];
  dormant: { customerId: string; phone: string; lastAt: string; gap: number }[];
};
// Pancake lưu UTC không hậu tố; ngày tới hạn không phụ thuộc múi giờ máy.
export const taskTime = (value: string) => Date.parse(/(?:Z|[+-]\d{2}:\d{2})$/i.test(value) ? value : value + 'Z');
export function scopeAllowed(user: TaskUser, scope: TaskScope) {
  return scope === 'mine' || (scope === 'team' ? user.role !== 'staff' : user.role === 'owner' || user.role === 'director');
}
export function dueState(dueAt: string, now: number): TaskState {
  const day = todayVn(taskTime(dueAt)), today = todayVn(now);
  return day < today ? 'overdue' : day === today ? 'today' : 'planned';
}
export function stuckState(createdAt: string, now: number): TaskState | null {
  const age = now - taskTime(createdAt);
  return !Number.isFinite(age) || age <= DAY ? null : age > 2 * DAY ? 'overdue' : 'today';
}
export function buildMyTasks(data: TaskData, user: TaskUser, now = Date.now()) {
  const items: MyTask[] = [];
  const phoneOut = (phone: string) => user.role === 'owner' || user.role === 'director' ? phone : maskPhone(phone);
  for (const row of data.stuck) {
    const state = stuckState(row.createdAt, now);
    if (state) items.push({ kind: 'stuck', id: row.id, title: 'Đơn kẹt Mới / Chờ xác nhận', subtitle: row.code,
      dueAt: new Date(taskTime(row.createdAt) + 2 * DAY).toISOString(), state, link: { view: 'raw-orders', hint: { 'raw.q': row.code } } });
  }
  for (const row of data.callback) {
    const last = row.lastNoteAt === null ? null : taskTime(row.lastNoteAt);
    if (last !== null && (!Number.isFinite(last) || now - last < 15 * DAY)) continue;
    const dueAt = last === null ? null : new Date(last + 20 * DAY).toISOString();
    const phone = phoneOut(row.phone);
    items.push({ kind: 'callback', id: row.id, customerId: row.id, title: 'Khách cần ghi chú chăm sóc', subtitle: phone, dueAt,
      state: dueAt === null || now - last! > 20 * DAY ? 'overdue' : dueState(dueAt, now),
      link: { view: 'customer360', hint: { 'customer360.phone': phone } } });
  }
  for (const [i, row] of data.dormant.entries()) {
    const at = taskTime(row.lastAt) + row.gap * DAY;
    if (!Number.isFinite(at)) continue;
    const dueAt = new Date(at).toISOString();
    if (todayVn(at) > todayVn(now + 7 * DAY) || todayVn(at) < todayVn(now - 30 * DAY)) continue;
    const phone = phoneOut(row.phone);
    // Khóa customer_stats chứa SĐT nên không dùng làm id trả về.
    items.push({ kind: 'dormant', id: 'dormant:' + i, customerId: row.customerId, title: 'Khách tới hạn gọi lại', subtitle: phone, dueAt,
      state: dueState(dueAt, now), link: { view: 'customer360', hint: { 'customer360.phone': phone } } });
  }
  const rank = { overdue: 0, today: 1, planned: 2 };
  items.sort((a, b) => rank[a.state] - rank[b.state] || (a.dueAt ?? '').localeCompare(b.dueAt ?? '') || a.id.localeCompare(b.id));
  const counts = { overdue: 0, today: 0, planned: 0 };
  for (const item of items) counts[item.state]++;
  return { counts, items };
}

export async function loadTaskData(db: D1Database, user: TaskUser, scope: TaskScope, now = Date.now()): Promise<TaskData> {
  if (!scopeAllowed(user, scope)) throw new Error('Phạm vi việc không được phép.');
  const posIds = allowedPos(user);
  if (!posIds.length) return { stuck: [], callback: [], dormant: [] };
  const ph = posIds.map(() => '?').join(',');
  const email = scope === 'mine' ? ' AND lower(u.email)=lower(?)' : '';
  const employee = (match: string) => 'EXISTS (SELECT 1 FROM pos_users u WHERE u.pos_id=t.pos_id AND (' + match + ')' + email + teamFilter('u.user_id', user.team, false) + ')';
  const mine = scope === 'mine' ? [user.email] : [];
  const utc = (at: number) => new Date(at).toISOString().slice(0, 19);
  const codes = [...STATUS_PRESETS.new.codes, STATUS_PRESETS.processing.codes[0]].join(',');
  const stuck = await db.prepare('SELECT t.id,t.source_order_id AS code,t.created_at AS createdAt FROM raw_pos_orders t INDEXED BY idx_raw_orders_pos_status_origin'
    + ' WHERE t.pos_id IN (' + ph + ') AND t.status_code IN (' + codes + ') AND t.created_at>=? AND t.created_at<? AND '
    + employee('u.user_id=t.seller_id OR u.user_id=t.creator_id') + ' ORDER BY t.created_at,t.id LIMIT 200')
    .bind(...posIds, utc(now - 30 * DAY), utc(now - DAY), ...mine).all<TaskData['stuck'][number]>();
  const callback = await db.prepare("SELECT t.id,COALESCE(t.phone,'') AS phone,t.last_note_at AS lastNoteAt FROM pos_customers t WHERE t.pos_id IN ("
    + ph + ') AND (t.last_note_at IS NULL OR t.last_note_at<=?) AND ' + employee('u.user_id=t.assigned_user_id') + ' ORDER BY t.last_note_at,t.id LIMIT 300')
    .bind(...posIds, utc(now - 15 * DAY), ...mine).all<TaskData['callback'][number]>();
  // Giữ cách gộp và trung vị của customer360; lọc người trước LIMIT.
  const dormant = await db.prepare("WITH merged AS (SELECT phone,SUM(success_orders) AS so,MIN(first_success_at) AS fs,MAX(last_success_at) AS ls,"
    + 'MAX(seller_id) AS seller_id,SUM(success_net) AS net FROM customer_stats WHERE pos_id IN (' + ph + ") AND phone<>'' GROUP BY phone),"
    + ' repeaters AS (SELECT (julianday(ls)-julianday(fs))/(so-1) AS gap FROM merged WHERE so>=2 AND fs IS NOT NULL AND ls>fs),'
    + ' due AS (SELECT *,CASE WHEN so>=2 AND ls>fs THEN (julianday(ls)-julianday(fs))/(so-1)'
    + ' ELSE (SELECT gap FROM repeaters ORDER BY gap LIMIT 1 OFFSET (SELECT COUNT(*)/2 FROM repeaters)) END AS gap FROM merged)'
    + ' SELECT (SELECT MAX(c.id) FROM pos_customers c WHERE c.phone=due.phone AND c.pos_id IN (' + ph + ')) AS customerId,phone,ls AS lastAt,gap FROM due WHERE so>=1 AND ls IS NOT NULL AND gap IS NOT NULL'
    + ' AND customerId IS NOT NULL AND julianday(?) - julianday(ls) BETWEEN gap-8 AND gap+31'
    + ' AND EXISTS (SELECT 1 FROM pos_users u WHERE u.pos_id IN (' + ph + ') AND u.user_id=due.seller_id'
    + email + teamFilter('u.user_id', user.team, false) + ') ORDER BY net DESC,phone LIMIT 300')
    .bind(...posIds, ...posIds, utc(now), ...posIds, ...mine).all<TaskData['dormant'][number]>();
  return { stuck: stuck.results, callback: callback.results, dormant: dormant.results };
}
