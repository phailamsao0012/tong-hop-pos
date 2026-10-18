// Canh gác 24/7, logic thuần (lib/watch-core.ts): mở/đóng chống chập chờn, giờ yên lặng, tách "không chạy" với "về trễ", ngưỡng D1, sao lưu.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  DEFAULT_CONFIG, advance, backupProblems, markSent, outbox, parseChats, parseUtc, schedStep, schedulerProblems, scrub, sizeProblems,
  syncProblems, validateChats, type Incident, type Problem, type Streak,
} from '../lib/watch-core';

// 02:00 và 07:05 giờ VN (UTC+7).
const NIGHT = new Date('2026-10-10T19:00:00Z');
const MORNING = new Date('2026-10-11T00:05:00Z');
const DAY = new Date('2026-10-11T03:00:00Z'); // 10:00 VN
const min = (d: Date, m: number) => new Date(d.getTime() + m * 60000);

type S = { incidents: Incident[]; streaks: Record<string, Streak> };
const step = (s: S, now: Date, problems: Problem[], families: string[]) => {
  const r = advance({ now, incidents: s.incidents, streaks: s.streaks, problems, families });
  return { s: { incidents: r.incidents, streaks: r.streaks }, fresh: r.fresh };
};
const send = (s: S, now: Date, fresh: string[]) => {
  const out = outbox({ now, config: DEFAULT_CONFIG, incidents: s.incidents, fresh });
  for (const m of out) s.incidents = s.incidents.map((i) => m.ids.includes(`${i.key}@${i.openedAt}`) ? markSent(i, m.kind, now, 'telegram') : i);
  return out;
};

void test('watch_chats: chỉ chat riêng (id dương), bỏ nhóm và id sai; ô nhập báo lỗi khi có nhóm', () => {
  assert.deepEqual(parseChats('["123456","-100123456","123456","abc"," 7654321 "]'), ['123456', '7654321']);
  assert.deepEqual(parseChats('không phải json'), []);
  assert.deepEqual(parseChats(null), []);
  assert.match(String((validateChats(['123456', '-1001234']) as { error: string }).error), /chat riêng/);
  assert.match(String((validateChats(['bot123:abc']) as { error: string }).error), /dãy số/);
  assert.deepEqual(validateChats(['123456', '123456']), { chats: ['123456'] });
  assert.ok('error' in validateChats(['11111', '22222', '33333', '44444', '55555', '66666']));
});

void test('lỗi đủ N lượt liên tiếp mới mở, ổn 2 lượt mới đóng; họ kiểm tra không chạy thì giữ nguyên', () => {
  const p: Problem = { key: 'sched_error', severity: 'medium', title: 'x', need: 3 };
  let s: S = { incidents: [], streaks: {} };
  for (let k = 0; k < 2; k++) s = step(s, min(DAY, k * 5), [p], ['sched_error']).s;
  assert.equal(s.incidents.length, 0);
  // Ổn một lượt giữa chừng: đếm lại từ đầu.
  s = step(s, min(DAY, 10), [], ['sched_error']).s;
  for (let k = 0; k < 2; k++) s = step(s, min(DAY, 15 + k * 5), [p], ['sched_error']).s;
  assert.equal(s.incidents.length, 0);
  const r = step(s, min(DAY, 25), [p], ['sched_error']);
  assert.equal(r.s.incidents.length, 1);
  assert.equal(r.fresh.length, 1);
  s = r.s;
  // Họ không chạy ở lượt này (vd D1 không đọc được): không tính là ổn.
  s = step(s, min(DAY, 30), [], ['d1_read']).s;
  s = step(s, min(DAY, 35), [], ['d1_read']).s;
  assert.equal(s.incidents[0].resolvedAt, null);
  s = step(s, min(DAY, 40), [], ['sched_error']).s;
  assert.equal(s.incidents[0].resolvedAt, null);
  s = step(s, min(DAY, 45), [], ['sched_error']).s;
  assert.ok(s.incidents[0].resolvedAt);
});

