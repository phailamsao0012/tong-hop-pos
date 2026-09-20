'use client';

// Đồng bộ nền: trạng thái lịch chạy trên máy chủ, hạn mức ghi D1 và tiến độ lấy lịch sử từng POS.
import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { POS } from '@/lib/report-model';
import { Skeleton, StatusChip, SyncPill, TableWrap, toast, vi } from './ui-kit';

type Status = {
  nextRunAt: number | null; lastRunAt: number | null; lastError: string | null; backfillPending: boolean | null;
  writesUsed: number; writeLimit: number; writesDay: string | null; writeBlockedUntil: number | null; backfillCap: number;
};
type PosSync = {
  posId: string; records: number; earliestCreatedAt: string | null; latestCreatedAt: string | null;
  lastSyncAt: string | null; users: number; products: number; lastError: string | null; status: string;
  backfillCursor: { month: string; page: number; completed?: boolean } | null;
  runs: { started_at: string; status: string; records: number; error: string | null }[];
};
type SurfaceComponent = React.ComponentType<{ title: string; description?: string; children: React.ReactNode; action?: React.ReactNode }>;

const time = (v: number | string | null) => {
  if (!v) return '—';
  const iso = typeof v === 'number' ? new Date(v).toISOString() : v.endsWith('Z') ? v : `${v}Z`;
  return new Date(iso).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' });
};
const toIso = (v: number | string | null) => !v ? null : typeof v === 'number' ? new Date(v).toISOString() : v;
const STALE_MS = 15 * 60000;

function Stat({ label, children, sub }: { label: string; children: React.ReactNode; sub?: React.ReactNode }) {
  return (
    <div className="rounded-xl bg-surface-2 p-3 transition-colors duration-[var(--dur)] ease-[var(--ease)] hover:bg-surface-3">
      <span className="block text-[11px] font-semibold uppercase tracking-[.06em] text-ink-2">{label}</span>
      <div className="num mt-0.5 text-lg leading-tight text-ink">{children}</div>
      {sub}
    </div>
  );
}

