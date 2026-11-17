import assert from 'node:assert/strict';
import { test } from 'node:test';
import { emptyDb } from './support/d1-sqlite';
import { bossKpiCommand } from '../lib/zalo/kpi-bot';

// Đặt KPI qua Zalo kiểu hỏi đáp (anh Vũ chốt 14/11/2026) và plan sửa của Đầu não (https://claude.ai/artifact/H8FKUifX4TbA7uBXzGoU1g).
const now = Date.parse('2026-11-14T02:00:00Z'), chat = 'chat-sep';
const boss = { name: 'Anh Vũ', user_id: 'owner-1' };
const say = (db: D1Database, text: string, at = now, who = boss, c = chat) => bossKpiCommand(db, who, c, text, at);
type Raw = ReturnType<typeof emptyDb>['raw'];

function world() {
  const { raw, db } = emptyDb();
  const user = raw.prepare('INSERT INTO users (id,email,name,password_hash,role,created_at,updated_at) VALUES (?,?,?,?,?,?,?)');
  user.run('owner-1', 'a@x.vn', 'Anh Vũ', 'x', 'owner', '2026-11-01', '2026-11-01');
  user.run('owner-2', 'n@x.vn', 'Chủ Hai', 'x', 'owner', '2026-11-01', '2026-11-01');
  user.run('lead-1', 'b@x.vn', 'Leader', 'x', 'lead', '2026-11-01', '2026-11-01');
  raw.prepare('INSERT INTO app_settings (key,value,updated_at) VALUES (?,?,?)').run('web_teams_v1', JSON.stringify([
    { id: 'wt_a', name: 'CSKH Heo TN', dept: 'cskh', office: null, memberIds: ['u1', 'u2'] },
    { id: 'wt_b', name: 'Sale Nấm', dept: 'sale', office: null, memberIds: ['u3', 'u4', 'u5'] },
  ]), '2026-11-01');
  const pu = raw.prepare('INSERT INTO pos_users (id,pos_id,user_id,name,fetched_at) VALUES (?,?,?,?,?)');
  for (const [id, pos, name] of [['u1', 'sieu-vo-gao', 'Thùy Dung CSKH'], ['u2', 'sieu-vo-gao', 'Ngọc Mai CSKH'], ['u3', 'sieu-vo-gao', 'Kim Ngân Sale'], ['u4', 'bio-nano', 'Kim Ngân BN Sale'], ['u5', 'sieu-vo-gao', 'Trường Sơn Sale']])
    pu.run(`${pos}:${id}`, pos, id, name, '2026-11-01');
  // Kim Ngân có 2 tài khoản POS (u3 Siêu Vô Gạo, u4 Bio Nano), cùng mã nhân sự E3.
  const hr = raw.prepare("INSERT INTO hr_pos_team (pos_user_id,employee_id,employee_name,team,status) VALUES (?,?,?,?,'chinh_thuc')");
  hr.run('u3', 'E3', 'Kim Ngân', 'sale'); hr.run('u4', 'E3', 'Kim Ngân', 'sale'); hr.run('u5', 'E5', 'Trường Sơn', 'sale');
  return { raw, db };
}
const revenue = (raw: Raw) => Object.fromEntries((raw.prepare("SELECT ref_id, revenue FROM targets WHERE month='2026-11' AND scope='employee' ORDER BY ref_id").all() as { ref_id: string; revenue: number }[]).map((r) => [r.ref_id, r.revenue]));
const setting = (raw: Raw, key: string) => JSON.parse((raw.prepare('SELECT value FROM app_settings WHERE key=?').get(key) as { value: string } | undefined)?.value ?? 'null');
const target = (raw: Raw, ref: string, rev: number, extra = {}) => raw.prepare("INSERT INTO targets (id,month,scope,ref_id,revenue,closed_orders,working_days,updated_by,updated_at) VALUES (?,?,'employee',?,?,?,?,'web','2026-11-01')")
  .run(`2026-11:employee:${ref}`, '2026-11', ref, rev, (extra as { closed?: number }).closed ?? 0, (extra as { days?: number | null }).days ?? null);

