// Tin Telegram về ứng viên: chỉ thông tin tuyển dụng tối thiểu, không SĐT / năm sinh / ghi chú / link CV (luật dữ liệu cá nhân, QA 11/10/2026).
import assert from 'node:assert/strict';
import { before, test } from 'node:test';
import { emptyDb } from './support/d1-sqlite';

let candidateText: typeof import('../lib/teams/recruit').candidateText;
let PERSONAL_COL: RegExp;
before(async () => {
  emptyDb({});
  ({ candidateText, PERSONAL_COL } = await import('../lib/teams/recruit'));
});

const cand = {
  id: 'x', file_id: 'f', file_name: 'Tuyển dụng T10', tab: 'Sale', row_num: 7, name: 'Trần Thị Hoa', phone: '0901234567', position: 'Sale', team: 'Team A', handler: 'Chị Lan',
  birth_year: '1999', received_on: '2026-10-09', cv_url: 'https://drive.google.com/file/d/abc/view', cv_file_id: 'abc', status: 'new', deleted_at: null, created_at: '', updated_at: '',
  data_json: JSON.stringify({ 'Họ và tên': 'Trần Thị Hoa', 'SĐT': '0901234567', 'Năm sinh': '1999', 'Vị trí': 'Sale', 'Ngày CV về': '09/10', 'Nhân sự phụ trách': 'Chị Lan', 'Ghi chú': 'đang mang thai', 'Email': 'hoa@example.com', 'Link CV': 'https://drive.google.com/file/d/abc/view', 'Lịch phỏng vấn': '12/10 9h', 'Cột lạ': 'bí mật' }),
} as unknown as Parameters<typeof candidateText>[0];

void test('tin ứng viên mới: không có SĐT, năm sinh, email, ghi chú, link CV, cột lạ', () => {
  const text = candidateText(cand, 'Ứng viên mới');
  for (const leak of ['0901234567', '1999', 'hoa@example.com', 'mang thai', 'drive.google.com', 'bí mật']) assert.ok(!text.includes(leak), `lộ "${leak}"`);
  assert.match(text, /Trần Thị Hoa/);
  assert.match(text, /Ngày CV về/);
  assert.match(text, /Lịch PV/);
  assert.match(text, /crm\.tonghopposmegatech\.io\.vn/);
});

void test('cột cá nhân nhận diện đúng, cột tuyển dụng không bị chặn nhầm', () => {
  for (const col of ['SĐT', 'Số điện thoại', 'Năm sinh', 'Email', 'Ghi chú', 'Link CV', 'Địa chỉ', 'Kết quả', 'KN làm việc']) assert.ok(PERSONAL_COL.test(col), col);
  for (const col of ['Ngày CV về', 'Vị trí', 'Sếp đánh giá CV', 'Lịch phỏng vấn', 'Pass PV', 'Nhân sự phụ trách', 'Team']) assert.ok(!PERSONAL_COL.test(col), col);
});
