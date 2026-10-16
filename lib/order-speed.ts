import { type HrUnit, type Team, teamFilter } from './team';

export const SPEED_BUCKETS = [5, 15, 30, 60, 120, 240, 480, 1440, 2880, 4320, 7200, Infinity];
export type SpeedHist = number[];
export type SpeedStage = { key: 'assign' | 'confirm' | 'ship' | 'deliver'; label: string; n: number; skipped: number; p50: number | null; p90: number | null; hist: SpeedHist };
export const STAGE_LABELS = { assign: 'Chia số', confirm: 'Vào Chờ xác nhận → Đã xác nhận', ship: 'Gửi hãng', deliver: 'Giao tới khách' };
export function percentileFromHist(h: SpeedHist, p: number): number | null {
  const total = h.reduce((a, b) => a + b, 0);
  if (!total) return null;
  const target = total * Math.max(0, Math.min(1, p));
  let before = 0;
  for (let i = 0; i < SPEED_BUCKETS.length; i++) {
    const n = h[i] ?? 0, low = i ? SPEED_BUCKETS[i - 1] : 0;
    if (n && before + n >= target) return i === 11 ? low : low + (SPEED_BUCKETS[i] - low) * (target - before) / n;
    before += n;
  }
  return null;
}
export type SpeedRow = { stage: SpeedStage['key']; posId: string; who: string | null; bucket: number; n: number };
const keys = Object.keys(STAGE_LABELS) as SpeedStage['key'][];
const emptySkipped = () => ({ assign: 0, confirm: 0, ship: 0, deliver: 0 });
export function buildSpeed(rows: SpeedRow[], skipped: Record<SpeedStage['key'], number>) {
  const stages = (subset: SpeedRow[], skips: Record<SpeedStage['key'], number>): SpeedStage[] => keys.map((key) => {
    const hist = Array<number>(12).fill(0);
    for (const r of subset) if (r.stage === key && r.bucket >= 0 && r.bucket < 12) hist[r.bucket] += r.n;
    return { key, label: STAGE_LABELS[key], n: hist.reduce((a, b) => a + b, 0), skipped: skips[key], hist, p50: percentileFromHist(hist, 0.5), p90: percentileFromHist(hist, 0.9) };
  });
  const byPos = [...new Set(rows.map((r) => r.posId))].map((posId) => {
    const subset = rows.filter((r) => r.posId === posId), skips = emptySkipped();
    for (const r of subset) if (r.bucket === -1) skips[r.stage] += r.n;
    return { posId, stages: stages(subset, skips) };
  });
  const people = new Map<string, SpeedRow[]>();
  for (const r of rows) if (r.who && r.bucket >= 0) {
    const id = JSON.stringify([r.stage, r.who]);
    const group = people.get(id) ?? []; group.push(r); people.set(id, group);
  }
  const byPerson = [...people.values()].map((group) => {
    const r = group[0], s = stages(group, emptySkipped()).find((s) => s.key === r.stage)!;
    return { stage: r.stage, who: r.who!, n: s.n, p50: s.p50, p90: s.p90 };
  }).filter((r) => r.n >= 10);
  return { stages: stages(rows, skipped), byPos, byPerson };
}
export function closeRateByWait(rows: { bucket: number; leads: number; closed: number }[]) {
  return ['<5 phút', '5–15 phút', '15–60 phút', 'Từ 60 phút'].map((label, i) => {
    const group = rows.filter((r) => r.bucket >= 0 && (r.bucket === 0 ? 0 : r.bucket === 1 ? 1 : r.bucket < 4 ? 2 : 3) === i);
    const leads = group.reduce((n, r) => n + r.leads, 0), closed = group.reduce((n, r) => n + r.closed, 0);
    return { label, leads, closed, rate: leads ? closed / leads * 100 : null };
  });
}
export const STUCK_RULES: { key: string; label: string; status: number[]; from: 'created_at' | 'first_closed_at' | 'first_confirmed_at'; minutes: number; maxDays: number; needNoSeller?: boolean }[] = [
  { key: 'assign', label: 'Số mới chưa chia quá 15 phút', status: [0], from: 'created_at', minutes: 15, maxDays: 3, needNoSeller: true },
  { key: 'confirm', label: 'Chờ xác nhận quá 4 giờ', status: [17], from: 'first_closed_at', minutes: 240, maxDays: 30 },
  { key: 'ship', label: 'Đã xác nhận chưa gửi quá 24 giờ', status: [1, 8, 9, 11, 12, 13, 20], from: 'first_confirmed_at', minutes: 1440, maxDays: 30 },
];
export type StuckRow = { kind: 'count' | 'order'; posId: string; who: string | null; n: number; sourceOrderId: string | null; minutes: number | null };
export const speedBucketSql = (m: string) => `CASE ${SPEED_BUCKETS.slice(0, -1).map((v, i) => `WHEN ${m}<${v} THEN ${i}`).join(' ')} ELSE 11 END`;
/** Chỉ trả ô tổng hợp và tối đa 50 đơn mỗi luật; không đọc thông tin khách. */
export function speedQueries(db: D1Database, posIds: string[], start: string, end: string, now: string, team: Team, unit: HrUnit | null) {
  const pos = `o.pos_id IN (${posIds.map(() => '?').join(',')})`;
  const filter = teamFilter('o.seller_id', team, false, unit);
  const specs = [
    ['assign', 'created_at', 'seller_assigned_at', 'created_at', 'o.seller_id'],
    ['confirm', 'first_closed_at', 'first_confirmed_at', 'first_closed_at', 'o.seller_id'],
    ['ship', 'first_confirmed_at', 'first_sent_at', 'first_sent_at', 'o.first_confirmed_by'],
    ['deliver', 'first_sent_at', 'delivered_at', 'first_sent_at', "COALESCE(NULLIF(o.carrier_name,''),'Chưa có hãng')"],
  ];
  const queries = specs.map(([stage, a, b, time, who]) => {
    const m = `(julianday(o.${b})-julianday(o.${a}))*1440`;
    return db.prepare(`SELECT '${stage}' AS stage, o.pos_id AS posId, ${who} AS who,
      CASE WHEN ${m} IS NULL OR ${m}<0 THEN -1 ELSE ${speedBucketSql(m)} END AS bucket, COUNT(*) AS n
      FROM raw_pos_orders o WHERE ${pos} AND o.${time}>=? AND o.${time}<?${filter} GROUP BY posId,who,bucket`).bind(...posIds, start, end);
  });
  const wait = '(julianday(o.seller_assigned_at)-julianday(o.created_at))*1440';
  queries.push(db.prepare(`SELECT ${speedBucketSql(wait)} AS bucket, COUNT(*) AS leads, COUNT(o.first_closed_at) AS closed
    FROM raw_pos_orders o WHERE ${pos} AND o.created_at>=? AND o.created_at<? AND ${wait}>=0${filter} GROUP BY bucket`).bind(...posIds, start, end));
  for (const rule of STUCK_RULES) {
    const m = `(julianday(?)-julianday(o.${rule.from}))*1440`;
    const noSeller = rule.needNoSeller ? ' AND o.seller_id IS NULL' : '';
    queries.push(db.prepare(`WITH stuck AS (
      SELECT o.pos_id AS posId,o.seller_id AS who,o.source_order_id AS sourceOrderId,${m} AS minutes
      FROM raw_pos_orders o WHERE ${pos} AND o.${rule.from}>=? AND o.status_code IN (${rule.status.join(',')})${noSeller}${filter}
      AND julianday(o.${rule.from})<julianday(?)-${rule.minutes}/1440.0)
      SELECT 'count' AS kind,posId,who,COUNT(*) AS n,NULL AS sourceOrderId,NULL AS minutes FROM stuck GROUP BY posId,who
      UNION ALL SELECT 'order',posId,who,0,sourceOrderId,minutes FROM (SELECT * FROM stuck ORDER BY minutes DESC,posId,sourceOrderId LIMIT 50)`)
      .bind(now, ...posIds, new Date(Date.parse(now) - rule.maxDays * 86400000).toISOString(), now));
  }
  return queries;
}
