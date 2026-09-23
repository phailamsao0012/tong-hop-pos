'use client';

// Tài khoản & phân quyền. Chỉ chủ hệ thống (owner) thấy danh sách và sửa được; người khác chỉ đổi mật khẩu của mình.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { KeyRound, Lock, LockOpen, Pencil, Trash2, UserPlus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ALL_VIEWS, ROLE_LABELS, VIEW_LABELS, isOwner, type Role } from '@/lib/access';
import { POS } from '@/lib/report-model';
import { TEAM_LABELS, type Team } from '@/lib/team';
import type { SessionUser } from '@/lib/auth';
import { StatusChip, TableWrap, dt, scrollToEl, toast } from './ui-kit';

type User = { id: string; email: string; name: string; role: Role; disabled: boolean; createdAt: string; lastLoginAt: string | null; title: string; managerId: string | null; views: string[]; posIds: string[]; team: Team };
type Draft = { email: string; name: string; password: string; role: Role; title: string; managerId: string; views: string[]; posIds: string[]; team: Team };
type SurfaceComponent = React.ComponentType<{ title: string; description?: string; children: React.ReactNode; action?: React.ReactNode }>;

const VIEW_GROUPS: [string, string[]][] = [
  ['Tổng quan', ['center', 'overview', 'shift']],
  ['CSKH', ['calls', 'care', 'repurchase', 'dormant']],
  ['Marketing', ['marketing']],
  ['Sale & vận hành', ['compare', 'batches', 'pipeline']],
  ['Khách hàng & báo cáo', ['customers', 'monthly', 'custom', 'raw-orders']],
];
// Gợi ý sẵn theo vai trò để bấm một phát là ra bộ quyền hợp lý, rồi chỉnh thêm nếu cần.
const PRESETS: Record<Exclude<Role, 'owner'>, string[]> = {
  director: ALL_VIEWS,
  lead: ['center', 'overview', 'shift', 'calls', 'care', 'repurchase', 'dormant', 'marketing', 'compare', 'batches', 'pipeline', 'customers'],
  staff: ['overview', 'calls', 'care', 'customers'],
};
const ROLE_TONE: Record<Role, 'green' | 'blue' | 'purple' | 'gray'> = { owner: 'green', director: 'purple', lead: 'blue', staff: 'gray' };
const emptyDraft = (): Draft => ({ email: '', name: '', password: '', role: 'staff', title: '', managerId: '', views: PRESETS.staff, posIds: [], team: 'all' });
const CHECK = 'size-3.5 shrink-0 cursor-pointer rounded-[4px] border-line-2 accent-primary';
const FIELD_LABEL = 'mb-1 block text-xs font-semibold text-ink-2';

