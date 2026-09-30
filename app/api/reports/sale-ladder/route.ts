import { getSessionUser, unauthorized } from '@/lib/auth';
import { LADDER_GROUPS, saleGroupLadder, saleLadder, type LadderGroup } from '@/lib/purchase-ladder';
import { POS } from '@/lib/report-model';
import { DATE_RE, todayVn, vnRangeUtc } from '@/lib/report-time';

// Khách mới Sale đưa về theo tháng của đơn đã nhận đầu tiên: bao nhiêu khách mua tiếp lần 2, 3… (6 tháng gần nhất).
// ?by=group&start=&end=: khách có T0 trong kỳ, chia theo nhóm Kháng sinh / Combo như bên CSKH.
export async function GET(request: Request) {
  if (!(await getSessionUser())) return unauthorized();
  const p = new URL(request.url).searchParams;
  const valid = new Set<string>(POS.map((x) => x.id));
  const requested = (p.get('posIds') ?? '').split(',').filter(Boolean);
  if (requested.some((id) => !valid.has(id))) return Response.json({ error: 'POS không hợp lệ.' }, { status: 400 });
  if (p.get('team') === 'cskh') return Response.json({ error: 'Tài khoản chỉ xem bộ phận CSKH.' }, { status: 403 });
  const g = p.get('group');
  const group = (LADDER_GROUPS as readonly string[]).includes(g ?? '') ? g as LadderGroup : null;
  const staffId = (p.get('staffId') ?? '').trim().slice(0, 100) || null;
  const posIds = requested.length ? requested : [...valid];
  if (p.get('by') === 'group') {
    const start = p.get('start') ?? '', end = p.get('end') ?? '';
    if (!DATE_RE.test(start) || !DATE_RE.test(end) || start > end) return Response.json({ error: 'Khoảng ngày không hợp lệ.' }, { status: 400 });
    return Response.json(await saleGroupLadder({ posIds, staffId, ...vnRangeUtc(start, end) }), { headers: { 'Cache-Control': 'private, no-store' } });
  }
  return Response.json(await saleLadder({ posIds, staffId, group, today: todayVn() }), { headers: { 'Cache-Control': 'private, no-store' } });
}
