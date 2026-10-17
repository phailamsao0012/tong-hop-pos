import { addDays, daysBetween, todayVn, vnRangeUtc } from './report-time';
import { teamFilter, WORKING } from './team';
import type { TrendOptions, TrendDept, TrendPoint } from './trend-period';
import { POS } from './report-model';

export const REASON_KEYWORDS: Record<string, string[]> = {
  'Không có nhu cầu': ['khong nhu cau', 'khong co nhu cau', 'chua can', 'khong can'],
  'Giá cao': ['dat', 'gia cao', 'dat qua'],
  'Đã mua chỗ khác': ['mua cho khac', 'mua noi khac'],
  'Chưa có tiền': ['chua co tien', 'het tien'],
  'Không nghe máy / thuê bao': ['khong nghe may', 'thue bao'],
  'Sai số / không đặt': ['sai so', 'khong dat'],
  'Để suy nghĩ / hẹn lại': ['suy nghi', 'hen lai'],
  'Hàng / hiệu quả': ['hieu qua', 'chat luong', 'hang loi'],
};
const normalize = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'd').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
export function reasonKeywords(raw?: string): Record<string, string[]> {
  try {
    const value: unknown = JSON.parse(raw ?? 'null');
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      const entries = Object.entries(value).filter(([k, v]) => k.length <= 80 && Array.isArray(v) && v.length <= 50 && v.every((x) => typeof x === 'string' && x.length > 0 && x.length <= 100));
      if (entries.length && entries.length <= 30) return Object.fromEntries(entries) as Record<string, string[]>;
    }
  } catch { /* dùng mặc định khi cấu hình hỏng */ }
  return REASON_KEYWORDS;
}
export function classifyReason(message: string, keywords = REASON_KEYWORDS) {
  const text = ` ${normalize(message)} `;
  return Object.entries(keywords).flatMap(([reason, words]) => words.map((word) => ({ reason, word: normalize(word) }))).filter(({ word }) => word && text.includes(` ${word} `)).sort((a, b) => b.word.length - a.word.length)[0]?.reason ?? 'Khác';
}
export type LoadDay = { assigned: number; closed: number };
export function saleCapacity(rows: LoadDay[], have: number, leadsDaily: number | null) {
  const buckets = [{ label: '1–20', max: 20 }, { label: '21–35', max: 35 }, { label: '36–50', max: 50 }, { label: '>50', max: Infinity }].map((b, i, all) => {
    const sample = rows.filter((r) => r.assigned > (i ? all[i - 1].max : 0) && r.assigned <= b.max && r.closed >= 0 && r.closed <= r.assigned);
    const assigned = sample.reduce((n, r) => n + r.assigned, 0), closed = sample.reduce((n, r) => n + r.closed, 0);
    return { label: b.label, max: Number.isFinite(b.max) ? b.max : null, days: sample.length, assigned, closed, rate: assigned ? closed / assigned : null };
  });
  // Không chọn khoảng mở >50 làm sức chứa, cũng không học từ vài ngày lẻ.
  const best = buckets.filter((b) => b.max !== null && b.days >= 10 && b.assigned >= 100 && b.rate !== null).sort((a, b) => b.rate! - a.rate! || a.max! - b.max!)[0];
  return { have, leadsDaily, load: have > 0 && leadsDaily !== null ? leadsDaily / have : null, buckets,
    need: best && have > 0 && leadsDaily !== null && leadsDaily > 0 ? Math.ceil(leadsDaily / best.max!) : null,
    best: best?.label ?? null };
}
export function careCapacity(have: number, due: number | null, notes: number, days: number, backlog: number[]) {
  const increasing = backlog.length === 4 && backlog.every((n) => Number.isFinite(n) && n >= 0) && backlog.slice(1).every((n, i) => n > backlog[i]);
  const perPerson = have > 0 && days > 0 ? notes / days / have : null;
  return { have, due, notes, days, notesPerPerson: perPerson, duePerPerson: have > 0 && due !== null ? due / have : null,
    hire: due !== null && have > 0 && perPerson !== null && perPerson > 0 && increasing ? Math.max(0, Math.ceil(due / perPerson) - have) : null };
}
export function staffGap(have: number, need: number | null) {
  if (need === null) return { kind: 'unknown' } as const;
  if (have > need) return { kind: 'over', n: have - need } as const;
  if (have < need) return { kind: 'short', n: need - have } as const;
  return { kind: 'even' } as const;
}
export function bucketBars(buckets: { label: string; rate: number | null }[], best: string | null) {
  const max = Math.max(0, ...buckets.map(b => b.rate ?? 0));
  return buckets.map(b => ({ ...b, height: max ? (b.rate ?? 0) / max : 0, best: b.label === best, enough: b.rate !== null }));
}
export function reasonBars(groups: { reason: string; count: number }[], max = 5) {
  const sorted = groups.filter(g => g.count > 0 && g.reason !== 'Khác').sort((a, b) => b.count - a.count);
  const rows = sorted.slice(0, max).map(g => ({ ...g }));
  const other = sorted.slice(max).reduce((n, g) => n + g.count, 0) + groups.filter(g => g.reason === 'Khác').reduce((n, g) => n + g.count, 0);
  if (other > 0) rows.push({ reason: 'Khác', count: other });
  const largest = Math.max(0, ...rows.map(g => g.count));
  return rows.map(g => ({ ...g, share: largest ? g.count / largest : 0 }));
}
export type AdvisorViz = {
  sale: ReturnType<typeof saleCapacity> | null;
  cskh: { have: number; notes: number; days: number; notesPerPerson: number | null } | null;
  mkt: { open: boolean; actual: number; forecast: number | null } | null;
};
export type AdvisorItem = { dept: TrendDept; title: string; value: string; why: string };
export type ReasonRow = { id: string; staff: string; team: string; messages: string };
export function reasonSummary(rows: ReasonRow[], keywords = REASON_KEYWORDS, company?: ReasonRow[]) {
  const classify = (xs: ReasonRow[]) => xs.map((r) => ({ ...r, reason: classifyReason(r.messages, keywords) }));
  const unique = (xs: ReasonRow[]) => [...new Map(xs.map((r) => [r.id, r])).values()];
  const selected = classify(unique(rows)), baseline = company ? classify(unique(company)) : null;
  const classified = selected.filter((r) => r.reason !== 'Khác').length;
  const groups = [...new Set([...Object.keys(keywords), 'Khác'])].map((reason) => {
    const matches = selected.filter((r) => r.reason === reason);
    const companyRate = baseline?.length ? baseline.filter((r) => r.reason === reason).length / baseline.length : null;
    const outliers = (kind: 'staff' | 'team') => [...new Set(matches.map((r) => r[kind]))].filter(Boolean).flatMap((id) => {
      const n = matches.filter((r) => r[kind] === id).length, total = selected.filter((r) => r[kind] === id).length;
      return companyRate !== null && companyRate > 0 && n >= 10 && n / total >= companyRate * 1.5 ? [{ kind, id, count: n, total, companyRate }] : [];
    });
    return { reason, count: matches.length, outliers: reason === 'Khác' ? [] : [...outliers('staff'), ...outliers('team')] };
  }).filter((g) => g.count > 0);
  return { total: selected.length, classified, coverage: selected.length ? classified / selected.length : null, groups };
}

