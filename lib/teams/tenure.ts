// Thâm niên T0, T1… cạnh tên nhân viên (anh Vũ 31/10/2026): T0 là tháng làm việc đầu tiên, T1 tháng thứ hai…
// Ngày vào: sửa tay → web nhân sự theo mã NV trong tên → tạo tài khoản Pancake → hoạt động đầu tiên (lib/teams/join-date.ts).
import { toIso } from '@/lib/teams/hr-link';
import { PEOPLE_META_KEY } from '@/lib/reports/growth';
import { plausibleJoin, type JoinSource } from '@/lib/reports/growth-calc';
import { firstActivity, hrJoinByCode, resolveJoin } from '@/lib/teams/join-date';

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
  // Sửa tay giữ nguyên; nguồn tự động phải là ngày hợp lý.
  for (const [d, source] of sources) { const ok = source === 'tay' ? (d && DAY.test(d) ? d.slice(0, 10) : null) : plausibleJoin(d); if (ok) return { joined: ok, source }; }
  return null;
}

/** Ngày vào và thâm niên của mọi tài khoản Pancake (pos_users.user_id). Quy tắc chọn ngày ở lib/teams/join-date.ts. */
export async function staffTenure(db: D1Database, today: string): Promise<Record<string, Tenure>> {
  const [users, hr, codes, meta, active] = await Promise.all([
    db.prepare("SELECT user_id, MIN(source_created_at) AS created, GROUP_CONCAT(name, char(31)) AS names FROM pos_users WHERE name<>'' GROUP BY user_id").all<{ user_id: string; created: string | null; names: string | null }>(),
    db.prepare('SELECT t.pos_user_id AS id, MIN(e.joined_on) AS joined_on FROM hr_pos_team t JOIN hr_employees e ON e.id=t.employee_id WHERE e.joined_on IS NOT NULL GROUP BY 1')
      .all<{ id: string; joined_on: string | null }>().catch(() => ({ results: [] as { id: string; joined_on: string | null }[] })),
    db.prepare('SELECT code, joined_on FROM hr_employees').all<{ code: string | null; joined_on: string | null }>().catch(() => ({ results: [] as { code: string | null; joined_on: string | null }[] })),
    db.prepare('SELECT value FROM app_settings WHERE key=?').bind(PEOPLE_META_KEY).first<{ value: string }>(),
    firstActivity(db),
  ]);
  let manual: Record<string, { joinedAt?: string | null }> = {};
  try { manual = meta ? JSON.parse(meta.value) : {}; } catch { manual = {}; }
  const hrMap = new Map(hr.results.map((r) => [r.id, r.joined_on]));
  const hrByCode = hrJoinByCode(codes.results);
  const out: Record<string, Tenure> = {};
  for (const u of users.results) {
    // Đơn đầu tiên nằm trong ngày hoạt động đầu tiên (đơn bán, đơn Marketer, ghi chú) nên dùng chung một số.
    const first = active.get(u.user_id) ?? null;
    const p = resolveJoin({ manual: manual[u.user_id]?.joinedAt, names: (u.names ?? '').split(String.fromCharCode(31)), hrLinked: hrMap.get(u.user_id), hrByCode, created: vnDay(toIso(u.created)), firstOrder: first, firstActive: first });
    if (!p) continue;
    const t = tenureMonths(p.joined, today);
    if (t !== null) out[u.user_id] = { ...p, t };
  }
  return out;
}
