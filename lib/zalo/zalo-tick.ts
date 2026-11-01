import { env } from 'cloudflare:workers';
import { overviewReport } from '@/lib/reports/overview-report';
import { resolveHrUnit } from '@/lib/teams/hr-unit';
import { countedFilter, teamFilter } from '@/lib/teams/team';
import { todayVn, addDays, vnDayStartUtc } from '@/lib/shared/report-time';
import { createZaloSender } from '@/lib/zalo/zalo';
import { logMessage, pruneMessages, type ChatKind } from '@/lib/zalo/zalo-chat';
import { DEFAULT_ZALO_SETTINGS, listContacts, writeZaloSetting, formatSlotReport, formatMorning, formatList, formatOverdue, formatIdleAlert, formatMeetingMessage, type Contact, type Task, type Meeting, type ZaloSend } from '@/lib/zalo/zalo-work';

type Snapshot = { total: number; orders: number; people: Record<string, { name: string; total: number; orders: number }> };
type TickState = { day?: string; morning?: string; overdue?: string; slot12?: string; slot17?: string; slot22?: string; idle?: string; prune?: string; snap?: Record<string, Record<string, Snapshot>> };
export async function zaloTeamSnapshot(leader: Contact, day: string): Promise<Snapshot | null> {
  if (!leader.team_id || !['sale', 'cskh'].includes(leader.dept)) return null;
  const scope = await resolveHrUnit(new URLSearchParams({ hrTeam: leader.team_id }), leader.dept as 'sale' | 'cskh');
  if (scope instanceof Response || scope.dropped || !scope.unit) return null;
  const report = await overviewReport({ posIds: [], start: day, end: day, team: scope.team, unit: scope.unit });
  const people = Object.fromEntries(report.current.byEmployee.filter(r => r.sellerId).map(r => [r.sellerId, { name: r.name, total: r.closedNet, orders: r.closedOrders }]));
  const members = (await env.DB.prepare(`SELECT DISTINCT user_id,name FROM pos_users WHERE name<>''${teamFilter('user_id', scope.team, true, scope.unit)}${countedFilter('user_id')}`).all<{ user_id: string; name: string }>()).results;
  for (const member of members) people[member.user_id] ??= { name: member.name, total: 0, orders: 0 };
  return { total: report.current.total.closedNet, orders: report.current.total.closedOrders, people };
}
/** Dependencies are injectable for local clock tests; production always uses the shared report and sender. */
export async function maybeZaloTick(now = Date.now(), options: { db?: D1Database; send?: ZaloSend; snapshot?: typeof zaloTeamSnapshot } = {}) {
  if (env.DEMO_MODE !== '1' && !env.ZALO_BOT_TOKEN?.trim()) return;
  const db = options.db ?? env.DB;
  const local = new Date(now + 7 * 3600000).toISOString(), day = todayVn(now), time = local.slice(11, 16), hour = local.slice(11, 13);
  // One result row even when settings are absent. The indexed EXISTS also avoids a meeting read on quiet minutes.
  const row = await db.prepare(`WITH config AS (SELECT
    (SELECT value FROM app_settings WHERE key='zalo_settings_v1') AS settings,
    (SELECT value FROM app_settings WHERE key='zalo_tick_v1') AS tick) SELECT settings,tick,
    EXISTS(SELECT 1 FROM zalo_meetings m WHERE m.cancelled_at IS NULL AND m.start_at>? AND m.start_at<=strftime('%Y-%m-%dT%H:%M:%fZ', ?, '+' || COALESCE(json_extract(CASE WHEN json_valid(settings) THEN settings ELSE '{}' END,'$.remindBeforeMeetingMin'),60) || ' minutes') AND EXISTS(SELECT 1 FROM zalo_meeting_invites i WHERE i.meeting_id=m.id AND i.reminded_at IS NULL AND (i.answer IS NULL OR i.answer='co'))) AS meeting FROM config`)
    .bind(new Date(now).toISOString(), new Date(now).toISOString()).first<{ settings: string | null; tick: string | null; meeting: number }>();
  const parse = <T,>(s: string | null | undefined, fallback: T): T => { try { return s ? JSON.parse(s) as T : fallback; } catch { return fallback; } };
  const settings = { ...DEFAULT_ZALO_SETTINGS, ...parse(row?.settings, {}) };
  const state = parse<TickState>(row?.tick, {});
  if (state.day !== day) { state.day = day; state.snap = {}; }
  const morning = time === '08:00' && state.morning !== day;
  const overdue = time === '08:00' && state.overdue !== day;
  const slotKey = ({ '12:00': 'slot12', '17:00': 'slot17', '22:00': 'slot22' } as const)[time as '12:00'];
  const slot = settings.slotReports && slotKey && state[slotKey] !== day;
  const idle = (!state.idle || now - Date.parse(state.idle + ':00+07:00') >= 15 * 60000) && time >= settings.idleFrom && time <= settings.idleTo && settings.idleMinutes > 0 && state.idle !== local.slice(0, 16);
  const prune = hour === '02' && state.prune !== day;
  if (!morning && !overdue && !slot && !idle && !row?.meeting && !prune) return;
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
  if (morning || slot) {
    const bossLines: string[] = [];
    for (const leader of leaders) {
      try {
        const current = await snapshot(leader, day); if (!current) continue;
        const snaps = (state.snap ??= {}), teamSnaps = snaps[leader.team_id!] ??= {};
        if (slot) {
          const previousHour = hour === '12' ? '08' : hour === '17' ? '12' : '17', previous = teamSnaps[previousHour];
          const people = Object.entries(current.people).map(([id, p]) => ({ ...p, total: p.total - (previous?.people[id]?.total ?? 0), orders: p.orders - (previous?.people[id]?.orders ?? 0) }));
          const total = current.total - (previous?.total ?? 0);
          const label = previous ? `khung ${Number(previousHour)}h–${Number(hour)}h` : `từ đầu ngày tới ${Number(hour)}h`;
          await send(leader, formatSlotReport({ team: leader.team_name, slot: label, total, cumulative: current.total, orders: current.orders - (previous?.orders ?? 0), top: people.filter(p => p.orders > 0).sort((a, b) => b.total - a.total).slice(0, 3).map(p => `${p.name}: ${p.total.toLocaleString('vi-VN')}`), noOrders: people.filter(p => p.orders === 0).map(p => p.name) }));
          bossLines.push(`${leader.team_name} · ${label}: ${total.toLocaleString('vi-VN')} · Luỹ kế: ${current.total.toLocaleString('vi-VN')}`);
        }
        teamSnaps[hour] = current;
        if (morning && settings.morningBrief) {
          const yesterday = await snapshot(leader, addDays(day, -1));
          const ids = contacts.filter(c => c.id === leader.id || c.leader_id === leader.id).map(c => c.id);
          const tasks = (await db.prepare(`SELECT * FROM zalo_tasks WHERE status NOT IN ('xong','huy') AND assignee_id IN (${ids.map(() => '?').join(',')}) ORDER BY due_date LIMIT 500`).bind(...ids).all<Task>()).results;
          const meetings = (await db.prepare(`SELECT m.* FROM zalo_meetings m JOIN zalo_meeting_invites i ON i.meeting_id=m.id WHERE i.contact_id=? AND m.cancelled_at IS NULL AND m.start_at>=? AND m.start_at<?`).bind(leader.id, vnDayStartUtc(day) + 'Z', vnDayStartUtc(addDays(day, 1)) + 'Z').all<Meeting>()).results;
          await send(leader, formatMorning({ team: leader.team_name, yesterday: yesterday?.total ?? 0, tasks, meetings }));
        }
      } catch { console.error('zalo team report failed'); }
    }
    if (slot) for (const boss of contacts.filter(c => c.kind === 'boss')) await send(boss, 'Doanh số các team\n' + bossLines.join('\n'));
    if (morning) state.morning = day;
    if (slot) state[slotKey] = day;
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
  if (prune) { try { await pruneMessages(db, now); } catch { console.error('zalo chat prune failed'); } state.prune = day; }
  await writeZaloSetting(db, 'zalo_tick_v1', state);
}
