// Đạo diễn người que: một người que cho cả trang. Lúc ô số đang tải thì chơi trò ngẫu nhiên, chạy nhảy giữa các ô;
// khối ô xương bị gỡ (số về) thì dừng trò đang dở, tìm ô số thật ở đúng chỗ đó, chạy tới làm một trò đưa số, vẫy tay rồi mờ đi.
// Số chỉ bị giấu tối đa 3,5 giây dù có chuyện gì; rời trang giữa chừng thì người que biến luôn.
import { STAND, ease } from './engine';
import { IDLE, type Act } from './idle';
import { REVEAL, type Num } from './reveal';
import { Actor, R, chance, isStop, pick, type Box } from './runtime';

export { IDLE, REVEAL };
let current: Director | null = null;
let forced: { idle?: string; reveal?: string } = {};
let onAct: ((name: string) => void) | null = null;
/** Trang xem thử: báo tên trò đang chơi. */
export function watchAct(f: ((name: string) => void) | null) { onAct = f; }
/** Trang xem thử: chọn trò tiếp theo (trò chờ thì làm ngay). */
export function force(f: { idle?: string; reveal?: string }) {
  forced = { ...forced, ...f };
  if (f.idle && current?.phase === 'idle') current.a.interrupt();
}

// Túi xáo: đủ một vòng mới lặp lại trò; trò cần chỗ rộng mà ô hẹp thì để dành.
let bag: Act[] = [];
function nextIdle(w: number): Act {
  if (forced.idle) { const f = IDLE.find((x) => x.id === forced.idle); forced.idle = undefined; if (f) return f; }
  if (!bag.length) { bag = [...IDLE]; for (let i = bag.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [bag[i], bag[j]] = [bag[j], bag[i]]; } }
  const i = bag.findIndex((x) => (x.need ?? 0) <= w);
  return i < 0 ? IDLE[0] : bag.splice(i, 1)[0];
}
const frame = () => new Promise<number>((r) => requestAnimationFrame(r));

/** Bọc phần tử số .val để người que giấu, dời, hiện dần. */
function numOf(a: Actor, el: HTMLElement): Num {
  const range = document.createRange();
  range.selectNodeContents(el);
  const tr = range.getBoundingClientRect(), er = el.getBoundingClientRect(), o = a.rectOf(el);
  const w = Math.min(tr.width || er.width, er.width), lx = Math.max(0, tr.left - er.left);
  const home = { x: o.x + lx, y: o.y, w, h: er.height, cx: o.x + lx + w / 2, cy: o.y + er.height / 2 };
  el.style.transformOrigin = `${(lx + w / 2).toFixed(1)}px 50%`;
  el.style.opacity = '0';
  let clipped = false;
  return {
    home,
    at(x, y, sc = 1, rot = 0, op = 1) {
      if (clipped) { el.style.clipPath = ''; clipped = false; }
      el.style.transform = `translate(${(x - home.cx).toFixed(1)}px,${(y - home.cy).toFixed(1)}px) rotate(${rot.toFixed(1)}deg) scale(${sc.toFixed(3)})`;
      el.style.opacity = op.toFixed(2);
    },
    clip(f) { clipped = true; el.style.transform = ''; el.style.opacity = '1'; el.style.clipPath = `inset(-6px ${(er.width - lx - w * f).toFixed(1)}px -6px -6px)`; },
    done() { el.style.transform = ''; el.style.opacity = ''; el.style.clipPath = ''; el.style.transformOrigin = ''; },
  };
}

export class Director {
  readonly a: Actor;
  phase: 'idle' | 'reveal' | 'gone' = 'idle';
  private cur = 0;
  private idling: Promise<void>;
  /** Đang tìm ô số thật sau khi khối ô xương bị gỡ (lúc này khối ô xương mới có thể nhận người que). */
  private searching = false;
  /** Tăng mỗi lần người que được chuyển sang khối ô xương mới: lượt đưa số cũ thấy khác thì thôi. */
  private gen = 0;
  constructor(private grid: Element) {
    this.a = new Actor(grid);
    this.idling = this.idle(false);
  }
  private tiles() { return [...this.grid.querySelectorAll('.kpi')]; }
  private boxes(): Box[] { return this.tiles().map((t) => this.a.boxOf(t)); }

