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
