import { env } from 'cloudflare:workers';
import { forbidden, getSessionUser, unauthorized } from '@/lib/auth/auth';
import { isOwner } from '@/lib/auth/access';
import { DATE_RE, addDays, daysBetween, todayVn } from '@/lib/shared/report-time';
import { GROWTH_DEPTS, type GrowthDept } from '@/lib/reports/growth-calc';
import { growthData, saveJoined } from '@/lib/reports/growth';
import { audit } from '@/lib/ops/audit';

// Tăng trưởng nhân viên: chỉ chủ hệ thống (anh Vũ 28/10/2026 "hiện tại chỉ theo a" = chỉ anh Vũ và anh Nghĩa xem).
const MAX_DAYS = 400;
const validDay = (s: string) => DATE_RE.test(s) && Number.isFinite(Date.parse(s)) && new Date(s).toISOString().slice(0, 10) === s;

export async function GET(request: Request) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  if (!isOwner(user)) return forbidden('Chỉ chủ hệ thống mới xem được phần này.');
  const p = new URL(request.url).searchParams;
  const dept = p.get('dept') as GrowthDept;
  if (!GROWTH_DEPTS.includes(dept)) return Response.json({ error: 'Bộ phận không hợp lệ.' }, { status: 400 });
  const today = todayVn();
  const end = p.get('end') ?? today, start = p.get('start') ?? addDays(end, -364);
  if (!validDay(start) || !validDay(end) || start > end || daysBetween(start, end) > MAX_DAYS)
    return Response.json({ error: `Khoảng ngày không hợp lệ (tối đa ${MAX_DAYS} ngày).` }, { status: 400 });
  const data = await growthData(env.DB, dept, start, end, today);
  return Response.json(data, { headers: { 'Cache-Control': 'private, no-store' } });
}

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  if (!isOwner(user)) return forbidden('Chỉ chủ hệ thống mới sửa được ngày vào.');
  const body = await request.json().catch(() => null) as { id?: unknown; joinedAt?: unknown } | null;
  const id = typeof body?.id === 'string' ? body.id.trim().slice(0, 100) : '';
  const joinedAt = body?.joinedAt === null || body?.joinedAt === '' ? null : typeof body?.joinedAt === 'string' && validDay(body.joinedAt) && body.joinedAt <= todayVn() ? body.joinedAt : undefined;
  if (!id || joinedAt === undefined) return Response.json({ error: 'Thiếu mã nhân viên hoặc ngày vào không hợp lệ.' }, { status: 400 });
  const known = await env.DB.prepare('SELECT 1 FROM pos_users WHERE user_id=? LIMIT 1').bind(id).first();
  if (!known) return Response.json({ error: 'Không tìm thấy nhân viên.' }, { status: 404 });
  await saveJoined(env.DB, id, joinedAt);
  await audit({ action: 'growth.joined', userId: user.userId, target: id, detail: JSON.stringify({ joinedAt }), request });
  return Response.json({ ok: true });
}
