'use client';

// Linh vật bot AI của web tổng (anh Vũ 21/10/2026: "avt một con bot AI của web, phù hợp với web nhất, có animation động, đẹp").
// Đầu vuông bo như ô logo, nền xanh rêu của thanh bên, mắt màn hình màu chanh, ăng-ten là chấm cam của đường tăng trưởng trong logo.
// Trạng thái: idle (chớp mắt, nhìn quanh, bồng bềnh), thinking (mắt quét, vạch quét màn hình, miệng vẽ biểu đồ), happy (mắt cười, nhún).
// Chuyển động chỉ bằng CSS transform/opacity; máy bật giảm chuyển động thì đứng yên.
import { useEffect, useId, useRef } from 'react';
import { motionOK } from './ui/motion';

export type BotMood = 'idle' | 'thinking' | 'happy';

export function AiBot({ size = 28, mood = 'idle', still = false, track = false, shadow = false, className = '', label }: {
  size?: number; mood?: BotMood;
  /** Đứng yên (avatar cũ trong khung chat, chỉ con cuối cùng chuyển động). */ still?: boolean;
  /** Mắt nhìn theo con trỏ chuột / ngón tay. */ track?: boolean;
  shadow?: boolean; className?: string; label?: string;
}) {
  const id = useId().replace(/:/g, '');
  const ref = useRef<SVGSVGElement>(null);
  useEffect(() => {
    const svg = ref.current;
    if (!track || still || !svg || !motionOK()) return;
    let raf = 0, px = 0, py = 0;
    const apply = () => {
      raf = 0;
      const r = svg.getBoundingClientRect();
      const dx = px - (r.left + r.width / 2), dy = py - (r.top + r.height * 0.55), d = Math.hypot(dx, dy) || 1, k = Math.min(1, d / 160);
      svg.style.setProperty('--ab-x', `${(dx / d * 2.6 * k).toFixed(2)}px`);
      svg.style.setProperty('--ab-y', `${(dy / d * 1.8 * k).toFixed(2)}px`);
    };
    const move = (e: PointerEvent) => { px = e.clientX; py = e.clientY; if (!raf) raf = requestAnimationFrame(apply); };
    window.addEventListener('pointermove', move, { passive: true });
    return () => { window.removeEventListener('pointermove', move); cancelAnimationFrame(raf); svg.style.removeProperty('--ab-x'); svg.style.removeProperty('--ab-y'); };
  }, [track, still]);
  // Mỗi con chớp mắt lệch nhịp nhau một chút cho đỡ máy móc.
  const delay = `${(id.charCodeAt(id.length - 1) % 7) * -0.6}s`;
  return (
    <svg ref={ref} viewBox="0 0 64 66" width={size} height={size * 66 / 64} role={label ? 'img' : undefined} aria-label={label} aria-hidden={label ? undefined : true}
      className={`ai-bot ab-${mood} ${still ? 'ab-still' : ''} ${size < 32 ? 'ab-sm' : ''} ${className}`} style={{ ['--ab-d' as string]: delay }}>
      <defs>
        <linearGradient id={`${id}h`} x1="0" y1="0" x2="0.9" y2="1"><stop offset="0" stopColor="#2a7d60" /><stop offset="1" stopColor="#0f3328" /></linearGradient>
        <linearGradient id={`${id}s`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#0d2a20" /><stop offset="1" stopColor="#071a13" /></linearGradient>
        <clipPath id={`${id}c`}><rect x="14" y="23" width="36" height="27" rx="10" /></clipPath>
      </defs>
      {shadow && <ellipse className="ab-shadow" cx="32" cy="63.5" rx="15" ry="2.2" />}
      <g className="ab-body">
        <g className="ab-ant">
          <path d="M32 16V9" stroke="#86b39d" strokeWidth="2.4" strokeLinecap="round" />
          <circle className="ab-ring" cx="32" cy="7" r="3.6" fill="none" stroke="#ff8a3d" strokeWidth="1.4" />
          <circle className="ab-dot" cx="32" cy="7" r="3.6" fill="#ff8a3d" />
          <circle cx="30.9" cy="5.9" r="1.1" fill="#ffd2b0" />
        </g>
        <rect className="ab-ear" x="4" y="31" width="5.5" height="11" rx="2.75" fill="#d9f36d" />
        <rect className="ab-ear ab-ear-r" x="54.5" y="31" width="5.5" height="11" rx="2.75" fill="#d9f36d" />
        <rect x="8" y="15" width="48" height="43" rx="15" fill={`url(#${id}h)`} stroke="#d9f36d" strokeOpacity=".22" strokeWidth="1.2" />
        <path d="M17 19.5h20" stroke="#fff" strokeOpacity=".2" strokeWidth="2.6" strokeLinecap="round" />
        <rect x="14" y="23" width="36" height="27" rx="10" fill={`url(#${id}s)`} />
        <g clipPath={`url(#${id}c)`}>
          <rect className="ab-scan" x="14" y="17" width="36" height="5" fill="#d9f36d" opacity=".16" />
        </g>
        <g className="ab-look">
          <g className="ab-eyes">
            <rect x="21" y="29" width="7" height="10" rx="3.5" fill="#d9f36d" />
            <rect x="36" y="29" width="7" height="10" rx="3.5" fill="#d9f36d" />
            <rect x="22.6" y="30.6" width="2" height="2.6" rx="1" fill="#fff" opacity=".75" />
            <rect x="37.6" y="30.6" width="2" height="2.6" rx="1" fill="#fff" opacity=".75" />
          </g>
          <g className="ab-joy" fill="none" stroke="#d9f36d" strokeWidth="2.6" strokeLinecap="round">
            <path d="M21 36.5q3.5-5 7 0" /><path d="M36 36.5q3.5-5 7 0" />
          </g>
        </g>
        <path className="ab-smile" d="M28.5 43.5q3.5 2.8 7 0" fill="none" stroke="#d9f36d" strokeWidth="2.2" strokeLinecap="round" />
        <path className="ab-chart" d="M24.5 45l4.5-3 4.5 2 6-4.5" fill="none" stroke="#ff8a3d" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" pathLength={1} />
        <circle className="ab-cheek" cx="18.5" cy="43" r="2.1" fill="#ff8a3d" />
        <circle className="ab-cheek" cx="45.5" cy="43" r="2.1" fill="#ff8a3d" />
      </g>
    </svg>
  );
}

/** Bản nét mảnh một màu cho menu (cùng cỡ, cùng nét với biểu tượng lucide). */
export function AiBotGlyph({ size = 24, strokeWidth = 2, className, ...rest }: { size?: number; strokeWidth?: number; className?: string } & React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" className={className} {...rest}>
      <path d="M12 6V3.5" /><circle cx="12" cy="2.6" r="0.9" fill="currentColor" />
      <rect x="4" y="6" width="16" height="14" rx="5" />
      <path d="M9 11.5v1.5M15 11.5v1.5M10 16.2q2 1.2 4 0" />
      <path d="M2 12v2M22 12v2" />
    </svg>
  );
}
