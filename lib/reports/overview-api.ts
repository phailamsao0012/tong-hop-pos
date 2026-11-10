// Tách khỏi app/api/reports/overview/route.ts (cải tổ B4, 05/11/2026): chỉ dời chỗ, câu SQL và số liệu giữ nguyên.
import { env } from 'cloudflare:workers';
import type { overviewReport } from '@/lib/reports/overview-report';
import { isOwner, type Role } from '@/lib/auth/access';
import { listTargets } from '@/lib/kpi/targets';
import { teamFilter, teamSubquery, type HrUnit, type parseTeam, type Team } from '@/lib/teams/team';

const isCskh = (d: string | null | undefined) => /cskh|chăm sóc/i.test(d ?? '');
type Maskable = { assignedOrders: number; assignedCloseRate: number | null; assignedHidden: boolean };
const mask = (r: Maskable) => { r.assignedOrders = 0; r.assignedCloseRate = null; r.assignedHidden = true; };
export function hideCskhAssigned(report: Awaited<ReturnType<typeof overviewReport>>, team: ReturnType<typeof parseTeam>) {
  for (const part of [report.current, report.compare]) {
    if (!part) continue;
    for (const r of part.byEmployee) if (isCskh(r.department)) mask(r);
    for (const r of part.byEmployeePos) if (isCskh(r.department)) mask(r);
    if (team === 'cskh') { report.origins.forEach(mask); mask(part.total); part.byPos.forEach(mask); part.series.forEach(mask); for (const d of part.byEmployeeDay) d.assignedOrders = 0; }
  }
}

/** ?branches=1: chi nhánh và team (web nhân sự) cho ô chọn; tài khoản giới hạn một bộ phận chỉ nhận team của bộ phận đó. */
export async function overviewBranches(userTeam: Team) {
  const [offices, teams] = await env.DB.batch([
    env.DB.prepare('SELECT id,name FROM hr_offices ORDER BY name'),
    env.DB.prepare("SELECT d.id,d.name,d.office_id AS officeId,t.team AS dept,COUNT(*) AS people FROM hr_departments d JOIN hr_pos_team t ON t.department_id=d.id WHERE d.kind='team' AND d.active=1 AND t.team IN ('sale','cskh') AND t.status<>'da_nghi' GROUP BY d.id,t.team ORDER BY d.name"),
  ]);
  const teamRows = teams.results as { id: string; name: string; officeId: string; dept: 'sale' | 'cskh'; people: number }[];
  return { offices: offices.results, teams: teamRows.filter((t) => userTeam === 'all' || t.dept === userTeam) };
}

/** Mục tiêu tháng cho dự báo (KPI team nếu xem một team, không thì cộng KPI từng người trong bộ phận); người không phải chủ hệ thống không tính người CSKH. */
export async function overviewForecastTarget(team: Team, unit: HrUnit | null, employeeIds: string[], today: string, user: { role: Role }) {
  const targets = await listTargets(today.slice(0, 7));
  const members = await env.DB.prepare(`SELECT DISTINCT user_id FROM pos_users WHERE 1=1${teamFilter('user_id', team, true, unit)}`).all<{ user_id: string }>();
  const hidden = isOwner(user) ? new Set<string>() : new Set((await env.DB.prepare(`SELECT user_id FROM ${teamSubquery('cskh', false)} AS t`).all<{ user_id: string }>()).results.map((m) => m.user_id));
  const ids = new Set(members.results.map((r) => r.user_id).filter((id) => !hidden.has(id) && (!employeeIds.length || employeeIds.includes(id))));
  const teamGoal = unit && !employeeIds.length ? targets.find((t) => t.scope === 'team' && t.refId === unit.id)?.revenue : null;
  const employeeGoal = targets.filter((t) => t.scope === 'employee' && ids.has(t.refId)).reduce((sum, t) => sum + t.revenue, 0);
  return teamGoal || employeeGoal || null;
}
