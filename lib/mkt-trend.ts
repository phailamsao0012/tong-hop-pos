import { COUNTED_STAFF, teamSubquery } from '@/lib/team';
import { NET } from '@/lib/stats';
import { MARKETING_TEAMS_KEY, UNASSIGNED_TEAM, parseMarketingTeams } from '@/lib/marketing-teams';
import { addDays, daysBetween, todayVn, vnRangeUtc } from '@/lib/report-time';

export type Bucket = 'day' | 'week' | 'month';
export type Base = { cost: number; phones: number; newOrders: number; newNet: number; coveredNet: number; coveredPhones: number };
const zero = (): Base => ({ cost: 0, phones: 0, newOrders: 0, newNet: 0, coveredNet: 0, coveredPhones: 0 });
export const defaultBucket = (start: string, end: string): Bucket => daysBetween(start, end) <= 31 ? 'day' : daysBetween(start, end) <= 120 ? 'week' : 'month';
export function bucketKey(day: string, bucket: Bucket) {
  if (bucket === 'month') return day.slice(0, 7);
  return bucket === 'week' ? addDays(day, -((new Date(`${day}T00:00:00Z`).getUTCDay() + 6) % 7)) : day;
}
export function metrics(x: Base) {
  return { ...x, costShare: x.coveredNet ? x.cost / x.coveredNet * 100 : null, costPerLead: x.coveredPhones ? x.cost / x.coveredPhones : null, closeRate: x.phones ? x.newOrders / x.phones * 100 : null, roas: x.cost ? x.coveredNet / x.cost : null, aov: x.newOrders ? x.newNet / x.newOrders : null };
}
export function groupTrend(days: (Base & { key: string })[], start: string, end: string, bucket: Bucket, today = todayVn()) {
  const groups = new Map<string, Base>();
  for (let d = start; d <= end; d = addDays(d, 1)) groups.set(bucketKey(d, bucket), zero());
  for (const d of days) {
    if (d.key < start || d.key > end) continue;
    const x = groups.get(bucketKey(d.key, bucket))!;
    for (const k of Object.keys(x) as (keyof Base)[]) x[k] += d[k];
  }
  return [...groups].map(([key, x]) => ({ key, ...metrics(x), partial: start <= today && today <= end && key === bucketKey(today, bucket) }));
}
export function trendChartRows(rows: (ReturnType<typeof metrics> & { key: string; partial?: boolean })[], key: keyof ReturnType<typeof metrics>) {
  return rows.map((r, index) => {
    const missingCost = r.partial && r.cost === 0 && ['cost', 'costPerLead', 'roas', 'costShare'].includes(key);
    return { ...r, complete: r.partial ? null : r[key], running: r.partial || rows[index + 1]?.partial ? (missingCost ? null : r[key]) : null };
  });
}
export function trendNotes(rows: (ReturnType<typeof metrics> & { key: string; partial?: boolean })[]) {
  rows = rows.filter(r => !r.partial);
  const notes: string[] = [];
  const last = rows.at(-1), before = rows.slice(-5, -1);
  if (last && before.length === 4 && before.every(r => r.closeRate !== null)) {
    const phones = before.reduce((s, r) => s + r.phones, 0) / 4;
    const rate = before.reduce((s, r) => s + r.closeRate!, 0) / 4;
    if (phones > 0 && rate > 0 && last.phones >= phones * 1.1 && last.closeRate !== null && last.closeRate <= rate * .9) notes.push('Số về tăng nhưng tỷ lệ chốt giảm: Sale có thể đang quá tải.');
  }
  for (const [key, label] of [['roas', 'ROAS'], ['costPerLead', 'CP/số']] as const) {
    const tail = rows.slice(-4).map(r => r[key]);
    if (tail.length === 4 && tail.every(v => v !== null)) {
      if (tail.slice(1).every((v, i) => v! < tail[i]!)) notes.push(`${label} giảm 3 đoạn liên tiếp.`);
      if (tail.slice(1).every((v, i) => v! > tail[i]!)) notes.push(`${label} tăng 3 đoạn liên tiếp.`);
    }
    const value = last?.[key], prev = before.map(r => r[key]);
    if (value != null && prev.length === 4 && prev.every(v => v !== null)) {
      const avg = prev.reduce<number>((s, v) => s + v!, 0) / 4;
      const change = avg ? (value / avg - 1) * 100 : 0;
      if (Math.abs(change) >= 10) notes.push(`${label} ${change > 0 ? 'tăng' : 'giảm'} ${Math.abs(change).toFixed(0)}% so với trung bình 4 đoạn trước.`);
    }
  }
  return notes.slice(0, 4);
}

