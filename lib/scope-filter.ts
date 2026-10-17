import { branchFilter, BRANCH_RE } from './branch';
import { parseTeam, teamFilter, type HrUnit } from './team';
import type { Team } from './team';

/** Nối chi nhánh vào đường lọc team hiện có, không thay đổi bộ phận được cấp quyền. */
export async function resolveBranchUnit(params: URLSearchParams, team: Team) {
  const { resolveHrUnit } = await import('./hr-unit');
  const scope = await resolveHrUnit(params, team);
  if (scope instanceof Response) return scope;
  const branch = params.get('branch');
  if (!branch) return scope;
  if (!BRANCH_RE.test(branch)) return Response.json({ error: 'Mã chi nhánh không hợp lệ.' }, { status: 400 });
  const { env } = await import('cloudflare:workers');
  const office = await env.DB.prepare('SELECT id,name FROM hr_offices WHERE id=?').bind(branch).first<{ id: string; name: string }>();
  if (!office) return Response.json({ error: 'Không tìm thấy chi nhánh.' }, { status: 400 });
  return { ...scope, unit: scope.unit ? { ...scope.unit, branch } : { id: `branch_${branch}`, name: office.name, dept: scope.team === 'cskh' ? 'cskh' as const : 'sale' as const, branch, branchOnly: true } };
}

/** Bộ lọc đã được kiểm tra cú pháp; unit được route xác thực qua resolveHrUnit. */
export function scopeFromParams(params: URLSearchParams, unit: HrUnit | null = null) {
  const branch = params.get('branch') || null;
  if (branch && !BRANCH_RE.test(branch)) throw new Error('Mã chi nhánh không hợp lệ.');
  return { team: parseTeam(params.get('team')), unit, branch };
}

export function scopeSql(scope: ReturnType<typeof scopeFromParams>, columns: { seller: string; marketer?: string }, marketing = false) {
  return teamFilter(columns.seller, scope.team, true, scope.unit)
    + branchFilter(marketing ? (columns.marketer ?? columns.seller) : columns.seller, scope.branch);
}
