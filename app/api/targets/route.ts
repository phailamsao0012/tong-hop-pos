import { env } from 'cloudflare:workers';
import { forbidden, getSessionUser, unauthorized } from '@/lib/auth/auth';
import { isOwner } from '@/lib/auth/access';
import { canWriteTarget, managedTeams, targetStaff, listTargets, parseTargetCosts, readTargetSetting, visibleTargets, writeTargets } from '@/lib/kpi/targets';
import { audit } from '@/lib/ops/audit';

// KPI team/POS chỉ chủ hệ thống; KPI cá nhân kiểm quyền từng người.
// scope: pos (cửa hàng), employee (tài khoản POS), team (team Sale/CSKH bên web nhân sự, refId = mã team).
const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
export async function GET(request: Request) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  const p = new URL(request.url).searchParams;
  const month = p.get('month') ?? '';
  if (!MONTH_RE.test(month)) return Response.json({ error: 'Tháng không hợp lệ.' }, { status: 400 });
  const [items, prev] = await Promise.all([listTargets(month), (async () => {
    const [y, m] = month.split('-').map(Number);
    const pm = new Date(Date.UTC(y, m - 2, 1)).toISOString().slice(0, 7);
    return { month: pm, items: await listTargets(pm) };
  })()]);
  if (isOwner(user)) return Response.json({ month, items, previous: prev }, { headers: { 'Cache-Control': 'private, no-store' } });
  const ids = user.role === 'staff' ? [] : await targetStaff(env.DB, user);
  // Leader / mentor / giám đốc: thấy KPI của team mình cầm (chỉ xem, đặt KPI team vẫn chỉ chủ hệ thống).
  const teams = await managedTeams(env.DB, user);
  return Response.json({ month, items: await visibleTargets(env.DB, user, items, ids, teams), previous: { ...prev, items: await visibleTargets(env.DB, user, prev.items, ids, teams) }, teams, ...(user.role === 'staff' ? {} : { editable: ids }) }, { headers: { 'Cache-Control': 'private, no-store' } });
}

export async function PUT(request: Request) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  if (!['owner', 'director', 'lead', 'mentor'].includes(user.role)) return forbidden();
  let body: { month?: string; only?: string[]; items?: { scope?: string; refId?: string; revenue?: number; closedOrders?: number; workingDays?: number | null; costCeiling?: number | null; closeRate?: number | null; aov?: number | null }[] };
  try { body = await request.json(); } catch { return Response.json({ error: 'JSON không hợp lệ.' }, { status: 400 }); }
  if (!body || typeof body !== 'object' || (Array.isArray(body.items) && body.items.some((it) => !it || typeof it !== 'object'))) return Response.json({ error: 'Dữ liệu không hợp lệ.' }, { status: 400 });
  const month = body.month ?? '';
  if (!MONTH_RE.test(month) || !Array.isArray(body.items) || body.items.length > 500) return Response.json({ error: 'Dữ liệu không hợp lệ.' }, { status: 400 });
  if (body.items.some((it) => !['pos', 'employee', 'team'].includes(it.scope ?? '') || typeof it.refId !== 'string' || !/^[^\s]{1,100}$/.test(it.refId)
    || [it.revenue, it.closedOrders, it.workingDays, it.closeRate, it.aov].some((value) => value != null && (typeof value !== 'number' || !Number.isFinite(value) || value < 0))))
    return Response.json({ error: 'Chỉ tiêu không hợp lệ.' }, { status: 400 });
  const ids = await targetStaff(env.DB, user);
  if (body.items.some((it) => !canWriteTarget(user, ids, String(it.scope), String(it.refId)))) return forbidden();
  if (body.only !== undefined && (!Array.isArray(body.only) || body.only.length > 500 || body.only.some((k) => typeof k !== 'string' || !/^(pos|employee|team):[^\s]{1,100}$/.test(k)))) return Response.json({ error: 'Phạm vi không hợp lệ.' }, { status: 400 });
  if (!isOwner(user) && !body.only) return Response.json({ error: 'Cần chỉ rõ từng KPI cần thay đổi.' }, { status: 400 });
  if (body.only?.some((k) => { const at = k.indexOf(':'); return !canWriteTarget(user, ids, k.slice(0, at), k.slice(at + 1)); })) return forbidden();
  const now = new Date().toISOString();
  const storedCaps = await readTargetSetting(`target_cost:${month}`);
  const caps = parseTargetCosts(storedCaps?.value);
  if (body.items.some((it) => it.closeRate != null && (it.closeRate > 100 || (it.scope !== 'employee' && it.scope !== 'team')))) return Response.json({ error: 'Tỉ lệ chốt không hợp lệ (0–100%).' }, { status: 400 });
  if (body.items.some((it) => it.aov != null && it.scope !== 'team')) return Response.json({ error: 'KPI trung bình đơn chỉ đặt cho cả team.' }, { status: 400 });
  const storedRates = await readTargetSetting(`target_rate:${month}`);
  const storedAov = await readTargetSetting(`target_aov:${month}`);
  for (const it of body.items) if (it.costCeiling != null && (it.scope !== 'team' || !Number.isFinite(it.costCeiling) || it.costCeiling < 0)) return Response.json({ error: 'Chi phí trần không hợp lệ.' }, { status: 400 });
  const only = await writeTargets(user, { only: body.only, items: body.items }, month, caps, storedRates, now, storedAov?.value ?? null);
  await audit({ action: 'targets.set', userId: user.userId, target: month, detail: JSON.stringify({ keys: only ?? body.items.map((it) => `${it.scope}:${it.refId}`) }), request });
  const saved = await listTargets(month);
  return Response.json({ ok: true, month, items: await visibleTargets(env.DB, user, saved, ids), editable: ids });
}
