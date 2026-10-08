import { env } from 'cloudflare:workers';
import { getSessionUser, unauthorized } from '@/lib/auth';
import { POS } from '@/lib/report-model';
import { DATE_RE, vnRangeUtc } from '@/lib/report-time';
import { teamOf } from '@/lib/team';
import { buildVanDon, deptFor, type VdPerson, type VdRow } from '@/lib/van-don';

// Đo team Vận đơn, xem lib/van-don.ts. Đơn chốt trong kỳ theo ngày chốt (lần đầu vào Chờ xác nhận), xét trạng thái hiện tại.
const NET = 'COALESCE(o.net_total,COALESCE(o.current_total,0)-COALESCE(o.total_discount,0))';
// Đã qua bước Đã xác nhận: có giờ xác nhận, hoặc đang ở trạng thái sau đó (đơn thiếu lịch sử).
const CONFIRMED = 'CASE WHEN o.first_confirmed_at IS NOT NULL OR o.status_code NOT IN (17,6) THEN 1 ELSE 0 END';
// Người bấm hủy (bước hủy gần nhất trong lịch sử), chỉ cho đơn hủy khi chưa xác nhận.
const CANCEL_BY = `CASE WHEN o.status_code=6 AND o.first_confirmed_at IS NULL THEN (SELECT json_extract(h.value,'$.editor_id') FROM json_each(o.status_history_json) h
  WHERE json_extract(h.value,'$.status')=6 ORDER BY json_extract(h.value,'$.updated_at') DESC LIMIT 1) END`;
/** Lý do không xác nhận được: thẻ đơn Pancake bắt đầu bằng "VĐ" hoặc "Vận đơn" (vd "VĐ: Không nghe máy"). */
const REASON = `CASE WHEN o.status_code=6 AND o.first_confirmed_at IS NULL THEN (SELECT TRIM(SUBSTR(json_extract(t.value,'$.name'), INSTR(json_extract(t.value,'$.name'), ':')+1))
  FROM json_each(CASE WHEN json_valid(o.tags_json) THEN o.tags_json ELSE '[]' END) t WHERE json_extract(t.value,'$.name') LIKE 'VĐ:%' OR json_extract(t.value,'$.name') LIKE 'Vận đơn:%' LIMIT 1) END`;

export async function GET(request: Request) {
  if (!(await getSessionUser())) return unauthorized();
  const p = new URL(request.url).searchParams;
  const start = p.get('start') ?? '', end = p.get('end') ?? '';
  if (!DATE_RE.test(start) || !DATE_RE.test(end) || start > end) return Response.json({ error: 'Khoảng ngày không hợp lệ.' }, { status: 400 });
  const validPos = new Set<string>(POS.map((x) => x.id));
  const requested = (p.get('posIds') ?? '').split(',').filter(Boolean);
  if (requested.some((id) => !validPos.has(id))) return Response.json({ error: 'POS không hợp lệ.' }, { status: 400 });
  const posIds = requested.length ? requested : POS.map((x) => x.id);
  const { startUtc, endUtc } = vnRangeUtc(start, end);
  const ph = posIds.map(() => '?').join(',');
  const [orders, hr, depts, users, sync] = await env.DB.batch([
    env.DB.prepare(`SELECT o.seller_id, o.first_confirmed_by AS confirm_by, ${CANCEL_BY} AS cancel_by, ${CONFIRMED} AS confirmed, o.status_code, ${REASON} AS reason,
        COUNT(*) AS n, COALESCE(SUM(${NET}),0) AS net
      FROM raw_pos_orders o WHERE o.pos_id IN (${ph}) AND o.first_closed_at>=? AND o.first_closed_at<? AND o.status_code NOT IN (0,7)
      GROUP BY 1, 2, 3, 4, 5, 6`).bind(...posIds, startUtc, endUtc),
    env.DB.prepare('SELECT pos_user_id, employee_name, team, department, department_id FROM hr_pos_team'),
    env.DB.prepare('SELECT id, name, parent_id FROM hr_departments'),
    env.DB.prepare(`SELECT user_id, MAX(name) AS name, MAX(department) AS department FROM pos_users WHERE pos_id IN (${ph}) GROUP BY user_id`).bind(...posIds),
    env.DB.prepare(`SELECT MAX(last_sync_at) AS at FROM pos_shops WHERE id IN (${ph})`).bind(...posIds),
  ]);
  const deptRows = new Map((depts.results as { id: string; name: string; parent_id: string | null }[]).map((d) => [d.id, d]));
  const chain = (id: string | null) => {
    const names: string[] = [];
    for (let d = id ? deptRows.get(id) : undefined; d && names.length < 6; d = d.parent_id ? deptRows.get(d.parent_id) : undefined) names.push(d.name);
    return names;
  };
  const people = new Map<string, VdPerson>();
  for (const u of users.results as { user_id: string; name: string | null; department: string | null }[]) {
    const t = teamOf(u.department);
    people.set(u.user_id, { id: u.user_id, name: u.name || u.user_id, team: u.department ?? '', dept: t === 'sale' ? 'Sale' : t === 'cskh' ? 'CSKH' : deptFor(null, [u.department ?? '']) });
  }
  // Web nhân sự (nếu đã gắn) thắng bộ phận trên Pancake: team = đơn vị trực tiếp, bộ phận theo team Sale / CSKH hoặc phòng Vận đơn.
  for (const h of hr.results as { pos_user_id: string; employee_name: string; team: string | null; department: string | null; department_id: string | null }[]) {
    people.set(h.pos_user_id, { id: h.pos_user_id, name: h.employee_name, team: h.department ?? '', dept: deptFor(h.team, chain(h.department_id)) });
  }
  return Response.json({
    period: { start, end }, syncedAt: (sync.results[0] as { at?: string | null } | undefined)?.at ?? null,
    ...buildVanDon(orders.results as VdRow[], people),
    definitions: {
      'Người chốt': 'Người bán trên đơn (Sale hoặc CSKH). Đơn chốt = từ Chờ xác nhận trở đi, theo ngày chốt.',
      'Người xác nhận': 'Người bấm Đã xác nhận lần đầu trên Pancake (thường là Vận đơn gọi khách). Đơn không xác nhận được tính cho người bấm hủy.',
      'Không xác nhận được': 'Đơn bị hủy khi đang Chờ xác nhận. Lý do lấy từ thẻ đơn dạng "VĐ: <lý do>".',
      'Tỷ lệ hoàn': 'Đơn hoàn ÷ đơn đã gửi đi (đang giao, đã nhận, hoàn).',
    },
  });
}
