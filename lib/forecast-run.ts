import { POS } from './report-model';
import { env } from 'cloudflare:workers';
import { overviewReport } from './overview-report';
import { countedFilter } from './team';
import { addDays, vnRangeUtc } from './report-time';
import { pruneAiRows } from './claude';
import { baselineOf, forecastToday, forecastWeek, hourShares, personExpected, shareAt, type Parts } from './forecast-day';

type Person = { id: string; dept: string; team: string } & Parts;
type Point = { t: string; actual: number; today: number | null; week: number | null; weekActual?: number };
export type Forecast = {
  date: string; weekStart: string;
  morning: { at: string; total: number | null; week: number | null; people: (Omit<Person, keyof Parts> & { assigned: number | null; closed: number | null; net: number | null })[] } | null;
  points: Point[]; updatedAt: string; version: 1;
};
export async function readForecast(db: D1Database, date: string): Promise<Forecast | null> {
  const row = await db.prepare('SELECT value FROM app_settings WHERE key=?').bind(`ai_forecast:${date}`).first<{ value: string }>();
  return row ? JSON.parse(row.value) as Forecast : null;
}
export function forecastForDisplay(record: Forecast | null, date: string, owner: boolean) {
  const last = record?.points.at(-1);
  return { date, total: last?.today ?? null, week: last?.week ?? null, actual: last?.actual ?? null, weekActual: last?.weekActual ?? null,
    points: record?.points ?? [], morningTotal: record?.morning?.total ?? null,
    ...(owner ? { people: record?.morning?.people ?? [] } : {}) };
}

