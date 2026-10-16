import type { SourceItem, SourceOrder } from '@/lib/pancake';

export const RETURN_FEE_FACTOR = 1;
const positive = (n: unknown): number | null => typeof n === 'number' && Number.isFinite(n) && n > 0 ? n : null;

export function itemUnitCost(i: SourceItem): number | null {
  const own = positive(i.variation_info?.avg_price) ?? positive(i.variation_info?.last_imported_price);
  if (own !== null) return own;
  if (!Array.isArray(i.components) || !i.components.length) return null;
  let cost = 0;
  for (const component of i.components) {
    const unit = positive(component.variation_info?.avg_price) ?? positive(component.variation_info?.last_imported_price);
    const quantity = component.quantity;
    if (typeof quantity !== 'number' || !Number.isFinite(quantity) || quantity < 0) return null;
    if (quantity === 0) continue;
    if (unit === null) return null;
    cost += unit * quantity;
  }
  return positive(cost);
}

export function orderCost(o: Pick<SourceOrder, 'items'>): { cost: number; missing: number } {
  let cost = 0, missing = 0;
  for (const item of Array.isArray(o.items) ? o.items : []) {
    const quantity = item.quantity;
    if (quantity === 0) continue;
    const unit = itemUnitCost(item);
    if (unit === null || typeof quantity !== 'number' || !Number.isFinite(quantity) || quantity < 0) missing++;
    else cost += unit * quantity;
  }
  return { cost, missing };
}

export function carrierFee(o: Pick<SourceOrder, 'partner' | 'partner_fee'>): number | null {
  return positive(o.partner?.total_fee) ?? positive(o.partner_fee);
}
