// Ca làm việc theo giờ của từng nhân viên. Tách khỏi app/api/staff-settings/route.ts (cải tổ B5, 05/11/2026): chỉ dời chỗ, câu SQL giữ nguyên.
import { env } from 'cloudflare:workers';

export type StaffSetting = { userId: string; shiftStart: number | null; shiftEnd: number | null };
export async function listStaffSettings(): Promise<StaffSetting[]> {
  const rows = await env.DB.prepare('SELECT user_id, shift_start, shift_end FROM staff_settings').all<{ user_id: string; shift_start: number | null; shift_end: number | null }>();
  return rows.results.map((r) => ({ userId: r.user_id, shiftStart: r.shift_start === null ? null : Number(r.shift_start), shiftEnd: r.shift_end === null ? null : Number(r.shift_end) }));
}

/** Ghi ca của từng người (PUT, chủ hệ thống): cả hai giờ trống thì xoá dòng. */
export async function saveStaffSettings(body: { items: { userId?: string; shiftStart?: number | null; shiftEnd?: number | null }[] }, user: { email: string }) {
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
}
