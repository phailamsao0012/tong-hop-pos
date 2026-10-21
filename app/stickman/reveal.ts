// Kho trò đưa số (anh Vũ 21/10/2026: "tương tác với số liệu, kéo số này, mở cửa số nó chui ra"). Số thật của ô (.kpi .val) được
// giấu ngay khi về; người que chạy tới làm một trò rồi số về đúng chỗ. Chỉ đổi transform/opacity/clip-path của phần tử số, xong thì trả nguyên.
import { POSES, STAND, ease, lerp } from './engine';
import { R, pick, type Actor, type Box } from './runtime';
import { door } from './idle';

export type Num = {
  /** Tâm và khung chữ số lúc ở đúng chỗ (theo gốc toạ độ của người que). */ home: { x: number; y: number; w: number; h: number; cx: number; cy: number };
  /** Đặt tâm số tại (x, y), co giãn, xoay, độ mờ. */ at(x: number, y: number, sc?: number, rot?: number, op?: number): void;
  /** Hiện từ trái sang phải (0..1). */ clip(f: number): void;
  /** Về đúng chỗ, bỏ mọi kiểu đã đặt. */ done(): void;
};
export type RevealAct = { id: string; name: string; run: (a: Actor, b: Box, n: Num) => Promise<void> };

const BACK = (k: number) => 1 + 2.2 * (k - 1) ** 3 + 1.2 * (k - 1) ** 2;
/** Số bay về chỗ từ (x, y, sc, rot), nảy nhẹ khi tới. */
function home(a: Actor, n: Num, x: number, y: number, sc = 0.3, rot = 0, ms = 460) {
  const h = n.home;
  return a.tw(ms, (k) => { const e = BACK(k); n.at(lerp(x, h.cx, e), lerp(y, h.cy, e), lerp(sc, 1, e), rot * (1 - k), 1); }, ease.linear).then(() => { a.stars(h.cx, h.cy, 5, 20); n.at(h.cx, h.cy); });
}
/** Bay theo đường cong lên chỗ. */
function arc(a: Actor, n: Num, x: number, y: number, sc: number, ms = 600, lift = 40, spin = 0) {
  const h = n.home;
  return a.tw(ms, (k) => { n.at(lerp(x, h.cx, k), lerp(y, h.cy, k) - lift * 4 * k * (1 - k), lerp(sc, 1, ease.out(k)), spin * (1 - k), 1); }, ease.inOut).then(() => { a.stars(h.cx, h.cy, 5, 20); n.at(h.cx, h.cy); });
}
const under = (b: Box, n: Num, off = 0) => Math.max(b.x0, Math.min(b.x1, n.home.cx + off));

