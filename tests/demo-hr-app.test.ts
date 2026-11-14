import test from 'node:test';
import assert from 'node:assert/strict';
import { demoHrApp, demoHrOverview } from '../lib/demo/hr-app';
import { STAFF } from '../lib/demo/world';

test('demo HR overview counts people working at the end of the period', () => {
  const o = demoHrOverview('2026-11-01', '2026-11-13');
  const working = STAFF.filter((s) => s.joined <= '2026-11-13' && (!s.left || s.left > '2026-11-13')).length;
  assert.equal(o.total.end, working);
  assert.equal(o.offices.reduce((n, x) => n + x.headcount, 0), working);
  assert.equal(o.departments.reduce((n, x) => n + x.headcount, 0), working);
  assert.equal(o.series.length, 6);
  assert.equal(o.series.at(-1)?.month, '2026-11');
  assert.equal(o.joined.length, o.total.joined);
  assert.equal(o.left.length, o.total.left);
});

test('demo HR app answers overview and badge, nothing else', () => {
  const o = demoHrApp('/api/v1/app/overview?from=2026-10-01&to=2026-10-31', '2026-11-13') as { from: string; to: string };
  assert.equal(o.from, '2026-10-01');
  assert.equal(o.to, '2026-10-31');
  const d = demoHrApp('/api/v1/app/overview', '2026-11-13') as { from: string; to: string };
  assert.deepEqual([d.from, d.to], ['2026-11-01', '2026-11-13']);
  assert.deepEqual(demoHrApp('/api/v1/app/badge', '2026-11-13'), { pending: 0 });
  assert.equal(demoHrApp('/api/v1/app/people', '2026-11-13'), null);
});
