import assert from 'node:assert/strict';
import { test } from 'node:test';
import { batch, buildMessage, clip, levelOf, pct, pctFlag, scrub, signedPct, tr, vnClock, vnDay, webLink } from '../lib/notify/format';

void test('số, tiền, phần trăm, giờ VN viết đúng kiểu web', () => {
  assert.equal(tr(12_400_000), '12,4 tr');
  assert.equal(tr(1_240_000_000), '1,24 tỷ');
  assert.equal(signedPct(8), '+8%');
  assert.equal(signedPct(-3), '−3%');
  assert.equal(signedPct(0), '0');
  assert.equal(pct(5.23), '5,2%');
  assert.equal(pct(null), '–');
  assert.equal(vnClock('2026-10-31T07:05:00Z'), '14:05');
  assert.equal(vnDay('2026-10-31T17:30:00Z'), '01/11');
  assert.equal(vnDay('2026-10-31T07:05:00Z', true), '31/10/2026');
});

void test('mức màu dùng chung ngưỡng web: hoàn/hủy 7/5, tỷ lệ chốt 40/25', () => {
  assert.equal(levelOf('return', 7.8), 'red');
  assert.equal(levelOf('return', 5.2), 'yellow');
  assert.equal(levelOf('cancel', 3.1), 'green');
  assert.equal(levelOf('closeRate', 21), 'red');
  assert.equal(levelOf('closeRate', 30), 'yellow');
  assert.equal(levelOf('closeRate', 53), 'green');
  assert.equal(pctFlag('return', 5.2), '🟡 5,2%');
  assert.equal(pctFlag('cancel', 3.1), '3,1%');
});

void test('buildMessage ra đúng khuôn 7 dòng, nút inline, escape và che SĐT', () => {
  const m = buildMessage({
    level: 'yellow', title: 'Tỷ lệ chốt dưới 30%', scope: 'Team Sale HN', period: 'ca 08–17h, tới 14:00',
    metrics: [
      { name: 'Hoa SALE', value: '21% (9/42)', note: 'hôm qua giờ này 34%' },
      { name: 'Tú SALE', value: '25% (6/24)', note: 'hôm qua giờ này 28%' },
      { name: 'Team', value: '38%', note: '−4% so hôm qua giờ này' },
      { name: 'Khách gọi <0912345678>', value: '1' },
    ],
    action: 'leader HN xem số được chia của Hoa, Tú.',
    footer: 'Số tính cho Sale HN · cập nhật 14:05',
    buttons: [[{ text: 'Mở Sale theo team', url: 'https://web.example/?view=sale' }, { text: 'Tắt tin này 1 ngày', data: 'mute:close-rate:1d' }]],
  });
  assert.equal(m.text, [
    '🟡 <b>Tỷ lệ chốt dưới 30%</b> · Team Sale HN · ca 08–17h, tới 14:00',
    'Hoa SALE: <b>21% (9/42)</b> (hôm qua giờ này 34%)',
    'Tú SALE: <b>25% (6/24)</b> (hôm qua giờ này 28%)',
    'Team: <b>38%</b> (−4% so hôm qua giờ này)',
    '→ Cần làm: leader HN xem số được chia của Hoa, Tú.',
    'Số tính cho Sale HN · cập nhật 14:05',
    '───',
    'Khách gọi &lt;***&gt; 1',
  ].join('\n'));
  assert.deepEqual(m.replyMarkup, { inline_keyboard: [[{ text: 'Mở Sale theo team', url: 'https://web.example/?view=sale' }, { text: 'Tắt tin này 1 ngày', callback_data: 'mute:close-rate:1d' }]] });
  // SĐT trong tên bị che, số thứ 4 xuống phần phụ, tối đa 3 số chính.
  assert.ok(!m.text.includes('0912345678'));
  assert.equal(scrub('gọi 0912 345 678, token=abc'), 'gọi ***, token=***');
});

void test('không có việc thì "Chỉ để biết"; action null thì bỏ dòng; không nút thì không replyMarkup; cắt 4000', () => {
  const a = buildMessage({ level: 'info', title: 'Tổng quan', metrics: [{ name: 'Doanh số (MKT+CSKH+SALE)', value: '86,2 tr', note: '+5% so hôm qua giờ này' }] });
  assert.equal(a.text, '📊 <b>Tổng quan</b>\nDoanh số (MKT+CSKH+SALE): <b>86,2 tr</b> (+5% so hôm qua giờ này)\n→ Chỉ để biết.');
  assert.equal(a.replyMarkup, undefined);
  const b = buildMessage({ level: 'green', title: 'Đã ổn lại', action: null });
  assert.equal(b.text, '🟢 <b>Đã ổn lại</b>');
  const c = buildMessage({ level: 'red', title: 'Dài', extra: Array.from({ length: 300 }, (_, i) => `dòng ${i} `.repeat(5)) });
  assert.ok(c.text.length <= 4000 && c.text.endsWith('…') && c.text.startsWith('🔴 <b>Dài</b>'));
  assert.equal(clip('abc', 3), 'abc');
});

void test('batch gom 5 người, webLink mang bộ lọc', () => {
  assert.deepEqual(batch(['a', 'b', 'c', 'd', 'e', 'f', 'g']), ['a', 'b', 'c', 'd', 'e', '… và 2 người khác']);
  assert.deepEqual(batch(['a', 'b']), ['a', 'b']);
  assert.equal(webLink('https://web.example/', 'sale', { team: 'HN', start: '2026-10-25', end: '2026-10-31', pos: null, q: '' }), 'https://web.example/?view=sale&team=HN&start=2026-10-25&end=2026-10-31');
});
