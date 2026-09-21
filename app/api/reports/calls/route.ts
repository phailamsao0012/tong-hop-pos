import { env } from 'cloudflare:workers';
import { getSessionUser, unauthorized } from '@/lib/auth';
import { POS } from '@/lib/report-model';
import { DATE_RE, addDays, vnRangeUtc } from '@/lib/report-time';
import { parseTeam, teamFilter } from '@/lib/team';
import { customerBackfillProgress } from '@/lib/customers-sync';
import { CLOSED } from '@/lib/stats';

// Cuộc gọi CSKH: mỗi ghi chú trên hồ sơ khách Pancake = một lần chăm sóc (cuộc gọi).
// Theo nhân viên (người viết ghi chú) và theo ngày (giờ VN): số ghi chú, số khách khác nhau, đơn chốt của khách đó trong ngày.
const VN_DAY = (col: string) => `date(datetime(${col},'+7 hours'))`;
const NET = 'COALESCE(o.net_total,COALESCE(o.current_total,0)-COALESCE(o.total_discount,0))';

export async function GET(request: Request) {
  if (!(await getSessionUser())) return unauthorized();
  const p = new URL(request.url).searchParams;
  const start = p.get('start') ?? '', end = p.get('end') ?? '';
  if (!DATE_RE.test(start) || !DATE_RE.test(end) || start > end) return Response.json({ error: 'Khoảng ngày không hợp lệ.' }, { status: 400 });
  const validPos = new Set<string>(POS.map((x) => x.id));
  const requested = (p.get('posIds') ?? '').split(',').filter(Boolean);
  if (requested.some((id) => !validPos.has(id))) return Response.json({ error: 'POS không hợp lệ.' }, { status: 400 });
  const posIds = requested.length ? requested : POS.map((x) => x.id);
  const team = parseTeam(p.get('team'));
  const { startUtc, endUtc } = vnRangeUtc(start, end);
  const ph = posIds.map(() => '?').join(',');
  const tf = teamFilter('n.author_id', team);
  const [daily, orders, names, assigned, coverage, cursors, unknownAuthors] = await env.DB.batch([
    // Ghi chú theo người viết × ngày.
    env.DB.prepare(`SELECT n.author_id, MAX(n.author_name) AS author_name, ${VN_DAY('n.created_at')} AS day, COUNT(*) AS notes, COUNT(DISTINCT n.pos_id||':'||COALESCE(n.customer_id,n.phone)) AS customers
      FROM customer_notes n WHERE n.pos_id IN (${ph}) AND n.created_at>=? AND n.created_at<?${tf} GROUP BY 1,3`).bind(...posIds, startUtc, endUtc),
    // Đơn chốt / doanh thu theo NGƯỜI BÁN trên đơn, ngày xác nhận lần đầu — cùng cách tính với Tổng quan POS và Pancake.
    env.DB.prepare(`SELECT o.seller_id AS author_id, ${VN_DAY('o.first_confirmed_at')} AS day, COUNT(*) AS orders, SUM(${NET}) AS net
      FROM raw_pos_orders o WHERE o.pos_id IN (${ph}) AND o.first_confirmed_at>=? AND o.first_confirmed_at<? AND o.${CLOSED} AND o.seller_id IS NOT NULL${teamFilter('o.seller_id', team)}
      GROUP BY 1,2`).bind(...posIds, startUtc, endUtc),
    env.DB.prepare("SELECT user_id, MAX(name) AS name, MAX(department) AS department FROM pos_users WHERE name<>'' GROUP BY user_id"),
    // Data đang cầm: số khách đang được phân công cho từng nhân viên (từ mục Khách hàng Pancake).
    env.DB.prepare(`SELECT assigned_user_id AS author_id, COUNT(*) AS assigned FROM pos_customers WHERE pos_id IN (${ph}) AND assigned_user_id IS NOT NULL${teamFilter('assigned_user_id', team)} GROUP BY 1`).bind(...posIds),
    env.DB.prepare(`SELECT (SELECT COUNT(*) FROM pos_customers WHERE pos_id IN (${ph})) AS customers, (SELECT COUNT(*) FROM customer_notes WHERE pos_id IN (${ph})) AS notes, (SELECT MIN(created_at) FROM customer_notes WHERE pos_id IN (${ph})) AS first_note, (SELECT MAX(fetched_at) FROM customer_notes WHERE pos_id IN (${ph})) AS last_fetch`).bind(...posIds, ...posIds, ...posIds, ...posIds),
    env.DB.prepare(`SELECT id, customer_cursor FROM pos_shops WHERE id IN (${ph})`).bind(...posIds),
    // Ghi chú trong kỳ mà người viết không khớp nhân viên nào (pos_users) → bị bỏ khi lọc Sale/CSKH; hiện để biết vì sao số lệch.
    env.DB.prepare(`SELECT COUNT(*) AS n, COUNT(DISTINCT author_name) AS authors FROM customer_notes WHERE pos_id IN (${ph}) AND created_at>=? AND created_at<? AND (author_id IS NULL OR author_id NOT IN (SELECT DISTINCT user_id FROM pos_users))`).bind(...posIds, startUtc, endUtc),
  ]);
  const nameMap = new Map((names.results as { user_id: string; name: string; department: string | null }[]).map((r) => [r.user_id, r]));
  const assignedMap = new Map((assigned.results as { author_id: string; assigned: number }[]).map((r) => [r.author_id, Number(r.assigned)]));
  const orderMap = new Map((orders.results as { author_id: string | null; day: string; orders: number; net: number }[]).map((r) => [`${r.author_id ?? ''}|${r.day}`, { orders: Number(r.orders), net: Number(r.net ?? 0) }]));
  const days: string[] = [];
  for (let d = start; d <= end; d = addDays(d, 1)) days.push(d);
  const staff = new Map<string, { authorId: string; name: string; department: string | null; assigned: number; notes: number; customers: number; orders: number; net: number; activeDays: number; byDay: Record<string, { notes: number; customers: number; orders: number; net: number }> }>();
  for (const r of daily.results as { author_id: string | null; author_name: string | null; day: string; notes: number; customers: number }[]) {
    const id = r.author_id ?? '';
    if (!staff.has(id)) staff.set(id, { authorId: id, name: nameMap.get(id)?.name ?? r.author_name ?? 'Không rõ', department: nameMap.get(id)?.department ?? null, assigned: assignedMap.get(id) ?? 0, notes: 0, customers: 0, orders: 0, net: 0, activeDays: 0, byDay: {} });
    const s = staff.get(id)!;
    const o = orderMap.get(`${id}|${r.day}`) ?? { orders: 0, net: 0 };
    s.byDay[r.day] = { notes: Number(r.notes), customers: Number(r.customers), orders: o.orders, net: o.net };
    s.notes += Number(r.notes); s.customers += Number(r.customers); s.orders += o.orders; s.net += o.net; s.activeDays += 1;
  }
  // Ngày có đơn chốt nhưng không có ghi chú: vẫn cộng vào tổng để khớp Tổng quan.
  for (const [key, o] of orderMap) {
    const [id, day] = key.split('|');
    if (!nameMap.has(id) && !staff.has(id)) continue;
    if (!staff.has(id)) staff.set(id, { authorId: id, name: nameMap.get(id)?.name ?? 'Không rõ', department: nameMap.get(id)?.department ?? null, assigned: assignedMap.get(id) ?? 0, notes: 0, customers: 0, orders: 0, net: 0, activeDays: 0, byDay: {} });
    const s = staff.get(id)!;
    if (s.byDay[day]) continue;
    s.byDay[day] = { notes: 0, customers: 0, orders: o.orders, net: o.net };
    s.orders += o.orders; s.net += o.net;
  }
  const cov = coverage.results[0] as { customers: number; notes: number; first_note: string | null; last_fetch: string | null };
  const unknown = unknownAuthors.results[0] as { n: number; authors: number } | undefined;
  return Response.json({
    period: { start, end, days },
    staff: [...staff.values()].sort((a, b) => b.notes - a.notes),
    coverage: {
      customers: Number(cov?.customers ?? 0), notes: Number(cov?.notes ?? 0), firstNote: cov?.first_note ?? null, lastFetch: cov?.last_fetch ?? null,
      backfill: customerBackfillProgress(cursors.results as { id: string; customer_cursor: string | null }[]),
      unknownAuthorNotes: Number(unknown?.n ?? 0), unknownAuthors: Number(unknown?.authors ?? 0),
    },
    definitions: {
      call: 'Cuộc gọi = một ghi chú nhân viên viết trên hồ sơ khách ở Pancake (mục Khách hàng), tính theo người viết và giờ viết (giờ VN). "Số khách" = số khách khác nhau được ghi chú trong ngày.',
      orders: 'Đơn chốt / Doanh thu = đơn có người bán là nhân viên đó, tính theo ngày xác nhận lần đầu, cùng cách tính với Tổng quan POS và Pancake (không tính Mới/Chờ XN/Hủy). AOV = doanh thu ÷ số đơn.',
      assigned: 'Data đang cầm = số khách đang được phân công cho nhân viên trong mục Khách hàng Pancake (cập nhật theo đồng bộ khách hàng).',
      coverage: 'Ghi chú được gom từ API khách hàng (khách vừa thay đổi vài phút một lần, và duyệt lại toàn bộ danh sách vài giờ một vòng vì khoảng 1/5 ghi chú mới không làm đổi thời điểm cập nhật của khách trên Pancake) và từ dữ liệu khách kèm trong đơn hàng. Những ngày trước khi bật đồng bộ chỉ có ghi chú mà Pancake còn trả về trong hồ sơ khách.',
    },
  }, { headers: { 'Cache-Control': 'private, no-store' } });
}
