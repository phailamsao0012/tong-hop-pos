import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type Anthropic from '@anthropic-ai/sdk';
import { aiParts, AiMarkdown, parseChart, personDeviation, waterfallSteps } from '../app/forecast-card';
import { formatAnswerCost } from '../app/ai-ask-view';
import { askClaude, ASK_PRIOR_TURNS, askHistory, spendSummary } from '../lib/ai/ai-ask';
import { fakeAnswer } from '../lib/demo/fake-claude';
import { addDays, todayVn } from '../lib/shared/report-time';
import { emptyDb } from './support/d1-sqlite';

void test('Biểu đồ trong câu trả lời: tiêu đề, số âm, dấu phẩy, tối đa 12 dòng, dòng sai bỏ qua', () => {
  assert.deepEqual(parseChart('Tỷ lệ chốt (%)\nA;12.5\nB;−3\nC; 4,5\nrác\nD;abc'), { title: 'Tỷ lệ chốt (%)', rows: [{ label: 'A', value: 12.5 }, { label: 'B', value: -3 }, { label: 'C', value: 4.5 }] });
  assert.deepEqual(parseChart('A;1\nB;2'), { title: '', rows: [{ label: 'A', value: 1 }, { label: 'B', value: 2 }] });
  assert.equal(parseChart('Chỉ có tiêu đề\nkhông số'), null);
  assert.equal(parseChart(Array.from({ length: 20 }, (_, i) => `N${i};${i}`).join('\n'))!.rows.length, 12);
  assert.deepEqual(parseChart('Nhãn có; chấm phẩy;7')!.rows, [{ label: 'Nhãn có; chấm phẩy', value: 7 }]);
  assert.deepEqual(parseChart('T\nA;+12.5')!.rows, [{ label: 'A', value: 12.5 }]);
});

void test('Tách chữ và biểu đồ: khối đóng, khối bị cắt, khối sai thì hiện như chữ', () => {
  const parts = aiParts('Mở đầu\n```bieudo\nT\nA;1\nB;-2\n```\nKết');
  assert.deepEqual(parts.map(p => p.kind), ['text', 'chart', 'text']);
  assert.deepEqual(aiParts('Đầu\n```bieudo\nT\nA;1').map(p => p.kind), ['text', 'chart']);
  // Khối chưa đóng rồi có chữ (câu báo bị cắt): chữ không bị nuốt.
  const cut = aiParts('```bieudo\nT\nA;1\nB;2\nCâu trả lời bị cắt vì đạt giới hạn độ dài.');
  assert.deepEqual(cut.map(p => p.kind), ['chart', 'text']);
  assert.ok(cut[1].kind === 'text' && /bị cắt/.test(cut[1].text));
  const bad = aiParts('```bieudo\nkhông có số\n```');
  assert.deepEqual(bad, [{ kind: 'text', text: 'không có số\n' }]);
  assert.deepEqual(aiParts('Không có biểu đồ'), [{ kind: 'text', text: 'Không có biểu đồ' }]);
});

