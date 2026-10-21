import test from 'node:test';
import assert from 'node:assert/strict';
import { leadSuffix, pickerGroups } from '../lib/team-picker-groups';

const t = (id: string, name: string, office: string | null, mentor: string | null = null) => ({ id, name, office, mentor });

test('đuôi tên team: C/Chị gộp một, A/Anh gộp một', () => {
  assert.equal(leadSuffix('Sale TN C Lan'), 'C Lan');
  assert.equal(leadSuffix('Sale HN Chị Lan'), 'C Lan');
  assert.equal(leadSuffix('Team A. Minh'), 'A Minh');
  assert.equal(leadSuffix('Team 1'), null);
  assert.equal(leadSuffix('Sale OXY HN'), null);
});

test('team chưa gắn mentor vẫn vào nhóm theo đuôi tên; mentor nối thêm team không có đuôi', () => {
  const groups = pickerGroups([
    t('a', 'Sale HN C Lan', 'Hà Nội', 'Mentor Lan'),
    t('b', 'Sale TN C Lan', 'Thái Nguyên'),
    t('c', 'Sale Gà TN C Lan', 'Thái Nguyên'),
    t('d', 'Team Bắc', 'Hà Nội', 'Mentor Lan'),
    t('e', 'Sale OXY HN', 'Hà Nội', 'Mentor Khác'),
    t('f', 'Team 1', 'Hà Nội'),
  ]);
  const lan = groups.find((g) => g.label === 'Team C Lan');
  assert.deepEqual(lan?.teams.map((x) => x.id).sort(), ['a', 'b', 'c', 'd']);
  assert.equal(lan?.mentor, 'Mentor Lan');
  assert.deepEqual(groups.find((g) => g.teams.some((x) => x.id === 'e'))?.teams.map((x) => x.id), ['e']);
  assert.equal(groups.find((g) => g.teams.some((x) => x.id === 'f'))?.label, null);
});
