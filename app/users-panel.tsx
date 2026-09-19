'use client';

// Tài khoản & phân quyền. Chỉ chủ hệ thống (owner) thấy danh sách và sửa được; người khác chỉ đổi mật khẩu của mình.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ALL_VIEWS, ROLE_LABELS, VIEW_LABELS, isOwner, type Role } from '@/lib/access';
import { POS } from '@/lib/report-model';
import { TEAM_LABELS, type Team } from '@/lib/team';
import type { SessionUser } from '@/lib/auth';

type User = { id: string; email: string; name: string; role: Role; disabled: boolean; createdAt: string; lastLoginAt: string | null; title: string; managerId: string | null; views: string[]; posIds: string[]; team: Team };
type Draft = { email: string; name: string; password: string; role: Role; title: string; managerId: string; views: string[]; posIds: string[]; team: Team };
type SurfaceComponent = React.ComponentType<{ title: string; description?: string; children: React.ReactNode; action?: React.ReactNode }>;

const dateText = (iso: string | null) => iso ? new Date(iso).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' }) : '—';
const VIEW_GROUPS: [string, string[]][] = [
  ['Tổng quan', ['center', 'overview', 'shift']],
  ['CSKH', ['calls', 'care', 'repurchase', 'dormant']],
  ['Sale & vận hành', ['compare', 'batches', 'pipeline']],
  ['Khách hàng & báo cáo', ['customers', 'monthly', 'custom', 'raw-orders']],
];
// Gợi ý sẵn theo vai trò để bấm một phát là ra bộ quyền hợp lý, rồi chỉnh thêm nếu cần.
const PRESETS: Record<Exclude<Role, 'owner'>, string[]> = {
  director: ALL_VIEWS,
  lead: ['center', 'overview', 'shift', 'calls', 'care', 'repurchase', 'dormant', 'compare', 'batches', 'pipeline', 'customers'],
  staff: ['overview', 'calls', 'care', 'customers'],
};
const emptyDraft = (): Draft => ({ email: '', name: '', password: '', role: 'staff', title: '', managerId: '', views: PRESETS.staff, posIds: [], team: 'all' });

