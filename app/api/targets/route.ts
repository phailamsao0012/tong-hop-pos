import { env } from 'cloudflare:workers';
import { forbidden, getSessionUser, unauthorized } from '@/lib/auth';
import { isOwner } from '@/lib/access';
import { POS } from '@/lib/report-model';
import { canWriteTarget, targetStaff, listTargets, parseTargetCosts, visibleTargets } from '@/lib/targets';
import { audit } from '@/lib/audit';

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
  return Response.json({ month, items: await visibleTargets(env.DB, user, items, ids), previous: { ...prev, items: await visibleTargets(env.DB, user, prev.items, ids) }, ...(user.role === 'staff' ? {} : { editable: ids }) }, { headers: { 'Cache-Control': 'private, no-store' } });
}

export async function PUT(request: Request) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  if (!['owner', 'director', 'lead', 'mentor'].includes(user.role)) return forbidden();
  let body: { month?: string; only?: string[]; items?: { scope?: string; refId?: string; revenue?: number; closedOrders?: number; workingDays?: number | null; costCeiling?: number | null }[] };
  try { body = await request.json(); } catch { return Response.json({ error: 'JSON không hợp lệ.' }, { status: 400 }); }
  if (!body || typeof body !== 'object' || (Array.isArray(body.items) && body.items.some((it) => !it || typeof it !== 'object'))) return Response.json({ error: 'Dữ liệu không hợp lệ.' }, { status: 400 });
  const month = body.month ?? '';
  if (!MONTH_RE.test(month) || !Array.isArray(body.items) || body.items.length > 500) return Response.json({ error: 'Dữ liệu không hợp lệ.' }, { status: 400 });
  if (body.items.some((it) => !['pos', 'employee', 'team'].includes(it.scope ?? '') || typeof it.refId !== 'string' || !/^[^\s]{1,100}$/.test(it.refId)
    || [it.revenue, it.closedOrders, it.workingDays].some((value) => value != null && (typeof value !== 'number' || !Number.isFinite(value) || value < 0))))
    return Response.json({ error: 'Chỉ tiêu không hợp lệ.' }, { status: 400 });
  const ids = await targetStaff(env.DB, user);
  if (body.items.some((it) => !canWriteTarget(user, ids, String(it.scope), String(it.refId)))) return forbidden();
  if (body.only !== undefined && (!Array.isArray(body.only) || body.only.length > 500 || body.only.some((k) => typeof k !== 'string' || !/^(pos|employee|team):[^\s]{1,100}$/.test(k)))) return Response.json({ error: 'Phạm vi không hợp lệ.' }, { status: 400 });
  if (!isOwner(user) && !body.only) return Response.json({ error: 'Cần chỉ rõ từng KPI cần thay đổi.' }, { status: 400 });
  if (body.only?.some((k) => { const at = k.indexOf(':'); return !canWriteTarget(user, ids, k.slice(0, at), k.slice(at + 1)); })) return forbidden();
  const now = new Date().toISOString();
  const storedCaps = await env.DB.prepare('SELECT value FROM app_settings WHERE key=?').bind(`target_cost:${month}`).first<{ value: string }>();
  const caps = parseTargetCosts(storedCaps?.value);
  for (const it of body.items) if (it.costCeiling != null && (it.scope !== 'team' || !Number.isFinite(it.costCeiling) || it.costCeiling < 0)) return Response.json({ error: 'Chi phí trần không hợp lệ.' }, { status: 400 });
  // only = danh sách khóa "scope:refId" được trang gọi quản lý (ví dụ KPI CSKH): chỉ thay các dòng đó, giữ nguyên phần còn lại của tháng.
  const only = Array.isArray(body.only) ? body.only.map(String).filter((k) => /^(pos|employee|team):[^\s]{1,100}$/.test(k)).slice(0, 500) : null;
  const statements = only
    ? only.map((k) => env.DB.prepare('DELETE FROM targets WHERE id=?').bind(`${month}:${k}`))
    : [env.DB.prepare('DELETE FROM targets WHERE month=?').bind(month)];
  if (isOwner(user)) {
    if (only) { for (const k of only) if (k.startsWith('team:')) delete caps[k.slice(5)]; } else { for (const k of Object.keys(caps)) delete caps[k]; }
  }
  for (const it of body.items) {
    const scope = it.scope === 'pos' || it.scope === 'employee' || it.scope === 'team' ? it.scope : null;
    const refId = String(it.refId ?? '').slice(0, 100);
    const revenue = Math.max(0, Math.round(Number(it.revenue) || 0)), closed = Math.max(0, Math.round(Number(it.closedOrders) || 0));
    const workingDays = scope === 'employee' && it.workingDays != null && Number(it.workingDays) > 0 ? Math.min(31, Math.round(Number(it.workingDays))) : null;
    if (!scope || !refId || (scope === 'pos' && !POS.some((p) => p.id === refId)) || (!revenue && !closed && !workingDays && it.costCeiling == null)) continue;
    if (only && !only.includes(`${scope}:${refId}`)) continue;
    if (scope === 'team' && it.costCeiling != null) caps[refId] = it.costCeiling;
    statements.push(env.DB.prepare('INSERT INTO targets (id,month,scope,ref_id,revenue,closed_orders,working_days,updated_by,updated_at) VALUES (?,?,?,?,?,?,?,?,?)')
      .bind(`${month}:${scope}:${refId}`, month, scope, refId, revenue, closed, workingDays, user.email, now));
  }
  if (isOwner(user)) statements.push(env.DB.prepare('INSERT INTO app_settings (key,value,updated_at) VALUES (?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at').bind(`target_cost:${month}`, JSON.stringify(caps), now));
  for (let i = 0; i < statements.length; i += 100) await env.DB.batch(statements.slice(i, i + 100));
  await audit({ action: 'targets.set', userId: user.userId, target: month, detail: JSON.stringify({ keys: only ?? body.items.map((it) => `${it.scope}:${it.refId}`) }), request });
  const saved = await listTargets(month);
  return Response.json({ ok: true, month, items: await visibleTargets(env.DB, user, saved, ids), editable: ids });
}
