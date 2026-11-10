import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validInsight, checkEvidence, evidenceText, insightForDisplay } from '../lib/ai/ai-insight';
import { demoAiPack, demoInsight } from '../lib/demo/ai-pack';
import { emptyDb } from './support/d1-sqlite';
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

void test('ai-insight: lời giải thích có ngày, tên giả, phần trăm, tiền và so sánh', () => {
 const p = demoAiPack('2026-10-17');
 p.rows[0].metrics.closeRate = 0.25;
 p.rows[0].metrics.net = 1200000;
 const e = { metric: 'rows.0.metrics.assigned', value: 40, compare: null };
 assert.equal(evidenceText(e, p, p.date, { 'NV A': 'NV A' }), '17/10 · NV A · Số được chia 40');
 assert.equal(evidenceText({ ...e, metric: 'rows.99.metrics.net' }, p, p.date), 'số trong gói ngày 17/10');
 assert.equal(evidenceText(e, null, p.date), 'số trong gói ngày 17/10');
 assert.equal(evidenceText(e, { ...p, date: '2026-10-16' }, p.date), 'số trong gói ngày 17/10');
 assert.equal(evidenceText(e, p, p.date, {}, { 'Team Sale 1': 'Team Sale 1' }), '17/10 · Team Sale 1 · Số được chia 40');
 assert.match(evidenceText({ ...e, metric: 'rows.0.metrics.closeRate', value: 0.25, compare: 0.2 }, p, p.date), /25%.*20%/);
 assert.match(evidenceText({ ...e, metric: 'rows.0.metrics.net', value: 1200000, compare: 1000000 }, p, p.date), /1\.200\.000.*₫.*1\.000\.000.*₫/);
});

void test('ai-insight: lấy tên từ bản chép HR, không thêm tên vào gói PC', async () => {
 const { raw, db } = emptyDb();
 try {
  const pack = demoAiPack('2026-10-17');
  pack.rows[0].staff = 'staff-a';
  raw.prepare("INSERT INTO hr_pos_team (pos_user_id, employee_id, employee_name, team, status) VALUES ('staff-a', 'employee-a', 'NV A', 'sale', 'active')").run();
  const before = JSON.stringify(pack);
  const result = await insightForDisplay(db, demoInsight(pack.date), pack);
  assert.equal(result.items[0].evidence[0].text, '17/10 · NV A · Số được chia 40');
  assert.equal(result.items[0].verified, true);
  assert.equal(JSON.stringify(pack), before);
  const missing = await insightForDisplay(db, demoInsight(pack.date), null);
  assert.equal(missing.items[0].evidence[0].text, 'số trong gói ngày 17/10');
  assert.equal(missing.items[0].verified, false);
 } finally { raw.close(); }
});
