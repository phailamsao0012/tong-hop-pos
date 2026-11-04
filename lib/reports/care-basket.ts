// Lọc khách CSKH theo những gì khách đã mua (anh Vũ 04/11/2026: "khách nào đã mua riêng, chỉ mới phát sinh đơn kháng sinh thôi,
// chưa từng mua sản phẩm khác, hoặc khách mới chỉ mua riêng combo sk + gk").
// Đọc products_json của customer_stats (sản phẩm trong các đơn thành công của khách, đã có sẵn, không quét đơn gốc).
// Hàng tặng (thành tiền 0) không tính là "đã mua". Cùng quy tắc tên với nhóm sản phẩm ở Tổng quan (lib/pancake/order-segments.ts).
import { ANTIBIOTIC_EXTRA_POS } from '@/lib/pancake/order-segments';

export const CARE_BASKETS = { all: 'Mọi khách', ks: 'Chỉ mua kháng sinh', skgk: 'Chỉ mua combo SK + GK' } as const;
export type CareBasket = keyof typeof CARE_BASKETS;
export const parseCareBasket = (v: string | null): CareBasket => v === 'ks' || v === 'skgk' ? v : 'all';

const words = (name: string) => ` ${name.toLowerCase().replace(/[+\-()/]/g, ' ')} `;
export function isAntibiotic(name: string, posId: string) {
  const n = name.toLowerCase();
  return n.includes('gentadox') || n.includes('detox') || (posId === ANTIBIOTIC_EXTRA_POS && (/oxy.*huy/.test(n) || n.includes('nano shield')));
}
export function isSkGk(name: string) {
  const w = words(name), n = name.toLowerCase();
  return w.includes(' sk ') || w.includes(' gk ') || n.includes('godkill') || n.includes('god kill');
}
/** Bản thuần để test: khách thuộc nhóm nào theo danh sách sản phẩm đã mua. */
export function basketOf(products: { name: string; total: number }[], posId: string): 'ks' | 'skgk' | null {
  const paid = products.filter((p) => p.total > 0);
  if (!paid.length) return null;
  if (paid.every((p) => isAntibiotic(p.name, posId))) return 'ks';
  if (paid.every((p) => !isAntibiotic(p.name, posId) && isSkGk(p.name))) return 'skgk';
  return null;
}

/** Điều kiện SQL trên customer_stats (bí danh cs) và pos_customers (bí danh c), cùng nghĩa với basketOf. */
export function careBasketSql(basket: CareBasket, cs = 'cs', c = 'c') {
  if (basket === 'all') return '';
  const n = 'LOWER(json_extract(p.value,\'$.name\'))';
  const paid = `json_extract(p.value,'$.total')>0`;
  const each = `json_each(CASE WHEN json_valid(${cs}.products_json) THEN ${cs}.products_json ELSE '[]' END) p`;
  const ks = `(${n} LIKE '%gentadox%' OR ${n} LIKE '%detox%' OR (${c}.pos_id='${ANTIBIOTIC_EXTRA_POS}' AND (${n} LIKE '%oxy%huy%' OR ${n} LIKE '%nano shield%')))`;
  const w = `(' '||REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(${n},'+',' '),'-',' '),'(',' '),')',' '),'/',' ')||' ')`;
  const sk = `(${w} LIKE '% sk %' OR ${w} LIKE '% gk %' OR ${n} LIKE '%godkill%' OR ${n} LIKE '%god kill%')`;
  const any = `EXISTS (SELECT 1 FROM ${each} WHERE ${paid})`;
  const only = basket === 'ks' ? ks : `(NOT ${ks} AND ${sk})`;
  return ` AND ${any} AND NOT EXISTS (SELECT 1 FROM ${each} WHERE ${paid} AND NOT ${only})`;
}
