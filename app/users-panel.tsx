'use client';

import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { SessionUser } from '@/lib/auth';

type User = {
  id: string; email: string; name: string; role: string;
  disabled: boolean; createdAt: string; lastLoginAt: string | null;
};
type SurfaceComponent = React.ComponentType<{
  title: string; description?: string; children: React.ReactNode; action?: React.ReactNode;
}>;

const dateText = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' }) : '—';

export function UsersPanel({ currentUser, Surface }: { currentUser: SessionUser; Surface: SurfaceComponent }) {
  const isAdmin = currentUser.role === 'admin';
  const [users, setUsers] = useState<User[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [form, setForm] = useState({ email: '', name: '', password: '', role: 'member' });
  const [pw, setPw] = useState({ current: '', next: '' });

  const load = useCallback(async () => {
    if (!isAdmin) return;
    const response = await fetch('/api/users', { cache: 'no-store' });
    if (response.ok) setUsers(await response.json() as User[]);
  }, [isAdmin]);
  useEffect(() => { void load(); }, [load]);

  const call = async (method: string, body?: unknown, query = '') => {
    setMessage(null);
    const response = await fetch(`/api/users${query}`, {
      method, headers: { 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
    const result = await response.json() as { error?: string };
    setMessage(response.ok ? 'Đã lưu.' : result.error ?? 'Lỗi.');
    if (response.ok) await load();
    return response.ok;
  };

  return (
    <Surface
      title="Tài khoản đăng nhập"
      description={isAdmin
        ? 'Tối đa 20 tài khoản. Quản trị viên được tạo, khóa và đặt lại mật khẩu; thành viên chỉ xem báo cáo.'
        : 'Đổi mật khẩu của bạn. Liên hệ quản trị viên để thêm tài khoản.'}
    >
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-3">
          <h3 className="text-sm font-semibold">Đổi mật khẩu của tôi</h3>
          <Input type="password" placeholder="Mật khẩu hiện tại" value={pw.current}
            onChange={(e) => setPw({ ...pw, current: e.target.value })} autoComplete="current-password" />
          <Input type="password" placeholder="Mật khẩu mới (từ 8 ký tự)" value={pw.next}
            onChange={(e) => setPw({ ...pw, next: e.target.value })} autoComplete="new-password" />
          <Button variant="outline" disabled={pw.next.length < 8} onClick={async () => {
            const response = await fetch('/api/auth/password', {
              method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(pw),
            });
            const result = await response.json() as { error?: string };
            if (response.ok) window.location.href = '/login';
            else setMessage(result.error ?? 'Lỗi.');
          }}>Đổi mật khẩu và đăng nhập lại</Button>
        </div>
        {isAdmin && (
          <div className="space-y-3">
            <h3 className="text-sm font-semibold">Thêm tài khoản</h3>
            <Input placeholder="Tên hiển thị" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            <Input type="email" placeholder="Email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            <Input type="password" placeholder="Mật khẩu ban đầu (từ 8 ký tự)" value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })} autoComplete="new-password" />
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={form.role === 'admin'}
                onChange={(e) => setForm({ ...form, role: e.target.checked ? 'admin' : 'member' })} />
              Quản trị viên
            </label>
            <Button onClick={async () => {
              if (await call('POST', form)) setForm({ email: '', name: '', password: '', role: 'member' });
            }}>Tạo tài khoản</Button>
          </div>
        )}
      </div>
      {message && <p className="mt-3 text-sm text-[#547467]">{message}</p>}
      {isAdmin && users.length > 0 && (
        <table className="mt-5 w-full text-sm">
          <thead className="text-left text-xs text-[#7d9184]">
            <tr><th className="py-2">Tên</th><th>Email</th><th>Quyền</th><th>Đăng nhập gần nhất</th><th /></tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="border-t">
                <td className="py-2">{u.name}{u.disabled && <span className="ml-2 text-xs text-destructive">đã khóa</span>}</td>
                <td>{u.email}</td>
                <td>{u.role === 'admin' ? 'Quản trị' : 'Thành viên'}</td>
                <td>{dateText(u.lastLoginAt)}</td>
                <td className="space-x-1 text-right">
                  {u.id !== currentUser.userId && (
                    <>
                      <Button size="sm" variant="outline" onClick={() =>
                        call('PUT', { id: u.id, role: u.role === 'admin' ? 'member' : 'admin' })}>
                        {u.role === 'admin' ? 'Hạ quyền' : 'Cấp quản trị'}
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => call('PUT', { id: u.id, disabled: !u.disabled })}>
                        {u.disabled ? 'Mở khóa' : 'Khóa'}
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => {
                        const password = window.prompt(`Mật khẩu mới cho ${u.email} (từ 8 ký tự):`);
                        if (password) void call('PUT', { id: u.id, password });
                      }}>Đặt lại mật khẩu</Button>
                      <Button size="sm" variant="destructive" onClick={() => {
                        if (window.confirm(`Xóa tài khoản ${u.email}?`)) void call('DELETE', undefined, `?id=${u.id}`);
                      }}>Xóa</Button>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Surface>
  );
}
