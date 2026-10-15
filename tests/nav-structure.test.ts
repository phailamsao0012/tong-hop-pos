import test from 'node:test';
import assert from 'node:assert/strict';
import { DEPT_LAYOUT, NEW_VIEWS, SECTIONS, deptKeysOf, firstDeptOf, layoutFor } from '../lib/nav-structure';

const idsOf = (key: string) => DEPT_LAYOUT.find((dept) => dept.key === key)!.sections.flatMap((section) => section.tabs.map(([id]) => id));
// Mốc menu trước N1, giữ cố định để bước N2 có thể thay DEPTS trong dashboard.
const oldDepts: Record<string, string[]> = {
  sale: ['sale-overview', 'sale-teams', 'sale-analytics', 'sale-quality', 'compare', 'shift', 'sale-kpi', 'dispatch'],
  cskh: ['cskh-overview', 'cskh-teams', 'cskh-analytics', 'calls', 'origin', 'care', 'cskh-kpi'],
  mkt: ['marketing', 'mkt-roas'],
  'van-don': ['van-don', 'pipeline'],
};

void test('nav-structure: giữ mọi tab của DEPTS cũ trong đúng bộ phận', () => {
  for (const [key, ids] of Object.entries(oldDepts)) {
    for (const id of ids) assert.ok(idsOf(key).includes(id), key + ': ' + id);
  }
});

void test('nav-structure: giữ trang Khách hàng và Hệ thống trong bộ phận mới', () => {
  for (const id of ['customer360', 'customers', 'repurchase', 'dormant']) assert.ok(idsOf('khach').includes(id), id);
  for (const id of ['config', 'audit', 'raw-orders', 'security']) assert.ok(idsOf('cai-dat').includes(id), id);
});

void test('nav-structure: nhóm theo đúng thứ tự, mỗi bộ phận không trùng tab', () => {
  assert.deepEqual(SECTIONS, [
    { key: 'today', label: 'Hôm nay' }, { key: 'catalog', label: 'Danh mục' },
    { key: 'reports', label: 'Báo cáo' }, { key: 'settings', label: 'Cấu hình' },
  ]);
  assert.deepEqual(DEPT_LAYOUT.map((dept) => dept.key), ['sale', 'cskh', 'mkt', 'van-don', 'khach', 'cai-dat']);
  for (const dept of DEPT_LAYOUT) {
    const ids = idsOf(dept.key);
    assert.equal(new Set(ids).size, ids.length, dept.key);
    const order = dept.sections.map((section) => SECTIONS.findIndex(({ key }) => key === section.key));
    assert.ok(order.every((index, i) => index >= 0 && (i === 0 || index > order[i - 1])));
  }
  assert.deepEqual(NEW_VIEWS, ['tasks', 'returns']);
});

void test('nav-structure: layoutFor lọc quyền, bỏ nhóm rỗng, giữ dữ liệu gốc', () => {
  const before = JSON.stringify(DEPT_LAYOUT);
  assert.deepEqual(layoutFor('sale', (id) => ['shift', 'sale-teams'].includes(id)), [
    { key: 'today', tabs: [['shift', 'Trong ngày · chốt nóng']] },
    { key: 'reports', tabs: [['sale-teams', 'Theo team']] },
  ]);
  assert.deepEqual(layoutFor('sale', () => false), []);
  assert.deepEqual(layoutFor('unknown', () => true), []);
  assert.deepEqual(layoutFor('sale', () => true), DEPT_LAYOUT[0].sections);
  assert.equal(JSON.stringify(DEPT_LAYOUT), before);
});

void test('nav-structure: trang chung giữ bộ phận ưu tiên hợp lệ và có dự phòng', () => {
  assert.deepEqual(deptKeysOf('tasks'), ['sale', 'cskh']);
  assert.deepEqual(deptKeysOf('returns'), ['sale', 'van-don']);
  assert.deepEqual(deptKeysOf('security'), ['cai-dat']);
  assert.deepEqual(deptKeysOf('unknown'), []);
  assert.equal(firstDeptOf('tasks', 'cskh')?.key, 'cskh');
  assert.equal(firstDeptOf('returns', 'van-don')?.key, 'van-don');
  assert.equal(firstDeptOf('tasks')?.key, 'sale');
  assert.equal(firstDeptOf('tasks', 'mkt')?.key, 'sale');
  assert.equal(firstDeptOf('unknown'), undefined);
});
