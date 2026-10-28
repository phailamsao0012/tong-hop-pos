import { addDays, daysBetween, todayVn, vnDayStartUtc, vnRangeUtc } from '@/lib/report-time';
import { periodKind } from '@/lib/period-kind';
import { COUNTED_STAFF, teamFilter, type HrUnit, type Team } from '@/lib/team';
import { CLOSED, sentAtReady } from '@/lib/stats';
import { SENT_CODES } from '@/lib/shipping-lines';
import { MARKETING_TEAMS_KEY, marketingTeamFilter, parseMarketingTeams } from '@/lib/marketing-teams';

export const TREND_DEPTS = ['sale', 'cskh', 'mkt', 'vandon'] as const;
export type TrendDept = typeof TREND_DEPTS[number];
export type TrendPoint = { day: string; hour: number; id: string; value: number };
export type TrendOptions = { start: string; end: string; preset?: string; posIds: string[]; team: Team; unit: HrUnit | null; mktTeam?: string; branch?: string };
type Profile = { hours: number[]; weekdays: number[]; sufficient: boolean };
/** 2026-10-19 → 19/10 (anh Vũ 21/10/2026: ngày dạng 2026-10-19 khó đọc). */
const ddmm = (day: string) => `${day.slice(8, 10)}/${day.slice(5, 7)}`;
const weekday = (day: string) => new Date(`${day}T00:00:00Z`).getUTCDay();

/** Trung bình phân bố giờ của từng ngày, ưu tiên bốn ngày cùng thứ. */
export function hourlyProfile(points: TrendPoint[], today: string): Profile {
  const days = new Map<string, number[]>();
  for (let i = 1; i <= 28; i++) days.set(addDays(today, -i), Array(24).fill(0));
  for (const p of points) if (days.has(p.day)) days.get(p.day)![p.hour] += p.value;
  const positive = [...days].filter(([, hours]) => hours.reduce((a, b) => a + b, 0) > 0);
  const same = positive.filter(([day]) => weekday(day) === weekday(today));
  const sample = same.length >= 4 ? same : positive;
  const hours = Array.from({ length: 24 }, (_, h) => sample.length ? sample.reduce((sum, [, xs]) => sum + xs[h] / xs.reduce((a, b) => a + b, 0), 0) / sample.length : 0);
  const weekdays = Array.from({ length: 7 }, (_, w) => [...days].filter(([d]) => weekday(d) === w).reduce((sum, [, xs]) => sum + xs.reduce((a, b) => a + b, 0), 0) / 4);
  return { hours, weekdays, sufficient: sample.length > 0 };
}

export function forecastFraction(profile: Profile, start: string, end: string, today: string, hour: number) {
  if (!profile.sufficient) return null;
  const h = Math.floor(hour);
  const intraday = profile.hours.slice(0, h).reduce((a, b) => a + b, 0) + (profile.hours[h] ?? 0) * (hour - h);
  let elapsed = 0, total = 0;
  for (let d = start; d <= end; d = addDays(d, 1)) {
    const weight = profile.weekdays[weekday(d)];
    total += weight;
    if (d < today) elapsed += weight;
    else if (d === today) elapsed += weight * intraday;
  }
  return total > 0 && elapsed > 0 ? Math.min(1, elapsed / total) : null;
}

