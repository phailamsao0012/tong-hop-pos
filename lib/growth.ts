// Tăng trưởng nhân viên: số theo ngày của từng người một bộ phận, kèm ngày vào công ty. Chỉ đọc, không thêm bảng.
// Sale / CSKH / MKT dùng đúng truy vấn thẻ xu hướng (lib/trend-period.ts, chỉ mục phủ theo ngày chốt / xác nhận);
// Vận đơn đếm đơn mỗi người xác nhận (first_confirmed_by), bỏ người có hậu tố SALE / CSKH / MKT tự xác nhận đơn của mình.
import { POS } from '@/lib/report-model';
import { daysBetween, vnRangeUtc } from '@/lib/report-time';
import { COUNTED_STAFF } from '@/lib/team';
import { toIso } from '@/lib/hr-link';
import { trendQuery } from '@/lib/trend-period';
import type { GrowthData, GrowthDept, GrowthPerson, JoinSource } from '@/lib/growth-calc';

/** Ngày vào sửa tay nằm chung people_meta.joinedAt (khóa cũ của trang Con người). */
export const PEOPLE_META_KEY = 'people_meta';
type Point = { day: string; id: string; value: number; n: number };

export function growthQuery(dept: GrowthDept, startUtc: string, endUtc: string) {
  const posIds = POS.map((p) => p.id);
  if (dept !== 'vandon') return trendQuery(dept, posIds, startUtc, endUtc, '', [], false, true);
  const sql = `SELECT date(o.first_confirmed_at,'+7 hours') AS day, 0 AS hour, o.first_confirmed_by AS id, COUNT(*) AS value, COUNT(*) AS n
    FROM raw_pos_orders o WHERE o.pos_id IN (${posIds.map(() => '?').join(',')}) AND o.first_confirmed_at>=? AND o.first_confirmed_at<?
    AND NULLIF(o.first_confirmed_by,'') IS NOT NULL AND o.first_confirmed_by NOT IN ${COUNTED_STAFF} GROUP BY 1,3`;
  return { sql, binds: [...posIds, startUtc, endUtc] };
}

const vnDay = (iso: string | null) => iso ? new Date(Date.parse(iso) + 7 * 3600000).toISOString().slice(0, 10) : null;
const DAY = /^\d{4}-\d{2}-\d{2}/;

export async function growthData(db: D1Database, dept: GrowthDept, start: string, end: string, today: string): Promise<GrowthData> {
  const { startUtc, endUtc } = vnRangeUtc(start, end);
  const q = growthQuery(dept, startUtc, endUtc);
  const [points, users, hr, meta] = await Promise.all([
    db.prepare(q.sql).bind(...q.binds).all<Point>(),
    db.prepare('SELECT user_id, name, source_created_at FROM pos_users').all<{ user_id: string; name: string | null; source_created_at: string | null }>(),
    db.prepare('SELECT t.pos_user_id AS id, t.status, e.joined_on, e.left_on FROM hr_pos_team t LEFT JOIN hr_employees e ON e.id=t.employee_id')
      .all<{ id: string; status: string | null; joined_on: string | null; left_on: string | null }>().catch(() => ({ results: [] as { id: string; status: string | null; joined_on: string | null; left_on: string | null }[] })),
    db.prepare('SELECT value FROM app_settings WHERE key=?').bind(PEOPLE_META_KEY).first<{ value: string }>(),
  ]);
  let manual: Record<string, { joinedAt?: string | null }> = {};
  try { manual = meta ? JSON.parse(meta.value) : {}; } catch { /* hỏng thì coi như chưa sửa tay */ }
  const names = new Map<string, string>(), created = new Map<string, string>();
  for (const u of users.results) {
    if (u.name && !names.has(u.user_id)) names.set(u.user_id, u.name.replace(/\s+/g, ' ').trim());
    const c = vnDay(toIso(u.source_created_at));
    if (c && (!created.has(u.user_id) || c < created.get(u.user_id)!)) created.set(u.user_id, c);
  }
  const hrMap = new Map(hr.results.map((r) => [r.id, r]));
  const series: GrowthData['series'] = {};
  const first = new Map<string, string>(), lastSeen = new Map<string, string>();
  for (const p of points.results) {
    if (!p.id) continue;
    const s = series[p.id] ??= { d: [], v: [], n: [] };
    s.d.push(daysBetween(start, p.day) - 1); s.v.push(Number(p.value) || 0); s.n.push(Number(p.n) || 0);
    if (!first.has(p.id) || p.day < first.get(p.id)!) first.set(p.id, p.day);
    if (!lastSeen.has(p.id) || p.day > lastSeen.get(p.id)!) lastSeen.set(p.id, p.day);
  }
  const people: GrowthPerson[] = Object.keys(series).map((id) => {
    const h = hrMap.get(id);
    const hand = manual[id]?.joinedAt && DAY.test(manual[id].joinedAt!) ? manual[id].joinedAt!.slice(0, 10) : null;
    const fromHr = h?.joined_on && DAY.test(h.joined_on) ? h.joined_on.slice(0, 10) : null;
    // Ngày có đơn đầu tiên chỉ đáng tin khi nằm sau đầu khoảng xem (trước đó có thể đã có đơn).
    const firstDay = first.get(id)!;
    const pick: [string | null, JoinSource][] = [[hand, 'tay'], [fromHr, 'nhan-su'], [created.get(id) ?? null, 'pancake'], [firstDay > start ? firstDay : null, 'don-dau']];
    const [joined, source] = pick.find(([d]) => d) ?? [null, null];
    const left = h?.left_on && DAY.test(h.left_on) ? h.left_on.slice(0, 10) : h?.status === 'da_nghi' ? lastSeen.get(id)! : null;
    return { id, name: names.get(id) ?? `NV ${id.slice(0, 8)}`, joined, source: joined ? source : null, left };
  }).sort((a, b) => a.name.localeCompare(b.name, 'vi'));
  return { dept, start, end, today, unit: dept === 'vandon' ? 'orders' : 'money', people, series };
}

/** Ghi ngày vào sửa tay (null = bỏ sửa tay, quay về web nhân sự / Pancake). Trả về số dòng đã ghi. */
export async function saveJoined(db: D1Database, id: string, joinedAt: string | null) {
  const row = await db.prepare('SELECT value FROM app_settings WHERE key=?').bind(PEOPLE_META_KEY).first<{ value: string }>();
  let meta: Record<string, Record<string, unknown>> = {};
  try { meta = row ? JSON.parse(row.value) : {}; } catch { meta = {}; }
  meta[id] = { ...meta[id], joinedAt };
  if (!joinedAt) { delete meta[id].joinedAt; if (!Object.keys(meta[id]).length) delete meta[id]; }
  const r = await db.prepare('INSERT INTO app_settings (key,value,updated_at) VALUES (?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at')
    .bind(PEOPLE_META_KEY, JSON.stringify(meta), new Date().toISOString()).run();
  return r.meta?.rows_written ?? 1;
}
