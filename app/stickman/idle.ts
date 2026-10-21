// Kho trò lúc chờ (anh Vũ 21/10/2026: "khoảng 100 hành động, lên web ngẫu nhiên, đẹp, mượt"). Mỗi trò bắt đầu từ dáng đang có,
// bộ chạy tự đưa về dáng đứng sau trò; mỗi trò tự bốc ngẫu nhiên chỗ đứng, hướng, tốc độ, số lần, nên cùng một trò cũng ít khi giống nhau.
import { POSES, STAND, ease, lerp } from './engine';
import { R, TUCK, chance, pick, type Actor, type Box } from './runtime';

export type Act = { id: string; name: string; /** Bề ngang tối thiểu (px) chỗ đi được trong ô. */ need?: number; run: (a: Actor, b: Box) => Promise<void> };

const now = () => performance.now();
/** Chỗ đứng cho trò: trong khoảng lo..hi của ô, gần chỗ đang đứng (đi vài bước chứ không băng cả ô, để trò bắt đầu nhanh). */
const spot = (a: Actor, b: Box, lo = 0.15, hi = 0.85) => {
  const l = b.x0 + b.w * lo, h = b.x0 + b.w * hi, x = a.x + R(-28, 28);
  return Math.max(l, Math.min(h, x));
};
const mid = (b: Box) => (b.x0 + b.x1) / 2;
/** Đi tới chỗ còn trống room px phía trước rồi quay mặt về phía đó; trả hướng. */
async function roomy(a: Actor, b: Box, room: number): Promise<1 | -1> {
  const d: 1 | -1 = chance(0.5) ? 1 : -1;
  const lo = d > 0 ? b.x0 : Math.min(b.x1, b.x0 + room), hi = d > 0 ? Math.max(b.x0, b.x1 - room) : b.x1;
  await a.walk(Math.max(lo, Math.min(hi, a.x + R(-20, 20))));
  a.face(d);
  return d;
}
/** Phát hạt đều tay trong lúc làm trò: gọi trong loop2 với t (giây). */
function every(sec: number) { let last = -1; return (t: number) => { if (t - last >= sec) { last = t; return true; } return false; }; }

const DOOR = '<rect class="sm-dark" x="0" y="-30" width="18" height="30" rx="2"/><g class="leaf"><rect class="sm-w" x="0" y="-30" width="18" height="30" rx="2"/><circle class="sm-k" cx="14" cy="-15" r="1.3"/></g>';
/** Cửa gỗ mọc từ mặt đất; bản lề bên trái. */
export function door(a: Actor, x: number, y: number) {
  const g = a.prop(DOOR, 'back');
  const leaf = g.querySelector('.leaf')!;
  a.place(g, x, y, 0, 1, 0);
  return {
    g,
    grow: () => a.tw(240, (_, e) => a.place(g, x, y, 0, 1, Math.max(0.01, e)), ease.back),
    open: (to = 0.85, ms = 300, e = ease.back) => a.tw(ms, (_, k) => leaf.setAttribute('transform', `scale(${(1 - to * k).toFixed(3)},1)`), e),
    shut: () => a.tw(200, (_, k) => leaf.setAttribute('transform', `scale(${(0.15 + 0.85 * k).toFixed(3)},1)`), ease.out),
    sink: () => a.tw(220, (_, e) => a.place(g, x, y, 0, 1, Math.max(0.01, 1 - e)), ease.in),
  };
}
const BALL = '<g><circle r="4" class="sm-paper"/><path class="sm-thin" d="M-4,0H4M0,-4V4"/></g>';
const STONE = '<circle r="2.6" class="sm-s"/>';

