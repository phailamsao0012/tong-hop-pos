import test from 'node:test';
import assert from 'node:assert/strict';
import { OWNER_VIEWS } from '../lib/auth/access';
import { LEVEL_DEPTS, levelsFromViews, teamForLevels, viewsForLevels, type DeptLevels, type AccessLevel } from '../lib/auth/access-levels';

void test('access-levels: không cấp OWNER_VIEWS ở mọi tổ hợp bậc', () => {
  const ranks: AccessLevel[] = ['none', 'mine', 'team', 'dept', 'admin'];
  for (let n = 0; n < 3125; n++) {
    let value = n;
    const levels: DeptLevels = {};
    for (const { key } of LEVEL_DEPTS) { levels[key as keyof DeptLevels] = ranks[value % 5]; value = Math.floor(value / 5); }
    const views = viewsForLevels(levels);
    assert.equal(new Set(views).size, views.length);
    assert.ok(views.every((id) => !OWNER_VIEWS.includes(id)));
  }
});

void test('access-levels: Hôm nay, Báo cáo, Danh mục và không thêm Cài đặt', () => {
  assert.deepEqual(viewsForLevels({}), []);
  assert.deepEqual(viewsForLevels({ sale: 'mine' }), ['shift']);
  assert.deepEqual(viewsForLevels({ cskh: 'mine' }), ['calls', 'care']);
  assert.deepEqual(viewsForLevels({ 'van-don': 'mine' }), ['pipeline']);
  assert.deepEqual(viewsForLevels({ mkt: 'mine', khach: 'mine' }), []);
  assert.deepEqual(viewsForLevels({ khach: 'team' }), ['customer360', 'customers', 'repurchase', 'dormant']);
  assert.deepEqual(viewsForLevels({ mkt: 'dept' }), ['marketing', 'mkt-roas']);
  assert.ok(!viewsForLevels({ sale: 'admin' }).includes('raw-orders'));
});

void test('access-levels: giữ kiểu phạm vi cũ, không tạo giá trị team mới', () => {
  assert.equal(teamForLevels({ sale: 'mine' }), 'sale');
  assert.equal(teamForLevels({ cskh: 'team' }), 'cskh');
  assert.equal(teamForLevels({ sale: 'dept' }), 'sale');
  assert.equal(teamForLevels({ cskh: 'admin' }), 'cskh');
  assert.equal(teamForLevels({ sale: 'dept', cskh: 'dept' }, 'sale'), 'all');
  assert.equal(teamForLevels({ sale: 'admin', cskh: 'dept' }, 'cskh'), 'all');
  for (const currentTeam of ['sale', 'cskh', 'all'] as const) {
    assert.equal(teamForLevels({ sale: 'dept', cskh: 'team' }, currentTeam), currentTeam);
    assert.equal(teamForLevels({ sale: 'mine', cskh: 'admin', mkt: 'dept' }, currentTeam), currentTeam);
  }
  assert.equal(teamForLevels({ sale: 'dept', mkt: 'dept' }), 'sale');
  assert.equal(teamForLevels({ sale: 'mine', cskh: 'team' }, 'sale'), 'sale');
  assert.equal(teamForLevels({ mkt: 'team' }, 'cskh'), 'cskh');
  assert.equal(teamForLevels({ mkt: 'dept' }, 'cskh'), 'all');
  assert.equal(teamForLevels({ khach: 'admin' }, 'sale'), 'all');
  assert.equal(teamForLevels({}, 'sale'), 'sale');
});

void test('access-levels: khôi phục các tổ hợp chính theo views và team', () => {
  const cases: DeptLevels[] = [ {}, { sale: 'mine' }, { cskh: 'mine' }, { 'van-don': 'mine' },
    { sale: 'team' }, { cskh: 'team' }, { sale: 'dept', cskh: 'dept', mkt: 'dept', 'van-don': 'dept', khach: 'dept' },
    { sale: 'mine', cskh: 'team', 'van-don': 'mine' } ];
  for (const levels of cases) {
    const team = teamForLevels(levels, 'sale');
    const restored = levelsFromViews(viewsForLevels(levels), team);
    assert.deepEqual(restored, Object.fromEntries(LEVEL_DEPTS.map(({ key }) => [key, levels[key as keyof DeptLevels] ?? 'none'])));
  }
});

void test('access-levels: bậc không phân biệt được được đoán bảo thủ, không nhầm trang chung', () => {
  assert.equal(levelsFromViews(['tasks', 'returns'], 'sale').sale, 'none');
  assert.equal(levelsFromViews(['tasks', 'returns'], 'sale').cskh, 'none');
  assert.equal(levelsFromViews(['tasks', 'returns'], 'sale')['van-don'], 'none');
  assert.equal(levelsFromViews(viewsForLevels({ sale: 'admin' }), 'all').sale, 'dept');
  assert.equal(levelsFromViews(viewsForLevels({ mkt: 'mine' }), 'all').mkt, 'none');
  assert.equal(levelsFromViews(['shift'], 'sale').sale, 'mine');
  assert.deepEqual(levelsFromViews(OWNER_VIEWS), levelsFromViews([]));
});