void test('🔴 lúc 02:00 gửi ngay; 🟠 lúc 02:00 chờ tới 07:00 rồi gom một tin tóm tắt', () => {
  let s: S = { incidents: [], streaks: {} };
  const high: Problem = { key: 'dispatch_off:p1@t', severity: 'high', title: 'Chia số đã TỰ TẮT · POS A' };
  const med: Problem = { key: 'pos_stale:p2', severity: 'medium', title: 'Đồng bộ đơn POS B không chạy' };
  const r = step(s, NIGHT, [high, med], ['dispatch_off', 'pos_stale']);
  s = r.s;
  const out = send(s, NIGHT, r.fresh);
  assert.deepEqual(out.map((m) => m.kind), ['alert']);
  assert.match(out[0].text, /TỰ TẮT/);
  assert.doesNotMatch(out[0].text, /POS B/);
  // Tới 03:20: không gửi gì thêm (🔴 chỉ nhắc lại sau 4 giờ).
  for (let k = 1; k < 9; k++) {
    const x = step(s, min(NIGHT, k * 25), [high, med], ['dispatch_off', 'pos_stale']);
    s = x.s;
    assert.equal(send(s, min(NIGHT, k * 25), x.fresh).length, 0);
  }
  const m = step(s, MORNING, [high, med], ['dispatch_off', 'pos_stale']);
  s = m.s;
  const morning = send(s, MORNING, m.fresh);
  assert.deepEqual(morning.map((x) => x.kind), ['remind', 'digest']);
  assert.match(morning[0].text, /Nhắc lại.*TỰ TẮT/);
  assert.match(morning[1].text, /tóm tắt/);
  assert.match(morning[1].text, /POS B/);
  assert.doesNotMatch(morning[1].text, /TỰ TẮT/);
  const again = step(s, min(MORNING, 5), [high, med], ['dispatch_off', 'pos_stale']);
  assert.equal(send(again.s, min(MORNING, 5), again.fresh).length, 0);
});

void test('"Đã ổn lại" chỉ gửi khi trước đó đã báo; 🔴 nhắc lại một lần sau 4 giờ', () => {
  let s: S = { incidents: [], streaks: {} };
  const p: Problem = { key: 'd1_write_block', severity: 'high', title: 'Hết hạn mức ghi D1 trong ngày' };
  let r = step(s, DAY, [p], ['d1_write_block']); s = r.s;
  assert.equal(send(s, DAY, r.fresh).length, 1);
  r = step(s, min(DAY, 241), [p], ['d1_write_block']); s = r.s;
  assert.deepEqual(send(s, min(DAY, 241), r.fresh).map((m) => m.kind), ['remind']);
  r = step(s, min(DAY, 500), [p], ['d1_write_block']); s = r.s;
  assert.equal(send(s, min(DAY, 500), r.fresh).length, 0);
  r = step(s, min(DAY, 505), [], ['d1_write_block']); s = r.s;
  r = step(s, min(DAY, 510), [], ['d1_write_block']); s = r.s;
  const out = send(s, min(DAY, 510), r.fresh);
  assert.deepEqual(out.map((m) => m.kind), ['resolved']);
  assert.match(out[0].text, /Đã ổn lại.*kéo dài 8 giờ 30 phút/);
  // Sự cố chưa từng báo (🟠 mở và tự hết trong đêm): không gửi "đã ổn" riêng, chỉ vào tóm tắt sáng.
  let q: S = { incidents: [], streaks: {} };
  const med: Problem = { key: 'pos_stale:p1', severity: 'medium', title: 'Đồng bộ chậm' };
  q = step(q, NIGHT, [med], ['pos_stale']).s;
  q = step(q, min(NIGHT, 5), [], ['pos_stale']).s;
  const closed = step(q, min(NIGHT, 10), [], ['pos_stale']); q = closed.s;
  assert.equal(send(q, min(NIGHT, 10), closed.fresh).length, 0);
  const am = send(q, MORNING, []);
  assert.deepEqual(am.map((m) => m.kind), ['digest']);
  assert.match(am[0].text, /đã tự hết/);
});

