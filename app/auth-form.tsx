'use client';

// Đăng nhập (giao diện 06/10/2026, làm theo video anh Vũ gửi): thẻ tối có chú husky canh cửa. Gõ email thì husky nhìn theo chữ,
// gõ mật khẩu thì che mắt, bấm hiện mật khẩu thì hé nhìn; bấm Đăng nhập thì người que đi vào cửa trên nút, xong husky cười.
// Cách vào: email + mật khẩu, Google (khi đã có GOOGLE_CLIENT_ID), Face ID / vân tay (passkey), quét QR bằng app MEGATECH.
// Bước hai sau mật khẩu giữ như cũ: duyệt trên app (chọn đúng số), mã ứng dụng, mã email.
import { useCallback, useEffect, useRef, useState } from 'react';
import { startAuthentication } from '@simplewebauthn/browser';
import { AlertCircle, CheckCircle2, Eye, EyeOff, LogIn, Mail, QrCode, RefreshCw, ScanFace } from 'lucide-react';
import { safeNext } from '@/lib/hr-link';
import { Husky, type HuskyMood } from './husky';
import { LoginBolts, LogoIntro } from './logo-intro';
import { MegatechMascot } from './megatech-mascot';

type Step = { step: 'form'; notice?: string } | { step: 'qr' }
  | { step: 'approve'; requestId: string; pollToken: string; number: number; fallback: 'totp' | 'otp' | null; challengeId?: string } | { step: 'otp'; challengeId: string; to: string; minutes: number } | { step: 'totp'; challengeId: string }
  | { step: 'reset-email' } | { step: 'reset-code'; challengeId: string; to: string; minutes: number };
type Reply = { error?: string; step?: string; challengeId?: string; to?: string; minutes?: number; options?: unknown; requestId?: string; pollToken?: string; number?: number; fallback?: 'totp' | 'otp' | null; next?: string };
type Walk = 'idle' | 'walking' | 'entered';

// Sau khi đăng nhập quay về trang được gửi tới (?next=, chỉ đường dẫn nội bộ), vd. /api/hr/handoff khi đi từ web nhân sự.
const nextParam = () => new URLSearchParams(window.location.search).get('next');
const afterLogin = () => safeNext(nextParam());
type Qr = { id: string; pollToken: string; url: string; img: string; until: number };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export type DemoLogin = { password: string; accounts: { email: string; name: string; title: string; note: string }[] };
/** Bản demo (số liệu ảo, xem lib/demo/mode.ts). */
export const DEMO_URL = 'https://demo.tonghopposmegatech.io.vn/login';

const GoogleIcon = () => (
  <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
    <path fill="#FFC107" d="M43.6 20.1H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 13 4 4 13 4 24s9 20 20 20 20-9 20-20c0-1.3-.1-2.6-.4-3.9z" />
    <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
    <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z" />
    <path fill="#1976D2" d="M43.6 20.1H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.6-.4-3.9z" />
  </svg>
);
const Walker = () => (
  <svg className="den-walker" viewBox="0 0 14 28" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
    <circle cx="7" cy="4" r="2.6" fill="currentColor" stroke="none" />
    <path d="M7 7.5v9.5M7 10l-3.5 4M7 10l3.5 4" />
    <path className="leg-a" d="M7 17l-3 9" /><path className="leg-b" d="M7 17l3 9" />
  </svg>
);

