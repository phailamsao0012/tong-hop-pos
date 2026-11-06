// Chia team chọn bộ phận trước, Mentor / Leader là người trong team (anh Vũ 06/11/2026). Tên, mã đều giả.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { deptOf, staffDept } from '../lib/teams/team-sheet';
import { validateWebTeams } from '../lib/teams/web-teams';
import { validateMarketingTeams } from '../lib/teams/marketing-teams';

const WT = 'wt_00000000-0000-0000-0000-000000000001';
const VD = 'vd_00000000-0000-0000-0000-000000000002';

void test('bộ phận: nhận Vận đơn theo tên nhóm hoặc bộ phận Pancake; hậu tố tên vẫn ưu tiên', () => {
  assert.equal(deptOf('Vận đơn: 4'), 'vandon');
  assert.equal(staffDept({ id: 'p1', name: 'Nguyễn Văn A', department: 'Vận đơn' }), 'vandon');
  assert.equal(staffDept({ id: 'p2', name: 'Trần Thị B CSKH', department: 'Vận đơn' }), 'cskh');
  assert.equal(staffDept({ id: 'p3', name: 'Lê Văn C', department: 'Kế toán' }), null);
});

void test('Mentor / Leader chọn trong team được lưu; người ngoài team bị từ chối', () => {
  const ok = validateWebTeams([{ id: WT, name: 'Team thử', dept: 'sale', office: null, memberIds: ['p1', 'p2'], mentorPosId: 'p1', leaderPosId: 'p2' }]);
  assert.equal(ok.teams?.[0].mentorPosId, 'p1');
  assert.equal(ok.teams?.[0].leaderPosId, 'p2');
  assert.equal(ok.teams?.[0].mentorUserId, null, 'không cần tài khoản web');
  const bad = validateWebTeams([{ id: WT, name: 'Team thử', dept: 'sale', office: null, memberIds: ['p1'], mentorPosId: 'p9' }]);
  assert.match(bad.error ?? '', /người trong team/);
});

void test('team Vận đơn: mã vd_, một người một team, Mentor trong team', () => {
  const ok = validateMarketingTeams([{ id: VD, name: 'Vận đơn HN', memberIds: ['p1', 'p2'], leaderPosId: 'p2' }], 'vd', 'Vận đơn');
  assert.equal(ok.teams?.[0].leaderPosId, 'p2');
  assert.match(validateMarketingTeams([{ id: VD, name: 'Vận đơn HN', memberIds: [] }]).error ?? '', /không hợp lệ/, 'mã vd_ không lọt vào team MKT');
  assert.match(validateMarketingTeams([{ id: VD, name: 'A', memberIds: ['p1'] }, { id: VD.replace('2', '3'), name: 'B', memberIds: ['p1'] }], 'vd', 'Vận đơn').error ?? '', /một team Vận đơn/);
});

void test('team MKT / Vận đơn lưu được cả hai chi nhánh', () => {
  const ok = validateMarketingTeams([{ id: VD, name: 'Vận đơn', memberIds: [], office: 'Hà Nội,Thái Nguyên' }], 'vd', 'Vận đơn');
  assert.equal(ok.teams?.[0].office, 'Hà Nội,Thái Nguyên');
});
