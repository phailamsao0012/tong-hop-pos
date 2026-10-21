// Bộ chạy người que: một vòng requestAnimationFrame lo mọi chuyển động (dáng, đi, chạy, nhảy, lộn), đạo cụ SVG bám tay, chữ bay, bóng nói.
// Toạ độ tính theo một phần tử gốc (khối ô số); lớp vẽ là position:fixed, mỗi khung hình dời theo gốc nên cuộn trang (kể cả khung cuộn riêng) vẫn khớp.
// Bị ngắt (số về, rời trang) thì mọi tween đang chạy ném Stop; trò đang dở dọn đạo cụ của nó trong scope().
import { STAND, ease, joints, lerp, paint, type Joints, type Pose } from './engine';
import './stickman.css';

export class Stop extends Error { constructor() { super('stop'); } }
export const isStop = (e: unknown) => e instanceof Stop;
export type Ease = (k: number) => number;
export type Pt = { x: number; y: number };
/** Một ô: mép l/r/top/bottom, mặt đất gy (đáy ô trừ lề), khoảng chân đi được x0..x1. */
export type Box = { l: number; r: number; top: number; bottom: number; gy: number; x0: number; x1: number; w: number };
export type Gait = 'walk' | 'run' | 'sneak' | 'march' | 'tiptoe' | 'limp';

export const R = (a: number, b: number) => a + Math.random() * (b - a);
export const pick = <T>(xs: readonly T[]): T => xs[Math.floor(Math.random() * xs.length)];
export const chance = (p: number) => Math.random() < p;
export const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
export const FIG_H = 46;
const NS = 'http://www.w3.org/2000/svg';
const noop = () => undefined;

type Tw = { t0: number; ms: number; f: (k: number, e: number) => void; e: Ease; ok: () => void; no: (e: Stop) => void };

/** Dáng dùng chung khi nhảy. */
const PRE = { lean: 14, hA: 42, kA: 72, hB: 36, kB: 66, sA: -30, eA: 20, sB: -35, eB: 20, air: 0 } satisfies Partial<Pose>;
const UP = { lean: 4, hA: 34, kA: 60, hB: -6, kB: 26, sA: 150, eA: -10, sB: 140, eB: -5 } satisfies Partial<Pose>;
const DOWN = { lean: 8, hA: 22, kA: 26, hB: 12, kB: 30, sA: 75, eA: 10, sB: 60, eB: 10 } satisfies Partial<Pose>;
const LAND = { lean: 16, hA: 40, kA: 70, hB: 34, kB: 64, sA: 45, eA: 20, sB: 35, eB: 20, air: 0 } satisfies Partial<Pose>;
export const TUCK = { lean: 30, hA: 110, kA: 140, hB: 105, kB: 140, sA: 80, eA: 100, sB: 75, eB: 100, head: 20 } satisfies Partial<Pose>;

