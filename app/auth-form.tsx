'use client';

// Đăng nhập nhiều bước: mật khẩu → (mã ứng dụng | mã OTP email) → vào web. Hoặc đăng nhập thẳng bằng passkey.
import { useEffect, useState } from 'react';
import { startAuthentication } from '@simplewebauthn/browser';
import { AlertCircle, ArrowLeft, CheckCircle2, Fingerprint, LogIn } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

type Step = { step: 'password'; notice?: string } | { step: 'otp'; challengeId: string; to: string; minutes: number } | { step: 'totp'; challengeId: string }
  | { step: 'reset-email' } | { step: 'reset-code'; challengeId: string; to: string; minutes: number };

const LABEL = 'text-xs font-semibold text-ink-2';
const CODE_INPUT = 'num h-11 text-center text-2xl tracking-[.4em]';
const LINK = 'link mx-auto block w-fit text-xs text-ink-3 hover:text-primary';

export function AuthForm({ mode }: { mode: 'login' | 'setup' }) {
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [password2, setPassword2] = useState('');
  const [step, setStep] = useState<Step>({ step: 'password' });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Chỉ biết sau khi lên trình duyệt (SSR không có window) → đặt trong effect để HTML khớp lúc hydrate.
  const [canPasskey, setCanPasskey] = useState(false);
  useEffect(() => { setCanPasskey(!!window.PublicKeyCredential); }, []);

  const post = async (url: string, body: unknown) => {
    const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({})) as { error?: string; step?: string; challengeId?: string; to?: string; minutes?: number; options?: unknown };
    if (!r.ok) throw new Error(j.error ?? `Lỗi ${r.status}.`);
    return j;
  };
  const run = async (fn: () => Promise<void>) => { setBusy(true); setError(null); try { await fn(); } catch (e) { setError(e instanceof Error ? e.message : 'Không đăng nhập được.'); setBusy(false); } };

  const submitPassword = (e: React.FormEvent) => { e.preventDefault(); void run(async () => {
    if (mode === 'setup') { await post('/api/auth/setup', { email, name, password }); window.location.href = '/'; return; }
    const j = await post('/api/auth/login', { email, password });
    if (j.step === 'done') { window.location.href = '/'; return; }
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
    setStep({ step: 'password', notice: 'Đã đổi mật khẩu. Đăng nhập lại bằng mật khẩu mới và mã ứng dụng.' });
    setCode(''); setPassword(''); setPassword2(''); setBusy(false);
  }); };
  const backToPassword = () => { setStep({ step: 'password' }); setCode(''); setPassword(''); setPassword2(''); setError(null); };
  const passkeyLogin = () => void run(async () => {
    const j = await post('/api/auth/passkey', { action: 'login-options' });
    const response = await startAuthentication({ optionsJSON: j.options as Parameters<typeof startAuthentication>[0]['optionsJSON'] });
    await post('/api/auth/passkey', { action: 'login-verify', challengeId: j.challengeId, response });
    window.location.href = '/';
  });

  const subtitle = mode === 'setup' ? 'Web chưa có tài khoản. Tạo tài khoản chủ hệ thống đầu tiên.'
    : step.step === 'otp' ? `Đã gửi mã 6 số tới ${step.to}. Mã có hiệu lực ${step.minutes} phút.`
    : step.step === 'totp' ? 'Nhập mã 6 số từ ứng dụng xác thực trên điện thoại.'
    : step.step === 'reset-email' ? 'Nhập email đã đăng ký, mã đặt lại mật khẩu sẽ gửi về đó.'
    : step.step === 'reset-code' ? `Đã gửi mã 6 số tới ${step.to}. Mã có hiệu lực ${step.minutes} phút.`
    : 'Đăng nhập để xem báo cáo.';
  const errorBox = error ? <p role="alert" className="notice error"><AlertCircle size={15} className="mt-0.5 shrink-0" /><span>{error}</span></p> : null;
  const codeField = (label: string) => (
    <div className="space-y-1.5">
      <Label htmlFor="code" className={LABEL}>{label}</Label>
      <Input id="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9 ]*" maxLength={7} className={CODE_INPUT} value={code} onChange={(e) => setCode(e.target.value)} autoFocus required aria-describedby="auth-subtitle" />
    </div>
  );

  return (
    <main className="flex min-h-screen items-center justify-center bg-canvas p-4 max-sm:items-start max-sm:pt-10">
      <form onSubmit={step.step === 'password' ? submitPassword : step.step === 'reset-email' ? requestReset : step.step === 'reset-code' ? confirmReset : submitCode}
        className="card w-full max-w-sm space-y-4 p-6 max-sm:rounded-xl max-sm:p-5" aria-busy={busy || undefined}>
        <div className="flex items-center gap-3">
          <img src="/logo.svg" alt="MEGATECH" width={44} height={44} className="size-11 shrink-0 rounded-xl" />
          <div className="min-w-0">
            <h1 className="display text-[22px] font-semibold leading-tight tracking-[-.02em] text-ink">MEGATECH · Tổng hợp POS</h1>
            <p id="auth-subtitle" className="mt-0.5 text-[12.5px] leading-snug text-ink-2">{subtitle}</p>
          </div>
        </div>
        {step.step === 'password' && step.notice && <p role="status" className="notice ok"><CheckCircle2 size={15} className="mt-0.5 shrink-0" /><span>{step.notice}</span></p>}
        {step.step === 'password' ? (
          <>
            {mode === 'setup' && (
              <div className="space-y-1.5"><Label htmlFor="name" className={LABEL}>Tên hiển thị</Label><Input id="name" value={name} onChange={(e) => setName(e.target.value)} required autoComplete="name" /></div>
            )}
            <div className="space-y-1.5"><Label htmlFor="email" className={LABEL}>Email</Label><Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="username webauthn" /></div>
            <div className="space-y-1.5">
              <Label htmlFor="password" className={LABEL}>Mật khẩu{mode === 'setup' ? ' (từ 8 ký tự)' : ''}</Label>
              <Input id="password" type="password" value={password} minLength={mode === 'setup' ? 8 : undefined} onChange={(e) => setPassword(e.target.value)} required autoComplete={mode === 'login' ? 'current-password' : 'new-password'} />
            </div>
            {errorBox}
            <Button type="submit" size="lg" className="w-full" disabled={busy}><LogIn size={15} />{busy ? 'Đang xử lý…' : mode === 'login' ? 'Đăng nhập' : 'Tạo tài khoản chủ hệ thống'}</Button>
            {mode === 'login' && canPasskey && (
              <Button type="button" variant="outline" size="lg" className="h-auto min-h-9 w-full whitespace-normal py-2 text-center" disabled={busy} onClick={passkeyLogin}><Fingerprint size={15} />Đăng nhập bằng passkey (Face ID / Touch ID / Windows Hello)</Button>
            )}
            {mode === 'login' && (
              <button type="button" className={LINK} onClick={() => { setStep({ step: 'reset-email' }); setPassword(''); setError(null); }}>Quên mật khẩu?</button>
            )}
          </>
        ) : step.step === 'reset-email' ? (
          <>
            <div className="space-y-1.5"><Label htmlFor="email" className={LABEL}>Email</Label><Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="username" autoFocus /></div>
            {errorBox}
            <Button type="submit" size="lg" className="w-full" disabled={busy}>{busy ? 'Đang gửi…' : 'Gửi mã về email'}</Button>
            <button type="button" className={LINK} onClick={backToPassword}><ArrowLeft size={12} className="mr-1 inline-block align-[-2px]" />Quay lại đăng nhập</button>
          </>
        ) : step.step === 'reset-code' ? (
          <>
            {codeField('Mã trong email')}
            <div className="space-y-1.5"><Label htmlFor="new-password" className={LABEL}>Mật khẩu mới (từ 8 ký tự)</Label><Input id="new-password" type="password" value={password} minLength={8} onChange={(e) => setPassword(e.target.value)} required autoComplete="new-password" /></div>
            <div className="space-y-1.5"><Label htmlFor="new-password2" className={LABEL}>Nhập lại mật khẩu mới</Label><Input id="new-password2" type="password" value={password2} minLength={8} onChange={(e) => setPassword2(e.target.value)} required autoComplete="new-password" aria-invalid={!!password2 && password2 !== password ? true : undefined} /></div>
            {errorBox}
            <Button type="submit" size="lg" className="w-full" disabled={busy || code.replace(/\D/g, '').length !== 6 || password.length < 8}>{busy ? 'Đang đổi…' : 'Đổi mật khẩu và đăng nhập'}</Button>
            <button type="button" className={LINK} onClick={backToPassword}><ArrowLeft size={12} className="mr-1 inline-block align-[-2px]" />Quay lại đăng nhập</button>
          </>
        ) : (
          <>
            {codeField(step.step === 'otp' ? 'Mã trong email' : 'Mã ứng dụng')}
            {errorBox}
            <Button type="submit" size="lg" className="w-full" disabled={busy || code.replace(/\D/g, '').length !== 6}>{busy ? 'Đang kiểm tra…' : 'Xác nhận'}</Button>
            <button type="button" className={LINK} onClick={backToPassword}><ArrowLeft size={12} className="mr-1 inline-block align-[-2px]" />Quay lại nhập mật khẩu</button>
          </>
        )}
      </form>
    </main>
  );
}
