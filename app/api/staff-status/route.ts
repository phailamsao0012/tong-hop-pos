import { forbidden, getSessionUser, unauthorized } from '@/lib/auth/auth';
import { isOwner } from '@/lib/auth/access';
import { audit } from '@/lib/ops/audit';
import { STAFF_STATUS_KEY } from '@/lib/teams/staff-status';
import { readStaffStatus, saveStaffStatus } from '@/lib/teams/staff-status-db';

// Trạng thái từng người (lib/teams/staff-status.ts): GET → {people: {id: 'paused'|'left'}}; PUT {changes: {id: trạng thái}} (chủ hệ thống).
export async function GET() {
  if (!(await getSessionUser())) return unauthorized();
  return Response.json({ people: await readStaffStatus() }, { headers: { 'Cache-Control': 'private, no-store' } });
}

export async function PUT(request: Request) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  if (!isOwner(user)) return forbidden();
  let body: { changes?: unknown };
  try { body = await request.json(); } catch { return Response.json({ error: 'JSON không hợp lệ.' }, { status: 400 }); }
  const people = await saveStaffStatus(body.changes);
  await audit({ action: 'staff-status.set', userId: user.userId, target: STAFF_STATUS_KEY, detail: JSON.stringify({ ids: Object.keys((body.changes ?? {}) as object).slice(0, 50) }), request });
  return Response.json({ ok: true, people });
}