  private async enter(bs: Box[]) {
    const a = this.a;
    this.cur = Math.floor(Math.random() * bs.length);
    const b = bs[this.cur];
    a.x = b.x0 + b.w * R(0.2, 0.8); a.gy = b.gy; a.dir = chance(0.5) ? 1 : -1;
    a.p = { ...STAND, sA: 160, eA: 0, sB: 150, eB: 0, hA: 20, kA: 40, hB: -10, kB: 30, air: 46 };
    await a.tw(220, (_, e) => { a.op = e; }, ease.out);
    await a.tw(300, (_, e) => { a.p.air = 46 * (1 - e); }, ease.in);
    a.dust(a.x, a.gy, 4);
    await a.to({ ...STAND, lean: 16, hA: 40, kA: 70, hB: 34, kB: 64, sA: 45, sB: 35, sq: 0.84 }, 90, ease.out);
    await a.to(STAND, 260, ease.back);
  }
  /** Sang ô khác: chạy tới mép ô đang đứng rồi nhảy (đôi khi lộn) sang mép gần của ô kia. */
  private async hopTo(bs: Box[], i: number) {
    const a = this.a, from = bs[this.cur], to = bs[i];
    const right = to.l >= from.r - 2 || (Math.abs(to.l - from.l) > 4 && to.l > from.l);
    const sameRow = Math.abs(to.gy - from.gy) < 6;
    if (sameRow) await a.run(right ? from.x1 : from.x0, R(110, 150));
    else await a.walk(Math.max(from.x0, Math.min(from.x1, right ? from.x1 : from.x0)), 'run', 120);
    const x = right ? to.x0 + R(4, 20) : to.x1 - R(4, 20);
    await a.jump(x, to.gy, sameRow ? R(16, 26) : 24, undefined, chance(0.22) ? 1 : 0);
    this.cur = i;
  }
  /** Sau mỗi trò: về mặt đất của ô, hiện rõ, đứng thẳng. */
  private async ground(b: Box) {
    const a = this.a;
    a.op = 1;
    if (Math.abs(a.gy - b.gy) > 2 || a.p.air > 1) {
      const g0 = a.gy, h0 = a.p.air;
      await a.tw(260, (_, e) => { a.gy = g0 + (b.gy - g0) * e; a.p.air = h0 * (1 - e); }, ease.in);
    }
    await a.settle();
    if (a.x < b.x0 - 4 || a.x > b.x1 + 4) await a.walk(Math.max(b.x0, Math.min(b.x1, a.x)));
  }
  /** Khối ô xương này bị thay bằng khối ô xương khác (vd. trang chờ chung → trang thật): nhảy sang chơi tiếp, không biến rồi rơi xuống lại. */
  adopt(grid: Element) {
    if (this.phase !== 'reveal' || !this.searching) return false;
    this.gen++;
    this.searching = false;
    this.grid = grid;
    this.a.rebase(grid);
    this.phase = 'idle';
    this.idling = this.idle(true);
    return true;
  }
  private async idle(moved: boolean) {
    const a = this.a;
    try {
      let bs = this.boxes();
      if (!bs.length) return;
      const near = moved ? bs.map((b, i) => ({ i, d: Math.hypot((b.x0 + b.x1) / 2 - a.x, b.gy - a.gy) })).sort((p, q) => p.d - q.d)[0] : null;
      if (near && near.d < 420 && a.op > 0.5) {
        const b = bs[near.i];
        this.cur = near.i;
        await a.settle(120);
        await a.jump(Math.max(b.x0, Math.min(b.x1, a.x)), b.gy, 26, undefined, chance(0.3) ? 1 : 0);
      } else {
        if (moved) await a.tw(150, (_, e) => { a.op = Math.min(a.op, 1 - e); });
        await this.enter(bs);
      }
      while (this.phase === 'idle') {
        bs = this.boxes();
        if (!bs.length) break;
        this.cur = Math.min(this.cur, bs.length - 1);
        try {
          if (bs.length > 1 && chance(0.4) && !forced.idle) {
            let i = Math.floor(Math.random() * (bs.length - 1));
            if (i >= this.cur) i++;
            await this.hopTo(bs, i);
          }
          const b = bs[this.cur], act = nextIdle(b.w);
          onAct?.(act.name);
          await a.scope(() => act.run(a, b));
          await this.ground(b);
        } catch (e) {
          if (!isStop(e)) throw e;
          if (this.phase !== 'idle') break;
          a.resume();
          await this.ground(this.boxes()[this.cur] ?? bs[0]);
        }
      }
    } catch (e) {
      if (!isStop(e)) console.error(e);
    }
  }