const STRIDE: Record<Gait, number> = { walk: 14, run: 22, sneak: 12, march: 10, tiptoe: 8, limp: 12 };
const SPEED: Record<Gait, number> = { walk: 66, run: 140, sneak: 36, march: 50, tiptoe: 42, limp: 34 };
/** Một nhịp bước theo pha (radian); hông dương là đá ra trước, gối dương gập ra sau. */
function gait(g: Gait, ph: number): Partial<Pose> {
  const s = Math.sin(ph), c = Math.cos(ph), cp = Math.max(0, c), cn = Math.max(0, -c);
  switch (g) {
    case 'run': return { lean: 15, head: -6, hA: 42 * s, hB: -42 * s, kA: 22 + 86 * cp, kB: 22 + 86 * cn, sA: -55 * s, sB: 55 * s, eA: 95, eB: 95, air: 2.5 * Math.abs(c) };
    case 'sneak': return { lean: 24, head: -14, hA: 18 + 30 * s, hB: 18 - 30 * s, kA: 55 + 45 * cp, kB: 55 + 45 * cn, sA: 85 + 8 * s, eA: 95, sB: 70 - 8 * s, eB: 105 };
    case 'march': return { lean: -2, head: -4, hA: 62 * Math.max(0, s), kA: 80 * Math.max(0, s), hB: 62 * Math.max(0, -s), kB: 80 * Math.max(0, -s), sA: -50 * s, sB: 50 * s, eA: 6, eB: 6 };
    case 'tiptoe': return { lean: 6, head: -6, hA: 16 * s, hB: -16 * s, kA: 4 + 30 * cp, kB: 4 + 30 * cn, sA: 70, eA: 40 + 10 * s, sB: 60, eB: 40 - 10 * s, air: 1.5 };
    case 'limp': return { lean: 8 + 6 * s, head: 6, hA: 20 * s, hB: -10 * s, kA: 10 + 30 * cp, kB: 6, sA: 30, eA: 90, sB: -10 * s, eB: 20 };
    default: return { lean: 3, hA: 25 * s, hB: -25 * s, kA: 6 + 38 * cp, kB: 6 + 38 * cn, sA: -24 * s, sB: 24 * s, eA: 16, eB: 16 };
  }
}
/** Vận tốc hình thang: tăng tốc 12% đầu, giảm tốc 12% cuối. */
function cruise(k: number, a = 0.12) {
  const v = 1 / (1 - a);
  if (k < a) return v * k * k / (2 * a);
  if (k > 1 - a) return 1 - v * (1 - k) ** 2 / (2 * a);
  return v * (k - a / 2);
}

export class Actor {
  x = 0; gy = 0; dir: 1 | -1 = 1; p: Pose = { ...STAND }; op = 0;
  j: Joints;
  /** Gốc toạ độ (viewport) ở khung hình gần nhất. */ ox = 0; oy = 0; ow = 0; oh = 0;
  dead = false;
  /** Đang ngắt: mọi tween mới ném Stop ngay, tới khi resume(). */ private halted = false;
  readonly layer: HTMLDivElement;
  private readonly svg: SVGSVGElement;
  private readonly back: SVGGElement;
  private readonly front: SVGGElement;
  private readonly fig: SVGGElement;
  private readonly body: SVGPathElement;
  private readonly head: SVGCircleElement;
  private readonly eye: SVGPathElement;
  private readonly tws = new Set<Tw>();
  private readonly tickers = new Set<() => void>();
  private scopeEls: Element[] = [];
  /** Đồ đang cầm (lấy từ sau lưng bằng take), hết trò thì stash() cất lại. */
  private held = new Map<Element, 'A' | 'B'>();
  private holds = new Map<Element, () => void>();
  private scopeTicks: (() => void)[] = [];
  private raf = 0;
  private origin: Element;

  constructor(origin: Element) {
    this.origin = origin;
    const layer = document.createElement('div');
    layer.className = 'sm-layer';
    layer.setAttribute('aria-hidden', 'true');
    layer.innerHTML = `<svg class="sm-svg" width="1" height="1"><g class="sm-back"></g><g class="sm-fig"><path class="sm-body"/><circle class="sm-head" r="5"/><path class="sm-eye"/></g><g class="sm-front"></g></svg>`;
    document.body.appendChild(layer);
    this.layer = layer;
    this.svg = layer.querySelector('svg')!;
    this.back = this.svg.querySelector('.sm-back')!;
    this.front = this.svg.querySelector('.sm-front')!;
    this.fig = this.svg.querySelector('.sm-fig')!;
    this.body = this.svg.querySelector('.sm-body')!;
    this.head = this.svg.querySelector('.sm-head')!;
    this.eye = this.svg.querySelector('.sm-eye')!;
    this.syncOrigin();
    this.j = joints(this.p, this.x, this.gy, this.dir);
    this.draw();
    this.raf = requestAnimationFrame(this.loop);
  }

