import { getSessionUser, unauthorized, forbidden } from '@/lib/auth';
import { isOwner } from '@/lib/access';
import { parseMetricSettings, RATE_BASES, RATE_THRESHOLDS, RETURN_BASES, SUCCESS_BASES } from '@/lib/metrics';
import { clearUserMetrics, companyMetrics, saveCompanyMetrics, saveUserMetrics, userMetrics } from '@/lib/metric-prefs';

// GET: cách tính đang dùng của tài khoản (+ mặc định công ty, nhãn để app hiển thị).
// PUT {rateBase, returnBase, success, scope?: 'me' | 'company' | 'reset'}.
const labels = { rateThresholds: RATE_THRESHOLDS, rateBases: RATE_BASES, returnBases: RETURN_BASES, successBases: Object.fromEntries(Object.entries(SUCCESS_BASES).map(([k, v]) => [k, { label: v.label, hint: v.hint }])) };

export async function GET() {
  const user = await getSessionUser();
  if (!user) return unauthorized('Đăng nhập để xem.');
  const [mine, company] = await Promise.all([userMetrics(user.userId), companyMetrics()]);
  return Response.json({ ...mine, company, labels }, { headers: { 'Cache-Control': 'private, no-store' } });
}

export async function PUT(request: Request) {
  const user = await getSessionUser();
  if (!user) return unauthorized('Đăng nhập để lưu.');
  const body = await request.json().catch(() => ({})) as Record<string, string>;
  const m = parseMetricSettings(new URLSearchParams(Object.entries(body).filter(([k]) => k !== 'scope') as [string, string][]));
  if (body.scope === 'company') {
    if (!isOwner(user)) return forbidden('Chỉ chủ hệ thống đặt mặc định công ty.');
    await saveCompanyMetrics(m);
  } else if (body.scope === 'reset') await clearUserMetrics(user.userId);
  else await saveUserMetrics(user.userId, m);
  return GET();
}
