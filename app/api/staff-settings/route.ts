import { forbidden, getSessionUser, unauthorized } from '@/lib/auth/auth';
import { isOwner } from '@/lib/auth/access';
import { listStaffSettings, saveStaffSettings } from '@/lib/teams/staff-settings';

// Ca làm việc theo giờ của từng nhân viên (không cố định): GET → danh sách; PUT {items:[{userId, shiftStart, shiftEnd}]} (chủ hệ thống).
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
  await saveStaffSettings({ items: body.items }, user);
  return Response.json({ ok: true, items: await listStaffSettings() });
}
