import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

void test('KPI refresh pseudo-elements do not show overlapping status labels', () => {
  const css = readFileSync(new URL('../app/globals.css', import.meta.url), 'utf8');
  for (const rule of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const [, selectors, declarations] = rule;
    if (!selectors.split(',').some((selector) => /\.kpi\b[^{}]*::after\b/.test(selector))) continue;
    for (const content of declarations.matchAll(/\bcontent\s*:\s*([^;}]*)/gi)) {
      assert.doesNotMatch(content[1], /Mới|Đang cập nhật/, `Nhãn chồng lên ô KPI: ${selectors.trim()}`);
    }
  }
});
