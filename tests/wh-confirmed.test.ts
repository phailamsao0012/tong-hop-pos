import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { WH_CONFIRMED_SQL, isWhConfirmed } from '../lib/reports/van-don';

const confirmedAt = '2026-10-14T03:00:00Z';
const cases = [
  {
    name: 'mã 17 chưa xác nhận',
    status_code: 17,
    first_confirmed_at: null,
    expected: false,
  },
  { name: 'mã 1', status_code: 1, first_confirmed_at: null, expected: true },
  {
    name: 'mã 2 thiếu lịch sử xác nhận',
    status_code: 2,
    first_confirmed_at: null,
    expected: true,
  },
  {
    name: 'mã 6 hủy sau xác nhận',
    status_code: 6,
    first_confirmed_at: confirmedAt,
    expected: true,
  },
  {
    name: 'mã 6 hủy chưa xác nhận',
    status_code: 6,
    first_confirmed_at: null,
    expected: false,
  },
  { name: 'mã 3', status_code: 3, first_confirmed_at: null, expected: true },
  {
    name: 'mã 0 luôn bị loại',
    status_code: 0,
    first_confirmed_at: null,
    expected: false,
  },
  {
    name: 'mã 7 có giờ xác nhận vẫn bị loại',
    status_code: 7,
    first_confirmed_at: confirmedAt,
    expected: false,
  },
];

for (const { name, status_code, first_confirmed_at, expected } of cases) {
  void test(`xác nhận kho: ${name}`, () => {
    const db = new DatabaseSync(':memory:');
    try {
      // Mã Mới phải bị loại ngay cả khi dữ liệu có giờ xác nhận.
      const timestamps =
        status_code === 0 ? [null, confirmedAt] : [first_confirmed_at];
      for (const at of timestamps) {
        assert.equal(
          isWhConfirmed({ status_code, first_confirmed_at: at }),
          expected,
        );
        // Chạy SQL thật trên SQLite, kiểm cả alias mặc định và alias được truyền vào.
        for (const alias of ['o', 'orders']) {
          const condition =
            alias === 'o' ? WH_CONFIRMED_SQL() : WH_CONFIRMED_SQL(alias);
          const row = db
            .prepare(`SELECT CASE WHEN ${condition} THEN 1 ELSE 0 END AS confirmed
            FROM (SELECT ? AS status_code, ? AS first_confirmed_at) ${alias}`)
            .get(status_code, at) as { confirmed: number };
          assert.equal(row.confirmed, Number(expected));
        }
      }
    } finally {
      db.close();
    }
  });
}