export function periodCard(points: TrendPoint[], opts: TrendOptions, profile: Profile, now = Date.now()) {
  const today = todayVn(now), period = periodKind(opts.start, opts.end, today, opts.preset);
  const local = new Date(now + 7 * 3600000), hour = local.getUTCHours() + local.getUTCMinutes() / 60 + local.getUTCSeconds() / 3600;
  const partial = opts.start <= today && opts.end >= today;
  const through = partial ? today : opts.end;
  const offset = daysBetween(opts.start, through) - 1;
  const previousThrough = partial ? (period.selected === 'month' ? `${period.prev.start.slice(0, 7)}-${today.slice(8)}` > period.prev.end ? period.prev.end : `${period.prev.start.slice(0, 7)}-${today.slice(8)}` : period.selected === 'year' ? `${period.prev.start.slice(0, 4)}${today.slice(4)}` : addDays(period.prev.start, offset)) : period.prev.end;
  const select = (start: string, end: string) => points.filter((p) => p.day >= start && p.day <= end && (!partial || p.day !== end || p.hour <= Math.floor(hour)));
  const current = select(opts.start, through), previous = select(period.prev.start, previousThrough);
  const sum = (xs: TrendPoint[]) => xs.reduce((n, p) => n + p.value, 0);
  const actual = sum(current), before = sum(previous), compare = before > 0 ? (actual / before - 1) * 100 : null;
  const fraction = period.open ? forecastFraction(profile, opts.start, period.periodEnd, today, hour) : 1;
  const forecast = fraction === null ? null : actual / fraction;
  const count = opts.start === through ? (partial ? Math.floor(hour) + 1 : 24) : daysBetween(opts.start, through);
  const series = Array.from({ length: count }, (_, i) => {
    const hourly = opts.start === through;
    const day = addDays(opts.start, i), prevDay = addDays(period.prev.start, i);
    return { label: hourly ? `${i}h` : day, actual: sum(current.filter((p) => hourly ? p.hour <= i : p.day === day)), previous: sum(previous.filter((p) => hourly ? p.hour <= i : p.day === prevDay)) };
  });
  const ids = new Set([...current, ...previous].map((p) => p.id));
  const rows = [...ids].map((id) => {
    const value = sum(current.filter((p) => p.id === id)), prev = sum(previous.filter((p) => p.id === id));
    return { id, value, previous: prev, pct: prev > 0 ? (value / prev - 1) * 100 : null };
  }).filter((r) => r.value || r.previous).sort((a, b) => Math.abs(b.value - b.previous) - Math.abs(a.value - a.previous)).slice(0, 5);
  const time = `${String(local.getUTCHours()).padStart(2, '0')}:${String(local.getUTCMinutes()).padStart(2, '0')}`;
  const compareLabel = period.open ? `so với ${period.endLabel === 'ngày' ? 'hôm qua cùng giờ' : `${period.endLabel} trước cùng mốc`}` : `so với ${period.prev.start === period.prev.end ? ddmm(period.prev.start) : `${ddmm(period.prev.start)} – ${ddmm(period.prev.end)}`}`;
  return { actual, forecast: period.open ? forecast : actual, compare, previous: before, series, rows, period, label: `${period.label}${partial ? ` đến ${time}` : ''}`, compareLabel, note: before === 0 ? 'Kỳ trước chưa có số để tính tỷ lệ thay đổi.' : `${actual >= before ? 'Tăng' : 'Giảm'} ${Math.abs(compare!).toFixed(1)}% ${compareLabel}.` };
}

/** Khoảng thời gian có bind, mỗi nhánh dùng chỉ mục thời gian tương ứng. */
/** byDay: gom theo ngày (hour luôn 0) kèm số đơn n, cho trang Tăng trưởng nhân viên. */
export function trendQuery(dept: TrendDept, posIds: string[], startUtc: string, endUtc: string, scopeSql: string, scopeBinds: string[], bySent: boolean, byDay = false) {
  const column = dept === 'mkt' ? 'first_confirmed_at' : dept === 'vandon' && bySent ? 'first_sent_at' : 'first_closed_at';
  const index = ` INDEXED BY idx_raw_orders_pos_${column === 'first_sent_at' ? 'sent' : dept === 'mkt' ? 'confirmed' : 'closed'}_status_money`;
  const person = dept === 'mkt' ? 'marketer_id' : 'seller_id';
  const condition = dept === 'mkt' ? `o.status_code NOT IN (0,17,6,7) AND o.marketer_id IN ${COUNTED_STAFF}` : dept === 'vandon' ? `o.status_code IN (${SENT_CODES.join(',')})${bySent ? '' : ` AND o.${CLOSED}`}` : `o.${CLOSED}${teamFilter('o.seller_id', dept)}`;
  const sql = `SELECT date(o.${column},'+7 hours') AS day, ${byDay ? '0' : `CAST(strftime('%H',o.${column},'+7 hours') AS INTEGER)`} AS hour, COALESCE(o.${person},'') AS id,
    ${dept === 'vandon' ? 'COUNT(*)' : 'SUM(COALESCE(o.net_total,COALESCE(o.current_total,0)-COALESCE(o.total_discount,0)))'} AS value${byDay ? ', COUNT(*) AS n' : ''}
    FROM raw_pos_orders o${index} WHERE o.pos_id IN (${posIds.map(() => '?').join(',')}) AND o.${column} IS NOT NULL AND o.${column}>=? AND o.${column}<? AND ${condition}${scopeSql} GROUP BY ${byDay ? '1,3' : '1,2,3'}`;
  return { sql, binds: [...posIds, startUtc, endUtc, ...scopeBinds] };
}

