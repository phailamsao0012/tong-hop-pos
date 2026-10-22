// Đạo diễn người que: một người que cho cả trang. Lúc ô số đang tải thì chơi trò ngẫu nhiên, đi dạo sang ô bên cạnh (bước qua khe, leo mép ô);
// khối ô xương bị gỡ (số về) thì dừng trò đang dở, tìm ô số thật ở đúng chỗ đó, chạy tới làm một trò đưa số, vẫy tay rồi mờ đi.
// Số chỉ bị giấu tối đa 4,5 giây dù có chuyện gì; rời trang giữa chừng thì người que biến luôn.
import { STAND, ease } from './engine';
import { IDLE, type Act } from './idle';
import { REVEAL, type Num } from './reveal';
import { Actor, R, chance, isStop, pick, type Box } from './runtime';

export { IDLE, REVEAL };
let current: Director | null = null;
/** Nước đi sang ô to; via: toạ độ x của khe dọc để leo (khác hàng). */
type Move = { to: number; via?: number };
type MoveKind = 'side' | 'up' | 'down';
let forced: { idle?: string; reveal?: string; move?: MoveKind } = {};
let onAct: ((name: string) => void) | null = null;
/** Trang xem thử: báo tên trò đang chơi. */
export function watchAct(f: ((name: string) => void) | null) { onAct = f; }
/** Trang xem thử: chọn trò tiếp theo (trò chờ thì làm ngay). */
export function force(f: { idle?: string; reveal?: string; move?: MoveKind }) {
  forced = { ...forced, ...f };
  if ((f.idle || f.move) && current?.phase === 'idle') current.a.interrupt();
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
  let clipped = false, over = false;
  return {
    home,
    at(x, y, sc = 1, rot = 0, op = 1) {
      if (over) return;
      if (clipped) { el.style.clipPath = ''; clipped = false; }
      el.style.transform = `translate(${(x - home.cx).toFixed(1)}px,${(y - home.cy).toFixed(1)}px) rotate(${rot.toFixed(1)}deg) scale(${sc.toFixed(3)})`;
      el.style.opacity = op.toFixed(2);
    },
    clip(f) { if (over) return; clipped = true; el.style.transform = ''; el.style.opacity = '1'; el.style.clipPath = `inset(-6px ${(er.width - lx - w * f).toFixed(1)}px -6px -6px)`; },
    done() { over = true; el.style.transform = ''; el.style.opacity = ''; el.style.clipPath = ''; el.style.transformOrigin = ''; },
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

  /** Vào sân: bước vào từ khe bên cạnh một ô (không rơi từ trời xuống). */
  private async enter(bs: Box[]) {
    const a = this.a;
    this.cur = Math.floor(Math.random() * bs.length);
    const b = bs[this.cur], left = chance(0.5);
    a.x = left ? b.l - 7 : b.r + 7; a.gy = b.gy; a.dir = left ? 1 : -1;
    a.p = { ...STAND };
    void a.tw(260, (_, e) => { a.op = e; }, ease.out).catch(() => undefined);
    await a.stepOver(left ? b.l + 6 : b.r - 6, 5, 300);
    await a.walk(left ? b.x0 + b.w * R(0, 0.4) : b.x1 - b.w * R(0, 0.4), 'walk', R(50, 62));
  }
  /** Các nước đi sang ô bên cạnh: cùng hàng thì bước qua khe; khác hàng thì ra khe dọc giữa hai cột, leo lên hoặc tụt xuống. */
  private moves(bs: Box[]): Move[] {
    const from = bs[this.cur], out: Move[] = [];
    const row = (b: Box) => bs.filter((c) => Math.abs(c.gy - b.gy) < 6);
    const same = row(from);
    const nextR = same.filter((c) => c.l >= from.r - 2).sort((p, q) => p.l - q.l)[0], nextL = same.filter((c) => c.r <= from.l + 2).sort((p, q) => q.r - p.r)[0];
    if (nextR && nextR.l - from.r < 48) out.push({ to: bs.indexOf(nextR) });
    if (nextL && from.l - nextL.r < 48) out.push({ to: bs.indexOf(nextL) });
    const lines = [nextR ? (from.r + nextR.l) / 2 : from.r + 7, nextL ? (from.l + nextL.r) / 2 : from.l - 7];
    const rows = [...new Set(bs.map((b) => Math.round(b.gy)))].sort((p, q) => p - q);
    const ri = rows.findIndex((g) => Math.abs(g - from.gy) < 6);
    for (const rg of [rows[ri - 1], rows[ri + 1]]) {
      if (rg === undefined) continue;
      for (const x of lines) {
        const u = bs.find((c) => Math.abs(c.gy - rg) < 6 && ((c.l >= x - 2 && c.l - x < 26) || (c.r <= x + 2 && x - c.r < 26)));
        if (u) out.push({ to: bs.indexOf(u), via: x });
      }
    }
    return out;
  }
  /** Đi dạo sang ô bên cạnh theo đường hợp lý (đi bộ, bước qua khe, leo mép ô). */
  private async travel(bs: Box[], mv: Move) {
    const a = this.a, from = bs[this.cur], to = bs[mv.to], speed = R(50, 64);
    if (mv.via === undefined) {
      const right = to.l > from.l;
      await a.walk(right ? from.r - 5 : from.l + 5, 'walk', speed);
      await a.stepOver(right ? to.l + 5 : to.r - 5, 6, 260 + Math.max(0, right ? to.l - from.r : from.l - to.r) * 6);
      await a.walk(right ? to.x0 + to.w * R(0, 0.35) : to.x1 - to.w * R(0, 0.35), 'walk', speed);
    } else {
      const x = mv.via, side = x > (from.l + from.r) / 2;
      await a.walk(side ? from.r - 5 : from.l + 5, 'walk', speed);
      await a.stepOver(x, 3, 220);
      const into = to.l >= x - 2 ? to.l + 5 : to.r - 5;
      a.face(into > x ? 1 : -1);
      if (to.gy < from.gy) {
        void a.say(pick(['lên nào', 'hự…', '']), 700);
        await a.to({ lean: 10, hA: 40, kA: 70, hB: 34, kB: 64, sA: 150, sB: 150 }, 140);
        await a.climb(to.gy);
      } else {
        await a.slideDown(to.gy);
      }
      await a.stepOver(into, 4, 240);
      await a.walk(into > x ? to.x0 + to.w * R(0, 0.3) : to.x1 - to.w * R(0, 0.3), 'walk', speed);
    }
    this.cur = mv.to;
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
        // Khối ô mới thay chỗ: nhảy xuống ô gần nhất (mặt đất mới thường thấp hơn chỗ đang đứng).
        const b = bs[near.i];
        this.cur = near.i;
        await a.settle(120);
        await a.jump(Math.max(b.x0, Math.min(b.x1, a.x)), b.gy, 18);
      } else {
        if (moved) await a.tw(150, (_, e) => { a.op = Math.min(a.op, 1 - e); });
        await this.enter(bs);
      }
      while (this.phase === 'idle') {
        bs = this.boxes();
        if (!bs.length) break;
        this.cur = Math.min(this.cur, bs.length - 1);
        try {
          const want = forced.move;
          forced.move = undefined;
          const all = bs.length > 1 && (want || (chance(0.45) && !forced.idle)) ? this.moves(bs) : [];
          const kind = (m: Move) => m.via === undefined ? 'side' : bs[m.to].gy < bs[this.cur].gy ? 'up' : 'down';
          let mv = want ? all.filter((m) => kind(m) === want) : all;
          // Trang xem thử: đang ở hàng trên cùng mà bấm "leo lên" thì tụt xuống trước rồi leo lại (và ngược lại).
          if (want && want !== 'side' && !mv.length) {
            const back = all.filter((m) => m.via !== undefined);
            if (back.length) { onAct?.(want === 'up' ? 'Tụt xuống trước rồi leo lên' : 'Leo lên trước rồi tụt xuống'); await this.travel(bs, pick(back)); mv = this.moves(bs).filter((m) => kind(m) === want); }
          }
          if (want && !mv.length) { onAct?.('(không có ô phù hợp để đi)'); await a.wait(1500); }
          if (mv.length) {
            if (want) onAct?.(want === 'side' ? 'Đi sang ô bên' : want === 'up' ? 'Leo lên ô trên' : 'Tụt xuống ô dưới');
            // Thích đi ngang hơn leo; đôi khi đi liền hai ô.
            const flat = mv.filter((m) => m.via === undefined);
            await this.travel(bs, pick(flat.length && chance(0.65) ? flat : mv));
            if (!want && chance(0.25)) { const m2 = this.moves(bs); if (m2.length) await this.travel(bs, pick(m2)); }
          }
          const b = bs[this.cur], act = nextIdle(b.w);
          onAct?.(act.name);
          await a.scope(async () => { await act.run(a, b); await a.stash(); await a.tidy(); });
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
    const safety = window.setTimeout(() => { num?.done(); }, 4500);
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
