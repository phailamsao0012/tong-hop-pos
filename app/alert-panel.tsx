'use client';

import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';

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
  allowed: { chat_id: string; name: string; added_at: string }[];
  pairingCode: string;
  log: { kind: string; employee_id: string | null; day: string; sent_at: string; message: string; ok: number; error: string | null }[];
};
type Preview = {
  runs: { inShift: boolean; shift: string; dataError: string | null; updatedAt: string | null;
    evaluations: { employeeId: string; name: string; received: number; closed: number; rate: number | null; hotOrders: number; hotValue: number; eligible: boolean; below: boolean }[] }[];
};
const vi = new Intl.NumberFormat('vi-VN');
const time = (iso: string | null) => iso ? new Date(iso.endsWith('Z') ? iso : `${iso}Z`).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' }) : '—';
const defaultRule: Rule = { enabled: false, threshold: 40, minReceived: 20, cooldownMinutes: 60, shiftStart: '08:00', shiftEnd: '12:00', repeat: false, chatId: '', employeeIds: [] };

export function AlertPanel({ Surface }: { Surface: SurfaceComponent }) {
  const [rule, setRule] = useState<Rule>(defaultRule);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [dept, setDept] = useState('');
  const [status, setStatus] = useState<Status | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

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

  const save = async () => {
    setBusy(true); setMessage(null);
    const r = await fetch('/api/config', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'alert', alert: rule }) });
    const j = await r.json() as { error?: string };
    setMessage(r.ok ? 'Đã lưu quy tắc.' : j.error ?? 'Lỗi.');
    setBusy(false);
  };
  const test = async () => {
    setBusy(true); setMessage(null);
    const r = await fetch('/api/telegram', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'test', chatId: rule.chatId }) });
    const j = await r.json() as { error?: string };
    setMessage(r.ok ? 'Đã gửi tin thử — kiểm tra Telegram.' : j.error ?? 'Lỗi.');
    setBusy(false);
    void load();
  };
  const allow = async (action: 'allow' | 'disallow', chatId: string, name = '') => {
    const r = await fetch('/api/telegram', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, chatId, name }) });
    const j = await r.json() as { error?: string };
    setMessage(r.ok ? (action === 'allow' ? 'Đã cho phép chat dùng lệnh bot.' : 'Đã gỡ quyền chat.') : j.error ?? 'Lỗi.');
    void load();
  };
  const doPreview = async () => {
    setBusy(true);
    const r = await fetch('/api/telegram', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'preview' }) });
    if (r.ok) setPreview(await r.json() as Preview);
    setBusy(false);
  };

  const departments = [...new Set(employees.map((e) => e.department ?? 'Chưa có bộ phận'))].sort();
  const shown = employees.filter((e) => !dept || (e.department ?? 'Chưa có bộ phận') === dept);
  const toggle = (id: string) => setRule((r) => ({ ...r, employeeIds: r.employeeIds.includes(id) ? r.employeeIds.filter((x) => x !== id) : [...r.employeeIds, id] }));
  const num = (k: keyof Rule) => (e: React.ChangeEvent<HTMLInputElement>) => setRule((r) => ({ ...r, [k]: Number(e.target.value) }));

  return (
    <Surface title="Cảnh báo Telegram" description="Trong ca, nhân viên có số nhận ≥ tối thiểu và tỷ lệ chốt nóng dưới ngưỡng sẽ được báo về Telegram. Dữ liệu đồng bộ lỗi/quá cũ → báo lỗi dữ liệu, không báo hiệu suất.">
      <div className="grid gap-5 lg:grid-cols-2">
        <div className="space-y-3">
          <div className="rounded-xl border bg-[#f5faf5] p-3 text-sm">
            <div className="font-semibold">Bot Telegram</div>
            {!status ? 'Đang kiểm tra…' : !status.hasToken ? (
              <p className="text-[#a36b00]">Chưa có TELEGRAM_BOT_TOKEN. Tạo bot qua @BotFather trên Telegram, rồi đặt token bằng <code>wrangler secret put TELEGRAM_BOT_TOKEN</code>.</p>
            ) : status.botError ? <p className="text-destructive">Token không hợp lệ: {status.botError}</p>
              : (
                <div className="space-y-2">
                  <p>Bot <b>@{status.bot?.username}</b> sẵn sàng.</p>
                  <ol className="list-decimal space-y-1 pl-5">
                    <li>Mở Telegram, tìm <a className="text-primary underline" href={`https://t.me/${status.bot?.username}`} target="_blank" rel="noreferrer">@{status.bot?.username}</a> (hoặc thêm bot vào nhóm).</li>
                    <li>Gửi cho bot: <code className="rounded bg-white px-2 py-0.5 text-base font-semibold">/start {status.pairingCode}</code> <span className="text-xs text-[#7d9184]">(mã đổi mỗi ngày)</span></li>
                    <li>Bot trả lời "Đã kết nối" kèm menu — chat đó dùng được lệnh và nhận cảnh báo. Bấm "Tìm Chat ID" để thấy nó ở đây.</li>
                  </ol>
                </div>
              )}
          </div>
          <label className="text-sm">Telegram Chat ID
            <div className="mt-1 flex gap-2">
              <Input placeholder="VD: 123456789 hoặc -100123456789 (dãy số, không phải token)" value={rule.chatId} onChange={(e) => setRule((r) => ({ ...r, chatId: e.target.value.trim() }))} />
              <Button variant="outline" onClick={() => void load()}>Tìm Chat ID</Button>
              <Button variant="outline" disabled={!rule.chatId || busy} onClick={test}>Gửi tin thử</Button>
            </div>
          </label>
          {rule.chatId && !/^-?\d{4,20}$/.test(rule.chatId) && <p className="text-sm text-destructive">Chat ID phải là dãy số. Chuỗi có dấu ":" là token bot — token đã được đặt riêng, không nhập vào đây.</p>}
          {status?.chats.length ? (
            <div className="flex flex-wrap gap-2 text-xs">
              {status.chats.map((c) => <button key={c.id} type="button" className="rounded-full border px-2 py-1 hover:bg-[#f1f8f1]" onClick={() => setRule((r) => ({ ...r, chatId: c.id }))}>{c.name} · {c.type} · {c.id}</button>)}
            </div>
          ) : null}
          <div className="rounded-xl border p-3 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-semibold">Lệnh bot (/baocao, /nhanvien, /chotnong…)</span>
              <span className="text-xs text-[#7d9184]">{status?.webhook?.url ? 'Webhook đã cài' : 'Webhook tự cài sau lượt đồng bộ tới'}{status?.webhook?.last_error_message ? ` · lỗi: ${status.webhook.last_error_message}` : ''}</span>
            </div>
            <p className="mt-1 text-xs text-[#7d9184]">Chat nhận cảnh báo dùng được lệnh ngay. Chat khác (nhóm, người khác) cần được cho phép ở đây.</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <Button size="sm" variant="outline" disabled={!rule.chatId} onClick={() => allow('allow', rule.chatId, status?.chats.find((c) => c.id === rule.chatId)?.name ?? '')}>Cho phép chat ID đang nhập</Button>
              {status?.chats.filter((c) => !status.allowed.some((a) => a.chat_id === c.id)).map((c) => (
                <Button key={c.id} size="sm" variant="outline" onClick={() => allow('allow', c.id, c.name)}>Cho phép {c.name}</Button>
              ))}
            </div>
            {status?.allowed.length ? (
              <ul className="mt-2 space-y-1 text-xs">
                {status.allowed.map((a) => <li key={a.chat_id} className="flex items-center gap-2"><span>{a.name || a.chat_id} · {a.chat_id}</span><button type="button" className="text-destructive underline" onClick={() => allow('disallow', a.chat_id)}>gỡ</button></li>)}
              </ul>
            ) : null}
          </div>
          <label className="flex items-center gap-3 text-sm"><Checkbox checked={rule.enabled} onCheckedChange={(v) => setRule((r) => ({ ...r, enabled: Boolean(v) }))} />Bật cảnh báo</label>
          <div className="grid grid-cols-2 gap-3">
            <label className="text-sm">Ngưỡng tỷ lệ chốt (%)<Input type="number" min={1} max={100} value={rule.threshold} onChange={num('threshold')} className="mt-1" /></label>
            <label className="text-sm">Số nhận tối thiểu<Input type="number" min={1} value={rule.minReceived} onChange={num('minReceived')} className="mt-1" /></label>
            <label className="text-sm">Bắt đầu ca<Input type="time" value={rule.shiftStart} onChange={(e) => setRule((r) => ({ ...r, shiftStart: e.target.value }))} className="mt-1" /></label>
            <label className="text-sm">Kết thúc ca<Input type="time" value={rule.shiftEnd} onChange={(e) => setRule((r) => ({ ...r, shiftEnd: e.target.value }))} className="mt-1" /></label>
            <label className="text-sm">Nghỉ giữa thông báo (phút)<Input type="number" min={5} value={rule.cooldownMinutes} onChange={num('cooldownMinutes')} className="mt-1" /></label>
            <label className="flex items-end gap-3 pb-2 text-sm"><Checkbox checked={rule.repeat} onCheckedChange={(v) => setRule((r) => ({ ...r, repeat: Boolean(v) }))} />Nhắc lại nếu vẫn dưới ngưỡng</label>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button onClick={save} disabled={busy}>Lưu quy tắc</Button>
            <Button variant="outline" onClick={doPreview} disabled={busy}>Xem trước cảnh báo lúc này</Button>
          </div>
          {message && <p className="text-sm text-[#547467]">{message}</p>}
        </div>
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="font-semibold">Nhân viên theo dõi ({rule.employeeIds.length || 'tất cả'})</span>
            <select className="rounded-md border px-2 py-1 text-sm" value={dept} onChange={(e) => setDept(e.target.value)}>
              <option value="">Mọi bộ phận</option>
              {departments.map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
            <button type="button" className="text-primary underline" onClick={() => setRule((r) => ({ ...r, employeeIds: [...new Set([...r.employeeIds, ...shown.map((e) => e.id)])] }))}>Chọn cả bộ phận</button>
            <button type="button" className="text-primary underline" onClick={() => setRule((r) => ({ ...r, employeeIds: [] }))}>Bỏ chọn (theo dõi tất cả)</button>
          </div>
          <div className="max-h-64 overflow-auto rounded-xl border p-2 text-sm">
            {shown.map((e) => (
              <label key={e.id} className="flex items-center gap-2 py-1"><Checkbox checked={rule.employeeIds.includes(e.id)} onCheckedChange={() => toggle(e.id)} />{e.name}<span className="text-xs text-[#7d9184]">{e.department ?? ''}</span></label>
            ))}
            {!shown.length && <p className="text-[#7d9184]">Chưa có nhân viên (đồng bộ nhân viên chạy mỗi giờ).</p>}
          </div>
          {preview && (
            <div className="rounded-xl border p-3 text-sm">
              <div className="font-semibold">Xem trước · ca {preview.runs[0]?.shift} {preview.runs[0]?.inShift ? '(đang trong ca)' : '(ngoài ca — sẽ không gửi)'}</div>
              {preview.runs[0]?.dataError && <p className="text-destructive">{preview.runs[0].dataError}</p>}
              {!preview.runs.length && <p className="text-[#7d9184]">Quy tắc chưa bật hoặc chưa lưu.</p>}
              <table className="mt-2 w-full text-xs"><thead className="text-left text-[#7d9184]"><tr><th>Nhân viên</th><th className="text-right">Nhận</th><th className="text-right">Chốt</th><th className="text-right">Tỷ lệ</th><th className="text-right">Đơn · giá trị</th><th>Trạng thái</th></tr></thead>
                <tbody>{preview.runs[0]?.evaluations.map((e) => (
                  <tr key={e.employeeId} className="border-t"><td className="py-1">{e.name}</td><td className="text-right">{e.received}</td><td className="text-right">{e.closed}</td><td className="text-right">{e.rate === null ? '—' : `${e.rate.toFixed(0)}%`}</td><td className="text-right">{e.hotOrders} · {vi.format(Math.round(e.hotValue))} ₫</td><td className={e.below ? 'text-destructive' : 'text-[#7d9184]'}>{e.below ? 'Sẽ cảnh báo' : e.eligible ? 'Đạt' : 'Chưa đủ số nhận'}</td></tr>
                ))}</tbody></table>
            </div>
          )}
          {status?.log.length ? (
            <div className="rounded-xl border p-3 text-sm">
              <div className="font-semibold">Đã gửi gần đây</div>
              <ul className="mt-1 max-h-48 space-y-1 overflow-auto text-xs">
                {status.log.map((l, i) => <li key={i} className={l.ok ? '' : 'text-destructive'}>{time(l.sent_at)} · {l.kind === 'low_rate' ? 'Dưới ngưỡng' : l.kind === 'data_error' ? 'Lỗi dữ liệu' : 'Tin thử'} · {l.message.replace(/<[^>]+>/g, '').split('\n').slice(1, 3).join(' · ')}{l.error ? ` — ${l.error}` : ''}</li>)}
              </ul>
            </div>
          ) : null}
        </div>
      </div>
    </Surface>
  );
}
