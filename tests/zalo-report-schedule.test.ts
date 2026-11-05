// Lịch gửi báo cáo Zalo (Giao việc → Cài đặt báo cáo, anh Vũ 28/10/2026). Chưa chỉnh thì giữ đúng lịch đang chạy (8h; 12h / 17h / 22h);
// chỉnh giờ, lặp lại, mục trong báo cáo thì lượt cron mỗi phút đọc theo. Không gửi tin thật: hàm gửi và gửi ảnh là hàm giả ghi vào mảng.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { emptyDb } from './support/d1-sqlite';
import { loginAs, logout } from './support/session';
import { maybeZaloTick } from '../lib/zalo/zalo-tick';
import { createTask, readZaloSetting, saveContact, writeZaloSetting, DEFAULT_ZALO_SETTINGS, type Contact } from '../lib/zalo/zalo-work';
import {
  DEFAULT_REPORT_SCHEDULE as D, REPORT_SCHEDULE_KEY, TIME_OPTIONS, hiddenSections, legacySlotKey, parseReportSchedule, previousTime, repeatLabel,
  runsOn, timeKey, timeLabel, validateReportSchedule, type ReportSchedule,
} from '../lib/zalo/report-schedule';
import { GET, PUT } from '../app/api/giao-viec/bao-cao/route';

const at = (time: string, day = '2026-10-27') => Date.parse(`${day}T${time}:00+07:00`);
const custom = (patch: { morning?: Partial<ReportSchedule['morning']>; slots?: Partial<ReportSchedule['slots']> }): ReportSchedule =>
  validateReportSchedule({ morning: { ...D.morning, ...patch.morning }, slots: { ...D.slots, ...patch.slots } });

/** Một leader, một sếp, số team giả theo giờ: tổng = giờ × 100 (7h30 → 700, 11h → 1100). Ngày 27/10/2026 là thứ Ba. */
async function fixture(schedule?: ReportSchedule) {
  const { raw, db } = emptyDb({ DEMO_MODE: '1' });
  const boss = await saveContact(db, { name: 'Sếp demo', kind: 'boss' });
  const leader = await saveContact(db, { name: 'Leader demo', kind: 'leader', team_id: 'team-demo', team_name: 'Team demo', dept: 'sale' });
  raw.prepare('UPDATE zalo_contacts SET chat_id=id').run();
  const messages: { chat: string; text: string }[] = [];
  const send = async (chat: string, text: string) => { messages.push({ chat, text }); };
  let clock = at('00:00');
  const hour = () => new Date(clock + 7 * 3600000).getUTCHours();
  const snapshot = async (_leader: Contact, day: string) => ({ total: day === '2026-10-26' ? 90 : hour() * 100, orders: hour(), people: { a: { name: 'Nhân viên demo SALE', total: hour() * 100, orders: hour() } } });
  const morningData = async (_leader: Contact, today: string) => ({ team: 'Team demo', dept: 'sale' as const, today, days: [{ day: '2026-10-26', net: 90_000_000, orders: 9, created: 20, createdClosed: 8 }], monthNet: 900_000_000, goal: null, workingDays: null, people: [] });
  // Zalo giả không nhận ảnh → bản chữ đi vào messages (để đọc được nội dung).
  const sendPhoto = async () => false;
  // Lượt gửi thử cho sếp chỉ chạy một lần; coi như đã gửi.
  raw.prepare("INSERT INTO app_settings (key,value,updated_at) VALUES ('zalo_tick_v1','{\"morningTest\":\"anh-1\"}','2026-10-27T00:00:00Z')").run();
  if (schedule) await writeZaloSetting(db, REPORT_SCHEDULE_KEY, schedule);
  const tick = async (time: string, day?: string) => { clock = at(time, day); await maybeZaloTick(clock, { db, send, snapshot, morningData, sendPhoto }); };
  const state = () => JSON.parse((raw.prepare("SELECT value FROM app_settings WHERE key='zalo_tick_v1'").get() as { value: string }).value) as Record<string, unknown> & { slots?: Record<string, string>; hist?: Record<string, Record<string, Record<string, unknown>>> };
  return { raw, db, boss, leader, messages, tick, state };
}