export function trendQueries(posIds: string[], start: string, end: string) {
  const range = vnRangeUtc(start, end), ph = posIds.map(() => '?').join(',');
  const scope = `o.pos_id IN (${ph})`, mk = "NULLIF(TRIM(o.marketer_id),'')";
  const net = NET.replaceAll(/\b(net_total|current_total|total_discount)\b/g, 'o.$1');
  return [
    { sql: `SELECT ${mk} AS m, date(MIN(o.created_at), '+7 hours') AS day FROM raw_pos_orders o WHERE ${scope} AND o.created_at>=? AND o.created_at<? AND o.status_code<>7 AND ${mk} IS NOT NULL AND o.phone IS NOT NULL GROUP BY 1,o.phone`, binds: [...posIds, range.startUtc, range.endUtc] },
    { sql: `SELECT ${mk} AS m, date(o.first_confirmed_at, '+7 hours') AS day, COUNT(*) AS newOrders, SUM(${net}) AS newNet FROM raw_pos_orders o WHERE ${scope} AND o.first_confirmed_at>=? AND o.first_confirmed_at<? AND o.status_code NOT IN (0,17,6,7) AND ${mk} IS NOT NULL AND o.marketer_id IN ${COUNTED_STAFF} AND o.seller_id IN ${teamSubquery('sale')} GROUP BY 1,2`, binds: [...posIds, range.startUtc, range.endUtc] },
  ];
}
export async function mktTrend(opts: { start: string; end: string; posIds: string[]; marketerId?: string | null; teamId?: string | null; bucket: Bucket; team?: string }) {
  // Vite loại các import máy chủ khỏi bundle trình duyệt; node:test không có env.
  const server = (import.meta as ImportMeta & { env?: { SSR: boolean } }).env?.SSR !== false ? await Promise.all([import('cloudflare:workers'), import('@/lib/ad-costs')]) : null;
  if (!server) throw new Error('mktTrend chỉ chạy trên máy chủ');
  const [{ env }, { ensureAdCostSchema }] = server;
  await ensureAdCostSchema();
  const db = env.DB;
  const [costs, leads, closed, setting] = await db.batch([
    db.prepare('SELECT marketer_id AS m, day, SUM(amount) AS cost FROM ad_costs WHERE day>=? AND day<=? GROUP BY 1,2').bind(opts.start, opts.end),
    ...trendQueries(opts.posIds, opts.start, opts.end).map(q => db.prepare(q.sql).bind(...q.binds)),
    db.prepare('SELECT value FROM app_settings WHERE key=?').bind(MARKETING_TEAMS_KEY),
  ]);
  const teams = parseMarketingTeams((setting.results[0] as { value?: string } | undefined)?.value);
  const picked = (id: string) => (!opts.marketerId || id === opts.marketerId) && (!opts.teamId || (opts.teamId === UNASSIGNED_TEAM ? !teams.some(t => t.memberIds.includes(id)) : teams.some(t => t.id === opts.teamId && t.memberIds.includes(id))));
  type Row = { m: string; day: string; cost?: number; newOrders?: number; newNet?: number };
  const costRows = costs.results as Row[], amounts = new Map<string, number>();
  for (const r of costRows) amounts.set(r.m, (amounts.get(r.m) ?? 0) + Number(r.cost));
  const paid = (id: string) => (amounts.get(id) ?? 0) > 0;
  const daily = new Map<string, Base>();
  const at = (day: string) => { if (!daily.has(day)) daily.set(day, zero()); return daily.get(day)!; };
  for (const r of costRows) if (picked(r.m)) at(r.day).cost += Number(r.cost);
  // SĐT duy nhất theo marketer trong cả kỳ: gán vào ngày xuất hiện đầu tiên.
  for (const r of leads.results as Row[]) if (picked(r.m)) { at(r.day).phones++; if (paid(r.m)) at(r.day).coveredPhones++; }
  for (const r of closed.results as Row[]) if (picked(r.m)) { const x = at(r.day); x.newOrders += Number(r.newOrders); x.newNet += Number(r.newNet); if (paid(r.m)) x.coveredNet += Number(r.newNet); }
  const days = [...daily].map(([key, x]) => ({ key, ...x }));
  const rows = groupTrend(days, opts.start, opts.end, opts.bucket).map(r => ({ ...r, roas: opts.team === 'cskh' ? null : r.roas }));
  const total = zero();
  for (const d of days) for (const k of Object.keys(total) as (keyof Base)[]) total[k] += d[k];
  return { rows, total: { ...metrics(total), roas: opts.team === 'cskh' ? null : metrics(total).roas }, notes: trendNotes(rows), bucket: opts.bucket };
}