  // ===== Vòng khung hình =====
  private syncOrigin() {
    if (!this.origin.isConnected) return;
    const r = this.origin.getBoundingClientRect();
    this.ox = r.left; this.oy = r.top; this.ow = r.width; this.oh = r.height;
    this.layer.style.transform = `translate(${r.left}px,${r.top}px)`;
  }
  private draw() {
    this.j = joints(this.p, this.x, this.gy, this.dir);
    paint(this.j, this.p, this.dir, this.body, this.head, this.eye);
    this.fig.style.opacity = String(this.op);
  }
  private loop = (now: number) => {
    this.raf = 0;
    if (this.dead) return;
    this.syncOrigin();
    for (const t of this.tws) {
      if (t.t0 < 0) t.t0 = now;
      const k = t.ms <= 0 ? 1 : Math.min(1, (now - t.t0) / t.ms);
      t.f(k, t.e(k));
      if (k >= 1) { this.tws.delete(t); t.ok(); }
    }
    this.draw();
    for (const f of this.tickers) f();
    this.raf = requestAnimationFrame(this.loop);
  };
  /** Đổi gốc toạ độ (khối ô xương bị gỡ, khối ô thật thay chỗ) mà người que đứng yên trên màn hình. */
  rebase(el: Element) {
    const r = el.getBoundingClientRect();
    const dx = this.ox - r.left, dy = this.oy - r.top;
    this.origin = el;
    this.x += dx; this.gy += dy;
    for (const n of this.layer.querySelectorAll<HTMLElement>('.sm-fx, .sm-bub')) n.remove();
    this.syncOrigin();
    this.draw();
  }
  /** Khung một phần tử theo gốc toạ độ hiện tại. */
  rectOf(el: Element) {
    const r = el.getBoundingClientRect(), o = this.origin.isConnected ? this.origin.getBoundingClientRect() : { left: this.ox, top: this.oy };
    return { x: r.left - o.left, y: r.top - o.top, w: r.width, h: r.height, cx: r.left - o.left + r.width / 2, cy: r.top - o.top + r.height / 2 };
  }
  boxOf(el: Element, pad = 9): Box {
    const r = this.rectOf(el);
    return { l: r.x, r: r.x + r.w, top: r.y, bottom: r.y + r.h, gy: r.y + r.h - pad, x0: r.x + 18, x1: r.x + r.w - 18, w: r.w - 36 };
  }

  // ===== Tween =====
  tw(ms: number, f: (k: number, e: number) => void, e: Ease = ease.inOut): Promise<void> {
    if (this.dead || this.halted) { const s = Promise.reject(new Stop()); s.catch(noop); return s; }
    const p = new Promise<void>((ok, no) => { this.tws.add({ t0: -1, ms, f, e, ok, no }); });
    p.catch(noop);
    return p;
  }
  wait(ms: number) { return this.tw(ms, noop, ease.linear); }
  /** Dừng mọi chuyển động đang chạy (trò đang dở ném Stop); halt: chặn luôn tween mới tới khi resume(). */
  interrupt(halt = false) {
    if (halt) this.halted = true;
    const all = [...this.tws];
    this.tws.clear();
    for (const t of all) t.no(new Stop());
  }
  resume() { this.halted = false; }
  destroy() {
    if (this.dead) return;
    this.interrupt();
    this.dead = true;
    cancelAnimationFrame(this.raf);
    this.layer.remove();
  }

  // ===== Dáng =====
  /** Chuyển dần sang dáng mới (chỉ các khớp được nêu). */
  to(target: Partial<Pose>, ms = 300, e: Ease = ease.inOut) {
    const from = { ...this.p };
    const keys = Object.keys(target) as (keyof Pose)[];
    return this.tw(ms, (_, k) => { for (const key of keys) this.p[key] = lerp(from[key], target[key]!, k); }, e);
  }
  /** Chuỗi dáng nối tiếp. */
  async keys(list: [Partial<Pose>, number, Ease?][]) { for (const [p, ms, e] of list) await this.to(p, ms, e); }
  /** Lặp theo thời gian: f(giây, k) trả các khớp cần đặt; nửa giây đầu hoà từ dáng hiện tại cho mượt. */
  loop2(ms: number, f: (t: number, k: number) => Partial<Pose>, blend = 160) {
    const from = { ...this.p };
    return this.tw(ms, (k) => {
      const t = k * ms, w = Math.min(1, t / blend), q = f(t / 1000, k);
      for (const key of Object.keys(q) as (keyof Pose)[]) this.p[key] = lerp(from[key], q[key]!, w);
    }, ease.linear);
  }
  face(d: 1 | -1) { this.dir = d; }
  turn() { this.dir = this.dir === 1 ? -1 : 1; }
  /** Về dáng đứng (sau mỗi trò, hoặc khi bị ngắt giữa chừng). */
  async settle(ms = 240) {
    this.p.rot = ((this.p.rot % 360) + 540) % 360 - 180;
    await this.to({ ...STAND }, ms, ease.out);
  }

