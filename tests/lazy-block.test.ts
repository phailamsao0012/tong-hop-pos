import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { LazyBlock } from '../app/lazy-block';

// Không có IntersectionObserver (máy chủ, trình duyệt cũ): dựng ngay như cũ, không kẹt khung chờ.
void test('LazyBlock renders children at once without IntersectionObserver', () => {
  const html = renderToStaticMarkup(createElement(LazyBlock, null, createElement('p', null, 'so-lieu')));
  assert.ok(html.includes('<p>so-lieu</p>'));
  assert.ok(!html.includes('aria-busy'));
});