void test('lịch: đọc lưu trữ chịu lỗi, phần hỏng về mặc định; giờ ca trùng giờ sáng bị bỏ', () => {
  assert.deepEqual(parseReportSchedule(undefined), D);
  assert.deepEqual(parseReportSchedule('{không phải json'), D);
  assert.deepEqual(parseReportSchedule({ morning: { time: '7:30' }, slots: { times: ['12:00', '12:00'] } }), D);
  const s = parseReportSchedule(JSON.stringify({ morning: { time: '12:00', repeat: { mode: 'days', days: [5, 1, 1, 9] }, sections: ['kpi', 'lạ', 'chart'] }, slots: { times: ['17:00', '12:00'] } }));
  assert.equal(s.morning.time, '12:00');
  assert.deepEqual(s.morning.repeat, { mode: 'days', days: [1, 5] });
  assert.deepEqual(s.morning.sections, ['chart', 'kpi']);
  assert.deepEqual(s.slots.times, ['17:00']); // 12:00 đã là giờ báo cáo sáng
  assert.deepEqual(s.slots.repeat, { mode: 'daily' });
  assert.equal(TIME_OPTIONS[0], '05:00'); assert.equal(TIME_OPTIONS.at(-1), '23:45'); assert.ok(TIME_OPTIONS.includes('08:00') && TIME_OPTIONS.includes('22:00'));
});

void test('lịch: kiểm dữ liệu trang gửi lên, báo lỗi tiếng Việt', () => {
  assert.throws(() => validateReportSchedule(null), /Thiếu cài đặt/);
  assert.throws(() => validateReportSchedule({ ...D, morning: { ...D.morning, time: '07:10' } }), /bước 15 phút/);
  assert.throws(() => validateReportSchedule({ ...D, slots: { ...D.slots, times: [] } }), /1 đến 4 giờ/);
  assert.throws(() => validateReportSchedule({ ...D, slots: { ...D.slots, times: ['10:00', '11:00', '12:00', '13:00', '14:00'] } }), /1 đến 4 giờ/);
  assert.throws(() => validateReportSchedule({ ...D, slots: { ...D.slots, times: ['12:00', '12:00'] } }), /1 đến 4 giờ/);
  assert.throws(() => validateReportSchedule({ ...D, slots: { ...D.slots, times: ['08:00', '12:00'] } }), /trùng giờ báo cáo sáng/);
  assert.throws(() => validateReportSchedule({ ...D, morning: { ...D.morning, repeat: { mode: 'days', days: [] } } }), /ít nhất một thứ/);
  assert.throws(() => validateReportSchedule({ ...D, slots: { ...D.slots, repeat: { mode: 'once', date: '2026-13-01' } } }), /Cách lặp lại/);
  assert.throws(() => validateReportSchedule({ ...D, slots: { ...D.slots, sections: 'kpi' } }), /mục trong báo cáo/);
  assert.deepEqual(validateReportSchedule({ ...D, slots: { ...D.slots, times: ['22:00', '11:30'] } }).slots.times, ['11:30', '22:00']);
});

void test('lịch: ngày gửi, giờ liền trước, nhãn giờ, khoá cũ', () => {
  assert.equal(runsOn({ mode: 'daily' }, '2026-10-27'), true);
  assert.equal(runsOn({ mode: 'days', days: [1, 2] }, '2026-10-27'), true); // thứ Ba
  assert.equal(runsOn({ mode: 'days', days: [0, 6] }, '2026-10-27'), false);
  assert.equal(runsOn({ mode: 'once', date: '2026-10-28' }, '2026-10-27'), false);
  assert.equal(runsOn({ mode: 'once', date: '2026-10-28' }, '2026-10-28'), true);
  assert.equal(previousTime(D, '12:00'), '08:00');
  assert.equal(previousTime(D, '17:00'), '12:00');
  const c = custom({ morning: { time: '07:30' }, slots: { times: ['11:00', '15:30'] } });
  assert.equal(previousTime(c, '11:00'), '07:30');
  assert.equal(previousTime(c, '15:30'), '11:00');
  assert.equal(previousTime(custom({ morning: { time: '09:00' }, slots: { times: ['06:00'] } }), '06:00'), null); // ca trước giờ sáng: tính từ 0h
  assert.deepEqual([timeKey('12:00'), timeKey('15:30')], ['12', '15:30']);
  assert.deepEqual([timeLabel('08:00'), timeLabel('07:30'), timeLabel('15:45')], ['8h', '7h30', '15h45']);
  assert.deepEqual([legacySlotKey('12:00'), legacySlotKey('17:00'), legacySlotKey('22:00'), legacySlotKey('12:30')], ['slot12', 'slot17', 'slot22', null]);
  assert.equal(repeatLabel({ mode: 'days', days: [0, 1, 3] }), 'T2, T4, CN');
  assert.equal(repeatLabel({ mode: 'once', date: '2026-11-05' }), 'Chỉ ngày 05/11/2026');
  assert.deepEqual(hiddenSections(['chart', 'kpi']), ['tiles', 'best', 'coach', 'tasks', 'meetings']);
});