  // ===== Di chuyển =====
  /** Đi tới x. back: đi lùi (mặt giữ hướng ngược chiều đi). */
  async walk(x: number, g: Gait = 'walk', speed?: number, back = false) {
    const x0 = this.x, dx = x - x0;
    if (Math.abs(dx) < 1) return;
    this.dir = (dx > 0) !== back ? 1 : -1;
    const ms = Math.abs(dx) / (speed ?? SPEED[g]) * 1000;
    const from = { ...this.p }, stride = STRIDE[g];
    await this.tw(ms, (k) => {
      this.x = x0 + dx * cruise(k);
      const t = k * ms, w = Math.min(1, t / 140, (ms - t) / 180);
      const cyc = gait(g, (back ? -1 : 1) * Math.abs(this.x - x0) / stride * Math.PI);
      const b = Math.min(1, t / 140);
      for (const key of Object.keys(STAND) as (keyof Pose)[]) {
        const base = lerp(from[key], STAND[key], b);
        const c = cyc[key];
        this.p[key] = c === undefined ? base : lerp(base, c, Math.max(0, w));
      }
    }, ease.linear);
  }
  run(x: number, speed?: number) { return this.walk(x, 'run', speed); }
  /** Lùi (mặt quay ngược chiều đi): kéo diều, kéo co. */
  backstep(x: number, speed = 30) { return this.walk(x, 'walk', speed, true); }
  /** Nhảy tới (x, gy). flips = số vòng lộn (âm: lộn ngược). */
  async jump(x: number, gy = this.gy, h = 24, ms?: number, flips = 0) {
    const x0 = this.x, g0 = this.gy;
    if (Math.abs(x - x0) > 1) this.dir = x > x0 ? 1 : -1;
    const dur = ms ?? Math.min(820, 360 + Math.hypot(x - x0, gy - g0) * 1.1);
    const H = Math.max(h, g0 - gy + 16);
    await this.to(PRE, 130, ease.out);
    const from = { ...this.p };
    await this.tw(dur, (k) => {
      this.x = lerp(x0, x, k); this.gy = lerp(g0, gy, k);
      this.p.air = H * 4 * k * (1 - k);
      if (flips) {
        const tk = Math.min(1, k * 4, (1 - k) * 4);
        for (const key of Object.keys(TUCK) as (keyof typeof TUCK)[]) this.p[key] = lerp(from[key], TUCK[key], tk);
        this.p.rot = 360 * flips * ease.inOut(k);
      } else if (k < 0.5) {
        const q = ease.out(k * 2);
        for (const key of Object.keys(UP) as (keyof typeof UP)[]) this.p[key] = lerp(from[key], UP[key], q);
      } else {
        const q = ease.inOut((k - 0.5) * 2);
        for (const key of Object.keys(DOWN) as (keyof typeof DOWN)[]) this.p[key] = lerp(UP[key], DOWN[key], q);
      }
    }, ease.linear);
    this.p.rot = 0; this.p.air = 0; this.gy = gy; this.x = x;
    await this.to({ ...LAND, sq: 0.84 }, 80, ease.out);
    await this.to({ ...STAND }, 240, ease.back);
  }
  /** Nhảy tại chỗ. */
  hop(h = 12, ms = 300) { return this.jump(this.x, this.gy, h, ms); }
  /** Bước dài qua khe giữa hai ô (hoặc từ ô ra khe): chân sải, nhấc người lên chút. */
  async stepOver(x: number, h = 6, ms = 320) {
    const x0 = this.x;
    if (Math.abs(x - x0) > 1) this.dir = x > x0 ? 1 : -1;
    const from = { ...this.p };
    await this.tw(ms, (k) => {
      const s = Math.sin(k * Math.PI);
      this.x = lerp(x0, x, ease.inOut(k)); this.p.air = h * s;
      this.p.hA = lerp(from.hA, 40, s); this.p.kA = lerp(from.kA, 18, s); this.p.hB = lerp(from.hB, -32, s); this.p.kB = lerp(from.kB, 34, s);
      this.p.sA = lerp(from.sA, -26, s); this.p.sB = lerp(from.sB, 34, s); this.p.lean = lerp(from.lean, 6, s);
    }, ease.linear);
    this.p.air = 0; this.x = x;
  }
  /** Leo dọc mép ô (lên hoặc xuống) tới mặt đất gy, tay bám thay nhau, chân đạp. */
  async climb(gy: number, speed = 46) {
    const g0 = this.gy, d = gy - g0, ms = Math.abs(d) / speed * 1000, up = d < 0, n = Math.max(1, Math.round(Math.abs(d) / 13));
    const from = { ...this.p };
    await this.tw(ms, (k) => {
      const s = Math.sin(k * Math.PI * n), w = Math.min(1, k * ms / 150);
      this.gy = g0 + d * k;
      const q: Partial<Pose> = { lean: -4, head: up ? -14 : 16, sA: 152 + 22 * s, eA: 24, sB: 152 - 22 * s, eB: 24, hA: 36 + 34 * Math.max(0, s), kA: 70 * Math.max(0, s), hB: 36 + 34 * Math.max(0, -s), kB: 70 * Math.max(0, -s), air: 0 };
      for (const key of Object.keys(q) as (keyof Pose)[]) this.p[key] = lerp(from[key], q[key]!, w);
    }, ease.linear);
    this.gy = gy;
  }
  /** Ôm mép ô tụt xuống (như tụt cột), chạm đất thì nhún. */
  async slideDown(gy: number) {
    const g0 = this.gy, d = Math.max(0, gy - g0);
    await this.to({ sA: 165, eA: 12, sB: 158, eB: 14, hA: 34, kA: 52, hB: 22, kB: 44, lean: -2, head: 14 }, 160);
    await this.tw(260 + d * 4.2, (k) => { this.gy = g0 + d * k; }, ease.in);
    this.gy = gy;
    this.dust(this.x, gy, 3);
    await this.to({ ...LAND, sq: 0.86 }, 90, ease.out);
    await this.to({ ...STAND }, 220, ease.back);
  }

