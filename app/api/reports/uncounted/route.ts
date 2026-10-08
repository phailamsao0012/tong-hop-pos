import { env } from 'cloudflare:workers';
import { forbidden, getSessionUser, unauthorized } from '@/lib/auth';
import { canView, isOwner } from '@/lib/access';
import { auditHeaders } from '@/lib/audit';
import { ORDER_STATUS } from '@/lib/pancake';
import { POS } from '@/lib/report-model';
import { DATE_RE, vnRangeUtc } from '@/lib/report-time';
import { CLOSED } from '@/lib/stats';
import { COUNTED, COUNTED_NAME, COUNTED_STAFF, COUNTED_STAFF_KEY } from '@/lib/team';

// Doanh thu của người KHÔNG được tính (anh Vũ 08/10/2026: chỉ tính người có hậu tố MKT / CSKH / SALE trong tên Pancake, ở mọi POS;
// "những người còn lại nếu phát sinh doanh thu trên pos thì phải làm 1 bảng báo cáo riêng để tôi thống kê xem nguyên nhân do đâu").
// Người bán: đơn chốt theo ngày chốt (cùng Tổng quan POS). Marketer: đơn đã xác nhận theo ngày xác nhận (cùng bảng MKT).
// Ghi chú nguyên nhân lưu ở app_settings (NOTES_KEY), ai xem được trang thì ghi được; "Vẫn tính" chỉ chủ hệ thống.
const NET = 'COALESCE(o.net_total,COALESCE(o.current_total,0)-COALESCE(o.total_discount,0))';
const NOTES_KEY = 'uncounted_notes';
type Role = 'seller' | 'marketer';
const ROLE_SQL: Record<Role, { col: string; date: string; where: string }> = {
  seller: { col: 'o.seller_id', date: 'o.first_closed_at', where: `o.${CLOSED}` },
  marketer: { col: 'o.marketer_id', date: 'o.first_confirmed_at', where: 'o.status_code NOT IN (0,17,6,7)' },
};
type Note = { text: string; by: string; at: string };

async function readJson<T>(key: string, fallback: T): Promise<T> {
  const row = await env.DB.prepare('SELECT value FROM app_settings WHERE key=?').bind(key).first<{ value: string }>();
  try { return row ? JSON.parse(row.value) as T : fallback; } catch { return fallback; }
}
const writeJson = (key: string, value: unknown) => env.DB.prepare('INSERT INTO app_settings (key,value,updated_at) VALUES (?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at')
  .bind(key, JSON.stringify(value), new Date().toISOString()).run();

function scope(p: URLSearchParams) {
  const start = p.get('start') ?? '', end = p.get('end') ?? '';
  if (!DATE_RE.test(start) || !DATE_RE.test(end) || start > end) return { error: 'Khoảng ngày không hợp lệ.' } as const;
  const valid = new Set<string>(POS.map((x) => x.id));
  const requested = (p.get('posIds') ?? '').split(',').filter(Boolean);
  if (requested.some((id) => !valid.has(id))) return { error: 'POS không hợp lệ.' } as const;
  const posIds = requested.length ? requested : POS.map((x) => x.id);
  return { start, end, posIds, ph: posIds.map(() => '?').join(','), ...vnRangeUtc(start, end) } as const;
}

