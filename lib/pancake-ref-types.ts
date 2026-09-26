// Kiểu và phép cộng dùng chung (máy chủ + giao diện) cho "Số tham chiếu Pancake".
export type RefBlock = { orders: number; sales: number; revenue: number; profit: number | null; quantity: number };
export type RefPart = { total: RefBlock; online: RefBlock; counter: RefBlock; returned: { orders: number; revenue: number; quantity: number } };
export type RefPos = { posId: string; source: 'pancake' | 'web'; error?: string; web: RefPart; pancake?: RefPart };

export const emptyRefBlock = (): RefBlock => ({ orders: 0, sales: 0, revenue: 0, profit: 0, quantity: 0 });
const emptyPart = (): RefPart => ({ total: emptyRefBlock(), online: emptyRefBlock(), counter: emptyRefBlock(), returned: { orders: 0, revenue: 0, quantity: 0 } });

export function addBlock(a: RefBlock, b: RefBlock): RefBlock {
  return { orders: a.orders + b.orders, sales: a.sales + b.sales, revenue: a.revenue + b.revenue, quantity: a.quantity + b.quantity, profit: a.profit === null || b.profit === null ? null : a.profit + b.profit };
}
export function addPart(a: RefPart, b: RefPart): RefPart {
  return {
    total: addBlock(a.total, b.total), online: addBlock(a.online, b.online), counter: addBlock(a.counter, b.counter),
    returned: { orders: a.returned.orders + b.returned.orders, revenue: a.returned.revenue + b.returned.revenue, quantity: a.returned.quantity + b.returned.quantity },
  };
}
export const emptyRefPart = emptyPart;