/** Chỉ các đơn có mốc chốt trong kỳ; không gán ngày tạo thay cho ngày chốt. */
export function advisorReasonQuery(posIds: string[], start: string, end: string, filter: string) {
  const range = vnRangeUtc(start, end);
  return { sql: `SELECT o.id, COALESCE(o.seller_id,'') AS staff,
    COALESCE((SELECT department_id FROM hr_pos_team WHERE pos_user_id=o.seller_id LIMIT 1),'') AS team,
    COALESCE((SELECT group_concat(n.message,' ') FROM customer_notes n WHERE n.pos_id=o.pos_id
      AND (n.customer_id=o.customer_id OR n.order_id=o.source_order_id) AND n.created_at>=? AND n.created_at<?),'')
      || ' ' || COALESCE(CASE WHEN json_valid(o.raw_json) THEN json_extract(o.raw_json,'$.note') END,'') AS messages
    FROM raw_pos_orders o INDEXED BY idx_raw_orders_pos_closed_status_money
    WHERE o.pos_id IN (${posIds.map(() => '?').join(',')}) AND o.first_closed_at>=? AND o.first_closed_at<?
    AND o.status_code IN (0,17,6,4,15,5)${filter}`,
    binds: [range.startUtc, range.endUtc, ...posIds, range.startUtc, range.endUtc] };
}

export function advisorLeadsQuery(posIds: string[], start: string, end: string, filter: string) {
  const range = vnRangeUtc(start, end);
  return { sql: `SELECT date(o.created_at,'+7 hours') AS day, o.marketer_id, COUNT(DISTINCT o.phone) AS n
    FROM raw_pos_orders o INDEXED BY idx_raw_orders_pos_created_status_phone
    WHERE o.pos_id IN (${posIds.map(() => '?').join(',')}) AND o.created_at>=? AND o.created_at<?
    AND o.status_code<>7 AND NULLIF(TRIM(o.marketer_id),'') IS NOT NULL${filter}
    GROUP BY 1,2`, binds: [...posIds, range.startUtc, range.endUtc] };
}

