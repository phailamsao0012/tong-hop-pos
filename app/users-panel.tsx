'use client';

// Tài khoản & phân quyền. Chỉ chủ hệ thống (owner) thấy danh sách và sửa được; người khác chỉ đổi mật khẩu của mình.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Eye, KeyRound, Lock, LockOpen, Pencil, Trash2, UserPlus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ALL_VIEWS, ROLE_LABELS, VIEW_LABELS, isOwner, type Role } from '@/lib/auth/access';
import { LEVEL_DEPTS, LEVEL_LABELS, levelsFromViews, teamForLevels, viewsForLevels, type AccessLevel, type DeptKey, type DeptLevels } from '@/lib/auth/access-levels';
import { POS } from '@/lib/shared/report-model';
import { TEAM_LABELS, type Team } from '@/lib/teams/team';
import { ownerField, teamsOwnedBy, teamsWithPerson, type PosPerson, type TeamChoice } from '@/lib/teams/account-from-pos';
import type { SessionUser } from '@/lib/auth/auth';
import type { TeamZaloState } from '@/lib/zalo/team-link';
import { Th, StatusChip, TableWrap, dt, scrollToEl, toast } from './ui-kit';
import { ZaloButton, ZaloLinkGuide } from './zalo-link-guide';

type User = { employeeId: string | null; id: string; email: string; name: string; role: Role; primary?: boolean; disabled: boolean; createdAt: string; lastLoginAt: string | null; title: string; managerId: string | null; views: string[]; posIds: string[]; team: Team };
type Draft = { posUserId: string; manageTeams: string[]; employeeId: string; email: string; name: string; password: string; role: Role; title: string; managerId: string; views: string[]; posIds: string[]; team: Team };
type SurfaceComponent = React.ComponentType<{ title: string; description?: string; children: React.ReactNode; action?: React.ReactNode }>;

const VIEW_GROUPS: [string, string[]][] = [
  ['Tổng quan', ['center', 'overview', 'shift']],
  ['CSKH', ['calls', 'care', 'repurchase', 'dormant']],
  ['Marketing', ['marketing']],
  ['Sale & vận hành', ['compare', 'batches', 'pipeline', 'van-don']],
  ['Khách hàng & báo cáo', ['customers', 'monthly', 'custom', 'uncounted', 'raw-orders']],
];
// Gợi ý sẵn theo vai trò để bấm một phát là ra bộ quyền hợp lý, rồi chỉnh thêm nếu cần.
const PRESETS: Record<Role, string[]> = {
  owner: ALL_VIEWS,
  director: ALL_VIEWS,
  lead: ['center', 'overview', 'shift', 'calls', 'care', 'repurchase', 'dormant', 'marketing', 'compare', 'batches', 'pipeline', 'customers'],
  mentor: ['mentor'],
  staff: ['overview', 'calls', 'care', 'customers'],
};
const listedViews = new Set(VIEW_GROUPS.flatMap(([, ids]) => ids));
VIEW_GROUPS.push(['Trang khác', ALL_VIEWS.filter((id) => !listedViews.has(id))]);
const ROLE_TONE: Record<Role, 'green' | 'blue' | 'purple' | 'gray'> = { owner: 'green', director: 'purple', lead: 'blue', mentor: 'blue', staff: 'gray' };
const emptyDraft = (): Draft => ({ posUserId: '', manageTeams: [], employeeId: '', email: '', name: '', password: '', role: 'staff', title: '', managerId: '', views: PRESETS.staff, posIds: [], team: 'all' });
const CHECK = 'size-3.5 shrink-0 cursor-pointer rounded-[4px] border-line-2 accent-primary';
const FIELD_LABEL = 'mb-1 block text-xs font-semibold text-ink-2';

