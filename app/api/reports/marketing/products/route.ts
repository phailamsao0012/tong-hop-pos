import { env } from 'cloudflare:workers';
import { getSessionUser, unauthorized } from '@/lib/auth/auth';
import { POS } from '@/lib/shared/report-model';
import { DATE_RE, vnRangeUtc } from '@/lib/shared/report-time';
import { resolveMktLens } from '@/lib/shared/scope-filter';
import { mktTeams } from '@/lib/teams/mkt-teams-source';
import { branchFilter } from '@/lib/teams/branch';
import { marketingTeamFilter } from '@/lib/teams/marketing-teams';
import { parseTeam } from '@/lib/teams/team';
import { productExists, SOURCE_FIELD } from '@/lib/reports/marketing-report';
import { mktProductSplit } from '@/lib/reports/mkt-product-split';

// Tách số từng marketer theo dòng sản phẩm, gọi khi rê chuột vào bảng xếp hạng MKT lần đầu (anh Vũ 07/11/2026).
// Cùng tham số và bộ lọc với /api/reports/marketing (phần phễu đơn tạo trong kỳ).
export async function GET(request: Request) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  const p = new URL(request.url).searchParams;
  const start = p.get('start') ?? '', end = p.get('end') ?? '';
  if (!DATE_RE.test(start) || !DATE_RE.test(end) || start > end) return Response.json({ error: 'Khoảng ngày không hợp lệ.' }, { status: 400 });
  const requested = (p.get('posIds') ?? '').split(',').filter(Boolean);
  const validPos = new Set<string>(POS.map((x) => x.id));
  if (requested.some((id) => !validPos.has(id))) return Response.json({ error: 'POS không hợp lệ.' }, { status: 400 });
  const posIds = requested.length ? requested : POS.map((x) => x.id);
  const lens = await resolveMktLens(env.DB, p);
  if (lens instanceof Response) return lens;
  const marketer = `NULLIF(TRIM(o.marketer_id),'')`;
  const teamId = (p.get('mktTeam') ?? p.get('marketingTeamId') ?? '__all').trim();
  const mkt = marketingTeamFilter(teamId, (await mktTeams(env.DB)).teams, marketer);
  if (!mkt) return Response.json({ error: 'Team Marketing không còn tồn tại.' }, { status: 400 });
  let extraSql = mkt.sql + (lens ? branchFilter('o.marketer_id', p.get('branch')) : '');
  const extraBinds = [...mkt.binds];
  const add = (key: string, sql: string) => { const v = (p.get(key) ?? '').trim().slice(0, 180); if (v) { extraSql += ` AND ${sql}`; extraBinds.push(v); } };
  add('marketerId', `${marketer}=?`);
  add('sellerId', 'o.seller_id=?');
  add('careId', 'o.care_id=?');
  add('productKey', productExists('o'));
  add('source', `${SOURCE_FIELD}=?`);
  const split = await mktProductSplit(env.DB, { posIds, ...vnRangeUtc(start, end), team: parseTeam(p.get('team')), extraSql, extraBinds });
  return Response.json(split, { headers: { 'Cache-Control': 'private, max-age=300' } });
}
