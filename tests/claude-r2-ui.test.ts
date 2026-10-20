import test from 'node:test';
import assert from 'node:assert/strict';
import { formatMonthlySpend } from '../app/ai-ask-view';
import { formatReviewDate, formatReviewWeek } from '../app/forecast-card';

void test('R2 monthly spend shows zero, small amounts and two decimal places', () => {
  assert.equal(formatMonthlySpend(0), '0,00 USD');
  assert.equal(formatMonthlySpend(0.004), 'dưới 0,01 USD');
  assert.equal(formatMonthlySpend(12.345), '12,35 USD');
  assert.equal(formatMonthlySpend(0.01), '0,01 USD');
});

void test('R2 review dates use Vietnamese day/month/year and compact week ranges', () => {
  assert.equal(formatReviewDate('2026-10-18'), '18/10/2026');
  assert.equal(formatReviewWeek('2026-10-12'), '12/10 – 18/10/2026');
  assert.equal(formatReviewWeek('2026-10-26'), '26/10 – 01/11/2026');
  assert.equal(formatReviewWeek('2026-12-28'), '28/12/2026 – 03/01/2027');
});