void test('nâng mức 🟠 → 🔴 báo lại; hạ mức không báo', () => {
  let s: S = { incidents: [], streaks: {} };
  let r = step(s, DAY, [{ key: 'pos_stale:p1', severity: 'medium', title: 'a' }], ['pos_stale']); s = r.s;
  assert.equal(send(s, DAY, r.fresh).length, 1);
  r = step(s, min(DAY, 40), [{ key: 'pos_stale:p1', severity: 'high', title: 'a' }], ['pos_stale']); s = r.s;
  assert.deepEqual(send(s, min(DAY, 40), r.fresh).map((m) => m.kind), ['alert']);
  r = step(s, min(DAY, 45), [{ key: 'pos_stale:p1', severity: 'medium', title: 'a' }], ['pos_stale']); s = r.s;
  assert.equal(send(s, min(DAY, 45), r.fresh).length, 0);
  assert.equal(s.incidents[0].severity, 'high');
});

void test('tách "đồng bộ không chạy" (giờ chạy xong) với "đơn về trễ" (mốc nước); chưa có mốc nước thì không xét trễ', () => {
  const now = DAY;
  const ago = (m: number) => new Date(now.getTime() - m * 60000).toISOString();
  const keys = (shops: Parameters<typeof syncProblems>[0]) => syncProblems(shops, now).map((p) => `${p.key}:${p.severity}`);
  assert.deepEqual(keys([{ id: 'a', name: 'A', lastSyncAt: ago(5) }]), []);
  assert.deepEqual(keys([{ id: 'a', name: 'A', lastSyncAt: ago(25) }]), ['pos_stale:a:medium']);
  assert.deepEqual(keys([{ id: 'a', name: 'A', lastSyncAt: ago(61) }]), ['pos_stale:a:high']);
  assert.deepEqual(keys([{ id: 'a', name: 'A', lastSyncAt: null }]), []);
  // Ban đêm không có đơn: mốc nước = giờ chạy, không báo trễ.
  assert.deepEqual(keys([{ id: 'a', name: 'A', lastSyncAt: ago(3), watermark: ago(3) }]), []);
  // Vẫn chạy đều nhưng mốc nước trễ 45 phút (giờ Pancake không có múi giờ = UTC): đơn về trễ.
  assert.deepEqual(keys([{ id: 'a', name: 'A', lastSyncAt: ago(3), watermark: ago(45).slice(0, 19) }]), ['pos_lag:a:medium']);
  // Không chạy thì chỉ báo "không chạy", không báo thêm "về trễ".
  assert.deepEqual(keys([{ id: 'a', name: 'A', lastSyncAt: ago(30), watermark: ago(90) }]), ['pos_stale:a:medium']);
  assert.equal(parseUtc('2026-10-11T03:00:00'), Date.parse('2026-10-11T03:00:00Z'));
  assert.equal(parseUtc('1791687600'), 1791687600000);
});

void test('lượt bộ hẹn giờ: lỗi cần 3 lượt, khoá ghi 🔴, gần hết hạn mức 🟠, thiếu khoá Pancake 🔴', () => {
  const p = (r: Parameters<typeof schedulerProblems>[0]) => schedulerProblems(r).map((x) => `${x.key}:${x.severity}:${x.need ?? 1}`);
  assert.deepEqual(p({ ok: false, error: 'x', blocked: false, writesUsed: 0, writeLimit: 100 }), ['sched_error:medium:3']);
  assert.deepEqual(p({ ok: true, blocked: true, writesUsed: 100, writeLimit: 100 }), ['d1_write_block:high:1']);
  assert.deepEqual(p({ ok: true, blocked: false, writesUsed: 85, writeLimit: 100 }), ['d1_write_80:medium:1']);
  assert.deepEqual(p({ ok: true, blocked: false, writesUsed: 0, writeLimit: 100, skipped: 'missing_key' }), ['pancake_key:high:1']);
});

