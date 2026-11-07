import { env } from 'cloudflare:workers';
import { overviewReport } from '@/lib/reports/overview-report';
import { resolveHrUnit } from '@/lib/teams/hr-unit';
import { countedFilter, teamFilter } from '@/lib/teams/team';
import { todayVn, addDays, vnDayStartUtc, vnRangeUtc } from '@/lib/shared/report-time';
import { createZaloSender, sendZaloPhoto } from '@/lib/zalo/zalo';
import { saveMorningImage, pruneMorningImages } from '@/lib/zalo/morning-store';
import { webOrigin } from '@/lib/notify/origin';
import { logMessage, pruneMessages, type ChatKind } from '@/lib/zalo/zalo-chat';
import { loadReportTargets } from '@/lib/zalo/team-link';
import { buildBossSlotReport, bossSlotText, type BossSlotReport, type BossSlotTeam } from '@/lib/zalo/slot-report';
import { buildMorningReport, morningText, withHidden, type MorningData, type MorningReport } from '@/lib/zalo/morning-report';
import { REPORT_SCHEDULE_KEY, hiddenSections, legacySlotKey, parseReportSchedule, previousTime, runsOn, timeKey, timeLabel } from '@/lib/zalo/report-schedule';

const MORNING_TEST = 'anh-1';
import { listTargets } from '@/lib/kpi/targets';
import { KPI2_KEY, parseKpi2 } from '@/lib/kpi/kpi2';
import { kpi2Rows, type Kpi2Row } from '@/lib/zalo/kpi2-report';
import { sellerProductQty, qtyOf } from '@/lib/reports/seller-product-qty';
import { cskhUpsell, upsellOf } from '@/lib/reports/cskh-upsell';
import { POS } from '@/lib/shared/report-model';
import { LOW_RATE_EVERY_MIN, LOW_RATE_KEY, currentSlot, lowRateText, pickLowRate, todayRates, type LowRateState } from '@/lib/zalo/low-rate';
import { WEB_TEAMS_KEY, parseWebTeams } from '@/lib/teams/web-teams';
import { DEFAULT_ZALO_SETTINGS, listContacts, writeZaloSetting, formatList, formatOverdue, formatIdleAlert, formatMeetingMessage, type Contact, type Task, type Meeting, type ZaloSend } from '@/lib/zalo/zalo-work';

type Snapshot = { total: number; orders: number; created?: number; createdClosed?: number; people: Record<string, { name: string; total: number; orders: number }> };
type TickState = { day?: string; morning?: string; morningTest?: string; overdue?: string; slot12?: string; slot17?: string; slot22?: string; idle?: string; prune?: string; snap?: Record<string, Record<string, Snapshot>>;
  /** Ngày đã gửi báo cáo ca theo giờ "HH:MM" (Cài đặt báo cáo); ca 12:00/17:00/22:00 vẫn ghi thêm khoá cũ slot12… */
  slots?: Record<string, string>;
  /** Số cùng giờ các ngày trước để báo cáo ca so sánh (giữ 15 ngày): team → ngày → giờ. */
  hist?: Record<string, Record<string, Record<string, { net: number; orders: number; created: number; createdClosed: number }>>>;
  /** Doanh số tháng tới hết hôm qua + KPI, lưu lúc 8h để báo cáo ca khỏi đọc lại D1. */
  month?: Record<string, { day: string; monthNet: number; goal: number | null; workingDays: number | null }> };