export async function trendCards(db: D1Database, opts: TrendOptions, depts: TrendDept[], now = Date.now()) {
  const today = todayVn(now), period = periodKind(opts.start, opts.end, today, opts.preset);
  const saved = await db.prepare('SELECT value FROM app_settings WHERE key=?').bind(MARKETING_TEAMS_KEY).first<{ value: string }>();
  const mkt = marketingTeamFilter(opts.mktTeam ?? '', parseMarketingTeams(saved?.value), 'o.marketer_id');
  if (!mkt) throw new Error('Không tìm thấy team MKT.');
  // MKT theo nút Sale / CSKH chỉ tính người lên đơn có hậu tố, khớp bảng MKT và trang Marketing (anh Vũ 21/10/2026 "cần con số đúng").
  const branchSql = opts.branch ? ' AND o.seller_id IN (SELECT pos_user_id FROM hr_pos_team t JOIN hr_employees e ON e.id=t.employee_id WHERE e.office_id=?)' : '';
  const scopeOf = (dept: TrendDept) => teamFilter('o.seller_id', opts.team, dept === 'mkt', opts.unit) + mkt.sql + branchSql;
  const scopeBinds = [...mkt.binds, ...(opts.branch ? [opts.branch] : [])];
  const bySent = await sentAtReady(db);
  // Hồ sơ độc lập theo POS/bộ lọc/bộ phận; không tái dùng hồ sơ toàn công ty cho team nhỏ.
  const profileKey = `trend_profile:${today}`;
  const scopeKey = JSON.stringify(['v2', opts.posIds.slice().sort(), opts.team, opts.unit?.id, opts.mktTeam, opts.branch, bySent]);
  const cached = await db.prepare('SELECT value FROM app_settings WHERE key=?').bind(profileKey).first<{ value: string }>();
  let profiles: Record<string, Partial<Record<TrendDept, Profile>>> = {};
  try { profiles = JSON.parse(cached?.value ?? '{}'); } catch { /* dựng lại hồ sơ hỏng */ }
  const scoped = profiles[scopeKey] ?? {};
  const names = await db.prepare(`SELECT user_id AS id, MAX(name) AS name FROM pos_users WHERE pos_id IN (${opts.posIds.map(() => '?').join(',')}) GROUP BY user_id`).bind(...opts.posIds).all<{ id: string; name: string }>();
  const nameMap = new Map(names.results.map((r) => [r.id, r.name]));
  const cards: Partial<Record<TrendDept, Omit<ReturnType<typeof periodCard>, 'rows'> & { unit: 'money' | 'orders'; rows: (ReturnType<typeof periodCard>['rows'][number] & { name: string })[] }>> = {};
  for (const dept of depts) {
    if (!scoped[dept]) {
      const q = trendQuery(dept, opts.posIds, vnDayStartUtc(addDays(today, -28)), vnDayStartUtc(today), scopeOf(dept), scopeBinds, bySent);
      const history = await db.prepare(q.sql).bind(...q.binds).all<TrendPoint>();
      scoped[dept] = hourlyProfile(history.results, today);
    }
    const end = opts.end > today ? today : opts.end;
    const q = trendQuery(dept, opts.posIds, vnDayStartUtc(opts.start), end === today ? new Date(now).toISOString().slice(0, 19) : vnRangeUtc(opts.start, end).endUtc, scopeOf(dept), scopeBinds, bySent);
    const points = await db.prepare(q.sql).bind(...q.binds).all<TrendPoint>();
    // Cắt kỳ trước chính xác tới giây hiện tại ngay trong SQL, trước khi gom theo giờ.
    let previousEnd = vnRangeUtc(period.prev.start, period.prev.end).endUtc;
    if (opts.start <= today && opts.end >= today) {
      const prevDay = period.selected === 'month' ? `${period.prev.start.slice(0, 7)}-${today.slice(8)}` > period.prev.end ? period.prev.end : `${period.prev.start.slice(0, 7)}-${today.slice(8)}` : period.selected === 'year' ? `${period.prev.start.slice(0, 4)}${today.slice(4)}` : addDays(period.prev.start, daysBetween(opts.start, today) - 1);
      const elapsed = now - Date.parse(`${vnDayStartUtc(today)}Z`);
      previousEnd = new Date(Date.parse(`${vnDayStartUtc(prevDay)}Z`) + elapsed).toISOString().slice(0, 19);
    }
    const previousQuery = trendQuery(dept, opts.posIds, vnDayStartUtc(period.prev.start), previousEnd, scopeOf(dept), scopeBinds, bySent);
    const previous = await db.prepare(previousQuery.sql).bind(...previousQuery.binds).all<TrendPoint>();
    const card = periodCard([...points.results, ...previous.results], opts, scoped[dept]!, now);
    cards[dept] = { ...card, unit: dept === 'vandon' ? 'orders' : 'money', rows: card.rows.map((r) => ({ ...r, name: nameMap.get(r.id) ?? 'Chưa gắn nhân viên' })) };
  }
  profiles[scopeKey] = scoped;
  await db.prepare('INSERT INTO app_settings (key,value,updated_at) VALUES (?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at').bind(profileKey, JSON.stringify(profiles), new Date(now).toISOString()).run();
  await db.prepare("DELETE FROM app_settings WHERE key LIKE 'trend_profile:%' AND key<?").bind(`trend_profile:${addDays(today, -3)}`).run();
  return { period, cards };
}