export const IDLE: Act[] = [
  { id: 'stroll', name: 'Đi dạo', run: async (a, b) => {
    await a.walk(spot(a, b));
    await a.to({ head: -14 }, 300); await a.wait(R(300, 600));
    a.turn(); await a.wait(300); await a.to({ head: 0 }, 250);
    await a.walk(b.x0 + b.w * R(0.1, 0.9), 'walk', R(40, 56));
  } },
  { id: 'jog', name: 'Chạy bộ', need: 60, run: async (a, b) => {
    for (let i = 0; i < 2; i++) await a.run(a.x < mid(b) ? b.x1 : b.x0, R(95, 125));
    const h = a.headPt();
    a.fx('', h.x - 5 * a.dir, h.y, { cls: 'sm-dropl', dy: 12, dx: -6 * a.dir });
    void a.say('phù!', 800);
    await a.loop2(900, (t) => ({ lean: 32, sA: 36, eA: 34, sB: 30, eB: 34, hA: 12, kA: 14, hB: -6, head: 8 + 5 * Math.sin(t * 12) }));
  } },
  { id: 'peek', name: 'Ngó nghiêng', run: async (a, b) => {
    await a.walk(b.x1, 'tiptoe'); a.face(1);
    await a.to({ ...POSES.look, lean: 30 }, 380); await a.say('?', 700);
    await a.to(STAND, 250);
    await a.walk(b.x0, 'tiptoe'); a.face(-1);
    await a.to({ ...POSES.look, lean: 30, head: -16 }, 380); await a.wait(500);
  } },
  { id: 'scratch', name: 'Gãi đầu', run: async (a, b) => {
    await a.walk(spot(a, b));
    void a.say(pick(['hmm?', 'ơ…', 'sao lâu thế?']), 1200);
    await a.loop2(1300, (t) => ({ sA: 125, eA: 100 + 14 * Math.sin(t * 26), head: 14, lean: -3 }));
  } },
  { id: 'stretch', name: 'Vươn vai', run: async (a, b) => {
    await a.walk(spot(a, b));
    void a.say('oáp~', 1300);
    await a.to({ ...POSES.armsUp, lean: -8, head: -18, eye: 1, air: 3 }, 600);
    await a.loop2(800, (t) => ({ lean: -8 + 5 * Math.sin(t * 6), sA: 165 + 8 * Math.sin(t * 6), sB: 160 - 8 * Math.sin(t * 6) }));
    await a.to({ sA: 95, eA: 0, sB: 95, eB: 0, lean: 0, head: 0, air: 0, eye: 0 }, 400);
    await a.loop2(600, (t) => ({ lean: 16 * Math.sin(t * 9) }));
  } },
  { id: 'doze', name: 'Ngủ gật', run: async (a, b) => {
    await a.walk(spot(a, b)); await a.to(POSES.sit, 450);
    await a.to({ eye: 1, head: 18 }, 600);
    for (let i = 0; i < 3; i++) {
      const h = a.headPt();
      a.fx('z', h.x + 6 * a.dir, h.y - 6, { dx: 10 * a.dir, dy: -18, cls: 'sm-z', ms: 1000, s1: 1.4 });
      await a.loop2(700, (_, k) => ({ head: 18 + 14 * Math.sin(k * Math.PI) }), 60);
    }
    await a.to({ head: -8, eye: 2, lean: -14 }, 120, ease.out);
    void a.say('!', 600); await a.wait(500);
  } },
  { id: 'ledge', name: 'Ngồi vắt vẻo mép ô', run: async (a, b) => {
    const x = spot(a, b, 0.3, 0.7);
    await a.walk(x);
    await a.jump(x + 4 * a.dir, b.top + 1, 30);
    await a.to(POSES.perch, 350);
    void a.say(pick(['…', '♪', 'chờ tí']), 1600);
    await a.loop2(R(1600, 2200), (t) => ({ kA: 88 + 24 * Math.sin(t * 7), kB: 80 - 24 * Math.sin(t * 7) }));
    await a.to({ ...STAND, sA: 60, sB: 60 }, 250);
    await a.jump(a.x + 12 * a.dir, b.gy, 8);
  } },
  { id: 'lie', name: 'Nằm dài', need: 60, run: async (a, b) => {
    await roomy(a, b, 50);
    await a.to(POSES.sitLegs, 400); await a.to(POSES.lie, 450);
    void a.say('♪', 1400);
    await a.loop2(R(1600, 2200), (t) => ({ hB: 62, kB: 75 + 18 * Math.sin(t * 8), hA: 90 }));
    await a.to(POSES.sitLegs, 400);
  } },
  { id: 'hopscotch', name: 'Nhảy lò cò', need: 60, run: async (a, b) => {
    const d = await roomy(a, b, 60), n = 4, step = Math.min(14, (d > 0 ? b.x1 - a.x : a.x - b.x0) / n);
    await a.to({ hB: 40, kB: 110, sA: 70, eA: 20, sB: 60, eB: 20 }, 200);
    for (let i = 0; i < n; i++) {
      const x0 = a.x;
      await a.tw(300, (k) => { a.x = x0 + step * d * k; a.p.air = 10 * 4 * k * (1 - k); a.p.hA = 10 - 20 * k; a.p.kA = 24 * Math.sin(k * Math.PI); }, ease.linear);
    }
  } },
  { id: 'rope', name: 'Nhảy dây', run: async (a, b) => {
    await a.walk(spot(a, b));
    await a.to({ sA: 30, eA: 40, sB: 25, eB: 45 }, 250);
    const rope = a.prop('<ellipse class="sm-thin" rx="1" ry="2.5"/>').firstElementChild as SVGEllipseElement;
    const t0 = now();
    const th = () => (now() - t0) / 1000 * Math.PI * 2 * 1.7;
    a.follow(() => {
      const h = a.hand('A'), q = th(), r = a.gy + 3 + a.p.air - h.y + 2;
      const vx = h.x + Math.sin(q) * r * a.dir, vy = h.y + Math.cos(q) * r;
      const cx = (h.x + vx) / 2, cy = (h.y + vy) / 2, len = Math.hypot(vx - h.x, vy - h.y) / 2, ang = Math.atan2(vy - h.y, vx - h.x) * 180 / Math.PI;
      rope.setAttribute('transform', `translate(${cx.toFixed(1)},${cy.toFixed(1)}) rotate(${ang.toFixed(1)})`);
      rope.setAttribute('rx', len.toFixed(1)); rope.setAttribute('ry', (len * 0.42).toFixed(1));
    });
    await a.loop2(2600, () => { const c = Math.cos(th()); const up = Math.max(0, c) ** 3; return { air: 8 * up, hA: 6 + 14 * up, kA: 6 + 30 * up, hB: 2 + 12 * up, kB: 6 + 30 * up, sA: 30 + 10 * Math.sin(th()), sB: 25 + 10 * Math.sin(th()) }; });
  } },
  { id: 'roll', name: 'Lộn nhào', need: 50, run: async (a, b) => {
    const d = await roomy(a, b, 50);
    await a.to(TUCK, 280);
    const x0 = a.x;
    await a.tw(650, (_, e) => { a.x = x0 + 40 * d * e; a.p.rot = 360 * e; });
    a.p.rot = 0;
    await a.to(POSES.crouch, 150); await a.to(POSES.cheer, 320, ease.back);
    void a.say('tada!', 700); await a.wait(500);
  } },
  { id: 'handstand', name: 'Trồng cây chuối', run: async (a, b) => {
    await a.walk(spot(a, b, 0.3, 0.7));
    await a.to(POSES.crouch, 250);
    await a.to(POSES.handstand, 550);
    await a.loop2(R(1400, 2000), (t) => ({ hA: 10 + 10 * Math.sin(t * 5), hB: -10 + 10 * Math.sin(t * 5 + 1), kA: 15 + 15 * Math.sin(t * 3), lean: 4 * Math.sin(t * 4) }));
    await a.to({ ...POSES.crouch, rot: 360 }, 500); a.p.rot = 0;
  } },
  { id: 'cartwheel', name: 'Lộn bánh xe', need: 70, run: async (a, b) => {
    const d = await roomy(a, b, 70);
    await a.to({ sA: 170, sB: 190, eA: 0, eB: 0, hA: 30, hB: -30, kA: 0, kB: 0 }, 250);
    const x0 = a.x, n = chance(0.5) ? 1 : 2;
    await a.tw(550 * n, (k) => { a.x = x0 + 34 * n * d * k; a.p.rot = 360 * n * k; });
    a.p.rot = 0;
    await a.to(POSES.cheer, 260, ease.back); await a.wait(300);
  } },
  { id: 'pushup', name: 'Hít đất', need: 40, run: async (a, b) => {
    await roomy(a, b, 30);
    await a.to(POSES.crouch, 250); await a.to(POSES.plank, 350);
    const n = Math.round(R(3, 5));
    for (let i = 1; i <= n; i++) { await a.to(POSES.plankDown, 280); await a.to(POSES.plank, 280); void a.say(String(i), 300); }
    await a.to(POSES.crouch, 300);
  } },
  { id: 'squat', name: 'Squat', run: async (a, b) => {
    await a.walk(spot(a, b));
    for (let i = 1; i <= 3; i++) {
      await a.to({ lean: 30, hA: 85, kA: 120, hB: 82, kB: 118, sA: 90, eA: 0, sB: 88, eB: 0, head: -10 }, 380);
      void a.say(String(i), 400);
      await a.to({ ...STAND, sA: 90, eA: 0, sB: 88, eB: 0 }, 330);
    }
  } },
  { id: 'dance', name: 'Nhảy múa', run: async (a, b) => {
    await a.walk(spot(a, b));
    const note = every(0.28), flip = every(0.7);
    await a.loop2(R(2000, 2800), (t) => {
      const s = Math.sin(t * Math.PI * 4), c = Math.cos(t * Math.PI * 4);
      if (note(t)) { const h = a.headPt(); a.fx(pick(['♪', '♫']), h.x + R(-10, 10), h.y - 8, { dy: -20, dx: R(-10, 10), cls: 'sm-note', ms: 900 }); }
      if (t > 0.3 && flip(t)) a.turn();
      return { sA: 130 + 40 * s, eA: 40 - 30 * c, sB: 60 - 50 * s, eB: 90, lean: 8 * s, hA: 15 + 15 * s, kA: 25 + 25 * Math.max(0, s), hB: -10 + 15 * s, kB: 20, air: 3 * Math.abs(c), head: 10 * c };
    });
  } },
  { id: 'moonwalk', name: 'Moonwalk', need: 60, run: async (a, b) => {
    await a.walk(Math.max(b.x0 + 60, spot(a, b, 0.6, 0.95))); a.face(1);
    const x0 = a.x, dist = Math.min(70, x0 - b.x0);
    await a.tw(dist / 30 * 1000, (k) => {
      a.x = x0 - dist * k;
      const s = Math.sin(dist * k / 10 * Math.PI), w = Math.min(1, k * 8);
      a.p.hA = w * (4 + 8 * Math.max(0, s)); a.p.kA = w * 42 * Math.max(0, s); a.p.hB = w * (4 + 8 * Math.max(0, -s)); a.p.kB = w * 42 * Math.max(0, -s);
      a.p.sA = w * 20 * s; a.p.sB = -w * 20 * s; a.p.lean = 4 * w;
    }, ease.linear);
    for (let i = 0; i < 4; i++) { a.turn(); await a.wait(70); }
    await a.to({ sA: 165, eA: -25, sB: 10, eB: 10, hA: 0, kA: 0, hB: 0, kB: 0, air: 4 }, 200, ease.out);
    void a.say('hii!', 700); await a.wait(600);
  } },
  { id: 'clap', name: 'Vỗ tay', run: async (a, b) => {
    await a.walk(spot(a, b));
    void a.say(pick(['hay quá!', 'cố lên!', 'bravo!']), 1400);
    let up = false;
    await a.loop2(1600, (t) => {
      const s = Math.sin(t * Math.PI * 6);
      if (s > 0.9 && !up) { up = true; const h = a.hand('A'); a.fx('✦', h.x, h.y, { cls: 'sm-star', dy: -10, ms: 400, s0: 0.4 }); }
      if (s < 0) up = false;
      return { sA: 80 + 10 * s, eA: 30 + 30 * s, sB: 70 - 10 * s, eB: 30 + 30 * s, air: 1.5 * Math.max(0, s) };
    });
  } },
  { id: 'wave', name: 'Vẫy tay chào', run: async (a, b) => {
    await a.walk(spot(a, b));
    void a.say(pick(['chào sếp!', 'hi!', 'xin chào!']), 1300);
    await a.loop2(1500, (t) => ({ sB: 160, eB: 20 + 32 * Math.sin(t * 14), lean: -4, head: -6, air: 1 + Math.sin(t * 7) }));
  } },
  { id: 'slide', name: 'Chạy trượt', need: 70, run: async (a, b) => {
    const d = await roomy(a, b, 70), end = d > 0 ? b.x1 : b.x0;
    await a.run(a.x + (end - a.x) * 0.45, 150);
    const x0 = a.x;
    a.dust(a.x, a.gy);
    void a.to({ lean: -24, hA: 50, kA: 0, hB: -10, kB: 50, sA: -60, eA: 0, sB: 80, eB: 20, air: 0 }, 140, ease.out);
    await a.tw(560, (k, e) => { a.x = x0 + (end - x0) * e; if (k < 0.6 && Math.random() < 0.25) a.dust(a.x, a.gy, 1); }, ease.out);
    await a.to(POSES.cheer, 250, ease.back);
  } },
  { id: 'trip', name: 'Vấp ngã', need: 55, run: async (a, b) => {
    const d = await roomy(a, b, 55);
    await a.walk(a.x + 20 * d, 'walk', 70);
    const x0 = a.x;
    void a.tw(300, (_, e) => { a.x = x0 + 14 * d * e; }, ease.out);
    await a.to({ ...POSES.lieFront, sA: 140, sB: 150, head: -40, eye: 2 }, 300, ease.in);
    a.stars(a.headPt().x, a.headPt().y - 4, 4); a.dust(a.x, a.gy, 5);
    void a.say('ối!', 800);
    await a.wait(600);
    await a.to(POSES.plank, 300); await a.to(POSES.crouch, 300); await a.to(STAND, 250);
    await a.loop2(600, (t) => ({ sA: 30 + 20 * Math.sin(t * 25), eA: 60, head: 15 }));
  } },
  { id: 'banana', name: 'Trượt vỏ chuối', need: 50, run: async (a, b) => {
    const d = await roomy(a, b, 50), bx = a.x + 30 * d;
    const ban = a.prop('<path class="sm-a" d="M-6,0 Q0,-6 6,0 L4,1 Q0,-3 -4,1Z"/><path class="sm-a" d="M-6,0 l-3,-3 M6,0 l3,-3" stroke="var(--sm-amber)" stroke-width="1.6"/>', 'back');
    a.place(ban, bx, a.gy, 0, d, 1);
    await a.walk(bx - 2 * d, 'walk', 48);
    const x0 = a.x;
    void a.tw(360, (_, e) => { a.x = x0 + 10 * d * e; }, ease.out);
    void a.tw(500, (k) => a.place(ban, bx + 26 * d * k, a.gy - 18 * 4 * k * (1 - k), 300 * k * d, d, 1), ease.linear);
    await a.to({ lean: -70, hA: 120, kA: 10, hB: 100, kB: 20, sA: 170, sB: 150, eye: 2 }, 240, ease.out);
    await a.to({ ...POSES.sitLegs, eye: 2 }, 170, ease.in);
    a.stars(a.headPt().x, a.headPt().y - 4, 5); a.dust(a.x, a.gy, 4);
    void a.say('á!', 800);
    await a.wait(700); await a.to(POSES.crouch, 300);
  } },
  { id: 'juggle', name: 'Tung hứng', run: async (a, b) => {
    await a.walk(spot(a, b));
    await a.to({ sA: 50, eA: 60, sB: 45, eB: 60, head: -10 }, 250);
    const balls = ['sm-r', 'sm-b', 'sm-a'].map((c) => a.prop(`<circle r="2.6" class="${c}"/>`));
    const t0 = now(), T = 0.9;
    a.follow(() => {
      const t = (now() - t0) / 1000, hA = a.hand('A'), hB = a.hand('B');
      balls.forEach((g, i) => {
        const ph = (t / T + i / 3) % 1, left = (Math.floor(t / T + i / 3) + i) % 2 === 0;
        const from = left ? hA : hB, to = left ? hB : hA;
        a.place(g, lerp(from.x, to.x, ph) + 4 * a.dir * Math.sin(ph * Math.PI), lerp(from.y, to.y, ph) - 3 - 26 * 4 * ph * (1 - ph));
      });
    });
    await a.loop2(R(2200, 3000), (t) => ({ eA: 60 + 16 * Math.sin(t * Math.PI * 2 / T * 1.5), eB: 60 - 16 * Math.sin(t * Math.PI * 2 / T * 1.5), head: -14 }));
  } },
  { id: 'kickball', name: 'Đá bóng', need: 70, run: async (a, b) => {
    const d = await roomy(a, b, 70), ball = a.prop(BALL);
    let bx = a.x + 24 * d;
    a.place(ball, bx, a.gy - 4);
    await a.walk(bx - 10 * d, 'walk', 45); a.face(d);
    await a.to({ hA: -40, kA: 50, lean: -6, sA: 40, sB: -30 }, 180);
    await a.to({ hA: 70, kA: 0, lean: -12 }, 110, ease.out);
    const end = d > 0 ? b.r - 8 : b.l + 8, x0 = bx;
    await a.tw(500, (k, e) => { bx = x0 + (end - x0) * e; a.place(ball, bx, a.gy - 4 - 14 * Math.sin(k * Math.PI), bx * 14); }, ease.out);
    void a.to(STAND, 200); void a.say('vào!', 700); a.stars(end, a.gy - 6, 4);
    const back = a.x + 10 * d;
    await a.tw(800, (_, e) => { bx = end + (back - end) * e; a.place(ball, bx, a.gy - 4, bx * 14); }, ease.out);
    await a.to({ hA: 30, kA: 40 }, 150); await a.to(STAND, 200);
  } },
  { id: 'keepy', name: 'Tâng bóng', run: async (a, b) => {
    await a.walk(spot(a, b));
    const ball = a.prop('<circle r="3.5" class="sm-paper"/>'), n = Math.round(R(4, 7));
    for (let i = 0; i < n; i++) await a.tw(560, (k) => {
      const up = Math.max(0, 1 - k / 0.22, (k - 0.78) / 0.22);
      a.p.hA = 58 * up; a.p.kA = 52 * up; a.p.sA = 30; a.p.sB = 25; a.p.head = 10;
      a.place(ball, a.x + 8 * a.dir, a.gy - 15 - 30 * 4 * k * (1 - k));
    }, ease.linear);
    void a.say(`${n}!`, 700);
    await a.to({ ...POSES.cheer }, 300, ease.back);
  } },
  { id: 'kite', name: 'Thả diều', need: 40, run: async (a, b) => {
    await a.walk(spot(a, b, 0.4, 0.8)); a.face(chance(0.5) ? 1 : -1);
    const kite = a.prop('<path class="sm-r" d="M0,-7 L5,0 L0,9 L-5,0Z"/><path class="sm-thin" d="M-5,0 H5 M0,-7 V9"/><path class="sm-thin" d="M0,9 q-3,4 0,8 q3,4 0,8"/>');
    const str = a.line('sm-thin'), t0 = now();
    let lift = 0;
    a.follow(() => {
      const t = (now() - t0) / 1000, h = a.hand('A');
      const kx = h.x + (18 + 22 * lift + 4 * Math.sin(t * 1.7)) * a.dir, ky = lerp(h.y - 6, Math.max(b.top - 18, h.y - 70), lift) + 3 * Math.sin(t * 2.3);
      a.place(kite, kx, ky, 15 * Math.sin(t * 2));
      str.setAttribute('d', `M${h.x.toFixed(1)},${h.y.toFixed(1)} Q${((h.x + kx) / 2).toFixed(1)},${(Math.max(h.y, ky) + 6).toFixed(1)} ${kx.toFixed(1)},${(ky + 9).toFixed(1)}`);
    });
    await a.to({ sA: 120, eA: 10 }, 250);
    const target = a.x - 24 * a.dir;
    void a.backstep(Math.max(b.x0, Math.min(b.x1, target)), 22);
    await a.tw(1600, (_, e) => { lift = e; }, ease.out);
    void a.say('bay cao!', 900);
    await a.loop2(1200, (t) => ({ sA: 120 + 10 * Math.sin(t * 4), lean: -8 }));
  } },
  { id: 'balloon', name: 'Bóng bay', run: async (a, b) => {
    await a.walk(spot(a, b));
    const bal = a.prop('<path class="sm-thin" d="M0,0 q-2,-8 0,-16"/><ellipse class="sm-r" cx="0" cy="-23" rx="6" ry="7.5"/><path class="sm-r" d="M-1.5,-15.6 h3 l-1.5,1.8z"/>');
    a.hold(bal, 'A', 'up');
    await a.to({ sA: 165, eA: 0 }, 300);
    void a.say('bay nè!', 900);
    await a.tw(1200, (k, e) => { a.p.air = 18 * e; a.p.hA = 10 + 8 * Math.sin(k * 20); a.p.hB = -8 - 8 * Math.sin(k * 20); a.p.kA = 22; a.p.kB = 28; a.p.sB = 40 + 30 * Math.sin(k * 14); }, ease.inOut);
    const h = a.hand('A');
    bal.remove();
    a.fx('BỤP!', h.x, h.y - 23, { cls: 'sm-star', dy: -8, ms: 600, s0: 0.8, s1: 1.3 }); a.stars(h.x, h.y - 23, 6, 14);
    await a.to({ eye: 2 }, 80);
    await a.tw(260, (_, e) => { a.p.air = 18 * (1 - e); }, ease.in);
    await a.to({ lean: 16, hA: 40, kA: 70, hB: 34, kB: 64, sq: 0.85 }, 80);
    await a.to(STAND, 240, ease.back);
    void a.say('ơ…', 700); await a.wait(500);
  } },
  { id: 'umbrella', name: 'Che ô', run: async (a, b) => {
    await a.walk(spot(a, b));
    let raining = true, open = false, last = 0;
    a.follow(() => {
      const t = now();
      if (!raining || t - last < 60) return;
      last = t;
      const x = a.x + R(-34, 34), stop = open && Math.abs(x - a.x - 2 * a.dir) < 15;
      a.fx('', x, b.top + 8, { cls: 'sm-dropl', dy: (stop ? a.gy - 44 : a.gy - 4) - b.top - 8, dx: -3, ms: 480, s0: 1, s1: 1 });
    });
    await a.wait(300);
    await a.to({ ...POSES.look, head: -18 }, 300); void a.say('mưa!', 700); await a.wait(500);
    const um = a.prop('<g class="in"><path class="sm-l" d="M0,0 V-24"/><path class="sm-b" d="M-15,-22 Q0,-36 15,-22 Q11,-25 7.5,-22 Q4,-25 0,-22 Q-4,-25 -7.5,-22 Q-11,-25 -15,-22Z"/></g>');
    const inner = um.firstElementChild!;
    a.hold(um, 'A', 'up');
    await a.to({ ...STAND, sA: 100, eA: 70 }, 300);
    await a.tw(280, (_, e) => inner.setAttribute('transform', `scale(${(0.12 + 0.88 * e).toFixed(3)},1)`), ease.back);
    open = true;
    await a.loop2(R(1300, 1800), (t) => ({ head: -4 + 3 * Math.sin(t * 3), hA: 3 + 3 * Math.sin(t * 2), hB: -3 }));
    raining = false;
    await a.wait(500); void a.say('tạnh rồi', 800);
    await a.tw(200, (_, e) => inner.setAttribute('transform', `scale(${(1 - 0.88 * e).toFixed(3)},1)`), ease.in);
  } },
  { id: 'stone-door', name: 'Ném đá phá cửa', need: 80, run: async (a, b) => {
    const d = await roomy(a, b, 80), dx = a.x + 52 * d - (d < 0 ? 18 : 0);
    const dr = door(a, dx, a.gy);
    await dr.grow(); await a.wait(200);
    await a.to({ lean: 50, sA: 60, eA: 20, hA: 40, kA: 60, hB: 30, kB: 50 }, 350);
    const st = a.prop(STONE);
    a.hold(st, 'A', 'up');
    await a.to({ lean: 0, sA: 160, eA: 40, hA: 3, kA: 2, hB: -3, kB: 2 }, 300);
    await a.to({ sA: 60, eA: 0, lean: 8 }, 120, ease.in);
    const s0 = a.hand('A'), tx = dx + 9, ty = a.gy - 16;
    st.remove();
    const fly = a.prop(STONE);
    await a.tw(380, (k) => a.place(fly, lerp(s0.x, tx, k), lerp(s0.y, ty, k) - 20 * 4 * k * (1 - k)), ease.linear);
    fly.remove();
    await dr.open(1.05, 140, ease.out);
    a.stars(tx, ty, 6); void a.say('BỐP!', 600);
    await a.to(POSES.cheer, 220, ease.back); await a.wait(300);
    await a.run(dx + (d > 0 ? -10 : 28), 150);
    await a.jump(dx + 9, a.gy, 16, 360);
    await a.tw(240, (_, e) => { a.op = 1 - e; }, ease.in);
    await dr.shut(); await dr.sink();
    a.x = spot(a, b); a.p.air = 50;
    await a.tw(200, (_, e) => { a.op = e; }, ease.out);
    await a.tw(320, (_, e) => { a.p.air = 50 * (1 - e); }, ease.in);
    await a.to({ lean: 16, hA: 40, kA: 70, hB: 34, kB: 64, sq: 0.85 }, 80);
    await a.to(STAND, 240, ease.back);
  } },
  { id: 'knock', name: 'Gõ cửa', need: 60, run: async (a, b) => {
    const d = await roomy(a, b, 60), dx = a.x + 30 * d - (d < 0 ? 18 : 0);
    const dr = door(a, dx, a.gy);
    await dr.grow();
    a.face(d);
    void a.say('cốc cốc', 900);
    for (let i = 0; i < 3; i++) { await a.to({ sA: 95, eA: 70 }, 120); await a.to({ sA: 95, eA: 30 }, 120); }
    await a.to(STAND, 200); await a.wait(400);
    await dr.open(0.85, 380);
    await a.to({ lean: 26, head: -10 }, 300); void a.say(pick(['có ai không?', 'số đâu rồi?']), 1000); await a.wait(900);
    await a.to({ ...POSES.shrug, lean: 0 }, 300); await a.wait(400);
    await dr.shut(); await a.wait(150); await dr.sink();
  } },
  { id: 'fishing', name: 'Câu cá', need: 60, run: async (a, b) => {
    const d = await roomy(a, b, 60), px = a.x + 38 * d;
    const pond = a.prop('<ellipse class="sm-sky" rx="14" ry="3" opacity=".75"/>', 'back');
    a.tw(300, (_, e) => a.place(pond, px, a.gy - 1, 0, Math.max(0.01, e), Math.max(0.01, e)), ease.back).catch(() => undefined);
    await a.to(POSES.sit, 400);
    const rod = a.prop('<path class="sm-ws" d="M0,0 L24,-18" stroke-width="1.6"/>'), line = a.line('sm-thin'), bob = a.prop('<circle r="1.6" class="sm-r"/>');
    a.hold(rod, 'A', 'up');
    const t0 = now();
    let pull = 0;
    a.follow(() => {
      const h = a.hand('A'), tip = { x: h.x + 24 * a.dir, y: h.y - 18 }, by = a.gy - 2 + 1.2 * Math.sin((now() - t0) / 180) - pull * 4;
      a.place(bob, px, by);
      line.setAttribute('d', `M${tip.x.toFixed(1)},${tip.y.toFixed(1)} Q${((tip.x + px) / 2).toFixed(1)},${(tip.y + 10).toFixed(1)} ${px.toFixed(1)},${by.toFixed(1)}`);
    });
    await a.to({ sA: 60, eA: 40 }, 300);
    await a.wait(R(1000, 1600));
    await a.tw(300, (_, e) => { pull = e; }, ease.out);
    void a.say('dính!', 700);
    await a.to({ sA: 110, eA: 50, lean: -14 }, 200, ease.out);
    const fish = a.prop('<path class="sm-a" d="M-5,0 Q0,-4 5,0 Q0,4 -5,0Z M5,0 l4,-3 v6z"/>');
    await a.tw(500, (k) => a.place(fish, lerp(px, a.x + 8 * d, k), a.gy - 4 - 36 * Math.sin(k * Math.PI), 360 * k), ease.inOut);
    await a.tw(400, (k) => a.place(fish, lerp(a.x + 8 * d, px, k), a.gy - 30 * Math.sin(k * Math.PI) + 4 * k, -360 * k), ease.in);
    fish.remove(); a.fx('~', px, a.gy - 4, { cls: 'sm-drop', dy: -10, ms: 500 });
    void a.say('xổng mất…', 800); await a.wait(700);
  } },
  { id: 'sweep', name: 'Quét nhà', need: 40, run: async (a, b) => {
    await a.walk(spot(a, b, 0.1, 0.5));
    const br = a.prop('<path class="sm-ws" d="M-6,0 H15"/><path class="sm-w" d="M14,-3 L22,-6 L22,6 L14,3Z"/>');
    a.hold(br, 'A', 'arm');
    await a.to({ sA: 40, eA: 20, sB: 50, eB: 40, lean: 16 }, 300);
    const x0 = a.x, dist = Math.min(50, b.x1 - x0);
    const puff = every(0.35);
    await a.tw(2200, (k) => {
      const t = k * 2.2, s = Math.sin(t * 9);
      a.x = x0 + dist * k; a.p.sA = 40 + 22 * s; a.p.sB = 50 + 22 * s; a.p.hA = 12 * Math.sin(t * 4.5); a.p.hB = -12 * Math.sin(t * 4.5);
      if (s > 0.8 && puff(t)) a.dust(a.hand('A').x + 18 * a.dir, a.gy, 2);
    }, ease.linear);
    void a.say('sạch bong!', 800); await a.wait(600);
  } },
  { id: 'wipe', name: 'Lau kính', run: async (a, b) => {
    await a.walk(spot(a, b, 0.2, 0.7)); a.face(1);
    const pane = a.prop('<rect class="sm-sky" x="0" y="-30" width="16" height="22" rx="1.5" opacity=".35"/><path class="sm-thin" d="M3,-26 l4,-3 M5,-20 l6,-5"/>', 'back');
    a.place(pane, a.x + 12, a.gy);
    const cloth = a.prop('<rect class="sm-a" x="-2.5" y="-2.5" width="5" height="5" rx="1"/>');
    a.hold(cloth, 'A', 'up');
    const sp = every(0.25);
    await a.loop2(2000, (t) => { if (sp(t)) a.stars(a.hand('A').x + 2, a.hand('A').y, 2, 8); return { sA: 95 + 22 * Math.cos(t * 9), eA: 35 + 22 * Math.sin(t * 9), lean: 4 }; });
    void a.say('bóng loáng!', 800); await a.to(POSES.handsHips, 300); await a.wait(500);
  } },
  { id: 'hammer', name: 'Đóng đinh', run: async (a, b) => {
    const d = await roomy(a, b, 30);
    const nail = a.prop('<path class="sm-l" d="M0,0 V-8 M-2,-8 H2"/>', 'back');
    let nh = 1;
    const nx = a.x + 14 * d;
    a.place(nail, nx, a.gy, 0, 1, nh);
    await a.to(POSES.kneel, 350);
    const hm = a.prop('<path class="sm-ws" d="M-2,0 H11"/><rect class="sm-k" x="9" y="-4" width="4.5" height="8" rx="1"/>');
    a.hold(hm, 'A', 'arm', -90);
    for (let i = 0; i < 3; i++) {
      await a.to({ sA: 150, eA: 40 }, 260);
      await a.to({ sA: 60, eA: 30 }, 110, ease.in);
      nh -= 0.28; a.place(nail, nx, a.gy, 0, 1, nh);
      a.fx('cộc', nx, a.gy - 14, { dy: -10, ms: 450 }); a.stars(nx, a.gy - 4, 3, 8);
    }
    void a.say('chắc chưa!', 800); await a.wait(600);
  } },
  { id: 'push-rock', name: 'Đẩy đá', need: 60, run: async (a, b) => {
    const d = await roomy(a, b, 60), rock = a.prop('<path class="sm-s" d="M-11,0 Q-12,-14 0,-16 Q12,-15 11,0Z"/>', 'back');
    let rx = a.x + 20 * d;
    a.place(rock, rx, a.gy);
    await a.to({ lean: 45, sA: 70, eA: 25, sB: 65, eB: 25, hA: 20, kA: 30, hB: -30, kB: 20 }, 300);
    void a.say('hự!', 700);
    const x0 = a.x, r0 = rx;
    await a.tw(2000, (k) => {
      const t = k * 2, s = Math.sin(t * 6);
      a.x = x0 + 26 * d * k; rx = r0 + 26 * d * k; a.place(rock, rx, a.gy, 0);
      a.p.hA = 20 + 22 * s; a.p.hB = -30 - 14 * s; a.p.kA = 30 + 20 * Math.max(0, Math.cos(t * 6)); a.p.kB = 20 + 20 * Math.max(0, -Math.cos(t * 6));
    }, ease.linear);
    a.dust(rx, a.gy, 3);
    await a.to({ lean: 30, sA: 30, sB: 30, hA: 10, hB: -10, kA: 10, kB: 10, head: 10 }, 300);
    void a.say('nặng quá…', 800); await a.wait(600);
  } },
  { id: 'tug', name: 'Kéo co', need: 50, run: async (a, b) => {
    const d: 1 | -1 = a.x < mid(b) ? -1 : 1;
    await a.walk(d > 0 ? b.x1 - 30 : b.x0 + 30); a.face(d);
    const edge = d > 0 ? b.r : b.l, rope = a.line('sm-ws');
    let slack = 0;
    a.follow(() => { const h = a.hand('A'); rope.setAttribute('d', `M${h.x.toFixed(1)},${h.y.toFixed(1)} Q${((h.x + edge) / 2).toFixed(1)},${(h.y + 2 + slack * 10).toFixed(1)} ${edge.toFixed(1)},${(h.y + 4 + slack * 18).toFixed(1)}`); });
    await a.to({ lean: -32, sA: 80, eA: 10, sB: 85, eB: 10, hA: 40, kA: 30, hB: -10, kB: 20 }, 300);
    void a.say('hò dô!', 900);
    const x0 = a.x;
    await a.tw(1800, (k) => { const s = Math.sin(k * 14); a.x = x0 - d * (6 * k + 3 * s); a.p.lean = -32 - 6 * s; }, ease.linear);
    slack = 1;
    void a.tw(300, (_, e) => { a.x = a.x - d * 3 * e; }, ease.out);
    await a.to({ ...POSES.sitLegs, eye: 2 }, 220, ease.in);
    a.stars(a.headPt().x, a.headPt().y - 4, 4); void a.say('đứt dây!', 800); await a.wait(700);
    await a.to(POSES.crouch, 300);
  } },
  { id: 'ladder', name: 'Leo thang', run: async (a, b) => {
    const x = spot(a, b, 0.3, 0.7), H = Math.min(60, b.gy - b.top - 52);
    await a.walk(x - 8 * (chance(0.5) ? 1 : -1)); a.face(x > a.x ? 1 : -1);
    const lad = a.prop(`<path class="sm-ws" stroke-width="1.6" d="M-5,0 V${-H - 30} M5,0 V${-H - 30}${Array.from({ length: Math.floor((H + 26) / 8) }, (_, i) => ` M-5,${-6 - i * 8} H5`).join('')}"/>`, 'back');
    a.place(lad, x, a.gy, 0, 1, 0.01);
    await a.tw(300, (_, e) => a.place(lad, x, a.gy, 0, 1, Math.max(0.01, e)), ease.back);
    await a.walk(x); a.face(1);
    const g0 = a.gy;
    await a.tw(1500, (k) => {
      const s = Math.sin(k * Math.PI * 6);
      a.gy = g0 - H * k; a.p.sA = 150 + 20 * s; a.p.eA = 20; a.p.sB = 150 - 20 * s; a.p.eB = 20;
      a.p.hA = 30 + 30 * Math.max(0, s); a.p.kA = 60 * Math.max(0, s); a.p.hB = 30 + 30 * Math.max(0, -s); a.p.kB = 60 * Math.max(0, -s);
    }, ease.linear);
    await a.to({ ...POSES.look, sB: 150, eB: 20, hA: 3, kA: 2, hB: -3, kB: 2 }, 300);
    void a.say(pick(['thấy số rồi!', 'cao ghê', 'ồ!']), 900);
    await a.loop2(1000, (t) => ({ head: -8 + 8 * Math.sin(t * 3) }));
    await a.tw(900, (k) => { const s = Math.sin(k * Math.PI * 4); a.gy = g0 - H * (1 - k); a.p.sA = 150 + 20 * s; a.p.sB = 150 - 20 * s; a.p.eA = 20; a.p.hA = 30 + 30 * Math.max(0, s); a.p.kA = 60 * Math.max(0, s); a.p.hB = 30 + 30 * Math.max(0, -s); a.p.kB = 60 * Math.max(0, -s); }, ease.linear);
    a.gy = g0;
    await a.tw(240, (_, e) => a.place(lad, x, a.gy, 0, 1, Math.max(0.01, 1 - e)), ease.in);
  } },
  { id: 'binoculars', name: 'Ống nhòm', run: async (a, b) => {
    await a.walk(spot(a, b));
    const bn = a.prop('<rect class="sm-k" x="-1" y="-4" width="8" height="3.4" rx="1.2"/><rect class="sm-k" x="-1" y="0.6" width="8" height="3.4" rx="1.2"/>');
    a.hold(bn, 'A', 'up');
    await a.to({ ...POSES.face, eA: 118, eB: 128 }, 300);
    await a.loop2(1200, (t) => ({ head: -6 + 10 * Math.sin(t * 2.5), lean: 4 * Math.sin(t * 2.5) }));
    a.turn(); await a.wait(200);
    await a.loop2(900, (t) => ({ head: -10 + 6 * Math.sin(t * 3) }));
    void a.say(pick(['ồ!', 'số sắp về!', 'thấy rồi!']), 900); await a.wait(700);
  } },
  { id: 'magnifier', name: 'Soi kính lúp', need: 40, run: async (a, b) => {
    await a.walk(spot(a, b, 0.1, 0.5));
    const mg = a.prop('<path class="sm-ws" d="M0,0 H6"/><circle class="sm-sky" cx="10" cy="0" r="4.5" opacity=".5"/><circle class="sm-l" cx="10" cy="0" r="4.5"/>');
    a.hold(mg, 'A', 'arm');
    await a.to({ lean: 55, head: 10, sA: 45, eA: 10, hA: 20, kA: 40, hB: 10, kB: 30 }, 400);
    const x0 = a.x;
    await a.tw(1600, (k) => { const t = k * 1.6; a.x = x0 + 30 * a.dir * k; a.p.hA = 20 + 10 * Math.sin(t * 7); a.p.hB = 10 - 10 * Math.sin(t * 7); a.p.sA = 45 + 8 * Math.sin(t * 5); }, ease.linear);
    a.fx('!', a.headPt().x, a.headPt().y - 10, { dy: -8, ms: 600, s0: 1, s1: 1.4 });
    void a.say(pick(['manh mối!', 'con kiến!', 'hừm…']), 900); await a.wait(800);
  } },
  { id: 'coffee', name: 'Uống cà phê', run: async (a, b) => {
    await a.walk(spot(a, b));
    const cup = a.prop('<path class="sm-paper" d="M-3,-1 h7 l-1,6 h-5z"/><path class="sm-l" d="M4,0 q3,1 0,3"/>');
    a.hold(cup, 'B', 'up');
    await a.to({ sB: 60, eB: 80 }, 300);
    const st = every(0.4);
    await a.loop2(800, (t) => { if (st(t)) { const h = a.hand('B'); a.fx('~', h.x, h.y - 6, { dy: -12, ms: 800, cls: 'sm-z' }); } return { head: 4 }; });
    await a.to({ sB: 80, eB: 125, head: -14 }, 350); await a.wait(600);
    await a.to({ sB: 60, eB: 80, head: 0, eye: 1 }, 300);
    void a.say('aaah~', 800); await a.wait(700);
  } },
  { id: 'phone', name: 'Gọi điện', need: 40, run: async (a, b) => {
    await a.walk(spot(a, b));
    const ph = a.prop('<rect class="sm-k" x="-1.5" y="-4" width="3.4" height="7" rx="1"/>');
    a.hold(ph, 'A', 'up');
    await a.to(POSES.ear, 300);
    const lines = ['alo?', 'ừ ừ…', 'số về chưa?', 'ok!'];
    for (const [i, l] of lines.entries()) {
      void a.say(l, 800);
      if (i === 1) await a.walk(Math.max(b.x0, Math.min(b.x1, a.x + R(-30, 30))), 'walk', 30);
      else await a.wait(800);
      await a.to(POSES.ear, 150);
    }
  } },
  { id: 'read', name: 'Đọc sách', run: async (a, b) => {
    await a.walk(spot(a, b));
    await a.to(POSES.sit, 400);
    const bk = a.prop('<path class="sm-b" d="M0,-6 L7,-8 L7,2 L0,4Z"/><path class="sm-paper" d="M0,-6 L-7,-8 L-7,2 L0,4Z"/>');
    a.hold(bk, 'A', 'up');
    await a.to({ sA: 70, eA: 60, sB: 60, eB: 70, head: 18 }, 350);
    for (let i = 0; i < 3; i++) { await a.loop2(800, (t) => ({ head: 18 + 3 * Math.sin(t * 4) })); await a.to({ eB: 110 }, 150); await a.to({ eB: 70 }, 150); }
    void a.say(pick(['hay ghê', 'à ra thế', 'chương 3…']), 800); await a.wait(600);
  } },
  { id: 'meditate', name: 'Thiền', run: async (a, b) => {
    await a.walk(spot(a, b));
    await a.to(POSES.lotus, 500);
    void a.say('ommm…', 1800);
    const sp = every(0.5);
    await a.loop2(2400, (t) => { if (sp(t)) a.stars(a.x, a.gy - 20, 1, 22); return { air: 6 + 3 * Math.sin(t * 2.5), sA: 35 + 4 * Math.sin(t * 2.5) }; }, 600);
    await a.to({ air: 0 }, 400);
  } },
  { id: 'weights', name: 'Nâng tạ', run: async (a, b) => {
    await a.walk(spot(a, b, 0.25, 0.75));
    const bar = a.prop('<path class="sm-k" d="M-14,-1 H14 V1 H-14Z"/><rect class="sm-k" x="-15" y="-5" width="3" height="10" rx="1"/><rect class="sm-k" x="12" y="-5" width="3" height="10" rx="1"/>');
    a.place(bar, a.x, a.gy - 5);
    await a.to({ lean: 40, hA: 70, kA: 100, hB: 66, kB: 96, sA: 40, eA: 0, sB: 40, eB: 0, head: -10 }, 400);
    a.hold(bar, 'A', 'up');
    void a.say('hự!', 600);
    await a.to({ ...STAND, sA: 60, eA: 120, sB: 58, eB: 122 }, 500);
    await a.to({ sA: 170, eA: 0, sB: 168, eB: 0 }, 400, ease.back);
    await a.loop2(900, (t) => ({ lean: 5 * Math.sin(t * 14), hA: 6 + 4 * Math.sin(t * 9), hB: -6 + 4 * Math.sin(t * 9) }));
    await a.to({ sA: 40, eA: 0, sB: 40, eB: 0, lean: 30, hA: 50, kA: 70, hB: 46, kB: 66 }, 350, ease.in);
    a.dust(a.x, a.gy, 5); a.fx('rầm', a.x, a.gy - 10, { dy: -10, ms: 500 });
    await a.to({ ...STAND, sA: 30, eA: 90, sB: 30, eB: 90 }, 300);
    void a.say('khoẻ!', 700); await a.wait(500);
  } },
  { id: 'guitar', name: 'Đàn guitar', run: async (a, b) => {
    await a.walk(spot(a, b));
    const gt = a.prop('<path class="sm-w" d="M-6,2 q-4,-6 2,-8 q4,-1 6,3 q5,-1 5,4 q-1,6 -7,4 q-6,2 -6,-3z"/><path class="sm-ws" stroke-width="1.6" d="M5,-3 L22,-14"/><circle class="sm-dark" cx="1" cy="-1" r="1.8"/>');
    a.follow(() => { a.place(gt, a.j.H.x + 4 * a.dir, a.j.H.y - 6, -6 * a.dir, a.dir, 1); });
    await a.to({ sA: 20, eA: 80, sB: 70, eB: 50, head: 12 }, 300);
    const n = every(0.3);
    await a.loop2(R(2000, 2800), (t) => {
      if (n(t)) a.fx(pick(['♪', '♫']), a.x + R(-6, 16) * a.dir, a.gy - 34, { dy: -18, dx: R(-6, 6), cls: 'sm-note', ms: 900 });
      return { eA: 80 + 18 * Math.sin(t * 18), head: 12 + 8 * Math.sin(t * 6), hA: 4 + 4 * Math.max(0, Math.sin(t * 6)), kA: 10 * Math.max(0, Math.sin(t * 6)) };
    });
  } },
  { id: 'trumpet', name: 'Thổi kèn', run: async (a, b) => {
    await a.walk(spot(a, b));
    const tr = a.prop('<path class="sm-a" d="M0,0 L12,-2 L16,-6 L16,4 L12,1 L0,1Z"/>');
    a.follow(() => { a.place(tr, a.j.C.x + 3 * a.dir, a.j.C.y + 2, -10 * a.dir, a.dir, 1); });
    await a.to({ sA: 80, eA: 70, sB: 70, eB: 80, head: -10, lean: -6 }, 300);
    void a.say('tò te!', 800);
    const n = every(0.25);
    await a.loop2(2000, (t) => { if (n(t)) a.fx(pick(['♪', '♫']), a.j.C.x + 20 * a.dir, a.j.C.y - 6, { dx: 14 * a.dir, dy: -14, cls: 'sm-note', ms: 800 }); return { lean: -6 - 6 * Math.sin(t * 5), head: -10 - 5 * Math.sin(t * 5) }; });
  } },
  { id: 'yoyo', name: 'Chơi yo-yo', run: async (a, b) => {
    await a.walk(spot(a, b));
    const str = a.line('sm-thin'), yo = a.prop('<circle class="sm-r" r="3"/>');
    let drop = 0;
    a.follow(() => { const h = a.hand('A'), y = h.y + 2 + drop * (a.gy - 6 - h.y); a.place(yo, h.x, y); str.setAttribute('d', `M${h.x.toFixed(1)},${h.y.toFixed(1)} V${y.toFixed(1)}`); });
    await a.to({ sA: 70, eA: 40 }, 250);
    for (let i = 0; i < 4; i++) {
      await a.tw(380, (_, e) => { drop = e; a.p.eA = 40 - 30 * e; }, ease.in);
      await a.tw(380, (_, e) => { drop = 1 - e; a.p.eA = 10 + 30 * e; }, ease.out);
    }
    void a.say('xoẹt!', 600); await a.wait(400);
  } },
  { id: 'pogo', name: 'Nhảy pogo', need: 60, run: async (a, b) => {
    const d = await roomy(a, b, 60), pg = a.prop('<path class="sm-k" d="M0,0 V-24"/><path class="sm-l" stroke-width="1.8" d="M-4,-24 H4 M-4,-10 H4"/><path class="sm-thin" d="M-2,-6 l4,-1 l-4,-1 l4,-1"/>');
    pg.firstElementChild!.setAttribute('class', 'sm-l');
    let comp = 0;
    a.follow(() => a.place(pg, a.x, a.gy - a.p.air + 10, 0, 1, 1 - comp * 0.25));
    await a.to({ sA: 60, eA: 50, sB: 60, eB: 50, hA: 10, kA: 10, hB: 0, kB: 10 }, 250);
    a.p.air = 0;
    const steps = Math.round(R(4, 6)), step = Math.min(12, (d > 0 ? b.x1 - a.x : a.x - b.x0) / steps);
    for (let i = 0; i < steps; i++) {
      const x0 = a.x;
      await a.tw(110, (_, e) => { comp = e; a.p.kA = 10 + 20 * e; a.p.kB = 10 + 20 * e; }, ease.out);
      await a.tw(420, (k) => { comp = Math.max(0, 1 - k * 5); a.x = x0 + step * d * k; a.p.air = 22 * 4 * k * (1 - k); a.p.kA = 10; a.p.kB = 10; }, ease.linear);
    }
    void a.say('boing!', 600);
  } },
  { id: 'skate', name: 'Trượt ván', need: 70, run: async (a, b) => {
    const d = await roomy(a, b, 70), sk = a.prop('<path class="sm-k" d="M-11,-3 H11 q2,0 3,-2 M-11,-3 q-2,0 -3,-2"/><circle class="sm-dark" cx="-7" cy="-1" r="1.6"/><circle class="sm-dark" cx="7" cy="-1" r="1.6"/>');
    sk.firstElementChild!.setAttribute('class', 'sm-l');
    a.follow(() => a.place(sk, a.x + 2 * a.dir, a.gy - a.p.air, 0, a.dir, 1));
    await a.to({ hA: 20, kA: 30, hB: -10, kB: 20, sA: 90, eA: 0, sB: -40, eB: 0, lean: 8 }, 250);
    a.p.air = 3;
    const end = d > 0 ? b.x1 : b.x0, x0 = a.x;
    await a.tw(1300, (k, e) => {
      a.x = x0 + (end - x0) * e;
      const ollie = k > 0.55 && k < 0.8 ? Math.sin((k - 0.55) / 0.25 * Math.PI) : 0;
      a.p.air = 3 + 14 * ollie; a.p.kA = 30 + 40 * ollie; a.p.kB = 20 + 40 * ollie;
    }, ease.out);
    void a.say('yeah!', 700); await a.wait(400);
  } },
  { id: 'paper-plane', name: 'Phi máy bay giấy', need: 60, run: async (a, b) => {
    const d = await roomy(a, b, 60), pl = a.prop('<path class="sm-paper" d="M-6,1 L7,0 L-6,-4 L-3,0Z"/>');
    a.hold(pl, 'A', 'up');
    await a.to({ sA: 150, eA: 70, lean: -10 }, 400);
    await a.to({ sA: 80, eA: 0, lean: 10 }, 140, ease.in);
    const p0 = a.hand('A'), end = d > 0 ? b.r - 6 : b.l + 6, t0 = now();
    pl.remove();
    const fly = a.prop('<path class="sm-paper" d="M-6,1 L7,0 L-6,-4 L-3,0Z"/>');
    void a.tw(1600, (k) => a.place(fly, lerp(p0.x, end, k), p0.y - 20 * Math.sin(k * Math.PI) + 10 * k * k + 3 * Math.sin((now() - t0) / 120), 8 * Math.sin(k * 8) + 20 * k, d, 1), ease.linear);
    await a.to({ ...POSES.look, head: -10 }, 300);
    await a.wait(1300);
    void a.say(pick(['xa ghê!', 'bay đẹp!']), 800); await a.to(POSES.cheer, 300, ease.back); await a.wait(400);
  } },
  { id: 'bubbles', name: 'Thổi bong bóng', run: async (a, b) => {
    await a.walk(spot(a, b));
    const wand = a.prop('<path class="sm-l" d="M0,0 L-4,-6"/><circle class="sm-l" cx="-5" cy="-8" r="2.4"/>');
    a.hold(wand, 'A', 'up');
    await a.to({ sA: 70, eA: 110, head: 0 }, 300);
    const bb = every(0.22);
    await a.loop2(2200, (t) => {
      if (bb(t)) {
        const c = a.j.C, x = c.x + 10 * a.dir, y = c.y;
        a.fx('', x, y, { cls: 'sm-bubble', dx: R(14, 40) * a.dir, dy: R(-30, -6), ms: R(1000, 1500), s0: 0.4, s1: R(1, 1.8) });
      }
      return { lean: -4 + 3 * Math.sin(t * 6) };
    });
  } },
  { id: 'butterfly', name: 'Bắt bướm', need: 60, run: async (a, b) => {
    await a.walk(spot(a, b, 0.2, 0.5));
    const bf = a.prop('<g class="wl"><path class="sm-pk" d="M0,0 Q-6,-7 -7,-1 Q-5,3 0,0Z"/></g><g class="wr"><path class="sm-pk" d="M0,0 Q6,-7 7,-1 Q5,3 0,0Z"/></g>');
    const [wl, wr] = [bf.querySelector('.wl')!, bf.querySelector('.wr')!], t0 = now();
    let bx = a.x + 30 * a.dir, by = a.gy - 40, landed = false;
    a.follow(() => {
      const t = (now() - t0) / 1000, f = landed ? 0.5 + 0.5 * Math.sin(t * 4) : Math.abs(Math.sin(t * 22));
      wl.setAttribute('transform', `scale(${(0.25 + 0.75 * f).toFixed(2)},1)`); wr.setAttribute('transform', `scale(${(0.25 + 0.75 * f).toFixed(2)},1)`);
      if (landed) { bx = a.j.C.x; by = a.j.C.y - 7; } else { bx = Math.max(b.x0 - 8, Math.min(b.x1 + 8, bx + Math.sin(t * 1.7) * 0.9)); by = a.gy - 38 + 10 * Math.sin(t * 2.3); }
      a.place(bf, bx, by);
    });
    for (let i = 0; i < 2; i++) {
      await a.walk(Math.max(b.x0, Math.min(b.x1, bx - 12 * a.dir)), 'sneak');
      a.face(bx > a.x ? 1 : -1);
      await a.jump(a.x + 6 * a.dir, a.gy, 16, 380);
      void a.say(pick(['hụt!', 'trượt rồi']), 600);
    }
    landed = true;
    await a.to({ ...STAND, head: -14, eye: 2 }, 300);
    a.fx('♥', a.j.C.x, a.j.C.y - 14, { cls: 'sm-heart', dy: -14, ms: 900 });
    await a.wait(1200);
  } },
  { id: 'bush', name: 'Nấp bụi cây', need: 40, run: async (a, b) => {
    const x = spot(a, b), bush = a.prop('<circle class="sm-g" cx="-8" cy="-7" r="7"/><circle class="sm-g" cx="0" cy="-11" r="9"/><circle class="sm-g" cx="8" cy="-7" r="7"/>');
    a.place(bush, x, a.gy, 0, 0.01);
    await a.tw(300, (_, e) => a.place(bush, x, a.gy, 0, Math.max(0.01, e)), ease.back);
    await a.walk(x, 'sneak');
    await a.to({ ...POSES.crouch, lean: 40, head: 10 }, 300);
    for (let i = 0; i < 3; i++) {
      await a.wait(R(400, 700));
      await a.to({ lean: 0, hA: 20, kA: 30, hB: 15, kB: 25, head: -6 }, 200, ease.out);
      a.turn(); await a.wait(300); a.turn();
      await a.to({ ...POSES.crouch, lean: 40, head: 10 }, 200);
    }
    void a.say('suỵt…', 800); await a.wait(700);
    await a.to(STAND, 250);
    await a.tw(250, (_, e) => a.place(bush, x, a.gy, 0, Math.max(0.01, 1 - e)), ease.in);
  } },
  { id: 'sneeze', name: 'Hắt xì', run: async (a, b) => {
    await a.walk(spot(a, b));
    void a.say('a…', 600); await a.to({ lean: -10, head: -14, eye: 1, sA: 30, sB: 20 }, 600);
    void a.say('a… a…', 700); await a.to({ lean: -18, head: -22 }, 700);
    void a.say('HẮT XÌ!', 900);
    await a.to({ lean: 30, head: 20, eye: 1, sA: -20, sB: -30 }, 90, ease.out);
    const h = a.headPt();
    for (let i = 0; i < 5; i++) a.fx('', h.x + 6 * a.dir, h.y + 2, { cls: 'sm-dropl', dx: R(10, 22) * a.dir, dy: R(-6, 8), ms: 450 });
    const x0 = a.x;
    await a.tw(250, (_, e) => { a.x = x0 - 6 * a.dir * e; }, ease.out);
    await a.to({ ...STAND, eye: 0 }, 300); void a.say('xin lỗi…', 700); await a.wait(500);
  } },
  { id: 'shiver', name: 'Run cầm cập', run: async (a, b) => {
    await a.walk(spot(a, b));
    const sn = every(0.12);
    void a.say('brrr…', 1300);
    await a.loop2(2200, (t) => {
      if (sn(t)) a.fx('✻', a.x + R(-34, 34), b.top + 6, { cls: 'sm-snow', dy: a.gy - b.top - 10, dx: R(-6, 6), rot: 180, ms: 1100, s0: 1, s1: 1 });
      return { ...POSES.armsCross, sA: 60, eA: 140, sB: 55, eB: 145, lean: 8, head: 10, hA: 8, kA: 12, hB: -4, kB: 12, air: 0.6 * Math.sin(t * 60) };
    });
  } },
  { id: 'hot', name: 'Nắng nóng', run: async (a, b) => {
    await a.walk(spot(a, b));
    const sun = a.prop(`<circle class="sm-a" r="6"/>${Array.from({ length: 8 }, (_, i) => `<path class="sm-l" stroke="var(--sm-amber)" d="M${(Math.cos(i * Math.PI / 4) * 9).toFixed(1)},${(Math.sin(i * Math.PI / 4) * 9).toFixed(1)} L${(Math.cos(i * Math.PI / 4) * 12).toFixed(1)},${(Math.sin(i * Math.PI / 4) * 12).toFixed(1)}"/>`).join('')}`, 'back');
    const sx = a.x < mid(b) ? b.r - 16 : b.l + 16;
    a.place(sun, sx, b.top + 18, 0, 0.01);
    await a.tw(400, (_, e) => a.place(sun, sx, b.top + 18, 0, Math.max(0.01, e)), ease.back);
    a.follow(() => sun.setAttribute('transform', `translate(${sx},${b.top + 18}) rotate(${(now() / 30) % 360})`));
    void a.say('nóng quá!', 900);
    const dr = every(0.35);
    await a.loop2(1400, (t) => { if (dr(t)) { const h = a.headPt(); a.fx('', h.x - 4 * a.dir, h.y, { cls: 'sm-dropl', dy: 12, dx: R(-4, 4) }); } return { sA: 160, eA: 120 + 20 * Math.sin(t * 12), head: 10, lean: 4 }; });
    await a.loop2(1000, (t) => ({ sA: 70, eA: 110 + 30 * Math.sin(t * 22), sB: 10, eB: 10, head: -8 }));
  } },
  { id: 'impatient', name: 'Sốt ruột', run: async (a, b) => {
    await a.walk(spot(a, b));
    void a.say(pick(['…', 'nhanh lên nào', 'tải đi mà']), 1500);
    await a.loop2(R(1600, 2200), (t) => ({ ...POSES.armsCross, hA: 14 * Math.max(0, Math.sin(t * 12)), kA: 10 * Math.max(0, Math.sin(t * 12)), head: 6 }));
    await a.to({ head: -14, lean: -6 }, 300); void a.say('haizz', 700); await a.wait(500);
  } },
  { id: 'watch', name: 'Xem đồng hồ', run: async (a, b) => {
    await a.walk(spot(a, b));
    const w = a.prop('<circle class="sm-paper" r="2.4"/>');
    a.follow(() => { const p = a.j.eA, q = a.j.wA; a.place(w, lerp(p.x, q.x, 0.8), lerp(p.y, q.y, 0.8)); });
    await a.to({ sA: 70, eA: 80, head: 22, lean: 4 }, 300); await a.wait(600);
    await a.to({ sB: 60, eB: 90 }, 200);
    for (let i = 0; i < 2; i++) { await a.to({ eB: 100 }, 100); await a.to({ eB: 80 }, 100); }
    await a.loop2(500, (t) => ({ sA: 70 + 10 * Math.sin(t * 30) }));
    void a.say(pick(['mấy giờ rồi?', 'hừm…', 'trễ rồi!']), 800); await a.wait(600);
  } },
  { id: 'count', name: 'Đếm ngón tay', run: async (a, b) => {
    await a.walk(spot(a, b));
    await a.to({ sA: 110, eA: 40, head: -6 }, 300);
    for (const n of ['1', '2', '3', '…']) { void a.say(n, 500); await a.to({ eA: 60 }, 150); await a.to({ eA: 40 }, 150); await a.wait(250); }
  } },
  { id: 'celebrate', name: 'Ăn mừng', run: async (a, b) => {
    await a.walk(spot(a, b));
    await a.to({ ...POSES.crouch, sA: 40, sB: 40 }, 200);
    a.confetti(a.x, a.gy - 50, 14);
    void a.say(pick(['yeah!', 'tuyệt!', 'số đẹp!']), 900);
    await a.jump(a.x, a.gy, 22, 520);
    await a.to(POSES.cheer, 200);
    await a.jump(a.x, a.gy, 14, 400);
  } },
  { id: 'hips', name: 'Chống nạnh', run: async (a, b) => {
    await a.walk(spot(a, b));
    await a.to({ ...POSES.handsHips, lean: -6, head: -10 }, 350);
    void a.say(pick(['hừm!', 'ok đấy', 'tốt!']), 800);
    await a.loop2(1200, (t) => ({ head: -10 + 12 * Math.max(0, Math.sin(t * 8)) }));
  } },
  { id: 'headphones', name: 'Nghe nhạc', run: async (a, b) => {
    await a.walk(spot(a, b));
    const hp = a.prop('<path class="sm-l" stroke-width="1.6" d="M-6,0 A6,6 0 0 1 6,0"/><rect class="sm-k" x="-7.5" y="-1" width="3" height="4" rx="1"/><rect class="sm-k" x="4.5" y="-1" width="3" height="4" rx="1"/>');
    a.follow(() => a.place(hp, a.j.C.x, a.j.C.y, 0, 1, 1));
    const n = every(0.4);
    await a.loop2(R(2000, 2600), (t) => {
      if (n(t)) a.fx(pick(['♪', '♫']), a.j.C.x + 8, a.j.C.y - 8, { dy: -16, dx: 6, cls: 'sm-note', ms: 800 });
      const s = Math.sin(t * 10);
      return { head: 10 * s, lean: 3 * s, hA: 6 * Math.max(0, s), kA: 12 * Math.max(0, s), sA: 20, eA: 40 + 10 * s, sB: -10, eB: 20 };
    });
  } },
  { id: 'bow', name: 'Cúi chào', run: async (a, b) => {
    await a.walk(spot(a, b));
    void a.say(pick(['xin chào!', 'kính chào sếp', 'mời sếp xem số']), 1100);
    await a.to(POSES.bow, 450); await a.wait(400); await a.to(STAND, 400);
  } },
  { id: 'kungfu', name: 'Kungfu', run: async (a, b) => {
    await a.walk(spot(a, b, 0.25, 0.75));
    await a.to({ lean: 6, hA: 40, kA: 50, hB: -30, kB: 30, sA: 90, eA: 90, sB: 60, eB: 110 }, 300);
    void a.say('hiya!', 700);
    for (let i = 0; i < 2; i++) {
      await a.to({ sA: 90, eA: 0, sB: 40, eB: 130 }, 100, ease.out); a.stars(a.hand('A').x, a.hand('A').y, 3, 8);
      await a.to({ sA: 50, eA: 120, sB: 90, eB: 0 }, 100, ease.out); a.stars(a.hand('B').x, a.hand('B').y, 3, 8);
    }
    await a.to(POSES.kick, 160, ease.out); a.stars(a.foot('A').x, a.foot('A').y, 4, 10);
    await a.wait(200);
    await a.to({ ...POSES.handsHips, head: -6 }, 300); await a.to({ ...STAND, sA: 100, eA: 120, sB: 100, eB: 120, lean: 20 }, 300);
  } },
  { id: 'punchbag', name: 'Đấm bao cát', need: 40, run: async (a, b) => {
    const d = await roomy(a, b, 40), bx = a.x + 18 * d, top = b.top + 6, len = Math.max(20, a.gy - 22 - top);
    const bag = a.prop(`<path class="sm-l" d="M0,0 V${len}"/><rect class="sm-r" x="-5" y="${len}" width="10" height="18" rx="4"/>`);
    let sw = 0, vel = 0;
    a.follow(() => { vel += -sw * 0.04; vel *= 0.97; sw += vel; a.place(bag, bx, top, sw); });
    await a.to({ lean: 10, hA: 30, kA: 30, hB: -20, kB: 20, sA: 70, eA: 110, sB: 50, eB: 120 }, 300);
    for (let i = 0; i < 4; i++) {
      const s = i % 2 === 0 ? 'A' : 'B';
      await a.to(s === 'A' ? { sA: 90, eA: 0 } : { sB: 90, eB: 0 }, 110, ease.out);
      vel -= 1.6 * d; a.fx('bụp', bx, a.gy - 30, { dy: -8, ms: 400 });
      await a.to(s === 'A' ? { sA: 70, eA: 110 } : { sB: 50, eB: 120 }, 160);
    }
    await a.wait(600);
  } },
  { id: 'swim', name: 'Bơi trên cạn', need: 50, run: async (a, b) => {
    await roomy(a, b, 40);
    await a.to(POSES.crouch, 250); await a.to(POSES.lieFront, 400);
    const dr = every(0.3);
    await a.loop2(2200, (t) => {
      const q = t * 7;
      if (dr(t)) a.fx('', a.x + R(-10, 20) * a.dir, a.gy - 6, { cls: 'sm-dropl', dy: -10, dx: R(-6, 6), ms: 400 });
      return { sA: 180 + 180 * ((q / (Math.PI * 2)) % 1), eA: 10, sB: 180 + 180 * (((q + Math.PI) / (Math.PI * 2)) % 1), eB: 10, hA: -90 + 10 * Math.sin(q * 2), hB: -88 - 10 * Math.sin(q * 2), head: -30 + 10 * Math.sin(q) };
    });
    void a.say('phù!', 600);
    await a.to(POSES.plank, 300); await a.to(POSES.crouch, 300);
  } },
  { id: 'crawl', name: 'Bò', need: 50, run: async (a, b) => {
    const d = await roomy(a, b, 50);
    await a.to(POSES.crouch, 250); await a.to(POSES.crawl, 350);
    const x0 = a.x;
    await a.tw(1800, (k) => {
      const s = Math.sin(k * Math.PI * 6);
      a.x = x0 + 34 * d * k; a.p.sA = 78 + 14 * s; a.p.sB = 80 - 14 * s; a.p.hA = 0 + 14 * s; a.p.hB = 6 - 14 * s; a.p.head = -30 + 4 * s;
    }, ease.linear);
    await a.to(POSES.crouch, 300);
  } },
  { id: 'long-jump', name: 'Nhảy xa', need: 90, run: async (a, b) => {
    const d: 1 | -1 = a.x < mid(b) ? 1 : -1;
    await a.run(d > 0 ? b.x0 : b.x1, 120); a.face(d);
    const start = a.x, land = d > 0 ? b.x1 : b.x0;
    await a.run(start + (land - start) * 0.35, 150);
    await a.jump(land, a.gy, 26, 650);
    a.dust(a.x, a.gy, 6);
    await a.to({ ...POSES.crouch }, 150);
    void a.say(pick(['kỷ lục!', '3 mét!', 'xa chưa!']), 900);
    await a.to(POSES.cheer, 300, ease.back); await a.wait(500);
  } },
  { id: 'flamingo', name: 'Đứng một chân', run: async (a, b) => {
    await a.walk(spot(a, b));
    await a.to(POSES.flamingo, 400);
    await a.loop2(R(1600, 2200), (t) => ({ lean: 8 * Math.sin(t * 5) * Math.sin(t * 1.3), sA: 90 + 25 * Math.sin(t * 6), sB: 95 - 25 * Math.sin(t * 6 + 1), hA: 4 * Math.sin(t * 5) }));
    if (chance(0.5)) { await a.to({ hB: -3, kB: 2 }, 150); void a.say('suýt ngã', 700); await a.wait(500); }
    else { void a.say('vững!', 700); await a.wait(500); }
  } },
  { id: 'spin', name: 'Xoay vòng', run: async (a, b) => {
    await a.walk(spot(a, b));
    await a.to({ sA: 170, eA: -20, sB: 165, eB: -20, hB: 30, kB: 90, air: 2 }, 300);
    for (let i = 0; i < 10; i++) { a.turn(); await a.wait(Math.max(50, 120 - i * 7)); }
    await a.to({ ...STAND, eye: 2 }, 250);
    const c = a.headPt();
    for (let i = 0; i < 3; i++) a.fx('✦', c.x, c.y - 8, { dx: Math.cos(i * 2.1) * 12, dy: Math.sin(i * 2.1) * 4 - 6, cls: 'sm-star', ms: 900, delay: i * 120 });
    void a.say('chóng mặt…', 900);
    await a.loop2(1200, (t) => ({ lean: 12 * Math.sin(t * 5), head: 14 * Math.sin(t * 5 + 1), hA: 10 * Math.sin(t * 5), hB: -10 * Math.sin(t * 5) }));
  } },
  { id: 'seek', name: 'Trốn tìm', need: 40, run: async (a, b) => {
    await a.walk(spot(a, b));
    await a.to({ ...POSES.face, head: 14, lean: 10 }, 300);
    for (const n of ['1…', '2…', '3…']) { void a.say(n, 600); await a.wait(650); }
    await a.to(STAND, 200);
    void a.say('đâu rồi?', 800);
    await a.walk(spot(a, b), 'sneak'); a.turn();
    await a.to({ ...POSES.look, lean: 20 }, 300); await a.wait(500);
  } },
  { id: 'chalk', name: 'Vẽ biểu đồ', need: 60, run: async (a, b) => {
    const d = await roomy(a, b, 60);
    await a.to(POSES.kneel, 350);
    const x0 = a.x + 10 * d, pts = [0, -6, -4, -13, -10, -22].map((y, i) => `${(x0 + i * 8 * d).toFixed(1)},${(a.gy + y - 1).toFixed(1)}`);
    const ch = a.prop(`<polyline class="sm-ps" stroke-width="1.6" fill="none" points="${pts.join(' ')}" pathLength="1" stroke-dasharray="1" stroke-dashoffset="1"/><path class="sm-ps" stroke-width="1.6" d="M${(x0 + 36 * d).toFixed(1)},${(a.gy - 23).toFixed(1)} l${4 * d},0 l0,4" opacity="0"/>`, 'back');
    const [pl, ar] = [ch.firstElementChild as SVGElement, ch.lastElementChild as SVGElement];
    const sx = a.x;
    await a.tw(1600, (k) => { pl.setAttribute('stroke-dashoffset', String(1 - k)); a.x = sx + 30 * d * k; a.p.sA = 60 + 10 * Math.sin(k * 30); a.p.eA = 20; }, ease.linear);
    ar.setAttribute('opacity', '1');
    await a.to(STAND, 300); a.face(-d as 1 | -1);
    void a.say(pick(['tăng trưởng!', 'đi lên nào', 'số đẹp']), 900);
    await a.to({ ...POSES.handsHips }, 300); await a.wait(700);
  } },
  { id: 'plant', name: 'Trồng cây', run: async (a, b) => {
    const d = await roomy(a, b, 30), px = a.x + 14 * d;
    await a.to(POSES.kneel, 350);
    for (let i = 0; i < 3; i++) { await a.to({ sA: 30, eA: 10, lean: 30 }, 160); a.dust(px, a.gy, 2); await a.to({ sA: 60, eA: 40, lean: 10 }, 160); }
    const sp = a.prop('<path class="sm-l" stroke="var(--sm-leaf)" d="M0,0 V-12"/><path class="sm-g" d="M0,-8 q-6,-4 -7,-9 q6,0 7,9Z"/><path class="sm-g" d="M0,-11 q6,-5 8,-10 q-7,0 -8,10Z"/>', 'back');
    await a.to(STAND, 250);
    await a.tw(600, (_, e) => a.place(sp, px, a.gy, 0, Math.max(0.01, e)), ease.back);
    a.fx('♥', px, a.gy - 22, { cls: 'sm-heart', dy: -12, ms: 800 });
    void a.say('lớn nhanh nhé', 900); await a.wait(800);
  } },
  { id: 'water', name: 'Tưới cây', run: async (a, b) => {
    const d = await roomy(a, b, 34), fx0 = a.x + 22 * d;
    const fl = a.prop('<path class="sm-l" stroke="var(--sm-leaf)" d="M0,0 V-12"/><circle class="sm-pk" cx="0" cy="-14" r="3"/><circle class="sm-a" cx="0" cy="-14" r="1.2"/>', 'back');
    a.place(fl, fx0, a.gy, 0, 0.6);
    const can = a.prop('<path class="sm-b" d="M-4,-2 h8 v7 h-8z"/><path class="sm-l" d="M4,0 l6,-4"/><path class="sm-l" d="M-4,0 q-3,-4 1,-6"/>');
    a.hold(can, 'A', 'up');
    await a.to({ sA: 70, eA: 20 }, 300);
    await a.to({ sA: 80, eA: 10, lean: 10 }, 200);
    const dr = every(0.08);
    await a.tw(1500, (k) => {
      if (dr(k * 1.5)) { const h = a.hand('A'); a.fx('', h.x + 10 * a.dir, h.y - 4, { cls: 'sm-dropl', dy: a.gy - h.y - 2, dx: R(0, 6) * a.dir, ms: 380, s0: 1, s1: 1 }); }
      a.place(fl, fx0, a.gy, 0, 0.6 + 0.6 * k);
    }, ease.linear);
    a.fx('✦', fx0, a.gy - 22, { cls: 'sm-star', dy: -10, ms: 700 });
    void a.say('nở rồi!', 800); await a.to(STAND, 300); await a.wait(400);
  } },
  { id: 'flag', name: 'Cắm cờ', run: async (a, b) => {
    await a.walk(spot(a, b, 0.2, 0.6));
    const fx0 = a.x + 12 * a.dir, fg = a.prop('<path class="sm-l" d="M0,0 V-34"/><path class="sm-p fl" d="M0,-34 L14,-30 L0,-25Z"/>', 'back');
    const fl = fg.querySelector('.fl')!;
    a.place(fg, fx0, a.gy - 40, 0, 1);
    await a.to({ sA: 150, eA: 20, sB: 150, eB: 20 }, 300);
    await a.tw(260, (_, e) => a.place(fg, fx0, a.gy - 40 + 40 * e), ease.in);
    a.dust(fx0, a.gy, 3);
    const t0 = now();
    a.follow(() => fl.setAttribute('d', `M0,-34 Q7,${(-34 + 3 * Math.sin((now() - t0) / 120)).toFixed(1)} 14,-30 L0,-25Z`));
    await a.to({ ...STAND, sA: 140, eA: 140, head: -6 }, 300);
    void a.say(pick(['chinh phục!', 'đến đích!']), 900); await a.wait(1100);
  } },
  { id: 'backflip', name: 'Lộn ngược', run: async (a, b) => {
    await a.walk(spot(a, b, 0.3, 0.7));
    await a.to({ ...POSES.crouch, sA: -40, sB: -40 }, 250);
    await a.jump(a.x - 6 * a.dir, a.gy, 30, 650, -1);
    void a.say(pick(['đẹp!', 'hú!']), 600); await a.to(POSES.cheer, 250, ease.back); await a.wait(400);
  } },
  { id: 'pullup', name: 'Đu xà', run: async (a, b) => {
    const x = spot(a, b, 0.3, 0.7), barY = a.gy - 54;
    const bar = a.prop(`<path class="sm-l" stroke-width="1.8" d="M-12,0 V${a.gy - barY} M12,0 V${a.gy - barY} M-14,0 H14"/>`, 'back');
    a.place(bar, x, barY, 0, 1, 0.01);
    await a.walk(x);
    await a.tw(260, (_, e) => a.place(bar, x, barY, 0, 1, Math.max(0.01, e)), ease.back);
    await a.to({ sA: 175, eA: 0, sB: 172, eB: 0 }, 250);
    const hang = () => { const top = Math.min(a.j.wA.y, a.j.wB.y) - (a.gy - a.p.air); return a.gy - barY + top; };
    await a.to({ air: Math.max(0, hang() - 2), hA: 10, kA: 30, hB: 0, kB: 40 }, 300);
    for (let i = 0; i < 3; i++) {
      await a.to({ sA: 150, eA: 120, sB: 148, eB: 122, air: a.p.air + 12 }, 400);
      void a.say(String(i + 1), 400);
      await a.to({ sA: 175, eA: 0, sB: 172, eB: 0, air: a.p.air - 12 }, 350);
    }
    await a.to({ air: 0, hA: 3, kA: 2, hB: -3, kB: 2 }, 260, ease.in);
    await a.to({ ...STAND, sq: 0.88 }, 80); await a.to(STAND, 200);
    await a.tw(240, (_, e) => a.place(bar, x, barY, 0, 1, Math.max(0.01, 1 - e)), ease.in);
  } },
  { id: 'hula', name: 'Lắc vòng', run: async (a, b) => {
    await a.walk(spot(a, b));
    const hp = a.prop('<ellipse class="sm-thin" rx="9" ry="2.6" stroke="var(--sm-red)" stroke-width="1.8"/>');
    const t0 = now();
    a.follow(() => { const t = (now() - t0) / 1000, h = a.j.H, n = a.j.N; a.place(hp, lerp(h.x, n.x, 0.15) + 2 * Math.sin(t * 14), lerp(h.y, n.y, 0.15), 8 * Math.sin(t * 14)); });
    await a.to({ sA: 150, eA: 20, sB: 145, eB: 25 }, 300);
    await a.loop2(R(1800, 2400), (t) => ({ lean: 6 * Math.sin(t * 14), hA: 6 + 6 * Math.sin(t * 14), hB: -6 + 6 * Math.sin(t * 14), head: -4 * Math.sin(t * 14) }));
    void a.say('hehe', 600);
  } },
  { id: 'hoop', name: 'Ném bóng rổ', need: 60, run: async (a, b) => {
    const d: 1 | -1 = a.x < mid(b) ? 1 : -1, hx = d > 0 ? b.r - 6 : b.l + 6, hy = Math.max(b.top + 20, a.gy - 64);
    const hoop = a.prop(`<path class="sm-l" d="M${4 * d},-10 V12"/><path class="sm-r" d="M${-10 * d},0 H${2 * d} V2 H${-10 * d}Z"/><path class="sm-thin" d="M${-10 * d},2 l2,7 h${8 * d - 4 * d} l2,-7"/>`, 'back');
    a.place(hoop, hx, hy);
    await a.run(Math.max(b.x0, Math.min(b.x1, hx - 50 * d)), 120); a.face(d);
    const ball = a.prop('<circle class="sm-a" r="3.6"/><path class="sm-thin" d="M-3.6,0 H3.6"/>');
    for (let i = 0; i < 3; i++) await a.tw(320, (k) => { a.p.sA = 50 + 20 * Math.sin(k * Math.PI); a.p.eA = 30; const h = a.hand('A'); a.place(ball, h.x + 3 * a.dir, lerp(h.y + 2, a.gy - 4, Math.sin(k * Math.PI))); }, ease.linear);
    await a.to({ ...POSES.crouch, sA: 120, eA: 90, sB: 110, eB: 100 }, 250);
    const h0 = a.hand('A'), tx = hx - 4 * d, ty = hy - 2;
    void a.to({ ...STAND, sA: 160, eA: 0, sB: 155, eB: 0, air: 6 }, 200, ease.out);
    await a.tw(700, (k) => a.place(ball, lerp(h0.x, tx, k), lerp(h0.y, ty, k) - 40 * 4 * k * (1 - k), 400 * k), ease.linear);
    await a.tw(300, (k) => a.place(ball, tx, ty + 6 + (a.gy - ty - 10) * k * k), ease.in);
    void a.to({ air: 0 }, 150);
    a.stars(tx, ty, 5); void a.say('vào!', 700);
    await a.to(POSES.cheer, 250, ease.back); await a.wait(500);
  } },
  { id: 'camera', name: 'Chụp ảnh', run: async (a, b) => {
    await a.walk(spot(a, b));
    const cam = a.prop('<rect class="sm-k" x="-3" y="-4" width="9" height="6" rx="1.4"/><circle class="sm-paper" cx="2" cy="-1" r="1.6"/>');
    a.hold(cam, 'A', 'up');
    await a.to({ ...POSES.face, head: 0 }, 300);
    await a.wait(500);
    const c = a.hand('A');
    a.fx('', c.x + 6 * a.dir, c.y, { cls: 'sm-flash', s0: 0.4, s1: 3, ms: 350 });
    void a.say('tách!', 600); await a.wait(400);
    await a.to({ sA: 60, eA: 70, head: 20 }, 300); await a.wait(400);
    void a.say(pick(['đẹp!', 'lên hình!']), 700); await a.to(POSES.cheer, 250, ease.back); await a.wait(400);
  } },
  { id: 'laptop', name: 'Gõ máy tính', run: async (a, b) => {
    await a.walk(spot(a, b));
    await a.to(POSES.sit, 400);
    const lp = a.prop('<path class="sm-k" d="M-6,0 H6 L7,1.6 H-7Z"/><path class="sm-k" d="M-6,0 L-4,-9 H6 L6,0Z"/><path class="sm-ps" stroke-width="1" d="M-3,-3 l2,-2 l2,1 l3,-3"/>');
    a.follow(() => a.place(lp, a.j.kA.x + 1 * a.dir, a.j.kA.y - 2, 0, a.dir, 1));
    await a.to({ sA: 70, eA: 40, sB: 66, eB: 44, head: 16, hA: 120, kA: 120, hB: 115, kB: 118 }, 300);
    await a.loop2(R(1800, 2400), (t) => ({ eA: 40 + 10 * Math.sin(t * 30), eB: 44 + 10 * Math.sin(t * 30 + 2), head: 16 + 2 * Math.sin(t * 4) }));
    void a.say(pick(['xong báo cáo!', 'đang tính số…', 'gửi sếp!']), 900); await a.wait(700);
  } },
  { id: 'bread', name: 'Ăn bánh mì', run: async (a, b) => {
    await a.walk(spot(a, b));
    const br = a.prop('<path class="sm-w" d="M-2,-4 L8,-6 Q10,-3 8,0 L-2,2 Q-4,-1 -2,-4Z"/>');
    a.hold(br, 'A', 'up');
    for (let i = 0; i < 3; i++) {
      await a.to({ sA: 80, eA: 120, head: -4 }, 260);
      const c = a.j.C;
      a.fx('', c.x + 6 * a.dir, c.y + 3, { cls: 'sm-dust', dy: 10, dx: 3 * a.dir, ms: 500 });
      await a.loop2(500, (t) => ({ head: -4 + 4 * Math.sin(t * 30) }));
      await a.to({ sA: 50, eA: 70, head: 0 }, 200);
    }
    void a.say('ngon!', 700); await a.wait(500);
  } },
];
