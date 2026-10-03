'use client';

// Chia số thử nghiệm (chủ hệ thống): bật/tắt nhận số cho từng sale theo ca, chế độ cho từng POS, nhật ký chia. Xem lib/dispatch.ts.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { CircleStop, ListChecks, RefreshCw, Search, Shuffle, Store, UsersRound } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { MODE_LABELS, type DispatchMode } from '@/lib/dispatch-core';
import { ChartCard, EmptyState, ErrorBox, PageHeader, SkeletonTable, StatusChip, TableWrap, dt, posName, timeOnly, toast, vi, type Tone } from './ui-kit';

type Pos = { id: string; name: string; linked: boolean; mode: DispatchMode; since: string | null; lastRunAt: string | null; lastError: string | null; waiting: number; updatedBy: string | null };
type Staff = { id: string; name: string; team: string; posIds: string[]; on: boolean; onSince: string | null; lastAssignedAt: string | null; today: { ok: number; dry: number } };
type Log = { at: string; pos_id: string; order_id: string; order_at: string | null; customer: string | null; seller_name: string | null; mode: string; result: string; detail: string | null };
type Data = { configured: boolean; pos: Pos[]; staff: Staff[]; total: { ok: number; dry: number; error: number }; log: Log[] };

const MODES: DispatchMode[] = ['off', 'dry', 'live'];
const RESULT: Record<string, { label: string; tone: Tone }> = {
  ok: { label: 'Đã chia', tone: 'green' }, dry: { label: 'Chạy thử', tone: 'blue' }, error: { label: 'Lỗi', tone: 'red' },
};

async function post(body: unknown) {
  const r = await fetch('/api/dispatch', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({})) as { error?: string };
  if (!r.ok) throw new Error(j.error ?? 'Không lưu được.');
}