  // ===== Điểm trên người =====
  hand(side: 'A' | 'B' = 'A'): Pt { return side === 'A' ? this.j.wA : this.j.wB; }
  foot(side: 'A' | 'B' = 'A'): Pt { return side === 'A' ? this.j.fA : this.j.fB; }
  headPt(): Pt { return this.j.C; }
  /** Điểm trước mặt cách thân dx, cao dy so với mặt đất. */
  ahead(dx: number, dy = 0): Pt { return { x: this.x + dx * this.dir, y: this.gy - dy }; }

  // ===== Đạo cụ (SVG, tự dọn khi hết trò) =====
  prop(markup: string, where: 'front' | 'back' = 'front', cls = ''): SVGGElement {
    const g = document.createElementNS(NS, 'g');
    if (cls) g.setAttribute('class', cls);
    g.innerHTML = markup;
    (where === 'front' ? this.front : this.back).appendChild(g);
    this.scopeEls.push(g);
    return g;
  }
  line(cls = 'sm-l'): SVGPathElement {
    const p = document.createElementNS(NS, 'path');
    p.setAttribute('class', cls);
    this.front.appendChild(p);
    this.scopeEls.push(p);
    return p;
  }
  /** Đặt đạo cụ tại (x, y), xoay độ, co giãn. */
  place(g: SVGGElement, x: number, y: number, rot = 0, sx = 1, sy = sx) {
    g.setAttribute('transform', `translate(${x.toFixed(1)},${y.toFixed(1)}) rotate(${rot.toFixed(1)}) scale(${sx.toFixed(3)},${sy.toFixed(3)})`);
  }
  /** Chạy f mỗi khung hình cho tới hết trò. */
  follow(f: () => void) { this.tickers.add(f); this.scopeTicks.push(f); f(); return f; }
  /** Cầm đạo cụ: 'arm' xoay theo cẳng tay (trục x của đạo cụ dọc cẳng tay), 'up' giữ thẳng đứng. */
  hold(g: SVGGElement, side: 'A' | 'B' = 'A', mode: 'arm' | 'up' = 'arm', off = 0) {
    this.holds.set(g, this.follow(() => {
      const w = this.hand(side), e = side === 'A' ? this.j.eA : this.j.eB;
      if (mode === 'up') { g.setAttribute('transform', `translate(${w.x.toFixed(1)},${w.y.toFixed(1)}) scale(${this.dir},1)`); return; }
      const ang = Math.atan2(w.y - e.y, w.x - e.x) * 180 / Math.PI + off * this.dir;
      g.setAttribute('transform', `translate(${w.x.toFixed(1)},${w.y.toFixed(1)}) rotate(${ang.toFixed(1)}) scale(1,${this.dir})`);
    }));
  }
  /** Buông đồ đang cầm (đặt xuống, cắm xuống…): đồ thôi bám tay, không bị cất khi hết trò. */
  release(g: Element) {
    const f = this.holds.get(g);
    if (f) { this.tickers.delete(f); this.holds.delete(g); }
    this.held.delete(g);
  }
  /** Lấy đồ từ sau lưng: tay vòng ra sau rồi đưa ra, đồ hiện trong tay. Hết trò stash() cất lại (đồ không tự mọc ra, tự biến mất). */
  async take(gs: Element | Element[], side: 'A' | 'B' = 'A', ms = 380) {
    const list = Array.isArray(gs) ? gs : [gs];
    for (const g of list) { (g as SVGElement).style.opacity = '0'; this.held.set(g, side); }
    const sk = side === 'A' ? 'sA' : 'sB', ek = side === 'A' ? 'eA' : 'eB', s0 = this.p[sk], e0 = this.p[ek];
    await this.to({ [sk]: -58, [ek]: 30 }, ms * 0.45, ease.out);
    for (const g of list) { const el = g as SVGElement; el.style.transition = 'opacity .12s'; el.style.opacity = '1'; }
    await this.to({ [sk]: s0, [ek]: e0 }, ms * 0.55, ease.inOut);
  }
  /** Cất mọi đồ đang cầm ra sau lưng. */
  async stash(ms = 340) {
    const live = [...this.held].filter(([g]) => g.isConnected);
    this.held.clear();
    if (!live.length) return;
    const sides = new Set(live.map(([, s]) => s)), q: Partial<Pose> = {}, back: Partial<Pose> = {};
    if (sides.has('A')) { q.sA = -58; q.eA = 30; back.sA = STAND.sA; back.eA = STAND.eA; }
    if (sides.has('B')) { q.sB = -55; q.eB = 30; back.sB = STAND.sB; back.eB = STAND.eB; }
    await this.to(q, ms * 0.5, ease.inOut);
    for (const [g] of live) { const el = g as SVGElement; el.style.transition = 'opacity .1s'; el.style.opacity = '0'; }
    await this.to(back, ms * 0.5, ease.out);
  }
  /** Hết trò: đồ còn bày ra (cây trồng, hình vẽ…) mờ dần chứ không biến cái rụp. */
  async tidy(ms = 260) {
    const left = this.scopeEls.filter((g) => g.isConnected && (g as SVGElement).style.opacity !== '0') as SVGElement[];
    if (!left.length) return;
    const o0 = left.map((g) => Number(g.style.opacity || 1));
    await this.tw(ms, (_, e) => left.forEach((g, i) => { g.style.opacity = String(o0[i] * (1 - e)); }), ease.in);
  }
  /** Gói một trò: hết trò (hoặc bị ngắt) thì gỡ đạo cụ và việc chạy theo khung hình của trò. */
  async scope<T>(fn: () => Promise<T>): Promise<T> {
    try { return await fn(); }
    finally {
      for (const el of this.scopeEls) el.remove();
      for (const t of this.scopeTicks) this.tickers.delete(t);
      this.scopeEls = []; this.scopeTicks = []; this.held.clear(); this.holds.clear();
    }
  }

