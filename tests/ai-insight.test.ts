import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validInsight, checkEvidence } from '../lib/ai-insight';
import { demoAiPack, demoInsight } from '../lib/demo/ai-pack';
void test('ai-insight: schema chặn sai JSON, thừa trường, chuỗi dài, HTML và link', () => {
 const x=demoInsight('2026-10-17'); assert.equal(validInsight(x),true);
 for (const value of [null, [], {...x, extra:true}, {...x,summary:'a'.repeat(601)}, {...x,summary:'<b>abc</b>'}, {...x,summary:'https://example.com'}, {...x,items:Array(31).fill(x.items[0])}]) assert.equal(validInsight(value),false);
});
void test('ai-insight: đối chiếu số và ngày của gói, gắn cờ số không có', () => {
 const x=demoInsight('2026-10-17'), p=demoAiPack(x.date);
 assert.equal(checkEvidence(x,p)[0].verified,true);
 x.items[0].evidence[0].value=41; assert.equal(checkEvidence(x,p)[0].verified,false);
 x.items[0].evidence[0].value=40; x.date='2026-10-18'; assert.equal(checkEvidence(x,p)[0].verified,false);
});