void test('dung lượng D1: 7 GB 🟠, 8,5 GB 🔴, tăng hơn 150 MB/ngày 🟠', () => {
  const at = DAY.getTime();
  const sev = (bytes: number, sizes: { at: number; bytes: number }[] = []) => sizeProblems(bytes, sizes, DAY, DEFAULT_CONFIG).problems.map((x) => `${x.key}:${x.severity}`);
  assert.deepEqual(sev(4.4e9), []);
  assert.deepEqual(sev(4.6e9), ['d1_size:medium']);
  assert.deepEqual(sev(4.95e9), ['d1_size:high']);
  assert.deepEqual(sev(4.3e9, [{ at: at - 24 * 3600000, bytes: 4.1e9 }]), ['d1_growth:medium']);
  assert.deepEqual(sev(4.15e9, [{ at: at - 24 * 3600000, bytes: 4.1e9 }]), []);
  // Mẫu quá cũ (> 28 giờ) không dùng để tính tăng, và bị bỏ khỏi danh sách mẫu.
  const r = sizeProblems(4.4e9, [{ at: at - 40 * 3600000, bytes: 5e9 }], DAY, DEFAULT_CONFIG);
  assert.deepEqual(r.problems, []);
  assert.equal(r.sizes.length, 1);
});

void test('sao lưu đêm (backup:last): chưa có khoá hoặc chưa gắn kho R2 thì không kiểm; lỗi sau lần thử cuối hoặc quá 26 giờ thì 🟠', () => {
  const ago = (h: number) => new Date(DAY.getTime() - h * 3600000).toISOString();
  const b = (v: unknown) => backupProblems(typeof v === 'string' ? v : JSON.stringify(v), DAY);
  assert.deepEqual(backupProblems(null, DAY), { ran: false, problems: [] });
  assert.deepEqual(b({ status: 'off', startedAt: ago(1), attempts: 0, error: 'Chưa cấu hình kho sao lưu' }), { ran: false, problems: [] });
  assert.deepEqual(b({ status: 'ok', startedAt: ago(2), finishedAt: ago(1), attempts: 1, lastOkAt: ago(1) }), { ran: true, problems: [] });
  assert.match(b({ status: 'ok', startedAt: ago(28), finishedAt: ago(27), attempts: 1, lastOkAt: ago(27) }).problems[0].title, /26 giờ/);
  // Đang thử lại (lần 1, 2): chưa báo lỗi; lượt đầu đang chạy: chưa đo được.
  assert.deepEqual(b({ status: 'fail', startedAt: ago(1), attempts: 1, error: 'x', lastOkAt: ago(20) }).problems, []);
  assert.equal(b({ status: 'running', startedAt: ago(0.1), attempts: 1 }).ran, false);
  const failed = b({ status: 'fail', startedAt: ago(1), attempts: 3, error: 'R2 put 0912345678 failed', lastOkAt: ago(25) });
  assert.match(failed.problems[0].title, /lỗi/);
  assert.doesNotMatch(String(failed.problems[0].detail), /0912345678/);
  assert.equal(b(ago(1)).problems.length, 0);
  assert.equal(b(ago(27)).problems.length, 1);
  assert.equal(b('{"khác":1}').ran, false);
});

void test('lớp 2: báo một lần, "đã ổn" khi chạy lại; không đọc được D1 thì vẫn đòi báo (trần Cache API chặn trùng)', () => {
  let r = schedStep(null, true, DAY);
  assert.equal(r.send, 'alert');
  r = schedStep({ ...r.next!, notifiedAt: DAY.toISOString() }, true, min(DAY, 5));
  assert.equal(r.send, null);
  r = schedStep(r.next, false, min(DAY, 10));
  assert.equal(r.send, 'resolved');
  assert.equal(schedStep(r.next, false, min(DAY, 15)).send, null);
  assert.equal(schedStep(undefined, true, DAY).send, 'alert');
});

void test('che SĐT và bí mật trong chữ lỗi', () => {
  const s = scrub('GET https://x/api?api_key=abc123&page=1 bot12345:AAH-x lỗi khách 0912 345 678 và +84987654321');
  assert.doesNotMatch(s, /abc123|AAH-x|345 678|987654321/);
  assert.match(s, /api_key=\*\*\*&page=1/);
});
