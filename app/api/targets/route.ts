import { env } from 'cloudflare:workers';
import { forbidden, getSessionUser, unauthorized } from '@/lib/auth';
import { isOwner } from '@/lib/access';
import { POS } from '@/lib/report-model';
import { listTargets } from '@/lib/targets';

// Mục tiêu tháng: GET ?month=YYYY-MM → danh sách; PUT {month, items:[{scope, refId, revenue, closedOrders}]} (admin) → ghi đè.
const MONTH_RE = /^\d{4}-\d{2}$/;
export async function GET(request: Request) {
  if (!(await getSessionUser())) return unauthorized();
  const p = new URL(request.url).searchParams;
  const month = p.get('month') ?? '';
  if (!MONTH_RE.test(month)) return Response.json({ error: 'Tháng không hợp lệ.' }, { status: 400 });
  const [items, prev] = await Promise.all([listTargets(month), (async () => {
    const [y, m] = month.split('-').map(Number);
    const pm = new Date(Date.UTC(y, m - 2, 1)).toISOString().slice(0, 7);
    return { month: pm, items: await listTargets(pm) };
  })()]);
  return Response.json({ month, items, previous: prev }, { headers: { 'Cache-Control': 'private, no-store' } });
}

export async function PUT(request: Request) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  if (!isOwner(user)) return forbidden();
  let body: { month?: string; items?: { scope?: string; refId?: string; revenue?: number; closedOrders?: number; workingDays?: number | null }[] };
  try { body = await request.json(); } catch { return Response.json({ error: 'JSON không hợp lệ.' }, { status: 400 }); }
  const month = body.month ?? '';
  if (!MONTH_RE.test(month) || !Array.isArray(body.items) || body.items.length > 500) return Response.json({ error: 'Dữ liệu không hợp lệ.' }, { status: 400 });
  const now = new Date().toISOString();
  const statements = [env.DB.prepare('DELETE FROM targets WHERE month=?').bind(month)];
  for (const it of body.items) {
    const scope = it.scope === 'pos' || it.scope === 'employee' ? it.scope : null;
    const refId = String(it.refId ?? '').slice(0, 100);
    const revenue = Math.max(0, Math.round(Number(it.revenue) || 0)), closed = Math.max(0, Math.round(Number(it.closedOrders) || 0));
    const workingDays = scope === 'employee' && it.workingDays != null && Number(it.workingDays) > 0 ? Math.min(31, Math.round(Number(it.workingDays))) : null;
    if (!scope || !refId || (scope === 'pos' && !POS.some((p) => p.id === refId)) || (!revenue && !closed && !workingDays)) continue;
    statements.push(env.DB.prepare('INSERT INTO targets (id,month,scope,ref_id,revenue,closed_orders,working_days,updated_by,updated_at) VALUES (?,?,?,?,?,?,?,?,?)')
      .bind(`${month}:${scope}:${refId}`, month, scope, refId, revenue, closed, workingDays, user.email, now));
  }
  for (let i = 0; i < statements.length; i += 100) await env.DB.batch(statements.slice(i, i + 100));
  return Response.json({ ok: true, month, items: await listTargets(month) });
}