export async function advisorReport(db: D1Database, opts: TrendOptions, depts: TrendDept[]) {
  // Giữ phụ thuộc máy chủ ngoài bundle của các hàm vẽ biểu đồ thuần.
  const server = (import.meta as ImportMeta & { env?: { SSR: boolean } }).env?.SSR !== false
    ? await Promise.all([import('./scope-filter'), import('./trend-period')]) : null;
  if (!server) throw new Error('advisorReport chỉ chạy trên máy chủ');
  const [{ scopeFromParams, scopeSql }, { hourlyProfile, periodCard, trendQuery }] = server;
  const items: AdvisorItem[] = [];
  const viz: AdvisorViz = { sale: null, cskh: null, mkt: null };
  const scope = scopeFromParams(new URLSearchParams({ team: opts.team, ...(opts.branch ? { branch: opts.branch } : {}) }), opts.unit);
  const filter = scopeSql(scope, { seller: 'o.seller_id' });
  const historyEnd = addDays(todayVn(), -1), historyStart = addDays(historyEnd, -59);
  const ph = opts.posIds.map(() => '?').join(',');
  const leadsStart = addDays(historyEnd, -27);
  const leadQuery = advisorLeadsQuery(opts.posIds, leadsStart, historyEnd, filter);
  const leads = depts.includes('sale') ? (await db.prepare(leadQuery.sql).bind(...leadQuery.binds).all<{ day: string; n: number }>()).results : [];
  const leadsTotal = leads.reduce((n, r) => n + r.n, 0);
  const leadDays = new Set(leads.map((r) => r.day)).size;
  const leadsDaily = leadDays >= 14 ? leadsTotal / 28 : null;
  for (const dept of ['sale', 'cskh'] as const) {
    if (!depts.includes(dept)) continue;
    const staff = await db.prepare(`SELECT COUNT(DISTINCT user_id) AS n FROM pos_users o WHERE pos_id IN (${ph}) AND is_active=1 AND ${WORKING}${teamFilter('o.user_id', dept, false, opts.unit)}${opts.branch ? scopeSql({ ...scope, team: 'all', unit: null }, { seller: 'o.user_id' }) : ''}`).bind(...opts.posIds).first<{ n: number }>();
    const have = staff?.n ?? 0;
    if (dept === 'sale') {
      // stats_daily không chứa marketer; không dùng nó khi có lăng kính MKT.
      const rows = opts.mktTeam ? [] : (await db.prepare(`SELECT SUM(assigned_orders) AS assigned,SUM(assigned_closed_orders) AS closed FROM stats_daily o WHERE pos_id IN (${ph}) AND day>=? AND day<=?${scopeSql({ ...scope, team: 'sale' }, { seller: 'o.seller_id' })} GROUP BY day,seller_id`).bind(...opts.posIds, historyStart, historyEnd).all<LoadDay>()).results;
      const capacity = saleCapacity(rows, have, leadsDaily);
      viz.sale = capacity;
      items.push({ dept, title: 'Sức chứa Sale', value: capacity.need === null ? 'Chưa đủ số' : `Cần khoảng ${capacity.need} Sale, đang có ${have}`, why: `${leadsTotal} số về trong 28 ngày đã kết thúc (${leadDays} ngày có số), bình quân ${leadsDaily === null ? 'chưa đủ mẫu' : leadsDaily.toFixed(1)} số/ngày; ${have} Sale đang làm. ${capacity.load === null ? '' : `Tải ${capacity.load.toFixed(1)} số/người/ngày.`} ${capacity.best ? `Khoảng tải có tỷ lệ chốt tốt nhất: ${capacity.best}; cần = làm tròn lên số/ngày ÷ trần khoảng tải. Đây là ước tính theo nhịp 28 ngày, chưa phải dự báo số về theo ngân sách.` : 'Chưa đủ mẫu lịch sử 60 ngày để chọn khoảng tải.'} ${opts.mktTeam ? 'Chưa phân tách được lịch sử chia số theo team MKT.' : ''}` });
      for (const b of capacity.buckets) items.push({ dept, title: `Tỷ lệ chốt theo tải ${b.label}`, value: b.rate === null ? 'Chưa đủ số' : `${(b.rate * 100).toFixed(1)}%`, why: `${b.closed} đơn chốt trong ${b.assigned} số được chia, từ ${b.days} ngày/người trong 60 ngày đã kết thúc. Cùng nhóm số được chia; chưa điều chỉnh độ trễ chốt.` });
    } else {
      const range = vnRangeUtc(opts.start, opts.end < todayVn() ? opts.end : todayVn());
      const notes = opts.mktTeam ? null : await db.prepare(`SELECT COUNT(*) AS n FROM customer_notes n WHERE pos_id IN (${ph}) AND created_at>=? AND created_at<?${scopeSql({ ...scope, team: 'cskh' }, { seller: 'n.author_id' })}`).bind(...opts.posIds, range.startUtc, range.endUtc).first<{ n: number }>();
      const days = daysBetween(opts.start, opts.end < todayVn() ? opts.end : todayVn());
      const capacity = careCapacity(have, null, notes?.n ?? 0, days, []);
      viz.cskh = { have, notes: capacity.notes, days, notesPerPerson: notes ? capacity.notesPerPerson : null };
      items.push({ dept, title: 'Sức chứa CSKH', value: notes && capacity.notesPerPerson !== null ? `${capacity.notesPerPerson.toFixed(1)} note/ngày/người` : 'Chưa đủ số', why: `${notes?.n ?? 0} ghi chú ÷ ${days} ngày ÷ ${have} CSKH đang làm. Chưa có hạn note và lịch sử tồn đọng 4 mốc tuần; chưa đủ số để khuyến nghị tuyển. ${opts.mktTeam ? 'Ghi chú chưa gắn được team MKT.' : ''}` });
    }
  }
  let reasons: ReturnType<typeof reasonSummary> | null = null;
  if (depts.some((d) => d === 'sale' || d === 'cskh' || d === 'vandon')) {
    const query = advisorReasonQuery(opts.posIds, opts.start, opts.end, filter);
    const rows = (await db.prepare(query.sql).bind(...query.binds).all<ReasonRow>()).results;
    const config = await db.prepare("SELECT value FROM app_settings WHERE key='reason_keywords'").first<{ value: string }>();
    // Không dùng trung bình phạm vi hẹp như trung bình công ty.
    reasons = reasonSummary(rows, reasonKeywords(config?.value), opts.team === 'all' && !opts.unit && !opts.branch && !opts.mktTeam && POS.every((p) => opts.posIds.includes(p.id)) ? rows : undefined);
  }
  if (depts.includes('mkt')) {
    const range = vnRangeUtc(addDays(todayVn(), -28), addDays(todayVn(), -1));
    const newFilter = filter + teamFilter('o.seller_id', 'sale');
    const historyQuery = trendQuery('mkt', opts.posIds, range.startUtc, range.endUtc, newFilter, [], false);
    const currentRange = vnRangeUtc(opts.start, opts.end < todayVn() ? opts.end : todayVn());
    const currentQuery = trendQuery('mkt', opts.posIds, currentRange.startUtc, opts.end >= todayVn() ? new Date().toISOString().slice(0,19) : currentRange.endUtc, newFilter, [], false);
    const history = (await db.prepare(historyQuery.sql).bind(...historyQuery.binds).all<TrendPoint>()).results;
    const current = (await db.prepare(currentQuery.sql).bind(...currentQuery.binds).all<TrendPoint>()).results;
    const card = periodCard(current, opts, hourlyProfile(history, todayVn()));
    viz.mkt = { open: card.period.open, actual: card.actual, forecast: card.forecast };
    items.push({ dept: 'mkt', title: card.period.open ? 'DT New dự đoán cuối kỳ' : 'DT New trong kỳ', value: card.forecast === null ? 'Chưa đủ số' : `${Math.round(card.forecast).toLocaleString('vi-VN')} đ`, why: `DT New đã có ${Math.round(card.actual).toLocaleString('vi-VN')} đ. ${card.period.open ? 'Chia cho phần kỳ đã qua theo phân bố giờ và ngày trong tuần của 28 ngày trước (A4); chỉ đơn MKT xác nhận do Sale chốt, theo ngày xác nhận.' : 'Kỳ đã kết thúc: dùng số thực tế, không dự đoán.'}` });
    items.push({ dept: 'mkt', title: 'Số về và ROAS dự đoán cuối kỳ', value: 'Chưa đủ số', why: 'Chưa có hồ sơ phân bố số về và chi phí cùng phạm vi để dự đoán ROAS cuối kỳ; không dùng doanh thu MKT tổng thay cho DT New.' });
  }

  return { viz, items, reasons, reasonScope: 'Đơn hủy/không xác nhận/hoàn có ngày chốt trong kỳ; ghi chú khách và đơn trong kỳ, cộng note trên đơn. Chưa bao gồm số được chia chưa chốt và đơn chưa có ngày chốt; chưa đủ dữ liệu để so với trung bình công ty.' };
}
export type AdvisorReport = Awaited<ReturnType<typeof advisorReport>>;
