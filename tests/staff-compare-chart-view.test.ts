import assert from 'node:assert/strict';
import { mock, test } from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { CompareStrip, seriesCut, type StaffCompare, type StaffCompareReport } from '../app/staff-compare';
import type { CompareChart } from '../lib/compare-chart';

void test('W5: CompareStrip đọc chart cả đội/focus cho ba kiểu vẽ, không đọc points/series cũ hay tự gộp lại', () => {
  let readTeam = 0, readFocus = 0;
  const point = { closed: 3, closedNet: 350, closeRate: 25, cumClosed: 7, cumClosedNet: 800 };
  const teamChart: CompareChart = { len: 1, get current() { readTeam++; return [point]; }, previous: [null] };
  const focusChart: CompareChart = { len: 1, get current() { readFocus++; return [point]; }, previous: [null] };
  const total = { closed: 3, closedNet: 350, created: 4, createdClosed: 1, closeRate: 25 };
  const side = { total, get points(): never { throw new Error('Không đọc points cũ'); } };
  const r = {
    bucket: 'day', group: 2, period: { start: '2026-09-01', end: '2026-09-03' },
    compare: { start: '2026-08-01', end: '2026-08-03', cutoff: null },
    current: side, previous: side, chart: teamChart,
  };
  const focus = {
    name: 'NV A', current: total, previous: total, chart: focusChart, onClear: () => {},
    get series(): never { throw new Error('Không đọc series cũ'); },
  };
  for (const kind of ['wave', 'diff', 'cum'] as const) {
    const c = { api: { data: r }, kind, mode: 'previous', steps: [], step: 1, len: 3 } as unknown as StaffCompare;
    const beforeTeam = readTeam, beforeFocus = readFocus;
    assert.match(renderToStaticMarkup(createElement(CompareStrip, { c, metric: 'closeRate' })), /Đang xem cả đội/);
    assert.equal(readTeam, beforeTeam + 1);
    assert.equal(readFocus, beforeFocus);
    assert.match(renderToStaticMarkup(createElement(CompareStrip, { c, metric: 'closeRate', focus })), /NV A/);
    assert.equal(readFocus, beforeFocus + 1);
    assert.equal(readTeam, beforeTeam + 1);
  }
});

void test('W5: seriesCut dùng cutoff API, không dùng giờ máy khi bản nhớ vắt qua đầu giờ', () => {
  const r = { bucket: 'hour', compare: { cutoff: '10:59' } } as StaffCompareReport;
  const clock = mock.method(Date, 'now', () => Date.parse('2026-10-15T04:01:00Z'));
  try {
    assert.equal(seriesCut(r), 11);
    assert.equal(seriesCut({ ...r, bucket: 'day' }), null);
    assert.equal(seriesCut({ ...r, compare: { ...r.compare, cutoff: null } }), null);
    assert.equal(seriesCut(null), null);
  } finally {
    clock.mock.restore();
  }
});
