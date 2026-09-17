'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export function AuthForm({ mode }: { mode: 'login' | 'setup' }) {
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(mode === 'login' ? '/api/auth/login' : '/api/auth/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(mode === 'login' ? { email, password } : { email, name, password }),
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error ?? 'Không đăng nhập được.');
      window.location.href = '/';
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Không đăng nhập được.');
      setBusy(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/30 p-4">
      <form onSubmit={submit} className="w-full max-w-sm space-y-4 rounded-xl border bg-background p-6 shadow-sm">
        <div>
          <h1 className="text-xl font-semibold">Tổng hợp POS</h1>
          <p className="text-sm text-muted-foreground">
            {mode === 'login'
              ? 'Đăng nhập để xem báo cáo.'
              : 'Web chưa có tài khoản. Tạo tài khoản quản trị đầu tiên.'}
          </p>
        </div>
        {mode === 'setup' && (
          <div className="space-y-1.5">
            <Label htmlFor="name">Tên hiển thị</Label>
            <Input id="name" value={name} onChange={(e) => setName(e.target.value)} required autoComplete="name" />
          </div>
        )}
        <div className="space-y-1.5">
          <Label htmlFor="email">Email</Label>
          <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="username" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="password">Mật khẩu{mode === 'setup' ? ' (từ 8 ký tự)' : ''}</Label>
          <Input
            id="password" type="password" value={password} minLength={mode === 'setup' ? 8 : undefined}
            onChange={(e) => setPassword(e.target.value)} required
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
          />
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <Button type="submit" className="w-full" disabled={busy}>
          {busy ? 'Đang xử lý…' : mode === 'login' ? 'Đăng nhập' : 'Tạo tài khoản quản trị'}
        </Button>
      </form>
    </main>
  );
}
