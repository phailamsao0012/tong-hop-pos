import { env } from 'cloudflare:workers';
import { getSessionUser, unauthorized } from '@/lib/auth/auth';
import { isOwner } from '@/lib/auth/access';
import { ownPosUserIds, targetStaff } from '@/lib/kpi/targets';
import { POS } from '@/lib/shared/report-model';
import { DATE_RE, comparePeriod, compareWindow, vnRangeUtc } from '@/lib/shared/report-time';
import { sellerProductQty, type QtyBySeller } from '@/lib/reports/seller-product-qty';
import { cskhUpsell } from '@/lib/reports/cskh-upsell';

// Số đã đạt cho chỉ tiêu KPI mới (anh Vũ 07/11/2026): số lượng sản phẩm từng người (kỳ này và kỳ trước cùng mốc giờ) và tỷ lệ tự upsell CSKH.
// Chủ hệ thống, giám đốc thấy mọi người; Leader / Mentor chỉ người mình được chia; nhân viên chỉ chính mình.
export async function GET(request: Request) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  const p = new URL(request.url).searchParams;
  const start = p.get('start') ?? '', end = p.get('end') ?? '';
  if (!DATE_RE.test(start) || !DATE_RE.test(end) || start > end) return Response.json({ error: 'Khoảng ngày không hợp lệ.' }, { status: 400 });
  // Quy tắc POS (anh Vũ 12/11/2026): chỉ POS đang chọn; thiếu posIds = mọi POS.
  const valid = new Set<string>(POS.map((x) => x.id));
  const requested = (p.get('posIds') ?? '').split(',').filter(Boolean);
  if (requested.some((id) => !valid.has(id))) return Response.json({ error: 'POS không hợp lệ.' }, { status: 400 });
  const posIds = requested.length ? requested : [...valid];
  const prev = compareWindow(end, comparePeriod(start, end, 'previous'));
  const { startUtc, endUtc } = vnRangeUtc(start, end);
  const [qty, prevQty, upsell] = await Promise.all([
    sellerProductQty(env.DB, posIds, startUtc, endUtc),
    sellerProductQty(env.DB, posIds, prev.startUtc, prev.endUtc),
    cskhUpsell(env.DB, posIds, startUtc, endUtc),
  ]);
  const ids = isOwner(user) || user.role === 'director' ? null
    : user.role === 'staff' ? await ownPosUserIds(env.DB, user.email) : await targetStaff(env.DB, user) ?? [];
  const keep = (m: QtyBySeller) => (ids ? Object.fromEntries(Object.entries(m).filter(([k]) => ids.includes(k))) : m);
  return Response.json({
    period: { start, end }, prevPeriod: { start: prev.start, end: prev.end, cutoff: prev.cutoff },
    qty: keep(qty), prevQty: keep(prevQty), upsell: ids ? upsell.filter((r) => ids.includes(r.cskhId)) : upsell,
  }, { headers: { 'Cache-Control': 'private, max-age=300' } });
}