void test('chưa chỉnh lịch: đúng lịch cũ 8h và 12h / 17h / 22h, đủ mục, ghi cả khoá cũ slot12', async () => {
  const f = await fixture();
  await f.tick('07:30'); await f.tick('07:59'); assert.equal(f.messages.length, 0);
  await f.tick('08:00'); assert.equal(f.messages.length, 1);
  const morning = f.messages[0].text;
  assert.match(morning, /Doanh số hôm qua: 90 tr/); assert.match(morning, /Đơn chốt 9/); assert.match(morning, /KPI tháng: chưa đặt cho team/); assert.match(morning, /^Việc: không có việc/m);
  await f.tick('11:00'); await f.tick('11:30'); assert.equal(f.messages.length, 1);
  await f.tick('12:00');
  assert.match(f.messages[1].text, /^📊 Team demo\nBáo cáo 12h thứ Ba 27\/10 · số từ 0h tới 12h/); assert.match(f.messages[2].text, /khung 8h–12h: 400/);
  const s = f.state();
  assert.equal(s.slot12, '2026-10-27'); assert.equal(s.slots?.['12:00'], '2026-10-27');
  assert.ok(s.hist?.['team-demo']['2026-10-27']['12'], 'khoá giờ chẵn giữ dạng cũ "12"');
  await f.tick('17:00'); assert.match(f.messages.at(-1)!.text, /khung 12h–17h: 500/);
  await f.tick('22:00'); assert.match(f.messages.at(-2)!.text, /Báo cáo 22h/); assert.match(f.messages.at(-1)!.text, /khung 17h–22h: 500/);
  assert.equal(f.messages.length, 7);
});

void test('giờ tự chọn: báo cáo sáng 7h30, ca 11h và 15h30; khung của sếp tính từ giờ báo cáo liền trước', async () => {
  const f = await fixture(custom({ morning: { time: '07:30' }, slots: { times: ['15:30', '11:00'] } }));
  await f.tick('07:29'); assert.equal(f.messages.length, 0);
  await f.tick('07:30'); assert.equal(f.messages.length, 1); assert.match(f.messages[0].text, /Doanh số hôm qua/);
  await f.tick('08:00'); assert.equal(f.messages.length, 1, '8h không còn là giờ báo cáo sáng');
  await f.tick('11:00');
  assert.match(f.messages[1].text, /Báo cáo 11h thứ Ba 27\/10 · số từ 0h tới 11h/); assert.match(f.messages[1].text, /Doanh số tới 11h/);
  assert.match(f.messages[2].text, /khung 7h30–11h: 400/);
  for (const t of ['12:00', '17:00', '22:00']) await f.tick(t);
  assert.equal(f.messages.length, 3, 'giờ ca cũ không gửi nữa');
  await f.tick('15:30');
  assert.match(f.messages[3].text, /Báo cáo 15h30 thứ Ba 27\/10 · số từ 0h tới 15h30/); assert.match(f.messages[4].text, /khung 11h–15h30: 400/);
  await f.tick('15:30'); assert.equal(f.messages.length, 5, 'mỗi giờ gửi một lần mỗi ngày');
  assert.equal(f.state().slots?.['15:30'], '2026-10-27');
  assert.ok(f.state().hist?.['team-demo']['2026-10-27']['15:30']);
});

