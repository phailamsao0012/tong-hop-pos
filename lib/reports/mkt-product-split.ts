// Tách số của từng marketer theo dòng sản phẩm (anh Vũ 07/11/2026: "rê chuột vào nó thể hiện lên bao nhiêu số gentadox
// bao nhiêu số, oxy bao nhiêu số"). Cùng phạm vi với phễu ở trang Tổng quan MKT: đơn tạo trong kỳ, marketer có hậu tố được tính,
// số về chỉ tính đơn chia cho Sale (nút CSKH: đơn chia CSKH). Một đơn có nhiều dòng sản phẩm thì nằm ở từng dòng nó có,
// nên cộng các dòng có thể lớn hơn tổng của ô.
import { MKT_STAFF, leadSellerFilter, notSan, type Team } from '@/lib/teams/team';
import { mktClosedSql } from '@/lib/reports/mkt-closed';

export const PRODUCT_LINES = [
  { key: 'gentadox', label: 'Gentadox', like: ['%gentadox%'] },
  // Doxytylo / Flo - Doxy có chữ "oxy" trong tên nhưng không phải Oxytetra (anh Vũ 19/11): dòng Oxy chỉ còn Oxytetra.
  { key: 'oxy', label: 'Oxy', like: ['%oxy%'], notLike: ['%doxy%'] },
  { key: 'nano-shield', label: 'Bio Nano Shield', like: ['%nano shield%'] },
  { key: 'sk-gk', label: 'Combo SK + GK', like: ['%godkill%', '%god kill%', '%sk + gk%', '%sk+gk%'] },
  { key: 'nano-clean', label: 'Nano Clean', like: ['%nano clean%'] },
] as const;
export const OTHER_LINE = { key: 'khac', label: 'Khác' } as const;
/** Dòng Doxy riêng chỉ ở ô Tách theo sản phẩm trang Marketing (anh Vũ 19/11). KPI2 vẫn dùng PRODUCT_LINES (Doxy nằm ở Khác). */
export const DOXY_LINE = { key: 'doxy', label: 'Doxy', like: ['%doxy%'] } as const;
export const SPLIT_LINES = [PRODUCT_LINES[0], PRODUCT_LINES[1], DOXY_LINE, ...PRODUCT_LINES.slice(2)] as const;
export type LineKey = (typeof SPLIT_LINES)[number]['key'] | typeof OTHER_LINE.key;
export const LINE_LABEL: Record<LineKey, string> = Object.fromEntries([...SPLIT_LINES, OTHER_LINE].map((l) => [l.key, l.label])) as Record<LineKey, string>;

/** CASE SQL đổi tên sản phẩm (cột `col`) ra mã dòng sản phẩm; dòng nào khớp trước thì lấy dòng đó. */
export function lineCaseSql(col: string, lines: readonly (typeof SPLIT_LINES)[number][] = PRODUCT_LINES) {
  const whens = lines.map((l) => {
    const not = 'notLike' in l ? l.notLike.map((p) => ` AND LOWER(${col}) NOT LIKE '${p}'`).join('') : '';
    return `WHEN (${l.like.map((p) => `LOWER(${col}) LIKE '${p}'`).join(' OR ')})${not} THEN '${l.key}'`;
  }).join(' ');
  return `CASE ${whens} ELSE '${OTHER_LINE.key}' END`;
}

export type SplitCell = { orders: number; phones: number; confirmed: number; revenue: number; quantity: number };
export type ProductSplit = Record<string, Partial<Record<LineKey, SplitCell>>>;
/** Đơn trong phạm vi tách theo có / chưa có dòng hàng bán (mỗi đơn 1 lần). Số chưa có sản phẩm = SĐT trong ô − SĐT có sản phẩm,
 *  nên "có sản phẩm + chưa có sản phẩm" luôn bằng đúng số trong ô (một SĐT có cả đơn có hàng lẫn đơn chưa có hàng tính vào "có"). */
export type SplitCoverage = { closed: SplitCell; open: SplitCell };

export type SplitScope = {
  posIds: string[]; startUtc: string; endUtc: string; team: Team;
  /** Phần SQL lọc team Marketing / chi nhánh đã dựng sẵn (bắt đầu bằng " AND"), cùng binds. */
  extraSql?: string; extraBinds?: string[];
};

const SALE_ITEM = (i: string) => `${i}.is_bonus=0 AND ${i}.quantity>0 AND TRIM(${i}.name)<>'' AND LOWER(TRIM(${i}.name)) NOT LIKE 'quà tặng%'`;
/** Phạm vi đơn: đúng như phễu trang Marketing (đơn tạo trong kỳ, marketer được tính, không phải Sàn, chia cho Sale / CSKH theo nút). */
function scopeWhere(scope: SplitScope) {
  const marketer = `NULLIF(TRIM(o.marketer_id),'')`;
  const ph = scope.posIds.map(() => '?').join(',');
  return `o.pos_id IN (${ph}) AND ${marketer} IS NOT NULL AND ${marketer} IN ${MKT_STAFF}${notSan('o.marketer_id')}${scope.extraSql ?? ''}${leadSellerFilter('o.seller_id', scope.team)}
      AND o.created_at>=? AND o.created_at<? AND o.status_code<>7`;
}

