'use client';

// Sao lưu đêm ra R2 (chỉ chủ hệ thống): trạng thái lượt gần nhất, các bản đang giữ, khôi phục một bảng vào bảng mới restore_*.
import { useEffect, useState } from 'react';
import { AlertTriangle, DatabaseBackup } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { StatusChip, toast, vi } from './ui-kit';

type Status = {
  status: 'ok' | 'fail' | 'off' | 'running'; date: string; startedAt: string; finishedAt?: string; durationMs?: number;
  bytes?: number; tables?: Record<string, number>; error?: string; note?: string; attempts: number; lastOkDate?: string; lastOkAt?: string;
};
type Info = { status: Status | null; configured: boolean; backups: { date: string; bytes: number; complete: boolean }[]; tables: string[] };
type Manifest = { date: string; tables: { name: string; rows: number; bytes: number; redacted: string[] }[] };
type SurfaceComponent = React.ComponentType<{ title: string; description?: string; children: React.ReactNode; action?: React.ReactNode }>;

const time = (iso?: string) => iso ? new Date(iso).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' }) : '—';
const size = (b = 0) => b >= 1048576 ? `${(b / 1048576).toFixed(1).replace('.', ',')} MB` : `${vi.format(Math.ceil(b / 1024))} KB`;
const TONE = { ok: 'green', fail: 'red', off: 'gray', running: 'blue' } as const;
const LABEL = { ok: 'Thành công', fail: 'Lỗi', off: 'Chưa cấu hình', running: 'Đang chạy' } as const;

export function BackupPanel({ Surface }: { Surface: SurfaceComponent }) {
  const [info, setInfo] = useState<Info | null>(null);
  const [date, setDate] = useState('');
  const [manifest, setManifest] = useState<Manifest | null>(null);
  const [table, setTable] = useState('');
  const [busy, setBusy] = useState(false);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    void fetch('/api/backup', { cache: 'no-store' }).then((x) => x.ok ? x.json() as Promise<Info> : null).catch(() => null).then((r) => {
      setInfo(r);
      const first = r?.backups.find((b) => b.complete)?.date ?? '';
      setDate((d) => d && r?.backups.some((b) => b.date === d) ? d : first);
    });
  }, [tick]);
  useEffect(() => {
    if (!date) return;
    void fetch(`/api/backup?date=${date}`, { cache: 'no-store' }).then((x) => x.ok ? x.json() as Promise<Manifest> : null).catch(() => null).then(setManifest);
  }, [date]);
  // Bản kê của ngày khác (đang tải ngày mới): coi như chưa có.
  const current = manifest?.date === date ? manifest : null;
  const chosen = current?.tables.some((t) => t.name === table) ? table : '';

  const post = async (url: string, body?: object) => {
    setBusy(true);
    try {
      const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
      const j = await r.json().catch(() => ({})) as { error?: string; table?: string; rows?: number; expected?: number };
      if (!r.ok) toast(j.error ?? 'Không thực hiện được.', { kind: 'error' });
      else if (j.table) toast(`Đã khôi phục vào bảng ${j.table}: ${vi.format(j.rows ?? 0)}/${vi.format(j.expected ?? 0)} dòng.`);
      else toast('Đã sao lưu xong.');
      setTick((n) => n + 1);
    } catch { toast('Không thực hiện được.', { kind: 'error' }); }
    finally { setBusy(false); }
  };

  const s = info?.status;
  const complete = info?.backups.filter((b) => b.complete) ?? [];
  return (
    <Surface
      title="Sao lưu đêm (R2)"
      description="02:00 mỗi đêm chép các bảng không lấy lại được (tài khoản, cài đặt, mục tiêu, chia số, quyền bot, nhật ký) ra kho R2 riêng; giữ 30 bản đêm + 12 bản đầu tháng. Không chép bí mật đăng nhập."
      action={<Button variant="outline" onClick={() => post('/api/backup')} disabled={busy || !info?.configured}><DatabaseBackup size={14} />Sao lưu ngay</Button>}
    >
      <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
        <span className="text-ink-2">Lượt gần nhất:</span>
        {s ? <StatusChip tone={TONE[s.status]}>{LABEL[s.status]}</StatusChip> : <StatusChip tone="gray">Chưa chạy</StatusChip>}
        {s && <span className="num text-ink-2">{time(s.finishedAt ?? s.startedAt)}{s.status === 'ok' && ` · ${Object.keys(s.tables ?? {}).length} bảng · ${vi.format(Object.values(s.tables ?? {}).reduce((a, b) => a + b, 0))} dòng · ${size(s.bytes)} · ${Math.round((s.durationMs ?? 0) / 1000)} giây`}</span>}
        {s?.lastOkAt && s.status !== 'ok' && <span className="text-ink-2">· thành công gần nhất {time(s.lastOkAt)}</span>}
      </div>
      {s?.error && <p className={`notice ${s.status === 'off' ? 'warn' : 'error'} mb-3`}><AlertTriangle size={15} className="mt-0.5 shrink-0" /><span>{s.error}</span></p>}
      {s?.note && <p className="mb-3 text-xs text-ink-2">{s.note}</p>}
      {info?.configured && (
        <div className="rounded-xl border border-line bg-surface-2 p-3 text-sm">
          <strong>Khôi phục một bảng</strong>
          <p className="mt-1 text-ink-2">Chép vào bảng mới <code>restore_&lt;bảng&gt;_&lt;ngày&gt;</code>, không đụng bảng đang chạy. Đối chiếu xong mới chép tay sang bảng thật. Mật khẩu tài khoản không được sao lưu.</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <select className="field h-8 w-auto rounded-lg" aria-label="Ngày sao lưu" value={date} onChange={(e) => setDate(e.target.value)}>
              {!complete.length && <option value="">Chưa có bản nào</option>}
              {complete.map((b) => <option key={b.date} value={b.date}>{b.date} · {size(b.bytes)}</option>)}
            </select>
            <select className="field h-8 w-auto rounded-lg" aria-label="Bảng" value={chosen} onChange={(e) => setTable(e.target.value)} disabled={!current}>
              <option value="">Chọn bảng…</option>
              {current?.tables.map((t) => <option key={t.name} value={t.name}>{t.name} · {vi.format(t.rows)} dòng</option>)}
            </select>
            <Button variant="outline" disabled={busy || !date || !chosen} onClick={() => { if (window.confirm(`Khôi phục bảng ${chosen} ngày ${date} vào bảng mới?`)) void post('/api/backup/restore', { date, table: chosen }); }}>Khôi phục</Button>
          </div>
        </div>
      )}
    </Surface>
  );
}
