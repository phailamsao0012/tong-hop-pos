import { addDays, COMPANY_START, daysBetween, vnRangeUtc } from '@/lib/shared/report-time';
import { validAiDate } from '@/lib/ai/ai-pack';
import { COUNTED_STAFF } from '@/lib/teams/team';
import { advisorReasonQuery, classifyReason } from '@/lib/bot/advisor';
import { POS } from '@/lib/shared/report-model';
import { STATUS_GROUPS } from '@/lib/reports/stats';
import { readForecast } from '@/lib/kpi/forecast-run';

const header = 'ma;bo_phan;team;so_chia;chot_tu_so;don_chot;doanh_thu_tr;hoan';
const money = (n: number | null) => n === null ? 'thieu' : (Number(n) / 1_000_000).toFixed(1);
const code = (s: string) => /^[A-Za-z0-9_-]{1,100}$/.test(s) ? s : '';
export const monday = (d: string) => addDays(d, -((new Date(`${d}T00:00:00Z`).getUTCDay() + 6) % 7));
type Row = { day: string; ma: string; dept: string; team: string; assigned: number; assignedClosed: number; closed: number; net: number; returned: number };
export async function peopleCsv(db: D1Database, start: string, end: string, ids: string[] | null, group: 'ngay' | 'tuan' | 'ca_ky', maxRows?: number) {
  const filter = ids ? ` AND seller_id IN (${ids.map(() => '?').join(',') || 'NULL'})` : '';
  const period = group === 'tuan' ? "date(day,'-' || ((CAST(strftime('%w',day) AS INTEGER)+6)%7) || ' days')" : group === 'ca_ky' ? "'ca_ky'" : 'day';
  const rows = await db.prepare(`SELECT ${period} AS day,seller_id AS ma,
    COALESCE((SELECT team FROM hr_pos_team WHERE pos_user_id=seller_id LIMIT 1),'other') AS dept,
    COALESCE((SELECT department_id FROM hr_pos_team WHERE pos_user_id=seller_id LIMIT 1),'') AS team,
    SUM(assigned_orders) AS assigned,SUM(assigned_closed_orders) AS assignedClosed,SUM(closed_orders) AS closed,SUM(closed_net) AS net,SUM(returned_orders) AS returned
    FROM stats_daily WHERE pos_id IN (${POS.map(() => '?').join(',')}) AND day>=? AND day<=? AND seller_id IN ${COUNTED_STAFF}${filter}
    GROUP BY 1,seller_id ORDER BY 1,seller_id${maxRows ? ` LIMIT ${maxRows + 1}` : ''}`).bind(...POS.map(p => p.id), start, end, ...(ids ?? [])).all<Row>();
  if (maxRows && rows.results.length > maxRows) throw new Error('Kết quả vượt 3.000 dòng; hãy thu hẹp phạm vi');
  return [`${group === 'tuan' ? 'tuan' : group === 'ngay' ? 'ngay' : 'ky'};${header}`, ...rows.results.map(r => [r.day, code(r.ma), ['sale','cskh','mkt'].includes(r.dept) ? r.dept : 'other', code(r.team), Number(r.assigned), Number(r.assignedClosed), Number(r.closed), money(r.net), Number(r.returned)].join(';'))].join('\n');
}
export async function hoursCsv(db: D1Database, start: string, end: string, ids: string[] | null) {
  const range = vnRangeUtc(start, end), filter = ` AND seller_id IN ${COUNTED_STAFF}` + (ids ? ` AND seller_id IN (${ids.map(() => '?').join(',') || 'NULL'})` : '');
  const notClosed = [...STATUS_GROUPS.new, ...STATUS_GROUPS.cancelled].join(',');
  const slot = (col: string) => `((CAST(strftime('%w',${col},'+7 hours') AS INTEGER)+6)%7)+2 AS thu,CAST(strftime('%H',${col},'+7 hours') AS INTEGER) AS gio`;
  const assigned = await db.prepare(`SELECT ${slot('seller_assigned_at')},COUNT(*) AS a,SUM(first_closed_at IS NOT NULL AND status_code NOT IN (${notClosed})) AS c,0 AS net FROM raw_pos_orders WHERE pos_id IN (${POS.map(() => '?').join(',')}) AND seller_assigned_at>=? AND seller_assigned_at<?${filter} GROUP BY 1,2`).bind(...POS.map(p => p.id), range.startUtc, range.endUtc, ...(ids ?? [])).all<{ thu: number; gio: number; a: number; c: number; net: number }>();
  const closed = await db.prepare(`SELECT ${slot('first_closed_at')},0 AS a,0 AS c,COALESCE(SUM(CASE WHEN status_code<>6 THEN COALESCE(net_total,COALESCE(current_total,0)-COALESCE(total_discount,0)) END),0) AS net FROM raw_pos_orders WHERE pos_id IN (${POS.map(() => '?').join(',')}) AND first_closed_at>=? AND first_closed_at<? AND status_code NOT IN (0,7)${filter} GROUP BY 1,2`).bind(...POS.map(p => p.id), range.startUtc, range.endUtc, ...(ids ?? [])).all<{ thu: number; gio: number; a: number; c: number; net: number }>();
  const cells = new Map<string, { thu: number; gio: number; a: number; c: number; net: number }>();
  for (const r of [...assigned.results, ...closed.results]) {
    const key = `${r.thu}:${r.gio}`, cell = cells.get(key) ?? { thu: r.thu, gio: r.gio, a: 0, c: 0, net: 0 };
    cell.a += Number(r.a); cell.c += Number(r.c); cell.net += Number(r.net); cells.set(key, cell);
  }
  return ['thu;gio;so_chia;chot_tu_so;doanh_thu_tr', ...[...cells.values()].filter(r => r.a || r.c || r.net).sort((a,b) => a.thu-b.thu || a.gio-b.gio).map(r => [r.thu === 8 ? 'CN' : `T${r.thu}`, r.gio, r.a, r.c, money(r.net)].join(';'))].join('\n');
}
const definitions = `Định nghĩa — toàn công ty, mọi POS, chỉ người được tính MKT / CSKH / SALE; nhân sự theo bản chép hiện tại.
so;dinh_nghia
số được chia;số điện thoại được giao trong ngày
chốt trong số chia;trong số đó đã chốt
đơn chốt;theo ngày xác nhận lần đầu
doanh thu;tiền đơn chốt sau giảm trừ, triệu đồng, 1 chữ số thập phân
hoàn;đơn hoàn
tỷ lệ chốt;chốt trong số chia / số được chia`;
export function limitAskPack(weeks: { week: string; csv: string }[], rest: string, max = 200_000) {
  const kept = [...weeks], notices: string[] = [];
  const render = () => [definitions, 'Theo tuần — 8 tuần đủ gần nhất', ...kept.map(w => w.csv), ...notices, rest].join('\n');
  while (render().length > max && kept.length) notices.push(`đã bỏ tuần ${kept.shift()!.week} vì gói quá lớn`);
  if (render().length > max) throw new Error('Gói số còn quá lớn; không cắt im lặng');
  return render();
}
const packs = new WeakMap<D1Database, { today: string; pack: Promise<string> }>();
export function cachedAskPack(db: D1Database, today: string) {
  const old = packs.get(db);
  if (old?.today === today) return old.pack;
  const pack = buildAskPack(db, today);
  const entry = { today, pack };
  packs.set(db, entry);
  void pack.catch(() => { if (packs.get(db) === entry) packs.delete(db); });
  return pack;
}
export async function buildAskPack(db: D1Database, today: string) {
  if (!validAiDate(today)) throw new Error('Ngày không hợp lệ');
  const end = addDays(today, -1), start = addDays(today, -14), weeks = [];
  for (let i = 8; i >= 1; i--) {
    const week = addDays(monday(today), -7*i);
    weeks.push({ week, csv: await peopleCsv(db, week, addDays(week,6), null, 'tuan') });
  }
  const q = advisorReasonQuery(POS.map(p => p.id), start, end, ` AND o.seller_id IN ${COUNTED_STAFF}`);
  const reasons = await db.prepare(q.sql).bind(...q.binds).all<{ id: string; staff: string; messages: string }>();
  const counts = new Map<string, number>();
  for (const r of new Map(reasons.results.map(r => [r.id,r])).values()) {
    // Chỉ nhãn cố định được xuất, không xuất nhãn cấu hình tự do hoặc ghi chú gốc.
    const key = `${code(r.staff)};${classifyReason(r.messages)}`;
    counts.set(key, (counts.get(key) ?? 0)+1);
  }
  // Cùng nguồn daily của Chi phí & ROAS, chỉ đọc; không gọi ensureAdCostSchema.
  const costs = await db.prepare('SELECT day,SUM(amount) AS amount FROM ad_costs WHERE day>=? AND day<=? GROUP BY day ORDER BY day').bind(start,end).all<{ day: string; amount: number }>();
  const rest = ['Theo ngày — 14 ngày đến hôm qua', await peopleCsv(db,start,end,null,'ngay'), 'Giờ vàng — 28 ngày đến hôm qua', await hoursCsv(db,addDays(today,-28),end,null), 'Lý do chưa chốt — 14 ngày', 'ma;ly_do;so_don', ...[...counts].sort(([a],[b]) => a < b ? -1 : a > b ? 1 : 0).map(([k,n]) => `${k};${n}`), 'Chi phí MKT — toàn công ty, triệu đồng', 'ngay;chi_phi_tr', ...costs.results.map(r => `${r.day};${money(r.amount)}`)].join('\n');
  return limitAskPack(weeks,rest);
}
export async function todayAskPack(db: D1Database, today: string) {
  const last = (await readForecast(db,today))?.points.at(-1);
  return ['Hôm nay — toàn công ty, triệu đồng', 'ngay;gio;actual;today;week', [today,last?.t ?? 'thieu',money(last?.actual ?? null),money(last?.today ?? null),money(last?.week ?? null)].join(';'), await peopleCsv(db,today,today,null,'ngay')].join('\n');
}
export async function runAskTool(db: D1Database, today: string, name: string, input: unknown) {
  try {
    if (name !== 'so_lieu_nguoi' && name !== 'gio_vang') throw new Error('Công cụ không hợp lệ');
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Tham số không hợp lệ');
    const r = input as Record<string, unknown>, expected = name === 'so_lieu_nguoi' ? ['tu','den','ma_nv','gom'] : ['tu','den','ma_nv'];
    if (Object.keys(r).length !== expected.length || expected.some(k => !Object.hasOwn(r,k))) throw new Error('Tham số không hợp lệ');
    const { tu, den, ma_nv: ids } = r;
    if (typeof tu !== 'string' || typeof den !== 'string' || !validAiDate(tu) || !validAiDate(den) || tu < COMPANY_START || den > today || tu > den || daysBetween(tu,den) > (name === 'gio_vang' ? 31 : 92)) throw new Error('Khoảng ngày không hợp lệ hoặc quá dài');
    if (ids !== null && (!Array.isArray(ids) || ids.length > 80 || !ids.every(id => typeof id === 'string' && code(id)))) throw new Error('Mã nhân viên không hợp lệ');
    if (name === 'so_lieu_nguoi' && !['ngay','tuan','ca_ky'].includes(String(r.gom))) throw new Error('Cách gộp không hợp lệ');
    const content = name === 'gio_vang' ? await hoursCsv(db,tu,den,ids as string[] | null) : await peopleCsv(db,tu,den,ids as string[] | null,r.gom as 'ngay' | 'tuan' | 'ca_ky',3000);
    return { content, is_error: false };
  } catch (error) {
    return { content: error instanceof Error && /^(Khoảng|Mã|Cách|Tham số|Công cụ|Kết quả)/.test(error.message) ? error.message : 'Không đọc được số liệu', is_error: true };
  }
}
