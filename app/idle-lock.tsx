'use client';

// Tự khóa màn hình web sau 30 phút không dùng (25/09/2026; 08/10/2026: mỗi máy tự chọn thời gian ở trang Bảo mật, chủ hệ thống tắt được). Số liệu bị che cho tới khi mở bằng Face ID / passkey hoặc mật khẩu.
// Dùng chung giữa các tab (localStorage) nên mở tab mới cũng không vượt được; tắt khi đang trình chiếu.
// Kèm chữ mờ tên người xem trên nền (không áp cho chủ hệ thống) để ảnh chụp màn hình bị lộ vẫn biết của ai.
import { useEffect, useMemo, useState } from 'react';
import { startAuthentication } from '@simplewebauthn/browser';
import { Lock, LogOut, ScanFace } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export const IDLE_MINUTES = 30;
const ACTIVE_KEY = 'thp_active_at', LOCK_KEY = 'thp_locked', MINUTES_KEY = 'thp_idle_minutes';
const read = (k: string) => { try { return localStorage.getItem(k); } catch { return null; } };
const write = (k: string, v: string | null) => { try { if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch { /* bỏ qua */ } };
/** Lựa chọn thời gian tự khóa (phút); 0 = không tự khóa, chỉ chủ hệ thống. */
export const IDLE_OPTIONS: { value: number; label: string; ownerOnly?: boolean }[] = [
  { value: 30, label: '30 phút' }, { value: 60, label: '1 giờ' }, { value: 240, label: '4 giờ' }, { value: 480, label: '8 giờ' }, { value: 0, label: 'Không tự khóa', ownerOnly: true },
];
/** Thời gian tự khóa đã chọn trên máy này; giá trị lạ hoặc "không tự khóa" của người không phải chủ hệ thống → 30 phút. */
export const idleMinutes = (owner: boolean) => {
  const v = Number(read(MINUTES_KEY) ?? IDLE_MINUTES);
  const opt = IDLE_OPTIONS.find((o) => o.value === v);
  return opt && (!opt.ownerOnly || owner) ? v : IDLE_MINUTES;
};
export const setIdleMinutes = (v: number) => { write(MINUTES_KEY, String(v)); write(ACTIVE_KEY, String(Date.now())); };
export const idleLabel = (v: number) => IDLE_OPTIONS.find((o) => o.value === v)?.label ?? `${v} phút`;

export function IdleLock({ paused, owner = false, onLogout }: { paused: boolean; owner?: boolean; onLogout: () => void }) {
  const [locked, setLocked] = useState(false);
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [canPasskey, setCanPasskey] = useState(false);

  useEffect(() => {
    if (read(LOCK_KEY) === '1') setLocked(true);
    let last = 0;
    const mark = () => { const t = Date.now(); if (t - last > 15000) { last = t; if (read(LOCK_KEY) !== '1') write(ACTIVE_KEY, String(t)); } };
    if (!read(ACTIVE_KEY) || read(LOCK_KEY) !== '1') write(ACTIVE_KEY, String(Date.now()));
    const events = ['pointerdown', 'pointermove', 'keydown', 'wheel', 'touchstart'] as const;
    events.forEach((e) => window.addEventListener(e, mark, { passive: true }));
    const check = () => {
      if (read(LOCK_KEY) === '1') { setLocked(true); return; }
      const at = Number(read(ACTIVE_KEY) ?? Date.now());
      const minutes = idleMinutes(owner);
      if (!paused && minutes > 0 && Date.now() - at > minutes * 60000) { write(LOCK_KEY, '1'); setLocked(true); }
      else setLocked(false);
    };
    const t = window.setInterval(check, 20000);
    const onStorage = (e: StorageEvent) => { if (e.key === LOCK_KEY) setLocked(e.newValue === '1'); };
    window.addEventListener('storage', onStorage);
    document.addEventListener('visibilitychange', check);
    return () => { events.forEach((e) => window.removeEventListener(e, mark)); window.clearInterval(t); window.removeEventListener('storage', onStorage); document.removeEventListener('visibilitychange', check); };
  }, [paused, owner]);

  // Khi khóa: hỏi tài khoản có passkey không để hiện nút Face ID.
  useEffect(() => {
    if (!locked || !window.PublicKeyCredential) return;
    void fetch('/api/auth/security', { cache: 'no-store' }).then((r) => r.ok ? r.json() as Promise<{ passkeys?: unknown[] }> : null)
      .then((j) => setCanPasskey(!!j?.passkeys?.length)).catch(() => undefined);
  }, [locked]);
  const unlock = () => { write(LOCK_KEY, null); write(ACTIVE_KEY, String(Date.now())); setLocked(false); setPassword(''); setError(null); };
  const withPassword = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true); setError(null);
    try {
      const r = await fetch('/api/auth/reauth', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password }) });
      if (r.status === 401 && !(await r.clone().json().catch(() => ({})) as { error?: string }).error?.includes('Mật khẩu')) { onLogout(); return; }
      if (!r.ok) throw new Error(((await r.json().catch(() => ({}))) as { error?: string }).error ?? 'Không mở được.');
      unlock();
    } catch (err) { setError(err instanceof Error ? err.message : 'Không mở được.'); } finally { setBusy(false); }
  };
  const withPasskey = async () => {
    setBusy(true); setError(null);
    try {
      const o = await fetch('/api/auth/passkey', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'login-options' }) }).then((r) => r.json()) as { challengeId: string; options: unknown };
      const response = await startAuthentication({ optionsJSON: o.options as Parameters<typeof startAuthentication>[0]['optionsJSON'] });
      const r = await fetch('/api/auth/passkey', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'login-verify', challengeId: o.challengeId, response, unlock: true }) });
      const j = await r.json().catch(() => ({})) as { step?: string; error?: string };
      if (!r.ok) throw new Error(j.error ?? 'Không mở được.');
      if (j.step === 'done') { window.location.reload(); return; } // passkey của tài khoản khác → đã chuyển tài khoản
      unlock();
    } catch (err) { setError(err instanceof Error && err.name !== 'NotAllowedError' ? err.message : 'Chưa xác nhận Face ID / passkey.'); } finally { setBusy(false); }
  };

  if (!locked) return null;
  return (
    <div className="fixed inset-0 z-[90] grid place-items-center bg-[color-mix(in_srgb,var(--bg)_55%,transparent)] p-4 backdrop-blur-xl" role="dialog" aria-modal="true" aria-labelledby="lock-title">
      <form onSubmit={withPassword} className="card w-full max-w-sm space-y-3 p-6 text-center">
        <span className="mx-auto grid size-14 place-items-center rounded-2xl bg-tint text-primary"><Lock size={26} /></span>
        <h2 id="lock-title" className="display text-[20px] font-semibold text-ink">Web đang khóa</h2>
        <p className="text-[13px] text-ink-2">Không dùng quá {idleLabel(idleMinutes(owner))} nên số liệu được che. Mở lại để tiếp tục.</p>
        {canPasskey && <Button type="button" size="lg" className="h-11 w-full" disabled={busy} onClick={() => void withPasskey()}><ScanFace size={18} />Mở bằng Face ID / vân tay</Button>}
        <Input id="lock-password" type="password" placeholder="Hoặc nhập mật khẩu" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} autoFocus={!canPasskey} />
        {error && <p role="alert" className="text-sm text-bad">{error}</p>}
        <Button type="submit" variant={canPasskey ? 'outline' : 'default'} className="w-full" disabled={busy || !password}>Mở khóa</Button>
        <button type="button" className="link mx-auto flex items-center gap-1 text-xs text-ink-3" onClick={() => { write(LOCK_KEY, null); onLogout(); }}><LogOut size={12} />Đăng xuất</button>
      </form>
    </div>
  );
}

/** Chữ mờ tên + email + ngày trên nền trang. */
export function Watermark({ text }: { text: string }) {
  const bg = useMemo(() => {
    const safe = text.replace(/[<>&"']/g, '');
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="360" height="200"><text x="20" y="110" transform="rotate(-22 180 100)" font-family="system-ui,sans-serif" font-size="13" fill="#808080">${safe}</text></svg>`;
    return `url("data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}")`;
  }, [text]);
  return <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-[80] opacity-[.07] print:hidden" style={{ backgroundImage: bg }} />;
}