export async function runForecast(db: D1Database, now: Date) {
  const local = new Date(now.getTime() + 7 * 3600_000), date = local.toISOString().slice(0, 10);
  const weekStart = addDays(date, -((local.getUTCDay() + 6) % 7));
  const start = addDays(date, -28), previous = await readForecast(db, date);
  // Một báo cáo lịch sử theo ngày để đối chiếu, một báo cáo riêng cho ô Doanh thu hôm nay.
  const history = await overviewReport({ posIds: [], start, end: addDays(date, -1) });
  const current = await overviewReport({ posIds: [], start: date, end: date });
  const totals = new Map<string, number>();
  for (let i = -28; i <= 0; i++) totals.set(addDays(date, i), 0);
  for (const row of history.current.series) totals.set(row.bucket, (totals.get(row.bucket) ?? 0) + row.closedNet);
  const actual = current.current.total.closedNet;
  totals.set(date, actual);
  const dates = [date, ...[7, 14, 21, 28].map((n) => addDays(date, -n))];
  const ranges = dates.map((d) => vnRangeUtc(d, d));
  const hourly = await db.batch<{ dh: string; net: number }>(ranges.map(range => db.prepare(`SELECT strftime('%Y-%m-%d %H',first_closed_at,'+7 hours') AS dh,
    COALESCE(SUM(CASE WHEN status_code<>6 THEN COALESCE(net_total,COALESCE(current_total,0)-COALESCE(total_discount,0)) END),0) AS net
    FROM raw_pos_orders WHERE pos_id IN (${POS.map(() => '?').join(',')}) AND first_closed_at>=? AND first_closed_at<?
    AND status_code NOT IN (0,7)${countedFilter('seller_id')} GROUP BY dh`)
    .bind(...POS.map(p => p.id), range.startUtc, range.endUtc)));
  const hours = new Map(dates.map((d) => [d, Array<number>(24).fill(0)]));
  for (const r of hourly.flatMap(r => r.results)) {
    const day = hours.get(r.dh.slice(0, 10));
    if (day) day[Number(r.dh.slice(11, 13))] = Number(r.net);
  }
  const samples = dates.slice(1).map((d) => hours.get(d)!);
  const baseline = baselineOf(samples);
  const today = forecastToday({ actual, baseline, share: shareAt(hourShares(samples), local.getUTCHours() * 60 + local.getUTCMinutes()) });
  const restBaselines: (number | null)[] = [];
  // Các ngày tương lai chỉ dùng ngày mẫu đã kết thúc trước D, tránh lấy số chưa đủ của hôm nay.
  for (let d = addDays(date, 1); d <= addDays(weekStart, 6); d = addDays(d, 1)) {
    restBaselines.push(baselineOf([7, 14, 21, 28].map((n) => [totals.get(addDays(d, -n)) ?? 0])));
  }
  let actualToYesterday = 0;
  for (let d = weekStart; d < date; d = addDays(d, 1)) actualToYesterday += totals.get(d) ?? 0;
  const week = forecastWeek({ actualToYesterday, todayForecast: today, restBaselines });
  const rows = await db.prepare(`SELECT day,COALESCE(seller_id,'') AS id,
    COALESCE((SELECT team FROM hr_pos_team WHERE pos_user_id=seller_id LIMIT 1),'other') AS dept,
    COALESCE((SELECT department_id FROM hr_pos_team WHERE pos_user_id=seller_id LIMIT 1),'') AS team,
    SUM(assigned_orders) AS assigned,SUM(closed_orders) AS closed,SUM(closed_net) AS net
    FROM stats_daily WHERE pos_id IN (${POS.map(() => '?').join(',')}) AND day>=? AND day<=?${countedFilter('seller_id')} GROUP BY day,COALESCE(seller_id,'')`)
    .bind(...POS.map(p => p.id), start, date).all<Person & { day: string }>();
  const perDay = new Map<string, Person[]>();
  for (const row of rows.results) {
    const people = perDay.get(row.day) ?? [];
    // Chỉ chọn trường được phép; không lưu tên hay ghi chú dù nguồn giả có thêm trường.
    people.push({ id: row.id, dept: row.dept, team: row.team, assigned: Number(row.assigned), closed: Number(row.closed), net: Number(row.net) });
    perDay.set(row.day, people);
  }
  for (const [day, total] of totals) {
    const people = perDay.get(day) ?? [], difference = total - people.reduce((s, p) => s + p.net, 0);
    if (difference) {
      const unassigned = people.find((p) => p.id === '');
      if (unassigned) unassigned.net += difference;
      else people.push({ id: '', dept: 'other', team: '', assigned: 0, closed: 0, net: difference });
    }
    perDay.set(day, people);
  }
  const average = [...totals].filter(([d]) => d < date).reduce((s, [, n]) => s + n, 0) / 28;
  const factor = average ? (baseline ?? 0) / average : 1;
  const ids = [...new Set([...perDay.values()].flat().map((p) => p.id))].sort();
  const people = ids.map((id) => {
    const past = [...perDay].filter(([d]) => d < date).flatMap(([, ps]) => ps.filter((p) => p.id === id));
    const meta = past[0] ?? perDay.get(date)!.find((p) => p.id === id)!;
    const expected = personExpected(past, factor);
    return { id, dept: meta.dept, team: meta.team, assigned: expected?.assigned ?? null, closed: expected?.closed ?? null, net: expected?.net ?? null };
  });
  const t = local.toISOString().slice(11, 16);
  const record: Forecast = { date, weekStart, morning: previous?.morning ?? { at: now.toISOString(), total: today, week, people },
    points: [...(previous?.points ?? []).filter((p) => p.t !== t), { t, actual, today, week, weekActual: actualToYesterday + actual }].sort((a, b) => a.t.localeCompare(b.t)).slice(-34),
    updatedAt: now.toISOString(), version: 1 };
  if (!previous?.morning) await pruneAiRows(db, date);
  // COALESCE bảo vệ ảnh đầu ngày kể cả khi hai lượt cron cùng đọc trước lúc ghi.
  await db.prepare(`INSERT INTO app_settings(key,value,updated_at) VALUES (?,?,?) ON CONFLICT(key) DO UPDATE SET
    value=json_set(excluded.value,'$.morning',json(COALESCE(json_extract(app_settings.value,'$.morning'),json_extract(excluded.value,'$.morning')))),
    updated_at=excluded.updated_at`).bind(`ai_forecast:${date}`, JSON.stringify(record), now.toISOString()).run();
  return record;
}
export async function maybeForecastTick(now = new Date()) {
  const local = new Date(now.getTime() + 7 * 3600_000);
  if (now.getUTCMinutes() % 30 !== 0 || local.getUTCHours() < 7) return;
  try { await runForecast(env.DB, now); }
  catch { console.error('forecast tick failed'); }
}