/** Số đã chốt / chưa chốt theo marketer (byMarketer = false: cả phạm vi). */
export function coverageSql(scope: SplitScope, byMarketer = true) {
  const marketer = `NULLIF(TRIM(o.marketer_id),'')`;
  const confirmed = mktClosedSql('o'), ever = 'o.first_confirmed_at IS NOT NULL AND o.status_code NOT IN (0,17,7)';
  const itemSum = (col: string) => `(SELECT COALESCE(SUM(COALESCE(i.${col},0)),0) FROM raw_pos_order_items i WHERE i.order_id=o.id AND ${SALE_ITEM('i')})`;
  const sql = `SELECT ${byMarketer ? marketer : "''"} AS marketer_id,
      COUNT(*) AS orders_all, COUNT(DISTINCT NULLIF(TRIM(o.phone),'')) AS phones_all, SUM(CASE WHEN ${ever} THEN 1 ELSE 0 END) AS confirmed_all,
      COUNT(DISTINCT CASE WHEN ${ever} THEN NULLIF(TRIM(o.phone),'') END) AS phones_closed,
      COALESCE(SUM(CASE WHEN ${confirmed} THEN ${itemSum('line_total')} ELSE 0 END),0) AS revenue_closed,
      COALESCE(SUM(CASE WHEN ${confirmed} THEN ${itemSum('quantity')} ELSE 0 END),0) AS quantity_closed
    FROM raw_pos_orders o WHERE ${scopeWhere(scope)} GROUP BY 1`;
  return { sql, binds: [...scope.posIds, ...(scope.extraBinds ?? []), scope.startUtc, scope.endUtc] };
}
type CoverageRow = { marketer_id: string; orders_all: number; phones_all: number; confirmed_all: number; phones_closed: number; revenue_closed: number; quantity_closed: number };
export function coverageOf(r: CoverageRow): SplitCoverage {
  const n = (v: unknown) => Number(v ?? 0);
  return {
    // orders = đơn tạo của các số đó (để dòng Cộng khớp Đơn tạo); confirmed = đơn đã chốt (đã chốt là chốt).
    closed: { orders: n(r.confirmed_all), phones: n(r.phones_closed), confirmed: n(r.confirmed_all), revenue: n(r.revenue_closed), quantity: n(r.quantity_closed) },
    open: { orders: n(r.orders_all) - n(r.confirmed_all), phones: n(r.phones_all) - n(r.phones_closed), confirmed: 0, revenue: 0, quantity: 0 },
  };
}

/** byMarketer = false: gom cả phạm vi theo dòng sản phẩm (hàng Tổng, SĐT đếm duy nhất trên cả phạm vi). */
export function productSplitSql(scope: SplitScope, byMarketer = true) {
  const marketer = `NULLIF(TRIM(o.marketer_id),'')`;
  const confirmed = mktClosedSql('o'), ever = 'o.first_confirmed_at IS NOT NULL AND o.status_code NOT IN (0,17,7)';
  const sql = `SELECT ${byMarketer ? marketer : "''"} AS marketer_id, ${lineCaseSql('i.name', SPLIT_LINES)} AS line,
      COUNT(DISTINCT o.id) AS orders, COUNT(DISTINCT NULLIF(TRIM(o.phone),'')) AS phones,
      COUNT(DISTINCT CASE WHEN ${ever} THEN o.id END) AS confirmed,
      COALESCE(SUM(CASE WHEN ${confirmed} THEN COALESCE(i.line_total,0) ELSE 0 END),0) AS revenue,
      COALESCE(SUM(CASE WHEN ${confirmed} THEN COALESCE(i.quantity,0) ELSE 0 END),0) AS quantity
    FROM raw_pos_orders o JOIN raw_pos_order_items i ON i.order_id=o.id
    WHERE ${scopeWhere(scope)}
      AND i.is_bonus=0 AND i.quantity>0 AND TRIM(i.name)<>'' AND LOWER(TRIM(i.name)) NOT LIKE 'quà tặng%'
    GROUP BY 1,2`;
  return { sql, binds: [...scope.posIds, ...(scope.extraBinds ?? []), scope.startUtc, scope.endUtc] };
}

type Row = { marketer_id: string; line: LineKey } & SplitCell;
export function groupSplit(rows: Row[]): ProductSplit {
  const out: ProductSplit = {};
  for (const r of rows) (out[r.marketer_id] ??= {})[r.line] = { orders: Number(r.orders), phones: Number(r.phones), confirmed: Number(r.confirmed), revenue: Number(r.revenue), quantity: Number(r.quantity) };
  return out;
}

export async function mktProductSplit(db: D1Database, scope: SplitScope): Promise<{ byMarketer: ProductSplit; total: Partial<Record<LineKey, SplitCell>>; coverage: Record<string, SplitCoverage>; coverageTotal: SplitCoverage | null }> {
  const each = productSplitSql(scope), all = productSplitSql(scope, false), covEach = coverageSql(scope), covAll = coverageSql(scope, false);
  const [a, b, c, d] = await db.batch<Row>([db.prepare(each.sql).bind(...each.binds), db.prepare(all.sql).bind(...all.binds), db.prepare(covEach.sql).bind(...covEach.binds), db.prepare(covAll.sql).bind(...covAll.binds)]);
  const cov = c.results as unknown as CoverageRow[], covTotal = (d.results as unknown as CoverageRow[])[0];
  return { byMarketer: groupSplit(a.results), total: groupSplit(b.results)[''] ?? {}, coverage: Object.fromEntries(cov.map((r) => [String(r.marketer_id), coverageOf(r)])), coverageTotal: covTotal ? coverageOf(covTotal) : null };
}
