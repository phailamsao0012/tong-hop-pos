'use client';

// Đăng nhập nhiều bước: mật khẩu → (mã ứng dụng | mã OTP email) → vào web. Hoặc đăng nhập thẳng bằng passkey.
import { useState } from 'react';
import { startAuthentication } from '@simplewebauthn/browser';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

type Step = { step: 'password' } | { step: 'otp'; challengeId: string; to: string; minutes: number } | { step: 'totp'; challengeId: string };

export function AuthForm({ mode }: { mode: 'login' | 'setup' }) {
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [step, setStep] = useState<Step>({ step: 'password' });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const canPasskey = typeof window !== 'undefined' && !!window.PublicKeyCredential;

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
    if (step.step === 'password') return;
    await post('/api/auth/verify', { challengeId: step.challengeId, code, kind: step.step });
    window.location.href = '/';
  }); };
  const passkeyLogin = () => void run(async () => {
    const j = await post('/api/auth/passkey', { action: 'login-options' });
    const response = await startAuthentication({ optionsJSON: j.options as Parameters<typeof startAuthentication>[0]['optionsJSON'] });
    await post('/api/auth/passkey', { action: 'login-verify', challengeId: j.challengeId, response });
    window.location.href = '/';
  });

  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/30 p-4">
      <form onSubmit={step.step === 'password' ? submitPassword : submitCode} className="w-full max-w-sm space-y-4 rounded-xl border bg-background p-6 shadow-sm">
        <div className="flex items-center gap-3">
          <img src="/logo.svg" alt="MEGATECH" width={48} height={48} className="size-12 rounded-xl" />
          <div>
            <h1 className="text-xl font-semibold leading-tight">MEGATECH · Tổng hợp POS</h1>
            <p className="text-sm text-muted-foreground">
              {mode === 'setup' ? 'Web chưa có tài khoản. Tạo tài khoản chủ hệ thống đầu tiên.'
                : step.step === 'otp' ? `Đã gửi mã 6 số tới ${step.to}. Mã có hiệu lực ${step.minutes} phút.`
                : step.step === 'totp' ? 'Nhập mã 6 số từ ứng dụng xác thực trên điện thoại.'
                : 'Đăng nhập để xem báo cáo.'}
            </p>
          </div>
        </div>
        {step.step === 'password' ? (
          <>
            {mode === 'setup' && (
              <div className="space-y-1.5"><Label htmlFor="name">Tên hiển thị</Label><Input id="name" value={name} onChange={(e) => setName(e.target.value)} required autoComplete="name" /></div>
            )}
            <div className="space-y-1.5"><Label htmlFor="email">Email</Label><Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="username webauthn" /></div>
            <div className="space-y-1.5">
              <Label htmlFor="password">Mật khẩu{mode === 'setup' ? ' (từ 8 ký tự)' : ''}</Label>
              <Input id="password" type="password" value={password} minLength={mode === 'setup' ? 8 : undefined} onChange={(e) => setPassword(e.target.value)} required autoComplete={mode === 'login' ? 'current-password' : 'new-password'} />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button type="submit" className="w-full" disabled={busy}>{busy ? 'Đang xử lý…' : mode === 'login' ? 'Đăng nhập' : 'Tạo tài khoản chủ hệ thống'}</Button>
            {mode === 'login' && canPasskey && (
              <Button type="button" variant="outline" className="w-full" disabled={busy} onClick={passkeyLogin}>Đăng nhập bằng passkey (Face ID / Touch ID / Windows Hello)</Button>
            )}
          </>
        ) : (
          <>
            <div className="space-y-1.5">
              <Label htmlFor="code">{step.step === 'otp' ? 'Mã trong email' : 'Mã ứng dụng'}</Label>
              <Input id="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9 ]*" maxLength={7} className="text-center text-2xl tracking-[.4em]" value={code} onChange={(e) => setCode(e.target.value)} autoFocus required />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button type="submit" className="w-full" disabled={busy || code.replace(/\D/g, '').length !== 6}>{busy ? 'Đang kiểm tra…' : 'Xác nhận'}</Button>
            <button type="button" className="w-full text-center text-xs text-muted-foreground underline" onClick={() => { setStep({ step: 'password' }); setCode(''); setError(null); }}>Quay lại nhập mật khẩu</button>
          </>
        )}
      </form>
    </main>
  );
}
