// Đọc (chỉ GET) cấu hình "Phân công xử lý đơn" của từng POS trên Pancake bằng khóa API hiện có (04/10/2026).
// Mã giao diện Pancake cho thấy trang Cấu hình > Đơn hàng tự động lưu như sau (chưa thử ghi):
//  - dòng "Phân công theo thẻ / nguồn": PUT /shops/{id} {shop:{assign_by_order_sources:[…cả danh sách…], new_ui:true}}
//  - danh sách nhân viên được phân công: PUT /shops/{id}/users/{user_id}/update_assigned {user:{is_assigned:true|false}}
// Ở đây chỉ đọc để xem khóa API có thấy các trường đó không, trước khi tính tới việc ghi.
import { env } from 'cloudflare:workers';
import { sourceUrl } from '@/lib/pancake';

type Raw = Record<string, unknown>;
export type AssignRule = { key: string; type: string; users: string[]; departments: number; sources: number; extra: string[] };
export type AssignConfig = {
  posId: string; shopStatus: number; usersStatus: number; error: string | null;
  byDepartment: boolean | null; departments: string[]; onlineOnly: boolean | null; mode: string | null;
  assignedUsers: string[]; breakTimeUsers: string[]; rules: AssignRule[]; assignKeys: string[]; userFields: string[];
};

async function getJson(path: string, apiKey: string) {
  try {
    const r = await fetch(sourceUrl(path, apiKey), { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(15000), cache: 'no-store' });
    const text = await r.text();
    try { return { status: r.status, body: JSON.parse(text) as unknown }; } catch { return { status: r.status, body: null }; }
  } catch { return { status: 0, body: null }; }
}

const str = (v: unknown) => (typeof v === 'string' || typeof v === 'number' ? String(v) : '');
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const ids = (v: unknown) => arr(v).map((x) => str(typeof x === 'object' && x ? (x as Raw).id ?? (x as Raw).user_id : x)).filter(Boolean);

export async function readAssignConfig(posId: string, shopId: string, apiKey: string, names: Map<string, string>): Promise<AssignConfig> {
  const [one, users] = await Promise.all([getJson(`/shops/${shopId}`, apiKey), getJson(`/shops/${shopId}/users`, apiKey)]);
  const body = (one.body ?? {}) as Raw;
  const shop = (body.shop && typeof body.shop === 'object' ? body.shop : body) as Raw;
  const list = arr((users.body as Raw | null)?.data) as Raw[];
  for (const u of list) {
    const id = str(u.user_id ?? (u.user as Raw | undefined)?.id);
    const name = str((u.user as Raw | undefined)?.name);
    if (id && name && !names.has(id)) names.set(id, name);
  }
  const nameOf = (id: string) => names.get(id) ?? `#${id.slice(0, 6)}`;
  const depts = arr(shop.shop_departments) as Raw[];
  const deptName = (id: string) => str(depts.find((d) => str(d.id) === id)?.name) || `Bộ phận ${id}`;
  const assignedDept = shop.assigned_department;
  const rules = arr(shop.assign_by_order_sources).map((r0) => {
    const r = r0 as Raw;
    return {
      key: str(r.key), type: str(r.type) || 'order_source',
      users: ids(r.user_ids).map(nameOf), departments: ids(r.department_ids).length,
      sources: arr(r.multiple_source).length + arr(r.sources).length + arr(r.tags).length + arr(r.marketer_ids).length,
      extra: Object.keys(r),
    };
  });
  return {
    posId, shopStatus: one.status, usersStatus: users.status,
    error: one.status === 200 ? null : `Pancake trả HTTP ${one.status || 'lỗi mạng'} khi đọc cửa hàng.`,
    byDepartment: typeof shop.assigned_by_department === 'boolean' ? shop.assigned_by_department : null,
    departments: (Array.isArray(assignedDept) ? assignedDept : assignedDept != null ? [assignedDept] : []).map((d) => deptName(str(d))),
    onlineOnly: typeof shop.assign_online_user === 'boolean' ? shop.assign_online_user : null,
    mode: str(shop.auto_assign_type) || null,
    assignedUsers: list.filter((u) => u.is_assigned === true).map((u) => nameOf(str(u.user_id))),
    breakTimeUsers: list.filter((u) => u.is_assigned_break_time === true).map((u) => nameOf(str(u.user_id))),
    rules,
    assignKeys: Object.keys(shop).filter((k) => /assign|depart|online|working|break_time|day_off/i.test(k)),
    userFields: list[0] ? Object.keys(list[0]) : [],
  };
}

export async function readAllAssignConfigs() {
  const apiKey = env.PANCAKE_POS_API_KEY?.trim();
  if (!apiKey) return { configured: false, shops: [] as AssignConfig[] };
  const [shops, people] = await Promise.all([
    env.DB.prepare("SELECT id, shop_id FROM pos_shops WHERE shop_id IS NOT NULL AND shop_id<>''").all<{ id: string; shop_id: string }>(),
    env.DB.prepare("SELECT user_id, MAX(name) AS name FROM pos_users WHERE name<>'' GROUP BY user_id").all<{ user_id: string; name: string }>(),
  ]);
  const names = new Map(people.results.map((p) => [p.user_id, p.name]));
  const out = await Promise.all(shops.results.map((s) => readAssignConfig(s.id, s.shop_id, apiKey, names)));
  return { configured: true, shops: out };
}
