import assert from 'node:assert/strict';
import { test } from 'node:test';
import { periodKind } from '../lib/period-kind';
import { PRESETS, presetRange } from '../lib/periods';
import { hourlyProfile, forecastFraction, periodCard, trendCards, trendQuery, trendOrderPage, type TrendOptions } from '../lib/trend-period';
import { addDays } from '../lib/report-time';
import { emptyDb } from './support/d1-sqlite';
import { loginAs, logout } from './support/session';
import { POS } from '../lib/report-model';
import { SENT_AT_READY_KEY } from '../lib/stats';
import { scopeApi } from '../lib/access';

const today = '2026-10-17', now = Date.parse('2026-10-17T07:00:00Z');
const opts: TrendOptions = { start: today, end: today, preset: 'today', posIds: ['p'], team: 'all', unit: null };

void test('period-kind: đủ 11 nút kỳ, tuần từ thứ Hai, kỳ tùy chọn không mở', () => {
  assert.equal(Object.keys(PRESETS).length, 11);
  for (const preset of Object.keys(PRESETS)) {
    const r = presetRange(preset, today) ?? { start: '2026-10-01', end: today };
    const p = periodKind(r.start, r.end, today, preset);
    assert.equal(p.open, ['today', 'thisWeek', 'month', 'year'].includes(preset), preset);
    assert.equal(p.label, PRESETS[preset as keyof typeof PRESETS]);
  }
  assert.equal(periodKind('2026-10-12', today, today, 'thisWeek').periodEnd, '2026-10-18');
  assert.equal(periodKind('2026-10-01', today, today, 'month').periodEnd, '2026-10-31');
  assert.equal(periodKind('2026-01-01', today, today, 'year').prev.start, '2025-01-01');
  assert.equal(periodKind('2026-10-16', '2026-10-16', today, 'yesterday').open, false);
  assert.equal(periodKind('2026-01-01', '2026-01-17', '2026-01-17', 'month').kind, 'month');
  assert.equal(periodKind('2026-01-01', '2026-01-17', '2026-01-17', 'year').kind, 'year');
  assert.equal(periodKind(today, today, today, 'custom').open, false);
});

void test('trend-period: hồ sơ 50% tới 14h, dự đoán gấp đôi; thiếu số không dự đoán', () => {
  const points = Array.from({ length: 28 }, (_, i) => addDays(today, -i - 1)).flatMap((day) => [{ day, hour: 8, id: 's', value: 50 }, { day, hour: 18, id: 's', value: 50 }]);
  const profile = hourlyProfile(points, today);
  assert.equal(forecastFraction(profile, today, today, today, 14), 0.5);
  const card = periodCard([{ day: today, hour: 8, id: 's', value: 80 }, { day: addDays(today, -1), hour: 8, id: 's', value: 40 }], opts, profile, now);
  assert.equal(card.actual, 80);
  assert.equal(card.forecast, 160);
  assert.equal(card.compare, 100);
  assert.equal(card.series.length, 15);
  assert.equal(card.series.at(-1)?.previous, 40);
  assert.equal(periodCard([], opts, hourlyProfile([], today), now).forecast, null);
  for (const preset of ['yesterday', 'lastWeek', 'lastMonth', 'week', 'quarter', 'all', 'custom']) {
    const r = presetRange(preset, today) ?? { start: today, end: today };
    const closed = periodCard(points, { ...opts, ...r, preset }, profile, now);
    assert.equal(closed.forecast, closed.actual, preset);
  }
});

void test('trend-period: trọng số thứ cho tuần/tháng/năm; dòng mới không chia cho 0, tối đa 5', () => {
  const profile = { hours: Array.from({ length: 24 }, (_, h) => h === 8 || h === 18 ? 0.5 : 0), weekdays: [100, 100, 100, 100, 100, 100, 100], sufficient: true };
  assert.equal(forecastFraction(profile, '2026-10-12', '2026-10-18', today, 14), 5.5 / 7);
  assert.equal(forecastFraction(profile, '2026-10-01', '2026-10-31', today, 14), 16.5 / 31);
  const points = Array.from({ length: 9 }, (_, i) => ({ day: today, hour: 8, id: `s${i}`, value: i + 1 }));
  const card = periodCard(points, opts, profile, now);
  assert.equal(card.rows.length, 5);
  assert.ok(card.rows.every((r) => r.pct === null));
  assert.equal(card.rows[0].value, 9);
});