  /** Khối ô xương bị gỡ: đưa số ra ở ô thật gần nhất. */
  async arrive() {
    if (this.phase !== 'idle') return;
    this.phase = 'reveal';
    const gen = this.gen, a = this.a, old = { left: a.ox, top: a.oy, right: a.ox + a.ow, bottom: a.oy + a.oh };
    a.interrupt(true);
    await this.idling;
    a.resume();
    this.searching = true;
    let num: Num | null = null, val: HTMLElement | null = null, found = false;
    const safety = window.setTimeout(() => { num?.done(); }, 3500);
    try {
      // Bị ngắt giữa lúc nhảy/lộn thì về dáng đứng ngay, đừng treo ngược giữa không trung.
      await a.scope(async () => {
        if (a.op < 1) await a.tw(150, (_, e) => { a.op = Math.max(a.op, e); });
        await a.settle(160);
      });
      let tiles: HTMLElement[] = [];
      for (let i = 0; i < 70 && !tiles.length; i++) {
        await frame();
        if (gen !== this.gen) return;
        tiles = [...document.querySelectorAll<HTMLElement>('.kpi')].filter((t) => {
          if (t.closest('.is-loading') || !t.querySelector('.val')?.textContent?.trim()) return false;
          const r = t.getBoundingClientRect();
          return r.width > 0 && r.bottom > old.top - 60 && r.top < old.bottom + 60 && r.right > old.left && r.left < old.right;
        });
      }
      this.searching = false;
      if (!tiles.length || !tiles[0].parentElement) return;
      found = true;
      a.rebase(tiles[0].parentElement);
      const near = tiles.map((t) => ({ t, b: a.boxOf(t) })).sort((p, q) => Math.hypot((p.b.x0 + p.b.x1) / 2 - a.x, p.b.gy - a.gy) - Math.hypot((q.b.x0 + q.b.x1) / 2 - a.x, q.b.gy - a.gy))[0];
      val = near.t.querySelector<HTMLElement>('.val');
      if (!val) return;
      num = numOf(a, val);
      const b = near.b;
      await a.scope(async () => {
        await a.settle(160);
        if (Math.abs(a.gy - b.gy) > 4 || a.x < b.x0 - 30 || a.x > b.x1 + 30) await a.jump(Math.max(b.x0, Math.min(b.x1, a.x)), b.gy, 20, 420);
        else { a.gy = b.gy; }
      });
      const r = (forced.reveal && REVEAL.find((x) => x.id === forced.reveal)) || pick(REVEAL);
      forced.reveal = undefined;
      onAct?.(r.name);
      const el = val;
      const watch = window.setInterval(() => { if (!el.isConnected) a.interrupt(true); }, 200);
      try { await a.scope(() => r.run(a, b, num!)); } finally { window.clearInterval(watch); }
    } catch (e) {
      if (!isStop(e)) console.error(e);
    } finally {
      window.clearTimeout(safety);
      num?.done();
      // Đã sang khối ô xương mới thì không chào, không gỡ; không tìm được số thì lặng lẽ mờ đi.
      if (gen === this.gen) await this.leave(!!val && !val.isConnected ? 'now' : found ? 'wave' : 'fade');
    }
  }
  private async leave(how: 'wave' | 'fade' | 'now') {
    const a = this.a;
    this.phase = 'gone';
    this.searching = false;
    try {
      a.resume();
      if (how === 'wave') {
        await a.settle(200);
        await a.loop2(700, (t) => ({ sB: 160, eB: 20 + 30 * Math.sin(t * 16), head: -6 }));
      }
      if (how !== 'now') await a.tw(how === 'wave' ? 300 : 180, (_, e) => { a.op = Math.min(a.op, 1 - e); }, ease.in);
    } catch { /* bỏ qua */ }
    a.destroy();
    if (current === this) current = null;
  }
  /** Gỡ ngay (tắt người que trong Cấu hình). */
  kill() { this.phase = 'gone'; this.a.destroy(); if (current === this) current = null; }
}

/** Bắt đầu người que trên khối ô xương (cả trang chỉ một người que). */
export function start(grid: Element): Director | null {
  // Một khối ô khác đang tải thì để người que ở đó; người que vừa mất khối ô cũ, chưa thấy số thì nhảy sang khối mới;
  // người que đang đưa số / chào tạm biệt thì nhường chỗ ngay cho lượt tải mới.
  if (current?.phase === 'idle') return null;
  if (current?.adopt(grid)) return current;
  current?.kill();
  current = new Director(grid);
  return current;
}
