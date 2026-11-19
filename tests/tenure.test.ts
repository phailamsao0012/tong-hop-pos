import test from 'node:test';
import assert from 'node:assert/strict';
import { pickJoined, tenureMonths } from '../lib/teams/tenure';

void test('tenure: T0 là tháng đầu, đủ tháng mới lên bậc', () => {
  assert.equal(tenureMonths('2026-09-15', '2026-10-14'), 0);
  assert.equal(tenureMonths('2026-09-15', '2026-10-15'), 1);
  assert.equal(tenureMonths('2026-10-31', '2026-10-31'), 0);
  assert.equal(tenureMonths('2025-10-01', '2026-10-31'), 12);
  assert.equal(tenureMonths('2026-11-01', '2026-10-31'), null);
});

void test('tenure: ngày vào theo thứ tự nhân sự → tài khoản POS → đơn đầu', () => {
  assert.deepEqual(pickJoined([[null, 'tay'], ['2026-03-02', 'nhan-su'], ['2026-01-01', 'pancake']]), { joined: '2026-03-02', source: 'nhan-su' });
  assert.deepEqual(pickJoined([[undefined, 'tay'], [null, 'nhan-su'], ['2026-01-01T03:00:00Z', 'pancake']]), { joined: '2026-01-01', source: 'pancake' });
  assert.equal(pickJoined([[null, 'tay'], ['', 'nhan-su']]), null);
});

void test('ngày vào vô lý (trước 2010) bị bỏ, dùng nguồn kế tiếp; sửa tay giữ nguyên', () => {
  assert.deepEqual(pickJoined([[null, 'tay'], ['2004-01-02', 'nhan-su'], ['2025-12-03', 'pancake']]), { joined: '2025-12-03', source: 'pancake' });
  assert.deepEqual(pickJoined([['2008-05-01', 'tay'], ['2025-12-03', 'pancake']]), { joined: '2008-05-01', source: 'tay' });
  assert.equal(pickJoined([['1970-01-01', 'pancake']]), null);
});

void test('ngày vào 19/11: lấy hồ sơ nhân sự theo mã NV trong tên, không theo hồ sơ gắn nhầm', async () => {
  const { resolveJoin, hrJoinByCode, nameNvCode } = await import('../lib/teams/join-date');
  const hrByCode = hrJoinByCode([{ code: 'NV902', joined_on: '2025-06-25' }, { code: 'NV903', joined_on: '2026-04-01' }, { code: 'MT0903', joined_on: '2025-03-12' }, { code: 'NV904', joined_on: '2026-10-13' }]);
  assert.equal(nameNvCode('NV 906 - Hoàng Văn Dũng CSKH'), 906);
  assert.equal(nameNvCode('NV907- Vũ Thị Em SALE'), 907);
  assert.equal(nameNvCode('L BÌNH SALE'), null);
  // NV901 gắn nhầm hồ sơ NV902, web nhân sự chưa có NV901 → bỏ web nhân sự, lấy ngày tạo tài khoản.
  assert.deepEqual(resolveJoin({ names: ['NV901 - Trần Văn An  CSKH'], hrLinked: '2025-06-25', hrByCode, created: '2026-06-27', firstActive: '2026-07-01' }), { joined: '2026-06-27', source: 'pancake' });
  // NV903 gắn hồ sơ MT0903 → lấy hồ sơ NV903.
  assert.deepEqual(resolveJoin({ names: ['NV903 - Lê Thị Bình MKT'], hrLinked: '2025-03-12', hrByCode, created: '2026-04-02', firstActive: '2026-04-06' }), { joined: '2026-04-01', source: 'nhan-su' });
  // Tên chưa có mã: theo hồ sơ đang gắn như cũ; một POS đã đổi tên có mã thì dùng mã đó.
  assert.deepEqual(resolveJoin({ names: ['L BÌNH SALE'], hrLinked: '2026-04-01', hrByCode, created: '2026-09-14', firstActive: '2026-09-14' }), { joined: '2026-04-01', source: 'nhan-su' });
  assert.deepEqual(resolveJoin({ names: ['Lê Thị Bình Sale', 'NV903 - Lê Thị Bình MKT'], hrLinked: null, hrByCode, created: null }), { joined: '2026-04-01', source: 'nhan-su' });
  // Sửa tay luôn thắng.
  assert.deepEqual(resolveJoin({ manual: '2024-01-02', names: ['NV903 - X MKT'], hrByCode, firstActive: '2026-04-06' }), { joined: '2024-01-02', source: 'tay' });
});

void test('ngày vào 19/11: không muộn hơn ngày hoạt động đầu tiên quá 30 ngày (hồ sơ ghi sai năm)', async () => {
  const { resolveJoin, hrJoinByCode } = await import('../lib/teams/join-date');
  const hrByCode = hrJoinByCode([{ code: 'NV904', joined_on: '2026-10-13' }, { code: 'NV905', joined_on: '2025-07-03' }]);
  assert.deepEqual(resolveJoin({ names: ['NV904 - Đỗ Thị Chi CSKH'], hrByCode, created: '2025-10-16', firstActive: '2025-10-16' }), { joined: '2025-10-16', source: 'hoat-dong' });
  // Lệch trong 30 ngày (thử việc trước ngày ghi trên hồ sơ) thì giữ hồ sơ.
  assert.deepEqual(resolveJoin({ names: ['NV905 - X CSKH'], hrByCode, firstActive: '2025-06-10' }), { joined: '2025-07-03', source: 'nhan-su' });
  // Không có nguồn nào ngoài hoạt động.
  assert.deepEqual(resolveJoin({ names: ['Ai Đó'], hrByCode, firstActive: '2026-01-05' }), { joined: '2026-01-05', source: 'hoat-dong' });
  // Mã trùng hai hồ sơ thì không đoán.
  const dup = hrJoinByCode([{ code: 'NV001', joined_on: '2025-01-01' }, { code: 'NV0001', joined_on: '2026-01-01' }]);
  assert.equal(dup.has(1), false);
});