void test('CSKH → team → từng người → doanh thu theo ngày → hỏi lần lượt, "bỏ" giữ → OK lưu, sao lưu + nhật ký', async () => {
  const { raw, db } = world();
  assert.match(String(await say(db, 'set kpi')), /1\. CSKH\n2\. Sale\n3\. MKT/);
  assert.match(String(await say(db, '1')), /1\. CSKH Heo TN \(chưa đặt\)/);
  assert.match(String(await say(db, '1')), /1\. Có \(nhập riêng từng người\)/);
  assert.match(String(await say(db, '1')), /1\. Doanh thu \(triệu\)\n2\. TB đơn \(nghìn\)\n0 quay lại/, 'CSKH không có tỉ lệ chốt');
  assert.match(String(await say(db, '1')), /1\. Theo ngày \(tự nhân 30 ngày của tháng 11\/2026\)/);
  assert.match(String(await say(db, '1')), /Doanh thu \(triệu\/ngày\) · 1\/2: Ngọc Mai CSKH · chưa đặt/);
  assert.match(String(await say(db, '10')), /2\/2: Thùy Dung CSKH/);
  const preview = String(await say(db, 'bỏ'));
  assert.match(preview, /tháng 11\/2026 cho 1 người team CSKH Heo TN \(nhập theo ngày × 30 ngày\)/);
  assert.match(preview, /Ngọc Mai CSKH: chưa đặt → 300 triệu/);
  assert.match(String(await say(db, 'OK')), /^Đã lưu/);
  assert.deepEqual(revenue(raw), { u2: 300e6 });
  assert.equal((raw.prepare("SELECT COUNT(*) n FROM app_settings WHERE key LIKE 'kpi_bot_backup:%'").get() as { n: number }).n, 1);
  assert.deepEqual(setting(raw, 'kpi_bot_log_v1')[0].changes.map((c: { key: string; old: number | null; next: number }) => [c.key, c.old, c.next]), [['employee:u2', null, 300e6]]);
});

void test('không đặt từng người: cùng một số cho từng người, không ghi khoá team; Sale tỉ lệ chốt %', async () => {
  const { raw, db } = world();
  for (const t of ['set kpi', '2', '1', '2']) await say(db, t);
  assert.match(String(await say(db, '3')), /cho MỖI người team Sale Nấm \(2 người, cùng một số\), đơn vị %/);
  assert.match(String(await say(db, '45')), /Kim Ngân · Siêu Vô Gạo: chưa đặt → 45%\n• Kim Ngân · BIO NANO: chưa đặt → 45%|Kim Ngân · .*45%/);
  await say(db, 'ok');
  assert.deepEqual(setting(raw, 'target_rate:2026-11'), { 'employee:u3': 45, 'employee:u4': 45, 'employee:u5': 45 }, 'tỉ lệ là tỉ số: mỗi tài khoản cùng số');
});

void test('người 2 tài khoản POS: một dòng, số tổng chia theo tỉ lệ đang có; chưa có tỉ lệ thì hỏi từng POS (không nhân đôi)', async () => {
  const { raw, db } = world();
  target(raw, 'u3', 200e6); target(raw, 'u4', 100e6);
  for (const t of ['set kpi', '2', '1', '1', '1', '2']) await say(db, t);
  assert.match(String(await say(db, '600')), /2\/2: Trường Sơn/, 'Kim Ngân (2 tài khoản) chỉ là 1 câu hỏi');
  const preview = String(await say(db, 'bỏ'));
  assert.match(preview, /200 triệu → 400 triệu/);
  assert.match(preview, /100 triệu → 200 triệu/);
  await say(db, 'OK');
  assert.deepEqual(revenue(raw), { u3: 400e6, u4: 200e6 }, 'tổng của người đó đúng 600 triệu, không phải 1.200');
  // Chưa có tỉ lệ (MKT/Sale mới): hỏi từng POS.
  const w = world();
  for (const t of ['set kpi', '2', '1', '1', '1', '2']) await say(w.db, t);
  assert.match(String(await say(w.db, '300')), /2\/4: Kim Ngân · tài khoản .*chưa có tỉ lệ để chia 300 triệu/);
  await say(w.db, '180'); await say(w.db, '120'); await say(w.db, 'bỏ');
  await say(w.db, 'OK');
  assert.deepEqual(revenue(w.raw), { u3: 180e6, u4: 120e6 });
});