export const REVEAL: RevealAct[] = [
  { id: 'door', name: 'Mở cửa số chui ra', run: async (a, b, n) => {
    const dx = Math.max(b.x0 + 20, Math.min(b.x1 - 18, n.home.cx - 9)), dr = door(a, dx, b.gy);
    n.at(dx + 9, b.gy - 15, 0.2, 0, 0);
    void dr.grow();
    await a.run(dx - 14, 150); a.face(1);
    await a.to({ sB: 90, eB: 20 }, 150);
    await dr.open(0.85, 260);
    await home(a, n, dx + 9, b.gy - 15, 0.2);
    void a.say(pick(['mời số!', 'ra rồi!']), 600);
    await a.to(POSES.cheer, 200, ease.back);
    await dr.sink();
  } },
  { id: 'pull', name: 'Kéo dây lôi số vào', run: async (a, b, n) => {
    const h = n.home, off = Math.max(70, b.r + 40 - h.x);
    n.at(h.cx + off, h.cy, 0.8, 10, 1);
    const sx = Math.min(b.x1, h.x + h.w + 10);
    await a.run(sx, 150); a.face(1);
    const rope = a.line('sm-ws');
    let e2 = 0;
    a.follow(() => { const p = a.hand('A'), x = h.x + off * (1 - e2) + 2; rope.setAttribute('d', `M${p.x.toFixed(1)},${p.y.toFixed(1)} Q${((p.x + x) / 2).toFixed(1)},${(Math.max(p.y, h.cy) + 10).toFixed(1)} ${x.toFixed(1)},${h.cy.toFixed(1)}`); });
    await a.to({ lean: -26, sA: 70, eA: 10, sB: 75, eB: 10, hA: 30, kA: 30, hB: -15, kB: 20 }, 200);
    void a.say('hự!', 600);
    const x0 = a.x;
    await a.tw(750, (k, e) => { e2 = e; a.x = x0 - 22 * e; a.p.lean = -26 - 6 * Math.sin(k * 16); n.at(h.cx + off * (1 - e), h.cy, 0.8 + 0.2 * e, 10 * (1 - e), 1); }, ease.inOut);
    a.stars(h.cx, h.cy, 5, 20); n.at(h.cx, h.cy);
  } },
  { id: 'box', name: 'Ném đá vỡ hộp', run: async (a, b, n) => {
    const h = n.home, bx = a.prop(`<rect class="sm-w" x="${h.x - 4}" y="${h.y - 3}" width="${h.w + 8}" height="${h.h + 6}" rx="3"/><path class="sm-ws" d="M${h.x - 4},${h.cy} H${h.x + h.w + 4} M${h.cx},${h.y - 3} V${h.y + h.h + 3}"/>`);
    n.at(h.cx, h.cy, 1, 0, 1);
    await a.run(Math.max(b.x0, Math.min(b.x1, h.x - 20)), 150); a.face(1);
    const st = a.prop('<circle r="2.6" class="sm-s"/>');
    a.hold(st, 'A', 'up');
    await a.to({ sA: 160, eA: 40, lean: -6 }, 200);
    await a.to({ sA: 80, eA: 0, lean: 10 }, 110, ease.in);
    const p0 = a.hand('A');
    st.remove();
    const fly = a.prop('<circle r="2.6" class="sm-s"/>');
    await a.tw(300, (k) => a.place(fly, lerp(p0.x, h.cx, k), lerp(p0.y, h.cy, k) - 24 * 4 * k * (1 - k)), ease.linear);
    fly.remove(); bx.remove();
    for (let i = 0; i < 8; i++) { const t = -Math.PI * (i + 0.5) / 8; a.fx('', h.cx + R(-h.w / 3, h.w / 3), h.cy, { cls: 'sm-chip', dx: Math.cos(t) * 40, dy: Math.sin(t) * 26 + 46, rot: R(-200, 200), ms: 700 }); }
    a.stars(h.cx, h.cy, 6, 22); void a.say('BỐP!', 600);
    await a.tw(320, (k) => n.at(h.cx, h.cy, 1 + 0.22 * Math.sin(k * Math.PI)), ease.out);
    await a.to(POSES.cheer, 200, ease.back);
  } },
  { id: 'fish', name: 'Câu số lên', run: async (a, b, n) => {
    const h = n.home, px = under(b, n);
    n.at(px, b.gy + 6, 0.35, 0, 0);
    const pond = a.prop('<ellipse class="sm-sky" rx="14" ry="3" opacity=".75"/>', 'back');
    a.place(pond, px, b.gy - 1);
    await a.run(Math.max(b.x0, px - 34), 150); a.face(1);
    const rod = a.prop('<path class="sm-ws" stroke-width="1.6" d="M0,0 L22,-22"/>'), line = a.line('sm-thin');
    a.hold(rod, 'A', 'up');
    let ny = b.gy;
    a.follow(() => { const p = a.hand('A'), tx = p.x + 22 * a.dir, ty = p.y - 22; line.setAttribute('d', `M${tx.toFixed(1)},${ty.toFixed(1)} L${px.toFixed(1)},${ny.toFixed(1)}`); });
    await a.to({ sA: 70, eA: 30 }, 200); await a.wait(250);
    void a.say('dính!', 600);
    await a.to({ sA: 130, eA: 50, lean: -14 }, 200, ease.out);
    await a.tw(520, (k) => { const e = ease.out(k); ny = lerp(b.gy, h.cy, e) - 30 * Math.sin(k * Math.PI); n.at(px + (h.cx - px) * e, ny, lerp(0.35, 1, e), 0, 1); }, ease.linear);
    line.remove(); a.stars(h.cx, h.cy, 5, 20); n.at(h.cx, h.cy);
  } },
  { id: 'kick', name: 'Sút số vào chỗ', run: async (a, b, n) => {
    const h = n.home, kx = Math.max(b.x0, Math.min(b.x1, h.cx - 30));
    await a.run(kx, 150); a.face(1);
    const sx = b.r + 20;
    await a.tw(520, (k) => n.at(lerp(sx, kx + 12, k), b.gy - 6, 0.3, -540 * k, 1), ease.out);
    await a.to({ hA: -40, kA: 50, lean: 4 }, 120);
    await a.to({ hA: 80, kA: 0, lean: -14 }, 100, ease.out);
    void a.to(STAND, 250);
    await arc(a, n, kx + 12, b.gy - 6, 0.3, 480, 40, -360);
    void a.say('vào!', 600);
  } },
  { id: 'push', name: 'Chui lên đẩy số', run: async (a, b, n) => {
    const h = n.home, x = under(b, n);
    await a.run(x, 150);
    n.at(x, a.gy - 50, 0.5, 0, 0);
    await a.to({ ...POSES.crouch, sA: 170, eA: 0, sB: 165, eB: 0 }, 200);
    n.at(x, a.gy - 34, 0.5, 0, 1);
    void a.jump(x, a.gy, 18, 420);
    await a.tw(460, (_, e) => n.at(lerp(x, h.cx, e), lerp(a.gy - 34, h.cy, e), lerp(0.5, 1, e)), ease.out);
    a.stars(h.cx, h.cy, 5, 20); n.at(h.cx, h.cy);
  } },
  { id: 'balloon', name: 'Bóng bay chở số xuống', run: async (a, b, n) => {
    const h = n.home, x = under(b, n);
    const bal = a.prop('<ellipse class="sm-r" cx="0" cy="-20" rx="6" ry="7.5"/><path class="sm-thin" d="M0,-12 V0"/>');
    let by = h.cy - 70;
    a.follow(() => { a.place(bal, h.cx, by - 8); n.at(h.cx, by, 0.7, 6 * Math.sin(performance.now() / 200), 1); });
    void a.run(x, 150);
    await a.tw(700, (_, e) => { by = lerp(h.cy - 70, h.cy, e); }, ease.out);
    bal.remove(); a.fx('bụp', h.cx, h.cy - 28, { cls: 'sm-star', dy: -8, ms: 500 });
    by = h.cy;
    await a.tw(240, (k) => n.at(h.cx, h.cy, 0.7 + 0.3 * BACK(k)), ease.linear);
    a.stars(h.cx, h.cy, 5, 20); n.at(h.cx, h.cy);
    await a.to(POSES.cheer, 200, ease.back);
  } },
  { id: 'hat', name: 'Mũ ảo thuật', run: async (a, b, n) => {
    const x = under(b, n, 10), hat = a.prop('<path class="sm-k" d="M-9,0 H9 M-6,0 V-12 H6 V0Z"/><path class="sm-r" d="M-6,-4 H6 V-2 H-6Z"/>');
    hat.firstElementChild!.setAttribute('class', 'sm-l');
    a.place(hat, x, b.gy);
    n.at(x, b.gy - 6, 0.2, 0, 0);
    await a.run(x - 20, 150); a.face(1);
    const wand = a.prop('<path class="sm-l" stroke-width="1.8" d="M0,0 L12,0"/><path class="sm-paper" d="M11,-1 h3 v2 h-3z"/>');
    a.hold(wand, 'A', 'arm');
    await a.to({ sA: 110, eA: 10 }, 200);
    for (let i = 0; i < 2; i++) { await a.to({ sA: 70, eA: 0 }, 120); a.stars(x, b.gy - 14, 4, 10); await a.to({ sA: 110, eA: 10 }, 120); }
    void a.say('abracadabra!', 700);
    await home(a, n, x, b.gy - 10, 0.2, 0, 520);
  } },
  { id: 'draw', name: 'Vẽ số', run: async (a, b, n) => {
    const h = n.home;
    n.clip(0);
    await a.run(Math.max(b.x0, Math.min(b.x1, h.x - 6)), 150); a.face(1);
    const brush = a.line('sm-ws'), tip = a.prop('<circle class="sm-p" r="2.2"/>');
    let bx = h.x;
    a.follow(() => { const p = a.hand('A'); brush.setAttribute('d', `M${p.x.toFixed(1)},${p.y.toFixed(1)} L${bx.toFixed(1)},${(h.y + h.h).toFixed(1)}`); a.place(tip, bx, h.y + h.h); });
    await a.to({ sA: 150, eA: 0, sB: 140, eB: 10 }, 200);
    const x0 = a.x;
    await a.tw(800, (k) => { bx = h.x + h.w * k; n.clip(k); a.x = Math.min(b.x1, x0 + (h.w - 10) * k); a.p.sA = 150 + 6 * Math.sin(k * 30); }, ease.inOut);
    n.clip(1); brush.remove(); tip.remove();
    a.stars(h.cx, h.cy, 5, 20); void a.say('xong!', 600);
  } },
  { id: 'gift', name: 'Mở hộp quà', run: async (a, b, n) => {
    const x = under(b, n), gift = a.prop('<rect class="sm-r" x="-8" y="-13" width="16" height="13" rx="1.5"/><path class="sm-a" d="M-1.5,-13 h3 v13 h-3z"/>', 'back'),
      lid = a.prop('<rect class="sm-r" x="-9.5" y="-3" width="19" height="4" rx="1"/><path class="sm-a" d="M-1.5,-3 h3 v4 h-3z M0,-3 q-6,-6 -6,-1 z M0,-3 q6,-6 6,-1z"/>');
    a.place(gift, x, b.gy); a.place(lid, x, b.gy - 13);
    n.at(x, b.gy - 10, 0.2, 0, 0);
    await a.run(x - 16, 150); a.face(1);
    await a.to({ sA: 70, eA: 40, lean: 10 }, 200);
    void a.say('quà!', 500);
    await a.to({ sA: 130, eA: 20, lean: -8 }, 150, ease.out);
    void a.tw(500, (k) => a.place(lid, x + 14 * k, b.gy - 13 - 30 * Math.sin(k * Math.PI) + 13 * k, 160 * k), ease.linear);
    a.confetti(x, b.gy - 16, 10);
    await home(a, n, x, b.gy - 10, 0.2, 0, 520);
  } },
  { id: 'striker', name: 'Đập búa bắn số', run: async (a, b, n) => {
    const x = under(b, n), pad = a.prop('<rect class="sm-r" x="-6" y="-4" width="12" height="4" rx="1"/>');
    a.place(pad, x, b.gy);
    n.at(x, b.gy - 10, 0.3, 0, 1);
    await a.run(x - 16, 150); a.face(1);
    const hm = a.prop('<path class="sm-ws" d="M-2,0 H13"/><rect class="sm-k" x="11" y="-5" width="6" height="10" rx="1.5"/>');
    a.hold(hm, 'A', 'arm', -90);
    await a.to({ sA: 170, eA: 30, lean: -10 }, 260);
    await a.to({ sA: 50, eA: 20, lean: 20 }, 110, ease.in);
    a.fx('ĐÙNG', x, b.gy - 12, { dy: -8, ms: 500 }); a.dust(x, b.gy, 4);
    await a.tw(420, (_, e) => n.at(x + (n.home.cx - x) * e, lerp(b.gy - 10, n.home.cy, e) - 10 * Math.sin(e * Math.PI), lerp(0.3, 1, e)), ease.out);
    a.stars(n.home.cx, n.home.cy, 6, 22); n.at(n.home.cx, n.home.cy);
    void a.say('ding!', 600);
  } },
  { id: 'net', name: 'Lưới bắt số', run: async (a, b, n) => {
    const t0 = performance.now();
    let caught = false;
    const fly = () => { const t = (performance.now() - t0) / 1000; return { x: lerp(b.x0, b.x1, 0.5 + 0.45 * Math.sin(t * 2.3)), y: b.gy - 30 - 12 * Math.sin(t * 4.1) }; };
    a.follow(() => { if (!caught) { const p = fly(); n.at(p.x, p.y, 0.4, 20 * Math.sin(performance.now() / 120), 1); } });
    const net = a.prop('<path class="sm-ws" d="M0,0 H12"/><ellipse class="sm-thin" cx="16" cy="0" rx="4" ry="5"/><path class="sm-thin" d="M12,-5 L22,0 L12,5"/>');
    a.hold(net, 'A', 'arm');
    await a.run(fly().x - 20, 150);
    a.face(fly().x > a.x ? 1 : -1);
    await a.to({ sA: 170, eA: 0 }, 200);
    await a.to({ sA: 70, eA: 0 }, 160, ease.in);
    caught = true;
    const p = a.hand('A');
    void a.say('bắt được!', 600);
    await a.wait(150);
    net.remove();
    await arc(a, n, p.x, p.y, 0.4, 520, 30);
  } },
  { id: 'slingshot', name: 'Ná bắn số', run: async (a, b, n) => {
    const h = n.home;
    await a.run(Math.max(b.x0, Math.min(b.x1, h.cx - 40)), 150); a.face(1);
    const sl = a.prop('<path class="sm-ws" d="M0,0 V-6 M0,-6 L-3,-12 M0,-6 L3,-12"/>'), band = a.line('sm-thin');
    a.hold(sl, 'A', 'up');
    await a.to({ sA: 100, eA: 0, sB: 95, eB: 60 }, 200);
    a.follow(() => { const p = a.hand('A'), q = a.hand('B'); band.setAttribute('d', `M${(p.x - 3 * a.dir).toFixed(1)},${(p.y - 12).toFixed(1)} L${q.x.toFixed(1)},${q.y.toFixed(1)} L${(p.x + 3 * a.dir).toFixed(1)},${(p.y - 12).toFixed(1)}`); n.at(q.x, q.y, 0.25, 0, 1); });
    await a.to({ sB: 70, eB: 120, lean: -8 }, 400);
    const q = a.hand('B');
    band.remove();
    void a.to({ sB: 100, eB: 0, lean: 6 }, 90, ease.out);
    void a.say('bắn!', 500);
    await a.wait(1);
    await arc(a, n, q.x, q.y, 0.25, 420, 26, 360);
  } },
  { id: 'basket', name: 'Ném số như bóng rổ', run: async (a, b, n) => {
    const h = n.home;
    await a.run(Math.max(b.x0, Math.min(b.x1, h.cx - 36)), 150); a.face(1);
    for (let i = 0; i < 2; i++) await a.tw(320, (k) => { a.p.sA = 50 + 20 * Math.sin(k * Math.PI); a.p.eA = 30; const p = a.hand('A'); n.at(p.x + 4, lerp(p.y + 2, a.gy - 5, Math.sin(k * Math.PI)), 0.25, k * 360, 1); }, ease.linear);
    await a.to({ ...POSES.crouch, sA: 120, eA: 90 }, 200);
    const p = a.hand('A');
    void a.to({ ...STAND, sA: 165, eA: 0, air: 6 }, 180, ease.out);
    await arc(a, n, p.x, p.y, 0.25, 560, 50, 540);
    void a.to({ air: 0 }, 150); void a.say('vào!', 600);
  } },
  { id: 'curtain', name: 'Kéo rèm', run: async (a, b, n) => {
    const h = n.home, cl = a.prop(`<rect class="sm-curtain" x="${h.x - 6}" y="${h.y - 5}" width="${h.w / 2 + 6}" height="${h.h + 10}" rx="2"/>`), cr = a.prop(`<rect class="sm-curtain" x="${h.cx}" y="${h.y - 5}" width="${h.w / 2 + 6}" height="${h.h + 10}" rx="2"/>`);
    n.at(h.cx, h.cy, 1, 0, 1);
    const x = Math.min(b.x1, h.x + h.w + 8);
    await a.run(x, 150); a.face(-1);
    const cord = a.line('sm-thin');
    a.follow(() => { const p = a.hand('A'); cord.setAttribute('d', `M${(h.x + h.w + 6).toFixed(1)},${(h.y - 5).toFixed(1)} L${p.x.toFixed(1)},${p.y.toFixed(1)}`); });
    await a.to({ sA: 150, eA: 0 }, 200);
    void a.say('mời xem!', 700);
    await a.to({ sA: 60, eA: 0, lean: 10, air: 0 }, 260, ease.in);
    await a.tw(420, (_, e) => {
      cl.setAttribute('transform', `translate(${h.x - 6} 0) scale(${(1 - 0.85 * e).toFixed(3)} 1) translate(${-(h.x - 6)} 0)`);
      cr.setAttribute('transform', `translate(${h.x + h.w + 6} 0) scale(${(1 - 0.85 * e).toFixed(3)} 1) translate(${-(h.x + h.w + 6)} 0)`);
    }, ease.out);
    a.stars(h.cx, h.cy, 5, 20);
    await a.wait(250);
  } },
  { id: 'fog', name: 'Lau kính mờ', run: async (a, b, n) => {
    const h = n.home, fog = a.prop(`<rect class="sm-fog" x="${h.x - 4}" y="${h.y - 3}" width="${h.w + 8}" height="${h.h + 6}" rx="4"/>`);
    n.at(h.cx, h.cy, 1, 0, 1);
    await a.run(Math.max(b.x0, Math.min(b.x1, h.cx - 10)), 150); a.face(1);
    const pole = a.line('sm-ws'), sq = a.prop('<rect class="sm-a" x="-6" y="-1.5" width="12" height="3" rx="1"/>');
    let sx = h.x;
    a.follow(() => { const p = a.hand('A'), y = h.cy + 4 * Math.sin(performance.now() / 70); pole.setAttribute('d', `M${p.x.toFixed(1)},${p.y.toFixed(1)} L${sx.toFixed(1)},${y.toFixed(1)}`); a.place(sq, sx, y, 90); });
    await a.to({ sA: 150, eA: 0 }, 200);
    await a.tw(900, (k) => { sx = h.x + h.w * (0.5 - 0.5 * Math.cos(k * Math.PI * 3)); fog.setAttribute('opacity', String(1 - k)); }, ease.linear);
    a.stars(h.cx, h.cy, 5, 20); void a.say('rõ chưa!', 600);
  } },
  { id: 'wand', name: 'Đũa phép', run: async (a, b, n) => {
    const h = n.home;
    n.at(h.cx, h.cy, 0.4, -20, 0);
    await a.run(Math.max(b.x0, Math.min(b.x1, h.cx - 26)), 150); a.face(1);
    const wand = a.prop('<path class="sm-l" stroke-width="1.6" d="M0,0 L12,0"/><path class="sm-a" d="M14,-3 l1,2 l2,0 l-1.6,1.4 l0.6,2.2 l-2,-1.2 l-2,1.2 l0.6,-2.2 l-1.6,-1.4 l2,0z"/>');
    a.hold(wand, 'A', 'arm');
    void a.say('bùm!', 700);
    await a.loop2(500, (t) => ({ sA: 130 + 25 * Math.sin(t * 20), eA: 10 }));
    const p = a.hand('A');
    for (let i = 0; i < 6; i++) a.fx('✦', p.x, p.y, { cls: 'sm-star', dx: (h.cx - p.x) * R(0.6, 1), dy: (h.cy - p.y) * R(0.6, 1), ms: 450, delay: i * 40 });
    await a.tw(500, (k) => n.at(h.cx, h.cy, lerp(0.4, 1, BACK(k)), -20 * (1 - k), k), ease.linear);
    a.stars(h.cx, h.cy, 6, 22); n.at(h.cx, h.cy);
  } },
  { id: 'ladder', name: 'Leo thang treo số', run: async (a, b, n) => {
    const h = n.home, x = Math.max(b.x0, Math.min(b.x1, h.cx - 14)), H = Math.max(0, Math.min(70, b.gy - h.cy - 34));
    const lad = a.prop(`<path class="sm-ws" stroke-width="1.6" d="M-5,0 V${-H - 30} M5,0 V${-H - 30}${Array.from({ length: Math.floor((H + 26) / 8) }, (_, i) => ` M-5,${-6 - i * 8} H5`).join('')}"/>`, 'back');
    a.place(lad, x, b.gy, 0, 1, 0.01);
    void a.tw(240, (_, e) => a.place(lad, x, b.gy, 0, 1, Math.max(0.01, e)), ease.back);
    let placed = false;
    a.follow(() => { const p = a.hand('B'); if (!placed) n.at(p.x, p.y - 4, 0.4, 0, 1); });
    await a.run(x, 150); a.face(1);
    const g0 = a.gy;
    await a.tw(700, (k) => { const s = Math.sin(k * Math.PI * 4); a.gy = g0 - H * k; a.p.sA = 150 + 20 * s; a.p.eA = 20; a.p.sB = 120; a.p.eB = 30; a.p.hA = 30 + 30 * Math.max(0, s); a.p.kA = 60 * Math.max(0, s); a.p.hB = 30 + 30 * Math.max(0, -s); a.p.kB = 60 * Math.max(0, -s); }, ease.linear);
    const p = a.hand('B');
    placed = true;
    await home(a, n, p.x, p.y - 4, 0.4, 0, 360);
    void a.say('treo xong!', 600);
    await a.tw(420, (k) => { a.gy = g0 - H * (1 - k); a.p.hA = 3; a.p.kA = 2; a.p.hB = -3; a.p.kB = 2; }, ease.in);
    a.gy = g0;
    await a.to({ ...STAND, sq: 0.9 }, 80);
    void a.tw(220, (_, e) => a.place(lad, x, b.gy, 0, 1, Math.max(0.01, 1 - e)), ease.in);
  } },
  { id: 'carry', name: 'Vác số tới', run: async (a, b, n) => {
    const x = under(b, n);
    let held = true;
    a.follow(() => { if (held) { const c = a.headPt(); n.at(c.x, c.y - 14, 0.45, 4 * Math.sin(performance.now() / 90), 1); } });
    await a.to({ sA: 170, eA: 30, sB: 165, eB: 35 }, 150);
    await a.walk(x, 'run', 110);
    await a.to({ ...POSES.crouch, sA: 170, eA: 30, sB: 165, eB: 35 }, 160);
    const c = a.headPt();
    held = false;
    void a.to({ ...STAND, sA: 175, eA: 0, sB: 172, eB: 0, air: 5 }, 160, ease.out);
    await arc(a, n, c.x, c.y - 14, 0.45, 460, 20);
    void a.to({ air: 0 }, 140);
    void a.say('hự!', 500);
  } },
  { id: 'pit', name: 'Đào số lên', run: async (a, b, n) => {
    const x = under(b, n), hole = a.prop('<ellipse class="sm-hole" rx="9" ry="2.6"/>', 'back');
    a.place(hole, x, b.gy, 0, 0.01);
    n.at(x, b.gy + 4, 0.3, 0, 0);
    await a.run(x - 18, 150); a.face(1);
    const sh = a.prop('<path class="sm-ws" d="M-2,0 H12"/><path class="sm-s" d="M11,-3 L17,-2 L17,2 L11,3Z"/>');
    a.hold(sh, 'A', 'arm');
    for (let i = 0; i < 3; i++) {
      await a.to({ sA: 60, eA: 10, lean: 30 }, 150);
      a.place(hole, x, b.gy, 0, (i + 1) / 3);
      a.fx('', x, b.gy - 2, { cls: 'sm-dust', dx: -16, dy: -16, ms: 500 });
      await a.to({ sA: 140, eA: 30, lean: -6 }, 150);
    }
    void a.say('đây rồi!', 600);
    await home(a, n, x, b.gy - 4, 0.3, 0, 520);
    void a.tw(200, (_, e) => a.place(hole, x, b.gy, 0, Math.max(0.01, 1 - e)), ease.in);
  } },
];
