'use client';

import { useEffect, useRef } from 'react';
import './logo-intro.css';

const SEEN_KEY = 'mg-logo-intro';

/** Phản hồi mở đầu ngắn, cho phép bỏ qua trong mỗi phiên. */
export function LogoIntro({ onReveal, onDone }: { onReveal: () => void; onDone: () => void }) {
  const callbacks = useRef({ onReveal, onDone });
  const finished = useRef(false);
  useEffect(() => { callbacks.current = { onReveal, onDone }; });
  const finish = () => {
    if (finished.current) return;
    finished.current = true;
    try { sessionStorage.setItem(SEEN_KEY, '1'); } catch { /* Storage có thể bị chặn. */ }
    callbacks.current.onReveal();
    callbacks.current.onDone();
  };
  useEffect(() => {
    let seen = false;
    try { seen = sessionStorage.getItem(SEEN_KEY) === '1'; } catch { /* Vẫn cho phép bỏ qua. */ }
    if (seen || window.matchMedia('(prefers-reduced-motion: reduce)').matches) { finish(); return; }
    const timer = window.setTimeout(finish, 180);
    const skip = () => finish();
    window.addEventListener('keydown', skip);
    return () => { window.clearTimeout(timer); window.removeEventListener('keydown', skip); };
  }, []);
  return <div className="demo2-intro">
    <span className="demo2-intro-brand">megatech</span>
    <p>Không gian làm việc</p>
    <button type="button" onClick={finish}>Bỏ qua</button>
  </div>;
}
