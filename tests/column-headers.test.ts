import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import assert from 'node:assert/strict';
import test from 'node:test';
import { SortTh, Th, InfoTip } from '../app/ui-kit';

void test('tiêu đề sắp xếp giữ khóa, tên đủ và giải thích cũ', () => {
  const html = renderToStaticMarkup(h(SortTh, {
    k: 'orders', label: h('span', { title: 'Giải thích cũ' }, 'Đơn theo mốc'),
    sort: { key: 'orders', desc: true, toggle: () => {}, mark: () => '' },
  }));
  assert.match(html, /data-full="Đơn theo mốc"/);
  assert.match(html, /aria-label="Đơn theo mốc"/);
  assert.match(html, /aria-sort="descending"/);
  assert.match(html, /Đơn mốc/);
  assert.match(html, /Giải thích cũ/);
  assert.match(html, /Bấm để sắp xếp/);
});
void test('cột thường giữ colspan và nút giải thích khi viết tắt', () => {
  const html = renderToStaticMarkup(h(Th, { colSpan: 2 }, h('span', {}, 'KPI doanh thu', h(InfoTip, { text: 'Mục tiêu tháng' }))));
  assert.match(html, /colSpan="2"/i);
  assert.match(html, /KPI DT/);
  assert.match(html, /data-full="KPI doanh thu"/);
  assert.match(html, /Mục tiêu tháng/);
  assert.match(html, /<button/);
});
void test('giữ cột hai âm tiết và tên dữ liệu không có trong từ điển', () => {
  assert.match(renderToStaticMarkup(h(Th, {}, 'Doanh thu')), />Doanh thu<\/th>/);
  assert.match(renderToStaticMarkup(h(Th, {}, 'Sản phẩm mẫu thử')), />Sản phẩm mẫu thử<\/th>/);
});
