'use client';

// Chỗ gắn người que vào khối ô số đang tải (SkeletonKpis). Chờ 300 ms mới hiện như con vật cũ; số về trước đó thì không hiện gì.
// Tắt khi Cấu hình › Con vật chờ tải = Tắt, hoặc máy bật giảm chuyển động. Phần vẽ và 100 trò tải động, không nằm trong JS chính.
import { useEffect, useRef } from 'react';
import { motionOK } from '../ui/motion';
import { SHOW_DELAY_MS, readSetting, subscribeSetting } from '../loading-critter/pick';

type Mod = typeof import('./director');
let mod: Promise<Mod> | null = null;
export const loadStickman = () => (mod ??= import('./director').catch((e: unknown) => { mod = null; throw e; }));

export function StickSlot() {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (readSetting() === 'off' || !motionOK()) return;
    const grid = ref.current?.parentElement?.querySelector('.is-loading');
    if (!grid) return;
    let alive = true;
    let dir: import('./director').Director | null = null;
    const t = window.setTimeout(() => {
      loadStickman().then((m) => {
        if (!alive || !grid.isConnected) return;
        dir = m.start(grid);
        if (dir) document.documentElement.classList.add('lc-on');
      }, () => undefined);
    }, SHOW_DELAY_MS);
    const off = subscribeSetting(() => { if (readSetting() === 'off') dir?.kill(); });
    return () => {
      alive = false;
      window.clearTimeout(t);
      off();
      void dir?.arrive();
    };
  }, []);
  return <span ref={ref} hidden />;
}

/** Khối ô số thật đầu tiên đang thấy trên màn hình (ít nhất 2 ô có số), không tính khối ô xương. */
function liveGrid(root: Element): Element | null {
  for (const k of root.querySelectorAll('.kpi')) {
    if (k.closest('.is-loading') || !k.querySelector('.val')?.textContent?.trim()) continue;
    let g = k.parentElement;
    while (g && g !== root && g.querySelectorAll('.kpi').length < 2) g = g.parentElement;
    if (!g || g === root) continue;
    const r = g.getBoundingClientRect();
    if (r.width > 0 && r.bottom > 80 && r.top < window.innerHeight - 60) return g;
  }
  return null;
}

/**
 * Lúc đang tính lại (vẫn hiện số cũ): không làm mờ thẻ nữa, người que chạy chơi trên khối ô số đang thấy;
 * tính xong thì đưa số mới ra rồi vẫy tay đi (anh Vũ 22/10/2026: "lúc chờ như này k làm mờ nữa, mà thay bằng người que hết").
 */
export function RefreshStick({ busy }: { busy: boolean }) {
  useEffect(() => {
    if (!busy || readSetting() === 'off' || !motionOK()) return;
    let alive = true;
    let dir: import('./director').Director | null = null;
    // Ô số chưa hiện, hoặc người que lúc tải còn đang đưa số: chờ chút rồi thử lại.
    const tryStart = () => {
      const main = document.querySelector('main.is-refreshing');
      const grid = main && liveGrid(main);
      if (!grid) { t = window.setTimeout(tryStart, 600); return; }
      loadStickman().then((m) => {
        if (!alive || !grid.isConnected) return;
        dir = m.start(grid);
        if (!dir) t = window.setTimeout(tryStart, 600);
      }, () => undefined);
    };
    let t = window.setTimeout(tryStart, SHOW_DELAY_MS);
    const off = subscribeSetting(() => { if (readSetting() === 'off') dir?.kill(); });
    return () => {
      alive = false;
      window.clearTimeout(t);
      off();
      void dir?.arrive();
    };
  }, [busy]);
  return null;
}
