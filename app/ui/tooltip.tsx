'use client';

// Tooltip dùng chung: một phần tử nổi (portal vào body, toạ độ màn hình), hiện dưới phần tử neo +10px, kẹp cách mép 16px.
// Rê chuột chờ 120 ms rồi hiện (quét ngang dải 7 thẻ không loé); rời chuột / cuộn / Esc ẩn ngay; focus hiện ngay; giảm chuyển động không chờ.
import { cloneElement, isValidElement, useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type FocusEvent, type HTMLAttributes, type MouseEvent, type ReactElement, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { motionOK } from './motion';

export type TipSide = 'bottom' | 'top' | 'right' | 'left';
/** Nội dung tooltip kiểu KPI: tiêu đề · kỳ, các dòng Kỳ này / Kỳ so sánh / Chênh lệch, và "Cách tính". */
export type TipRows = {
  title?: string; period?: string; current?: string; /** Nhãn dòng giá trị hiện tại (mặc định "Kỳ này"; KPI ảnh chụp dùng "Hiện có"…). */ currentLabel?: string;
  previous?: string; previousLabel?: string; diff?: string; /** Các dòng tuỳ ý [nhãn, giá trị] thêm sau Chênh lệch. */ rows?: [string, string][]; definition?: string;
};
export const isTipRows = (v: unknown): v is TipRows => typeof v === 'object' && v !== null && !isValidElement(v) && ('current' in v || 'definition' in v || 'period' in v || 'previous' in v || 'title' in v || 'rows' in v);

export function TipContent({ title, period, current, currentLabel = 'Kỳ này', previous, previousLabel = 'Kỳ so sánh', diff, rows, definition }: TipRows) {
  return (
    <>
      {(title || period) && <b>{title}{title && period ? ' · ' : ''}{period}</b>}
      {current !== undefined && <span className="r"><span>{currentLabel}</span><span className="num">{current}</span></span>}
      {previous !== undefined && <span className="r"><span>{previousLabel}</span><span className="num">{previous}</span></span>}
      {diff !== undefined && <span className="r"><span>Chênh lệch</span><span className="num">{diff}</span></span>}
      {rows?.map(([k, v]) => <span key={k} className="r"><span>{k}</span><span className="num">{v}</span></span>)}
      {definition && <span className="how block">Cách tính: {definition}</span>}
    </>
  );
}

type Anchor = HTMLElement | SVGElement;
export type TipProps = {
  onMouseEnter?: (e: MouseEvent<Anchor>) => void; onMouseLeave?: () => void;
  onFocus?: (e: FocusEvent<Anchor>) => void; onBlur?: () => void;
  'aria-describedby'?: string;
};

/** Hook cho phần tử tự quản lý neo (KpiCard, Donut, SyncPill…): rải {...props} lên phần tử neo và render {node}. */
export function useTip(content: ReactNode | null | undefined, opts: { delay?: number; side?: TipSide; auto?: boolean } = {}) {
  const { delay = 120, side = 'bottom', auto = true } = opts;
  const id = useId();
  const [anchor, setAnchor] = useState<Anchor | null>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const [shown, setShown] = useState(false);
  const timer = useRef<number | null>(null);
  const pending = useRef<Anchor | null>(null);
  const tipRef = useRef<HTMLDivElement>(null);
  // Mở bằng focus (bàn phím): trình duyệt có thể cuộn phần tử vào tầm nhìn ngay sau đó → cuộn chỉ đặt lại vị trí, không tắt.
  const byFocus = useRef(false);
  const [tick, setTick] = useState(0);
  const clear = () => { if (timer.current) { clearTimeout(timer.current); timer.current = null; } };
  const hide = useCallback(() => { clear(); pending.current = null; byFocus.current = false; setAnchor(null); setShown(false); setPos(null); }, []);
  const show = useCallback((el: Anchor, immediate: boolean) => {
    clear();
    pending.current = el; byFocus.current = immediate;
    const go = () => { if (pending.current === el) setAnchor(el); };
    if (immediate || !motionOK()) go(); else timer.current = window.setTimeout(go, delay);
  }, [delay]);
  const toggle = useCallback((el: Anchor) => { if (anchor) hide(); else show(el, true); }, [anchor, hide, show]);

  // Đo và đặt vị trí sau khi gắn; khung hình sau thêm .show để chạy transition.
  useLayoutEffect(() => {
    if (!anchor || !tipRef.current) return;
    const r = anchor.getBoundingClientRect(), t = tipRef.current.getBoundingClientRect();
    const vw = window.innerWidth, vh = window.innerHeight;
    let left = r.left, top = r.bottom + 10;
    if (side === 'top' || (side === 'bottom' && top + t.height > vh - 8 && r.top - t.height - 10 >= 8)) top = r.top - t.height - 10;
    if (side === 'right' || side === 'left') {
      top = r.top + r.height / 2 - t.height / 2;
      left = side === 'right' ? r.right + 10 : r.left - t.width - 10;
      if (side === 'right' && left + t.width > vw - 16) left = r.left - t.width - 10;
      if (side === 'left' && left < 16) left = r.right + 10;
    }
    if (left + t.width > vw - 16) left = r.right - t.width;
    left = Math.max(16, Math.min(left, vw - t.width - 16));
    top = Math.max(8, Math.min(top, vh - t.height - 8));
    setPos({ left, top });
    const raf = requestAnimationFrame(() => setShown(true));
    return () => cancelAnimationFrame(raf);
  }, [anchor, side, tick]);
  // Cuộn, đổi cỡ, Esc → ẩn ngay (mở bằng focus thì cuộn chỉ đặt lại vị trí).
  useEffect(() => {
    if (!anchor) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') hide(); };
    const onScroll = () => { if (byFocus.current) setTick((t) => t + 1); else hide(); };
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', hide);
    window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('scroll', onScroll, true); window.removeEventListener('resize', hide); window.removeEventListener('keydown', onKey); };
  }, [anchor, hide]);
  useEffect(() => () => clear(), []);

  const has = content !== null && content !== undefined && content !== false;
  const props: TipProps = has ? {
    onMouseEnter: (e) => show(e.currentTarget, false),
    onMouseLeave: hide,
    onFocus: (e) => show(e.currentTarget, true),
    onBlur: hide,
    'aria-describedby': id,
  } : {};
  const node = has && anchor && typeof document !== 'undefined'
    ? createPortal(
      <div ref={tipRef} id={id} role="tooltip" aria-hidden={!shown} className={`tip ${auto ? 'auto' : ''} ${shown ? 'show' : ''}`}
        style={pos ? { left: pos.left, top: pos.top } : { left: -9999, top: 0 }}>{content}</div>,
      document.body,
    )
    : null;
  return { props, node, open: !!anchor, show, hide, toggle };
}

/** Bọc một phần tử: <Tooltip content="…"><button>…</button></Tooltip>. Phần tử con nhận sự kiện rê chuột / focus và aria-describedby. */
export function Tooltip({ content, children, delay = 120, side = 'bottom', auto = true }: {
  content: ReactNode; children: ReactElement<HTMLAttributes<HTMLElement>>; delay?: number; side?: TipSide; auto?: boolean;
}) {
  const tip = useTip(content, { delay, side, auto });
  if (!isValidElement(children)) return <>{children}</>;
  const c = children.props;
  const merged: HTMLAttributes<HTMLElement> = {
    onMouseEnter: (e) => { c.onMouseEnter?.(e); tip.props.onMouseEnter?.(e); },
    onMouseLeave: (e) => { c.onMouseLeave?.(e); tip.props.onMouseLeave?.(); },
    onFocus: (e) => { c.onFocus?.(e); tip.props.onFocus?.(e); },
    onBlur: (e) => { c.onBlur?.(e); tip.props.onBlur?.(); },
    'aria-describedby': [c['aria-describedby'], tip.props['aria-describedby']].filter(Boolean).join(' ') || undefined,
  };
  return <>{cloneElement(children, merged)}{tip.node}</>;
}
