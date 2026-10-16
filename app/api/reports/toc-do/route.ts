import { env } from 'cloudflare:workers';
import { getSessionUser, unauthorized } from '@/lib/auth';
import { scopeApi } from '@/lib/access';
import { POS } from '@/lib/report-model';
import { DATE_RE, daysBetween, vnRangeUtc } from '@/lib/report-time';
import { parseTeam } from '@/lib/team';
import { resolveHrUnit } from '@/lib/hr-unit';
import { buildSpeed, closeRateByWait, speedQueries, STUCK_RULES, type SpeedRow, type StuckRow } from '@/lib/order-speed';

export async function GET(request: Request) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  const scoped = scopeApi(user, 'GET', new URL(request.url));
  if (scoped.blocked) return Response.json({ error: scoped.blocked }, { status: 403 });
  const p = scoped.url.searchParams, start = p.get('start') ?? '', end = p.get('end') ?? '';
  const valid = (s: string) => DATE_RE.test(s) && Number.isFinite(Date.parse(`${s}T00:00:00Z`)) && new Date(`${s}T00:00:00Z`).toISOString().slice(0, 10) === s;
  if (!valid(start) || !valid(end) || start > end || daysBetween(start, end) > 31) return Response.json({ error: 'Chọn khoảng ngày hợp lệ, tối đa 31 ngày.' }, { status: 400 });
  const requested = (p.get('posIds') ?? '').split(',').filter(Boolean);
  if (requested.some((id) => !POS.some((pos) => pos.id === id))) return Response.json({ error: 'POS không hợp lệ.' }, { status: 400 });
  const posIds = requested.length ? requested : POS.map((pos) => pos.id);
  const scope = await resolveHrUnit(p, parseTeam(p.get('team')));
  if (scope instanceof Response) return scope;
  const { startUtc, endUtc } = vnRangeUtc(start, end), now = new Date().toISOString();
  const results = await env.DB.batch(speedQueries(env.DB, posIds, startUtc, endUtc, now, scope.team, scope.unit));
  const rows = results.slice(0, 4).flatMap((r) => r.results as SpeedRow[]);
  const skipped = { assign: 0, confirm: 0, ship: 0, deliver: 0 };
  for (const r of rows) if (r.bucket === -1) skipped[r.stage] += r.n;
  const stuck = STUCK_RULES.map((rule, i) => {
    const data = results[5 + i].results as StuckRow[];
    const counts = data.filter((r) => r.kind === 'count').map(({ posId, who, n }) => ({ posId, who, n }));
    return { key: rule.key, label: rule.label, total: counts.reduce((n, r) => n + r.n, 0), counts,
      orders: data.filter((r) => r.kind === 'order').map(({ posId, sourceOrderId, who, minutes }) => ({ posId, sourceOrderId, who, minutes })) };
  });
  return Response.json({ ...buildSpeed(rows, skipped), waitRates: closeRateByWait(results[4].results as { bucket: number; leads: number; closed: number }[]), stuck,
    period: { start, end }, asOf: now, hrTeam: scope.unit, hrTeamDropped: scope.dropped,
    definitions: {
      'Chia số': 'Đơn tạo trong kỳ: từ tạo đơn đến chia cho người lên đơn; theo mã người lên đơn.',
      'Vào Chờ xác nhận → Đã xác nhận': 'Đơn vào Chờ xác nhận trong kỳ: từ lần đầu vào Chờ xác nhận đến lần đầu xác nhận; theo mã người lên đơn.',
      'Gửi hãng': 'Đơn gửi lần đầu trong kỳ: từ lần đầu xác nhận đến lần đầu gửi; theo mã người xác nhận.',
      'Giao tới khách': 'Đơn gửi lần đầu trong kỳ: từ lần đầu gửi đến khách nhận; nhóm theo hãng, không theo người.',
      'Trung vị': 'Một nửa số đơn nhanh hơn mức này. Ước lượng bằng nội suy tuyến tính trong ô thời gian.',
      '90%': '9/10 đơn xong trong mức này. Ước lượng từ ô thời gian, không phải giờ chính xác từng đơn.',
      'Ô thời gian': 'Dưới 5, 15, 30, 60, 120, 240, 480, 1440, 2880, 4320, 7200 phút; ô cuối từ 7200 phút lấy cận dưới 7200 khi tính phân vị.',
      'Đơn bỏ vì thiếu giờ': 'Bỏ khoảng thiếu mốc, giờ không hợp lệ hoặc khoảng âm; tỷ lệ = số bỏ / (số hợp lệ + số bỏ) trong từng nhóm kỳ.',
      'Mốc tham khảo': 'Trung vị chia số 5 phút, xác nhận 2 giờ, gửi hãng 24 giờ, giao tới khách 3 ngày; chỉ dùng tô màu.',
      'Theo người': 'Chỉ hiện nhóm ít nhất 10 đơn hợp lệ; dùng mã người Pancake. Chặng giao tới khách hiện hãng.',
      'Tỷ lệ vào Chờ xác nhận': 'Trong các đơn tạo trong kỳ có giờ chia hợp lệ: số có mốc vào Chờ xác nhận / tổng đơn, theo thời gian chờ chia số.',
      'Đơn kẹt': 'Theo trạng thái hiện tại, không theo kỳ chọn; chỉ xét đơn có mốc trong 30 ngày gần nhất (số mới chưa chia: 3 ngày); giữ phạm vi POS và team. Mỗi luật hiện 50 đơn lâu nhất, tổng đếm đầy đủ.',
      ...Object.fromEntries(STUCK_RULES.map((r) => [r.label, `Trạng thái ${r.status.join(', ')}; quá ${r.minutes} phút tính từ ${r.from}.${r.needNoSeller ? ' Chưa có người lên đơn.' : ''} Chỉ xét đơn có mốc trong ${r.maxDays} ngày gần nhất.`])),
    },
  });
}
