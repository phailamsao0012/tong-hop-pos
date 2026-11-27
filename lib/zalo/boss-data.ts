// Số cho báo cáo tổng quan gửi sếp (lib/zalo/boss-report.ts). Mọi POS. Đọc lại từ đơn gốc như trang Điều hành, không dùng số AI.
// - Tổng công ty và bảng POS: chỉ đơn của người bán được tính (hậu tố SALE / CSKH / MKT, người được bật Vẫn tính, người đã xếp team) — luật số 1.
// - KPI bộ phận = cộng KPI doanh thu từng tài khoản, xếp bộ phận theo HẬU TỐ TÊN như doanh thu (không theo web nhân sự).
// - Doanh thu Sale / CSKH: đơn người bán thuộc bộ phận đã chốt, "đã chốt là chốt" (không trừ hủy / hoàn về sau), xếp theo NGÀY TẠO đơn
//   (anh Vũ 27/11/2026, trước là ngày chốt đầu); chỉ tính đơn đã chốt trước giờ cắt để vẽ lúc nào cũng ra cùng số. Cùng cách KPI ngày (lib/kpi/kpi-day-report.ts).
// - MKT: DT New, chi phí, số đưa về (SĐT khác nhau) theo trang Chi phí & ROAS (lib/reports/mkt-analytics.ts), cả số lớn lẫn KPI.
// - Tỉ lệ chốt: đơn lên trong khoảng giờ báo cáo đã chốt (lần đầu) trước giờ cắt ÷ đơn lên trong khoảng đó, đếm từ đơn gốc (16/11/2026).
// - Hoàn / hủy: trên đơn đi (đã vào Đang đóng hàng), đơn xác nhận từ đầu tháng.
import { env } from 'cloudflare:workers';
import { POS } from '@/lib/shared/report-model';
import { addDays, vnRangeUtc } from '@/lib/shared/report-time';
import { revenueDate } from '@/lib/reports/stats';
import { COUNTED_STAFF, teamSubquery } from '@/lib/teams/team';
import { WEB_TEAMS_KEY, parseWebTeams } from '@/lib/teams/web-teams';
import { mktAnalytics } from '@/lib/reports/mkt-analytics';
import { marketingOverview } from '@/lib/reports/marketing-overview';
import { vanDonCarriers } from '@/lib/reports/van-don-carriers';
import { AFTER_PACK_CANCELLED_SQL, AFTER_PACK_RETURNED_SQL, PACKED_SQL } from '@/lib/reports/van-don';
import { KPI2_KEY, parseKpi2 } from '@/lib/kpi/kpi2';
import { UNASSIGNED_TEAM } from '@/lib/teams/marketing-teams';
import { loadPersonSplits, splitAmount } from '@/lib/zalo/team-pos-split';
import { OUTSIDE_TEAM, type BossData, type CskhPosRow, type MktPersonRow, type MktTeamRow, type PersonRow, type PosRow, type SalePosRow, type TeamRow } from '@/lib/zalo/boss-report';

const NET = 'COALESCE(o.net_total,COALESCE(o.current_total,0)-COALESCE(o.total_discount,0))';
/** Tài khoản MKT: tên có hậu tố MKT, hoặc đã xếp vào team MKT (Cài đặt → Chia team). */
export const MKT_ACCOUNTS = "(SELECT user_id FROM pos_users WHERE name LIKE '%mkt%' UNION SELECT m.value FROM app_settings s, json_each(s.value) t, json_each(t.value, '$.memberIds') m WHERE s.key='marketing_teams_v1' AND json_valid(s.value))";
const DOW = ['Chủ nhật', 'thứ Hai', 'thứ Ba', 'thứ Tư', 'thứ Năm', 'thứ Sáu', 'thứ Bảy'];
const dm = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;
const dowOf = (d: string) => DOW[new Date(`${d}T00:00:00Z`).getUTCDay()];
const iso = (ms: number) => new Date(ms).toISOString().slice(0, 19);

/**
 * sendDay: ngày gửi (VN). hour: "08" (báo cáo sáng: số trọn ngày hôm qua) hoặc "12" / "17" / "22" (số hôm nay từ 0h tới lúc gửi).
 * now: thời điểm gửi (để so cùng giờ hôm qua).
 */