void test('AiMarkdown vẽ thanh, gom gạch đầu dòng, vẫn escape HTML trong nhãn biểu đồ', () => {
  const html = renderToStaticMarkup(createElement(AiMarkdown, { text: '- Một\n- Hai\nĐoạn\n```bieudo\n<b>T</b>\n<img src=x onerror=alert(1)>;5\nB;-2\n```' }));
  assert.equal(html.match(/<ul class="list-disc/g)?.length, 1);
  assert.ok(html.includes('<figure'));
  assert.ok(!html.includes('<img'));
  assert.ok(html.includes('&lt;img src=x'));
  assert.ok(html.includes('var(--bad)') && html.includes('var(--good)'));
  // Không có số âm: một màu, không chia đôi.
  const plain = renderToStaticMarkup(createElement(AiMarkdown, { text: '```bieudo\nA;1\nB;2\n```' }));
  assert.ok(plain.includes('var(--primary)') && !plain.includes('var(--bad)'));
});

const parts = { soChia: -300, tiLeChot: -500, giaTriDon: 200, nghi: -100, moi: 0, khac: 40, chuaGan: 10 };
void test('Biểu đồ thác: dự báo cộng từng phần ra đúng thực tế; người mới bằng 0 thì bỏ', () => {
  const steps = waterfallSteps({ forecast: 10000, actual: 9350, parts });
  assert.deepEqual(steps.map(s => s.label), ['Dự báo', 'Số chia', 'Tỷ lệ chốt', 'Giá trị đơn', 'Người nghỉ', 'Khác', 'Thực tế']);
  const lastPart = steps[steps.length - 2];
  assert.equal(lastPart.to, 9350);
  assert.equal(steps.find(s => s.label === 'Khác')!.to - steps.find(s => s.label === 'Khác')!.from, 50);
  assert.ok(waterfallSteps({ forecast: 10000, actual: 10100, parts: { ...parts, moi: 750 } }).some(s => s.label === 'Người mới'));
  assert.deepEqual(waterfallSteps({ forecast: null, actual: 1, parts }), []);
});

void test('Lệch theo người: tổng các phần và lý do lớn nhất', () => {
  const base = { id: 'NV1', group: 'binhThuong', expected: null, actual: { assigned: 0, closed: 0, net: 0 }, ...parts };
  assert.deepEqual(personDeviation(base), { total: -650, reason: 'Tỷ lệ chốt' });
  assert.equal(personDeviation({ ...base, group: 'nghi' }).reason, 'nghỉ');
  assert.equal(personDeviation({ ...base, soChia: 0, tiLeChot: 0, giaTriDon: 0, nghi: 0, khac: 0, chuaGan: 0 }).reason, '');
});

void test('Tiền mỗi câu: 3 số lẻ, số rất nhỏ, token có dấu chấm nghìn', () => {
  assert.equal(formatAnswerCost(0.0612, 21400), '0,061 USD · 21.400 token');
  assert.equal(formatAnswerCost(0.0004, 90), 'dưới 0,001 USD · 90 token');
  assert.equal(formatAnswerCost(0, 0), '0,000 USD · 0 token');
});

void test('Demo: câu trả lời mẫu có biểu đồ mẫu ghi rõ không phải số thật', () => {
  const chart = aiParts(fakeAnswer('ask', 'x')).find(p => p.kind === 'chart');
  assert.ok(chart && chart.kind === 'chart' && /không phải số thật/.test(chart.title) && chart.rows.length === 4);
  assert.ok(!fakeAnswer('review', 'x').includes('bieudo'));
});

const clientOf = (create: (params: Anthropic.MessageCreateParamsNonStreaming) => Promise<unknown>) => ({ messages: { create } }) as unknown as Pick<Anthropic, 'messages'>;
const reply = (text: string) => ({ stop_reason: 'end_turn', content: [{ type: 'text', text }], usage: { input_tokens: 1000, output_tokens: 200, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 } });

void test('Tiền còn lại: trần trừ tháng này, tổng từ đầu cộng mọi tháng', async () => {
  const { raw, db } = emptyDb({ DEMO_MODE: '1' });
  try {
    const today = todayVn(), month = today.slice(0, 7);
    raw.prepare('INSERT INTO app_settings(key,value,updated_at) VALUES (?,?,?)').run(`ai_spend:${month}`, JSON.stringify({ usd: 4.5, calls: 9 }), today);
    raw.prepare('INSERT INTO app_settings(key,value,updated_at) VALUES (?,?,?)').run('ai_spend:2026-01', JSON.stringify({ usd: 2, calls: 3 }), today);
    const s = await spendSummary(db, today);
    assert.equal(s.usd, 4.5); assert.equal(s.cap, 30); assert.equal(s.left, 25.5); assert.equal(s.calls, 9); assert.equal(s.allTime, 6.5);
    raw.prepare('UPDATE app_settings SET value=? WHERE key=?').run(JSON.stringify({ usd: 31, calls: 1 }), `ai_spend:${month}`);
    assert.equal((await spendSummary(db, today)).left, 0);
  } finally { raw.close(); }
});

void test('Câu nối tiếp: chỉ gửi tối đa 3 lượt hợp lệ trong 7 ngày, bỏ câu lỗi và mã sai, trả mã, token và tiền còn lại', async t => {
  t.mock.method(globalThis, 'fetch', () => { throw new Error('Không gọi mạng'); });
  const { raw, db } = emptyDb({ DEMO_MODE: '1' });
  try {
    const today = todayVn(), usage = { input: 10, output: 5, cacheRead: 0, cacheWrite: 0 };
    const put = (id: string, q: string, extra: object = {}) => raw.prepare('INSERT INTO app_settings(key,value,updated_at) VALUES (?,?,?)').run(`ai_ask:${id}`, JSON.stringify({ q, a: `Đáp ${q}`, usage, usd: 0, at: today, by: 'OWNER_DEMO', mode: 'live', ...extra }), today);
    put(`${addDays(today, -8)}:001`, 'CU_QUA');
    put(`${today}:001`, 'MOT'); put(`${today}:002`, 'HAI'); put(`${addDays(today, -1)}:009`, 'CU_LOI', { usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 } }); put(`${today}:003`, 'LOI', { failed: true }); put(`${today}:004`, 'BON'); put(`${today}:005`, 'NAM');
    raw.prepare('INSERT INTO app_settings(key,value,updated_at) VALUES (?,?,?)').run(`ai_ask_count:${today}`, '5', today);
    let sent: Anthropic.MessageParam[] = [];
    const client = clientOf(async params => { sent = params.messages; return reply('Trả lời nối tiếp'); });
    const prior = [`${addDays(today, -1)}:009`, `${addDays(today, -8)}:001`, `${today}:003`, `${today}:002`, `${today}:004`, `${today}:005`, `${today}:005`, 'ai_ask:x', 42, `${today}:999`];
    const r = await askClaude(db, 'Còn CSKH thì sao?', { userId: 'OWNER_DEMO' }, { mode: 'live', client, prior });
    // Giữ 3 mã hợp lệ lớn nhất (004, 005, 999); 999 không có nên còn 2 lượt. Mã quá 7 ngày, sai dạng bị bỏ.
    const texts = sent.map(m => typeof m.content === 'string' ? m.content : '');
    assert.equal(sent.length % 2, 1);
    assert.ok(sent.length <= ASK_PRIOR_TURNS * 2 + 1);
    assert.ok(!texts.some(x => x.includes('CU_QUA') || x.includes('LOI') || x.includes('MOT')));
    // Bản ghi cũ trước khi có cờ failed: chạy thật mà 0 token thì coi là lỗi.
    assert.equal((await askHistory(db)).history.find(x => x.q === 'CU_LOI')?.failed, true);
    assert.deepEqual(texts.slice(0, -1), ['Câu hỏi: BON', 'Đáp BON', 'Câu hỏi: NAM', 'Đáp NAM']);
    assert.match(texts[texts.length - 1], /Câu hỏi: Còn CSKH thì sao\?$/);
    assert.equal(r.id, `${today}:006`); assert.equal(r.tokens, 1200); assert.equal(r.spend.cap, 30); assert.ok(r.spend.left < 30);
    const saved = JSON.parse(String(raw.prepare('SELECT value FROM app_settings WHERE key=?').get(`ai_ask:${r.id}`)!.value)) as { prior: string[] };
    assert.deepEqual(saved.prior, [`${today}:004`, `${today}:005`]);
    // Lịch sử: có mã và token, câu lỗi được đánh dấu để khung chat không gửi lại.
    const h = await askHistory(db);
    assert.equal(h.history[0].id, r.id); assert.equal(h.history[0].tokens, 1200);
    assert.equal(h.history.find(x => x.id === `${today}:003`)?.failed, true);
    assert.equal(h.spend.allTime, h.spend.usd);
    // Không gửi prior: một tin như cũ.
    await askClaude(db, 'Câu mới', { userId: 'OWNER_DEMO' }, { mode: 'live', client });
    assert.equal(sent.length, 1);
    // Lỗi sau khi giữ lượt: lưu failed.
    await assert.rejects(askClaude(db, 'Câu lỗi', { userId: 'OWNER_DEMO' }, { mode: 'live', client: clientOf(async () => { throw new Error('x'); }) }));
    assert.equal((await askHistory(db)).history[0].failed, true);
  } finally { raw.close(); }
});