/** intro: chạy màn mở đầu logo MEGATECH trước khi hiện thẻ đăng nhập (app/logo-intro.tsx; đang bật ở bản demo). */
export function AuthForm({ mode, demo, google, intro }: { mode: 'login' | 'setup'; demo?: DemoLogin; google?: boolean; intro?: boolean }) {
  const [introStage, setIntroStage] = useState<'play' | 'reveal' | 'done'>(intro ? 'play' : 'done');
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [password2, setPassword2] = useState('');
  const [step, setStep] = useState<Step>({ step: 'form' });
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [show, setShow] = useState(false);
  const [walk, setWalk] = useState<Walk>('idle');
  const [status, setStatus] = useState<string | null>(null);
  const [shake, setShake] = useState(false);
  // Chỉ biết sau khi lên trình duyệt (SSR không có window) → đặt trong effect để HTML khớp lúc hydrate.
  const [canPasskey, setCanPasskey] = useState(false);
  useEffect(() => { setCanPasskey(!!window.PublicKeyCredential); }, []);

  // Husky: đang gõ ô nào, nhìn về đâu, vui/buồn sau khi bấm.
  const [focus, setFocus] = useState<'email' | 'password' | 'code' | null>(null);
  const [gaze, setGaze] = useState({ x: 0, y: 0 });
  const [feel, setFeel] = useState<'happy' | 'sad' | null>(null);
  const huskyRef = useRef<HTMLDivElement>(null);
  const mood: HuskyMood = feel ?? (walk !== 'idle' ? 'idle' : focus === 'password' ? (show ? 'peek' : 'cover') : focus ? 'watch' : 'idle');
  const caretGaze = (el: HTMLInputElement) => {
    const at = el.selectionStart ?? el.value.length;
    setGaze({ x: -0.9 + 1.8 * Math.min(1, at / 30), y: 0.85 });
  };
  useEffect(() => {
    if (focus) return;
    let raf = 0;
    const onMove = (e: PointerEvent) => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const r = huskyRef.current?.getBoundingClientRect(); if (!r) return;
        setGaze({ x: (e.clientX - (r.left + r.width / 2)) / 260, y: (e.clientY - (r.top + r.height * 0.45)) / 220 });
      });
    };
    window.addEventListener('pointermove', onMove);
    return () => { window.removeEventListener('pointermove', onMove); cancelAnimationFrame(raf); };
  }, [focus]);
  useEffect(() => { if (focus === 'code') setGaze({ x: 0, y: 0.9 }); else if (!focus) setGaze((g) => ({ x: g.x * 0.5, y: 0 })); }, [focus]);
  useEffect(() => { if (feel !== 'sad') return; const t = window.setTimeout(() => setFeel(null), 1600); return () => window.clearTimeout(t); }, [feel]);
  useEffect(() => { if (!shake) return; const t = window.setTimeout(() => setShake(false), 500); return () => window.clearTimeout(t); }, [shake]);

  const post = async (url: string, body: unknown) => {
    const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({})) as Reply;
    if (!r.ok) throw new Error(j.error ?? `Lỗi ${r.status}.`);
    return j;
  };
  const fail = (e: unknown) => {
    setError(e instanceof Error ? e.message : 'Không đăng nhập được.');
    setBusy(false); setWalk('idle'); setStatus(null); setFeel('sad'); setShake(true);
  };
  const run = async (fn: () => Promise<void>) => { setBusy(true); setError(null); try { await fn(); } catch (e) { fail(e); } };
  // Vào được: cửa đóng, husky cười, "Chào mừng trở lại!", rồi mới chuyển trang.
  const welcome = async (to: string) => {
    setWalk('entered'); setFeel('happy'); setStatus('Chào mừng trở lại!');
    await sleep(900);
    window.location.href = to;
  };
  // Kết quả bước một (mật khẩu hoặc Google): vào luôn, hoặc chuyển sang bước duyệt / nhập mã.
  const handle = async (j: Reply, to: string) => {
    if (j.step === 'done') { await welcome(to); return; }
    setWalk('idle'); setStatus(null); setBusy(false); setCode('');
    if (j.step === 'approve') setStep({ step: 'approve', requestId: j.requestId!, pollToken: j.pollToken!, number: j.number!, fallback: j.fallback ?? null, challengeId: j.challengeId });
    else if (j.step === 'otp') setStep({ step: 'otp', challengeId: j.challengeId!, to: j.to ?? '', minutes: j.minutes ?? 10 });
    else if (j.step === 'totp') setStep({ step: 'totp', challengeId: j.challengeId! });
  };
  // Người que đi vào cửa trong lúc chờ máy chủ (ít nhất ~1 giây cho trọn bước đi).
  const walkIn = async <T,>(work: Promise<T>) => {
    setWalk('walking'); setStatus('Đang đăng nhập…'); setFocus(null); (document.activeElement as HTMLElement | null)?.blur?.();
    // Sai cũng đi hết bước rồi mới báo, để người que không biến mất giữa chừng.
    const walked = sleep(1100);
    try { const r = await work; await walked; return r; } catch (e) { await walked; throw e; }
  };

  const submitPassword = (e: React.FormEvent) => { e.preventDefault(); void run(async () => {
    if (mode === 'setup') { await walkIn(post('/api/auth/setup', { email, name, password })); await welcome(afterLogin()); return; }
    const j = await walkIn(post('/api/auth/login', { email, password, remember }));
    await handle(j, afterLogin());
  }); };
  const demoLogin = (account: string) => { setEmail(account); setPassword(demo!.password); void run(async () => {
    const j = await walkIn(post('/api/auth/login', { email: account, password: demo!.password, remember: true }));
    if (j.step === 'done') { await welcome(afterLogin()); return; }
    throw new Error('Không vào được tài khoản demo.');
  }); };
  const submitCode = (e: React.FormEvent) => { e.preventDefault(); void run(async () => {
    if (step.step !== 'otp' && step.step !== 'totp') return;
    await walkIn(post('/api/auth/verify', { challengeId: step.challengeId, code, kind: step.step }));
    await welcome(googleNext.current ?? afterLogin());
  }); };
  const requestReset = (e: React.FormEvent) => { e.preventDefault(); void run(async () => {
    const j = await post('/api/auth/reset', { action: 'request', email });
    setStep({ step: 'reset-code', challengeId: j.challengeId!, to: j.to ?? '', minutes: j.minutes ?? 10 });
    setCode(''); setPassword(''); setPassword2(''); setBusy(false);
  }); };
  const confirmReset = (e: React.FormEvent) => { e.preventDefault(); void run(async () => {
    if (step.step !== 'reset-code') return;
    if (password !== password2) throw new Error('Hai mật khẩu không khớp.');
    const j = await post('/api/auth/reset', { action: 'confirm', challengeId: step.challengeId, code, password });
    if (j.step === 'done') { await welcome(afterLogin()); return; }
    setStep({ step: 'form', notice: 'Đã đổi mật khẩu. Đăng nhập lại bằng mật khẩu mới.' });
    setCode(''); setPassword(''); setPassword2(''); setBusy(false);
  }); };
  const backToForm = () => { setStep({ step: 'form' }); setCode(''); setPassword(''); setPassword2(''); setError(null); setShow(false); };
  const passkeyLogin = () => void run(async () => {
    const j = await post('/api/auth/passkey', { action: 'login-options' });
    const response = await startAuthentication({ optionsJSON: j.options as Parameters<typeof startAuthentication>[0]['optionsJSON'] });
    await walkIn(post('/api/auth/passkey', { action: 'login-verify', challengeId: j.challengeId, response }));
    await welcome(afterLogin());
  });

  // Google: nút chuyển sang trang chọn tài khoản của Google; Google trả ID token về /login#id_token=…, trang gửi lên máy chủ kiểm.
  const googleNext = useRef<string | null>(null);
  const googleLogin = () => { setBusy(true); setError(null); window.location.href = `/api/auth/google?next=${encodeURIComponent(afterLogin())}`; };
  useEffect(() => {
    if (!window.location.hash) return;
    const h = new URLSearchParams(window.location.hash.slice(1));
    const token = h.get('id_token'), state = h.get('state'), err = h.get('error');
    if (!token && !err) return;
    window.history.replaceState(null, '', window.location.pathname + window.location.search);
    if (err) { setError(err === 'access_denied' ? 'Đã huỷ đăng nhập bằng Google.' : 'Google không cho đăng nhập. Thử lại.'); return; }
    void run(async () => {
      const j = await walkIn(post('/api/auth/google', { credential: token, state }));
      googleNext.current = safeNext(j.next ?? null);
      await handle(j, googleNext.current);
    });
    // Chỉ chạy một lần khi Google trả về.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Mã QR: tạo khi mở bảng QR, hỏi trạng thái 2 giây một lần; hết hạn thì tự tạo mã mới (tối đa 10 lần, sau đó bấm để làm mới).
  const [qr, setQr] = useState<Qr | null>(null);
  const [qrState, setQrState] = useState<'loading' | 'ready' | 'paused' | 'error'>('loading');
  const [now, setNow] = useState(() => Date.now());
  const renewals = useRef(0);
  const newQr = useCallback(async () => {
    setQrState('loading');
    try {
      const j = await fetch('/api/auth/qr', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'create' }) }).then((r) => r.json()) as { id?: string; pollToken?: string; url?: string; seconds?: number; error?: string };
      if (!j.id) throw new Error(j.error);
      const QR = await import('qrcode');
      const url = `${window.location.origin}/qr/${j.id}`;
      const img = await QR.toDataURL(url, { margin: 1, width: 300, errorCorrectionLevel: 'M', color: { dark: '#0b2a20', light: '#ffffff' } });
      setQr({ id: j.id, pollToken: j.pollToken!, url, img, until: Date.now() + (j.seconds ?? 90) * 1000 }); setQrState('ready');
    } catch { setQrState('error'); }
  }, []);
  useEffect(() => {
    if (mode !== 'login' || step.step !== 'qr' || demo) return;
    renewals.current = 0; void newQr();
  }, [mode, step.step, newQr, demo]);
  useEffect(() => {
    const polling = step.step === 'approve' ? { id: step.requestId, pollToken: step.pollToken } : step.step === 'qr' && qr && qrState === 'ready' ? { id: qr.id, pollToken: qr.pollToken } : null;
    if (!polling) return;
    const t = window.setInterval(() => {
      setNow(Date.now());
      if (document.visibilityState !== 'visible') return;
      void fetch('/api/auth/qr', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'poll', ...polling }) })
        .then((r) => r.json() as Promise<{ status?: string }>).then((j) => {
          if (j.status === 'done') { void welcome(afterLogin()); return; }
          if (step.step === 'approve') {
            if (j.status === 'denied') { setStep({ step: 'form' }); fail(new Error('Yêu cầu đăng nhập đã bị từ chối trên app.')); }
            else if (j.status === 'expired' || j.status === 'invalid') { setStep({ step: 'form' }); fail(new Error('Hết thời gian chờ duyệt. Đăng nhập lại.')); }
          } else if (j.status === 'denied') { setError('Đăng nhập bằng QR bị từ chối trên app.'); void newQr(); }
          else if (j.status === 'expired' || j.status === 'invalid' || j.status === 'consumed') {
            if (++renewals.current > 10) setQrState('paused'); else void newQr();
          }
        }).catch(() => undefined);
    }, 2000);
    return () => window.clearInterval(t);
    // welcome/fail chỉ đặt state, không cần theo dõi.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, qr, qrState, newQr]);
  const qrLeft = qr ? Math.max(0, Math.round((qr.until - now) / 1000)) : 0;
  const approveEmail = () => void run(async () => {
    if (step.step !== 'approve') return;
    const j = await post('/api/auth/qr', { action: 'email', id: step.requestId, pollToken: step.pollToken });
    setStep({ step: 'otp', challengeId: j.challengeId!, to: j.to ?? '', minutes: j.minutes ?? 10 }); setCode(''); setBusy(false);
  });

  const subtitle = mode === 'setup' ? 'Web chưa có tài khoản. Tạo tài khoản chủ hệ thống đầu tiên.'
    : step.step === 'otp' ? `Đã gửi mã 6 số tới ${step.to}. Mã có hiệu lực ${step.minutes} phút.`
    : step.step === 'totp' ? 'Nhập mã 6 số từ ứng dụng xác thực trên điện thoại.'
    : step.step === 'reset-email' ? 'Nhập email đã đăng ký, mã đặt lại mật khẩu sẽ gửi về đó.'
    : step.step === 'reset-code' ? `Đã gửi mã 6 số tới ${step.to}. Mã có hiệu lực ${step.minutes} phút.`
    : step.step === 'approve' ? 'Máy này chưa quen. Mở app MEGATECH trên điện thoại và chọn đúng số dưới đây.'
    : step.step === 'qr' ? 'Mở app MEGATECH → Thêm → Quét đăng nhập máy tính.'
    : intro ? 'Chào mừng trở lại. Cả nông trại Megatech đang chờ bạn.' : 'Chào mừng trở lại. Husky đang canh cửa cho bạn.';
  const errorBox = error ? <p role="alert" className="den-msg err"><AlertCircle size={15} className="mt-0.5 shrink-0" /><span>{error}</span></p> : null;
  const field = (id: string, label: string, input: React.InputHTMLAttributes<HTMLInputElement>, extra?: React.ReactNode, cls = '') => (
    <div className={`den-field ${cls}`}>
      <input id={id} placeholder=" " {...input} />
      <label htmlFor={id}>{label}</label>
      {extra}
    </div>
  );
  const codeField = (label: string) => field('code', label, {
    inputMode: 'numeric', autoComplete: 'one-time-code', pattern: '[0-9 ]*', maxLength: 7, value: code, required: true, autoFocus: true, 'aria-describedby': 'den-sub',
    onChange: (e) => setCode(e.target.value), onFocus: () => setFocus('code'), onBlur: () => setFocus(null),
  }, null, 'is-code');
  const submitButton = (label: string, disabled = false) => (
    <>
      <button type="submit" className={`den-submit ${walk === 'walking' ? 'is-walking' : walk === 'entered' ? 'is-entered' : ''}`} disabled={busy || disabled} aria-busy={busy || undefined}>
        <span>{label}</span>
        <Walker />
        <span className="den-door" aria-hidden="true"><i /></span>
      </button>
      {status && <p className="den-status" role="status" key={status}>{status}</p>}
    </>
  );
  const back = (label = 'Quay lại đăng nhập') => <button type="button" className="den-ghost" onClick={backToForm}>← {label}</button>;
  const alts = mode === 'login' && !demo ? [
    google && <button key="g" type="button" className="den-alt" disabled={busy} onClick={googleLogin}><GoogleIcon />Google</button>,
    canPasskey && <button key="p" type="button" className="den-alt" disabled={busy} onClick={passkeyLogin}><ScanFace size={18} />Face ID</button>,
    (!google || !canPasskey) && <button key="q" type="button" className="den-alt" disabled={busy} onClick={() => { setStep({ step: 'qr' }); setError(null); }}><QrCode size={17} />Mã QR</button>,
  ].filter(Boolean).slice(0, 2) : [];
  const onSubmit = step.step === 'form' ? submitPassword : step.step === 'reset-email' ? requestReset : step.step === 'reset-code' ? confirmReset
    : step.step === 'otp' || step.step === 'totp' ? submitCode : (e: React.FormEvent) => e.preventDefault();

  return (
    <main className={`den-page ${intro ? 'has-bolts' : ''} ${!intro ? '' : introStage === 'play' ? 'is-intro' : 'is-intro-reveal'}`}>
      {intro && <LoginBolts />}
      {intro && introStage !== 'done' && <LogoIntro onReveal={() => setIntroStage('reveal')} onDone={() => setIntroStage('done')} />}
      <form onSubmit={onSubmit} className={`den-card ${shake ? 'is-shake' : ''}`} aria-busy={busy || undefined}>
        <div className={`den-husky ${intro ? 'den-mascot' : ''}`} ref={huskyRef}>{intro ? <MegatechMascot mood={mood} gaze={gaze} /> : <Husky mood={mood} gaze={gaze} />}</div>
        <div className="den-head">
          <h1 className="den-title">{mode === 'setup' ? 'Tạo tài khoản' : step.step === 'otp' || step.step === 'totp' ? 'Xác minh' : step.step.startsWith('reset') ? 'Đặt lại mật khẩu' : 'MEGATECH'}</h1>
          <p id="den-sub" className="den-sub">{subtitle}</p>
        </div>
        {demo && step.step === 'form' && (
          <div className="demo-login">
            <p className="text-[13px] leading-snug"><b className="text-white">Bản demo:</b> người và số liệu đều là ảo, công thức tính giống hệt web thật. Bấm một vai trò để vào ngay, hoặc gõ email bên dưới với mật khẩu <b className="text-white">{demo.password}</b>.</p>
            <div className="mt-2 grid gap-1.5">
              {demo.accounts.map((a) => (
                <button key={a.email} type="button" disabled={busy} onClick={() => demoLogin(a.email)} className="demo-account">
                  <span className="min-w-0"><b className="block truncate text-[13.5px]">{a.title}</b><small className="block truncate text-[11.5px] text-slate-400">{a.name} · {a.note}</small></span>
                  <LogIn size={15} className="shrink-0 text-blue-400" />
                </button>
              ))}
            </div>
          </div>
        )}
        {step.step === 'form' && step.notice && <p role="status" className="den-msg ok"><CheckCircle2 size={15} className="mt-0.5 shrink-0" /><span>{step.notice}</span></p>}
        {step.step === 'form' ? (
          <>
            {mode === 'setup' && field('name', 'Tên hiển thị', { value: name, required: true, autoComplete: 'name', onChange: (e) => setName(e.target.value) })}
            {field('email', 'Email', {
              type: 'email', value: email, required: true, autoComplete: 'username webauthn',
              onChange: (e) => { setEmail(e.target.value); caretGaze(e.target); }, onKeyUp: (e) => caretGaze(e.currentTarget), onClick: (e) => caretGaze(e.currentTarget),
              onFocus: (e) => { setFocus('email'); caretGaze(e.currentTarget); }, onBlur: () => setFocus(null),
            })}
            {field('password', mode === 'setup' ? 'Mật khẩu (từ 10 ký tự)' : 'Mật khẩu', {
              type: show ? 'text' : 'password', value: password, required: true, minLength: mode === 'setup' ? 10 : undefined, autoComplete: mode === 'login' ? 'current-password' : 'new-password',
              onChange: (e) => setPassword(e.target.value), onFocus: () => setFocus('password'), onBlur: () => setFocus(null),
            }, <button type="button" className="den-eye" aria-label={show ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'} aria-pressed={show}
              onMouseDown={(e) => e.preventDefault()} onClick={() => { setShow((v) => !v); document.getElementById('password')?.focus(); }}>{show ? <EyeOff size={18} /> : <Eye size={18} />}</button>)}
            {mode === 'login' && (
              <div className="den-row">
                <label className="den-check"><input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />Nhớ máy này</label>
                {!demo && <button type="button" className="den-link" onClick={() => { setStep({ step: 'reset-email' }); setPassword(''); setError(null); }}>Quên mật khẩu?</button>}
              </div>
            )}
            {errorBox}
            {submitButton(mode === 'login' ? 'Đăng nhập' : 'Tạo tài khoản chủ hệ thống')}
            {alts.length > 0 && <><div className="den-or">hoặc tiếp tục với</div><div className="den-alts">{alts}</div></>}
            {mode === 'login' && !demo && <p className="den-foot">Có app MEGATECH? <button type="button" className="den-link" onClick={() => { setStep({ step: 'qr' }); setError(null); }}>Quét mã QR</button></p>}
          </>
        ) : step.step === 'qr' ? (
          <>
            <div className="den-qr">
              <div className="den-qr-img">
                {qrState === 'ready' && qr ? <img src={qr.img} alt="Mã QR đăng nhập MEGATECH" width={168} height={168} />
                  : <button type="button" className="grid size-full place-items-center text-[12px] text-slate-500" onClick={() => { renewals.current = 0; void newQr(); }} disabled={qrState === 'loading'}>
                      {qrState === 'loading' ? 'Đang tạo mã…' : <span className="grid place-items-center gap-1"><RefreshCw size={18} />{qrState === 'error' ? 'Lỗi, bấm để thử lại' : 'Bấm để hiện mã'}</span>}
                    </button>}
              </div>
              <p className="max-w-[30ch] text-[13px] text-slate-400">Xác nhận bằng Face ID trên điện thoại, máy tính tự vào. Không phải gõ mật khẩu trên máy dùng chung.</p>
              {qrState === 'ready' && <p className="text-[12px] font-semibold text-blue-300">Mã đổi sau {qrLeft} giây</p>}
            </div>
            {errorBox}
            {status && <p className="den-status" role="status">{status}</p>}
            {back()}
          </>
        ) : step.step === 'approve' ? (
          <>
            <div className="den-number" aria-live="polite">{step.number}</div>
            <p className="text-center text-[13px] font-semibold text-blue-300">Đang chờ bạn duyệt trên điện thoại…</p>
            {errorBox}
            {status && <p className="den-status" role="status">{status}</p>}
            <div className="grid gap-2">
              {step.fallback === 'totp' && step.challengeId && <button type="button" className="den-alt" onClick={() => { setStep({ step: 'totp', challengeId: step.challengeId! }); setCode(''); }}>Nhập mã ứng dụng xác thực</button>}
              {step.fallback === 'otp' && <button type="button" className="den-alt" disabled={busy} onClick={approveEmail}><Mail size={16} />Không mở được app? Nhận mã qua email</button>}
            </div>
            {back()}
          </>
        ) : step.step === 'reset-email' ? (
          <>
            {field('email', 'Email', { type: 'email', value: email, required: true, autoComplete: 'username', autoFocus: true, onChange: (e) => setEmail(e.target.value), onFocus: (e) => { setFocus('email'); caretGaze(e.currentTarget); }, onBlur: () => setFocus(null) })}
            {errorBox}
            {submitButton(busy ? 'Đang gửi…' : 'Gửi mã về email')}
            {back()}
          </>
        ) : step.step === 'reset-code' ? (
          <>
            {codeField('Mã trong email')}
            {field('new-password', 'Mật khẩu mới (từ 10 ký tự)', { type: show ? 'text' : 'password', value: password, minLength: 10, required: true, autoComplete: 'new-password', onChange: (e) => setPassword(e.target.value), onFocus: () => setFocus('password'), onBlur: () => setFocus(null) },
              <button type="button" className="den-eye" aria-label={show ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'} aria-pressed={show} onMouseDown={(e) => e.preventDefault()} onClick={() => setShow((v) => !v)}>{show ? <EyeOff size={18} /> : <Eye size={18} />}</button>)}
            {field('new-password2', 'Nhập lại mật khẩu mới', { type: show ? 'text' : 'password', value: password2, minLength: 10, required: true, autoComplete: 'new-password', onChange: (e) => setPassword2(e.target.value), onFocus: () => setFocus('password'), onBlur: () => setFocus(null), 'aria-invalid': !!password2 && password2 !== password ? true : undefined })}
            {errorBox}
            {submitButton('Đổi mật khẩu và đăng nhập', code.replace(/\D/g, '').length !== 6 || password.length < 10)}
            {back()}
          </>
        ) : (
          <>
            {codeField(step.step === 'otp' ? 'Mã trong email' : 'Mã ứng dụng')}
            {errorBox}
            {submitButton('Xác nhận', code.replace(/\D/g, '').length !== 6)}
            {back()}
          </>
        )}
      </form>
      {mode === 'login' && !demo && <p className="den-below"><a href={DEMO_URL}>Xem bản demo (người và số liệu ảo)</a></p>}
      {demo && <p className="den-below">Bản demo · dữ liệu tách hẳn web thật</p>}
    </main>
  );
}
