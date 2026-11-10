import { getSessionUser, unauthorized } from '@/lib/auth/auth';
import { POS } from '@/lib/shared/report-model';
import { reportMemoKey } from '@/lib/reports/report-memo';
import { DATE_RE } from '@/lib/shared/report-time';
import { parseTeam, usingHrTeams } from '@/lib/teams/team';
import { resolveBranchUnit as resolveHrUnit } from '@/lib/shared/scope-filter';
import { productGroupsBody } from '@/lib/reports/product-groups-report';

// Chốt theo nhóm sản phẩm (lib/reports/product-groups-report.ts).
// Nhớ kết quả đã tính xong 3 phút (theo URL), để thẻ Tổng quan và bảng bên dưới cùng gọi một URL không quét đơn hai lần.
// Chỉ nhớ giá trị đã xong, không giữ Promise dùng chung giữa các yêu cầu.
const memo = new Map<string, { at: number; body: string }>();

export async function GET(request: Request) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  const memoKey = reportMemoKey(
    user.role,
    usingHrTeams() ? 'hr' : 'pc',
    request.url,
  );
  const hit = memo.get(memoKey);
  if (hit && Date.now() - hit.at < 3 * 60000)
    return new Response(hit.body, {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'private, no-store',
      },
    });
  const p = new URL(request.url).searchParams;
  const start = p.get('start') ?? '',
    end = p.get('end') ?? '';
  if (!DATE_RE.test(start) || !DATE_RE.test(end) || start > end)
    return Response.json(
      { error: 'Khoảng ngày không hợp lệ.' },
      { status: 400 },
    );
  const valid = new Set<string>(POS.map((x) => x.id));
  const requested = (p.get('posIds') ?? '').split(',').filter(Boolean);
  if (requested.some((id) => !valid.has(id)))
    return Response.json({ error: 'POS không hợp lệ.' }, { status: 400 });
  const posIds = requested.length ? requested : POS.map((x) => x.id);
  const unitScope = await resolveHrUnit(p, parseTeam(p.get('team') ?? 'sale'));
  if (unitScope instanceof Response) return unitScope;
  const { team, unit } = unitScope;
  const body = await productGroupsBody(user, p, posIds, start, end, team, unit);
  memo.set(memoKey, { at: Date.now(), body });
  if (memo.size > 200) memo.delete(memo.keys().next().value!);
  return new Response(body, {
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'private, no-store',
    },
  });
}
