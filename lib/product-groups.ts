// Nhóm sản phẩm của đơn (yêu cầu 25/09/2026), dùng cho: khách bắt nguồn từ đâu (CSKH), mua lại bắt đầu từ sản phẩm gì,
// chốt theo nhóm của từng nhân viên Sale. Ba cách chia (người xem tự chọn):
//   - 'main'    nhóm chính: Kháng sinh (BIO NANO SHIELD, GENTADOX, OXY + BỔ HUYẾT) · SK + GK · Khác
//               nhận diện theo nhãn đơn Pancake, theo tên sản phẩm trong đơn, hoặc cả hai (mặc định);
//   - 'tag'     từng nhãn dòng sản phẩm trên đơn (bỏ nhãn vận hành như Chưa đối soát, Không nghe máy…);
//   - 'product' từng sản phẩm trong đơn (không tính quà tặng).
// Một đơn có thể thuộc nhiều nhóm (vừa kháng sinh vừa SK + GK) → đếm ở cả hai, không cộng các nhóm thành tổng.
// Thẻ vận hành trên đơn (đối soát, gọi lại, giao hàng…) — không phải dòng sản phẩm nên không tính "mua lại theo thẻ".
const OPERATIONAL_TAG = /đối soát|không nghe|hotline|không liên lạc|xin địa chỉ|đã lấy hàng|hẹn gọi|giao không thành|đang giao|nhắc nhở|không lấy được|nhập hàng|chưa tiếp cận|trùng|hoàn một phần|spam|giá đắt|mua lẻ|dùng thử|kcnc|tk thêm|sai số|nhầm/i;
/** Thẻ dòng sản phẩm của một đơn (bỏ thẻ vận hành, bỏ trùng). */
export function productTags(tagsJson: string | null | undefined): string[] {
  try {
    const arr = JSON.parse(tagsJson || '[]') as { name?: string | null }[];
    return [...new Set(arr.map((t) => (t?.name ?? '').trim()).filter((n) => n && !OPERATIONAL_TAG.test(n)))];
  } catch { return []; }
}


export type GroupDim = 'main' | 'tag' | 'product';
export type GroupBasis = 'both' | 'tag' | 'product';
export const GROUP_DIMS: Record<GroupDim, string> = { main: 'Nhóm chính', tag: 'Theo nhãn đơn', product: 'Theo sản phẩm' };
export const GROUP_BASES: Record<GroupBasis, string> = { both: 'Nhãn + sản phẩm', tag: 'Chỉ theo nhãn', product: 'Chỉ theo sản phẩm' };
export const OTHER = 'Khác';

/** Nhận diện nhóm chính bằng mẫu LIKE (không phân biệt hoa thường với chữ không dấu):
 * products — trên tên sản phẩm; tags — trên nhãn đã bỏ dấu cách. Dùng chung cho SQL và JS để hai đường tính khớp nhau. */
export const MAIN_GROUPS = [
  { key: 'khang-sinh', label: 'Kháng sinh', products: ['%gentadox%', '%nano shield%', '%oxy%huy%'], tags: ['OXY+B%HUY%', 'GENTADOX%', 'BIONANOSHIELD%'] },
  { key: 'sk-gk', label: 'SK + GK', products: ['%godkill%', '%god kill%', '%sk + gk%', '%sk+gk%'], tags: ['SK+GK%'] },
] as const;
export const MAIN_LABELS = [...MAIN_GROUPS.map((g) => g.label), OTHER];
const likeRe = (pattern: string) => new RegExp(`^${pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/%/g, '.*')}$`, 'i');
const RE = MAIN_GROUPS.map((g) => ({ label: g.label, products: g.products.map(likeRe), tags: g.tags.map(likeRe) }));

/** SQL: điều kiện "đơn thuộc nhóm chính" trên bảng đơn có bí danh `o`. */
export function mainGroupSql(group: (typeof MAIN_GROUPS)[number], basis: GroupBasis) {
  const tag = `EXISTS (SELECT 1 FROM json_each(CASE WHEN json_valid(o.tags_json) THEN o.tags_json ELSE '[]' END) gt WHERE ${group.tags.map(() => "REPLACE(TRIM(json_extract(gt.value,'$.name')),' ','') LIKE ?").join(' OR ')})`;
  const product = `EXISTS (SELECT 1 FROM raw_pos_order_items gi WHERE gi.order_id=o.id AND gi.is_bonus=0 AND gi.quantity>0 AND (${group.products.map(() => 'gi.name LIKE ?').join(' OR ')}))`;
  if (basis === 'tag') return { sql: tag, binds: [...group.tags] };
  if (basis === 'product') return { sql: product, binds: [...group.products] };
  return { sql: `(${tag} OR ${product})`, binds: [...group.tags, ...group.products] };
}

export function parseGroupOptions(p: URLSearchParams) {
  const dim = (['main', 'tag', 'product'] as const).find((d) => d === p.get('dim')) ?? 'main';
  const basis = (['both', 'tag', 'product'] as const).find((b) => b === p.get('basis')) ?? 'both';
  return { dim, basis } as { dim: GroupDim; basis: GroupBasis };
}

/** Nhóm của một đơn (JS): tagsJson = cột tags_json; items = tên sản phẩm không phải quà tặng. */
export function groupsOf(tagsJson: string | null | undefined, items: string[], dim: GroupDim, basis: GroupBasis): string[] {
  const tags = productTags(tagsJson);
  if (dim === 'tag') return tags.length ? tags : ['Không có nhãn sản phẩm'];
  const names = [...new Set(items.map((n) => n.trim()).filter(Boolean))];
  if (dim === 'product') return names.length ? names : ['Không rõ sản phẩm'];
  const tagKeys = tags.map((t) => t.replace(/\s+/g, ''));
  const hit = RE.filter((g) =>
    (basis !== 'product' && g.tags.some((re) => tagKeys.some((t) => re.test(t)))) ||
    (basis !== 'tag' && g.products.some((re) => names.some((n) => re.test(n)))));
  return hit.length ? hit.map((g) => g.label) : [OTHER];
}

/** Tên sản phẩm (không quà tặng) của các đơn, đọc theo lô 90 mã. */
export async function itemNames(db: D1Database, orderIds: string[]) {
  const out = new Map<string, string[]>();
  const statements: D1PreparedStatement[] = [];
  for (let i = 0; i < orderIds.length; i += 90) {
    const chunk = orderIds.slice(i, i + 90);
    statements.push(db.prepare(`SELECT order_id, name FROM raw_pos_order_items WHERE order_id IN (${chunk.map(() => '?').join(',')}) AND is_bonus=0 AND quantity>0`).bind(...chunk));
  }
  for (let i = 0; i < statements.length; i += 100) {
    for (const res of await db.batch(statements.slice(i, i + 100))) {
      for (const r of res.results as { order_id: string; name: string | null }[]) {
        if (!r.name) continue;
        if (!out.has(r.order_id)) out.set(r.order_id, []);
        out.get(r.order_id)!.push(r.name);
      }
    }
  }
  return out;
}

/** Thứ tự hiển thị: nhóm chính theo thứ tự cố định, còn lại theo số lượng giảm dần. */
export function sortGroups(dim: GroupDim, counts: Map<string, number>) {
  if (dim === 'main') return MAIN_LABELS.filter((l) => counts.has(l));
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([l]) => l);
}
