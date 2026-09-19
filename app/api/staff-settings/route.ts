import { env } from 'cloudflare:workers';
import { forbidden, getSessionUser, unauthorized } from '@/lib/auth';
import { isOwner } from '@/lib/access';

// Ca làm việc theo giờ của từng nhân viên (không cố định): GET → danh sách; PUT {items:[{userId, shiftStart, shiftEnd}]} (chủ hệ thống).
export type StaffSetting = { userId: string; shiftStart: number | null; shiftEnd: number | null };
export async function listStaffSettings(): Promise<StaffSetting[]> {
  const rows = await env.DB.prepare('SELECT user_id, shift_start, shift_end FROM staff_settings').all<{ user_id: string; shift_start: number | null; shift_end: number | null }>();
  return rows.results.map((r) => ({ userId: r.user_id, shiftStart: r.shift_start === null ? null : Number(r.shift_start), shiftEnd: r.shift_end === null ? null : Number(r.shift_end) }));
}

export async function GET() {
  if (!(await getSessionUser())) return unauthorized();
  return Response.json({ items: await listStaffSettings() }, { headers: { 'Cache-Control': 'private, no-store' } });
}

export async function PUT(request: Request) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  if (!isOwner(user)) return forbidden();
  let body: { items?: { userId?: string; shiftStart?: number | null; shiftEnd?: number | null }[] };
  try { body = await request.json(); } catch { return Response.json({ error: 'JSON không hợp lệ.' }, { status: 400 }); }
  if (!Array.isArray(body.items) || body.items.length > 500) return Response.json({ error: 'Dữ liệu không hợp lệ.' }, { status: 400 });
  const now = new Date().toISOString();
  const hour = (v: unknown, max: number) => { const n = Number(v); return v === null || v === undefined || v === '' || !Number.isFinite(n) ? null : Math.max(0, Math.min(max, Math.round(n))); };
  const statements: D1PreparedStatement[] = [];
  for (const it of body.items) {
    const userId = String(it.userId ?? '').slice(0, 100);
    if (!userId) continue;
    const start = hour(it.shiftStart, 23), end = hour(it.shiftEnd, 24);
    if (start === null && end === null) { statements.push(env.DB.prepare('DELETE FROM staff_settings WHERE user_id=?').bind(userId)); continue; }
    statements.push(env.DB.prepare('INSERT INTO staff_settings (user_id,shift_start,shift_end,updated_by,updated_at) VALUES (?,?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET shift_start=excluded.shift_start,shift_end=excluded.shift_end,updated_by=excluded.updated_by,updated_at=excluded.updated_at')
      .bind(userId, start, end, user.email, now));
  }
  for (let i = 0; i < statements.length; i += 100) await env.DB.batch(statements.slice(i, i + 100));
  return Response.json({ ok: true, items: await listStaffSettings() });
}