export type TrendCardsResponse = Awaited<ReturnType<typeof trendCards>>;

/** Danh sách giải thích số thực tế, dùng cùng truy vấn và phạm vi với thẻ. */
export async function trendOrderPage(db: D1Database, opts: TrendOptions, dept: TrendDept, staff: string | null, page: number, now = Date.now()) {
  const saved = await db.prepare('SELECT value FROM app_settings WHERE key=?').bind(MARKETING_TEAMS_KEY).first<{ value: string }>();
  const mkt = marketingTeamFilter(opts.mktTeam ?? '', parseMarketingTeams(saved?.value), 'o.marketer_id');
  if (!mkt) throw new Error('Không tìm thấy team MKT.');
  let scopeSql = teamFilter('o.seller_id', opts.team, dept === 'mkt', opts.unit) + mkt.sql;
  const binds = [...mkt.binds];
  if (opts.branch) {
    scopeSql += ' AND o.seller_id IN (SELECT pos_user_id FROM hr_pos_team t JOIN hr_employees e ON e.id=t.employee_id WHERE e.office_id=?)';
    binds.push(opts.branch);
  }
  if (staff !== null) { scopeSql += ` AND COALESCE(o.${dept === 'mkt' ? 'marketer_id' : 'seller_id'},'')=?`; binds.push(staff); }
  const bySent = await sentAtReady(db);
  const column = dept === 'mkt' ? 'first_confirmed_at' : dept === 'vandon' && bySent ? 'first_sent_at' : 'first_closed_at';
  const range = vnRangeUtc(opts.start, opts.end);
  const endUtc = opts.end >= todayVn(now) ? new Date(now).toISOString().slice(0, 19) : range.endUtc;
  const q = trendQuery(dept, opts.posIds, range.startUtc, endUtc, scopeSql, binds, bySent);
  const from = q.sql.slice(q.sql.indexOf('FROM raw_pos_orders')).replace(' GROUP BY 1,2,3', '');
  return (await db.prepare(`SELECT o.id, o.source_order_id AS code, o.pos_id AS posId, o.${column} AS at, COALESCE(o.net_total,COALESCE(o.current_total,0)-COALESCE(o.total_discount,0)) AS net ${from} ORDER BY o.${column},o.id LIMIT 101 OFFSET ?`).bind(...q.binds, page * 100).all<{ id: string; code: string; posId: string; at: string; net: number }>()).results;
}
