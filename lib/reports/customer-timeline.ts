import type { Access } from '@/lib/auth/access';
import { allowedPos } from '@/lib/auth/access';
import { maskPhone } from '@/lib/bot/bot-guard-core';
import { ORDER_STATUS } from '@/lib/pancake/pancake';
import { teamFilter } from '@/lib/teams/team';

export type TimelineItem = { id: string; kind: 'note' | 'status' | 'audit'; at: string; title: string; text: string };
export type TimelineData = {
  notes: { id: string; created_at: string; message: string; author_name: string | null }[];
  orders: { id: string; source_order_id: string; status_history_json: string | null }[];
  audits: { id: string; at: string; action: string; name: string | null }[];
};
const time = (s: string) => Date.parse(/(?:Z|[+-]\d{2}:\d{2})$/i.test(s) ? s : s + 'Z');
export const customerPhone = (phone: string, role: Access['role']) => role === 'owner' || role === 'director' ? phone : maskPhone(phone);
const privateText = (text: string, role: Access['role']) => role === 'owner' || role === 'director' ? text
  : text.replace(/(?<![\d+])(?:\+?84|0)(?:[\s.-]?\d){8,10}(?!\d)/g, (phone) => maskPhone(phone.replace(/\D/g, '')));

export function customerTimeline(data: TimelineData, role: Access['role']): TimelineItem[] {
  const items: TimelineItem[] = data.notes.map((n) => ({ id: 'note:' + n.id, kind: 'note', at: n.created_at,
    title: 'Ghi chú' + (n.author_name ? ' · ' + n.author_name : ''), text: n.message }));
  for (const order of data.orders.slice(0, 20)) {
    let history: unknown;
    try { history = JSON.parse(order.status_history_json ?? '[]'); } catch { continue; }
    if (!Array.isArray(history)) continue;
    history.forEach((h: unknown, i: number) => {
      if (!h || typeof h !== 'object') return;
      const v = h as Record<string, unknown>;
      if (typeof v.updated_at !== 'string') return;
      const label = (v: unknown) => typeof v === 'number' ? ORDER_STATUS[v] ?? String(v) : '—';
      items.push({ id: 'status:' + order.id + ':' + i, kind: 'status', at: v.updated_at,
        title: 'Đơn ' + order.source_order_id, text: label(v.old_status) + ' → ' + label(v.status) });
    });
  }
  if (role === 'owner') for (const a of data.audits) items.push({ id: 'audit:' + a.id, kind: 'audit', at: a.at,
    title: a.action === 'export' ? 'Tải hồ sơ khách' : 'Xem hồ sơ khách', text: a.name ?? 'Người dùng' });
  return items.filter((i) => Number.isFinite(time(i.at))).map((i) => ({ ...i, title: privateText(i.title, role), text: privateText(i.text, role) }))
    .sort((a, b) => time(b.at) - time(a.at) || a.id.localeCompare(b.id));
}

export async function customerAuditTarget(phone: string, posIds: string[]) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify([phone, [...posIds].sort()])));
  return 'customer:' + [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export const customerIdPosAllowed = (user: Access, posId: string) => allowedPos(user).includes(posId);

export async function loadCustomerTimeline(db: D1Database, user: Access, phone: string, requested: string[]) {
  const posIds = allowedPos(user).filter((id) => !requested.length || requested.includes(id));
  if (!posIds.length) return null;
  const ph = posIds.map(() => '?').join(',');
  const rows = await db.prepare('SELECT pos_id,name,orders,success_orders,success_net,returned_orders,cancelled_orders FROM customer_stats WHERE phone=? AND pos_id IN ('
    + ph + ')' + teamFilter('seller_id', user.team, false)).bind(phone, ...posIds)
    .all<{ pos_id: string; name: string; orders: number; success_orders: number; success_net: number; returned_orders: number; cancelled_orders: number }>();
  if (!rows.results.length) return null;
  const scoped = rows.results.map((r) => r.pos_id), placeholders = scoped.map(() => '?').join(',');
  // Mọi nguồn dùng cùng phạm vi khách; không đọc JSON gốc của đơn.
  const [notes, orders] = await db.batch([
    db.prepare('SELECT n.id,n.created_at,n.message,n.author_name FROM customer_notes n WHERE n.pos_id IN (' + placeholders
      + ') AND (n.phone=? OR EXISTS (SELECT 1 FROM pos_customers c WHERE c.pos_id=n.pos_id AND c.customer_id=n.customer_id AND c.phone=?)) ORDER BY n.created_at DESC,n.id').bind(...scoped, phone, phone),
    db.prepare('SELECT id,source_order_id,status_history_json FROM raw_pos_orders WHERE phone=? AND pos_id IN (' + placeholders + ')'
      + teamFilter('seller_id', user.team, false) + ' ORDER BY created_at DESC,id DESC LIMIT 20').bind(phone, ...scoped),
  ]);
  const target = await customerAuditTarget(phone, scoped);
  // Nhật ký cũ chỉ giữ đuôi SĐT, không ghép đoán vì có thể trùng khách.
  const audits = user.role === 'owner' ? await db.prepare("SELECT id,at,action,name FROM audit_log WHERE target=? AND action IN ('customer.view','export') ORDER BY at DESC LIMIT 100").bind(target).all<TimelineData['audits'][number]>() : { results: [] };
  const stats = rows.results.reduce((s, r) => ({ orders: s.orders + r.orders, success: s.success + r.success_orders,
    returned: s.returned + r.returned_orders, cancelled: s.cancelled + r.cancelled_orders, net: s.net + r.success_net }), { orders: 0, success: 0, returned: 0, cancelled: 0, net: 0 });
  return { name: privateText(rows.results[0].name || 'Khách', user.role), phone: customerPhone(phone, user.role), posIds: scoped, stats,
    notes: notes.results.length, timeline: customerTimeline({ notes: notes.results as TimelineData['notes'], orders: orders.results as TimelineData['orders'], audits: audits.results }, user.role),
    target };
}
export type CustomerTimelineDetail = NonNullable<Awaited<ReturnType<typeof loadCustomerTimeline>>>;
