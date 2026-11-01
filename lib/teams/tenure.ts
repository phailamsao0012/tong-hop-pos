// Thâm niên T0, T1… cạnh tên nhân viên (anh Vũ 31/10/2026): T0 là tháng làm việc đầu tiên, T1 tháng thứ hai…
// Ngày vào lấy theo thứ tự: sửa tay (trang Tăng trưởng) → web nhân sự → ngày tạo tài khoản Pancake → ngày có đơn đầu tiên.
import { toIso } from '@/lib/teams/hr-link';
import { PEOPLE_META_KEY } from '@/lib/reports/growth';
import type { JoinSource } from '@/lib/reports/growth-calc';

const DAY = /^\d{4}-\d{2}-\d{2}/;
const vnDay = (iso: string | null) => (iso ? new Date(Date.parse(iso) + 7 * 3600000).toISOString().slice(0, 10) : null);

/** Số tháng tròn từ ngày vào tới hôm nay: vào 15/09, hôm nay 14/10 là T0, 15/10 là T1. Chưa tới ngày vào thì null. */
export function tenureMonths(joined: string, today: string): number | null {
  if (!DAY.test(joined) || !DAY.test(today) || joined > today) return null;
  const [jy, jm, jd] = joined.slice(0, 10).split('-').map(Number), [ty, tm, td] = today.slice(0, 10).split('-').map(Number);
  return (ty - jy) * 12 + (tm - jm) - (td < jd ? 1 : 0);
}

export type Tenure = { joined: string; source: JoinSource; t: number };

/** Chọn ngày vào theo thứ tự ưu tiên; không có nguồn nào thì null. */
export function pickJoined(sources: [string | null | undefined, JoinSource][]): { joined: string; source: JoinSource } | null {
  for (const [d, source] of sources) if (d && DAY.test(d)) return { joined: d.slice(0, 10), source };
  return null;
}

/** Ngày vào và thâm niên của mọi tài khoản Pancake (pos_users.user_id). Ngày có đơn đầu tiên đọc từ bảng tính sẵn theo ngày. */
export async function staffTenure(db: D1Database, today: string): Promise<Record<string, Tenure>> {
  const [users, hr, meta] = await Promise.all([
    db.prepare("SELECT user_id, MIN(source_created_at) AS created FROM pos_users WHERE name<>'' GROUP BY user_id").all<{ user_id: string; created: string | null }>(),
    db.prepare('SELECT t.pos_user_id AS id, MIN(e.joined_on) AS joined_on FROM hr_pos_team t JOIN hr_employees e ON e.id=t.employee_id WHERE e.joined_on IS NOT NULL GROUP BY 1')
      .all<{ id: string; joined_on: string | null }>().catch(() => ({ results: [] as { id: string; joined_on: string | null }[] })),
    db.prepare('SELECT value FROM app_settings WHERE key=?').bind(PEOPLE_META_KEY).first<{ value: string }>(),
  ]);
  let manual: Record<string, { joinedAt?: string | null }> = {};
  try { manual = meta ? JSON.parse(meta.value) : {}; } catch { manual = {}; }
  const hrMap = new Map(hr.results.map((r) => [r.id, r.joined_on]));
  const out: Record<string, Tenure> = {};
  const missing: string[] = [];
  for (const u of users.results) {
    const p = pickJoined([[manual[u.user_id]?.joinedAt, 'tay'], [hrMap.get(u.user_id), 'nhan-su'], [vnDay(toIso(u.created)), 'pancake']]);
    if (p) { const t = tenureMonths(p.joined, today); if (t !== null) out[u.user_id] = { ...p, t }; } else missing.push(u.user_id);
  }
  // Thiếu cả ba nguồn: lấy ngày có đơn đầu tiên (bảng tính sẵn theo ngày × người bán, không quét bảng đơn gốc).
  for (let i = 0; i < missing.length; i += 90) {
    const chunk = missing.slice(i, i + 90);
    const rows = await db.prepare(`SELECT seller_id AS id, MIN(day) AS day FROM stats_daily_seller_product WHERE seller_id IN (${chunk.map(() => '?').join(',')}) AND orders>0 GROUP BY 1`)
      .bind(...chunk).all<{ id: string; day: string }>();
    for (const r of rows.results) { const t = tenureMonths(r.day, today); if (t !== null) out[r.id] = { joined: r.day, source: 'don-dau', t }; }
  }
  return out;
}
