// Luật tên số ở trang Vận đơn (AGENTS.md): không gọi doanh thu / doanh số trơn, dùng "Doanh số chuyển đi" (đánh giá 21/10/2026).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/** Bỏ chú thích (// …, /* … *\/, {/* … *\/}) để chỉ xét chữ hiện trên web và chữ trong định nghĩa. */
const visibleText = (src: string) => src.replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

void test('Vận đơn: không còn chữ "Doanh số" trơn, chỉ "Doanh số chuyển đi"', () => {
  const src = visibleText(readFileSync(new URL('../app/van-don-view.tsx', import.meta.url), 'utf8'));
  const plain = [...src.matchAll(/doanh số(?! chuyển đi)/giu)].map((m) => src.slice(Math.max(0, m.index - 40), m.index + 30));
  assert.deepEqual(plain, []);
  assert.ok(/Doanh số chuyển đi \{money\(c\.net\)\}/.test(src), 'dòng tiền dưới thẻ ghi "Doanh số chuyển đi"');
  assert.ok(/<th>Doanh số chuyển đi<\/th>/.test(src), 'cột tiền ở bảng chi tiết ghi "Doanh số chuyển đi"');
});