export function UsersPanel({ currentUser, Surface }: { currentUser: SessionUser; Surface: SurfaceComponent }) {
  const owner = isOwner(currentUser);
  const [users, setUsers] = useState<User[]>([]);
  const [draft, setDraft] = useState<Draft>(emptyDraft());
  const [editing, setEditing] = useState<string | null>(null); // id đang sửa; null = form tạo mới
  const [pw, setPw] = useState({ current: '', next: '' });
  const [busy, setBusy] = useState(false);
  const [pwBusy, setPwBusy] = useState(false);

  const load = useCallback(async () => {
    if (!owner) return;
    try {
      const response = await fetch('/api/users', { cache: 'no-store' });
      if (response.ok) setUsers(await response.json() as User[]);
      else toast('Không tải được danh sách tài khoản.', { kind: 'error' });
    } catch { toast('Không tải được danh sách tài khoản.', { kind: 'error' }); }
  }, [owner]);
  useEffect(() => { void load(); }, [load]);

  // Kết quả lưu / khóa / xóa hiện bằng toast (tự tắt, có nút đóng) thay cho dòng chữ đứng mãi dưới form.
  const call = async (method: string, body?: unknown, query = '', okText = 'Đã lưu.') => {
    setBusy(true);
    try {
      const response = await fetch(`/api/users${query}`, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
      const result = await response.json().catch(() => ({})) as { error?: string };
      if (response.ok) { toast(okText); await load(); } else toast(result.error ?? `Lỗi ${response.status}.`, { kind: 'error' });
      return response.ok;
    } catch (e) { toast(e instanceof Error ? e.message : 'Không gửi được yêu cầu.', { kind: 'error' }); return false; }
    finally { setBusy(false); }
  };
  const startEdit = (u: User) => { setEditing(u.id); setDraft({ email: u.email, name: u.name, password: '', role: u.role, title: u.title, managerId: u.managerId ?? '', views: u.views, posIds: u.posIds, team: u.team }); scrollToEl(document.getElementById('user-form'), { block: 'start' }); };
  const cancelEdit = () => { setEditing(null); setDraft(emptyDraft()); };
  const save = async () => {
    const payload = { name: draft.name, role: draft.role, title: draft.title, managerId: draft.managerId, views: draft.views, posIds: draft.posIds, team: draft.team };
    const ok = editing
      ? await call('PUT', { id: editing, ...payload, ...(draft.password ? { password: draft.password } : {}) }, '', `Đã lưu tài khoản ${draft.name || draft.email}.`)
      : await call('POST', { ...payload, email: draft.email, password: draft.password }, '', `Đã tạo tài khoản ${draft.email}.`);
    if (ok) cancelEdit();
  };
  const changePassword = async () => {
    setPwBusy(true);
    try {
      const response = await fetch('/api/auth/password', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(pw) });
      const result = await response.json().catch(() => ({})) as { error?: string };
      if (response.ok) { toast('Đã đổi mật khẩu. Đang chuyển tới trang đăng nhập…'); window.setTimeout(() => { window.location.href = '/login'; }, 600); }
      else toast(result.error ?? 'Không đổi được mật khẩu.', { kind: 'error' });
    } catch { toast('Không đổi được mật khẩu.', { kind: 'error' }); }
    finally { setPwBusy(false); }
  };
  const toggle = (list: string[], v: string) => list.includes(v) ? list.filter((x) => x !== v) : [...list, v];
  const managers = useMemo(() => users.filter((u) => u.role !== 'staff' && u.id !== editing), [users, editing]);
  const nameOf = (id: string | null) => users.find((u) => u.id === id)?.name ?? '';
  const editingOwner = !!editing && users.find((u) => u.id === editing)?.role === 'owner';

  return (
    <Surface title="Tài khoản & phân quyền"
      description={owner ? 'Chỉ chủ hệ thống thấy và sửa được phần này. Mỗi tài khoản có vai trò, chức vụ, người quản lý, các trang được xem, POS và nhóm được xem. Trang không cấp thì ẩn hẳn và máy chủ từ chối dữ liệu.' : 'Đổi mật khẩu của bạn. Quyền xem do chủ hệ thống cấp.'}>
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
        <form className="space-y-3 rounded-xl bg-surface-2 p-4" onSubmit={(e) => { e.preventDefault(); void changePassword(); }}>
          <h3 className="flex items-center gap-1.5 text-[13px] font-semibold text-ink"><KeyRound size={14} className="text-ink-3" />Đổi mật khẩu của tôi</h3>
          <label className="block"><span className={FIELD_LABEL}>Mật khẩu hiện tại</span><Input type="password" placeholder="Mật khẩu hiện tại" value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} autoComplete="current-password" className="bg-surface" /></label>
          <label className="block"><span className={FIELD_LABEL}>Mật khẩu mới</span><Input type="password" placeholder="Từ 8 ký tự" value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} autoComplete="new-password" className="bg-surface" /></label>
          <Button type="submit" variant="outline" disabled={pw.next.length < 8 || !pw.current || pwBusy}>{pwBusy ? 'Đang đổi…' : 'Đổi mật khẩu và đăng nhập lại'}</Button>
          <p className="text-xs text-ink-3">Bạn là <strong className="text-ink">{ROLE_LABELS[currentUser.role]}</strong>{currentUser.title ? ` · ${currentUser.title}` : ''}.</p>
        </form>
        {owner && (
          <form id="user-form" className={`scroll-mt-20 space-y-3 rounded-xl border p-4 transition-[border-color,box-shadow] duration-[var(--dur)] ease-[var(--ease)] ${editing ? 'border-primary/40 shadow-[0_0_0_1px_var(--ring)]' : 'border-line'}`} onSubmit={(e) => { e.preventDefault(); void save(); }}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="flex min-w-0 items-center gap-1.5 text-[13px] font-semibold text-ink">{editing ? <Pencil size={14} className="text-ink-3" /> : <UserPlus size={14} className="text-ink-3" />}<span className="truncate">{editing ? `Sửa tài khoản · ${draft.email}` : 'Thêm tài khoản'}</span></h3>
              {editing && <Button type="button" size="sm" variant="ghost" onClick={cancelEdit}><X size={13} />Hủy sửa</Button>}
            </div>
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              <label className="block"><span className={FIELD_LABEL}>Tên hiển thị</span><Input placeholder="VD: Nguyễn Văn A" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} required /></label>
              {!editing && <label className="block"><span className={FIELD_LABEL}>Email</span><Input type="email" placeholder="Còn dùng được, để nhận mã xác minh" value={draft.email} onChange={(e) => setDraft({ ...draft, email: e.target.value })} required /></label>}
              <label className="block"><span className={FIELD_LABEL}>Chức vụ</span><Input placeholder="VD: Trưởng nhóm CSKH" value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} /></label>
              <label className="block"><span className={FIELD_LABEL}>{editing ? 'Mật khẩu mới' : 'Mật khẩu ban đầu'}</span><Input type="password" placeholder={editing ? 'Để trống nếu giữ nguyên' : 'Từ 8 ký tự'} value={draft.password} onChange={(e) => setDraft({ ...draft, password: e.target.value })} autoComplete="new-password" /></label>
              {!editingOwner && (
                <div><span className={FIELD_LABEL}>Vai trò</span>
                  <Select value={draft.role} items={{ director: ROLE_LABELS.director, lead: ROLE_LABELS.lead, staff: ROLE_LABELS.staff }} onValueChange={(v) => { const role = v as Exclude<Role, 'owner'>; setDraft({ ...draft, role, views: PRESETS[role] }); }}>
                    <SelectTrigger className="w-full" aria-label="Vai trò"><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value="director">Giám đốc</SelectItem><SelectItem value="lead">Trưởng nhóm</SelectItem><SelectItem value="staff">Nhân viên</SelectItem></SelectContent>
                  </Select>
                </div>
              )}
              <div><span className={FIELD_LABEL}>Người quản lý</span>
                <Select value={draft.managerId || '__none'} items={{ __none: 'Không có người quản lý', ...Object.fromEntries(managers.map((m) => [m.id, `${m.name} (${ROLE_LABELS[m.role]})`])) }} onValueChange={(v) => setDraft({ ...draft, managerId: v === '__none' ? '' : String(v) })}>
                  <SelectTrigger className="w-full" aria-label="Người quản lý"><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="__none">Không có người quản lý</SelectItem>{managers.map((m) => <SelectItem key={m.id} value={m.id}>{m.name} ({ROLE_LABELS[m.role]})</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            {!editingOwner && (
              <>
                <fieldset>
                  <div className="mb-1.5 flex items-center justify-between text-xs font-semibold text-ink-2"><legend>Trang được xem <span className="num text-ink-3">({draft.views.length}/{ALL_VIEWS.length})</span></legend><span className="flex gap-1 font-normal"><button type="button" className="link text-xs" onClick={() => setDraft({ ...draft, views: ALL_VIEWS })}>Tất cả</button><span className="text-ink-4">·</span><button type="button" className="link text-xs" onClick={() => setDraft({ ...draft, views: [] })}>Bỏ hết</button></span></div>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {VIEW_GROUPS.map(([g, ids]) => (
                      <div key={g} className="rounded-lg bg-surface-2 p-2.5">
                        <div className="mb-1 text-[10.5px] font-semibold uppercase tracking-[.07em] text-ink-3">{g}</div>
                        {ids.map((id) => <label key={id} className="flex cursor-pointer items-center gap-2 rounded-md px-1 py-1 text-[13px] transition-colors duration-[var(--dur)] hover:bg-surface-3"><input type="checkbox" className={CHECK} checked={draft.views.includes(id)} onChange={() => setDraft({ ...draft, views: toggle(draft.views, id) })} />{VIEW_LABELS[id]}</label>)}
                      </div>
                    ))}
                  </div>
                  <p className="mt-1.5 text-xs text-ink-3">Cấu hình & kết nối chỉ chủ hệ thống vào được, không cấp cho ai.</p>
                </fieldset>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <fieldset>
                    <legend className="mb-1 text-xs font-semibold text-ink-2">POS được xem <span className="font-normal text-ink-3">(không chọn = tất cả)</span></legend>
                    <div className="flex flex-wrap gap-x-3 gap-y-1">{POS.map((p) => <label key={p.id} className="flex cursor-pointer items-center gap-1.5 rounded-md px-1 py-0.5 text-[13px] transition-colors duration-[var(--dur)] hover:bg-surface-2"><input type="checkbox" className={CHECK} checked={draft.posIds.includes(p.id)} onChange={() => setDraft({ ...draft, posIds: toggle(draft.posIds, p.id) })} />{p.name}</label>)}</div>
                  </fieldset>
                  <div>
                    <span className={FIELD_LABEL}>Nhóm được xem</span>
                    <Select value={draft.team} items={TEAM_LABELS} onValueChange={(v) => setDraft({ ...draft, team: v as Team })}>
                      <SelectTrigger className="w-48" aria-label="Nhóm được xem"><SelectValue /></SelectTrigger>
                      <SelectContent>{(Object.keys(TEAM_LABELS) as Team[]).map((t) => <SelectItem key={t} value={t}>{TEAM_LABELS[t]}</SelectItem>)}</SelectContent>
                    </Select>
                    <p className="mt-1 text-xs text-ink-3">Chọn Sale hoặc CSKH thì nút đổi nhóm trên thanh trên bị khóa theo.</p>
                  </div>
                </div>
              </>
            )}
            <div className="flex flex-wrap items-center gap-2">
              <Button type="submit" disabled={busy || !draft.name || (!editing && (!draft.email || draft.password.length < 8))}>{busy ? 'Đang lưu…' : editing ? 'Lưu thay đổi' : 'Tạo tài khoản'}</Button>
              {!editing && draft.password.length > 0 && draft.password.length < 8 && <span className="text-xs text-warn">Mật khẩu cần từ 8 ký tự.</span>}
            </div>
          </form>
        )}
      </div>
      {owner && users.length > 0 && (
        <TableWrap className="mt-5" minWidth={960}>
          <table className="tbl">
            <thead><tr><th>Tên</th><th>Email</th><th>Vai trò · chức vụ</th><th>Quản lý</th><th className="n">Trang</th><th>POS</th><th>Nhóm</th><th>Đăng nhập gần nhất</th><th className="n">Thao tác</th></tr></thead>
            <tbody>
              {users.map((u) => {
                const me = u.id === currentUser.userId;
                return (
                  <tr key={u.id} className={editing === u.id ? '[&>td]:bg-tint-2 [&>td:first-child]:shadow-[inset_2px_0_0_var(--primary)]' : ''}>
                    <td className="font-medium">{u.name}{u.disabled && <StatusChip tone="red" className="ml-2">đã khóa</StatusChip>}{me && <span className="ml-2 text-xs text-ink-3">(bạn)</span>}</td>
                    <td className="mut text-xs">{u.email}</td>
                    <td className="text-xs"><StatusChip tone={ROLE_TONE[u.role]}>{ROLE_LABELS[u.role]}</StatusChip>{u.title ? <span className="ml-1.5 text-ink-2">{u.title}</span> : ''}</td>
                    <td className="mut text-xs">{nameOf(u.managerId) || '—'}</td>
                    <td className="n text-xs" title={u.role === 'owner' ? 'Mọi trang' : u.views.map((v) => VIEW_LABELS[v]).join(', ')}>{u.role === 'owner' ? 'Tất cả' : `${u.views.length}/${ALL_VIEWS.length}`}</td>
                    <td className="max-w-[220px] truncate text-xs" title={u.role === 'owner' || !u.posIds.length ? 'Tất cả POS' : u.posIds.map((id) => POS.find((p) => p.id === id)?.name ?? id).join(', ')}>{u.role === 'owner' || !u.posIds.length ? 'Tất cả' : u.posIds.map((id) => POS.find((p) => p.id === id)?.name ?? id).join(', ')}</td>
                    <td className="text-xs">{u.role === 'owner' ? 'Tất cả' : TEAM_LABELS[u.team]}</td>
                    <td className="num mut text-xs">{dt(u.lastLoginAt, true)}</td>
                    <td className="n">
                      <span className="inline-flex items-center justify-end gap-1">
                        <Button size="sm" variant="outline" onClick={() => startEdit(u)} aria-label={`Sửa ${u.name}`}><Pencil size={12} />Sửa</Button>
                        {!me && u.role !== 'owner' && (
                          <>
                            <Button size="sm" variant="outline" disabled={busy} onClick={() => void call('PUT', { id: u.id, disabled: !u.disabled }, '', u.disabled ? `Đã mở khóa ${u.name}.` : `Đã khóa ${u.name}.`)} aria-label={`${u.disabled ? 'Mở khóa' : 'Khóa'} ${u.name}`}>{u.disabled ? <LockOpen size={12} /> : <Lock size={12} />}{u.disabled ? 'Mở khóa' : 'Khóa'}</Button>
                            <Button size="sm" variant="destructive" disabled={busy} onClick={() => { if (window.confirm(`Xóa tài khoản ${u.email}?`)) void call('DELETE', undefined, `?id=${u.id}`, `Đã xóa ${u.email}.`); }} aria-label={`Xóa ${u.name}`}><Trash2 size={12} />Xóa</Button>
                          </>
                        )}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </TableWrap>
      )}
    </Surface>
  );
}
