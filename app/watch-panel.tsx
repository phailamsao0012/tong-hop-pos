'use client';

// Canh gác 24/7 (chủ hệ thống): chat nhận tin khi web tổng có chỗ hỏng, sự cố đang mở và nhật ký. Chưa đặt chat thì chỉ ghi nhật ký.
import { useCallback, useEffect, useState } from 'react';
import { Save, Send, ShieldAlert } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { ChartCard, ErrorBox, toast } from './ui-kit';

type Sev = 'high' | 'medium' | 'low';
type Data = {
  chats: string[]; demo: boolean; botReady: boolean; lastAt: number | null;
  incidents: { key: string; severity: Sev; title: string; detail: string | null; openedAt: string; notifiedAt: string | null; resolvedAt: string | null }[] | null;
  log: { key: string; severity: Sev; title: string; opened_at: string; notified_at: string | null; resolved_at: string | null; channel: string | null }[];
};
const ICON: Record<string, string> = { high: '🔴', medium: '🟠', low: '🟡' };
const when = (t: string | number | null) => t ? new Date(t).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' }) : '—';

export function WatchPanel() {
  const [data, setData] = useState<Data | null>(null);
  const [chats, setChats] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const call = useCallback(async (method: 'GET' | 'PUT' | 'POST', body?: unknown) => {
    setBusy(true); setError(null);
    try {
      const r = await fetch('/api/config/watch', body ? { method, cache: 'no-store', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : { method, cache: 'no-store' });
      const j = await r.json() as Data & { error?: string; sent?: number; failed?: number };
      if (!r.ok) throw new Error(j.error ?? 'Không tải được canh gác.');
      return j;
    } catch (e) { setError(e instanceof Error ? e.message : 'Không tải được canh gác.'); return null; }
    finally { setBusy(false); }
  }, []);
  const show = (j: Data) => { setData(j); setChats(j.chats.join(', ')); };
  const load = async () => { const j = await call('GET'); if (j) show(j); };
  useEffect(() => {
    void fetch('/api/config/watch', { cache: 'no-store' }).then(async (r) => {
      const j = await r.json() as Data & { error?: string };
      if (r.ok) show(j); else setError(j.error ?? 'Không tải được canh gác.');
    }).catch(() => setError('Không tải được canh gác.'));
  }, []);

  const save = async () => {
    const list = chats.split(/[\s,;]+/).map((x) => x.trim()).filter(Boolean);
    if (await call('PUT', { chats: list })) { toast(list.length ? 'Đã lưu chat nhận canh gác.' : 'Đã bỏ chat nhận: canh gác chỉ ghi nhật ký.'); await load(); }
  };
  const test = async () => {
    const j = await call('POST');
    if (j) toast(`Đã gửi thử tới ${j.sent} chat${j.failed ? `, ${j.failed} chat lỗi` : ''}.`);
  };
  const open = data?.incidents?.filter((i) => !i.resolvedAt) ?? [];

  return <ChartCard icon={ShieldAlert} title="Canh gác 24/7"
    subtitle="Báo Telegram khi đồng bộ đơn ngừng, đơn về trễ, chia số tự tắt, D1 hết hạn mức ghi hoặc sắp đầy, bộ hẹn giờ lỗi, sao lưu đêm lỗi. 🔴 báo ngay cả đêm; 🟠 🟡 từ 22:00 đến 07:00 gom một tin lúc 07:00.">
    {error && <ErrorBox error={error} onRetry={() => void load()} className="mb-3" />}
    {data && <div className="space-y-3">
      <div className={`notice ${data.chats.length && data.botReady ? 'ok' : 'info'}`}>
        <span>{data.demo ? 'Bản demo: không gửi Telegram, chỉ ghi nhật ký (demo-log).'
          : !data.chats.length ? 'Chưa đặt chat nhận: canh gác chỉ ghi nhật ký, không gửi tin.'
          : !data.botReady ? 'Chưa có token bot: chưa gửi được tin.'
          : `Đang gửi tới ${data.chats.length} chat.`} Lượt canh gần nhất: {when(data.lastAt)}.</span>
      </div>
      <div>
        <label className="mb-1 block text-xs font-semibold text-ink-2" htmlFor="watch-chats">Chat ID nhận canh gác (chỉ chat riêng, tối đa 5, cách nhau bằng dấu phẩy)</label>
        <div className="flex flex-wrap gap-2">
          <Input id="watch-chats" className="max-w-md" inputMode="numeric" value={chats} onChange={(e) => setChats(e.target.value)} placeholder="Chat ID của chủ hệ thống" />
          <button type="button" className="btn primary" disabled={busy || data.demo} onClick={() => void save()}><Save size={14} /> Lưu</button>
          <button type="button" className="btn" disabled={busy || data.demo || !data.chats.length || !data.botReady} onClick={() => void test()}><Send size={14} /> Gửi thử</button>
        </div>
      </div>
      <div>
        <p className="mb-1 text-xs font-semibold text-ink-2">Đang mở ({open.length})</p>
        {open.length ? <ul className="space-y-1 text-sm">{open.map((i) => <li key={`${i.key}@${i.openedAt}`}>
          {ICON[i.severity]} {i.title} <span className="text-ink-3">· từ {when(i.openedAt)}{i.notifiedAt ? '' : ' · chưa báo'}</span>
          {i.detail && <div className="whitespace-pre-line text-ink-3">{i.detail}</div>}
        </li>)}</ul> : <p className="text-sm text-ink-3">{data.incidents ? 'Không có sự cố.' : 'Không đọc được bộ hẹn giờ.'}</p>}
      </div>
      {!!data.log.length && <details className="text-sm">
        <summary className="cursor-pointer text-ink-2">Nhật ký sự cố ({data.log.length} gần nhất)</summary>
        <div className="tbl-wrap mt-2"><table className="tbl">
          <thead><tr><th>Sự cố</th><th>Mở</th><th>Báo</th><th>Đóng</th></tr></thead>
          <tbody>{data.log.map((r) => <tr key={`${r.key}@${r.opened_at}`}>
            <td>{ICON[r.severity]} {r.title}</td><td>{when(r.opened_at)}</td><td>{r.notified_at ? `${when(r.notified_at)}${r.channel === 'demo-log' ? ' (demo)' : ''}` : '—'}</td><td>{when(r.resolved_at)}</td>
          </tr>)}</tbody>
        </table></div>
      </details>}
    </div>}
  </ChartCard>;
}
