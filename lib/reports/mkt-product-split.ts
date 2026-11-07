// Tách số của từng marketer theo dòng sản phẩm (anh Vũ 07/11/2026: "rê chuột vào nó thể hiện lên bao nhiêu số gentadox
// bao nhiêu số, oxy bao nhiêu số"). Cùng phạm vi với phễu ở trang Tổng quan MKT: đơn tạo trong kỳ, marketer có hậu tố được tính,
// số về chỉ tính đơn chia cho Sale (nút CSKH: đơn chia CSKH). Một đơn có nhiều dòng sản phẩm thì nằm ở từng dòng nó có,
// nên cộng các dòng có thể lớn hơn tổng của ô.
import { COUNTED_STAFF, leadSellerFilter, type Team } from '@/lib/teams/team';

export const PRODUCT_LINES = [
  { key: 'gentadox', label: 'Gentadox', like: ['%gentadox%'] },
  { key: 'oxy', label: 'Oxy', like: ['%oxy%'] },
  { key: 'nano-shield', label: 'Bio Nano Shield', like: ['%nano shield%'] },
  { key: 'sk-gk', label: 'Combo SK + GK', like: ['%godkill%', '%god kill%', '%sk + gk%', '%sk+gk%'] },
  { key: 'nano-clean', label: 'Nano Clean', like: ['%nano clean%'] },
] as const;
export const OTHER_LINE = { key: 'khac', label: 'Khác' } as const;
export type LineKey = (typeof PRODUCT_LINES)[number]['key'] | typeof OTHER_LINE.key;
export const LINE_LABEL: Record<LineKey, string> = Object.fromEntries([...PRODUCT_LINES, OTHER_LINE].map((l) => [l.key, l.label])) as Record<LineKey, string>;

/** CASE SQL đổi tên sản phẩm (cột `col`) ra mã dòng sản phẩm; dòng nào khớp trước thì lấy dòng đó. */
export function lineCaseSql(col: string) {
  const whens = PRODUCT_LINES.map((l) => `WHEN ${l.like.map((p) => `LOWER(${col}) LIKE '${p}'`).join(' OR ')} THEN '${l.key}'`).join(' ');
  return `CASE ${whens} ELSE '${OTHER_LINE.key}' END`;
}

export type SplitCell = { orders: number; phones: number; confirmed: number; revenue: number; quantity: number };
export type ProductSplit = Record<string, Partial<Record<LineKey, SplitCell>>>;

export type SplitScope = {
  posIds: string[]; startUtc: string; endUtc: string; team: Team;
  /** Phần SQL lọc team Marketing / chi nhánh đã dựng sẵn (bắt đầu bằng " AND"), cùng binds. */
  extraSql?: string; extraBinds?: string[];
};

/** byMarketer = false: gom cả phạm vi theo dòng sản phẩm (hàng Tổng, SĐT đếm duy nhất trên cả phạm vi). */
export function productSplitSql(scope: SplitScope, byMarketer = true) {
  const marketer = `NULLIF(TRIM(o.marketer_id),'')`;
  const ph = scope.posIds.map(() => '?').join(',');
  const confirmed = 'o.first_confirmed_at IS NOT NULL AND o.status_code NOT IN (0,17,6,7)';
  const sql = `SELECT ${byMarketer ? marketer : "''"} AS marketer_id, ${lineCaseSql('i.name')} AS line,
      COUNT(DISTINCT o.id) AS orders, COUNT(DISTINCT NULLIF(TRIM(o.phone),'')) AS phones,
      COUNT(DISTINCT CASE WHEN ${confirmed} THEN o.id END) AS confirmed,
      COALESCE(SUM(CASE WHEN ${confirmed} THEN COALESCE(i.line_total,0) ELSE 0 END),0) AS revenue,
      COALESCE(SUM(CASE WHEN ${confirmed} THEN COALESCE(i.quantity,0) ELSE 0 END),0) AS quantity
    FROM raw_pos_orders o JOIN raw_pos_order_items i ON i.order_id=o.id
    WHERE o.pos_id IN (${ph}) AND ${marketer} IS NOT NULL AND ${marketer} IN ${COUNTED_STAFF}${scope.extraSql ?? ''}${leadSellerFilter('o.seller_id', scope.team)}
      AND o.created_at>=? AND o.created_at<? AND o.status_code<>7
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

export async function mktProductSplit(db: D1Database, scope: SplitScope): Promise<{ byMarketer: ProductSplit; total: Partial<Record<LineKey, SplitCell>> }> {
  const each = productSplitSql(scope), all = productSplitSql(scope, false);
  const [a, b] = await db.batch<Row>([db.prepare(each.sql).bind(...each.binds), db.prepare(all.sql).bind(...all.binds)]);
  return { byMarketer: groupSplit(a.results), total: groupSplit(b.results)[''] ?? {} };
}
