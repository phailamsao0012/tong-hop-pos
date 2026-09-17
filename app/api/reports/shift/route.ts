import { env } from 'cloudflare:workers';
import { getSessionUser, unauthorized } from '@/lib/auth';
import { normalizePhone } from '@/lib/customer-stats';
import { hotCloseByEmployee } from '@/lib/hot-close';
import { POS } from '@/lib/report-model';
import { DATE_RE, addDays, todayVn } from '@/lib/report-time';
import { NOT_CLOSED } from '@/lib/stats';
import { parseTeam, teamFilter } from '@/lib/team';

// Điều hành trong ca: số nhận / số chốt nóng theo SĐT trong khung giờ của một ngày (giờ VN),
// so với cùng khung giờ hôm trước; diễn biến theo giờ; hoạt động xác nhận mới nhất; cảnh báo.
const SHIFTS: Record<string, [number, number]> = { morning: [8, 12], afternoon: [12, 17], evening: [17, 22], day: [0, 24] };
const utcAt = (date: string, hour: number) => new Date(Date.parse(`${date}T00:00:00+07:00`) + hour * 3600000).toISOString().slice(0, 19);
const CLOSED_SQL = `status_code NOT IN (${NOT_CLOSED.join(',')})`;
const NET = 'COALESCE(net_total,COALESCE(current_total,0)-COALESCE(total_discount,0))';

