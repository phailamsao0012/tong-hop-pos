'use client';

// Đăng nhập (giao diện mới 25/09/2026): Face ID / vân tay (passkey) là cách chính; quét mã QR bằng app MEGATECH;
// email + mật khẩu là dự phòng, bước hai ưu tiên duyệt trên app (chọn đúng số), rồi mới tới mã ứng dụng / mã email.
import { useCallback, useEffect, useRef, useState } from 'react';
import { startAuthentication } from '@simplewebauthn/browser';
import { AlertCircle, ArrowLeft, CheckCircle2, LogIn, Mail, RefreshCw, ScanFace, ShieldCheck } from 'lucide-react';
import { POS } from '@/lib/report-model';
import { PosBadge } from './pos-badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

type Step = { step: 'choose'; notice?: string } | { step: 'password'; notice?: string }
  | { step: 'approve'; requestId: string; pollToken: string; number: number; fallback: 'totp' | 'otp' | null; challengeId?: string } | { step: 'otp'; challengeId: string; to: string; minutes: number } | { step: 'totp'; challengeId: string }
  | { step: 'reset-email' } | { step: 'reset-code'; challengeId: string; to: string; minutes: number };

const LABEL = 'text-xs font-semibold text-ink-2';
const CODE_INPUT = 'num h-11 text-center text-2xl tracking-[.4em]';
const LINK = 'link mx-auto block w-fit text-xs text-ink-3 hover:text-primary';
type Qr = { id: string; pollToken: string; url: string; img: string; until: number };
const greeting = () => { const h = Number(new Intl.DateTimeFormat('en-GB', { hour: 'numeric', hourCycle: 'h23', timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date())); return h < 11 ? 'Chào buổi sáng' : h < 14 ? 'Chào buổi trưa' : h < 18 ? 'Chào buổi chiều' : 'Chào buổi tối'; };

export function AuthForm({ mode }: { mode: 'login' | 'setup' }) {
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [password2, setPassword2] = useState('');
  const [step, setStep] = useState<Step>(mode === 'setup' ? { step: 'password' } : { step: 'choose' });
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Chỉ biết sau khi lên trình duyệt (SSR không có window) → đặt trong effect để HTML khớp lúc hydrate.
  const [canPasskey, setCanPasskey] = useState(false);
  useEffect(() => { setCanPasskey(!!window.PublicKeyCredential); }, []);

  const post = async (url: string, body: unknown) => {
    const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({})) as { error?: string; step?: string; challengeId?: string; to?: string; minutes?: number; options?: unknown; requestId?: string; pollToken?: string; number?: number; fallback?: 'totp' | 'otp' | null };
    if (!r.ok) throw new Error(j.error ?? `Lỗi ${r.status}.`);
    return j;
  };
  const run = async (fn: () => Promise<void>) => { setBusy(true); setError(null); try { await fn(); } catch (e) { setError(e instanceof Error ? e.message : 'Không đăng nhập được.'); setBusy(false); } };

  const submitPassword = (e: React.FormEvent) => { e.preventDefault(); void run(async () => {
    if (mode === 'setup') { await post('/api/auth/setup', { email, name, password }); window.location.href = '/'; return; }
    const j = await post('/api/auth/login', { email, password, remember });
    if (j.step === 'done') { window.location.href = '/'; return; }
    if (j.step === 'approve') { setStep({ step: 'approve', requestId: j.requestId!, pollToken: j.pollToken!, number: j.number!, fallback: j.fallback ?? null, challengeId: j.challengeId }); setBusy(false); return; }
    if (j.step === 'otp') setStep({ step: 'otp', challengeId: j.challengeId!, to: j.to ?? '', minutes: j.minutes ?? 10 });
    else if (j.step === 'totp') setStep({ step: 'totp', challengeId: j.challengeId! });
    setBusy(false);
  }); };
  const submitCode = (e: React.FormEvent) => { e.preventDefault(); void run(async () => {
    if (step.step !== 'otp' && step.step !== 'totp') return;
    await post('/api/auth/verify', { challengeId: step.challengeId, code, kind: step.step });
    window.location.href = '/';
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
    if (j.step === 'done') { window.location.href = '/'; return; }
    setStep({ step: 'choose', notice: 'Đã đổi mật khẩu. Đăng nhập lại bằng mật khẩu mới.' });
    setCode(''); setPassword(''); setPassword2(''); setBusy(false);
  }); };
  const backToPassword = () => { setStep({ step: mode === 'setup' ? 'password' : 'choose' }); setCode(''); setPassword(''); setPassword2(''); setError(null); };
  const passkeyLogin = () => void run(async () => {
    const j = await post('/api/auth/passkey', { action: 'login-options' });
    const response = await startAuthentication({ optionsJSON: j.options as Parameters<typeof startAuthentication>[0]['optionsJSON'] });
    await post('/api/auth/passkey', { action: 'login-verify', challengeId: j.challengeId, response });
    window.location.href = '/';
  });

  // Mã QR: tạo khi đang ở màn chọn cách đăng nhập, hỏi trạng thái 2 giây một lần; hết hạn thì tự tạo mã mới (tối đa 10 lần, sau đó bấm để làm mới).
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
      const img = await QR.toDataURL(url, { margin: 1, width: 260, errorCorrectionLevel: 'M', color: { dark: '#113c30', light: '#ffffff' } });
      setQr({ id: j.id, pollToken: j.pollToken!, url, img, until: Date.now() + (j.seconds ?? 90) * 1000 }); setQrState('ready');
    } catch { setQrState('error'); }
  }, []);
  useEffect(() => {
    if (mode !== 'login' || step.step !== 'choose') return;
    renewals.current = 0; void newQr();
  }, [mode, step.step, newQr]);
  useEffect(() => {
    const polling = step.step === 'approve' ? { id: step.requestId, pollToken: step.pollToken } : step.step === 'choose' && qr && qrState === 'ready' ? { id: qr.id, pollToken: qr.pollToken } : null;
    if (!polling) return;
    const t = window.setInterval(() => {
      setNow(Date.now());
      if (document.visibilityState !== 'visible') return;
      void fetch('/api/auth/qr', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'poll', ...polling }) })
        .then((r) => r.json() as Promise<{ status?: string }>).then((j) => {
          if (j.status === 'done') { window.location.href = '/'; return; }
          if (step.step === 'approve') {
            if (j.status === 'denied') { setStep({ step: 'choose' }); setError('Yêu cầu đăng nhập đã bị từ chối trên app.'); }
            else if (j.status === 'expired' || j.status === 'invalid') { setStep({ step: 'choose' }); setError('Hết thời gian chờ duyệt. Đăng nhập lại.'); }
          } else if (j.status === 'denied') { setError('Đăng nhập bằng QR bị từ chối trên app.'); void newQr(); }
          else if (j.status === 'expired' || j.status === 'invalid' || j.status === 'consumed') {
            if (++renewals.current > 10) setQrState('paused'); else void newQr();
          }
        }).catch(() => undefined);
    }, 2000);
    return () => window.clearInterval(t);
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
    : step.step === 'password' ? 'Nhập email và mật khẩu MEGATECH của bạn.'
    : `${greeting()}. Chọn cách nhanh nhất với bạn.`;
  const errorBox = error ? <p role="alert" className="notice error"><AlertCircle size={15} className="mt-0.5 shrink-0" /><span>{error}</span></p> : null;
  const codeField = (label: string) => (
    <div className="space-y-1.5">
      <Label htmlFor="code" className={LABEL}>{label}</Label>
      <Input id="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9 ]*" maxLength={7} className={CODE_INPUT} value={code} onChange={(e) => setCode(e.target.value)} autoFocus required aria-describedby="auth-subtitle" />
    </div>
  );

  const heading = mode === 'setup' ? 'Tạo tài khoản' : step.step === 'approve' ? 'Mở app trên điện thoại' : step.step === 'otp' || step.step === 'totp' ? 'Xác minh' : step.step.startsWith('reset') ? 'Đặt lại mật khẩu' : 'Đăng nhập';
  const back = (label = 'Quay lại') => <button type="button" className={LINK} onClick={backToPassword}><ArrowLeft size={12} className="mr-1 inline-block align-[-2px]" />{label}</button>;

  return (
    <main className="auth-shell">
      <section className="auth-brand" aria-hidden="true">
        <span className="auth-bars"><i style={{ height: 120 }} /><i style={{ height: 200 }} /><i style={{ height: 150 }} /><i style={{ height: 260 }} /><i style={{ height: 210 }} /></span>
        <span className="flex items-center gap-3">
          <img src="/logo.svg" alt="" width={44} height={44} className="size-11 rounded-xl" />
          <span><b className="display block text-[20px] tracking-[.02em]">MEGATECH</b><small className="text-[12px] text-[var(--sb-ink-2)]">Tổng hợp POS · CSKH &amp; Sale</small></span>
        </span>
        <span className="auth-claim display">{step.step === 'approve' ? <>Máy tính này <em>chưa quen</em>.</> : <>Số của 6 POS, <em>đúng người</em> mới xem được.</>}</span>
        <span className="max-w-[38ch] text-[14px] text-[var(--sb-ink-2)]">{step.step === 'approve' ? 'Lần đầu vào từ máy này nên cần xác nhận thêm trên điện thoại. Máy được nhớ 30 ngày nếu bạn chọn "Nhớ máy này".' : 'Doanh thu, đơn chốt, cuộc gọi CSKH và dữ liệu khách của công ty. Mỗi lần đăng nhập đều được ghi lại.'}</span>
        <span className="mt-5 flex flex-wrap gap-1.5">{POS.map((p) => <span key={p.id} className="auth-pos"><PosBadge posId={p.id} size={18} />{p.name}</span>)}</span>
      </section>
      <form onSubmit={step.step === 'password' ? submitPassword : step.step === 'reset-email' ? requestReset : step.step === 'reset-code' ? confirmReset : step.step === 'choose' || step.step === 'approve' ? (e) => e.preventDefault() : submitCode}
        className="auth-form" aria-busy={busy || undefined}>
        <div className="auth-mobile-logo"><img src="/logo.svg" alt="MEGATECH" width={40} height={40} className="size-10 rounded-xl" /><b className="display text-[18px]">MEGATECH</b></div>
        <div>
          <h1 className="display text-[28px] font-semibold leading-tight tracking-[-.02em] text-ink">{heading}</h1>
          <p id="auth-subtitle" className="mt-1 text-[13.5px] leading-snug text-ink-2">{subtitle}</p>
        </div>
        {(step.step === 'password' || step.step === 'choose') && step.notice && <p role="status" className="notice ok"><CheckCircle2 size={15} className="mt-0.5 shrink-0" /><span>{step.notice}</span></p>}
        {step.step === 'choose' ? (
          <>
            {canPasskey && <Button type="button" size="lg" className="h-12 w-full text-[15px]" disabled={busy} onClick={passkeyLogin}><ScanFace size={19} />Đăng nhập bằng Face ID / vân tay</Button>}
            {errorBox}
            <div className="auth-or">{canPasskey ? 'hoặc quét bằng app MEGATECH' : 'Quét bằng app MEGATECH'}</div>
            <div className={`auth-qr ${qrState === 'ready' ? 'ai-border' : ''}`}>
              <div className="auth-qr-img">
                {qrState === 'ready' && qr ? <img src={qr.img} alt="Mã QR đăng nhập MEGATECH" width={120} height={120} />
                  : <button type="button" className="grid size-full place-items-center text-[11.5px] text-ink-3" onClick={() => { renewals.current = 0; void newQr(); }} disabled={qrState === 'loading'}>
                      {qrState === 'loading' ? 'Đang tạo mã…' : <span className="grid place-items-center gap-1"><RefreshCw size={18} />{qrState === 'error' ? 'Lỗi, bấm để thử lại' : 'Bấm để hiện mã'}</span>}
                    </button>}
              </div>
              <div className="min-w-0">
                <b className="block text-[14px] text-ink">Mở app → Thêm → Quét đăng nhập máy tính</b>
                <p className="mt-0.5 text-[12.5px] text-ink-3">Xác nhận bằng Face ID trên điện thoại, máy tính tự vào. Không phải gõ mật khẩu trên máy dùng chung.</p>
                {qrState === 'ready' && <p className="mt-1.5 text-[11.5px] font-semibold text-primary">Mã đổi sau {qrLeft} giây</p>}
              </div>
            </div>
            <div className="auth-or">hoặc</div>
            <Button type="button" variant="outline" size="lg" className="h-11 w-full" onClick={() => { setStep({ step: 'password' }); setError(null); }}><Mail size={16} />Dùng email và mật khẩu</Button>
          </>
        ) : step.step === 'approve' ? (
          <>
            <div className="ai-border num mx-auto grid size-24 place-items-center rounded-3xl bg-surface-2 text-[42px] text-ink" aria-live="polite">{step.number}</div>
            <p className="ai-text text-center text-[13px] font-semibold">Đang chờ bạn duyệt trên điện thoại…</p>
            {errorBox}
            <div className="grid gap-2">
              {step.fallback === 'totp' && step.challengeId && <Button type="button" variant="outline" onClick={() => { setStep({ step: 'totp', challengeId: step.challengeId! }); setCode(''); }}>Nhập mã ứng dụng xác thực</Button>}
              {step.fallback === 'otp' && <Button type="button" variant="outline" disabled={busy} onClick={approveEmail}><Mail size={15} />Không mở được app? Nhận mã qua email</Button>}
            </div>
            {back('Quay lại đăng nhập')}
          </>
        ) : step.step === 'password' ? (
          <>
            {mode === 'setup' && (
              <div className="space-y-1.5"><Label htmlFor="name" className={LABEL}>Tên hiển thị</Label><Input id="name" value={name} onChange={(e) => setName(e.target.value)} required autoComplete="name" /></div>
            )}
            <div className="space-y-1.5"><Label htmlFor="email" className={LABEL}>Email</Label><Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="username webauthn" autoFocus={mode === 'login'} /></div>
            <div className="space-y-1.5">
              <Label htmlFor="password" className={LABEL}>Mật khẩu{mode === 'setup' ? ' (từ 10 ký tự)' : ''}</Label>
              <Input id="password" type="password" value={password} minLength={mode === 'setup' ? 10 : undefined} onChange={(e) => setPassword(e.target.value)} required autoComplete={mode === 'login' ? 'current-password' : 'new-password'} />
            </div>
            {mode === 'login' && (
              <label htmlFor="remember" className="flex cursor-pointer items-center gap-2 text-[12.5px] text-ink-2">
                <input id="remember" type="checkbox" className="accent-[var(--primary)]" checked={remember} onChange={(e) => setRemember(e.target.checked)} />Nhớ máy này 30 ngày (máy riêng của bạn)
              </label>
            )}
            {errorBox}
            <Button type="submit" size="lg" className="h-11 w-full" disabled={busy}><LogIn size={15} />{busy ? 'Đang xử lý…' : mode === 'login' ? 'Đăng nhập' : 'Tạo tài khoản chủ hệ thống'}</Button>
            {mode === 'login' && (
              <div className="flex items-center justify-between">
                <button type="button" className="link text-xs text-ink-3 hover:text-primary" onClick={backToPassword}><ArrowLeft size={12} className="mr-1 inline-block align-[-2px]" />Cách khác</button>
                <button type="button" className="link text-xs text-ink-3 hover:text-primary" onClick={() => { setStep({ step: 'reset-email' }); setPassword(''); setError(null); }}>Quên mật khẩu?</button>
              </div>
            )}
          </>
        ) : step.step === 'reset-email' ? (
          <>
            <div className="space-y-1.5"><Label htmlFor="email" className={LABEL}>Email</Label><Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="username" autoFocus /></div>
            {errorBox}
            <Button type="submit" size="lg" className="w-full" disabled={busy}>{busy ? 'Đang gửi…' : 'Gửi mã về email'}</Button>
            {back('Quay lại đăng nhập')}
          </>
        ) : step.step === 'reset-code' ? (
          <>
            {codeField('Mã trong email')}
            <div className="space-y-1.5"><Label htmlFor="new-password" className={LABEL}>Mật khẩu mới (từ 10 ký tự)</Label><Input id="new-password" type="password" value={password} minLength={10} onChange={(e) => setPassword(e.target.value)} required autoComplete="new-password" /></div>
            <div className="space-y-1.5"><Label htmlFor="new-password2" className={LABEL}>Nhập lại mật khẩu mới</Label><Input id="new-password2" type="password" value={password2} minLength={10} onChange={(e) => setPassword2(e.target.value)} required autoComplete="new-password" aria-invalid={!!password2 && password2 !== password ? true : undefined} /></div>
            {errorBox}
            <Button type="submit" size="lg" className="w-full" disabled={busy || code.replace(/\D/g, '').length !== 6 || password.length < 10}>{busy ? 'Đang đổi…' : 'Đổi mật khẩu và đăng nhập'}</Button>
            {back('Quay lại đăng nhập')}
          </>
        ) : (
          <>
            {codeField(step.step === 'otp' ? 'Mã trong email' : 'Mã ứng dụng')}
            {errorBox}
            <Button type="submit" size="lg" className="w-full" disabled={busy || code.replace(/\D/g, '').length !== 6}>{busy ? 'Đang kiểm tra…' : 'Xác nhận'}</Button>
            {back('Quay lại đăng nhập')}
          </>
        )}
        <p className="auth-foot"><ShieldCheck size={14} />Kết nối mã hóa · chỉ nhân viên MEGATECH được cấp tài khoản</p>
      </form>
    </main>
  );
}
