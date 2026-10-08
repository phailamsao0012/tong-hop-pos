import { env } from 'cloudflare:workers';
import { forbidden, getSessionUser, unauthorized } from '@/lib/auth';
import { canView, isOwner } from '@/lib/access';
import { auditHeaders } from '@/lib/audit';
import { POS } from '@/lib/report-model';
import { DATE_RE, vnRangeUtc } from '@/lib/report-time';
import { CLOSED } from '@/lib/stats';
import { COUNTED, COUNTED_NAME, COUNTED_STAFF, COUNTED_STAFF_KEY } from '@/lib/team';

// Người KHÔNG được tính doanh số (anh Vũ 08/10/2026: chỉ tính người có hậu tố MKT / CSKH / SALE trong tên Pancake, ở mọi POS),
// kèm số đơn và tiền trong kỳ để anh soát: ai sót hậu tố thì sửa tên trên Pancake, hoặc chủ hệ thống bấm "Vẫn tính" (lưu ở app_settings).
const NET = 'COALESCE(o.net_total,COALESCE(o.current_total,0)-COALESCE(o.total_discount,0))';

async function readExtra() {
  const row = await env.DB.prepare('SELECT value FROM app_settings WHERE key=?').bind(COUNTED_STAFF_KEY).first<{ value: string }>();
  try { const v = row ? JSON.parse(row.value) as unknown : []; return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []; } catch { return []; }
}

export async function GET(request: Request) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  if (!canView(user, 'overview')) return forbidden('Không có quyền xem.');
  const p = new URL(request.url).searchParams;
  const start = p.get('start') ?? '', end = p.get('end') ?? '';
  if (!DATE_RE.test(start) || !DATE_RE.test(end) || start > end) return Response.json({ error: 'Khoảng ngày không hợp lệ.' }, { status: 400 });
  const valid = new Set<string>(POS.map((x) => x.id));
  const requested = (p.get('posIds') ?? '').split(',').filter(Boolean);
  if (requested.some((id) => !valid.has(id))) return Response.json({ error: 'POS không hợp lệ.' }, { status: 400 });
  const posIds = requested.length ? requested : POS.map((x) => x.id);
  const ph = posIds.map(() => '?').join(',');
  const { startUtc, endUtc } = vnRangeUtc(start, end);
  const people = `SELECT user_id, MAX(name) AS name, MAX(department) AS department FROM pos_users GROUP BY user_id`;
  const [sellers, marketers, extra] = await env.DB.batch([
    // Người bán không được tính: đơn chốt trong kỳ (theo ngày chốt, cùng Tổng quan POS).
    env.DB.prepare(`SELECT o.seller_id AS id, u.name, u.department, GROUP_CONCAT(DISTINCT o.pos_id) AS pos_ids, COUNT(*) AS orders, COALESCE(SUM(${NET}),0) AS net
      FROM raw_pos_orders o LEFT JOIN (${people}) u ON u.user_id=o.seller_id
      WHERE o.pos_id IN (${ph}) AND o.first_closed_at>=? AND o.first_closed_at<? AND o.${CLOSED}
        AND NULLIF(o.seller_id,'') IS NOT NULL AND o.seller_id NOT IN ${COUNTED_STAFF}
      GROUP BY o.seller_id ORDER BY net DESC`).bind(...posIds, startUtc, endUtc),
    // Marketer không được tính: đơn đã xác nhận trong kỳ (theo ngày xác nhận, cùng bảng MKT).
    env.DB.prepare(`SELECT o.marketer_id AS id, u.name, u.department, GROUP_CONCAT(DISTINCT o.pos_id) AS pos_ids, COUNT(*) AS orders, COALESCE(SUM(${NET}),0) AS net
      FROM raw_pos_orders o LEFT JOIN (${people}) u ON u.user_id=o.marketer_id
      WHERE o.pos_id IN (${ph}) AND o.first_confirmed_at>=? AND o.first_confirmed_at<? AND o.status_code NOT IN (0,17,6,7)
        AND NULLIF(TRIM(o.marketer_id),'') IS NOT NULL AND o.marketer_id NOT IN ${COUNTED_STAFF}
      GROUP BY o.marketer_id ORDER BY net DESC`).bind(...posIds, startUtc, endUtc),
    // Người đang "Vẫn tính" dù tên không có hậu tố.
    env.DB.prepare(`SELECT user_id AS id, MAX(name) AS name, MAX(department) AS department, GROUP_CONCAT(DISTINCT pos_id) AS pos_ids FROM pos_users
      WHERE ${COUNTED} AND NOT ${COUNTED_NAME} GROUP BY user_id ORDER BY name`),
  ]);
  type R = { id: string; name: string | null; department: string | null; pos_ids: string | null; orders?: number; net?: number };
  const shape = (r: R) => ({ id: r.id, name: r.name ?? `Mã ${r.id.slice(0, 8)}`, department: r.department, posIds: (r.pos_ids ?? '').split(',').filter(Boolean), orders: Number(r.orders ?? 0), net: Number(r.net ?? 0) });
  return Response.json({
    period: { start, end },
    sellers: (sellers.results as R[]).map(shape), marketers: (marketers.results as R[]).map(shape), extra: (extra.results as R[]).map(shape),
    canEdit: isOwner(user),
    rule: 'Chỉ tính doanh số người có hậu tố MKT, CSKH hoặc SALE trong tên trên Pancake (mọi POS), riêng anh Xuân Nghĩa vẫn tính. Đơn chưa có người bán vẫn tính.',
  }, { headers: { 'Cache-Control': 'private, no-store' } });
}

/** Chủ hệ thống: { userId, counted } — bật / tắt "Vẫn tính" cho một người không có hậu tố. */
export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  if (!isOwner(user)) return forbidden('Chỉ chủ hệ thống đổi danh sách tính doanh số.');
  const body = await request.json().catch(() => null) as { userId?: unknown; counted?: unknown } | null;
  const userId = typeof body?.userId === 'string' ? body.userId.trim() : '';
  if (!userId || userId.length > 80 || typeof body?.counted !== 'boolean') return Response.json({ error: 'Thiếu người hoặc lựa chọn.' }, { status: 400 });
  const known = await env.DB.prepare('SELECT MAX(name) AS name FROM pos_users WHERE user_id=?').bind(userId).first<{ name: string | null }>();
  if (!known?.name) return Response.json({ error: 'Không thấy người này trong danh sách nhân viên POS.' }, { status: 404 });
  const list = new Set(await readExtra());
  if (body.counted) list.add(userId); else list.delete(userId);
  await env.DB.prepare('INSERT INTO app_settings (key,value,updated_at) VALUES (?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at')
    .bind(COUNTED_STAFF_KEY, JSON.stringify([...list]), new Date().toISOString()).run();
  return Response.json({ ok: true, extra: [...list] }, { headers: auditHeaders(`${body.counted ? 'Vẫn tính doanh số' : 'Bỏ tính doanh số'}: ${known.name}`, 'staff.counted') });
}