export async function GET(request: Request) {
  if (!(await getSessionUser())) return unauthorized();
  const p = new URL(request.url).searchParams;
  const today = todayVn();
  const date = p.get('date') || today;
  if (!DATE_RE.test(date) || date > today) return Response.json({ error: 'Ngày không hợp lệ.' }, { status: 400 });
  const validPos = new Set<string>(POS.map((x) => x.id));
  const requested = (p.get('posIds') ?? '').split(',').filter(Boolean);
  if (requested.some((id) => !validPos.has(id))) return Response.json({ error: 'POS không hợp lệ.' }, { status: 400 });
  const posIds = requested.length ? requested : POS.map((x) => x.id);
  const shiftKey = p.get('shift') ?? 'auto';
  const nowHourVn = (new Date(Date.now() + 7 * 3600000).getUTCHours());
  const autoShift = nowHourVn < 12 ? 'morning' : nowHourVn < 17 ? 'afternoon' : 'evening';
  const shift = shiftKey in SHIFTS ? shiftKey : autoShift;
  const [h0, h1] = SHIFTS[shift];
  const startUtc = utcAt(date, h0), endUtc = utcAt(date, h1);
  const yesterday = addDays(date, -1);
  const yStart = utcAt(yesterday, h0), yEnd = utcAt(yesterday, h1);
  const dayStart = utcAt(date, 0), dayEnd = utcAt(date, 24);
  const team = parseTeam(p.get('team'));
  const tf = teamFilter('__COL__', team);
  const db = env.DB;
  const ph = posIds.map(() => '?').join(',');

  const [assigned, confirmed, pending, names, shops, employees, yEmployees] = await Promise.all([
    db.prepare(`SELECT pos_id, phone, seller_id, seller_assigned_at FROM raw_pos_orders WHERE pos_id IN (${ph}) AND seller_assigned_at>=? AND seller_assigned_at<? AND status_code<>7${tf.replace('__COL__', 'seller_id')}`).bind(...posIds, startUtc, endUtc).all<{ pos_id: string; phone: string | null; seller_id: string | null; seller_assigned_at: string }>(),
    db.prepare(`SELECT id, source_order_id, pos_id, phone, customer_name, COALESCE(first_confirmed_by,seller_id) AS closer_id, first_confirmed_at, ${NET} AS net, status_code FROM raw_pos_orders WHERE pos_id IN (${ph}) AND first_confirmed_at>=? AND first_confirmed_at<? AND ${CLOSED_SQL}${tf.replace('__COL__', 'COALESCE(first_confirmed_by,seller_id)')} ORDER BY first_confirmed_at DESC`).bind(...posIds, startUtc, endUtc).all<{ id: string; source_order_id: string; pos_id: string; phone: string | null; customer_name: string | null; closer_id: string | null; first_confirmed_at: string; net: number; status_code: number }>(),
    // Đơn giao trong ngày còn Mới / chờ xác nhận theo người bán.
    db.prepare(`SELECT seller_id, COUNT(*) AS n FROM raw_pos_orders WHERE pos_id IN (${ph}) AND seller_assigned_at>=? AND seller_assigned_at<? AND status_code IN (0,17) AND seller_id IS NOT NULL${tf.replace('__COL__', 'seller_id')} GROUP BY seller_id`).bind(...posIds, dayStart, dayEnd).all<{ seller_id: string; n: number }>(),
    db.prepare("SELECT user_id, MAX(name) AS name, MAX(department) AS department FROM pos_users WHERE name<>'' GROUP BY user_id").all<{ user_id: string; name: string; department: string | null }>(),
    db.prepare(`SELECT id, last_sync_at, status, last_error FROM pos_shops WHERE id IN (${ph})`).bind(...posIds).all<{ id: string; last_sync_at: string | null; status: string; last_error: string | null }>(),
    hotCloseByEmployee(db, posIds, startUtc, endUtc, [], tf),
    hotCloseByEmployee(db, posIds, yStart, yEnd, [], tf),
  ]);
  const nameMap = new Map(names.results.map((r) => [r.user_id, r]));
  const who = (id: string | null) => id ? nameMap.get(id)?.name ?? `NV ${id.slice(0, 8)}` : 'Chưa gán';

  // Theo giờ (giờ VN): số nhận = SĐT khác nhau được giao trong giờ; số chốt = đơn xác nhận lần đầu trong giờ.
  const hourOf = (iso: string) => (new Date(Date.parse(`${iso}Z`) + 7 * 3600000).getUTCHours());
  const hours = Array.from({ length: h1 - h0 }, (_, i) => ({ hour: `${String(h0 + i).padStart(2, '0')}:00`, received: 0, closed: 0, value: 0 }));
  const seenPhones = new Set<string>();
  for (const a of assigned.results) {
    const phone = normalizePhone(a.phone);
    if (!phone) continue;
    const key = `${a.pos_id}:${phone}`;
    if (seenPhones.has(key)) continue;
    seenPhones.add(key);
    const h = hourOf(a.seller_assigned_at) - h0;
    if (hours[h]) hours[h].received++;
  }
  for (const c of confirmed.results) {
    const h = hourOf(c.first_confirmed_at) - h0;
    if (hours[h]) { hours[h].closed++; hours[h].value += Number(c.net); }
  }
  const sum = (rows: Awaited<ReturnType<typeof hotCloseByEmployee>>) => rows.reduce((a, r) => ({ received: a.received + r.received, closed: a.closed + r.closed, hotOrders: a.hotOrders + r.hotOrders, hotValue: a.hotValue + r.hotValue, activityOrders: a.activityOrders + r.activityOrders, activityValue: a.activityValue + r.activityValue }), { received: 0, closed: 0, hotOrders: 0, hotValue: 0, activityOrders: 0, activityValue: 0 });
  const total = sum(employees), yTotal = sum(yEmployees);
  const pendingMap = new Map(pending.results.map((r) => [r.seller_id, Number(r.n)]));
  const yMap = new Map(yEmployees.map((r) => [r.employeeId, r]));
  const staff = employees.map((r) => ({
    ...r, name: who(r.employeeId), department: nameMap.get(r.employeeId)?.department ?? null,
    pending: pendingMap.get(r.employeeId) ?? 0,
    posIds: [...new Set(assigned.results.filter((a) => a.seller_id === r.employeeId).map((a) => a.pos_id))],
    yesterday: yMap.get(r.employeeId) ? { received: yMap.get(r.employeeId)!.received, closed: yMap.get(r.employeeId)!.closed, rate: yMap.get(r.employeeId)!.rate } : null,
  }));
  // Cảnh báo.
  const now = Date.now();
  const alerts: { kind: 'rate' | 'sync' | 'overload' | 'error'; level: 'high' | 'medium'; title: string; detail: string; at: string | null }[] = [];
  for (const s of staff) {
    if (s.received >= 10 && (s.rate ?? 0) < 40) alerts.push({ kind: 'rate', level: 'high', title: 'Tỷ lệ chốt thấp', detail: `${s.name} đang dưới 40% (${(s.rate ?? 0).toFixed(1).replace('.', ',')}% · ${s.closed}/${s.received} số)`, at: null });
    if (s.pending >= 20) alerts.push({ kind: 'overload', level: 'medium', title: 'Nhân viên quá tải', detail: `${s.name} đang có ${s.pending} đơn chờ xác nhận trong ngày`, at: null });
  }
  for (const s of shops.results) {
    const age = s.last_sync_at ? now - Date.parse(s.last_sync_at) : Infinity;
    if (s.last_error) alerts.push({ kind: 'error', level: 'high', title: 'Lỗi đồng bộ', detail: `${POS.find((x) => x.id === s.id)?.name ?? s.id}: ${s.last_error.slice(0, 120)}`, at: s.last_sync_at });
    else if (age > 15 * 60000) alerts.push({ kind: 'sync', level: 'medium', title: 'Đồng bộ chậm', detail: `${POS.find((x) => x.id === s.id)?.name ?? s.id} chưa đồng bộ trong ${Math.round(age / 60000)} phút`, at: s.last_sync_at });
  }
  return Response.json({
    date, shift, hours: { start: h0, end: h1 }, shifts: SHIFTS, isToday: date === today,
    generatedAt: new Date().toISOString(),
    syncedAt: shops.results.map((s) => s.last_sync_at).filter(Boolean).sort().at(-1) ?? null,
    total: { ...total, rate: total.received ? total.closed / total.received * 100 : null },
    yesterday: { ...yTotal, rate: yTotal.received ? yTotal.closed / yTotal.received * 100 : null },
    hourly: hours,
    staff: staff.sort((a, b) => b.received - a.received || b.closed - a.closed),
    feed: confirmed.results.slice(0, 15).map((c) => ({ id: c.id, orderId: c.source_order_id, posId: c.pos_id, posName: POS.find((x) => x.id === c.pos_id)?.name ?? c.pos_id, phone: c.phone, customer: c.customer_name, closer: who(c.closer_id), at: c.first_confirmed_at, net: Number(c.net) })),
    alerts: alerts.sort((a, b) => (a.level === b.level ? 0 : a.level === 'high' ? -1 : 1)),
    definitions: {
      received: 'Số nhận = SĐT khác nhau được giao cho nhân viên trong khung giờ (theo thời điểm giao người bán).',
      closed: 'Số chốt nóng = trong các SĐT đó, SĐT có đơn được xác nhận lần đầu trong khung giờ bởi chính nhân viên được giao; một SĐT nhiều đơn chỉ tính một.',
      value: 'Giá trị hiện tại = tổng doanh thu (sau giảm trừ) của các đơn chốt nóng, theo trạng thái lúc đồng bộ; không phải doanh thu Pancake.',
      activity: 'Hoạt động xác nhận = mọi đơn được xác nhận lần đầu trong khung giờ, kể cả SĐT không được giao trong khung.',
    },
  }, { headers: { 'Cache-Control': 'private, no-store' } });
}
