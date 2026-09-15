import {
  EMPLOYEES,
  POS,
  PRODUCTS,
  type Assignment,
  type Customer,
  type Dataset,
  type Order,
} from './report-model';

const assignments: Assignment[] = [];
const orders: Order[] = [];
const customers: Customer[] = [];
const phone = (p: number, n: number) =>
  `09${String(20000000 + p * 1000 + n).padStart(8, '0')}`;
const names = [
  'Hòa',
  'Minh',
  'Thảo',
  'Huy',
  'Trang',
  'Tuấn',
  'Lan',
  'Ngọc',
  'Vân',
  'Hải',
  'Phương',
  'Tâm',
];

POS.forEach((pos, pi) => {
  for (let i = 0; i < 12; i++) {
    const number = phone(pi, i);
    const employeeId = EMPLOYEES[(i + pi) % EMPLOYEES.length].id;
    const batchId = `2026-09-${pos.id}`;
    assignments.push({
      id: `A-${pi}-${i}`,
      posId: pos.id,
      phone: number,
      employeeId,
      assignedAt: `2026-09-15T0${8 + (i % 2)}:${String(i * 4).padStart(2, '0')}:00+07:00`,
      batchId,
    });
    customers.push({
      posId: pos.id,
      phone: number,
      name: `${names[i]} ${['Nguyễn', 'Trần', 'Lê'][pi % 3]}`,
      note: i % 5 === 0 ? 'Đã hẹn gọi lại để tư vấn sản phẩm.' : '',
    });
    if (i % 3 === 0) {
      const net = 420000 + pi * 55000 + i * 23000;
      orders.push({
        id: `SEP-${pi}-${i}`,
        posId: pos.id,
        phone: number,
        closerId: employeeId,
        createdAt: `2026-09-15T10:${String(i * 3).padStart(2, '0')}:00+07:00`,
        confirmedAt: `2026-09-15T10:${String(i * 3 + 2).padStart(2, '0')}:00+07:00`,
        deliveredAt: null,
        status: 'confirmed',
        hotValue: net,
        currentValue: net,
        netMerchandise: net,
        returnValue: 0,
        items: [
          {
            productId: PRODUCTS[(pi + i) % PRODUCTS.length].id,
            quantity: 2,
            netValue: net,
          },
        ],
      });
      if (i === 0)
        orders.push({
          id: `SEP-EXTRA-${pi}`,
          posId: pos.id,
          phone: number,
          closerId: employeeId,
          createdAt: '2026-09-15T11:03:00+07:00',
          confirmedAt: '2026-09-15T11:04:00+07:00',
          deliveredAt: null,
          status: 'confirmed',
          hotValue: 240000,
          currentValue: 260000,
          netMerchandise: 240000,
          returnValue: 0,
          items: [
            {
              productId: PRODUCTS[pi % PRODUCTS.length].id,
              quantity: 1,
              netValue: 240000,
            },
          ],
        });
    }
    if (i < 6) {
      const oldNet = 260000 + pi * 40000 + i * 30000;
      orders.push({
        id: `AUG-${pi}-${i}`,
        posId: pos.id,
        phone: number,
        closerId: employeeId,
        createdAt: `2026-08-${String(5 + i * 2).padStart(2, '0')}T09:00:00+07:00`,
        confirmedAt: `2026-08-${String(5 + i * 2).padStart(2, '0')}T09:15:00+07:00`,
        deliveredAt: `2026-08-${String(8 + i * 2).padStart(2, '0')}T15:00:00+07:00`,
        status: 'delivered',
        hotValue: oldNet,
        currentValue: oldNet,
        netMerchandise: oldNet,
        returnValue: 0,
        items: [
          {
            productId: PRODUCTS[(pi + i) % PRODUCTS.length].id,
            quantity: 1 + (i % 2),
            netValue: oldNet,
          },
        ],
      });
      if (i < 3)
        orders.push({
          id: `SEP-DEL-${pi}-${i}`,
          posId: pos.id,
          phone: number,
          closerId: employeeId,
          createdAt: `2026-09-${String(2 + i * 3).padStart(2, '0')}T09:00:00+07:00`,
          confirmedAt: `2026-09-${String(2 + i * 3).padStart(2, '0')}T09:05:00+07:00`,
          deliveredAt: `2026-09-${String(5 + i * 3).padStart(2, '0')}T15:00:00+07:00`,
          status: 'delivered',
          hotValue: oldNet + 180000,
          currentValue: oldNet + 180000,
          netMerchandise: oldNet + 180000,
          returnValue: 0,
          items: [
            {
              productId: PRODUCTS[(pi + i + 1) % PRODUCTS.length].id,
              quantity: 2,
              netValue: oldNet + 180000,
            },
          ],
        });
    }
  }
  for (let i = 12; i < 18; i++) {
    const number = phone(pi, i),
      employeeId = EMPLOYEES[(i + pi) % EMPLOYEES.length].id;
    assignments.push({
      id: `OLD-${pi}-${i}`,
      posId: pos.id,
      phone: number,
      employeeId,
      assignedAt: `2026-08-${String(10 + i - 12).padStart(2, '0')}T08:00:00+07:00`,
      batchId: `2026-08-${pos.id}`,
    });
    customers.push({
      posId: pos.id,
      phone: number,
      name: `${names[i % 12]} ${['Nguyễn', 'Trần', 'Lê'][pi % 3]}`,
      note: '',
    });
    if (i < 15)
      orders.push({
        id: `OLD-CLOSE-${pi}-${i}`,
        posId: pos.id,
        phone: number,
        closerId: employeeId,
        createdAt: '2026-09-15T10:20:00+07:00',
        confirmedAt: '2026-09-15T10:22:00+07:00',
        deliveredAt: null,
        status: 'confirmed',
        hotValue: 350000 + pi * 45000,
        currentValue: 350000 + pi * 45000,
        netMerchandise: 350000 + pi * 45000,
        returnValue: 0,
        items: [
          {
            productId: PRODUCTS[pi % PRODUCTS.length].id,
            quantity: 1,
            netValue: 350000 + pi * 45000,
          },
        ],
      });
    if (i === 15)
      orders.push({
        id: `RET-${pi}`,
        posId: pos.id,
        phone: number,
        closerId: employeeId,
        createdAt: '2026-09-03T10:00:00+07:00',
        confirmedAt: '2026-09-03T10:05:00+07:00',
        deliveredAt: '2026-09-06T13:00:00+07:00',
        status: 'returned',
        hotValue: 510000,
        currentValue: 510000,
        netMerchandise: 510000,
        returnValue: 510000,
        items: [
          {
            productId: PRODUCTS[pi % PRODUCTS.length].id,
            quantity: 1,
            netValue: 510000,
          },
        ],
      });
  }
});

// A repeated assignment in the same report file demonstrates phone-level deduplication.
assignments.push({
  ...assignments[0],
  id: 'A-REPEAT',
  assignedAt: '2026-09-15T09:30:00+07:00',
});
export const demoData: Dataset = {
  assignments,
  orders,
  customers,
  updatedAt: null,
  mode: 'demo',
  historyStart: '2026-08-05',
};