export async function zaloTeamSnapshot(leader: Contact, day: string): Promise<Snapshot | null> {
  if (!leader.team_id || !['sale', 'cskh'].includes(leader.dept)) return null;
  const scope = await resolveHrUnit(new URLSearchParams({ hrTeam: leader.team_id }), leader.dept as 'sale' | 'cskh');
  if (scope instanceof Response || scope.dropped || !scope.unit) return null;
  const report = await overviewReport({ posIds: [], start: day, end: day, team: scope.team, unit: scope.unit });
  const people = Object.fromEntries(report.current.byEmployee.filter(r => r.sellerId).map(r => [r.sellerId, { name: r.name, total: r.closedNet, orders: r.closedOrders }]));
  const members = (await env.DB.prepare(`SELECT DISTINCT user_id,name FROM pos_users WHERE name<>''${teamFilter('user_id', scope.team, true, scope.unit)}${countedFilter('user_id')}`).all<{ user_id: string; name: string }>()).results;
  for (const member of members) people[member.user_id] ??= { name: member.name, total: 0, orders: 0 };
  return { total: report.current.total.closedNet, orders: report.current.total.closedOrders, created: report.current.total.orders, createdClosed: report.current.total.createdClosedOrders, people };
}
export type ZaloPhotoSend = (chatId: string, photoUrl: string, caption: string) => Promise<boolean>;
type MorningNumbers = Omit<MorningData, 'overdue' | 'dueToday' | 'meetings'>;
/** Số cho báo cáo 8h: một lần đọc báo cáo tổng quan của team, từ đầu tháng (hoặc 14 ngày trước) tới hết hôm qua. */
export async function zaloMorningData(leader: Contact, today: string): Promise<MorningNumbers | null> {
  if (!leader.team_id || !['sale', 'cskh'].includes(leader.dept)) return null;
  const dept = leader.dept as 'sale' | 'cskh';
  const scope = await resolveHrUnit(new URLSearchParams({ hrTeam: leader.team_id }), dept);
  if (scope instanceof Response || scope.dropped || !scope.unit) return null;
  const y = addDays(today, -1), monthStart = y.slice(0, 8) + '01', from = addDays(y, -13);
  const report = await overviewReport({ posIds: [], start: from < monthStart ? from : monthStart, end: y, team: scope.team, unit: scope.unit });
  const days = new Map<string, MorningData['days'][number]>();
  for (const s of report.current.series) {
    const d = days.get(s.bucket) ?? { day: s.bucket, net: 0, orders: 0, created: 0, createdClosed: 0 };
    d.net += s.closedNet; d.orders += s.closedOrders; d.created += s.orders; d.createdClosed += s.createdClosedOrders;
    days.set(s.bucket, d);
  }
  const members = (await env.DB.prepare(`SELECT DISTINCT user_id,name FROM pos_users WHERE name<>''${teamFilter('user_id', scope.team, true, scope.unit)}${countedFilter('user_id')}`).all<{ user_id: string; name: string }>()).results;
  const people = new Map(members.map((m) => [m.user_id, { name: m.name, net: 0, orders: 0 }]));
  for (const r of report.current.byEmployeeDay) {
    const p = r.day === y ? people.get(r.sellerId) : undefined;
    if (p) { p.net += r.closedNet; p.orders += r.closedOrders; }
  }
  const target = (await listTargets(y.slice(0, 7))).find((t) => t.scope === 'team' && t.refId === scope.unit!.id);
  return {
    team: leader.team_name, dept, today, days: [...days.values()],
    monthNet: [...days.values()].filter((d) => d.day >= monthStart).reduce((a, d) => a + d.net, 0),
    goal: target?.revenue || null, workingDays: target?.workingDays ?? null, people: [...people.values()],
  };
}
type Kpi2Shared = Map<string, Promise<unknown>>;
const once = <T,>(cache: Kpi2Shared, key: string, load: () => Promise<T>) => {
  if (!cache.has(key)) cache.set(key, load().catch(() => null));
  return cache.get(key) as Promise<T | null>;
};
/** Dòng chỉ tiêu KPI mới của team, số từ đầu tháng tới hết toDay (lib/zalo/kpi2-report.ts). Team chưa đặt chỉ tiêu thì không đọc thêm gì.
 *  Số lượng sản phẩm và tỷ lệ upsell đọc một lần cho mọi team trong cùng lượt gửi (cache). */