export async function bossReportData(sendDay: string, hour: string, morning: boolean, now = Date.now(), db: D1Database = env.DB): Promise<BossData> {
  const day = morning ? addDays(sendDay, -1) : sendDay;
  const month = day.slice(0, 7), monthStart = `${month}-01`;
  const posIds = POS.map((p) => p.id), ph = posIds.map(() => '?').join(',');
  const dayR = vnRangeUtc(day, day), prevR = vnRangeUtc(addDays(day, -1), addDays(day, -1)), monthR = vnRangeUtc(monthStart, day);
  // Cắt cùng giờ: báo cáo ca so 0h → giờ gửi của hôm nay với 0h → cùng giờ hôm qua; báo cáo sáng so trọn ngày.
  // Báo cáo ca cắt đúng giờ của ca (anh Vũ 16/11/2026: "0h tới 8h" chạy lúc 10h vẫn ra số tới 8h); chưa tới giờ đó thì cắt tại lúc chạy.
  const slotEnd = Math.min(now, Date.parse(day + "T" + String(Number(hour)).padStart(2, "0") + ":00:00+07:00"));
  const cut = morning ? dayR.endUtc : iso(slotEnd), prevCut = morning ? prevR.endUtc : iso(slotEnd - 86400000);
  const from = prevR.startUtc < monthR.startUtc ? prevR.startUtc : monthR.startUtc;
  const sale = teamSubquery('sale')!, cskh = teamSubquery('cskh')!;
  // Mỗi ô: đơn tạo trong [từ, tới) và đã chốt lần đầu trước mốc chốt (closedCut). Báo cáo ca: mốc chốt = giờ cắt của ca (chạy lúc 10h vẫn ra
  // số như lúc 8h). Báo cáo sáng (trọn ngày hôm qua): đơn tạo hôm qua, chốt tới 8h sáng nay vẫn tính cho hôm qua (doanh thu theo ngày tạo).
  // Hôm qua để so: cùng mốc lùi 1 ngày.
  const closedCutMs = morning ? Math.min(now, Date.parse(`${sendDay}T08:00:00+07:00`)) : slotEnd;
  const closedCut = iso(closedCutMs), prevClosedCut = iso(closedCutMs - 86400000);
  const at = revenueDate('o.');
  const sums = () => `COALESCE(SUM(CASE WHEN ${at}>=? AND ${at}<? AND o.first_closed_at<? THEN ${NET} END),0) AS today_net, SUM(CASE WHEN ${at}>=? AND ${at}<? AND o.first_closed_at<? THEN 1 ELSE 0 END) AS today_orders,
      COALESCE(SUM(CASE WHEN ${at}>=? AND ${at}<? AND o.first_closed_at<? THEN ${NET} END),0) AS month_net, COALESCE(SUM(CASE WHEN ${at}>=? AND ${at}<? AND o.first_closed_at<? THEN ${NET} END),0) AS prev_net`;
  // Thứ tự đúng các dấu ? trong sums(): today_net, today_orders, month_net, prev_net (mỗi cái 3: từ, tới, chốt trước).
  const sumBinds = [dayR.startUtc, cut, closedCut, dayR.startUtc, cut, closedCut, monthR.startUtc, cut, closedCut, prevR.startUtc, prevCut, prevClosedCut];
  const [bySeller, byPos, ratesToday, ratesPrev, afterPack, teamsRow, targets, kpi2Row, hrTeam, overdue, costRow] = await db.batch([
    db.prepare(`SELECT o.seller_id AS id, CASE WHEN o.seller_id IN ${sale} THEN 'sale' WHEN o.seller_id IN ${cskh} THEN 'cskh' ELSE '' END AS dept,
        o.pos_id AS pos, (SELECT MAX(name) FROM pos_users p WHERE p.user_id=o.seller_id AND p.name<>'') AS name, ${sums()}
      FROM raw_pos_orders o WHERE o.pos_id IN (${ph}) AND ${at}>=? AND ${at}<? AND o.first_closed_at IS NOT NULL AND o.status_code<>7 GROUP BY o.seller_id, o.pos_id`)
      .bind(...sumBinds, ...posIds, from, cut),
    db.prepare(`SELECT o.pos_id AS id, ${sums()} FROM raw_pos_orders o
      WHERE o.pos_id IN (${ph}) AND ${at}>=? AND ${at}<? AND o.first_closed_at IS NOT NULL AND o.status_code<>7 AND o.seller_id IN ${COUNTED_STAFF} GROUP BY o.pos_id`).bind(...sumBinds, ...posIds, from, cut),
    // Tỉ lệ chốt cắt đúng khoảng giờ báo cáo (anh Vũ 16/11/2026): đơn lên trong khoảng [0h, giờ cắt) và đã chốt trước giờ cắt.
    // Trước đây đọc bảng stats_daily (cộng cả ngày tới lúc chạy, theo trạng thái hiện tại) nên vẽ lúc 10h ra số khác lúc 8h, và số ngày
    // đã đóng còn trôi khi đơn đổi trạng thái về sau. Nay đếm từ đơn gốc theo giờ chốt lần đầu ("đã chốt là chốt"): vẽ lúc nào cũng ra cùng số.
    db.prepare(`SELECT o.seller_id AS id, o.pos_id AS pos, CASE WHEN o.seller_id IN ${sale} THEN 'sale' WHEN o.seller_id IN ${cskh} THEN 'cskh' ELSE '' END AS dept,
        COUNT(*) AS base, SUM(CASE WHEN o.first_closed_at IS NOT NULL AND o.first_closed_at<? THEN 1 ELSE 0 END) AS closed
      FROM raw_pos_orders o WHERE o.pos_id IN (${ph}) AND o.created_at>=? AND o.created_at<? AND o.status_code<>7 AND NULLIF(o.seller_id,'') IS NOT NULL GROUP BY 1, 2`)
      .bind(cut, ...posIds, dayR.startUtc, cut),
    db.prepare(`SELECT CASE WHEN o.seller_id IN ${sale} THEN 'sale' WHEN o.seller_id IN ${cskh} THEN 'cskh' ELSE '' END AS dept, o.pos_id AS pos,
        COUNT(*) AS base, SUM(CASE WHEN o.first_closed_at IS NOT NULL AND o.first_closed_at<? THEN 1 ELSE 0 END) AS closed
      FROM raw_pos_orders o WHERE o.pos_id IN (${ph}) AND o.created_at>=? AND o.created_at<? AND o.status_code<>7 AND NULLIF(o.seller_id,'') IS NOT NULL GROUP BY 1, 2`)
      .bind(prevCut, ...posIds, prevR.startUtc, prevCut),
    db.prepare(`SELECT SUM(${PACKED_SQL('o')}) AS packed, SUM(${PACKED_SQL('o')} AND ${AFTER_PACK_RETURNED_SQL('o')}) AS returned, SUM(${AFTER_PACK_CANCELLED_SQL('o')}) AS cancelled
      FROM raw_pos_orders o WHERE o.pos_id IN (${ph}) AND o.first_confirmed_at>=? AND o.first_confirmed_at<? AND o.status_code NOT IN (0,17,7) AND o.seller_id IN ${sale}`)
      .bind(...posIds, monthR.startUtc, cut),
    db.prepare('SELECT value FROM app_settings WHERE key=?').bind(WEB_TEAMS_KEY),
    db.prepare("SELECT scope, ref_id, revenue FROM targets WHERE month=? AND scope IN ('employee','team','dept_pos')").bind(month),
    db.prepare('SELECT value FROM app_settings WHERE key=?').bind(KPI2_KEY(month)),
    // Bộ phận của tài khoản theo HẬU TỐ TÊN, đúng cách xếp doanh thu (luật số 1; plan Đầu não bước 6, 14/11/2026).
    db.prepare(`SELECT u.user_id AS id, CASE WHEN u.user_id IN ${sale} THEN 'sale' WHEN u.user_id IN ${cskh} THEN 'cskh' WHEN u.user_id IN ${MKT_ACCOUNTS} THEN 'mkt' ELSE '' END AS team
      FROM (SELECT DISTINCT ref_id AS user_id FROM targets WHERE month=? AND scope='employee') u`).bind(month),
    db.prepare("SELECT COUNT(*) AS n FROM zalo_tasks WHERE status NOT IN ('xong','huy') AND due_date IS NOT NULL AND due_date<?").bind(sendDay),
    // Chi phí QC của ngày nhập từ sheet lúc nào (sheet thường đủ khoảng 9h–9h45 sáng hôm sau).
    db.prepare('SELECT MAX(updated_at) AS at FROM ad_costs WHERE day=?').bind(day),
  ]);
  type Sum = { today_net: number; today_orders: number; month_net: number; prev_net: number };
  // Số theo người × POS (người ở nhiều team tách theo POS của team, lib/zalo/team-pos-split.ts); gộp theo người cho danh sách người.
  const sellerPos = bySeller.results as (Sum & { id: string | null; pos: string; dept: string; name: string | null })[];
  const sellerMap = new Map<string, Sum & { id: string; dept: string; name: string | null }>();
  for (const r of sellerPos) {
    if (!r.id) continue;
    const x = sellerMap.get(String(r.id)) ?? { id: String(r.id), dept: r.dept, name: r.name, today_net: 0, today_orders: 0, month_net: 0, prev_net: 0 };
    x.today_net += Number(r.today_net); x.today_orders += Number(r.today_orders); x.month_net += Number(r.month_net); x.prev_net += Number(r.prev_net);
    sellerMap.set(String(r.id), x);
  }
  const sellers = [...sellerMap.values()];
  const ratePos = (ratesToday.results as { id: string | null; pos: string; dept: string; base: number; closed: number }[])
    .filter((r) => r.id).map((r) => ({ id: String(r.id), pos: r.pos, dept: r.dept, base: Number(r.base), closed: Math.min(Number(r.base), Number(r.closed)) }));
  const rate = new Map<string, { base: number; closed: number }>();
  for (const r of ratePos) { const x = rate.get(r.id) ?? { base: 0, closed: 0 }; x.base += r.base; x.closed += r.closed; rate.set(r.id, x); }
  const splits = await loadPersonSplits(db, month, posIds, cut);
  const prevRatePos = (ratesPrev.results as { dept: string; pos: string; base: number; closed: number }[]).map((r) => ({ dept: r.dept, pos: r.pos, base: Number(r.base), closed: Math.min(Number(r.base), Number(r.closed)) }));
  const prevRate = new Map<string, { base: number; closed: number }>();
  for (const r of prevRatePos) { const x = prevRate.get(r.dept) ?? { base: 0, closed: 0 }; x.base += r.base; x.closed += r.closed; prevRate.set(r.dept, x); }
  const teams = parseWebTeams((teamsRow.results as { value: string }[])[0]?.value);
  const tg = targets.results as { scope: string; ref_id: string; revenue: number }[];
  const empGoal = new Map(tg.filter((t) => t.scope === 'employee').map((t) => [t.ref_id, Number(t.revenue) || 0]));
  const deptPos = (dept: string) => tg.filter((t) => t.scope === 'dept_pos' && t.ref_id.startsWith(`${dept}:`)).reduce((a, t) => a + (Number(t.revenue) || 0), 0);
  const deptOf = new Map((hrTeam.results as { id: string; team: string }[]).map((r) => [String(r.id), r.team]));
  const goalOfDept = (dept: string) => {
    const people = [...empGoal].filter(([id]) => deptOf.get(id) === dept).reduce((a, [, v]) => a + v, 0);
    return people || deptPos(dept) || null;
  };

  const deptRows = (dept: 'sale' | 'cskh') => {
    const own = teams.filter((t) => t.dept === dept), split = splits.get(dept)!;
    const firstTeam = new Map<string, string>();
    for (const t of own) for (const id of t.memberIds) if (!firstTeam.has(id)) firstTeam.set(id, t.id);
    // Hàng của một dòng số: người nhiều team → team nhận POS đó; người 1 team → team đó; không team → Ngoài team.
    const OUT = '~ngoai-team';
    const keyOf = (id: string, pos: string) => split.get(id)?.owner[pos] ?? firstTeam.get(id) ?? OUT;
    const acc = new Map<string, TeamRow>();
    const at = (k: string) => {
      let t = acc.get(k);
      if (!t) acc.set(k, t = { name: k === OUT ? OUTSIDE_TEAM : own.find((x) => x.id === k)?.name ?? k, net: 0, orders: 0, base: 0, closed: 0, monthNet: 0, goal: null });
      return t;
    };
    const mine = sellers.filter((x) => x.dept === dept);
    for (const r of sellerPos) if (r.id && r.dept === dept) { const t = at(keyOf(String(r.id), r.pos)); t.net += Number(r.today_net); t.orders += Number(r.today_orders); t.monthNet += Number(r.month_net); }
    for (const r of ratePos) if (r.dept === dept) { const t = at(keyOf(r.id, r.pos)); t.base += r.base; t.closed += r.closed; }
    // KPI: người thuộc bộ phận (theo hậu tố) → team của người; người nhiều team chia theo tỉ lệ POS; không team → Ngoài team. Cộng các hàng = KPI bộ phận.
    for (const [id, g] of empGoal) {
      if (deptOf.get(id) !== dept || !g) continue;
      const sp = split.get(id), parts = sp ? splitAmount(g, sp.share) : { [firstTeam.get(id) ?? OUT]: g };
      for (const [k, v] of Object.entries(parts)) if (v) { const t = at(k); t.goal = (t.goal ?? 0) + v; }
    }
    const teamRows = [...acc].filter(([k, t]) => k !== OUT && (t.net || t.base || t.goal || t.monthNet)).map(([, t]) => t).sort((x, y) => y.net - x.net);
    const outside = acc.get(OUT);
    if (outside && (outside.net || outside.base || outside.goal || outside.monthNet)) teamRows.push(outside);
    const teamNames = (id: string) => split.get(id)?.teams.map((t) => t.name).join(' + ') ?? own.find((t) => t.id === firstTeam.get(id))?.name ?? OUTSIDE_TEAM;
    const people: PersonRow[] = mine.map((x) => {
      const r = rate.get(x.id) ?? { base: 0, closed: 0 };
      return { name: x.name ?? x.id.slice(0, 8), team: teamNames(x.id), net: Number(x.today_net), orders: Number(x.today_orders), base: r.base, closed: r.closed };
    });
    const total = mine.reduce((p, x) => ({ today: p.today + Number(x.today_net), month: p.month + Number(x.month_net), orders: p.orders + Number(x.today_orders), prev: p.prev + Number(x.prev_net) }), { today: 0, month: 0, orders: 0, prev: 0 });
    // Theo POS (mẫu rút gọn 17/11/2026): cùng các dòng số với ô tổng nên cộng các POS đúng bằng ô tổng.
    const byPos: SalePosRow[] = POS.map((p) => {
      const row: SalePosRow = { name: p.name, net: 0, prevNet: 0, orders: 0, base: 0, closed: 0, prevBase: 0, prevClosed: 0 };
      for (const r of sellerPos) if (r.id && r.dept === dept && r.pos === p.id) { row.net += Number(r.today_net); row.prevNet += Number(r.prev_net); row.orders += Number(r.today_orders); }
      for (const r of ratePos) if (r.dept === dept && r.pos === p.id) { row.base += r.base; row.closed += r.closed; }
      for (const r of prevRatePos) if (r.dept === dept && r.pos === p.id) { row.prevBase += r.base; row.prevClosed += r.closed; }
      return row;
    }).filter((r) => r.net || r.prevNet || r.orders || r.base).sort((a, b) => b.net - a.net);
    const r = ratePos.filter((x) => x.dept === dept).reduce((p, x) => ({ base: p.base + x.base, closed: p.closed + x.closed }), { base: 0, closed: 0 });
    const p = prevRate.get(dept);
    return { total, byPos, teams: teamRows, people, base: r.base, closed: r.closed, prevBase: Number(p?.base ?? 0), prevClosed: Math.min(Number(p?.base ?? 0), Number(p?.closed ?? 0)) };
  };
  const s = deptRows('sale'), c = deptRows('cskh');

  // MKT: chi phí, DT New theo trang Chi phí & ROAS (mktAnalytics); SỐ VỀ, ĐƠN NEW, TL CHỐT theo đúng trang Marketing trên web (marketingOverview,
  // anh Vũ 16/11/2026: "những số này nên lấy trên web"): số về = SĐT khác nhau trên đơn chia Sale (không cộng trùng theo marketer),
  // TL chốt = đơn New ÷ số về, không lẫn đơn CSKH. Kết quả trang Marketing giữ 60 giây nên web vừa tính thì báo cáo dùng lại.
  const mo = (start: string, end: string, until = cut) => marketingOverview({ role: 'owner' } as never, new URLSearchParams({ basis: 'created', stage: 'confirmed', team: 'all', until }), posIds, start, end, null);
  const prevDay = addDays(day, -1);
  const [mToday, mMonth, wToday, wMonth, mPrev, wPrev] = await Promise.all([
    // DT New theo ngày tạo đơn (27/11/2026), đơn đã xác nhận trước mốc chốt như Sale / CSKH.
    mktAnalytics({ posIds, start: day, end: day, db, untilUtc: cut, closedUntilUtc: closedCut }),
    day === monthStart ? null : mktAnalytics({ posIds, start: monthStart, end: day, db, untilUtc: cut, closedUntilUtc: closedCut }),
    mo(day, day),
    day === monthStart ? null : mo(monthStart, day),
    // So hôm qua (mẫu rút gọn 17/11/2026): cùng khoảng giờ hôm qua, báo cáo trọn ngày thì trọn ngày trước.
    mktAnalytics({ posIds, start: prevDay, end: prevDay, db, untilUtc: prevCut, closedUntilUtc: prevClosedCut }),
    mo(prevDay, prevDay, prevCut),
  ]);
  type WebTeam = { marketingTeamId: string; createdNewPhones?: number; newConfirmed?: number };
  type WebM = { marketerId: string; createdNewPhones?: number; newConfirmed?: number };
  const webTeam = (w: typeof wToday, id: string) => (w?.byTeam as WebTeam[] | undefined)?.find((x) => x.marketingTeamId === id);
  const webLeads = (w: typeof wToday) => Number((w?.summary as { createdNewPhones?: number } | undefined)?.createdNewPhones ?? 0);
  const kpi2 = parseKpi2((kpi2Row.results as { value: string }[])[0]?.value) ?? {};
  const leadsOf = (key: string) => kpi2[key]?.leads ?? 0;
  const mktTeamRows: MktTeamRow[] = mToday.teams.map((t) => {
    const members = (mMonth ?? mToday).people.filter((p) => p.teamId === t.id);
    const goal = leadsOf(`team:${t.id}`) || members.reduce((a, p) => a + leadsOf(`employee:${p.id}`), 0) || null;
    const w = webTeam(wToday, t.id);
    return { name: t.id === UNASSIGNED_TEAM ? 'Ngoài team' : t.name, cost: t.cost, newNet: t.newNet, leads: Number(w?.createdNewPhones ?? 0), closed: Number(w?.newConfirmed ?? 0), leadsGoal: goal,
      monthLeads: Number(webTeam(wMonth ?? wToday, t.id)?.createdNewPhones ?? 0),
      prevNewNet: mPrev.teams.find((x) => x.id === t.id)?.newNet ?? 0, prevLeads: Number(webTeam(wPrev, t.id)?.createdNewPhones ?? 0) };
  }).sort((a, b) => b.newNet - a.newNet);
  const teamName = (id: string) => (id === UNASSIGNED_TEAM ? 'Ngoài team' : mToday.teams.find((x) => x.id === id)?.name ?? 'Ngoài team');
  const webPeople = new Map(((wToday?.byMarketer ?? []) as WebM[]).map((x) => [x.marketerId, x]));
  const mktPeople: MktPersonRow[] = mToday.people.map((p) => ({ name: p.name, team: teamName(p.teamId), cost: p.cost, newNet: p.newNet,
    leads: Number(webPeople.get(p.id)?.createdNewPhones ?? 0), closed: Number(webPeople.get(p.id)?.newConfirmed ?? 0) }));
  // KPI số cả bộ phận: dòng "dept:mkt" nếu đặt; không thì cộng KPI số các team (team chưa đặt thì cộng KPI số từng người).
  const leadsGoalAll = leadsOf('dept:mkt') || mktTeamRows.reduce((a, t) => a + (t.leadsGoal ?? 0), 0) || null;

  const posRows: PosRow[] = (byPos.results as (Sum & { id: string })[]).map((r) => ({ name: POS.find((p) => p.id === r.id)?.name ?? r.id, net: Number(r.today_net), orders: Number(r.today_orders), yesterday: Number(r.prev_net) }))
    .filter((r) => r.net || r.yesterday).sort((a, b) => b.net - a.net);
  const ap = (afterPack.results as { packed: number; returned: number; cancelled: number }[])[0];
  // Đơn đi & vận đơn cũng cắt đúng khoảng giờ báo cáo (anh Vũ 16/11/2026).
  const ship = await vanDonCarriers(posIds, day, day, cut).catch(() => null);
  const company = posRows.reduce((a, r) => ({ net: a.net + r.net, orders: a.orders + r.orders, yesterday: a.yesterday + r.yesterday }), { net: 0, orders: 0, yesterday: 0 });
  const h = Number(hour);
  return {
    day, until: morning ? null : `${h}h`,
    // 8h gửi 2 báo cáo riêng (anh Vũ 15/11/2026): tổng kết trọn ngày hôm qua và báo cáo hôm nay từ 0h tới 8h.
    title: morning ? `Tổng kết ${dowOf(day)} ${dm(day)}` : `${h}h ${dowOf(day)} ${dm(day)}`,
    range: morning ? 'số trọn ngày' : `số từ 0h tới ${h}h`,
    company,
    sale: { kpi: { goal: goalOfDept('sale'), monthNet: s.total.month, todayNet: s.total.today }, base: s.base, closed: s.closed, prevBase: s.prevBase, prevClosed: s.prevClosed,
      packed: Number(ap?.packed ?? 0), returned: Number(ap?.returned ?? 0), cancelled: Number(ap?.cancelled ?? 0), teams: s.teams, people: s.people, prevNet: s.total.prev, byPos: s.byPos },
    cskh: { kpi: { goal: goalOfDept('cskh'), monthNet: c.total.month, todayNet: c.total.today }, orders: c.total.orders, prevOrders: 0, base: c.base, closed: c.closed, prevBase: c.prevBase, prevClosed: c.prevClosed, teams: c.teams, people: c.people, prevNet: c.total.prev,
      byPos: c.byPos.map((r): CskhPosRow => ({ name: r.name, net: r.net, prevNet: r.prevNet, orders: r.orders })) },
    mkt: { kpi: { goal: goalOfDept('mkt'), monthNet: (mMonth ?? mToday).current.newNet, todayNet: mToday.current.newNet }, leads: webLeads(wToday), monthLeads: webLeads(wMonth ?? wToday),
      leadsGoal: leadsGoalAll, cost: mToday.current.cost, prevNewNet: mPrev.current.newNet, prevLeads: webLeads(wPrev), costAt: (costRow.results as { at: string | null }[])[0]?.at ?? null, teams: mktTeamRows, people: mktPeople },
    pos: posRows,
    ship: { packed: ship?.total.orders ?? 0, closed: company.orders, vtp: ship?.rows.find((r) => r.carrier === 'VTP')?.orders ?? 0, spx: ship?.rows.find((r) => r.carrier === 'SPX')?.orders ?? 0,
      others: (ship?.rows ?? []).filter((r) => r.carrier !== 'VTP' && r.carrier !== 'SPX' && r.orders > 0).map((r) => ({ name: r.carrier, orders: r.orders })),
      net: ship?.total.net ?? 0, nets: (ship?.rows ?? []).filter((r) => r.orders > 0).map((r) => ({ name: r.carrier === 'VTP' ? 'Viettel Post' : r.carrier === 'SPX' ? 'Shopee Express' : r.carrier, net: r.net })) },
    overdueTasks: Number((overdue.results as { n: number }[])[0]?.n ?? 0),
  };
}