void test('trend-period: ưu tiên 4 ngày cùng thứ, thiếu thì dùng mọi ngày; mốc đầu và cuối ngày', () => {
  const points = Array.from({ length: 28 }, (_, i) => {
    const day = addDays(today, -i - 1);
    const same = new Date(`${day}T00:00:00Z`).getUTCDay() === 6;
    return { day, hour: same ? 8 : 18, id: 's', value: 100 };
  });
  assert.equal(forecastFraction(hourlyProfile(points, today), today, today, today, 14), 1);
  assert.ok(forecastFraction(hourlyProfile(points.slice(0, -1), today), today, today, today, 14)! < 1);
  assert.equal(forecastFraction(hourlyProfile(points, today), today, today, today, 0), null);
  assert.equal(forecastFraction(hourlyProfile(points, today), today, today, today, 24), 1);
});

void test('trend-period: D1 theo POS/team/MKT, cùng mốc tới phút; cache hồ sơ và EXPLAIN', async () => {
  const { raw, db } = emptyDb();
  try {
    for (const [id, name, dept] of [['s', 'NV A SALE', 'Sale'], ['c', 'NV B CSKH', 'CSKH'], ['m', 'NV C MKT', 'MKT']]) raw.prepare('INSERT INTO pos_users (id,pos_id,user_id,name,department,fetched_at) VALUES (?,?,?,?,?,?)').run(id, 'p', id, name, dept, today);
    const insert = (id: string, at: string, seller: string, net: number, pos = 'p') => raw.prepare('INSERT INTO raw_pos_orders (id,pos_id,shop_id,source_order_id,seller_id,marketer_id,status_code,net_total,created_at,first_closed_at,first_confirmed_at,first_sent_at,fetched_at) VALUES (?,?,?,?,?,?,2,?,?,?,?,?,?)').run(id, pos, pos, id, seller, 'm', net, at, at, at, at, today);
    insert('current', '2026-10-17T06:00:00', 's', 100);
    insert('care', '2026-10-17T06:00:00', 'c', 50);
    insert('other', '2026-10-17T06:00:00', 's', 900, 'q');
    insert('previous', '2026-10-16T06:00:00', 's', 25);
    insert('late', '2026-10-16T07:30:00', 's', 500);
    const report = await trendCards(db, opts, ['sale', 'cskh', 'mkt', 'vandon'], now);
    assert.equal(report.cards.sale?.actual, 100);
    assert.equal(report.cards.sale?.previous, 25);
    assert.equal(report.cards.sale?.compare, 300);
    assert.equal(report.cards.cskh?.actual, 50);
    assert.equal(report.cards.mkt?.actual, 150);
    assert.equal(report.cards.vandon?.actual, 2);
    const details = await trendOrderPage(db, opts, 'sale', null, 0, now);
    assert.equal(details.reduce((sum, r) => sum + r.net, 0), report.cards.sale?.actual);
    assert.equal((await trendOrderPage(db, opts, 'sale', 'c', 0, now)).length, 0);
    const scoped = await trendCards(db, { ...opts, team: 'sale' }, ['mkt'], now);
    assert.equal(scoped.cards.mkt?.actual, 100);
    const stored = raw.prepare('SELECT value FROM app_settings WHERE key=?').get(`trend_profile:${today}`) as { value: string };
    const profiles = JSON.parse(stored.value);
    assert.equal(Object.keys(profiles).length, 2);
    assert.equal(Object.values(profiles)[0] && (Object.values(profiles)[0] as { sale: { hours: number[] } }).sale.hours.length, 24);
    for (const [dept, bySent, index] of [['sale', false, 'closed'], ['mkt', false, 'confirmed'], ['vandon', true, 'sent']] as const) {
      const q = trendQuery(dept, ['p'], '2026-10-01', '2026-10-18', '', [], bySent);
      const plan = raw.prepare(`EXPLAIN QUERY PLAN ${q.sql}`).all(...q.binds);
      assert.ok(JSON.stringify(plan).includes(`idx_raw_orders_pos_${index}_status_money`));
    }
  } finally { raw.close(); }
});