  // ===== Chữ, hạt =====
  /** Bóng nói trên đầu; không chặn trò nếu không await. */
  say(text: string, ms = 900): Promise<void> {
    if (this.dead) return Promise.resolve();
    const b = document.createElement('div');
    b.className = 'sm-bub';
    b.textContent = text;
    this.layer.appendChild(b);
    const place = () => { b.style.transform = `translate(${this.j.C.x.toFixed(1)}px,${(this.j.C.y - 9).toFixed(1)}px) translate(-50%,-100%)`; };
    this.tickers.add(place); place();
    return this.wait(ms).catch(noop).finally(() => { this.tickers.delete(place); b.remove(); });
  }
  /** Một hạt chữ bay rồi mờ (sao, nốt nhạc, z, tim, giọt…). */
  fx(text: string, x: number, y: number, o: { dx?: number; dy?: number; ms?: number; rot?: number; s0?: number; s1?: number; cls?: string; delay?: number } = {}) {
    if (this.dead) return;
    const d = document.createElement('div');
    d.className = `sm-fx ${o.cls ?? ''}`;
    d.textContent = text;
    d.style.left = `${x}px`; d.style.top = `${y}px`;
    this.layer.appendChild(d);
    const a = d.animate([
      { transform: `translate(-50%,-50%) scale(${o.s0 ?? 0.6})`, opacity: 1 },
      { transform: `translate(calc(-50% + ${o.dx ?? 0}px),calc(-50% + ${o.dy ?? -16}px)) rotate(${o.rot ?? 0}deg) scale(${o.s1 ?? 1})`, opacity: 0 },
    ], { duration: o.ms ?? 700, delay: o.delay ?? 0, easing: 'cubic-bezier(.2,.7,.3,1)', fill: 'backwards' });
    a.onfinish = () => d.remove();
  }
  stars(x: number, y: number, n = 5, r = 16, cls = 'sm-star') {
    for (let i = 0; i < n; i++) { const t = Math.PI * 2 * i / n + R(-0.3, 0.3); this.fx('✦', x, y, { dx: Math.cos(t) * r, dy: Math.sin(t) * r, cls, ms: R(500, 700) }); }
  }
  dust(x: number, y: number, n = 4) {
    for (let i = 0; i < n; i++) this.fx('', x + R(-4, 4), y, { dx: R(-14, 14), dy: R(-8, -2), cls: 'sm-dust', s0: R(0.6, 1), s1: 1.6, ms: R(400, 600) });
  }
  burst(text: string, x: number, y: number, n = 6, r = 26, cls = '') {
    for (let i = 0; i < n; i++) { const t = -Math.PI * (i + 0.5) / n; this.fx(text, x, y, { dx: Math.cos(t) * r * R(0.7, 1.2), dy: Math.sin(t) * r * R(0.7, 1.2) + 10, rot: R(-200, 200), cls, ms: R(600, 900) }); }
  }
  confetti(x: number, y: number, n = 12) {
    const C = ['sm-c1', 'sm-c2', 'sm-c3', 'sm-c4'];
    for (let i = 0; i < n; i++) this.fx('', x, y, { dx: R(-40, 40), dy: R(-50, 10), rot: R(-360, 360), cls: `sm-conf ${pick(C)}`, ms: R(700, 1100), s1: 0.9 });
  }
}
