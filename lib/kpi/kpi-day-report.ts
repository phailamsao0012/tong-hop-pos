// KPI tháng hiện tại theo bộ phận × POS, chia ngày (anh Vũ 12/11/2026). Dùng ở Tổng quan (khối Sale / CSKH / MKT).
// Đã đạt:
// - Sale / CSKH: doanh thu đơn do người bán thuộc bộ phận chốt (chờ xác nhận trở đi, theo ngày chốt đầu), cùng cách khối Sale / CSKH Tổng quan,
//   nhưng KHÔNG trừ đơn hủy / hoàn về sau ("đã chốt là chốt"); chỉ bỏ đơn xoá.
// - MKT: DT New = đơn có Marketer được tính, người bán thuộc Sale, theo ngày xác nhận đầu; không trừ hủy / hoàn.
// Chỉ tính các POS đang chọn (quy tắc POS là lớp tính đầu tiên).
import { env } from 'cloudflare:workers';
import { COUNTED_STAFF, teamSubquery } from '@/lib/teams/team';
import { todayVn, vnRangeUtc } from '@/lib/shared/report-time';
import { kpiDay, type KpiDay } from '@/lib/kpi/kpi-day';
import { DEPT_POS_DEPTS, type DeptPosDept } from '@/lib/kpi/targets';

const NET = 'COALESCE(o.net_total,COALESCE(o.current_total,0)-COALESCE(o.total_discount,0))';

export type KpiDayDept = { dept: DeptPosDept; kpi: KpiDay | null; byPos: { posId: string; goal: number; achieved: number; achievedToday: number }[] };
export type KpiDayReport = { month: string; today: string; depts: Record<DeptPosDept, KpiDayDept> };

export async function kpiDayReport(posIds: string[]): Promise<KpiDayReport> {
  const today = todayVn();
  const month = today.slice(0, 7);
  const { startUtc: monthStart, endUtc } = vnRangeUtc(`${month}-01`, today);
  const { startUtc: todayStart } = vnRangeUtc(today, today);
  const ph = posIds.map(() => '?').join(',');
  const sumBy = (where: string, at: string) => env.DB.prepare(`SELECT o.pos_id AS pos, COALESCE(SUM(${NET}),0) AS net, COALESCE(SUM(CASE WHEN ${at}>=? THEN ${NET} ELSE 0 END),0) AS today
    FROM raw_pos_orders o WHERE o.pos_id IN (${ph}) AND ${at}>=? AND ${at}<? AND ${where} GROUP BY 1`).bind(todayStart, ...posIds, monthStart, endUtc);
  const [goals, sale, cskh, mkt, empPos, hrTeam] = await env.DB.batch([
    env.DB.prepare("SELECT ref_id, revenue FROM targets WHERE month=? AND scope='dept_pos'").bind(month),
    sumBy(`o.status_code<>7 AND o.seller_id IN ${teamSubquery('sale')}`, 'o.first_closed_at'),
    sumBy(`o.status_code<>7 AND o.seller_id IN ${teamSubquery('cskh')}`, 'o.first_closed_at'),
    sumBy(`o.status_code NOT IN (0,17,7) AND NULLIF(TRIM(o.marketer_id),'') IS NOT NULL AND o.marketer_id IN ${COUNTED_STAFF} AND o.seller_id IN ${teamSubquery('sale')}`, 'o.first_confirmed_at'),
    env.DB.prepare('SELECT value FROM app_settings WHERE key=?').bind(`target_emp_pos:${month}`),
    env.DB.prepare("SELECT pos_user_id AS id, team FROM hr_pos_team WHERE team IN ('sale','cskh')"),
  ]);
  // KPI đặt theo từng người × POS (anh Vũ 12/11/2026): KPI bộ phận ở một POS = cộng KPI của người thuộc bộ phận đó ở POS đó; có thì dùng thay dept_pos.
  const deptOf = new Map((hrTeam.results as { id: string; team: string }[]).map((r) => [r.id, r.team]));
  const fromPeople = new Map<string, number>();
  try {
    const raw = JSON.parse((empPos.results as { value: string }[])[0]?.value ?? 'null') as Record<string, Record<string, number>> | null;
    for (const [id, m] of Object.entries(raw ?? {})) {
      const d = deptOf.get(id);
      if (!d) continue;
      for (const [pos, v] of Object.entries(m)) fromPeople.set(`${d}:${pos}`, (fromPeople.get(`${d}:${pos}`) ?? 0) + (Number(v) || 0));
    }
  } catch { /* JSON hỏng: dùng dept_pos */ }
  const goalMap = new Map((goals.results as { ref_id: string; revenue: number }[]).map((r) => [r.ref_id, Number(r.revenue)]));
  for (const [k, v] of fromPeople) goalMap.set(k, v);
  const actual = { sale, cskh, mkt };
  const depts = Object.fromEntries(DEPT_POS_DEPTS.map((dept) => {
    const rows = new Map((actual[dept].results as { pos: string; net: number; today: number }[]).map((r) => [r.pos, r]));
    const byPos = posIds.map((posId) => ({ posId, goal: goalMap.get(`${dept}:${posId}`) ?? 0, achieved: Number(rows.get(posId)?.net ?? 0), achievedToday: Number(rows.get(posId)?.today ?? 0) }));
    const goal = byPos.reduce((a, r) => a + r.goal, 0);
    // Chỉ cộng đã đạt của POS có đặt KPI, để % và thiếu/dư so đúng phạm vi KPI.
    const withGoal = byPos.filter((r) => r.goal > 0);
    const achieved = withGoal.reduce((a, r) => a + r.achieved, 0), achievedToday = withGoal.reduce((a, r) => a + r.achievedToday, 0);
    return [dept, { dept, kpi: kpiDay({ goal, today, achieved, achievedToday }), byPos }];
  })) as Record<DeptPosDept, KpiDayDept>;
  return { month, today, depts };
}
