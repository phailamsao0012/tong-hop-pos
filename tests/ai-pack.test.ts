import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assertPackSize, packMetrics, validAiDate } from '../lib/ai-pack';
import { demoAiPack } from '../lib/demo/ai-pack';
void test('ai-pack: gói ảo không xuất SĐT, tên khách, ghi chú', () => {
 const pack = demoAiPack('2026-10-17');
 assert.doesNotMatch(JSON.stringify(pack), /0\d{9}|customer|phone|message/i);
 assertPackSize(pack);
 assert.equal(packMetrics(pack)['rows.0.metrics.assigned'],40);
 assert.equal(validAiDate('2026-02-30'),false);
});
void test('ai-pack: từ chối gói vượt 1 MB thay vì cắt số', () => {
 const pack=demoAiPack('2026-10-17'); pack.scope='a'.repeat(1000001);
 assert.throws(()=>assertPackSize(pack));
});
