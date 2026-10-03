import { env } from 'cloudflare:workers';
import { auditHeaders } from '@/lib/audit';
import { forbidden, getSessionUser, unauthorized } from '@/lib/auth';
import { isOwner } from '@/lib/access';
import { MODE_LABELS, parseMode } from '@/lib/dispatch-core';
import { POS } from '@/lib/report-model';
import { todayVn, vnDayStartUtc } from '@/lib/report-time';
import { WORKING, teamFilter } from '@/lib/team';

// Chia số thử nghiệm (chủ hệ thống): bật/tắt nhận số cho từng sale, chế độ chạy cho từng POS, nhật ký chia. Xem lib/dispatch.ts.
const noStore = { 'Cache-Control': 'no-store' };

async function owner() {
  const user = await getSessionUser();
  if (!user) return { error: unauthorized() };
  if (!isOwner(user)) return { error: forbidden() };
  return { user };
}

export async function GET() {
  const { error } = await owner();
  if (error) return error;
  const dayStart = `${vnDayStartUtc(todayVn())}Z`;
  const [pos, staff, counts, log] = await Promise.all([
    env.DB.prepare('SELECT s.id, s.shop_id, d.mode, d.since, d.last_run_at, d.last_error, d.waiting, d.updated_by FROM pos_shops s LEFT JOIN dispatch_pos d ON d.pos_id=s.id')
      .all<{ id: string; shop_id: string | null; mode: string | null; since: string | null; last_run_at: string | null; last_error: string | null; waiting: number | null; updated_by: string | null }>(),
    env.DB.prepare(`SELECT u.user_id AS id, MAX(u.name) AS name, GROUP_CONCAT(DISTINCT u.pos_id) AS pos_ids,
        COALESCE(MAX(h.department), MAX(u.sale_group), '') AS team, COALESCE(MAX(d.is_on),0) AS is_on, MAX(d.on_since) AS on_since, MAX(d.last_assigned_at) AS last_assigned_at
      FROM pos_users u LEFT JOIN hr_pos_team h ON h.pos_user_id=u.user_id LEFT JOIN dispatch_staff d ON d.user_id=u.user_id
      WHERE u.name<>'' AND u.is_active=1 AND ${WORKING.replace('user_id', 'u.user_id')}${teamFilter('u.user_id', 'sale')} GROUP BY u.user_id ORDER BY team, name`)
      .all<{ id: string; name: string; pos_ids: string; team: string; is_on: number; on_since: string | null; last_assigned_at: string | null }>(),
    env.DB.prepare('SELECT seller_id, result, COUNT(*) AS n FROM dispatch_log WHERE at>=? GROUP BY seller_id, result').bind(dayStart)
      .all<{ seller_id: string | null; result: string; n: number }>(),
    env.DB.prepare('SELECT at, pos_id, order_id, order_at, customer, seller_name, mode, result, detail FROM dispatch_log ORDER BY at DESC LIMIT 150').all(),
  ]);
  const junk = (name: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(name) || /api[_ ]?connection|webhook/i.test(name);
  const today = new Map<string, { ok: number; dry: number }>();
  const total = { ok: 0, dry: 0, error: 0 };
  for (const c of counts.results) {
    if (c.result === 'ok' || c.result === 'dry' || c.result === 'error') total[c.result] += Number(c.n);
    if (!c.seller_id || (c.result !== 'ok' && c.result !== 'dry')) continue;
    const t = today.get(c.seller_id) ?? { ok: 0, dry: 0 };
    t[c.result] += Number(c.n);
    today.set(c.seller_id, t);
  }
  const byId = new Map(pos.results.map((p) => [p.id, p]));
  return Response.json({
    configured: !!env.PANCAKE_POS_API_KEY?.trim(),
    pos: POS.map((p) => {
      const r = byId.get(p.id);
      return { id: p.id, name: p.name, linked: !!r?.shop_id, mode: parseMode(r?.mode), since: r?.since ?? null, lastRunAt: r?.last_run_at ?? null,
        lastError: r?.last_error ?? null, waiting: Number(r?.waiting ?? 0), updatedBy: r?.updated_by ?? null };
    }),
    staff: staff.results.filter((s) => !junk(s.name)).map((s) => ({
      id: s.id, name: s.name, team: s.team || 'Chưa gắn team', posIds: s.pos_ids.split(','), on: !!s.is_on, onSince: s.on_since, lastAssignedAt: s.last_assigned_at,
      today: today.get(s.id) ?? { ok: 0, dry: 0 },
    })),
    total, log: log.results,
  }, { headers: noStore });
}

type Body = { action?: string; userId?: string; userIds?: string[]; on?: boolean; posId?: string; mode?: string };

export async function POST(request: Request) {
  const { user, error } = await owner();
  if (error) return error;
  let body: Body;
  try { body = await request.json(); } catch { return Response.json({ error: 'JSON không hợp lệ.' }, { status: 400 }); }
  const now = new Date().toISOString();
  const by = user.displayName || user.email;

  if (body.action === 'staff') {
    const ids = (Array.isArray(body.userIds) ? body.userIds : body.userId ? [body.userId] : []).filter((x): x is string => typeof x === 'string' && !!x).slice(0, 200);
    if (!ids.length) return Response.json({ error: 'Thiếu nhân viên.' }, { status: 400 });
    const on = !!body.on;
    await env.DB.batch(ids.map((id) => env.DB.prepare(`INSERT INTO dispatch_staff (user_id, is_on, on_since, updated_at, updated_by) VALUES (?,?,?,?,?)
      ON CONFLICT(user_id) DO UPDATE SET is_on=excluded.is_on, on_since=CASE WHEN excluded.is_on=1 AND dispatch_staff.is_on=0 THEN excluded.on_since WHEN excluded.is_on=0 THEN NULL ELSE dispatch_staff.on_since END,
        updated_at=excluded.updated_at, updated_by=excluded.updated_by`).bind(id, on ? 1 : 0, on ? now : null, now, by)));
    const names = await env.DB.prepare(`SELECT MAX(name) AS name FROM pos_users WHERE user_id IN (${ids.map(() => '?').join(',')}) GROUP BY user_id`).bind(...ids).all<{ name: string }>();
    return Response.json({ ok: true }, { headers: { ...noStore, ...auditHeaders(`${on ? 'Bật' : 'Tắt'} nhận số: ${names.results.map((n) => n.name).join(', ')}`.slice(0, 500), 'dispatch.update') } });
  }

  if (body.action === 'pos') {
    const posId = POS.find((p) => p.id === body.posId)?.id;
    if (!posId) return Response.json({ error: 'POS không hợp lệ.' }, { status: 400 });
    const mode = parseMode(body.mode);
    // Mỗi lần đổi chế độ, mốc bắt đầu tính lại từ bây giờ: không bao giờ chia lại đơn cũ.
    await env.DB.prepare(`INSERT INTO dispatch_pos (pos_id, mode, since, last_error, waiting, updated_at, updated_by) VALUES (?,?,?,NULL,0,?,?)
      ON CONFLICT(pos_id) DO UPDATE SET mode=excluded.mode, since=CASE WHEN excluded.mode<>dispatch_pos.mode THEN excluded.since ELSE dispatch_pos.since END,
        last_error=NULL, waiting=0, updated_at=excluded.updated_at, updated_by=excluded.updated_by`)
      .bind(posId, mode, mode === 'off' ? null : now, now, by).run();
    return Response.json({ ok: true }, { headers: { ...noStore, ...auditHeaders(`Chia số ${POS.find((p) => p.id === posId)?.name}: ${MODE_LABELS[mode]}`, 'dispatch.update') } });
  }

  if (body.action === 'stop-all') {
    await env.DB.prepare("UPDATE dispatch_pos SET mode='off', updated_at=?, updated_by=? WHERE mode<>'off'").bind(now, by).run();
    return Response.json({ ok: true }, { headers: { ...noStore, ...auditHeaders('Dừng chia số mọi POS', 'dispatch.update') } });
  }

  return Response.json({ error: 'Thao tác không hợp lệ.' }, { status: 400 });
}