void test('lặp lại: ca chỉ cuối tuần thì thứ Ba không gửi; báo cáo sáng một lần vào ngày khác; nhắc việc quá hạn 8h giữ nguyên', async () => {
  const f = await fixture(custom({ morning: { repeat: { mode: 'once', date: '2026-10-28' } }, slots: { repeat: { mode: 'days', days: [0, 6] } } }));
  await createTask(f.db, f.boss, { title: 'Việc thử', assigneeId: f.leader.id, dueDate: '2026-10-26' }, at('07:00'));
  await f.tick('08:00');
  assert.ok(!f.messages.some((m) => /Doanh số hôm qua/.test(m.text)), 'thứ Ba không phải ngày gửi báo cáo sáng');
  assert.ok(f.messages.some((m) => m.chat === f.leader.id && /Việc số 1/.test(m.text)), 'nhắc việc vẫn gửi lúc 8h');
  const n = f.messages.length;
  for (const t of ['12:00', '17:00', '22:00']) await f.tick(t);
  assert.equal(f.messages.length, n, 'ca chỉ thứ Bảy, Chủ nhật');
  await f.tick('08:00', '2026-10-28');
  assert.ok(f.messages.slice(n).some((m) => /Doanh số hôm qua/.test(m.text)), 'đúng ngày đã chọn thì gửi');
});

void test('mục trong báo cáo: bỏ mục nào thì bản chữ và ảnh lưu không có mục đó; dòng doanh số luôn có', async () => {
  const f = await fixture(custom({ morning: { sections: ['chart', 'best', 'coach', 'meetings'] }, slots: { sections: ['chart', 'kpi', 'best', 'coach', 'tasks', 'meetings'] } }));
  await f.tick('08:00');
  const morning = f.messages[0].text;
  assert.match(morning, /Doanh số hôm qua: 90 tr/);
  assert.doesNotMatch(morning, /Đơn chốt/); assert.doesNotMatch(morning, /KPI tháng/); assert.doesNotMatch(morning, /^Việc/m);
  await f.tick('12:00');
  const slot = f.messages[1].text;
  assert.match(slot, /Doanh số tới 12h/); assert.doesNotMatch(slot, /Đơn chốt/); assert.match(slot, /KPI tháng/); assert.match(slot, /^Việc/m);
  // Ảnh lưu kèm danh sách mục ẩn, để trang ảnh vẽ giống bản chữ.
  const images = (f.raw.prepare("SELECT value FROM app_settings WHERE key LIKE 'zalo_img:%' ORDER BY rowid").all() as { value: string }[]).map((r) => JSON.parse(r.value) as { hidden?: string[]; slot?: string });
  assert.deepEqual(images[0].hidden, ['tiles', 'kpi', 'tasks']);
  assert.deepEqual(images[1].hidden, ['tiles']);
  assert.equal(images[2].hidden, undefined, 'báo cáo gộp cho sếp giữ nguyên');
});

void test('lên bản giữa ngày: ca 12h đã gửi theo khoá cũ slot12 thì không gửi lại; ca sau vẫn gửi', async () => {
  const f = await fixture();
  await writeZaloSetting(f.db, 'zalo_tick_v1', { day: '2026-10-27', morning: '2026-10-27', slot12: '2026-10-27', morningTest: 'anh-1' });
  await f.tick('12:00'); assert.equal(f.messages.length, 0);
  await f.tick('17:00'); assert.equal(f.messages.length, 2);
  await writeZaloSetting(f.db, REPORT_SCHEDULE_KEY, custom({ slots: { times: ['12:00', '17:00', '20:00'] } }));
  await f.tick('17:00'); await f.tick('12:00'); assert.equal(f.messages.length, 2, 'đổi lịch giữa ngày không gửi lại ca đã gửi');
  await f.tick('20:00'); assert.equal(f.messages.length, 4); assert.match(f.messages[3].text, /khung 17h–20h: 300/);
});