export async function GET(request: Request) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  if (!canView(user, 'uncounted') && !canView(user, 'overview')) return forbidden('Không có quyền xem.');
  const p = new URL(request.url).searchParams;
  const s = scope(p);
  if ('error' in s) return Response.json({ error: s.error }, { status: 400 });
  const { posIds, ph, startUtc, endUtc } = s;

  // Danh sách đơn của một người (bấm "Xem đơn"): tối đa 500 đơn mới nhất, kèm đường mở trên Pancake.
  const who = p.get('orders'), role = p.get('role') === 'marketer' ? 'marketer' : 'seller';
  if (who) {
    const r = ROLE_SQL[role];
    const [rows, shops] = await env.DB.batch([
      env.DB.prepare(`SELECT o.id, o.pos_id, o.source_order_id, o.customer_name, ${r.date} AS at, o.status_code, ${NET} AS net
        FROM raw_pos_orders o WHERE o.pos_id IN (${ph}) AND ${r.date}>=? AND ${r.date}<? AND ${r.where} AND ${r.col}=?
        ORDER BY ${r.date} DESC LIMIT 500`).bind(...posIds, startUtc, endUtc, who),
      env.DB.prepare('SELECT id, shop_id FROM pos_shops'),
    ]);
    const shopOf = new Map((shops.results as { id: string; shop_id: string | null }[]).map((x) => [x.id, x.shop_id]));
    type O = { id: string; pos_id: string; source_order_id: string; customer_name: string | null; at: string; status_code: number; net: number };
    return Response.json({
      orders: (rows.results as O[]).map((o) => ({
        id: o.id, posId: o.pos_id, orderId: o.source_order_id, customer: o.customer_name, at: o.at, status: ORDER_STATUS[Number(o.status_code)] ?? String(o.status_code), net: Number(o.net ?? 0),
        pancakeUrl: shopOf.get(o.pos_id) ? `https://pos.pancake.vn/shop/${shopOf.get(o.pos_id)}/orders?order_id=${o.source_order_id}` : null,
      })),
    }, { headers: { 'Cache-Control': 'private, no-store' } });
  }

  const people = 'SELECT user_id, MAX(name) AS name, MAX(department) AS department FROM pos_users GROUP BY user_id';
  const agg = (rl: Role) => {
    const r = ROLE_SQL[rl];
    return env.DB.prepare(`SELECT ${r.col} AS id, o.pos_id, COUNT(*) AS orders, COALESCE(SUM(${NET}),0) AS net, MIN(${r.date}) AS first_at, MAX(${r.date}) AS last_at
      FROM raw_pos_orders o WHERE o.pos_id IN (${ph}) AND ${r.date}>=? AND ${r.date}<? AND ${r.where}
        AND NULLIF(TRIM(${r.col}),'') IS NOT NULL AND ${r.col} NOT IN ${COUNTED_STAFF}
      GROUP BY 1, 2`).bind(...posIds, startUtc, endUtc);
  };
  const [sellers, marketers, names, totals, extra, team] = await env.DB.batch([
    agg('seller'), agg('marketer'),
    env.DB.prepare(people),
    // Tổng đơn chốt cả kỳ (mọi người bán) để biết phần không tính chiếm bao nhiêu.
    env.DB.prepare(`SELECT COUNT(*) AS orders, COALESCE(SUM(${NET}),0) AS net FROM raw_pos_orders o WHERE o.pos_id IN (${ph}) AND o.first_closed_at>=? AND o.first_closed_at<? AND o.${CLOSED}`).bind(...posIds, startUtc, endUtc),
    env.DB.prepare(`SELECT user_id AS id, MAX(name) AS name, MAX(department) AS department, GROUP_CONCAT(DISTINCT pos_id) AS pos_ids FROM pos_users WHERE ${COUNTED} AND NOT ${COUNTED_NAME} GROUP BY user_id ORDER BY name`),
    env.DB.prepare('SELECT pos_user_id AS id, team, status FROM hr_pos_team'),
  ]);
  const nameOf = new Map((names.results as { user_id: string; name: string | null; department: string | null }[]).map((r) => [r.user_id, r]));
  const hrOf = new Map((team.results as { id: string; team: string | null; status: string | null }[]).map((r) => [r.id, r]));
  const notes = await readJson<Record<string, Note>>(NOTES_KEY, {});
  type A = { id: string; pos_id: string; orders: number; net: number; first_at: string; last_at: string };
  const fold = (rows: A[], rl: Role) => {
    const map = new Map<string, { id: string; role: Role; name: string; department: string | null; hrTeam: string | null; hrStatus: string | null; orders: number; net: number; firstAt: string; lastAt: string; byPos: { posId: string; orders: number; net: number }[]; note: Note | null }>();
    for (const r of rows) {
      const u = nameOf.get(r.id), hr = hrOf.get(r.id);
      const x = map.get(r.id) ?? { id: r.id, role: rl, name: u?.name || `Mã ${r.id.slice(0, 8)}`, department: u?.department ?? null, hrTeam: hr?.team ?? null, hrStatus: hr?.status ?? null, orders: 0, net: 0, firstAt: r.first_at, lastAt: r.last_at, byPos: [], note: notes[`${rl}:${r.id}`] ?? null };
      x.orders += Number(r.orders); x.net += Number(r.net);
      if (r.first_at < x.firstAt) x.firstAt = r.first_at;
      if (r.last_at > x.lastAt) x.lastAt = r.last_at;
      x.byPos.push({ posId: r.pos_id, orders: Number(r.orders), net: Number(r.net) });
      map.set(r.id, x);
    }
    return [...map.values()].map((x) => ({ ...x, byPos: x.byPos.sort((a, b) => b.net - a.net) })).sort((a, b) => b.net - a.net);
  };
  type E = { id: string; name: string | null; department: string | null; pos_ids: string | null };
  const t = (totals.results[0] ?? {}) as { orders?: number; net?: number };
  return Response.json({
    period: { start: s.start, end: s.end },
    sellers: fold(sellers.results as A[], 'seller'), marketers: fold(marketers.results as A[], 'marketer'),
    total: { orders: Number(t.orders ?? 0), net: Number(t.net ?? 0) },
    extra: (extra.results as E[]).map((r) => ({ id: r.id, name: r.name ?? `Mã ${r.id.slice(0, 8)}`, department: r.department, posIds: (r.pos_ids ?? '').split(',').filter(Boolean) })),
    canEdit: isOwner(user),
    rule: 'Chỉ tính doanh số người có hậu tố MKT, CSKH hoặc SALE trong tên trên Pancake (mọi POS), riêng anh Xuân Nghĩa vẫn tính. Đơn chưa có người bán vẫn tính.',
  }, { headers: { 'Cache-Control': 'private, no-store' } });
}

