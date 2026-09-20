'use client';

// Cảnh báo Telegram: kết nối bot, ai được dùng bot, quy tắc cảnh báo tỷ lệ chốt thấp trong ca, xem trước và nhật ký đã gửi.
import { useCallback, useEffect, useState } from 'react';
import { Bot, Eye, Save, Send, ShieldCheck, UserCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { StatusChip, TableWrap, toast, vi } from './ui-kit';

type SurfaceComponent = React.ComponentType<{ title: string; description?: string; children: React.ReactNode; action?: React.ReactNode }>;
type Rule = {
  enabled: boolean; threshold: number; minReceived: number; cooldownMinutes: number;
  shiftStart: string; shiftEnd: string; repeat: boolean; chatId: string; employeeIds: string[];
};
type Employee = { id: string; name: string; department: string | null; active: boolean };
type Status = {
  hasToken: boolean; hasWebhookSecret: boolean; bot: { username?: string } | null; botError: string | null;
  chats: { id: string; type: string; name: string }[];
  webhook: { url?: string; last_error_message?: string; pending_update_count?: number };
  allowed: { chat_id: string; name: string; added_at: string; role: string }[];
  requests: { chat_id: string; name: string; username: string | null; requested_at: string }[];
  hasPassword: boolean;
  pairingCode: string;
  log: { kind: string; employee_id: string | null; day: string; sent_at: string; message: string; ok: number; error: string | null }[];
};
type Preview = {
  runs: { inShift: boolean; shift: string; dataError: string | null; updatedAt: string | null;
    evaluations: { employeeId: string; name: string; received: number; closed: number; rate: number | null; hotOrders: number; hotValue: number; eligible: boolean; below: boolean }[] }[];
};
const time = (iso: string | null) => iso ? new Date(iso.endsWith('Z') ? iso : `${iso}Z`).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' }) : '—';
const defaultRule: Rule = { enabled: false, threshold: 40, minReceived: 20, cooldownMinutes: 60, shiftStart: '08:00', shiftEnd: '12:00', repeat: false, chatId: '', employeeIds: [] };
const CHAT_ID = /^-?\d{4,20}$/;
const FIELD_LABEL = 'mb-1 block text-xs font-semibold text-ink-2';
const BOX = 'rounded-xl border border-line bg-surface p-3.5 text-[13px]';

export function AlertPanel({ Surface }: { Surface: SurfaceComponent }) {
  const [rule, setRule] = useState<Rule>(defaultRule);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [dept, setDept] = useState('');
  const [status, setStatus] = useState<Status | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busyChat, setBusyChat] = useState<string | null>(null);
  const [newChatId, setNewChatId] = useState('');
  const [newChatRole, setNewChatRole] = useState<'admin' | 'member'>('member');
  const [busy, setBusy] = useState(false);
  const [botPassword, setBotPassword] = useState('');

  const load = useCallback(async () => {
    const [cfg, emp, st] = await Promise.all([
      fetch('/api/config', { cache: 'no-store' }).then((r) => r.ok ? r.json() as Promise<{ alert: Rule }> : null),
      fetch('/api/employees', { cache: 'no-store' }).then((r) => r.ok ? r.json() as Promise<Employee[]> : []),
      fetch('/api/telegram', { cache: 'no-store' }).then((r) => r.ok ? r.json() as Promise<Status> : null),
    ]);
    if (cfg) setRule({ ...defaultRule, ...cfg.alert });
    setEmployees(emp);
    setStatus(st);
    if (!dept) { const sale = [...new Set(emp.map((e) => e.department).filter(Boolean))].find((d) => /sale/i.test(d!)); if (sale) setDept(sale); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => { void load(); }, [load]);

  // Mọi kết quả lưu / gửi thử / cấp quyền hiện bằng toast (tự tắt, có nút đóng) thay cho dòng chữ đứng mãi trong khung.
  const save = async () => {
    setBusy(true);
    try {
      const r = await fetch('/api/config', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'alert', alert: rule }) });
      const j = await r.json().catch(() => ({})) as { error?: string };
      if (r.ok) toast('Đã lưu quy tắc cảnh báo.'); else toast(j.error ?? 'Không lưu được quy tắc.', { kind: 'error' });
    } catch { toast('Không lưu được quy tắc.', { kind: 'error' }); }
    finally { setBusy(false); }
  };
  const test = async () => {
    setBusy(true);
    try {
      const r = await fetch('/api/telegram', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'test', chatId: rule.chatId }) });
      const j = await r.json().catch(() => ({})) as { error?: string };
      if (r.ok) toast('Đã gửi tin thử — kiểm tra Telegram.'); else toast(j.error ?? 'Không gửi được tin thử.', { kind: 'error' });
    } catch { toast('Không gửi được tin thử.', { kind: 'error' }); }
    finally { setBusy(false); }
    void load();
  };
  const allow = async (action: 'allow' | 'disallow', chatId: string, name = '', role: 'admin' | 'member' = 'member') => {
    if (action === 'disallow' && !window.confirm(`Gỡ quyền dùng bot của chat ${name || chatId}?`)) return;
    setBusyChat(chatId);
    try {
      const r = await fetch('/api/telegram', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, chatId, name, role }) });
      const j = await r.json().catch(() => ({})) as { error?: string };
      if (!r.ok) { toast(j.error ?? `Lỗi ${r.status}.`, { kind: 'error' }); return; }
      // Cập nhật danh sách ngay, rồi đọc lại từ máy chủ (bản nhanh, không gọi Telegram).
      setStatus((st) => st ? { ...st, allowed: action === 'disallow' ? st.allowed.filter((a) => a.chat_id !== chatId) : (st.allowed.some((a) => a.chat_id === chatId) ? st.allowed.map((a) => a.chat_id === chatId ? { ...a, role, name: name || a.name } : a) : [...st.allowed, { chat_id: chatId, name, added_at: new Date().toISOString(), role }]), requests: st.requests.filter((q) => q.chat_id !== chatId) } : st);
      toast(action === 'disallow' ? `Đã gỡ ${name || chatId}.` : `Đã lưu: ${name || chatId} là ${role === 'admin' ? 'quản trị' : 'thành viên'}.`);
      if (chatId === newChatId) setNewChatId('');
      const st = await fetch('/api/telegram?quick=1', { cache: 'no-store' }).then((x) => x.ok ? x.json() as Promise<Status> : null).catch(() => null);
      if (st) setStatus((cur) => cur ? { ...cur, allowed: st.allowed, requests: st.requests, hasPassword: st.hasPassword } : st);
    } catch (e) { toast(e instanceof Error ? e.message : 'Không gửi được yêu cầu.', { kind: 'error' }); }
    finally { setBusyChat(null); }
  };
  const savePassword = async (password: string) => {
    try {
      const r = await fetch('/api/telegram', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'password', password }) });
      const j = await r.json().catch(() => ({})) as { error?: string; hasPassword?: boolean };
      if (r.ok) toast(j.hasPassword ? 'Đã đặt mật khẩu bot.' : 'Đã bỏ mật khẩu bot.'); else toast(j.error ?? 'Không lưu được mật khẩu bot.', { kind: 'error' });
    } catch { toast('Không lưu được mật khẩu bot.', { kind: 'error' }); }
    setBotPassword('');
    void load();
  };
  const doPreview = async () => {
    setBusy(true);
    try {
      const r = await fetch('/api/telegram', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'preview' }) });
      if (r.ok) setPreview(await r.json() as Preview); else toast('Không xem trước được.', { kind: 'error' });
    } catch { toast('Không xem trước được.', { kind: 'error' }); }
    finally { setBusy(false); }
  };

  const departments = [...new Set(employees.map((e) => e.department ?? 'Chưa có bộ phận'))].sort();
  const shown = employees.filter((e) => !dept || (e.department ?? 'Chưa có bộ phận') === dept);
  const toggle = (id: string) => setRule((r) => ({ ...r, employeeIds: r.employeeIds.includes(id) ? r.employeeIds.filter((x) => x !== id) : [...r.employeeIds, id] }));
  const num = (k: keyof Rule) => (e: React.ChangeEvent<HTMLInputElement>) => setRule((r) => ({ ...r, [k]: Number(e.target.value) }));
  const chatIdBad = !!rule.chatId && !CHAT_ID.test(rule.chatId);
  const run = preview?.runs[0];

  return (
    <Surface title="Cảnh báo Telegram" description="Trong ca, nhân viên có số nhận ≥ tối thiểu và tỷ lệ chốt nóng dưới ngưỡng sẽ được báo về Telegram. Dữ liệu đồng bộ lỗi/quá cũ → báo lỗi dữ liệu, không báo hiệu suất."
      action={<StatusChip tone={rule.enabled ? 'green' : 'gray'}>{rule.enabled ? 'Đang bật' : 'Đang tắt'}</StatusChip>}>
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <div className="space-y-4">
          <div className="rounded-xl bg-surface-2 p-3.5 text-[13px]">
            <div className="flex items-center gap-1.5 font-semibold text-ink"><Bot size={14} className="text-ink-3" />Bot Telegram</div>
            {!status ? <p className="mt-1 text-ink-3">Đang kiểm tra…</p> : !status.hasToken ? (
              <p className="notice warn mt-2"><span>Chưa có TELEGRAM_BOT_TOKEN. Tạo bot qua @BotFather trên Telegram, rồi đặt token bằng <code className="rounded bg-surface px-1">wrangler secret put TELEGRAM_BOT_TOKEN</code>.</span></p>
            ) : status.botError ? <p className="notice error mt-2">Token không hợp lệ: {status.botError}</p>
              : (
                <div className="mt-1 space-y-2">
                  <p>Bot <b>@{status.bot?.username}</b> sẵn sàng.</p>
                  <ol className="list-decimal space-y-1 pl-5 text-ink-2">
                    <li>Mở Telegram, tìm <a className="link" href={`https://t.me/${status.bot?.username}`} target="_blank" rel="noreferrer">@{status.bot?.username}</a> (hoặc thêm bot vào nhóm).</li>
                    <li>Gửi cho bot: <code className="num rounded-md bg-surface px-2 py-0.5 text-[15px] text-ink">/start {status.pairingCode}</code> <span className="text-xs text-ink-3">(mã đổi mỗi ngày)</span></li>
                    <li>Bot trả lời "Đã kết nối" kèm menu — chat đó dùng được lệnh và nhận cảnh báo. Bấm "Tìm Chat ID" để thấy nó ở đây.</li>
                  </ol>
                </div>
              )}
          </div>
          <div>
            <label htmlFor="alert-chat-id" className={FIELD_LABEL}>Telegram Chat ID nhận cảnh báo</label>
            <div className="flex flex-wrap gap-2">
              <Input id="alert-chat-id" className="num min-w-0 flex-1 basis-56" inputMode="numeric" placeholder="VD: 123456789 hoặc -100123456789 (dãy số, không phải token)" value={rule.chatId} aria-invalid={chatIdBad || undefined} onChange={(e) => setRule((r) => ({ ...r, chatId: e.target.value.trim() }))} />
              <Button variant="outline" onClick={() => void load()}>Tìm Chat ID</Button>
              <Button variant="outline" disabled={!rule.chatId || chatIdBad || busy} onClick={test}><Send size={13} />Gửi tin thử</Button>
            </div>
            {chatIdBad && <p className="mt-1.5 text-xs text-bad">Chat ID phải là dãy số. Chuỗi có dấu ":" là token bot — token đã được đặt riêng, không nhập vào đây.</p>}
            {status?.chats.length ? (
              <div className="mt-2 flex flex-wrap gap-1.5 text-xs">
                {status.chats.map((c) => <button key={c.id} type="button" aria-pressed={rule.chatId === c.id} className={`rounded-full border px-2.5 py-1 transition-colors duration-[var(--dur)] ease-[var(--ease)] ${rule.chatId === c.id ? 'border-primary bg-tint text-primary' : 'border-line bg-surface text-ink-2 hover:border-line-3 hover:bg-surface-2 hover:text-ink'}`} onClick={() => setRule((r) => ({ ...r, chatId: c.id }))}>{c.name} · {c.type} · <span className="num">{c.id}</span></button>)}
              </div>
            ) : null}
          </div>
          <div className={BOX}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="flex items-center gap-1.5 font-semibold text-ink"><ShieldCheck size={14} className="text-ink-3" />Ai được dùng bot</span>
              <span className="text-xs text-ink-3">{status?.webhook?.url ? 'Webhook đã cài' : 'Webhook tự cài sau lượt đồng bộ tới'}{status?.webhook?.last_error_message ? ` · lỗi: ${status.webhook.last_error_message}` : ''}</span>
            </div>
            <p className="mt-1 text-xs text-ink-3">Người lạ nhắn bot sẽ không thấy số liệu. Họ vào được bằng <b>mật khẩu bot</b> (gửi <code>/start &lt;mật khẩu&gt;</code>) hoặc bấm "Xin quyền" để chat quản trị duyệt ngay trong Telegram.</p>
            <form className="mt-2.5 flex flex-wrap items-center gap-2" onSubmit={(e) => { e.preventDefault(); if (botPassword.length >= 8) void savePassword(botPassword); }}>
              <Input type="password" aria-label="Mật khẩu bot" placeholder={status?.hasPassword ? 'Đổi mật khẩu bot (từ 8 ký tự)' : 'Đặt mật khẩu bot (từ 8 ký tự)'} className="w-64 max-w-full" value={botPassword} onChange={(e) => setBotPassword(e.target.value)} autoComplete="new-password" />
              <Button type="submit" size="sm" variant="outline" disabled={botPassword.length < 8}>Lưu mật khẩu</Button>
              {status?.hasPassword && <Button type="button" size="sm" variant="ghost" onClick={() => void savePassword('')}>Bỏ mật khẩu</Button>}
              <StatusChip tone={status?.hasPassword ? 'green' : 'gray'}>{status?.hasPassword ? 'Đang bật mật khẩu' : 'Chưa đặt mật khẩu'}</StatusChip>
            </form>
            {status?.requests.length ? (
              <div className="notice warn mt-3 flex-col items-stretch gap-1">
                <div className="text-xs font-semibold">Đang chờ duyệt ({status.requests.length})</div>
                <ul className="space-y-1 text-xs">
                  {status.requests.map((r) => (
                    <li key={r.chat_id} className="flex flex-wrap items-center gap-2">
                      <span className="text-ink">{r.name || '—'}{r.username ? ` (@${r.username})` : ''} · <span className="num">{r.chat_id}</span> · <span className="num">{time(r.requested_at)}</span></span>
                      <Button size="sm" variant="outline" disabled={busyChat === r.chat_id} onClick={() => allow('allow', r.chat_id, r.name)}><UserCheck size={12} />Cho phép</Button>
                      <Button size="sm" variant="ghost" disabled={busyChat === r.chat_id} onClick={() => allow('disallow', r.chat_id)}>Từ chối</Button>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            <form className="mt-3 flex flex-wrap items-center gap-2" onSubmit={(e) => { e.preventDefault(); if (CHAT_ID.test(newChatId)) void allow('allow', newChatId, status?.chats.find((c) => c.id === newChatId)?.name ?? '', newChatRole); }}>
              <span className="text-xs font-semibold text-ink-2">Thêm chat</span>
              <Input className="num w-44" inputMode="numeric" aria-label="Chat ID cần thêm" placeholder="Chat ID (dãy số)" value={newChatId} onChange={(e) => setNewChatId(e.target.value.trim())} />
              <select className="field h-8 w-auto rounded-lg" aria-label="Vai trò của chat" value={newChatRole} onChange={(e) => setNewChatRole(e.target.value as 'admin' | 'member')}><option value="member">Thành viên (chỉ xem)</option><option value="admin">Quản trị (duyệt người khác)</option></select>
              <Button type="submit" size="sm" variant="outline" disabled={!CHAT_ID.test(newChatId) || busyChat === newChatId}>Cho phép</Button>
              {status?.chats.filter((c) => !status.allowed.some((a) => a.chat_id === c.id)).map((c) => (
                <Button key={c.id} type="button" size="sm" variant="outline" disabled={busyChat === c.id} onClick={() => allow('allow', c.id, c.name)}>Cho phép {c.name}</Button>
              ))}
            </form>
            {status?.allowed.length ? (
              <ul className="mt-2.5 divide-y divide-line text-xs">
                {status.allowed.map((a) => (
                  <li key={a.chat_id} className="reveal-row flex flex-wrap items-center gap-2 py-1.5">
                    <span className="min-w-0 flex-1 basis-48">{a.name && a.name !== a.chat_id ? `${a.name} · ` : ''}<span className="num">{a.chat_id}</span> <StatusChip tone={a.role === 'admin' ? 'blue' : 'gray'}>{a.role === 'admin' ? 'quản trị' : 'thành viên'}</StatusChip></span>
                    <Button size="sm" variant="outline" disabled={busyChat === a.chat_id} onClick={() => allow('allow', a.chat_id, a.name, a.role === 'admin' ? 'member' : 'admin')}>{busyChat === a.chat_id ? 'Đang lưu…' : a.role === 'admin' ? 'Hạ thành viên' : 'Cấp quản trị'}</Button>
                    <Button size="sm" variant="ghost" className="text-bad hover:bg-bad-bg hover:text-bad" disabled={busyChat === a.chat_id} onClick={() => allow('disallow', a.chat_id, a.name)}>Gỡ</Button>
                  </li>
                ))}
              </ul>
            ) : <p className="mt-2 text-xs text-ink-3">Chưa có chat nào được phép.</p>}
          </div>
          <div className={BOX}>
            <label className="flex cursor-pointer items-center gap-3 text-[13px] font-semibold text-ink"><Checkbox checked={rule.enabled} onCheckedChange={(v) => setRule((r) => ({ ...r, enabled: Boolean(v) }))} />Bật cảnh báo</label>
            <div className="mt-3 grid grid-cols-2 gap-3">
              <label className="block"><span className={FIELD_LABEL}>Ngưỡng tỷ lệ chốt (%)</span><Input className="num" type="number" min={1} max={100} value={rule.threshold} onChange={num('threshold')} /></label>
              <label className="block"><span className={FIELD_LABEL}>Số nhận tối thiểu</span><Input className="num" type="number" min={1} value={rule.minReceived} onChange={num('minReceived')} /></label>
              <label className="block"><span className={FIELD_LABEL}>Bắt đầu ca</span><Input className="num" type="time" value={rule.shiftStart} onChange={(e) => setRule((r) => ({ ...r, shiftStart: e.target.value }))} /></label>
              <label className="block"><span className={FIELD_LABEL}>Kết thúc ca</span><Input className="num" type="time" value={rule.shiftEnd} onChange={(e) => setRule((r) => ({ ...r, shiftEnd: e.target.value }))} /></label>
              <label className="block"><span className={FIELD_LABEL}>Nghỉ giữa thông báo (phút)</span><Input className="num" type="number" min={5} value={rule.cooldownMinutes} onChange={num('cooldownMinutes')} /></label>
              <label className="flex cursor-pointer items-end gap-3 pb-2 text-[13px]"><Checkbox checked={rule.repeat} onCheckedChange={(v) => setRule((r) => ({ ...r, repeat: Boolean(v) }))} />Nhắc lại nếu vẫn dưới ngưỡng</label>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button onClick={save} disabled={busy}><Save size={13} />{busy ? 'Đang lưu…' : 'Lưu quy tắc'}</Button>
              <Button variant="outline" onClick={doPreview} disabled={busy}><Eye size={13} />Xem trước cảnh báo lúc này</Button>
            </div>
          </div>
        </div>
        <div className="space-y-4">
          <div className={BOX}>
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-semibold text-ink">Nhân viên theo dõi <span className="num text-ink-3">({rule.employeeIds.length || 'tất cả'})</span></span>
              <select className="field h-8 w-auto rounded-lg" aria-label="Lọc theo bộ phận" value={dept} onChange={(e) => setDept(e.target.value)}>
                <option value="">Mọi bộ phận</option>
                {departments.map((d) => <option key={d} value={d}>{d}</option>)}
              </select>
              <button type="button" className="link text-xs" onClick={() => setRule((r) => ({ ...r, employeeIds: [...new Set([...r.employeeIds, ...shown.map((e) => e.id)])] }))}>Chọn cả bộ phận</button>
              <button type="button" className="link text-xs" onClick={() => setRule((r) => ({ ...r, employeeIds: [] }))}>Bỏ chọn (theo dõi tất cả)</button>
            </div>
            <div className="mt-2 max-h-64 overflow-auto overscroll-contain rounded-lg bg-surface-2 p-1.5">
              {shown.map((e) => (
                <label key={e.id} className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 transition-colors duration-[var(--dur)] hover:bg-surface-3"><Checkbox checked={rule.employeeIds.includes(e.id)} onCheckedChange={() => toggle(e.id)} /><span className="min-w-0 flex-1 truncate">{e.name}</span><span className="text-xs text-ink-3">{e.department ?? ''}</span></label>
              ))}
              {!shown.length && <p className="p-2 text-xs text-ink-3">Chưa có nhân viên (đồng bộ nhân viên chạy mỗi giờ).</p>}
            </div>
          </div>
          {preview && (
            <div className={BOX}>
              <div className="flex flex-wrap items-center gap-2 font-semibold text-ink">Xem trước · ca {run?.shift ?? '—'} <StatusChip tone={run?.inShift ? 'green' : 'gray'}>{run?.inShift ? 'đang trong ca' : 'ngoài ca — sẽ không gửi'}</StatusChip></div>
              {run?.dataError && <p className="notice error mt-2">{run.dataError}</p>}
              {!preview.runs.length && <p className="mt-1 text-ink-3">Quy tắc chưa bật hoặc chưa lưu.</p>}
              {run?.evaluations.length ? (
                <TableWrap className="mt-2" minWidth={520}>
                  <table className="tbl text-xs">
                    <thead><tr><th>Nhân viên</th><th className="n">Nhận</th><th className="n">Chốt</th><th className="n">Tỷ lệ</th><th className="n">Đơn · giá trị</th><th>Trạng thái</th></tr></thead>
                    <tbody>{run.evaluations.map((e) => (
                      <tr key={e.employeeId}><td>{e.name}</td><td className="n">{vi.format(e.received)}</td><td className="n">{vi.format(e.closed)}</td><td className={`n ${e.below ? 'text-bad' : ''}`}>{e.rate === null ? '—' : `${e.rate.toFixed(0)}%`}</td><td className="n">{vi.format(e.hotOrders)} · {vi.format(Math.round(e.hotValue))} ₫</td><td><StatusChip tone={e.below ? 'red' : e.eligible ? 'green' : 'gray'}>{e.below ? 'Sẽ cảnh báo' : e.eligible ? 'Đạt' : 'Chưa đủ số nhận'}</StatusChip></td></tr>
                    ))}</tbody>
                  </table>
                </TableWrap>
              ) : null}
            </div>
          )}
          {status?.log.length ? (
            <div className={BOX}>
              <div className="font-semibold text-ink">Đã gửi gần đây</div>
              <ul className="mt-1.5 max-h-48 space-y-1 overflow-auto overscroll-contain text-xs">
                {status.log.map((l, i) => <li key={i} className={`flex gap-2 ${l.ok ? 'text-ink-2' : 'text-bad'}`}><span className="num shrink-0 text-ink-3">{time(l.sent_at)}</span><span className="min-w-0 break-words">{l.kind === 'low_rate' ? 'Dưới ngưỡng' : l.kind === 'data_error' ? 'Lỗi dữ liệu' : 'Tin thử'} · {l.message.replace(/<[^>]+>/g, '').split('\n').slice(1, 3).join(' · ')}{l.error ? ` — ${l.error}` : ''}</span></li>)}
              </ul>
            </div>
          ) : null}
        </div>
      </div>
    </Surface>
  );
}