export async function zaloKpi2(leader: Contact, toDay: string, cache: Kpi2Shared): Promise<Kpi2Row[]> {
  if (!leader.team_id || !['sale', 'cskh'].includes(leader.dept)) return [];
  const dept = leader.dept as 'sale' | 'cskh', month = toDay.slice(0, 7), monthStart = `${month}-01`;
  const map = await once(cache, `kpi:${month}`, async () => parseKpi2((await env.DB.prepare('SELECT value FROM app_settings WHERE key=?').bind(KPI2_KEY(month)).first<{ value: string }>())?.value));
  const scope = await resolveHrUnit(new URLSearchParams({ hrTeam: leader.team_id }), dept);
  if (scope instanceof Response || scope.dropped || !scope.unit) return [];
  const goal = map?.[`team:${scope.unit.id}`];
  if (!goal) return [];
  const ids = (await env.DB.prepare(`SELECT DISTINCT user_id FROM pos_users WHERE name<>''${teamFilter('user_id', scope.team, true, scope.unit)}${countedFilter('user_id')}`).all<{ user_id: string }>()).results.map((r) => String(r.user_id));
  if (!ids.length) return [];
  const posIds = POS.map((p) => p.id), { startUtc, endUtc } = vnRangeUtc(monthStart, toDay);
  const sums = dept === 'sale' && (goal.assigned || goal.closed || goal.orders)
    ? await env.DB.prepare(`SELECT SUM(assigned_orders) AS assigned, SUM(assigned_closed_orders) AS closed, SUM(closed_orders) AS orders FROM stats_daily
        WHERE pos_id IN (${posIds.map(() => '?').join(',')}) AND day>=? AND day<=? AND seller_id IN (${ids.map(() => '?').join(',')})`).bind(...posIds, monthStart, toDay, ...ids).first<{ assigned: number; closed: number; orders: number }>()
    : null;
  const qty = goal.products && Object.keys(goal.products).length ? await once(cache, `qty:${monthStart}:${toDay}`, () => sellerProductQty(env.DB, posIds, startUtc, endUtc)) : null;
  const upsell = dept === 'cskh' && goal.upsellRate ? await once(cache, `up:${monthStart}:${toDay}`, () => cskhUpsell(env.DB, posIds, startUtc, endUtc)) : null;
  const daysInMonth = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)).getUTCDate();
  return kpi2Rows(goal, {
    assigned: Number(sums?.assigned ?? 0), closed: Number(sums?.closed ?? 0), orders: Number(sums?.orders ?? 0),
    upsellRate: upsell ? upsellOf(upsell, ids).rate : null, products: qty ? qtyOf(qty, ids) : {},
  }, dept, Number(toDay.slice(8, 10)), daysInMonth);
}

