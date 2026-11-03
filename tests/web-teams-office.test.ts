import assert from 'node:assert/strict';
import { test } from 'node:test';

void test('team ở cả hai chi nhánh: bấm Hà Nội rồi Thái Nguyên giữ cả hai, bấm lại thì bỏ đúng một', async () => {
  const { officeList, officeLabel, toggleOffice, validateWebTeams } = await import('../lib/teams/web-teams');
  const both = toggleOffice(toggleOffice(null, 'Hà Nội'), 'Thái Nguyên');
  assert.equal(both, 'Hà Nội,Thái Nguyên');
  assert.deepEqual(officeList(both), ['Hà Nội', 'Thái Nguyên']);
  assert.equal(officeLabel(both), 'Hà Nội · Thái Nguyên');
  assert.equal(toggleOffice(both, 'Hà Nội'), 'Thái Nguyên');
  assert.equal(toggleOffice('Thái Nguyên', 'Thái Nguyên'), null);
  const v = validateWebTeams([{ id: 'wt_00000000-0000-0000-0000-000000000001', name: 'Team demo', dept: 'cskh', office: 'Hà Nội, Thái Nguyên', memberIds: [] }]);
  assert.equal(v.teams?.[0].office, 'Hà Nội,Thái Nguyên');
});