export function UsersPanel({ currentUser, Surface }: { currentUser: SessionUser; Surface: SurfaceComponent }) {
  const owner = isOwner(currentUser);
  const [employees, setEmployees] = useState<{ id: string; code: string; name: string }[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  // Người trên POS và team đã chia, cho ô "Chọn người trên POS" và "Team người này quản lý" (03/11/2026).
  const [posData, setPosData] = useState<{ people: PosPerson[]; teams: TeamChoice[] } | null>(null);
  const [draft, setDraft] = useState<Draft>(emptyDraft());
  const [levels, setLevels] = useState<DeptLevels>(() => levelsFromViews(PRESETS.staff, 'all'));
  const [editing, setEditing] = useState<string | null>(null); // id đang sửa; null = form tạo mới
  const [pw, setPw] = useState({ current: '', next: '' });
  const [busy, setBusy] = useState(false);
  const [pwBusy, setPwBusy] = useState(false);
  // Nối Zalo ngay ở danh sách tài khoản (anh Vũ 07/11/2026).
  const [zalo, setZalo] = useState<TeamZaloState[]>([]);
  const [zaloCode, setZaloCode] = useState<Record<string, string>>({});
  const [guide, setGuide] = useState<{ userId: string; code: string } | null>(null);
  const demo = typeof location !== 'undefined' && (location.hostname.startsWith('demo.') || location.hostname === 'localhost');

  const load = useCallback(async () => {
    if (!owner) return;
    try {
      const response = await fetch('/api/users', { cache: 'no-store' });
      if (response.ok) {
        setUsers(await response.json() as User[]);
        const profiles = await fetch('/api/users?employees=1', { cache: 'no-store' });
        if (profiles.ok) setEmployees(await profiles.json() as typeof employees);
        const pos = await fetch('/api/users?pos-people=1', { cache: 'no-store' });
        if (pos.ok) setPosData(await pos.json() as { people: PosPerson[]; teams: TeamChoice[] });
        const z = await fetch('/api/users/zalo', { cache: 'no-store' });
        if (z.ok) setZalo(((await z.json()) as { zalo: TeamZaloState[] }).zalo);
      }
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
  const startEdit = (u: User) => { setLevels(levelsFromViews(u.views, u.team)); setEditing(u.id); setDraft({ posUserId: '', manageTeams: teamsOwnedBy(posData?.teams ?? [], u.id), employeeId: u.employeeId ?? '', email: u.email, name: u.name, password: '', role: u.role, title: u.title, managerId: u.managerId ?? '', views: u.views, posIds: u.posIds, team: u.team }); scrollToEl(document.getElementById('user-form'), { block: 'start' }); };
  const cancelEdit = () => { setLevels(levelsFromViews(PRESETS.staff, 'all')); setEditing(null); setDraft(emptyDraft()); };
  const save = async () => {
    const before = editing ? users.find((u) => u.id === editing)?.role : undefined;
    if (draft.role === 'owner' && before !== 'owner' && !window.confirm(`Cấp quyền CHỦ HỆ THỐNG cho ${draft.name || draft.email}? Người này xem và sửa được mọi thứ (mục tiêu, cấu hình, tài khoản…), trừ tài khoản chủ hệ thống của bạn. Chỉ bạn bỏ được quyền này.`)) return;
    if (before === 'owner' && draft.role !== 'owner' && !window.confirm(`Bỏ quyền chủ hệ thống của ${draft.name || draft.email}? Người này sẽ bị đăng xuất.`)) return;
    const payload = { employeeId: draft.employeeId, name: draft.name, role: draft.role, title: draft.title, managerId: draft.managerId, views: draft.views, posIds: draft.posIds, team: draft.team, ...(posData ? { manageTeams: ownerField(draft.role) ? draft.manageTeams : [] } : {}) };
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
  const changeLevels = (key: DeptKey, level: AccessLevel) => {
    const next = { ...levels, [key]: level };
    const governed = new Set(LEVEL_DEPTS.flatMap((dept) => dept.sections.flatMap((section) => section.tabs.map(([id]) => id))));
    setLevels(next);
    setDraft({ ...draft, views: [...new Set([...draft.views.filter((id) => !governed.has(id)), ...viewsForLevels(next)])], team: teamForLevels(next, draft.team) });
  };
  /** Chọn người POS: điền tên, POS họ làm, hồ sơ; tích sẵn team có tên họ. Bỏ chọn thì giữ nguyên những gì đã điền. */
  const pickPosPerson = (id: string) => {
    const person = posData?.people.find((p) => p.id === id);
    if (!person) { setDraft({ ...draft, posUserId: '' }); return; }
    setDraft({ ...draft, posUserId: id, name: person.name, posIds: person.posIds.filter((pid) => POS.some((p) => p.id === pid)),
      employeeId: person.employeeId && employees.some((e) => e.id === person.employeeId) ? person.employeeId : draft.employeeId,
      manageTeams: [...new Set([...draft.manageTeams, ...teamsWithPerson(posData?.teams ?? [], id)])] });
  };
  const linkZalo = async (u: User) => {
    setBusy(true);
    try {
      const r = await fetch('/api/web-teams/zalo', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId: u.id }) });
      const out = await r.json().catch(() => ({})) as { error?: string; linked?: boolean; code?: string };
      if (!r.ok) { toast(out.error ?? `Lỗi ${r.status}.`, { kind: 'error' }); return; }
      if (out.code) { setZaloCode((c) => ({ ...c, [u.id]: out.code! })); setGuide({ userId: u.id, code: out.code }); }
      else { toast(`${u.name} đã nối Zalo rồi.`); await load(); }
    } catch { toast('Không gửi được yêu cầu.', { kind: 'error' }); }
    finally { setBusy(false); }
  };
  /** Xem như tài khoản này (03/11/2026): mở web y hệt người đó; thoát bằng nút Thoát xem như hoặc Đăng xuất. */
  const actAs = async (u: User) => {
    const r = await fetch('/api/auth/act-as', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId: u.id }) }).catch(() => null);
    if (!r?.ok) { toast(((await r?.json().catch(() => ({}))) as { error?: string } | undefined)?.error ?? 'Không mở được.', { kind: 'error' }); return; }
    window.location.href = '/';
  };
  const changeViews = (views: string[]) => { setDraft({ ...draft, views }); setLevels(levelsFromViews(views, draft.team)); };
  const managers = useMemo(() => users.filter((u) => u.role !== 'staff' && u.id !== editing), [users, editing]);
  const nameOf = (id: string | null) => users.find((u) => u.id === id)?.name ?? '';
  // Chủ hệ thống gốc (tạo sớm nhất) mới cấp / bỏ quyền chủ hệ thống và sửa được tài khoản chủ hệ thống khác (30/09/2026).
  const isPrimary = !!users.find((u) => u.id === currentUser.userId)?.primary;
  const editingOwner = !!editing && users.find((u) => u.id === editing)?.role === 'owner' && !(isPrimary && editing !== currentUser.userId);

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
            {!editing && posData && (
              <label className="block"><span className={FIELD_LABEL}>Chọn người trên POS <span className="font-normal text-ink-3">(không bắt buộc, giám đốc bỏ trống)</span></span>
                <select className="block w-full rounded-md border border-line bg-surface p-2 text-[13px]" value={draft.posUserId} onChange={(e) => pickPosPerson(e.target.value)}>
                  <option value="">Không chọn</option>
                  {posData.people.map((p) => <option key={p.id} value={p.id}>{p.name} · {p.posIds.map((id) => POS.find((x) => x.id === id)?.name ?? id).join(', ')}</option>)}
                </select>
                {draft.posUserId && <span className="mt-1 block text-xs text-ink-3">Đã điền tên, POS được xem và hồ sơ theo người này; team có tên họ được tích sẵn ở ô Team quản lý.</span>}
              </label>
            )}
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              <label className="block"><span className={FIELD_LABEL}>Tên hiển thị</span><Input placeholder="VD: Nguyễn Văn A" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} required /></label>
              {!editing && <label className="block"><span className={FIELD_LABEL}>Email</span><Input type="email" placeholder="Còn dùng được, để nhận mã xác minh" value={draft.email} onChange={(e) => setDraft({ ...draft, email: e.target.value })} required /></label>}
              <label className="block"><span className={FIELD_LABEL}>Chức vụ</span><Input placeholder="VD: Trưởng nhóm CSKH" value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} /></label>
              <label className="block"><span className={FIELD_LABEL}>{editing ? 'Mật khẩu mới' : 'Mật khẩu ban đầu'}</span><Input type="password" placeholder={editing ? 'Để trống nếu giữ nguyên' : 'Từ 8 ký tự'} value={draft.password} onChange={(e) => setDraft({ ...draft, password: e.target.value })} autoComplete="new-password" /></label>
              {!editingOwner && (
                <div><span className={FIELD_LABEL}>Vai trò</span>
                  <Select value={draft.role} items={{ ...(isPrimary ? { owner: ROLE_LABELS.owner } : {}), director: ROLE_LABELS.director, lead: ROLE_LABELS.lead, mentor: ROLE_LABELS.mentor, staff: ROLE_LABELS.staff }} onValueChange={(v) => { const role = v as Role; setDraft({ ...draft, role, views: PRESETS[role] }); setLevels(levelsFromViews(PRESETS[role], draft.team)); }}>
                    <SelectTrigger className="w-full" aria-label="Vai trò"><SelectValue /></SelectTrigger>
                    <SelectContent>{isPrimary && <SelectItem value="owner">Chủ hệ thống (đủ quyền như bạn)</SelectItem>}<SelectItem value="director">Giám đốc</SelectItem><SelectItem value="lead">Trưởng nhóm</SelectItem><SelectItem value="mentor">Mentor</SelectItem><SelectItem value="staff">Nhân viên</SelectItem></SelectContent>
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
            {!editingOwner && posData && ownerField(draft.role) && (
              <fieldset>
                <legend className="mb-1.5 text-xs font-semibold text-ink-2">Team người này quản lý <span className="font-normal text-ink-3">({draft.role === 'mentor' ? 'vào ô Mentor' : 'vào ô Leader'} ở trang Chia team)</span></legend>
                {posData.teams.length ? (
                  <div className="grid grid-cols-1 gap-x-3 gap-y-0.5 rounded-lg bg-surface-2 p-2.5 sm:grid-cols-2">
                    {posData.teams.map((t) => {
                      const field = ownerField(draft.role)!, other = t[field] && t[field] !== editing ? nameOf(t[field]) : '';
                      return (
                        <label key={t.id} className="flex cursor-pointer items-center gap-2 rounded-md px-1 py-1 text-[13px] transition-colors duration-[var(--dur)] hover:bg-surface-3">
                          <input type="checkbox" className={CHECK} checked={draft.manageTeams.includes(t.id)} onChange={() => setDraft({ ...draft, manageTeams: toggle(draft.manageTeams, t.id) })} />
                          <span className="min-w-0 truncate">{t.name}</span>
                          <span className="shrink-0 text-xs text-ink-3">{t.dept === 'mkt' ? 'MKT' : t.dept === 'sale' ? 'Sale' : 'CSKH'} · {t.size} người{other ? ` · đang: ${other}` : ''}</span>
                        </label>
                      );
                    })}
                  </div>
                ) : <p className="text-xs text-ink-3">Chưa chia team. Chia ở Cài đặt → Team &amp; tài khoản → Chia team rồi quay lại tích.</p>}
                <p className="mt-1 text-xs text-ink-3">Lưu thì tài khoản chỉ xem người trong các team đã tích. Team đang có người phụ trách khác sẽ đổi sang tài khoản này.</p>
              </fieldset>
            )}
            {!editingOwner && (
              <>
                <fieldset>
                  <legend className="mb-2 text-xs font-semibold text-ink-2">Cấp theo bộ phận</legend>
                  <div className="space-y-2">
                    {LEVEL_DEPTS.map(({ key, label }) => (
                      <div key={key} className="grid grid-cols-[minmax(0,1fr)_minmax(0,2fr)] items-center gap-2">
                        <span className="text-[13px]">{label}</span>
                        <Select value={levels[key as DeptKey] ?? 'none'} items={LEVEL_LABELS} onValueChange={(v) => changeLevels(key as DeptKey, v as AccessLevel)}>
                          <SelectTrigger className="w-full" aria-label={'Cấp theo bộ phận · ' + label}><SelectValue /></SelectTrigger>
                          <SelectContent>{(Object.keys(LEVEL_LABELS) as AccessLevel[]).map((level) => <SelectItem key={level} value={level}>{LEVEL_LABELS[level]}</SelectItem>)}</SelectContent>
                        </Select>
                      </div>
                    ))}
                  </div>
                  <p className="mt-1.5 text-xs text-ink-3">Điền nhanh các trang bên dưới, vẫn chỉnh từng trang được. Phạm vi dữ liệu dùng Nhóm được xem hiện có; Của tôi không giới hạn dữ liệu theo cá nhân. Trang chỉ chủ hệ thống không được cấp thêm.</p>
                </fieldset>
                <fieldset>
                  <div className="mb-1.5 flex items-center justify-between text-xs font-semibold text-ink-2"><legend>Trang được xem <span className="num text-ink-3">({draft.views.length}/{ALL_VIEWS.length})</span></legend><span className="flex gap-1 font-normal"><button type="button" className="link text-xs" onClick={() => changeViews(ALL_VIEWS)}>Tất cả</button><span className="text-ink-4">·</span><button type="button" className="link text-xs" onClick={() => changeViews([])}>Bỏ hết</button></span></div>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {VIEW_GROUPS.map(([g, ids]) => (
                      <div key={g} className="rounded-lg bg-surface-2 p-2.5">
                        <div className="mb-1 text-[10.5px] font-semibold uppercase tracking-[.07em] text-ink-3">{g}</div>
                        {ids.map((id) => <label key={id} className="flex cursor-pointer items-center gap-2 rounded-md px-1 py-1 text-[13px] transition-colors duration-[var(--dur)] hover:bg-surface-3"><input type="checkbox" className={CHECK} checked={draft.views.includes(id)} onChange={() => changeViews(toggle(draft.views, id))} />{VIEW_LABELS[id]}</label>)}
                      </div>
                    ))}
                  </div>
                  <p className="mt-1.5 text-xs text-ink-3">Cấu hình & kết nối chỉ chủ hệ thống vào được, không cấp cho ai.</p>
                </fieldset>
                <label className="block text-xs font-semibold text-ink-2">Hồ sơ nhân sự liên kết
                  <select className="mt-1 block w-full rounded-md border border-line bg-surface p-2" value={draft.employeeId} onChange={(event) => setDraft({ ...draft, employeeId: event.target.value })}>
                    <option value="">Chưa liên kết</option>
                    {employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.code} · {employee.name}</option>)}
                  </select>
                  <span className="mt-1 block font-normal">Mentor chưa liên kết hồ sơ sẽ không thấy dữ liệu. Liên kết chính thức từ web nhân sự được ưu tiên.</span>
                </label>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <fieldset>
                    <legend className="mb-1 text-xs font-semibold text-ink-2">POS được xem <span className="font-normal text-ink-3">(không chọn = tất cả)</span></legend>
                    <div className="flex flex-wrap gap-x-3 gap-y-1">{POS.map((p) => <label key={p.id} className="flex cursor-pointer items-center gap-1.5 rounded-md px-1 py-0.5 text-[13px] transition-colors duration-[var(--dur)] hover:bg-surface-2"><input type="checkbox" className={CHECK} checked={draft.posIds.includes(p.id)} onChange={() => setDraft({ ...draft, posIds: toggle(draft.posIds, p.id) })} />{p.name}</label>)}</div>
                  </fieldset>
                  <div>
                    <span className={FIELD_LABEL}>Nhóm được xem</span>
                    <Select value={draft.team} items={TEAM_LABELS} onValueChange={(v) => { setDraft({ ...draft, team: v as Team }); setLevels(levelsFromViews(draft.views, v as Team)); }}>
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
            <thead><tr><Th>Tên</Th><Th>Email</Th><Th>Vai trò · chức vụ</Th><Th>Quản lý</Th><Th className="n">Trang</Th><Th>POS</Th><Th>Nhóm</Th><Th>Đăng nhập gần nhất</Th><Th className="n">Thao tác</Th></tr></thead>
            <tbody>
              {users.map((u) => {
                const me = u.id === currentUser.userId;
                return (
                  <tr key={u.id} className={editing === u.id ? '[&>td]:bg-tint-2 [&>td:first-child]:shadow-[inset_2px_0_0_var(--primary)]' : ''}>
                    <td className="font-medium">{u.name}{u.disabled && <StatusChip tone="red" className="ml-2">đã khóa</StatusChip>}{me && <span className="ml-2 text-xs text-ink-3">(bạn)</span>}{!u.disabled && <span className="ml-2 inline-block align-middle"><ZaloButton linked={zalo.find((z) => z.userId === u.id)} code={zaloCode[u.id]} disabled={busy} label="tài khoản" hint="Lấy mã nối Zalo cho tài khoản này" onClick={() => void linkZalo(u)} onGuide={() => setGuide({ userId: u.id, code: zaloCode[u.id] })} /></span>}</td>
                    <td className="mut text-xs">{u.email}</td>
                    <td className="text-xs"><StatusChip tone={ROLE_TONE[u.role]}>{ROLE_LABELS[u.role]}</StatusChip>{u.primary && <span className="ml-1 text-[10.5px] text-ink-3" title="Chủ hệ thống gốc: người duy nhất cấp / bỏ quyền chủ hệ thống">(gốc)</span>}{u.title ? <span className="ml-1.5 text-ink-2">{u.title}</span> : ''}</td>
                    <td className="mut text-xs">{nameOf(u.managerId) || '—'}</td>
                    <td className="n text-xs" title={u.role === 'owner' ? 'Mọi trang' : u.views.map((v) => VIEW_LABELS[v]).join(', ')}>{u.role === 'owner' ? 'Tất cả' : `${u.views.length}/${ALL_VIEWS.length}`}</td>
                    <td className="max-w-[220px] truncate text-xs" title={u.role === 'owner' || !u.posIds.length ? 'Tất cả POS' : u.posIds.map((id) => POS.find((p) => p.id === id)?.name ?? id).join(', ')}>{u.role === 'owner' || !u.posIds.length ? 'Tất cả' : u.posIds.map((id) => POS.find((p) => p.id === id)?.name ?? id).join(', ')}</td>
                    <td className="text-xs">{u.role === 'owner' ? 'Tất cả' : TEAM_LABELS[u.team]}</td>
                    <td className="num mut text-xs">{dt(u.lastLoginAt, true)}</td>
                    <td className="n">
                      <span className="inline-flex items-center justify-end gap-1">
                        <Button size="sm" variant="outline" onClick={() => startEdit(u)} aria-label={`Sửa ${u.name}`}><Pencil size={12} />Sửa</Button>
                        {!me && u.role !== 'owner' && !u.disabled && <Button size="sm" variant="outline" disabled={busy} onClick={() => void actAs(u)} aria-label={`Xem như ${u.name}`} title="Mở web y hệt tài khoản này để kiểm lỗi"><Eye size={12} />Xem như</Button>}
                        {!me && (u.role !== 'owner' || (isPrimary && !u.primary)) && (
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
      {guide && <ZaloLinkGuide open name={nameOf(guide.userId) || 'người này'} code={guide.code} demo={demo} onClose={() => setGuide(null)} />}
    </Surface>
  );
}
