'use client';

// Chỗ đặt con vật trong một ô đang tải (ô KPI của SkeletonKpis, thẻ ChartCard loading). Plan: web-tong/2026-10-11-con-vat-cho-tai/plan.md.
// - Chỉ hiện khi chưa có số (SkeletonKpis / ChartCard loading chỉ có lúc đó; có số cũ thì trang đi đường .is-refreshing, A2).
// - Chờ 300 ms mới hiện. Số về là hiện ngay; con vật làm nhịp kết song song rồi mờ (A1). Mới hiện chưa tới 150 ms thì chỉ mờ nhanh.
// - Ô KPI bị thay bằng ô thật (SkeletonKpis gỡ khỏi trang): con vật chuyển sang một lớp nổi đúng vị trí ô thật để làm nhịp kết.
// - Ngoài màn hình thì dừng. Cả trang tối đa 8 chỗ có con vật; điện thoại chỉ 2 chỗ đầu chuyển động; máy bật giảm chuyển động: tư thế đứng yên.
// - Phần vẽ (5 cảnh + CSS) tải động, không nằm trong JS chính.
import { useEffect, useLayoutEffect, useRef } from 'react';
import { usePeriod } from '../period-store';
import { motionOK } from '../ui/motion';
import { SHOW_DELAY_MS, critterSize, exitPhase, isStill, sceneFor } from './pick';
import type { CritterHandle, SceneId } from './scenes';

type ScenesModule = typeof import('./scenes');
let mod: Promise<ScenesModule> | null = null;
/** Tải phần vẽ (một lần cho cả trang). */
export const loadScenes = () => (mod ??= import('./scenes').catch((e: unknown) => { mod = null; throw e; }));

type Live = { host: HTMLDivElement; handle: CritterHandle; shownAt: number };
const ERROR_HOLD_MS = 1600;

// Cả trang tối đa 8 chỗ có con vật (theo thứ tự hiện); chỗ thứ 9 trở đi giữ xương thường cho gọn mắt.
// Điện thoại: chỉ 2 chỗ đầu (hàng ô đầu) chuyển động, còn lại tư thế đứng yên.
const MAX_SLOTS = 8;
let slots = 0;
// Khung trang tạm (đang tải phần trang) nhường chỗ cho xương của trang thật: con vật hiện lại ngay, không chờ 300 ms.
let handoverUntil = 0;

/** Đặt cảnh vào host (đã gắn vào trang). */
export function mountInto(m: ScenesModule, box: HTMLElement, scene: SceneId, kind: 'kpi' | 'card', index: number, opts: { still?: boolean; noEnter?: boolean } = {}): Live {
  const phone = window.matchMedia?.('(max-width: 640px)').matches ?? false;
  const size = critterSize(kind, box.clientWidth);
  const host = document.createElement('div');
  host.className = opts.noEnter ? 'lc-stage lc-noin' : 'lc-stage';
  host.setAttribute('aria-hidden', 'true');
  host.style.cssText = `position:absolute;left:0;right:0;bottom:${kind === 'card' ? 18 : 6}px;height:${size}px`;
  box.appendChild(host);
  const still = opts.still ?? (isStill(index, phone) || !motionOK());
  const handle = m.mountScene(host, scene, { size, lagMs: index * 300, still });
  return { host, handle, shownAt: performance.now() };
}

/** Kết thúc: lỗi thì cúi đầu buồn một lúc rồi mờ; còn lại nhịp kết / mờ nhanh. Xong thì gỡ hẳn. */
function finish(live: Live, error: Element | null) {
  const { host, handle } = live;
  const end = () => { handle.destroy(); host.remove(); };
  // Lỗi: con vật cúi đầu buồn, trừ khi thẻ co lại làm con vật đè lên thông báo lỗi (QA A8) thì chỉ mờ nhanh.
  if (error && overlaps(host, error)) { void handle.setPhase('quick').then(end, end); return; }
  if (error) {
    void handle.setPhase('error').then(() => window.setTimeout(() => {
      host.style.transition = 'opacity .3s ease'; host.style.opacity = '0';
      window.setTimeout(end, 320);
    }, ERROR_HOLD_MS), end);
    return;
  }
  void handle.setPhase(exitPhase(performance.now() - live.shownAt)).then(end, end);
}

const errorIn = (el: Element | null) => el?.querySelector('[role="alert"], .notice.error') ?? null;
const overlaps = (a: Element, b: Element) => {
  const r = a.getBoundingClientRect(), q = b.getBoundingClientRect();
  return r.left < q.right && q.left < r.right && r.top < q.bottom && q.top < r.bottom;
};

/** Ô KPI thay chỗ ô xương: tìm theo vị trí của khối SkeletonKpis trong trang và thứ tự ô; phải ở gần chỗ cũ. */
function findReplacement(parent: Element, prev: Element | null, next: Element | null, index: number, oldTop: number): HTMLElement | 'skeleton' | null {
  const el = prev ? (prev.isConnected ? prev.nextElementSibling : null) : parent.firstElementChild;
  if (!el || el === next) return null;
  const tiles = el.matches('.kpi') ? [el] : [...el.querySelectorAll('.kpi')];
  const t = tiles[index];
  if (!(t instanceof HTMLElement)) return null;
  if (t.closest('.is-loading')) return 'skeleton';
  return Math.abs(t.getBoundingClientRect().top - oldTop) < 200 ? t : null;
}

