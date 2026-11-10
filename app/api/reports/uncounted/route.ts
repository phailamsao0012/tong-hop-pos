import { forbidden, getSessionUser, unauthorized } from '@/lib/auth/auth';
import { canView, isOwner } from '@/lib/auth/access';
import { auditHeaders } from '@/lib/ops/audit';
import { COUNTED_STAFF_KEY } from '@/lib/teams/team';
import { NOTES_KEY, posUserName, readJson, uncountedOrders, uncountedReport, uncountedScope as scope, writeJson, type Note, type Role } from '@/lib/reports/uncounted-report';

// Doanh thu của người không được tính doanh số (lib/reports/uncounted-report.ts).

export async function GET(request: Request) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  if (!canView(user, 'uncounted') && !canView(user, 'overview')) return forbidden('Không có quyền xem.');
  const p = new URL(request.url).searchParams;
  const s = scope(p);
  if ('error' in s) return Response.json({ error: s.error }, { status: 400 });
  // Danh sách đơn của một người (bấm "Xem đơn").
  const who = p.get('orders'), role = p.get('role') === 'marketer' ? 'marketer' : 'seller';
  if (who) return Response.json(await uncountedOrders(s, who, role), { headers: { 'Cache-Control': 'private, no-store' } });
  return Response.json(await uncountedReport(s, user), { headers: { 'Cache-Control': 'private, no-store' } });
}

/**
 * { action: 'note', role, userId, text } — ghi nguyên nhân (ai xem được trang thì ghi được);
 * { action: 'count', userId, counted } — bật / tắt "Vẫn tính" (chỉ chủ hệ thống).
 */
export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  const body = await request.json().catch(() => null) as { action?: unknown; role?: unknown; userId?: unknown; text?: unknown; counted?: unknown } | null;
  const userId = typeof body?.userId === 'string' ? body.userId.trim() : '';
  if (!userId || userId.length > 80) return Response.json({ error: 'Thiếu người.' }, { status: 400 });
  const known = await posUserName(userId);
  if (!known?.name) return Response.json({ error: 'Không thấy người này trong danh sách nhân viên POS.' }, { status: 404 });
  if (body?.action === 'note') {
    if (!canView(user, 'uncounted')) return forbidden('Không có quyền ghi nguyên nhân.');
    const role: Role = body.role === 'marketer' ? 'marketer' : 'seller';
    const text = typeof body.text === 'string' ? body.text.trim().slice(0, 500) : '';
    const notes = await readJson<Record<string, Note>>(NOTES_KEY, {});
    if (text) notes[`${role}:${userId}`] = { text, by: user.displayName || user.email, at: new Date().toISOString() };
    else delete notes[`${role}:${userId}`];
    await writeJson(NOTES_KEY, notes);
    return Response.json({ ok: true, note: notes[`${role}:${userId}`] ?? null }, { headers: auditHeaders(`Ghi nguyên nhân doanh thu không tính: ${known.name}`, 'staff.uncounted.note') });
  }
  if (!isOwner(user)) return forbidden('Chỉ chủ hệ thống đổi danh sách tính doanh số.');
  if (typeof body?.counted !== 'boolean') return Response.json({ error: 'Thiếu lựa chọn.' }, { status: 400 });
  const raw = await readJson<unknown>(COUNTED_STAFF_KEY, []);
  const list = new Set(Array.isArray(raw) ? raw.filter((x): x is string => typeof x === 'string') : []);
  if (body.counted) list.add(userId); else list.delete(userId);
  await writeJson(COUNTED_STAFF_KEY, [...list]);
  return Response.json({ ok: true, extra: [...list] }, { headers: auditHeaders(`${body.counted ? 'Vẫn tính doanh số' : 'Bỏ tính doanh số'}: ${known.name}`, 'staff.counted') });
}