void test('trend-period: team nhân sự, team MKT, chi nhánh và ngày gửi giữ đúng phạm vi', async () => {
  const { raw, db } = emptyDb();
  try {
    for (const [id, name, dept] of [['s', 'NV A SALE', 'Sale'], ['s2', 'NV B SALE', 'Sale'], ['m', 'NV C MKT', 'MKT'], ['m2', 'NV D MKT', 'MKT']]) raw.prepare('INSERT INTO pos_users (id,pos_id,user_id,name,department,fetched_at) VALUES (?,?,?,?,?,?)').run(id, 'p', id, name, dept, today);
    raw.prepare("INSERT INTO hr_employees (id,code,full_name,office_id,status) VALUES ('e','e','NV A','b','dang_lam')").run();
    raw.prepare("INSERT INTO hr_pos_team (pos_user_id,employee_id,employee_name,team,department_id,status) VALUES ('s','e','NV A','sale','u','dang_lam')").run();
    const team = 'mkt_00000000-0000-0000-0000-000000000001';
    raw.prepare("INSERT INTO app_settings (key,value,updated_at) VALUES ('marketing_teams_v1',?,?)").run(JSON.stringify([{ id: team, name: 'Team MKT 1', memberIds: ['m'] }]), today);
    for (const [id, seller, marketer, net] of [['a', 's', 'm', 100], ['b', 's2', 'm', 200], ['c', 's', 'm2', 300]] as const) raw.prepare('INSERT INTO raw_pos_orders (id,pos_id,shop_id,source_order_id,seller_id,marketer_id,status_code,net_total,created_at,first_closed_at,first_confirmed_at,first_sent_at,fetched_at) VALUES (?,?,?,?,?,?,2,?,?,?,?,?,?)').run(id, 'p', 'p', id, seller, marketer, net, '2026-10-16T01:00:00', '2026-10-17T01:00:00', '2026-10-17T02:00:00', '2026-10-16T03:00:00', today);
    const mkt = await trendCards(db, { ...opts, mktTeam: team }, ['mkt'], now);
    assert.equal(mkt.cards.mkt?.actual, 300);
    const scope = { ...opts, mktTeam: team, branch: 'b', unit: { id: 'u', name: 'Team Sale 1', dept: 'sale' as const } };
    const scoped = await trendCards(db, scope, ['sale', 'mkt'], now);
    assert.equal(scoped.cards.sale?.actual, 100);
    assert.equal(scoped.cards.mkt?.actual, 100);
    assert.equal((await trendOrderPage(db, scope, 'sale', null, 0, now)).reduce((s, r) => s + r.net, 0), 100);
    assert.equal((await trendCards(db, { ...opts, branch: 'empty' }, ['sale'], now)).cards.sale?.actual, 0);
    raw.prepare("INSERT INTO app_settings (key,value,updated_at) VALUES (?,'1',?)").run(SENT_AT_READY_KEY, today);
    assert.equal((await trendCards(db, opts, ['vandon'], now)).cards.vandon?.actual, 0);
    assert.equal((await trendOrderPage(db, opts, 'vandon', null, 0, now)).length, 0);
  } finally { raw.close(); }
});

void test('trend-period: route thu hẹp POS/team và chỉ trả bộ phận được cấp', async () => {
  const { raw } = emptyDb();
  try {
    await loginAs(raw, 'staff', { views: ['marketing'], posIds: [POS[0].id], team: 'sale' });
    const { GET } = await import('../app/api/reports/trend-cards/route');
    const response = await GET(new Request(`http://local/api/reports/trend-cards?start=${today}&end=${today}&preset=today&depts=sale,cskh,mkt,vandon&posIds=${POS.map((p) => p.id).join(',')}&team=all`));
    assert.equal(response.status, 200);
    const body = await response.json() as { cards: Record<string, unknown> };
    assert.deepEqual(Object.keys(body.cards), ['mkt']);
    assert.equal((await GET(new Request(`http://local/api/reports/trend-cards?start=${today}&end=${today}&detail=sale`))).status, 403);
    assert.equal(scopeApi({ role: 'staff', views: [], team: 'all', posIds: null }, 'GET', new URL('http://local/api/reports/trend-cards')).blocked !== undefined, true);
    assert.equal((await GET(new Request('http://local/api/reports/trend-cards?start=2026-02-31&end=2026-03-01'))).status, 400);
  } finally { logout(); raw.close(); }
});