void test('lịch tự chọn: phút không có việc vẫn chỉ một lần đọc D1; tắt báo cáo ca thì giờ ca mới cũng không gửi', async () => {
  const f = await fixture(custom({ morning: { time: '07:30' }, slots: { times: ['11:00'] } }));
  let reads = 0;
  const original = f.db.prepare.bind(f.db);
  f.db.prepare = ((sql: string) => { reads++; return original(sql); }) as typeof f.db.prepare;
  await f.tick('07:59'); assert.equal(reads, 1);
  await f.tick('06:15'); assert.equal(reads, 2);
  f.db.prepare = original;
  await writeZaloSetting(f.db, 'zalo_settings_v1', { ...DEFAULT_ZALO_SETTINGS, slotReports: false });
  await f.tick('11:00'); assert.equal(f.messages.length, 0);
});

void test('gửi thử cho sếp một lần: chữ theo giờ báo cáo sáng; chưa chỉnh lịch thì y như cũ', async () => {
  const f = await fixture();
  await writeZaloSetting(f.db, 'zalo_tick_v1', {});
  await f.tick('09:30');
  assert.ok(f.messages.some((m) => m.chat === f.boss.id && m.text.startsWith('Gửi thử báo cáo 8h (leader nhận lúc 8:00 mỗi sáng)\n')));
  const g = await fixture(custom({ morning: { time: '07:30', repeat: { mode: 'days', days: [1, 2, 3, 4, 5] } } }));
  await writeZaloSetting(g.db, 'zalo_tick_v1', {});
  await g.tick('09:30');
  assert.ok(g.messages.some((m) => m.chat === g.boss.id && m.text.startsWith('Gửi thử báo cáo 7h30 (leader nhận lúc 7:30 theo lịch đã đặt)\n')));
});

void test('API Cài đặt báo cáo: chưa chỉnh trả lịch mặc định; lưu kiểm dữ liệu, ghi lịch và công tắc, không gửi tin', async () => {
  const { raw, db } = emptyDb({ DEMO_MODE: '1' });
  await loginAs(raw, 'owner');
  const url = 'https://web.test/api/giao-viec/bao-cao';
  const put = (body: unknown) => PUT(new Request(url, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }));
  try {
    const first = await (await GET(new Request(url))).json() as { schedule: ReportSchedule; customized: boolean; morningBrief: boolean; slotReports: boolean };
    assert.deepEqual(first.schedule, D); assert.equal(first.customized, false); assert.equal(first.morningBrief, true); assert.equal(first.slotReports, true);

    const bad = await put({ schedule: { ...D, slots: { ...D.slots, times: ['08:00'] } }, morningBrief: true, slotReports: true });
    assert.equal(bad.status, 400); assert.match((await bad.json() as { error: string }).error, /trùng giờ báo cáo sáng/);
    assert.equal((await put({ schedule: D })).status, 400, 'thiếu công tắc');

    const next = custom({ morning: { time: '07:30' }, slots: { times: ['11:00', '16:00'] } });
    const ok = await put({ schedule: next, morningBrief: true, slotReports: false });
    assert.equal(ok.status, 200);
    const again = await (await GET(new Request(url))).json() as { schedule: ReportSchedule; customized: boolean; slotReports: boolean };
    assert.deepEqual(again.schedule, next); assert.equal(again.customized, true); assert.equal(again.slotReports, false);
    const settings = await readZaloSetting(db, 'zalo_settings_v1', DEFAULT_ZALO_SETTINGS);
    assert.equal(settings.slotReports, false); assert.equal(settings.idleMinutes, DEFAULT_ZALO_SETTINGS.idleMinutes, 'giữ các cài đặt thông báo khác');
    assert.equal((raw.prepare('SELECT COUNT(*) AS n FROM zalo_messages').get() as { n: number }).n, 0, 'lưu cài đặt không gửi tin');

    logout(); await loginAs(raw, 'staff');
    assert.equal((await GET(new Request(url))).status, 403);
    assert.equal((await put({ schedule: D, morningBrief: true, slotReports: true })).status, 403);
  } finally { logout(); }
});

