// Tách khỏi app/api/audit/route.ts (cải tổ B5, 05/11/2026): chỉ dời chỗ, câu SQL giữ nguyên.
import { env } from 'cloudflare:workers';
import { AUDIT_GROUPS } from '@/lib/ops/audit-labels';

// Nhật ký hoạt động (chỉ chủ hệ thống): lọc theo ngày, người, nhóm hành động, tìm chữ; phân trang; size lớn để xuất Excel.
export const KEEP_DAYS = 400;
export type AuditRow = { id: string; at: string; user_id: string | null; email: string | null; name: string | null; action: string; target: string | null; detail: string | null; status: number | null; ip: string | null; device: string | null };

/** Một trang nhật ký theo bộ lọc trên URL (ngày giờ VN, người, nhóm / hành động, chữ); thỉnh thoảng dọn bản ghi quá cũ. */
export async function auditLogPage(q: URLSearchParams, size: number, page: number) {
  const from = q.get('from') ?? '', to = q.get('to') ?? '';
  const userId = q.get('userId') ?? '', group = q.get('group') ?? '', action = q.get('action') ?? '', text = (q.get('q') ?? '').trim().slice(0, 100);
  const where: string[] = []; const args: (string | number)[] = [];
  // Ngày theo giờ Việt Nam (UTC+7) → chuyển sang mốc UTC.
  if (/^\d{4}-\d{2}-\d{2}$/.test(from)) { where.push('at>=?'); args.push(new Date(`${from}T00:00:00+07:00`).toISOString()); }
  if (/^\d{4}-\d{2}-\d{2}$/.test(to)) { where.push('at<?'); args.push(new Date(new Date(`${to}T00:00:00+07:00`).getTime() + 86400000).toISOString()); }
  if (userId) { where.push('user_id=?'); args.push(userId); }
  if (action) { where.push('action=?'); args.push(action); }
  else if (group) { const g = AUDIT_GROUPS.find((x) => x.id === group); if (g) { where.push(`action IN (${g.actions.map(() => '?').join(',')})`); args.push(...g.actions); } }
  if (text) { where.push('(email LIKE ? OR name LIKE ? OR target LIKE ? OR detail LIKE ? OR ip LIKE ?)'); const like = `%${text}%`; args.push(like, like, like, like, like); }
  const sql = where.length ? ` WHERE ${where.join(' AND ')}` : '';
  const [rows, count, users] = await env.DB.batch([
    env.DB.prepare(`SELECT id,at,user_id,email,name,action,target,detail,status,ip,device FROM audit_log${sql} ORDER BY at DESC LIMIT ? OFFSET ?`).bind(...args, size, (page - 1) * size),
    env.DB.prepare(`SELECT COUNT(*) AS n FROM audit_log${sql}`).bind(...args),
    env.DB.prepare('SELECT id,name,email FROM users ORDER BY name'),
  ]);
  // Dọn bản ghi quá cũ (thỉnh thoảng, rẻ nhờ chỉ mục theo thời gian).
  if (Math.random() < 0.05) await env.DB.prepare('DELETE FROM audit_log WHERE at<?').bind(new Date(Date.now() - KEEP_DAYS * 86400000).toISOString()).run().catch(() => undefined);
  return { rows: rows.results as AuditRow[], count: Number((count.results[0] as { n: number })?.n ?? 0), users };
}