/**
 * { action: 'note', role, userId, text } — ghi nguyên nhân (ai xem được trang thì ghi được);
 * { action: 'count', userId, counted } — bật / tắt "Vẫn tính" (chỉ chủ hệ thống).
 */
export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  const body = await request.json().catch(() => null) as { action?: unknown; role?: unknown; userId?: unknown; text?: unknown; counted?: unknown } | null;
  const userId = typeof body?.userId === 'string' ? body.userId.trim() : '';
  if (!userId || userId.length > 80) return Response.json({ error: 'Thiếu người.' }, { status: 400 });
  const known = await env.DB.prepare('SELECT MAX(name) AS name FROM pos_users WHERE user_id=?').bind(userId).first<{ name: string | null }>();
  if (!known?.name) return Response.json({ error: 'Không thấy người này trong danh sách nhân viên POS.' }, { status: 404 });
  if (body?.action === 'note') {
    if (!canView(user, 'uncounted')) return forbidden('Không có quyền ghi nguyên nhân.');
    const role: Role = body.role === 'marketer' ? 'marketer' : 'seller';
    const text = typeof body.text === 'string' ? body.text.trim().slice(0, 500) : '';
    const notes = await readJson<Record<string, Note>>(NOTES_KEY, {});
    if (text) notes[`${role}:${userId}`] = { text, by: user.displayName || user.email, at: new Date().toISOString() };
    else delete notes[`${role}:${userId}`];
    await writeJson(NOTES_KEY, notes);
    return Response.json({ ok: true, note: notes[`${role}:${userId}`] ?? null }, { headers: auditHeaders(`Ghi nguyên nhân doanh thu không tính: ${known.name}`, 'staff.uncounted.note') });
  }
  if (!isOwner(user)) return forbidden('Chỉ chủ hệ thống đổi danh sách tính doanh số.');
  if (typeof body?.counted !== 'boolean') return Response.json({ error: 'Thiếu lựa chọn.' }, { status: 400 });
  const raw = await readJson<unknown>(COUNTED_STAFF_KEY, []);
  const list = new Set(Array.isArray(raw) ? raw.filter((x): x is string => typeof x === 'string') : []);
  if (body.counted) list.add(userId); else list.delete(userId);
  await writeJson(COUNTED_STAFF_KEY, [...list]);
  return Response.json({ ok: true, extra: [...list] }, { headers: auditHeaders(`${body.counted ? 'Vẫn tính doanh số' : 'Bỏ tính doanh số'}: ${known.name}`, 'staff.counted') });
}
