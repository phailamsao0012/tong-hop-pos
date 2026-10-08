import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TREND_DAYS, buildTrends, parseNotes, productLine, ruleNotes, trendFacts, weekChange, weekly } from '../lib/trends';

const days = Array.from({ length: TREND_DAYS }, (_, i) => new Date(Date.UTC(2026, 6, 3 + i)).toISOString().slice(0, 10));
const last = days[days.length - 1];

test('xu hướng: chia bộ phận, team, sản phẩm và trạng thái theo ngày tạo', () => {
  const r = buildTrends({
    days, selected: { start: last, end: last }, fullIndex: TREND_DAYS - 1,
    closed: [
      { day: last, seller_id: 's1', team: 'sale', sent: 1, n: 2, net: 200 },
      { day: last, seller_id: 'c1', team: 'cskh', sent: 0, n: 1, net: 50 },
      { day: last, seller_id: 'x', team: 'other', sent: 0, n: 1, net: 10 },
      { day: '2020-01-01', seller_id: 's1', team: 'sale', sent: 0, n: 9, net: 999 },
    ],
    mkt: [{ day: last, marketer_id: 'm1', n: 1, net: 70 }],
    products: [{ day: last, name: 'Oxy Tetra 500g', qty: 3, net: 120 }, { day: last, name: 'Bổ đậm đặc', qty: 1, net: 30 }, { day: last, name: 'Muối', qty: 1, net: 5 }],
    cohort: [{ day: last, grp: 'new', n: 4 }, { day: last, grp: 'delivered', n: 2 }],
    sellerTeam: (id) => id === 's1' ? 'Team Đại Bàng' : null, mktTeam: (id) => id === 'm1' ? 'APEX' : null,
  });
  const dept = Object.fromEntries(r.depts.map((s) => [s.dept, s.net.at(-1)]));
  assert.deepEqual(dept, { company: 260, sale: 200, cskh: 50, mkt: 70, vandon: 200 });
  assert.deepEqual(r.teams.map((t) => t.label), ['Sale · Team Đại Bàng', 'MKT · APEX', 'CSKH · Chưa gắn team']);
  assert.deepEqual(r.products.map((p) => [p.label, p.net.at(-1)]), [['Oxy', 150], ['Khác', 5]]);
  assert.equal(r.cohort.length, 14);
  assert.deepEqual(r.cohort.at(-1)!.groups, { new: 4, confirmed: 0, shipping: 0, delivered: 2, returned: 0, cancelled: 0 });
});

test('xu hướng: tuần cuối tính đến ngày đủ, so trung bình 4 tuần trước', () => {
  const v = Array(TREND_DAYS).fill(10);
  for (let i = TREND_DAYS - 8; i < TREND_DAYS - 1; i++) v[i] = 20; // tuần đủ cuối (bỏ ngày hôm nay chưa hết)
  const w = weekly(v, TREND_DAYS - 2);
  assert.equal(w.length, 10);
  assert.equal(w[9], 140);
  assert.equal(w[8], 70);
  const c = weekChange(w);
  assert.equal(c.dir, 'up');
  assert.equal(Math.round(c.pct!), 100);
  assert.equal(weekChange([0, 0, 0, 0, 0]).dir, 'flat');
  assert.equal(productLine('SK 1 lít'), 'SK + GK');
  assert.equal(productLine('Gentadox 100g'), 'Gentadox');
});

test('nhận xét: đọc JSON của AI, thiếu bộ phận thì dùng câu tự tính', () => {
  const r = buildTrends({ days, selected: { start: last, end: last }, fullIndex: TREND_DAYS - 1, closed: [{ day: last, seller_id: 's1', team: 'sale', sent: 1, n: 1, net: 5e6 }], mkt: [], products: [], cohort: [], sellerTeam: () => null, mktTeam: () => null });
  const rules = ruleNotes(trendFacts(r));
  assert.match(rules.sale[0], /^Doanh thu chốt tuần này 5 triệu/);
  const ok = parseNotes('Đây: {"sale":["a","b"],"cskh":["c"],"mkt":["d"],"vandon":["e"]} xong', rules);
  assert.equal(ok.complete, true);
  assert.deepEqual(ok.notes.sale, ['a', 'b']);
  const part = parseNotes('{"sale":["a"]}', rules);
  assert.equal(part.complete, false);
  assert.deepEqual(part.notes.cskh, rules.cskh);
  assert.equal(parseNotes('không phải json', rules).complete, false);
});
