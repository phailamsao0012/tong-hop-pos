// Người ở nhiều team cùng bộ phận: tách số theo POS của từng team (anh Vũ 14/11/2026: "CSKH - Hạ Vy chỉ tính phần Siêu Vô Gạo,
// CSKH Nấm chỉ tính phần Oxytetra (doanh thu, đơn, KPI theo tỉ lệ POS). Người khác ở nhiều team cũng làm y vậy").
// - POS của team: tỉ lệ doanh thu theo POS của các thành viên CHỈ ở team đó (tháng trước + tháng này). Mỗi POS của người nhiều team giao
//   cho team có tỉ lệ ở POS đó cao nhất; chưa team nào bán ở POS đó thì giao team đầu (theo thứ tự ở Chia team) — không mất số.
// - Doanh thu, đơn, số lên: theo đúng POS của đơn → team nhận POS đó.
// - KPI doanh thu: chia theo tỉ lệ POS của người đó, như trang KPI (lib/kpi/goal-share.ts): KPI đặt theo POS (target_emp_pos) → doanh thu
//   tháng trước theo POS → doanh thu tháng này theo POS → chưa có gì thì cả KPI vào team đầu.
// Báo cáo sếp (boss-data.ts) và bot đặt KPI (kpi-bot.ts) cùng dùng loadPersonSplits nên số tách khớp nhau.
import { prevMonthOf } from '@/lib/kpi/goal-share-calc';
import { vnRangeUtc } from '@/lib/shared/report-time';
import { revenueDate } from '@/lib/reports/stats';
import { WEB_TEAMS_KEY, parseWebTeams } from '@/lib/teams/web-teams';

export type PosW = Record<string, number>;
export type SplitTeam = { id: string; name: string };
export type SplitSource = 'kpi-pos' | 'thang-truoc' | 'thang-nay' | 'team-dau';
export type PersonSplit = { id: string; teams: SplitTeam[]; /** POS → mã team nhận. */ owner: Record<string, string>; /** mã team → phần KPI (0–1, cộng = 1). */ share: Record<string, number>;
  /** mã team → các POS mang KPI vào team đó. */ pos: Record<string, string[]>; source: SplitSource };
type TeamLike = { id: string; name: string; dept: string; memberIds: string[] };

/** Tài khoản ở từ 2 team của cùng bộ phận → các team (theo thứ tự ở Chia team). */
export function multiTeamMembers(teams: TeamLike[], dept: string): Map<string, SplitTeam[]> {
  const seen = new Map<string, SplitTeam[]>();
  for (const t of teams.filter((x) => x.dept === dept)) for (const id of new Set(t.memberIds)) seen.set(id, [...(seen.get(id) ?? []), { id: t.id, name: t.name }]);
  return new Map([...seen].filter(([, ts]) => ts.length > 1));
}

const total = (w: PosW | undefined) => Object.values(w ?? {}).reduce((a, v) => a + Math.max(0, Number(v) || 0), 0);

/** Team nhận POS: tỉ lệ doanh thu ở POS đó (trên doanh thu cả team) cao nhất; chưa ai bán → team đầu. */
export function posOwnerOf(teams: SplitTeam[], teamPos: Map<string, PosW>, pos: string): string {
  let best = teams[0].id, most = 0;
  for (const t of teams) {
    const w = teamPos.get(t.id), all = total(w), v = all ? Math.max(0, Number(w?.[pos]) || 0) / all : 0;
    if (v > most) { most = v; best = t.id; }
  }
  return best;
}

/** Tỉ lệ POS để chia KPI của một người: KPI theo POS → DT tháng trước → DT tháng này → không có. */
export function pickWeights(empPos?: PosW | null, prev?: PosW | null, cur?: PosW | null): { w: PosW; source: SplitSource } {
  if (total(empPos ?? undefined) > 0) return { w: empPos!, source: 'kpi-pos' };
  if (total(prev ?? undefined) > 0) return { w: prev!, source: 'thang-truoc' };
  if (total(cur ?? undefined) > 0) return { w: cur!, source: 'thang-nay' };
  return { w: {}, source: 'team-dau' };
}

/** Phần KPI của từng team theo tỉ lệ POS; không có tỉ lệ thì cả phần vào team đầu. */
export function shareOfTeams(teams: SplitTeam[], owner: Record<string, string>, w: PosW): Record<string, number> {
  const out: Record<string, number> = Object.fromEntries(teams.map((t) => [t.id, 0]));
  const all = total(w);
  if (!all) { out[teams[0].id] = 1; return out; }
  for (const [pos, v] of Object.entries(w)) if (Number(v) > 0) out[owner[pos] ?? teams[0].id] += Number(v) / all;
  return out;
}

/** Chia một số theo tỉ lệ, làm tròn đồng; phần lẻ dồn vào team cuối có phần để tổng đúng bằng số gốc. */
export function splitAmount(amount: number, share: Record<string, number>): Record<string, number> {
  const ids = Object.keys(share).filter((id) => share[id] > 0);
  const out: Record<string, number> = Object.fromEntries(Object.keys(share).map((id) => [id, 0]));
  let left = amount;
  ids.forEach((id, i) => { const v = i === ids.length - 1 ? left : Math.round(amount * share[id]); out[id] = v; left -= v; });
  return out;
}

