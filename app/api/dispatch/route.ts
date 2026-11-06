import { env } from 'cloudflare:workers';
import { auditHeaders } from '@/lib/ops/audit';
import { forbidden, getSessionUser, unauthorized } from '@/lib/auth/auth';
import { isOwner } from '@/lib/auth/access';
import { MODE_LABELS, parseMode } from '@/lib/zalo/dispatch-core';
import { POS } from '@/lib/shared/report-model';
import { todayVn, vnDayStartUtc } from '@/lib/shared/report-time';
import { dispatchOverview, setPosDispatch, setStaffDispatch, stopAllDispatch } from '@/lib/zalo/dispatch-admin';

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
  const [pos, staff, counts, log] = await dispatchOverview(dayStart);
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
    const names = await setStaffDispatch(ids, on, now, by);
    return Response.json({ ok: true }, { headers: { ...noStore, ...auditHeaders(`${on ? 'Bật' : 'Tắt'} nhận số: ${names.results.map((n) => n.name).join(', ')}`.slice(0, 500), 'dispatch.update') } });
  }

  if (body.action === 'pos') {
    const posId = POS.find((p) => p.id === body.posId)?.id;
    if (!posId) return Response.json({ error: 'POS không hợp lệ.' }, { status: 400 });
    const mode = parseMode(body.mode);
    // Mỗi lần đổi chế độ, mốc bắt đầu tính lại từ bây giờ: không bao giờ chia lại đơn cũ.
    await setPosDispatch(posId, mode, now, by);
    return Response.json({ ok: true }, { headers: { ...noStore, ...auditHeaders(`Chia số ${POS.find((p) => p.id === posId)?.name}: ${MODE_LABELS[mode]}`, 'dispatch.update') } });
  }

  if (body.action === 'stop-all') {
    await stopAllDispatch(now, by);
    return Response.json({ ok: true }, { headers: { ...noStore, ...auditHeaders('Dừng chia số mọi POS', 'dispatch.update') } });
  }

  return Response.json({ error: 'Thao tác không hợp lệ.' }, { status: 400 });
}