export function SchedulerPanel({ Surface }: { Surface: SurfaceComponent }) {
  const [status, setStatus] = useState<Status | null>(null);
  const [pos, setPos] = useState<PosSync[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const [s, p] = await Promise.all([
      fetch('/api/sync/scheduler', { cache: 'no-store' }).then((r) => r.ok ? r.json() as Promise<Status> : null).catch(() => null),
      fetch('/api/sync/pos', { cache: 'no-store' }).then((r) => r.ok ? r.json() as Promise<PosSync[]> : []).catch(() => [] as PosSync[]),
    ]);
    setStatus(s); setPos(p); setLoaded(true);
  }, []);
  useEffect(() => {
    void load();
    const timer = setInterval(() => { void load(); }, 60000);
    return () => clearInterval(timer);
  }, [load]);

  // Kết quả chạy tay hiện bằng toast (tự tắt, có nút đóng).
  const runNow = async () => {
    setBusy(true);
    try {
      const response = await fetch('/api/sync/scheduler', { method: 'POST' });
      const result = await response.json().catch(() => ({})) as { error?: string };
      if (response.ok) toast('Đã chạy một lượt đồng bộ tất cả POS.'); else toast(result.error ?? 'Không chạy được đồng bộ.', { kind: 'error' });
      await load();
    } catch { toast('Không chạy được đồng bộ.', { kind: 'error' }); }
    finally { setBusy(false); }
  };

  const used = status?.writesUsed ?? 0, limit = status?.writeLimit ?? 100000;
  const usedPct = Math.min(100, used / limit * 100);
  const lastRunIso = toIso(status?.lastRunAt ?? null);
  const blocked = !!status?.writeBlockedUntil && status.writeBlockedUntil > Date.now();
  const now = Date.now();

  return (
    <Surface
      title="Đồng bộ nền"
      description="Tự chạy 5 phút/lần trên máy chủ, kể cả khi không mở web; 1 phút/lần khi còn lịch sử chưa lấy xong"
      action={<div className="flex flex-wrap items-center gap-2"><SyncPill lastSyncAt={lastRunIso} label="Lần chạy" state={!status ? 'warn' : blocked || status.lastError ? 'bad' : 'ok'} detail={status ? `Lần kế tiếp ${time(status.nextRunAt)} · ${status.lastError ? `lỗi gần nhất: ${status.lastError}` : 'không có lỗi'}` : undefined} /><Button onClick={runNow} disabled={busy}><RefreshCw size={14} className={busy ? 'animate-spin' : ''} />{busy ? 'Đang đồng bộ…' : 'Đồng bộ tất cả ngay'}</Button></div>}
    >
      <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Lần chạy gần nhất">{loaded ? time(status?.lastRunAt ?? null) : <Skeleton className="h-5 w-24" />}</Stat>
        <Stat label="Lần kế tiếp">{loaded ? time(status?.nextRunAt ?? null) : <Skeleton className="h-5 w-24" />}</Stat>
        <Stat label="Lịch sử (mới nhất trước)">{loaded ? (status?.backfillPending === false ? <span className="text-good">Đã lấy đủ</span> : status?.backfillPending ? <span className="text-warn">Đang lấy dần</span> : '—') : <Skeleton className="h-5 w-24" />}</Stat>
        <Stat label="Lượt ghi D1 hôm nay"
          sub={<>
            <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-surface-3" role="progressbar" aria-valuenow={Math.round(usedPct)} aria-valuemin={0} aria-valuemax={100} aria-label="Hạn mức ghi D1 đã dùng"><div className={`h-full rounded-full transition-[width] duration-700 ease-[var(--ease)] ${usedPct >= 90 ? 'bg-bad' : usedPct >= 70 ? 'bg-warn' : 'bg-primary'}`} style={{ width: `${usedPct}%` }} /></div>
            <div className="mt-1 text-[11px] text-ink-3">Lịch sử tạm dừng khi tới <span className="num">{vi.format(status?.backfillCap ?? 0)}</span>, tiếp tục sau 07:00 sáng.</div>
          </>}>
          {loaded ? <>{vi.format(used)} <span className="text-sm text-ink-3">/ {vi.format(limit)} dòng</span></> : <Skeleton className="h-5 w-32" />}
        </Stat>
      </div>
      {blocked && status && (
        <p className="notice warn mb-3"><AlertTriangle size={15} className="mt-0.5 shrink-0" /><span>D1 đã hết hạn mức ghi trong ngày. Đồng bộ tự chạy lại lúc <span className="num">{time(status.writeBlockedUntil)}</span>; đăng nhập mới cũng bị chặn tới lúc đó, phiên đang mở vẫn dùng được.</span></p>
      )}
      {status?.lastError && <p className="notice error mb-3"><AlertTriangle size={15} className="mt-0.5 shrink-0" /><span>Lỗi gần nhất: {status.lastError}</span></p>}
      <TableWrap minWidth={760}>
        <table className="tbl">
          <thead>
            <tr><th>POS</th><th className="n">Đơn đã lưu</th><th>Đơn cũ nhất</th><th>Đồng bộ gần nhất</th><th>Lịch sử</th><th className="n">NV</th><th className="n">SP</th><th>Lỗi</th></tr>
          </thead>
          <tbody>
            {POS.map((p) => {
              const row = pos.find((r) => r.posId === p.id);
              const c = row?.backfillCursor;
              const syncedAt = row?.lastSyncAt ? Date.parse(row.lastSyncAt.endsWith('Z') ? row.lastSyncAt : `${row.lastSyncAt}Z`) : NaN;
              const stale = !Number.isFinite(syncedAt) || now - syncedAt > STALE_MS;
              return (
                <tr key={p.id}>
                  <td className="font-medium"><span className={`mr-2 inline-block size-2 rounded-full align-middle ${row?.lastError ? 'bg-bad' : stale ? 'bg-warn' : 'bg-good'}`} aria-hidden="true" />{p.name}</td>
                  <td className="n">{vi.format(row?.records ?? 0)}</td>
                  <td className="num mut text-xs">{row?.earliestCreatedAt?.slice(0, 10) ?? '—'}</td>
                  <td className={`num text-xs ${stale ? 'text-warn' : 'text-ink-2'}`}>{time(row?.lastSyncAt ?? null)}</td>
                  <td className="text-xs">{!c ? <StatusChip tone="gray">Chưa bắt đầu</StatusChip> : c.completed ? <StatusChip tone="green">Đã lấy đủ</StatusChip> : <span className="num text-ink-2">Đang lấy tháng {c.month} (trang {c.page})</span>}</td>
                  <td className="n">{vi.format(row?.users ?? 0)}</td>
                  <td className="n">{vi.format(row?.products ?? 0)}</td>
                  <td className="max-w-60 truncate text-xs text-bad" title={row?.lastError ?? ''}>{row?.lastError ?? ''}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </TableWrap>
    </Surface>
  );
}