/** Lớp nổi (gắn vào body) giữ con vật khi ô xương bị gỡ; đặt khung bằng placeGhost. */
function ghostLayer(): HTMLDivElement {
  const g = document.createElement('div');
  g.className = 'lc-ghost';
  g.setAttribute('aria-hidden', 'true');
  document.body.appendChild(g);
  return g;
}
/** Đặt lớp nổi trùng khung một ô (bỏ phần dịch của hiệu ứng .stagger đang chạy trên ô thật). */
function placeGhost(g: HTMLDivElement, tile: HTMLElement) {
  const r = tile.getBoundingClientRect();
  const cs = getComputedStyle(tile);
  let dy = 0;
  try { if (cs.transform && cs.transform !== 'none') dy = new DOMMatrixReadOnly(cs.transform).m42; } catch { /* bỏ qua */ }
  g.style.cssText = `position:absolute;left:${r.left + window.scrollX}px;top:${r.top - dy + window.scrollY}px;width:${r.width}px;height:${r.height}px;border-radius:${cs.borderRadius}`;
}

export function CritterSlot({ kind, active = true }: { kind: 'kpi' | 'card'; active?: boolean }) {
  const box = useRef<HTMLDivElement>(null);
  const live = useRef<Live | null>(null);
  const unmounting = useRef(false);
  // Giá trị active mới nhất (cập nhật sau khi dọn hiệu ứng cũ): khung hình sau mà vẫn active thì là đổi kỳ giữa chừng, không phải số đã về.
  const activeNow = useRef(active);
  useLayoutEffect(() => { activeNow.current = active; });
  const { start, end } = usePeriod();
  const period = `${start}..${end}`;
  // Khai báo trước: khi gỡ cả ô, cờ này bật trước lúc dọn hiệu ứng bên dưới.
  useLayoutEffect(() => { unmounting.current = false; return () => { unmounting.current = true; }; }, []);

  // Ngoài màn hình thì dừng chuyển động.
  useEffect(() => {
    const el = box.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(([e]) => live.current?.handle.pause(!e.isIntersecting));
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useLayoutEffect(() => {
    if (!active) return;
    // Bắt đầu tải phần vẽ ngay để 300 ms sau là có.
    loadScenes().catch(() => undefined);
    let cancelled = false, slot = false;
    const release = () => { if (slot) { slot = false; slots--; } };
    const handover = performance.now() < handoverUntil;
    const timer = window.setTimeout(() => {
      const scene = sceneFor(period);
      if (!scene || !box.current || slots >= MAX_SLOTS) return;
      // Giữ chỗ ngay (các ô cùng hẹn giờ chạy trong một lượt, phần vẽ về sau).
      const order = slots++;
      slot = true;
      loadScenes().then((m) => {
        if (cancelled || !box.current) { release(); return; }
        const l = mountInto(m, box.current, scene, kind, order, { noEnter: handover });
        const destroy = l.handle.destroy.bind(l.handle);
        l.handle.destroy = () => { release(); destroy(); };
        live.current = l;
        box.current.parentElement?.classList.add('has-critter');
      }, release);
    }, handover ? 0 : SHOW_DELAY_MS);
    const el = box.current;
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      const l = live.current;
      live.current = null;
      el?.parentElement?.classList.remove('has-critter');
      if (!l) { release(); return; }
      if (!unmounting.current) {
        requestAnimationFrame(() => {
          // Đổi kỳ khi chưa có số: mờ nhanh, lần tải mới tự hiện con khác.
          if (activeNow.current) { void l.handle.setPhase('quick').then(() => { l.handle.destroy(); l.host.remove(); }, () => l.host.remove()); return; }
          // Thẻ vẫn còn (ChartCard): làm nhịp kết tại chỗ, sau khi trang vẽ xong nội dung mới (để biết có lỗi không).
          finish(l, errorIn(el?.parentElement ?? null));
        });
        return;
      }
      // Ô xương bị gỡ (SkeletonKpis). DOM còn gắn ở bước này: chốt tư thế + đổi pha ngay (chuyển chỗ sau đó không làm giật),
      // đưa con vật sang lớp nổi đúng chỗ ô cũ, khung hình sau dời lớp nổi tới ô số thật thay chỗ.
      const tile = el?.parentElement, root = el?.closest('[data-critter-root]');
      const parent = root?.parentElement;
      if (!tile || !root || !parent || kind !== 'kpi' || !motionOK()) { l.handle.destroy(); return; }
      // Nếu ngay sau đây là xương mới (khung tạm → trang thật) thì con ở xương mới hiện ngay, không chờ 300 ms.
      handoverUntil = performance.now() + 400;
      const i = [...(tile.parentElement?.children ?? [])].indexOf(tile);
      const prev = root.previousElementSibling, next = root.nextElementSibling;
      const oldTop = tile.getBoundingClientRect().top;
      const g = ghostLayer();
      placeGhost(g, tile);
      const ended = l.handle.setPhase(exitPhase(performance.now() - l.shownAt));
      g.appendChild(l.host);
      const drop = () => { l.handle.destroy(); g.remove(); };
      requestAnimationFrame(() => {
        const target = findReplacement(parent, prev, next, i, oldTop);
        // Thay bằng xương khác (khung tạm → trang thật): bỏ con này, con ở xương mới hiện ngay.
        if (target === 'skeleton') { drop(); return; }
        // Không có ô số thay chỗ (ví dụ trang báo lỗi): bỏ luôn, không để con vật vui bên cạnh thông báo lỗi.
        if (!target) { drop(); return; }
        placeGhost(g, target);
        void ended.then(drop, drop);
      });
    };
  }, [active, period, kind]);

  return <div ref={box} className="lc-box" aria-hidden="true" />;
}