export function UsersPanel({ currentUser, Surface }: { currentUser: SessionUser; Surface: SurfaceComponent }) {
  const owner = isOwner(currentUser);
  const [users, setUsers] = useState<User[]>([]);
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);
  const [draft, setDraft] = useState<Draft>(emptyDraft());
  const [editing, setEditing] = useState<string | null>(null); // id đang sửa; null = form tạo mới
  const [pw, setPw] = useState({ current: '', next: '' });
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!owner) return;
    const response = await fetch('/api/users', { cache: 'no-store' });
    if (response.ok) setUsers(await response.json() as User[]);
  }, [owner]);
  useEffect(() => { void load(); }, [load]);

  const call = async (method: string, body?: unknown, query = '') => {
    setBusy(true); setMessage(null);
    try {
      const response = await fetch(`/api/users${query}`, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
      const result = await response.json().catch(() => ({})) as { error?: string };
      setMessage({ text: response.ok ? 'Đã lưu.' : result.error ?? `Lỗi ${response.status}.`, ok: response.ok });
      if (response.ok) await load();
      return response.ok;
    } finally { setBusy(false); }
  };
  const startEdit = (u: User) => { setEditing(u.id); setDraft({ email: u.email, name: u.name, password: '', role: u.role, title: u.title, managerId: u.managerId ?? '', views: u.views, posIds: u.posIds, team: u.team }); window.scrollTo({ top: document.getElementById('user-form')?.offsetTop ?? 0, behavior: 'smooth' }); };
  const cancelEdit = () => { setEditing(null); setDraft(emptyDraft()); };
  const save = async () => {
    const payload = { name: draft.name, role: draft.role, title: draft.title, managerId: draft.managerId, views: draft.views, posIds: draft.posIds, team: draft.team };
    const ok = editing
      ? await call('PUT', { id: editing, ...payload, ...(draft.password ? { password: draft.password } : {}) })
      : await call('POST', { ...payload, email: draft.email, password: draft.password });
    if (ok) cancelEdit();
  };
  const toggle = (list: string[], v: string) => list.includes(v) ? list.filter((x) => x !== v) : [...list, v];
  const managers = useMemo(() => users.filter((u) => u.role !== 'staff' && u.id !== editing), [users, editing]);
  const nameOf = (id: string | null) => users.find((u) => u.id === id)?.name ?? '';
  const editingOwner = !!editing && users.find((u) => u.id === editing)?.role === 'owner';

  return (
    <Surface title="Tài khoản & phân quyền"
      description={owner ? 'Chỉ chủ hệ thống thấy và sửa được phần này. Mỗi tài khoản có vai trò, chức vụ, người quản lý, các trang được xem, POS và nhóm được xem. Trang không cấp thì ẩn hẳn và máy chủ từ chối dữ liệu.' : 'Đổi mật khẩu của bạn. Quyền xem do chủ hệ thống cấp.'}>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
        <div className="space-y-3">
          <h3 className="text-sm font-semibold">Đổi mật khẩu của tôi</h3>
          <Input type="password" placeholder="Mật khẩu hiện tại" value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} autoComplete="current-password" />
          <Input type="password" placeholder="Mật khẩu mới (từ 8 ký tự)" value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} autoComplete="new-password" />
          <Button variant="outline" disabled={pw.next.length < 8} onClick={async () => {
            const response = await fetch('/api/auth/password', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(pw) });
            const result = await response.json() as { error?: string };
            if (response.ok) window.location.href = '/login'; else setMessage({ text: result.error ?? 'Lỗi.', ok: false });
          }}>Đổi mật khẩu và đăng nhập lại</Button>
          <p className="text-xs text-[#7d9184]">Bạn là <strong>{ROLE_LABELS[currentUser.role]}</strong>{currentUser.title ? ` · ${currentUser.title}` : ''}.</p>
        </div>
        {owner && (
          <div id="user-form" className="space-y-3 rounded-xl border p-3">
            <div className="flex items-center justify-between"><h3 className="text-sm font-semibold">{editing ? `Sửa tài khoản · ${draft.email}` : 'Thêm tài khoản'}</h3>{editing && <Button size="sm" variant="ghost" onClick={cancelEdit}>Hủy sửa</Button>}</div>
            <div className="grid gap-2 sm:grid-cols-2">
              <Input placeholder="Tên hiển thị" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
              {!editing && <Input type="email" placeholder="Email (còn dùng được, để nhận mã xác minh)" value={draft.email} onChange={(e) => setDraft({ ...draft, email: e.target.value })} />}
              <Input placeholder="Chức vụ (VD: Trưởng nhóm CSKH)" value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
              <Input type="password" placeholder={editing ? 'Mật khẩu mới (để trống nếu giữ)' : 'Mật khẩu ban đầu (từ 8 ký tự)'} value={draft.password} onChange={(e) => setDraft({ ...draft, password: e.target.value })} autoComplete="new-password" />
              {!editingOwner && <Select value={draft.role} items={{ director: ROLE_LABELS.director, lead: ROLE_LABELS.lead, staff: ROLE_LABELS.staff }} onValueChange={(v) => { const role = v as Exclude<Role, 'owner'>; setDraft({ ...draft, role, views: PRESETS[role] }); }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="director">Giám đốc</SelectItem><SelectItem value="lead">Trưởng nhóm</SelectItem><SelectItem value="staff">Nhân viên</SelectItem></SelectContent>
              </Select>}
              <Select value={draft.managerId || '__none'} items={{ __none: 'Không có người quản lý', ...Object.fromEntries(managers.map((m) => [m.id, `${m.name} (${ROLE_LABELS[m.role]})`])) }} onValueChange={(v) => setDraft({ ...draft, managerId: v === '__none' ? '' : String(v) })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="__none">Không có người quản lý</SelectItem>{managers.map((m) => <SelectItem key={m.id} value={m.id}>{m.name} ({ROLE_LABELS[m.role]})</SelectItem>)}</SelectContent>
              </Select>
            </div>
            {!editingOwner && (
              <>
                <div>
                  <div className="mb-1 flex items-center justify-between text-xs font-semibold text-[#62796d]"><span>Trang được xem</span><span className="space-x-2 font-normal"><button type="button" className="underline" onClick={() => setDraft({ ...draft, views: ALL_VIEWS })}>Tất cả</button><button type="button" className="underline" onClick={() => setDraft({ ...draft, views: [] })}>Bỏ hết</button></span></div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {VIEW_GROUPS.map(([g, ids]) => (
                      <div key={g} className="rounded-lg border p-2">
                        <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-[#7d9184]">{g}</div>
                        {ids.map((id) => <label key={id} className="flex items-center gap-2 py-0.5 text-sm"><input type="checkbox" checked={draft.views.includes(id)} onChange={() => setDraft({ ...draft, views: toggle(draft.views, id) })} />{VIEW_LABELS[id]}</label>)}
                      </div>
                    ))}
                  </div>
                  <p className="mt-1 text-xs text-[#7d9184]">Cấu hình & kết nối chỉ chủ hệ thống vào được, không cấp cho ai.</p>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <div className="mb-1 text-xs font-semibold text-[#62796d]">POS được xem <span className="font-normal">(không chọn = tất cả)</span></div>
                    <div className="flex flex-wrap gap-x-3 gap-y-1">{POS.map((p) => <label key={p.id} className="flex items-center gap-1.5 text-sm"><input type="checkbox" checked={draft.posIds.includes(p.id)} onChange={() => setDraft({ ...draft, posIds: toggle(draft.posIds, p.id) })} />{p.name}</label>)}</div>
                  </div>
                  <div>
                    <div className="mb-1 text-xs font-semibold text-[#62796d]">Nhóm được xem</div>
                    <Select value={draft.team} items={TEAM_LABELS} onValueChange={(v) => setDraft({ ...draft, team: v as Team })}>
                      <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
                      <SelectContent>{(Object.keys(TEAM_LABELS) as Team[]).map((t) => <SelectItem key={t} value={t}>{TEAM_LABELS[t]}</SelectItem>)}</SelectContent>
                    </Select>
                    <p className="mt-1 text-xs text-[#7d9184]">Chọn Sale hoặc CSKH thì nút đổi nhóm trên thanh trên bị khóa theo.</p>
                  </div>
                </div>
              </>
            )}
            <div className="flex items-center gap-2">
              <Button disabled={busy || !draft.name || (!editing && (!draft.email || draft.password.length < 8))} onClick={() => void save()}>{editing ? 'Lưu thay đổi' : 'Tạo tài khoản'}</Button>
              {message && <span className={`text-sm ${message.ok ? 'text-[#17684b]' : 'text-[#c8403f]'}`}>{message.text}</span>}
            </div>
          </div>
        )}
      </div>
      {owner && users.length > 0 && (
        <div className="mt-5 overflow-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-[#7d9184]"><tr><th className="py-2">Tên</th><th>Email</th><th>Vai trò · chức vụ</th><th>Quản lý</th><th>Trang</th><th>POS</th><th>Nhóm</th><th>Đăng nhập gần nhất</th><th /></tr></thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className={`border-t ${editing === u.id ? 'bg-[#eef7f1]' : ''}`}>
                  <td className="py-2 font-medium">{u.name}{u.disabled && <span className="ml-2 text-xs text-destructive">đã khóa</span>}{u.id === currentUser.userId && <span className="ml-2 text-xs text-[#7d9184]">(bạn)</span>}</td>
                  <td className="text-xs">{u.email}</td>
                  <td className="text-xs">{ROLE_LABELS[u.role]}{u.title ? ` · ${u.title}` : ''}</td>
                  <td className="text-xs">{nameOf(u.managerId) || '—'}</td>
                  <td className="text-xs" title={u.role === 'owner' ? 'Mọi trang' : u.views.map((v) => VIEW_LABELS[v]).join(', ')}>{u.role === 'owner' ? 'Tất cả' : `${u.views.length}/${ALL_VIEWS.length}`}</td>
                  <td className="text-xs">{u.role === 'owner' || !u.posIds.length ? 'Tất cả' : u.posIds.map((id) => POS.find((p) => p.id === id)?.name ?? id).join(', ')}</td>
                  <td className="text-xs">{u.role === 'owner' ? 'Tất cả' : TEAM_LABELS[u.team]}</td>
                  <td className="text-xs">{dateText(u.lastLoginAt)}</td>
                  <td className="space-x-1 text-right">
                    <Button size="sm" variant="outline" onClick={() => startEdit(u)}>Sửa</Button>
                    {u.id !== currentUser.userId && u.role !== 'owner' && (
                      <>
                        <Button size="sm" variant="outline" disabled={busy} onClick={() => void call('PUT', { id: u.id, disabled: !u.disabled })}>{u.disabled ? 'Mở khóa' : 'Khóa'}</Button>
                        <Button size="sm" variant="destructive" disabled={busy} onClick={() => { if (window.confirm(`Xóa tài khoản ${u.email}?`)) void call('DELETE', undefined, `?id=${u.id}`); }}>Xóa</Button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Surface>
  );
}
