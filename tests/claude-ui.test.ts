import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { AiMarkdown, markdownBlocks } from '../app/forecast-card';
import { canView, OWNER_VIEWS, parseAccess, VIEW_LABELS } from '../lib/access';

void test('C5 markdown supports bold, bullets and paragraphs', () => {
  assert.deepEqual(markdownBlocks('Đoạn\n- **Đậm** chữ'), [
    { list: false, spans: [{ bold: false, text: 'Đoạn' }] },
    { list: true, spans: [{ bold: true, text: 'Đậm' }, { bold: false, text: ' chữ' }] },
  ]);
});
void test('C5 markdown escapes HTML including inside bold text', () => {
  const html = renderToStaticMarkup(createElement(AiMarkdown, { text: '<script>alert(1)</script>\n- **<img src=x onerror=alert(1)>**' }));
  assert.ok(!html.includes('<script>'));
  assert.ok(!html.includes('<img'));
  assert.ok(html.includes('&lt;script&gt;'));
  assert.ok(html.includes('<strong>&lt;img'));
});
void test('C5 ai-ask is owner-only even when explicitly granted', () => {
  assert.ok(OWNER_VIEWS.includes('ai-ask'));
  assert.equal(VIEW_LABELS['ai-ask'], 'Hỏi AI');
  assert.ok(canView(parseAccess({ role: 'owner' }), 'ai-ask'));
  for (const role of ['director', 'lead', 'mentor', 'staff']) assert.equal(canView(parseAccess({ role, views_json: '["ai-ask"]' }), 'ai-ask'), false);
});