void test('gõ nhầm: số gấp hơn 3 lần thì hỏi lại "anh chắc chưa"; "hoàn tác kpi" trả đúng số cũ và ghi nhật ký', async () => {
  const { raw, db } = world();
  target(raw, 'u5', 300e6);
  assert.match(String(await say(db, 'kpi doanh thu Trường Sơn 3000')), /300 triệu → 3\.000 triệu ⚠️/);
  assert.match(String(await say(db, 'OK')), /Anh chắc chưa\?/);
  assert.deepEqual(revenue(raw), { u5: 300e6 }, 'chưa lưu sau OK đầu');
  assert.match(String(await say(db, 'OK')), /^Đã lưu/);
  assert.deepEqual(revenue(raw), { u5: 3000e6 });
  assert.match(String(await say(db, 'hoàn tác kpi')), /hoàn tác lần đổi .*\n• Trường Sơn: 3\.000 triệu → 300 triệu ⚠️|hoàn tác/);
  await say(db, 'OK'); await say(db, 'OK');
  assert.deepEqual(revenue(raw), { u5: 300e6 });
  const log = setting(raw, 'kpi_bot_log_v1');
  assert.ok(log[0].undoOf && log[1].undone, 'nhật ký ghi lần hoàn tác');
  assert.match(String(await say(db, 'hoàn tác kpi')), /Không có lần đổi KPI nào/);
});

void test('hai người lưu cùng lúc: người sau được báo, không mất thay đổi', async () => {
  const { raw, db } = world();
  const nghia = { name: 'Chủ Hai', user_id: 'owner-2' };
  await say(db, 'kpi tỉ lệ chốt Trường Sơn 40');
  await say(db, 'kpi tỉ lệ chốt Trường Sơn 50', now, nghia, 'chat-nghia');
  assert.match(String(await say(db, 'OK')), /^Đã lưu/);
  assert.match(String(await say(db, 'OK', now, nghia, 'chat-nghia')), /vừa được người khác đổi/);
  assert.deepEqual(setting(raw, 'target_rate:2026-11'), { 'employee:u5': 40 });
});

void test('đặt một loại KPI không làm mất loại khác', async () => {
  const { raw, db } = world();
  target(raw, 'u5', 300e6, { closed: 120, days: 26 });
  raw.prepare("INSERT INTO app_settings (key,value,updated_at) VALUES ('target_aov:2026-11', ?, '2026-11-01')").run(JSON.stringify({ 'employee:u5': 900000, 'team:hr1': 850000 }));
  await say(db, 'kpi tỉ lệ chốt Trường Sơn 45'); await say(db, 'OK');
  await say(db, 'kpi doanh thu Trường Sơn 350'); await say(db, 'OK');
  const row = raw.prepare("SELECT revenue, closed_orders, working_days FROM targets WHERE id='2026-11:employee:u5'").get() as Record<string, number>;
  assert.deepEqual([row.revenue, row.closed_orders, row.working_days], [350e6, 120, 26], 'số đơn chốt và số ngày làm còn nguyên');
  assert.deepEqual(setting(raw, 'target_rate:2026-11'), { 'employee:u5': 45 });
  assert.deepEqual(setting(raw, 'target_aov:2026-11'), { 'employee:u5': 900000, 'team:hr1': 850000 }, 'TB đơn còn nguyên');
});

void test('từ ngày 25 hỏi tháng này hay tháng sau; quá 10 phút tự huỷ; chỉ chủ hệ thống', async () => {
  const { raw, db } = world();
  const late = Date.parse('2026-11-26T02:00:00Z');
  assert.match(String(await say(db, 'set kpi', late)), /1\. Tháng này \(11\/2026\)\n2\. Tháng sau \(12\/2026\)/);
  assert.match(String(await say(db, '2', late)), /Đặt KPI tháng 12\/2026/);
  for (const t of ['1', '1', '2']) await say(db, t, late);
  assert.match(String(await say(db, '2', late)), /cùng một số/);
  assert.match(String(await say(db, '900', late)), /tháng 12\/2026/);
  await say(db, 'OK', late);
  assert.deepEqual(setting(raw, 'target_aov:2026-12'), { 'employee:u1': 900000, 'employee:u2': 900000 });
  assert.match(String(await say(db, 'set kpi')), /bộ phận nào/, 'trước ngày 25 không hỏi tháng');
  assert.match(String(await say(db, '1', now + 11 * 60000)), /quá 10 phút/);
  assert.match(String(await say(db, 'set kpi', now, { name: 'Leader', user_id: 'lead-1' })), /Chỉ Zalo của chủ hệ thống/);
  assert.equal(await say(db, 'việc của tôi', now, { name: 'Leader', user_id: 'lead-1' }), null);
});