void test('báo cáo gộp cho sếp và nhắc việc: mặc định như cũ; đổi giờ nhắc, tắt bản gộp, bỏ luỹ kế', async () => {
  // Lịch lưu từ bản trước (chưa có phần boss / overdue) vẫn đọc ra mặc định.
  const old = parseReportSchedule({ morning: D.morning, slots: D.slots });
  assert.deepEqual(old.boss, { send: true, cumulative: true }); assert.deepEqual(old.overdue, { time: '08:00' });
  assert.throws(() => validateReportSchedule({ ...D, overdue: { time: '08:10' } }), /nhắc việc quá hạn/);
  assert.throws(() => validateReportSchedule({ ...D, boss: { send: 'có' } }), /báo cáo gộp/);

  const f = await fixture(custom({}));
  await createTask(f.db, f.boss, { title: 'Việc thử', assigneeId: f.leader.id, dueDate: '2026-10-26' }, at('07:00'));
  await f.tick('08:00'); assert.ok(f.messages.some((m) => m.chat === f.leader.id && /Việc số 1/.test(m.text)), 'mặc định nhắc 8h');
  await f.tick('12:00'); assert.match(f.messages.at(-1)!.text, /khung 8h–12h: 400 · Luỹ kế: 1\.200/);

  const g = await fixture(validateReportSchedule({ ...D, boss: { send: true, cumulative: false }, overdue: { time: '09:00' } }));
  await createTask(g.db, g.boss, { title: 'Việc thử', assigneeId: g.leader.id, dueDate: '2026-10-26' }, at('07:00'));
  await g.tick('08:00'); assert.ok(!g.messages.some((m) => /Việc số 1/.test(m.text)), '8h không nhắc nữa');
  await g.tick('09:00'); assert.ok(g.messages.some((m) => m.chat === g.leader.id && /Việc số 1/.test(m.text)), '9h nhắc');
  await g.tick('12:00'); assert.equal(g.messages.at(-1)!.chat, g.boss.id); assert.doesNotMatch(g.messages.at(-1)!.text, /Luỹ kế/);

  const h = await fixture(validateReportSchedule({ ...D, boss: { send: false, cumulative: true } }));
  await h.tick('12:00');
  assert.ok(h.messages.some((m) => m.chat === h.leader.id && /Báo cáo 12h/.test(m.text)), 'leader vẫn nhận ca');
  assert.ok(!h.messages.some((m) => m.chat === h.boss.id), 'sếp không nhận bản gộp');
  await h.tick('17:00'); assert.match(h.messages.at(-1)!.text, /Báo cáo 17h/);
});

void test('API Cài đặt báo cáo: lưu số phút nhắc họp chung với Danh bạ Zalo, giữ cài đặt khác, giá trị sai bị từ chối', async () => {
  const { raw, db } = emptyDb({ DEMO_MODE: '1' });
  await loginAs(raw, 'owner');
  const url = 'https://web.test/api/giao-viec/bao-cao';
  const put = (body: unknown) => PUT(new Request(url, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }));
  try {
    assert.equal(((await (await GET(new Request(url))).json()) as { remindBeforeMeetingMin: number }).remindBeforeMeetingMin, DEFAULT_ZALO_SETTINGS.remindBeforeMeetingMin);
    assert.equal((await put({ schedule: D, morningBrief: true, slotReports: true, remindBeforeMeetingMin: 30 })).status, 200);
    const s = await readZaloSetting(db, 'zalo_settings_v1', DEFAULT_ZALO_SETTINGS);
    assert.equal(s.remindBeforeMeetingMin, 30); assert.equal(s.idleMinutes, DEFAULT_ZALO_SETTINGS.idleMinutes);
    assert.equal((await put({ schedule: D, morningBrief: true, slotReports: true })).status, 200, 'không gửi = giữ nguyên');
    assert.equal((await readZaloSetting(db, 'zalo_settings_v1', DEFAULT_ZALO_SETTINGS)).remindBeforeMeetingMin, 30);
    assert.equal((await put({ schedule: D, morningBrief: true, slotReports: true, remindBeforeMeetingMin: 0 })).status, 400);
    assert.equal((await put({ schedule: D, morningBrief: true, slotReports: true, remindBeforeMeetingMin: 'nửa tiếng' })).status, 400);
  } finally { logout(); }
});