/** Dependencies are injectable for local clock tests; production always uses the shared report and sender. */
export async function maybeZaloTick(now = Date.now(), options: { db?: D1Database; send?: ZaloSend; snapshot?: typeof zaloTeamSnapshot; morningData?: typeof zaloMorningData; sendPhoto?: ZaloPhotoSend; kpi2?: typeof zaloKpi2 } = {}) {
  if (env.DEMO_MODE !== '1' && !env.ZALO_BOT_TOKEN?.trim()) return;
  const db = options.db ?? env.DB;
  const local = new Date(now + 7 * 3600000).toISOString(), day = todayVn(now), time = local.slice(11, 16), hour = local.slice(11, 13);
  // One result row even when settings are absent. The indexed EXISTS also avoids a meeting read on quiet minutes.
  const row = await db.prepare(`WITH config AS (SELECT
    (SELECT value FROM app_settings WHERE key='zalo_settings_v1') AS settings,
    (SELECT value FROM app_settings WHERE key='zalo_tick_v1') AS tick,
    (SELECT value FROM app_settings WHERE key='${REPORT_SCHEDULE_KEY}') AS report) SELECT settings,tick,report,
    EXISTS(SELECT 1 FROM zalo_meetings m WHERE m.cancelled_at IS NULL AND m.start_at>? AND m.start_at<=strftime('%Y-%m-%dT%H:%M:%fZ', ?, '+' || COALESCE(json_extract(CASE WHEN json_valid(settings) THEN settings ELSE '{}' END,'$.remindBeforeMeetingMin'),60) || ' minutes') AND EXISTS(SELECT 1 FROM zalo_meeting_invites i WHERE i.meeting_id=m.id AND i.reminded_at IS NULL AND (i.answer IS NULL OR i.answer='co'))) AS meeting FROM config`)
    .bind(new Date(now).toISOString(), new Date(now).toISOString()).first<{ settings: string | null; tick: string | null; report: string | null; meeting: number }>();
  const parse = <T,>(s: string | null | undefined, fallback: T): T => { try { return s ? JSON.parse(s) as T : fallback; } catch { return fallback; } };
  const settings = { ...DEFAULT_ZALO_SETTINGS, ...parse(row?.settings, {}) };
  const state = parse<TickState>(row?.tick, {});
  // Giờ gửi, lặp lại, mục trong báo cáo (Giao việc → Cài đặt báo cáo); chưa chỉnh = 08:00 và 12:00 / 17:00 / 22:00 hằng ngày, đủ mục.
  const schedule = parseReportSchedule(row?.report);
  if (state.day !== day) {
    state.day = day; state.snap = {}; state.slots = {};
    for (const t of Object.values(state.hist ?? {})) for (const d of Object.keys(t)) if (d < addDays(day, -15)) delete t[d];
  }
  // Giờ báo cáo sáng luôn chụp số của team (ca đầu tiên tính khung từ giờ này), kể cả khi tắt hoặc hôm nay không gửi.
  const morning = time === schedule.morning.time && state.morning !== day;
  const overdue = time === schedule.overdue.time && state.overdue !== day;
  const slotTime = schedule.slots.times.includes(time) ? time : null;
  const legacy = slotTime ? legacySlotKey(slotTime) : null;
  const slotSent = !!slotTime && (state.slots?.[slotTime] === day || (legacy !== null && state[legacy] === day));
  const slot = settings.slotReports && !!slotTime && runsOn(schedule.slots.repeat, day) && !slotSent;
  /** Khoá giờ trong state.hist / state.snap: "08", "12" như trước; giờ lẻ "12:30". */
  const key = timeKey(time);
  const prevTime = slotTime ? previousTime(schedule, slotTime) : null;
  const idle = (!state.idle || now - Date.parse(state.idle + ':00+07:00') >= 15 * 60000) && time >= settings.idleFrom && time <= settings.idleTo && settings.idleMinutes > 0 && state.idle !== local.slice(0, 16);
  const prune = hour === '02' && state.prune !== day;
  // Gửi thử báo cáo 8h cho sếp MỘT lần sau khi lên bản có ảnh (anh Vũ 02/11/2026: "gửi thử t xem có xem được k").
  const morningTest = settings.morningBrief && state.morningTest !== MORNING_TEST;
  // Báo ngay Sale tỷ lệ chốt dưới 42% (07/11/2026): mỗi 15 phút, từ giờ báo cáo sáng tới giờ báo cáo ca cuối.
  const lastSlot = [...schedule.slots.times].sort().at(-1) ?? '22:00';
  const lowRate = Number(time.slice(3)) % LOW_RATE_EVERY_MIN === 0 && time >= schedule.morning.time && time <= lastSlot;
  if (!morning && !overdue && !slot && !idle && !row?.meeting && !prune && !morningTest && !lowRate) return;
  const contacts = (await listContacts(db)).filter(c => c.active), leaders = contacts.filter(c => c.kind === 'leader');
  const sender = options.send ?? createZaloSender(db, now); let sent = 0;
  // Tin gửi leader/nhân viên cũng ghi vào tab Chat. Người chưa nối thì không ghi: nhắc họp, cảnh báo sẽ thử lại mỗi lượt.
  const send = async (c: Contact | undefined, text: string, kind: ChatKind = 'text', refNo?: number) => {
    if (!c?.chat_id || sent >= 30) return false; sent++;
    let delivered = true;
    try { await sender(c.chat_id, text.slice(0, 2000)); } catch { delivered = false; console.error('zalo tick send failed'); }
    if (c.kind !== 'boss') await logMessage(db, { contactId: c.id, dir: 'out', kind, refNo, body: text.slice(0, 2000), delivered, now });
    return true;
  };
  const snapshot = options.snapshot ?? zaloTeamSnapshot;
  const photo = options.sendPhoto ?? ((chatId: string, url: string, caption: string) => sendZaloPhoto(env.ZALO_BOT_TOKEN, chatId, url, caption, db, now));
  // Báo cáo có ảnh kèm chữ (8h, và từ 03/11/2026 cả 12h/17h/22h); Zalo không nhận ảnh (không tải được đường dẫn) thì gửi bản chữ.
  const sendImage = async (c: Contact, report: MorningReport | BossSlotReport, text: string, label: string) => {
    if (!c.chat_id || sent >= 30) return;
    text = text.slice(0, 2000);
    const id = await saveMorningImage(db, report, now);
    if (await photo(c.chat_id, `${webOrigin()}/api/zalo/anh/${id}`, text)) {
      sent++;
      if (c.kind !== 'boss') await logMessage(db, { contactId: c.id, dir: 'out', kind: 'text', body: `[Ảnh ${label}]\n` + text, delivered: true, now });
    } else await send(c, text);
  };
  const sendMorning = (c: Contact, report: MorningReport, prefix = '') => sendImage(c, report, prefix + morningText(report), `báo cáo ${timeLabel(schedule.morning.time)}`);
  if (morning || slot) {
    const bossTeams = new Map<string, BossSlotTeam>();
    // Một team có thể có cả Mentor và Leader nhận: số của team chỉ tính một lần.
    const teamNumbers = new Map<string, Promise<Snapshot | null>>(), morningNumbers = new Map<string, Promise<MorningNumbers | null>>();
    const kpi2Cache: Kpi2Shared = new Map(), kpi2Of = async (c: Contact, toDay: string) => (await once(kpi2Cache, `team:${c.team_id}:${c.dept}:${toDay}`, () => (options.kpi2 ?? zaloKpi2)(c, toDay, kpi2Cache))) ?? [];
    for (const leader of await loadReportTargets(db, leaders, contacts.filter(c => c.kind === 'boss' && c.chat_id))) {
      try {
        if (!teamNumbers.has(leader.team_id!)) teamNumbers.set(leader.team_id!, snapshot(leader, day));
        const current = await teamNumbers.get(leader.team_id!)!; if (!current) continue;
        const team = leader.team_id!;
        const snaps = (state.snap ??= {}), teamSnaps = snaps[team] ??= {};
        // Số cùng giờ để các ca sau so sánh (mỗi team ghi một lần mỗi giờ).
        ((state.hist ??= {})[team] ??= {})[day] ??= {};
        state.hist[team][day][key] = { net: current.total, orders: current.orders, created: current.created ?? 0, createdClosed: current.createdClosed ?? 0 };
        const work = async () => {
          const ids = contacts.filter(c => c.id === leader.id || c.leader_id === leader.id).map(c => c.id);
          const tasks = (await db.prepare(`SELECT * FROM zalo_tasks WHERE status NOT IN ('xong','huy') AND assignee_id IN (${ids.map(() => '?').join(',')}) ORDER BY due_date LIMIT 500`).bind(...ids).all<Task>()).results;
          const meetings = (await db.prepare(`SELECT m.* FROM zalo_meetings m JOIN zalo_meeting_invites i ON i.meeting_id=m.id WHERE i.contact_id=? AND m.cancelled_at IS NULL AND m.start_at>=? AND m.start_at<?`).bind(leader.id, vnDayStartUtc(day) + 'Z', vnDayStartUtc(addDays(day, 1)) + 'Z').all<Meeting>()).results;
          const who = (t: Task) => ({ who: contacts.find((c) => c.id === t.assignee_id)?.name ?? '', title: t.title });
          return { overdue: tasks.filter((t) => t.due_date && t.due_date < day).map(who), dueToday: tasks.filter((t) => t.due_date === day).map(who), meetings: meetings.map((m) => `họp số ${m.no} ${m.title}`) };
        };
        if (slot) {
          const previous = prevTime ? teamSnaps[timeKey(prevTime)] : undefined;
          const total = current.total - (previous?.total ?? 0);
          // Ảnh ca dùng đúng kiểu ảnh 8h (anh Vũ 03/11/2026): số từ 0h tới giờ này, so cùng giờ hôm qua / tuần trước.
          const days = Array.from({ length: 13 }, (_, i) => addDays(day, i - 13)).flatMap((d) => { const h = state.hist?.[team]?.[d]?.[key]; return h ? [{ day: d, ...h }] : []; });
          const m = state.month?.[team], sameMonth = day.slice(0, 7) === addDays(day, -1).slice(0, 7);
          const kpiOk = !!m && m.day === day && sameMonth;
          const report = withHidden(buildMorningReport({
            team: leader.team_name, dept: leader.dept === 'cskh' ? 'cskh' : 'sale', today: addDays(day, 1), slotHour: key,
            days: [...days, { day, net: current.total, orders: current.orders, created: current.created ?? 0, createdClosed: current.createdClosed ?? 0 }],
            monthNet: (kpiOk ? m.monthNet : 0) + current.total, goal: kpiOk ? m.goal : null, workingDays: kpiOk ? m.workingDays : null,
            people: Object.values(current.people).map((p) => ({ name: p.name, net: p.total, orders: p.orders })),
            kpi2: await kpi2Of(leader, day),
            ...await work(),
          }), hiddenSections(schedule.slots.sections));
          await sendImage(leader, report, morningText(report), `báo cáo ${timeLabel(time)}`);
          bossTeams.set(team, { team: leader.team_name, total, cumulative: current.total });
        }
        teamSnaps[key] = current;
        if (morning && settings.morningBrief && runsOn(schedule.morning.repeat, day)) {
          if (!morningNumbers.has(team)) morningNumbers.set(team, (options.morningData ?? zaloMorningData)(leader, day));
          const numbers = await morningNumbers.get(team)!;
          if (numbers) {
            (state.month ??= {})[team] = { day, monthNet: numbers.monthNet, goal: numbers.goal, workingDays: numbers.workingDays };
            await sendMorning(leader, withHidden(buildMorningReport({ ...numbers, kpi2: await kpi2Of(leader, addDays(day, -1)), ...await work() }), hiddenSections(schedule.morning.sections)));
          }
        }
      } catch { console.error('zalo team report failed'); }
    }
    if (slot && bossTeams.size && schedule.boss.send) {
      const report = buildBossSlotReport(`khung ${prevTime ? timeLabel(prevTime) : '0h'}–${timeLabel(time)}`, key, day, [...bossTeams.values()], !schedule.boss.cumulative);
      for (const boss of contacts.filter(c => c.kind === 'boss')) await sendImage(boss, report, bossSlotText(report), `báo cáo ${timeLabel(time)}`);
    }
    if (morning) state.morning = day;
    if (slot && slotTime) { (state.slots ??= {})[slotTime] = day; if (legacy) state[legacy] = day; }
  }
  if (morningTest) {
    const bosses = contacts.filter((c) => c.kind === 'boss' && c.chat_id);
    for (const leader of leaders) {
      const numbers = bosses.length ? await (options.morningData ?? zaloMorningData)(leader, day).catch(() => null) : null;
      if (!numbers) continue;
      const report = buildMorningReport({ ...numbers, overdue: [], dueToday: [] });
      // Chưa chỉnh lịch thì chữ y như cũ: "Gửi thử báo cáo 8h (leader nhận lúc 8:00 mỗi sáng)".
      const mt = schedule.morning.time, when = schedule.morning.repeat.mode === 'daily' ? 'mỗi sáng' : 'theo lịch đã đặt';
      for (const boss of bosses) await sendMorning(boss, report, `Gửi thử báo cáo ${timeLabel(mt)} (leader nhận lúc ${Number(mt.slice(0, 2))}:${mt.slice(3)} ${when})\n`);
      break;
    }
    state.morningTest = MORNING_TEST;
  }
  if (overdue) {
    const tasks = (await db.prepare("SELECT * FROM zalo_tasks WHERE status NOT IN ('xong','huy') AND due_date<=? ORDER BY due_date,no LIMIT 500").bind(day).all<Task>()).results;
    for (const c of contacts) {
      const own = tasks.filter(t => t.assignee_id === c.id);
      if (own.length) await send(c, '⚠️ Việc tới hạn hôm nay / quá hạn\n' + formatList(own));
      const late = tasks.filter(t => t.due_date! < day && (t.assigner_id === c.id || c.kind === 'leader' && contacts.some(s => s.id === t.assignee_id && s.leader_id === c.id)));
      if (late.length) await send(c, (c.kind === 'leader' ? 'Chậm tiến độ team\n' : '') + formatOverdue(late.map(t => ({ ...t, title: `${contacts.find(s => s.id === t.assignee_id)?.name ?? ''}: ${t.title}` }))));
    }
    state.overdue = day;
  }
  if (idle) {
    const saved = await db.prepare("SELECT value FROM app_settings WHERE key='zalo_idle_v1'").first<{ value: string }>();
    const marks = parse<Record<string, string>>(saved?.value, {});
    const shops = (await db.prepare('SELECT id FROM pos_shops WHERE enabled=1').all<{ id: string }>()).results;
    const assignments = new Map<string, string>();
    for (const shop of shops) {
      const rows = (await db.prepare('SELECT seller_id, MAX(seller_assigned_at) AS last, COUNT(*) AS n FROM raw_pos_orders WHERE pos_id=? AND seller_assigned_at>=? GROUP BY seller_id').bind(shop.id, vnDayStartUtc(day)).all<{ seller_id: string; last: string; n: number }>()).results;
      for (const r of rows) if (r.n && r.last > (assignments.get(r.seller_id) ?? '')) assignments.set(r.seller_id, r.last);
    }
    for (const leader of leaders.filter(c => c.dept === 'sale')) {
      if (!leader.team_id) continue;
      const scope = await resolveHrUnit(new URLSearchParams({ hrTeam: leader.team_id }), 'sale');
      if (scope instanceof Response || scope.dropped || !scope.unit) continue;
      const members = new Set((await db.prepare(`SELECT DISTINCT user_id FROM pos_users WHERE 1=1${teamFilter('user_id', 'sale', true, scope.unit)}`).all<{ user_id: string }>()).results.map(r => r.user_id));
      for (const staff of contacts.filter(c => c.kind === 'staff' && c.leader_id === leader.id && c.team_id === leader.team_id)) {
        const ids = parse<string[]>(staff.pos_seller_ids, []).filter(id => members.has(id));
        const last = ids.map(id => assignments.get(id)).filter((v): v is string => !!v).sort().at(-1);
        if (!last) continue;
        const minutes = Math.floor((now - Date.parse(last.endsWith('Z') ? last : last + 'Z')) / 60000);
        if (minutes < settings.idleMinutes || marks[staff.id] === last) continue;
        if (await send(leader, formatIdleAlert(staff.name, minutes, new Date(Date.parse(last.endsWith('Z') ? last : last + 'Z') + 7 * 3600000).toISOString().slice(11, 16)))) marks[staff.id] = last;
      }
    }
    await writeZaloSetting(db, 'zalo_idle_v1', marks); state.idle = local.slice(0, 16);
  }
  if (row?.meeting) {
    const invites = (await db.prepare(`SELECT m.*,i.contact_id FROM zalo_meetings m JOIN zalo_meeting_invites i ON i.meeting_id=m.id WHERE m.cancelled_at IS NULL AND m.start_at>? AND m.start_at<=? AND i.reminded_at IS NULL AND (i.answer IS NULL OR i.answer='co') ORDER BY m.start_at LIMIT 30`).bind(new Date(now).toISOString(), new Date(now + settings.remindBeforeMeetingMin * 60000).toISOString()).all<Meeting & { contact_id: string }>()).results;
    for (const m of invites) if (await send(contacts.find(c => c.id === m.contact_id), 'Nhắc họp\n' + formatMeetingMessage(m), 'meeting', m.no)) await db.prepare('UPDATE zalo_meeting_invites SET reminded_at=? WHERE meeting_id=? AND contact_id=? AND reminded_at IS NULL').bind(new Date(now).toISOString(), m.id, m.contact_id).run();
  }
  if (lowRate) {
    try {
      const [saved, teamsRow] = await Promise.all([
        db.prepare('SELECT value FROM app_settings WHERE key=?').bind(LOW_RATE_KEY).first<{ value: string }>(),
        db.prepare('SELECT value FROM app_settings WHERE key=?').bind(WEB_TEAMS_KEY).first<{ value: string }>(),
      ]);
      const saleTeams = parseWebTeams(teamsRow?.value).filter((t) => t.dept === 'sale' && t.memberIds.length);
      const targets = (await loadReportTargets(db, leaders)).filter((c) => c.dept === 'sale' && c.chat_id);
      const watched = saleTeams.filter((t) => targets.some((c) => c.team_id === t.id));
      if (watched.length) {
        let lr = parse<LowRateState>(saved?.value, {});
        const rows = await todayRates(db, [...new Set(watched.flatMap((t) => t.memberIds))], day);
        const window = currentSlot(schedule.slots.times, time);
        for (const t of watched) {
          const picked = pickLowRate(rows.filter((r) => t.memberIds.includes(r.sellerId)), lr, day, window, t.id);
          lr = picked.state;
          if (!picked.low.length) continue;
          for (const c of targets.filter((x) => x.team_id === t.id)) await send(c, lowRateText(t.name, time, picked.low));
        }
        await writeZaloSetting(db, LOW_RATE_KEY, lr);
      }
    } catch { console.error('zalo low rate failed'); }
  }
  if (prune) { try { await pruneMessages(db, now); await pruneMorningImages(db, now); } catch { console.error('zalo chat prune failed'); } state.prune = day; }
  await writeZaloSetting(db, 'zalo_tick_v1', state);
}
