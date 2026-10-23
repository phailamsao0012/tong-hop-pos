import test from 'node:test';
import assert from 'node:assert/strict';
import { overlayWebTeams } from '../lib/web-teams';
import { pickerGroups } from '../lib/team-picker-groups';

const g = (id: string, name: string, ...ids: string[]) => ({ id, name, members: ids.map((posUserId) => ({ posUserId })) });

void test('team con chia trên web tổng nằm dưới team web nhân sự chứa họ; team khác giữ nguyên', () => {
  const hr = [g('sale-mo', 'Sale HN C Mơ', 's1', 's2'), g('cskh-hn', 'CSKH Hà Nội', 'c1', 'c2', 'c3', 'c5'), g('cskh-tn', 'CSKH Thái Nguyên', 't1'), g('none', 'Chưa vào team', 'c4', 'x')];
  const web = [g('wt_a', 'Team 1 (C Hương)', 'c1', 'c2'), g('wt_b', 'Team 2 (C Anh)', 'c3', 'c4')];
  const { teams, parent } = overlayWebTeams(hr, web);
  assert.deepEqual(teams.map((t) => t.id), ['sale-mo', 'cskh-hn', 'cskh-tn', 'wt_a', 'wt_b', 'none']);
  assert.deepEqual(teams.find((t) => t.id === 'cskh-hn')!.members.map((m) => m.posUserId), ['c5']);
  assert.deepEqual(teams.find((t) => t.id === 'none')!.members.map((m) => m.posUserId), ['x']);
  assert.deepEqual(Object.fromEntries(parent), { wt_a: 'CSKH Hà Nội', wt_b: 'CSKH Hà Nội', 'cskh-hn': 'CSKH Hà Nội' });
  const groups = pickerGroups(teams.filter((t) => t.id !== 'none').map((t) => ({ id: t.id, name: t.name, office: null, mentor: null, group: parent.get(t.id) ?? null })));
  assert.deepEqual(groups.find((x) => x.label === 'CSKH Hà Nội')?.teams.map((t) => t.id).sort(), ['cskh-hn', 'wt_a', 'wt_b']);
  assert.deepEqual(overlayWebTeams(hr, []).teams, hr);
});

void test('cả team mẹ đã chia hết vào team con: thư mục chỉ còn các team con', () => {
  const { teams, parent } = overlayWebTeams([g('cskh-hn', 'CSKH Hà Nội', 'c1', 'c2')], [g('wt_a', 'Team 1', 'c1'), g('wt_b', 'Team 2', 'c2')]);
  assert.deepEqual(teams.map((t) => t.id), ['wt_a', 'wt_b']);
  assert.equal(parent.get('wt_b'), 'CSKH Hà Nội');
});
