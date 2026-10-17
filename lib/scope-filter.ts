import { branchFilter, BRANCH_RE } from './branch';
import { parseTeam, teamFilter, type HrUnit } from './team';
import type { Team } from './team';
import { mktTeams } from './mkt-teams-source';
import { marketingTeamFilter } from './marketing-teams';

export type MktLens = { id: string; name: string; sql: string; ordersSql?: string };
const literal = (value: string) => `'${value.replaceAll("'", "''")}'`;

/** Chỉ đọc bản sao local; danh sách team dùng cùng nguồn với trang MKT (B1). */
export async function resolveMktLens(db: D1Database, params: URLSearchParams): Promise<MktLens | Response | null> {
  const id = params.get('mktTeam');
  if (!id || id === '__all') return null;
  const branch = params.get('branch');
  if (branch && !BRANCH_RE.test(branch)) return Response.json({ error: 'Mã chi nhánh không hợp lệ.' }, { status: 400 });
  const start = params.get('start'), end = params.get('end');
  if (start && end && (Date.parse(end) - Date.parse(start)) / 86400000 >= 120)
    return Response.json({ error: 'Lọc team MKT: chọn kỳ ngắn hơn (tối đa 120 ngày).' }, { status: 400 });
  const { teams } = await mktTeams(db);
  if (id !== '__unassigned' && !teams.some((t) => t.id === id))
    return Response.json({ error: 'Team Marketing không còn tồn tại.' }, { status: 400 });
  // Dùng danh sách thành viên đã giải quyết nguồn HR/local, kể cả nhóm không thuộc team.
  const members = id === '__unassigned' ? teams.flatMap((t) => t.memberIds) : teams.find((t) => t.id === id)!.memberIds;
  const filter = marketingTeamFilter(id === '__unassigned' ? id : 'selected', [{ id: 'selected', name: '', memberIds: members }], "COALESCE(NULLIF(TRIM(marketer_id),''),'')")!;
  let sql = filter.sql;
  for (const bind of filter.binds) sql = sql.replace('?', literal(bind));
  return { id, name: teams.find((t) => t.id === id)?.name ?? 'Không thuộc team MKT', sql };
}

/** Lọc ngay nguồn đơn, giữ nguyên bind và thời gian sự kiện của câu báo cáo cũ. */
export function lensSql(sql: string, lens: MktLens): string {
  return sql.replace(/\bFROM (raw_pos_orders|ad_costs)(?:\s+(o))?(?:\s+INDEXED BY (\w+))?/g,
    (_match, table: string, alias: string | undefined, index: string | undefined) =>
      `FROM (SELECT * FROM ${table}${index ? ` INDEXED BY ${index}` : ''} WHERE 1=1${lens.sql}${table === 'raw_pos_orders' ? lens.ordersSql ?? '' : ''}) AS ${alias ?? table}`);
}

export function lensDatabase(db: D1Database, lens: MktLens | null): D1Database {
  if (!lens) return db;
  return new Proxy(db, { get(target, property) {
    if (property === 'prepare') return (sql: string) => target.prepare(lensSql(sql, lens));
    const value = Reflect.get(target, property);
    return typeof value === 'function' ? value.bind(target) : value;
  } });
}

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
