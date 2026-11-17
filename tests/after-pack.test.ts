import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { AFTER_PACK_CANCELLED_SQL, AFTER_PACK_RETURNED_SQL, PACKED_SQL, afterPackOutcome } from '../lib/reports/van-don';

// Anh Vũ 12/11/2026: đơn đi bị hủy khi chưa giao ĐVVC → hủy; hoàn hoặc hủy sau khi đã giao ĐVVC → hoàn.
const h = (...s: number[]) => JSON.stringify(s.map((status) => ({ status })));
const cases: { name: string; status_code: number; status_history_json: string | null; want: 'returned' | 'cancelled' | null }[] = [
  { name: 'đang đóng hàng', status_code: 8, status_history_json: h(1, 8), want: null },
  { name: 'đã nhận', status_code: 3, status_history_json: h(1, 8, 2, 3), want: null },
  { name: 'đang hoàn', status_code: 4, status_history_json: h(1, 8, 2, 4), want: 'returned' },
  { name: 'đã hoàn', status_code: 5, status_history_json: h(1, 8, 2, 4, 5), want: 'returned' },
  { name: 'hủy sau đóng hàng, chưa gửi', status_code: 6, status_history_json: h(1, 8, 9, 6), want: 'cancelled' },
  { name: 'hủy sau khi đã gửi', status_code: 6, status_history_json: h(1, 8, 9, 2, 6), want: 'returned' },
  { name: 'hủy trước đóng hàng (không phải đơn đi)', status_code: 6, status_history_json: h(1, 6), want: null },
  { name: 'lịch sử hỏng', status_code: 6, status_history_json: '{oops', want: null },
];

void test('afterPackOutcome: hủy / hoàn theo đã giao ĐVVC hay chưa', () => {
  for (const c of cases) assert.equal(afterPackOutcome(c), c.want, c.name);
});

void test('AFTER_PACK_*_SQL khớp bản TS', () => {
  const db = new DatabaseSync(':memory:');
  db.exec('CREATE TABLE o (id INTEGER PRIMARY KEY, status_code INTEGER, status_history_json TEXT)');
  const ins = db.prepare('INSERT INTO o (id, status_code, status_history_json) VALUES (?,?,?)');
  cases.forEach((c, i) => ins.run(i, c.status_code, c.status_history_json));
  const rows = db.prepare(`SELECT id, ${PACKED_SQL('o')} AS packed, ${AFTER_PACK_CANCELLED_SQL('o')} AS c, ${AFTER_PACK_RETURNED_SQL('o')} AS r FROM o ORDER BY id`).all() as { id: number; packed: number; c: number; r: number }[];
  for (const row of rows) {
    const want = cases[row.id].want;
    const got = row.packed ? (row.r ? 'returned' : row.c ? 'cancelled' : null) : null;
    assert.equal(got, want, cases[row.id].name);
    assert.ok(!(row.c && row.r), `không được vừa hủy vừa hoàn: ${cases[row.id].name}`);
  }
});
