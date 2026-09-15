export const POS = [
  { id: 'sieu-vo-gao', name: 'Siêu vỏ gạo' },
  { id: 'mgt-apex', name: 'MGT - APEX' },
  { id: 'thuy-san', name: 'THỦY SẢN MEGATECH' },
  { id: 'bio-nano', name: 'BIO NANO' },
  { id: 'megaroot', name: 'MEGAROOT' },
  { id: 'oxytetra', name: 'Oxytetra - Megatech' },
] as const;
export const EMPLOYEES = [
  { id: 'anh', name: 'Nguyễn Minh Anh' },
  { id: 'bao', name: 'Trần Quốc Bảo' },
  { id: 'ha', name: 'Lê Thu Hà' },
  { id: 'linh', name: 'Phạm Gia Linh' },
] as const;
export const PRODUCTS = [
  { id: 'apex', name: 'APEX' },
  { id: 'bio', name: 'BIO NANO' },
  { id: 'root', name: 'MEGAROOT' },
  { id: 'oxy', name: 'Oxytetra' },
  { id: 'feed', name: 'Siêu vỏ gạo' },
] as const;

export type Assignment = {
  id: string;
  posId: string;
  phone: string;
  employeeId: string;
  assignedAt: string;
  batchId: string;
};
export type OrderItem = {
  productId: string;
  quantity: number;
  netValue: number;
};
export type OrderStatus = 'confirmed' | 'delivered' | 'returned' | 'cancelled';
export type Order = {
  id: string;
  posId: string;
  phone: string;
  closerId: string;
  createdAt: string;
  confirmedAt: string | null;
  deliveredAt: string | null;
  status: OrderStatus;
  hotValue: number;
  currentValue: number;
  netMerchandise: number;
  returnValue: number;
  items: OrderItem[];
};
export type Customer = {
  posId: string;
  phone: string;
  name: string;
  note: string;
};
export type Dataset = {
  assignments: Assignment[];
  orders: Order[];
  customers: Customer[];
  updatedAt: string | null;
  mode: 'demo' | 'live';
  historyStart: string | null;
  quality?: {
    missingConfirmed: number;
    limitedHistory: boolean;
    connectedPos: number;
    oldestSyncAt: string | null;
  };
};
export type Filters = {
  start: string;
  end: string;
  posIds: string[];
  employeeIds: string[];
  productIds: string[];
};
export function customerKey(posId: string, phone: string) {
  return `${posId}:${phone.replace(/\D/g, '')}`;
}
export function inRange(iso: string | null, start: string, end: string) {
  return !!iso && iso.slice(0, 10) >= start && iso.slice(0, 10) <= end;
}
