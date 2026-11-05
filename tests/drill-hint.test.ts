// Bấm số giữ nhóm đơn (đánh giá 21/10/2026): gợi ý điều hướng và các trang đích.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SEGMENT_AWARE_VIEWS, SEGMENT_HINT, segmentDrillHint, segmentFromHint } from '../lib/shared/drill-hint';

void test('drill-hint: chỉ gửi nhóm đơn hợp lệ, "Tất cả" thì không gửi', () => {
  assert.deepEqual(segmentDrillHint('gentadox'), { [SEGMENT_HINT]: 'gentadox' });
  assert.deepEqual(segmentDrillHint('oxy'), { [SEGMENT_HINT]: 'oxy' });
  assert.equal(segmentDrillHint('all'), null);
  assert.equal(segmentDrillHint('khong-co'), null);
  assert.equal(segmentFromHint('skgk'), 'skgk');
  assert.equal(segmentFromHint(undefined), null);
  assert.equal(segmentFromHint('all'), null);
  assert.equal(segmentFromHint('<script>'), null);
});

const read = (file: string) => readFileSync(new URL(`../app/${file}`, import.meta.url), 'utf8');
const VIEW_FILE: Record<string, string> = {
  'sale-overview': 'team-overview-view.tsx', 'cskh-overview': 'team-overview-view.tsx',
  marketing: 'marketing-view.tsx', 'mkt-roas': 'mkt-roas-view.tsx', 'van-don': 'van-don-view.tsx',
};

void test('drill-hint: mọi trang đích của ô số Tổng quan POS hoặc áp nhóm đơn, hoặc báo rõ là chưa lọc', () => {
  const sections = read('overview-sections.tsx');
  assert.match(sections, /segmentDrillHint\(productSegment\)/);
  assert.match(read('overview-view.tsx'), /segmentDrillHint\(productSegment\)/);
  const views = [...new Set([...sections.matchAll(/view: '([a-z-]+)'/g)].map((m) => m[1]))].sort();
  assert.deepEqual(views, ['cskh-overview', 'marketing', 'mkt-roas', 'sale-overview', 'van-don']);
  for (const view of views) {
    const src = read(VIEW_FILE[view]);
    if (SEGMENT_AWARE_VIEWS.has(view)) {
      assert.match(src, /segmentFromHint\(takeNavHint\(SEGMENT_HINT\)\)/, view);
      assert.match(src, /productSegment=\$\{segment\}/, view);
    } else {
      assert.match(src, /<SegmentHintNote \/>/, view);
    }
  }
});