export function DispatchView() {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [posFilter, setPosFilter] = useState('all');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch('/api/dispatch', { cache: 'no-store' });
      const body = await r.json() as Data & { error?: string };
      if (!r.ok) throw new Error(body.error ?? 'Không tải được.');
      setData(body); setError(null);
    } catch (e) { setError(e instanceof Error ? e.message : 'Không tải được.'); }
    finally { setLoading(false); }
  }, []);
  // Tự làm mới mỗi 20 giây để thấy số vừa chia.
  useEffect(() => { void load(); const t = window.setInterval(() => void load(), 20000); return () => clearInterval(t); }, [load]);

  const act = async (key: string, body: unknown, done?: string) => {
    setBusy(key);
    try { await post(body); if (done) toast(done); await load(); }
    catch (e) { toast(e instanceof Error ? e.message : 'Không lưu được.', { kind: 'error' }); }
    finally { setBusy(null); }
  };
  const setMode = (p: Pos, mode: DispatchMode) => {
    if (mode === p.mode) return;
    if (mode === 'live' && !window.confirm(`Chạy thật cho ${p.name}?\n\nWeb sẽ ghi người bán vào các đơn mới chưa có người bán trên Pancake. Nên tắt "chia đơn tự động" của Pancake cho POS này trước để hai bên không cùng chia.`)) return;
    void act(`pos:${p.id}`, { action: 'pos', posId: p.id, mode }, `${p.name}: ${MODE_LABELS[mode]}`);
  };

  const staff = useMemo(() => (data?.staff ?? []).filter((s) => (posFilter === 'all' || s.posIds.includes(posFilter))
    && (!q.trim() || s.name.toLowerCase().includes(q.trim().toLowerCase()))), [data, q, posFilter]);
  const groups = useMemo(() => {
    const m = new Map<string, Staff[]>();
    for (const s of staff) m.set(s.team, [...(m.get(s.team) ?? []), s]);
    return [...m.entries()];
  }, [staff]);
  const onCount = (data?.staff ?? []).filter((s) => s.on).length;
  const running = (data?.pos ?? []).filter((p) => p.mode !== 'off');

  return (
    <div className="space-y-4">
      <PageHeader eyebrow="Sale · thử nghiệm" title="Chia số"
        subtitle="Bật sale khi vào ca, tắt khi hết ca. Mỗi phút web lấy đơn mới chưa có người bán trên các POS đang bật và chia lần lượt cho những người đang bật. Chạy thử chỉ ghi nhật ký; Chạy thật ghi người bán vào đơn trên Pancake."
        actions={<>
          <Button variant="outline" onClick={() => void load()} disabled={loading}><RefreshCw className={`size-4 ${loading ? 'animate-spin' : ''}`} />Làm mới</Button>
          {running.length > 0 && <Button variant="destructive" disabled={busy === 'stop'} onClick={() => { if (window.confirm('Dừng chia số ở mọi POS?')) void act('stop', { action: 'stop-all' }, 'Đã dừng chia số mọi POS.'); }}><CircleStop className="size-4" />Dừng tất cả</Button>}
        </>} />
      {error && <ErrorBox error={error} onRetry={() => void load()} />}
      {data && !data.configured && <ErrorBox error="Web chưa có API key Pancake POS nên chưa chia được." />}

      <ChartCard icon={Store} title="POS" subtitle={data ? `Hôm nay: ${vi.format(data.total.ok)} đã chia · ${vi.format(data.total.dry)} chạy thử · ${vi.format(data.total.error)} lỗi` : undefined}
        info="Chỉ đơn ở trạng thái Mới, chưa có người bán, tạo sau lúc bật mới được chia. Đơn cũ không bao giờ bị đụng tới. Nếu Pancake không nhận người bán hoặc đơn bị đổi sau khi ghi, web tự tắt POS đó.">
        {!data && <SkeletonTable rows={6} cols={4} />}
        {data && (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {data.pos.map((p) => (
              <div key={p.id} className="rounded-xl border border-line p-3.5">
                <div className="flex items-center justify-between gap-2">
                  <div className="truncate font-semibold">{p.name}</div>
                  <StatusChip tone={p.mode === 'live' ? 'green' : p.mode === 'dry' ? 'blue' : 'gray'}>{MODE_LABELS[p.mode]}</StatusChip>
                </div>
                <div className="mt-2.5 inline-flex rounded-lg border border-line p-0.5" role="radiogroup" aria-label={`Chế độ ${p.name}`}>
                  {MODES.map((m) => (
                    <button key={m} type="button" role="radio" aria-checked={p.mode === m} disabled={!p.linked || busy === `pos:${p.id}`}
                      onClick={() => setMode(p, m)}
                      className={`rounded-md px-3 py-1 text-xs font-medium transition-colors duration-[var(--dur)] disabled:opacity-50 ${p.mode === m ? (m === 'live' ? 'bg-green-600 text-white' : m === 'dry' ? 'bg-blue-600 text-white' : 'bg-surface-3 text-ink') : 'text-ink-2 hover:bg-surface-3'}`}>
                      {MODE_LABELS[m]}
                    </button>
                  ))}
                </div>
                <div className="mt-2 space-y-0.5 text-xs text-ink-3">
                  {!p.linked && <div>POS chưa ghép Shop ID Pancake.</div>}
                  {p.mode !== 'off' && p.since && <div>Chia đơn tạo từ {dt(p.since, true)}{p.updatedBy ? ` · ${p.updatedBy}` : ''}</div>}
                  {p.mode !== 'off' && <div>Lượt gần nhất: {p.lastRunAt ? timeOnly(p.lastRunAt) : 'chưa chạy'}{p.waiting > 0 ? ` · ${vi.format(p.waiting)} đơn đang chờ (không ai bật)` : ''}</div>}
                  {p.lastError && <div className="text-red-600">{p.lastError}</div>}
                </div>
              </div>
            ))}
          </div>
        )}
      </ChartCard>

      <ChartCard icon={UsersRound} title="Sale nhận số" subtitle={data ? `${vi.format(onCount)} người đang bật` : undefined}
        info="Người mới bật nhận ngay đơn kế tiếp rồi xếp vào vòng. Một người chỉ nhận đơn của POS mà họ có tài khoản trên Pancake.">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-0 flex-1 basis-56">
            <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-3" />
            <Input aria-label="Tìm sale" placeholder="Tìm tên…" value={q} onChange={(e) => setQ(e.target.value)} className="pl-8" />
          </div>
          <select aria-label="Lọc POS" value={posFilter} onChange={(e) => setPosFilter(e.target.value)} className="h-9 rounded-md border border-line bg-surface px-2 text-sm">
            <option value="all">Mọi POS</option>
            {(data?.pos ?? []).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
        {data && !staff.length && <EmptyState text="Không có sale nào khớp." />}
        <div className="space-y-4">
          {groups.map(([team, list]) => {
            const allOn = list.every((s) => s.on);
            return (
              <div key={team}>
                <div className="mb-1.5 flex items-center justify-between gap-2">
                  <div className="text-sm font-semibold text-ink-2">{team} <span className="num font-normal text-ink-3">· {list.filter((s) => s.on).length}/{list.length} đang bật</span></div>
                  <Button size="sm" variant="outline" disabled={busy === `team:${team}`}
                    onClick={() => void act(`team:${team}`, { action: 'staff', userIds: list.map((s) => s.id), on: !allOn }, `${allOn ? 'Đã tắt' : 'Đã bật'} cả nhóm ${team}`)}>
                    {allOn ? 'Tắt cả nhóm' : 'Bật cả nhóm'}
                  </Button>
                </div>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
                  {list.map((s) => (
                    <div key={s.id} className={`flex items-center gap-3 rounded-lg border p-2.5 transition-colors duration-[var(--dur)] ${s.on ? 'border-green-500/60 bg-green-500/5' : 'border-line'}`}>
                      <Switch checked={s.on} disabled={busy === `staff:${s.id}`} aria-label={`Nhận số: ${s.name}`}
                        onCheckedChange={(on: boolean) => void act(`staff:${s.id}`, { action: 'staff', userId: s.id, on })} />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium">{s.name}</div>
                        <div className="truncate text-xs text-ink-3">
                          {s.on && s.onSince ? `Bật lúc ${timeOnly(s.onSince)} · ` : ''}
                          Hôm nay {vi.format(s.today.ok)} số{s.today.dry ? ` · thử ${vi.format(s.today.dry)}` : ''}
                          {' · '}{s.posIds.map(posName).join(', ')}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </ChartCard>

      <ChartCard icon={ListChecks} title="Nhật ký chia số" subtitle="150 lượt gần nhất">
        {data && !data.log.length && <EmptyState text="Chưa chia đơn nào. Bật Chạy thử cho một POS và bật vài sale để xem web sẽ chia thế nào." />}
        {data && data.log.length > 0 && (
          <TableWrap minWidth={760} maxHeight={520} sticky>
            <table className="tbl">
              <thead><tr><th>Lúc chia</th><th>POS</th><th>Đơn</th><th>Khách</th><th>Giao cho</th><th>Kết quả</th></tr></thead>
              <tbody>
                {data.log.map((l) => (
                  <tr key={`${l.at}:${l.order_id}`} className="align-top">
                    <td className="num text-ink-2">{dt(l.at, true)}</td>
                    <td>{posName(l.pos_id)}</td>
                    <td className="num"><div>{l.order_id}</div>{l.order_at && <div className="text-xs text-ink-3">vào {timeOnly(/[zZ]|[+-]\d\d:?\d\d$/.test(l.order_at) ? l.order_at : `${l.order_at}Z`)}</div>}</td>
                    <td className="max-w-[200px] truncate">{l.customer ?? '—'}</td>
                    <td className="font-medium"><Shuffle className="mr-1 inline size-3.5 text-ink-3" aria-hidden="true" />{l.seller_name ?? '—'}</td>
                    <td><StatusChip tone={RESULT[l.result]?.tone ?? 'gray'}>{RESULT[l.result]?.label ?? l.result}</StatusChip>
                      {l.detail && l.result === 'error' && <div className="mt-1 max-w-[280px] whitespace-normal text-xs text-red-600">{l.detail}</div>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        )}
      </ChartCard>
    </div>
  );
}
