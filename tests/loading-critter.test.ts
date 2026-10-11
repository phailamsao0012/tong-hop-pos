// Con vật chờ tải (plan web-tong/2026-10-11-con-vat-cho-tai/plan.md): túi xáo, chọn một con mỗi lần mở trang, thời điểm kết.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { SCENES, critterSize, drawFromBag, exitPhase, isStill, noteCritterPage, sceneFor, type Bag, type SceneId } from '../app/loading-critter/pick';

/** Số giả ngẫu nhiên có hạt giống, để test lặp lại được. */
const seeded = (seed: number) => () => { seed = (seed * 1664525 + 1013904223) % 2 ** 32; return seed / 2 ** 32; };

void test('túi xáo: mỗi 5 lần bốc đủ 5 con, không bao giờ trùng con vừa xem (kể cả lúc xáo túi mới)', () => {
  for (let seed = 1; seed <= 200; seed++) {
    const rand = seeded(seed);
    let state: Bag = { bag: [], last: null };
    const seen: SceneId[] = [];
    for (let i = 0; i < 50; i++) { const r = drawFromBag(state, rand); seen.push(r.scene); state = r.state; }
    for (let i = 0; i < 50; i += 5) assert.deepEqual(new Set(seen.slice(i, i + 5)).size, 5, `seed ${seed}: lượt ${i}`);
    for (let i = 1; i < 50; i++) assert.notEqual(seen[i], seen[i - 1], `seed ${seed}: lặp liền ở ${i}`);
  }
});

void test('túi xáo: túi trong bộ nhớ bị sửa bậy thì bỏ phần lạ', () => {
  const r = drawFromBag({ bag: ['xx' as SceneId, 'pg'], last: 'ck' });
  assert.equal(r.scene, 'pg');
  assert.deepEqual(r.state, { bag: [], last: 'pg' });
});

void test('một lần mở trang một con: ô sau, "Thử lại" cùng kỳ giữ con cũ; đổi kỳ hoặc mở lại trang thì con khác', () => {
  // Chạy ngoài trình duyệt: không có sessionStorage nên bốc thường, vẫn tránh con vừa xem.
  noteCritterPage('center');
  const a = sceneFor('2026-10-01..2026-10-11');
  assert.ok(a && SCENES.includes(a));
  assert.equal(sceneFor('2026-10-01..2026-10-11'), a);
  const b = sceneFor('2026-10-11..2026-10-11');
  assert.notEqual(b, a);
  noteCritterPage('customers');
  const c = sceneFor('2026-10-11..2026-10-11');
  assert.notEqual(c, b);
  noteCritterPage('center');
  assert.notEqual(sceneFor('2026-10-11..2026-10-11'), c, 'quay lại trang cũ cũng là một lần mở mới');
});

void test('thời điểm (QA A1): số về khi con vật mới hiện < 150 ms thì chỉ mờ nhanh, còn lại nhịp kết', () => {
  assert.equal(exitPhase(0), 'quick');
  assert.equal(exitPhase(149), 'quick');
  assert.equal(exitPhase(150), 'done');
  assert.equal(exitPhase(5000), 'done');
});

void test('tối đa 8 con chạy; điện thoại chỉ hàng đầu chạy; cỡ theo chỗ đặt', () => {
  assert.equal(isStill(7, false), false);
  assert.equal(isStill(8, false), true);
  assert.equal(isStill(1, true), false);
  assert.equal(isStill(2, true), true);
  assert.equal(critterSize('kpi', 160), 44);
  assert.equal(critterSize('kpi', 260), 56);
  assert.equal(critterSize('card', 160), 96);
});