/** Ghép thành PersonSplit (thuần, để test). */
export function buildSplit(id: string, teams: SplitTeam[], teamPos: Map<string, PosW>, posIds: string[], weights: { empPos?: PosW | null; prev?: PosW | null; cur?: PosW | null }): PersonSplit {
  const owner = Object.fromEntries(posIds.map((p) => [p, posOwnerOf(teams, teamPos, p)]));
  const { w, source } = pickWeights(weights.empPos, weights.prev, weights.cur);
  for (const p of Object.keys(w)) owner[p] ??= posOwnerOf(teams, teamPos, p);
  const pos: Record<string, string[]> = Object.fromEntries(teams.map((t) => [t.id, []]));
  for (const [p, v] of Object.entries(w)) if (Number(v) > 0) pos[owner[p]]?.push(p);
  return { id, teams, owner, share: shareOfTeams(teams, owner, w), pos, source };
}

const lastDay = (month: string) => { const [y, m] = month.split('-').map(Number); return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10); };

/** Người nhiều team của từng bộ phận (sale / cskh) → cách tách. untilUtc: cắt số tháng này (giờ gửi báo cáo / lúc nhắn bot). */
export async function loadPersonSplits(db: D1Database, month: string, posIds: string[], untilUtc: string): Promise<Map<'sale' | 'cskh', Map<string, PersonSplit>>> {
  const out = new Map<'sale' | 'cskh', Map<string, PersonSplit>>([['sale', new Map()], ['cskh', new Map()]]);
  const [teamsRow, empRow] = await db.batch([
    db.prepare('SELECT value FROM app_settings WHERE key=?').bind(WEB_TEAMS_KEY),
    db.prepare('SELECT value FROM app_settings WHERE key=?').bind(`target_emp_pos:${month}`),
  ]);
  const teams = parseWebTeams((teamsRow.results as { value: string }[])[0]?.value);
  const multi = { sale: multiTeamMembers(teams, 'sale'), cskh: multiTeamMembers(teams, 'cskh') };
  if (!multi.sale.size && !multi.cskh.size) return out;
  let emp: Record<string, PosW> = {};
  try { emp = JSON.parse((empRow.results as { value: string }[])[0]?.value ?? '{}') ?? {}; } catch { emp = {}; }
  // Doanh thu theo người × POS của mọi thành viên các team có người nhiều team (tháng trước, tháng này tới untilUtc).
  const related = teams.filter((t) => t.memberIds.some((id) => multi[t.dept].has(id)));
  const ids = [...new Set(related.flatMap((t) => t.memberIds))];
  const prev = prevMonthOf(month), pr = vnRangeUtc(`${prev}-01`, lastDay(prev)), cr = vnRangeUtc(`${month}-01`, lastDay(month));
  const curEnd = untilUtc < cr.endUtc ? untilUtc : cr.endUtc;
  const net = 'COALESCE(o.net_total,COALESCE(o.current_total,0)-COALESCE(o.total_discount,0))';
  // Doanh thu theo ngày tạo đơn (revenueDate, 27/11/2026), đơn đã chốt lần đầu trước giờ cắt.
  const at = revenueDate('o.');
  const rows = (await db.prepare(`SELECT o.seller_id AS s, o.pos_id AS pos, COALESCE(SUM(CASE WHEN ${at}<? THEN ${net} END),0) AS prev,
      COALESCE(SUM(CASE WHEN ${at}>=? THEN ${net} END),0) AS cur
    FROM raw_pos_orders o WHERE o.pos_id IN (${posIds.map(() => '?').join(',')}) AND ${at}>=? AND ${at}<? AND o.first_closed_at IS NOT NULL AND o.first_closed_at<? AND o.status_code<>7
      AND o.seller_id IN (SELECT value FROM json_each(?)) GROUP BY 1,2`)
    .bind(pr.endUtc, cr.startUtc, ...posIds, pr.startUtc, curEnd, curEnd, JSON.stringify(ids)).all<{ s: string; pos: string; prev: number; cur: number }>()).results;
  const byUser = new Map<string, { prev: PosW; cur: PosW }>();
  for (const r of rows) {
    const u = byUser.get(String(r.s)) ?? { prev: {}, cur: {} };
    u.prev[r.pos] = (u.prev[r.pos] ?? 0) + Number(r.prev); u.cur[r.pos] = (u.cur[r.pos] ?? 0) + Number(r.cur);
    byUser.set(String(r.s), u);
  }
  for (const dept of ['sale', 'cskh'] as const) {
    // POS của team: doanh thu (2 tháng) của thành viên chỉ ở 1 team.
    const teamPos = new Map<string, PosW>();
    for (const t of teams.filter((x) => x.dept === dept)) {
      const w: PosW = {};
      for (const id of t.memberIds) {
        if (multi[dept].has(id)) continue;
        const u = byUser.get(id);
        for (const src of u ? [u.prev, u.cur] : []) for (const [p, v] of Object.entries(src)) w[p] = (w[p] ?? 0) + v;
      }
      teamPos.set(t.id, w);
    }
    for (const [id, ts] of multi[dept]) out.get(dept)!.set(id, buildSplit(id, ts, teamPos, posIds, { empPos: emp[id], prev: byUser.get(id)?.prev, cur: byUser.get(id)?.cur }));
  }
  return out;
}
