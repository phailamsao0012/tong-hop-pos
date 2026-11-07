import { env } from 'cloudflare:workers';
import { forbidden, getSessionUser, unauthorized } from '@/lib/auth/auth';
import { isOwner } from '@/lib/auth/access';
import { managedTeams, ownPosUserIds, readTargetSetting, saveKpi2, targetStaff } from '@/lib/kpi/targets';
import { KPI2_KEY, canWriteKpi2, mergeKpi2, parseKpi2, visibleKpi2 } from '@/lib/kpi/kpi2';
import { audit } from '@/lib/ops/audit';

// Chỉ tiêu KPI mới theo tháng (lib/kpi/kpi2.ts, anh Vũ 07/11/2026). Chủ hệ thống đặt KPI team; Leader / Mentor chia cho người của mình.
const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
const headers = { 'Cache-Control': 'private, no-store' };

async function scopeOf(user: NonNullable<Awaited<ReturnType<typeof getSessionUser>>>) {
  if (isOwner(user)) return { teams: null, staff: null };
  if (user.role === 'staff') return { teams: [] as string[], staff: await ownPosUserIds(env.DB, user.email) };
  return { teams: await managedTeams(env.DB, user), staff: await targetStaff(env.DB, user) };
}

export async function GET(request: Request) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  const month = new URL(request.url).searchParams.get('month') ?? '';
  if (!MONTH_RE.test(month)) return Response.json({ error: 'Tháng không hợp lệ.' }, { status: 400 });
  const { teams, staff } = await scopeOf(user);
  const map = parseKpi2((await readTargetSetting(KPI2_KEY(month)))?.value);
  return Response.json({ month, items: visibleKpi2(map, teams, staff), editable: user.role === 'staff' ? [] : staff }, { headers });
}

export async function PUT(request: Request) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  if (!['owner', 'director', 'lead', 'mentor'].includes(user.role)) return forbidden();
  let body: { month?: unknown; items?: unknown };
  try { body = await request.json(); } catch { return Response.json({ error: 'JSON không hợp lệ.' }, { status: 400 }); }
  const month = typeof body?.month === 'string' ? body.month : '';
  const items = Array.isArray(body?.items) ? body.items as { key?: unknown; value?: unknown }[] : null;
  if (!MONTH_RE.test(month) || !items || items.length > 500 || items.some((it) => !it || typeof it !== 'object' || typeof it.key !== 'string' || !/^(team|employee):[^\s]{1,100}$/.test(it.key)))
    return Response.json({ error: 'Dữ liệu không hợp lệ.' }, { status: 400 });
  const owner = isOwner(user), staff = owner ? null : await targetStaff(env.DB, user);
  if (items.some((it) => !canWriteKpi2(owner, staff, String(it.key)))) return forbidden();
  const stored = parseKpi2((await readTargetSetting(KPI2_KEY(month)))?.value);
  const next = mergeKpi2(stored, items.map((it) => ({ key: String(it.key), value: it.value })));
  const now = new Date().toISOString();
  await saveKpi2(KPI2_KEY(month), next, now);
  await audit({ action: 'targets.kpi2', userId: user.userId, target: month, detail: JSON.stringify({ keys: items.map((it) => it.key) }), request });
  const { teams } = await scopeOf(user);
  return Response.json({ ok: true, month, items: visibleKpi2(next, teams, staff), editable: staff }, { headers });
}
