'use client';

import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { POS } from '@/lib/report-model';

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

const vi = new Intl.NumberFormat('vi-VN');
const time = (v: number | string | null) => {
  if (!v) return '—';
  const iso = typeof v === 'number' ? new Date(v).toISOString() : v.endsWith('Z') ? v : `${v}Z`;
  return new Date(iso).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' });
};

export function SchedulerPanel({ Surface }: { Surface: SurfaceComponent }) {
  const [status, setStatus] = useState<Status | null>(null);
  const [pos, setPos] = useState<PosSync[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [s, p] = await Promise.all([
      fetch('/api/sync/scheduler', { cache: 'no-store' }).then((r) => r.ok ? r.json() as Promise<Status> : null),
      fetch('/api/sync/pos', { cache: 'no-store' }).then((r) => r.ok ? r.json() as Promise<PosSync[]> : []),
    ]);
    setStatus(s); setPos(p);
  }, []);
  useEffect(() => {
    void load();
    const timer = setInterval(() => { void load(); }, 30000);
    return () => clearInterval(timer);
  }, [load]);

  const runNow = async () => {
    setBusy(true); setMessage(null);
    try {
      const response = await fetch('/api/sync/scheduler', { method: 'POST' });
      const result = await response.json() as { error?: string };
      setMessage(response.ok ? 'Đã chạy một lượt đồng bộ.' : result.error ?? 'Lỗi.');
      await load();
    } finally { setBusy(false); }
  };

  return (
    <Surface
      title="Đồng bộ nền"
      description="Tự chạy 5 phút/lần trên máy chủ, kể cả khi không mở web; 1 phút/lần khi còn lịch sử chưa lấy xong"
      action={<Button onClick={runNow} disabled={busy}>{busy ? 'Đang đồng bộ…' : 'Đồng bộ tất cả ngay'}</Button>}
    >
      <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4 text-sm">
        <div className="rounded-xl border bg-[#f5faf5] p-3"><span className="text-xs text-[#7d9184]">Lần chạy gần nhất</span><div className="font-semibold">{time(status?.lastRunAt ?? null)}</div></div>
        <div className="rounded-xl border bg-[#f5faf5] p-3"><span className="text-xs text-[#7d9184]">Lần kế tiếp</span><div className="font-semibold">{time(status?.nextRunAt ?? null)}</div></div>
        <div className="rounded-xl border bg-[#f5faf5] p-3"><span className="text-xs text-[#7d9184]">Lịch sử (mới nhất trước)</span><div className="font-semibold">{status?.backfillPending === false ? 'Đã lấy đủ' : status?.backfillPending ? 'Đang lấy dần' : '—'}</div></div>
        <div className="rounded-xl border bg-[#f5faf5] p-3">
          <span className="text-xs text-[#7d9184]">Lượt ghi D1 hôm nay</span>
          <div className="font-semibold">{vi.format(status?.writesUsed ?? 0)} / {vi.format(status?.writeLimit ?? 100000)} dòng</div>
          <div className="mt-1 h-1.5 w-full rounded bg-[#e3ebe4]"><div className="h-1.5 rounded bg-[#2f7a55]" style={{ width: `${Math.min(100, (status?.writesUsed ?? 0) / (status?.writeLimit ?? 100000) * 100)}%` }} /></div>
          <div className="text-xs text-[#7d9184]">Lịch sử tạm dừng khi tới {vi.format(status?.backfillCap ?? 0)}, tiếp tục sau 07:00 sáng.</div>
        </div>
      </div>
      {status?.writeBlockedUntil && status.writeBlockedUntil > Date.now() && (
        <p className="mb-3 rounded-xl border border-[#f1dfb5] bg-[#fff8e6] px-3 py-2 text-sm text-[#7a5a00]">
          D1 đã hết hạn mức ghi trong ngày. Đồng bộ tự chạy lại lúc {time(status.writeBlockedUntil)}; đăng nhập mới cũng bị chặn tới lúc đó, phiên đang mở vẫn dùng được.
        </p>
      )}
      {status?.lastError && <p className="mb-3 text-sm text-destructive">Lỗi gần nhất: {status.lastError}</p>}
      {message && <p className="mb-3 text-sm text-[#547467]">{message}</p>}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-[#7d9184]">
            <tr><th className="py-2">POS</th><th className="text-right">Đơn đã lưu</th><th>Đơn cũ nhất</th><th>Đồng bộ gần nhất</th><th>Lịch sử</th><th className="text-right">NV</th><th className="text-right">SP</th><th>Lỗi</th></tr>
          </thead>
          <tbody>
            {POS.map((p) => {
              const row = pos.find((r) => r.posId === p.id);
              const c = row?.backfillCursor;
              return (
                <tr key={p.id} className="border-t">
                  <td className="py-2">{p.name}</td>
                  <td className="text-right">{vi.format(row?.records ?? 0)}</td>
                  <td>{row?.earliestCreatedAt?.slice(0, 10) ?? '—'}</td>
                  <td>{time(row?.lastSyncAt ?? null)}</td>
                  <td>{!c ? 'Chưa bắt đầu' : c.completed ? 'Đã lấy đủ' : `Đang lấy tháng ${c.month} (trang ${c.page})`}</td>
                  <td className="text-right">{row?.users ?? 0}</td>
                  <td className="text-right">{row?.products ?? 0}</td>
                  <td className="max-w-60 truncate text-xs text-destructive" title={row?.lastError ?? ''}>{row?.lastError ?? ''}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Surface>
  );
}
