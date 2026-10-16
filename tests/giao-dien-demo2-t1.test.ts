import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { D2Tray, D2Table, D2Trend, D2Section, type D2Column } from '../app/ui/d2';

void test('Demo 2 T1: tray preserves supplied metric names, values and comparison direction', () => {
  const html = renderToStaticMarkup(createElement(D2Tray, { metrics: [
    { id: 'sent', label: 'Đơn chuyển đi', value: '1.234', change: { label: '−2,0%', direction: 'down' }, onOpen: () => undefined },
    { id: 'net', label: 'Doanh số chuyển đi', value: '12,5 tr ₫', onOpen: () => undefined },
  ] }));
  assert.match(html, /Đơn chuyển đi · mở chi tiết/);
  assert.match(html, /Doanh số chuyển đi/);
  assert.match(html, /1\.234/);
  assert.match(html, /12,5 tr ₫/);
  assert.match(html, /d2-down/);
  assert.match(html, /−2,0%/);
  assert.equal((html.match(/<button/g) ?? []).length, 2);
});

void test('Demo 2 T1: table keeps caller cells, subtitles and status with an accessible scroll region', () => {
  type Row = { id: string; name: string; count: number };
  const columns: D2Column<Row>[] = [{ key: 'count', label: 'Đơn chuyển đi', numeric: true, render: (r) => String(r.count) }];
  const props = { title: 'Người lên đơn', columns, rows: [{ id: 'a', name: 'NV mẫu', count: 17 }], rowKey: (r: Row) => r.id, name: (r: Row) => r.name, subtitle: () => 'Team mẫu', status: () => 'Đã đồng bộ' };
  const html = renderToStaticMarkup(createElement(D2Table<Row>, props));
  for (const text of ['NV mẫu', 'Team mẫu', '17', 'Đã đồng bộ', 'tabindex="0"', 'scope="col"']) assert.ok(html.includes(text), text);
  const empty = renderToStaticMarkup(createElement(D2Table<Row>, { ...props, rows: [] }));
  assert.match(empty, /colSpan="3"/i);
  assert.match(empty, /Chưa có dữ liệu/);
  assert.doesNotMatch(empty, /NV mẫu/);
});

void test('Demo 2 T1: trend and section retain report value, comparison cutoff and custom content', () => {
  const html = renderToStaticMarkup(createElement(D2Trend, { title: 'Doanh số chuyển đi', value: '12,5 tr ₫', labels: ['16/10'], current: [17], previous: [null] }));
  assert.match(html, /12,5 tr ₫/);
  assert.match(html, /Kỳ trước cùng mốc giờ/);
  assert.match(html, /<canvas/);
  // eslint-disable-next-line react/no-children-prop -- Required component prop in a non-JSX render test.
  const section = renderToStaticMarkup(createElement(D2Section, { title: 'Chi tiết', note: 'Ghi chú', children: 'Nội dung hiện có' }));
  assert.match(section, /Nội dung hiện có/);
  assert.match(section, /Ghi chú/);
});
