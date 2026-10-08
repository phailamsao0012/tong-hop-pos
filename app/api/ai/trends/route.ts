import { forbidden, getSessionUser, unauthorized } from '@/lib/auth';
import { canView, isOwner } from '@/lib/access';
import { currentTrendNotes, refreshTrendNotes } from '@/lib/ai-trends';

// Nhận xét xu hướng mỗi sáng theo bộ phận (lib/ai-trends.ts). Ai xem được Tổng quan POS thấy cả 4 bộ phận;
// người khác chỉ thấy bộ phận có trang mình được xem (Tổng quan Sale, Tổng quan CSKH, Marketing, Vận đơn).
const DEPT_VIEW = { sale: 'sale-overview', cskh: 'cskh-overview', mkt: 'marketing', vandon: 'van-don' } as const;

export async function GET() {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  const s = await currentTrendNotes();
  const all = canView(user, 'overview');
  const notes = s.notes ? Object.fromEntries(Object.entries(s.notes).filter(([d]) => all || canView(user, DEPT_VIEW[d as keyof typeof DEPT_VIEW]))) : undefined;
  return Response.json({ ...s, notes, error: isOwner(user) ? s.error : undefined }, { headers: { 'Cache-Control': 'private, no-store' } });
}

export async function POST() {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  if (!isOwner(user)) return forbidden('Chỉ chủ hệ thống viết lại nhận xét.');
  return Response.json(await refreshTrendNotes());
}
