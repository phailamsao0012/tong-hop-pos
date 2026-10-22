import test from 'node:test';
import assert from 'node:assert/strict';
import { cfEstimate } from '../lib/cf-cost';
import { costProblems } from '../lib/watch-core';

const now = new Date('2026-10-22T08:00:00Z');
const usage = (o: Record<string, number>) => {
  const u = { at: '2026-10-22T07:30:00Z', start: '2026-10-17', end: '2026-11-16', daysElapsed: 6, daysTotal: 31, reads: 0, writes: 0, storageBytes: 4e9, requests: 0, cpuMs: 0,
    projReads: 0, projWrites: 0, projRequests: 0, projCpuMs: 0, ...o };
  return JSON.stringify({ ...u, estUsd: cfEstimate(u) });
};

void test('cfEstimate: trong gói là 5 USD, vượt đọc 30 tỷ = 5 + 5 USD', () => {
  assert.equal(cfEstimate({ projReads: 1e9, projWrites: 1e6, storageBytes: 1e9, projRequests: 1, projCpuMs: 1 }), 5);
  assert.equal(Math.round(cfEstimate({ projReads: 30e9, projWrites: 0, storageBytes: 0, projRequests: 0, projCpuMs: 0 }) * 100) / 100, 10);
});
void test('costProblems: 70% thì 🟠, vượt gói thì 🔴, số đo cũ quá 6 giờ thì bỏ qua', () => {
  assert.deepEqual(costProblems(usage({ projReads: 10e9 }), now).problems, []);
  assert.equal(costProblems(usage({ projReads: 20e9 }), now).problems[0].severity, 'medium');
  const over = costProblems(usage({ reads: 55e9, projReads: 280e9, writes: 30e6, projWrites: 155e6, storageBytes: 6.5e9 }), now).problems;
  assert.deepEqual(over.map((p) => [p.key, p.severity]), [['cf_reads', 'high'], ['cf_writes', 'high'], ['cf_storage', 'high'], ['cf_cost', 'high']]);
  assert.equal(costProblems(usage({ projReads: 280e9 }), new Date('2026-10-22T14:00:00Z')).ran, false);
  assert.equal(costProblems('hỏng', now).ran, false);
});
