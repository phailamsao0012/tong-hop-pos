'use client';

// Bộ phận Vận đơn (anh Vũ 08/10/2026): người Vận đơn gọi khách xác nhận đơn. Đo cả hai phía của hàng hoàn: người chốt (Sale / CSKH)
// và người xác nhận (Vận đơn), theo người, team, bộ phận; đơn không xác nhận được đếm theo lý do. Dữ liệu: /api/reports/van-don.
import { useMemo, useState } from 'react';
import { BadgeCheck, Clock3, PhoneOff, ShoppingCart, Undo2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { VdLine, VdReport } from '@/lib/van-don';
import { PeriodToolbar, PosChips } from './overview-view';
import { usePeriod } from './period-store';
import { usePosIds } from './pos-store';
import { StaleChip } from './stale-chip';
import { useApi } from './use-api';
import { TrendNotes } from './overview-trends';
import { takeNavHint } from './nav-focus';
import { ChartCard, Definitions, EmptyState, ErrorBox, KpiCard, PageHeader, SegmentedControl, SkeletonKpis, SkeletonTable, SortTh, TableWrap, dmy, money, pct, toast, useSort, vi } from './ui-kit';

type Count = { label: string; n: number };
type Report = VdReport & { period: { start: string; end: string }; syncedAt: string | null; definitions: Record<string, string>; failedTags?: Count[]; failedNotes?: Count[] };
type Level = 'person' | 'team' | 'dept';
const LEVELS: { value: Level; label: string }[] = [{ value: 'person', label: 'Từng người' }, { value: 'team', label: 'Từng team' }, { value: 'dept', label: 'Từng bộ phận' }];
/** Màu theo tỷ lệ xấu (hoàn, không xác nhận được): dưới 10% tốt, 10–20% cần để ý, từ 20% xấu. */
const badTone = (v: number | null) => v === null ? '' : v >= 20 ? 'text-bad' : v >= 10 ? 'text-warn' : 'text-good';

type Col = { key: string; label: string; get: (r: VdLine) => number | null; fmt: (v: number | null) => string; tone?: (v: number | null) => string; title?: string };
const n = (v: number | null) => v === null ? '—' : vi.format(v);
const p = (v: number | null) => pct(v);
const m = (v: number | null) => v === null ? '—' : money(v);
const SELLER_COLS: Col[] = [
  { key: 'closed', label: 'Đơn chốt', get: (r) => r.closed, fmt: n },
  { key: 'failed', label: 'Không XN được', get: (r) => r.failed, fmt: n, title: 'Đơn bị hủy khi đang Chờ xác nhận' },
  { key: 'failRate', label: '% không XN', get: (r) => r.failRate, fmt: p, tone: badTone },
  { key: 'self', label: 'Tự XN', get: (r) => r.self ?? 0, fmt: n, title: 'Người chốt tự bấm Đã xác nhận, không qua Vận đơn' },
  { key: 'sent', label: 'Đã gửi', get: (r) => r.sent, fmt: n },
  { key: 'returned', label: 'Hoàn', get: (r) => r.returned, fmt: n },
  { key: 'returnRate', label: '% hoàn', get: (r) => r.returnRate, fmt: p, tone: badTone },
  { key: 'returnedNet', label: 'DS hoàn', get: (r) => r.returnedNet, fmt: m },
  { key: 'returnRateNet', label: '% hoàn DS', get: (r) => r.returnRateNet, fmt: p, tone: badTone },
];
const CONFIRMER_COLS: Col[] = [
  { key: 'handled', label: 'Đơn đã gọi', get: (r) => r.confirmed + r.failed, fmt: n, title: 'Đã xác nhận + không xác nhận được' },
  { key: 'confirmed', label: 'Đã XN', get: (r) => r.confirmed, fmt: n },
  { key: 'failed', label: 'Không XN được', get: (r) => r.failed, fmt: n },
  { key: 'confirmRate', label: '% XN được', get: (r) => r.confirmRate, fmt: p },
  { key: 'sent', label: 'Đã gửi', get: (r) => r.sent, fmt: n },
  { key: 'returned', label: 'Hoàn', get: (r) => r.returned, fmt: n },
  { key: 'returnRate', label: '% hoàn', get: (r) => r.returnRate, fmt: p, tone: badTone },
  { key: 'returnedNet', label: 'DS hoàn', get: (r) => r.returnedNet, fmt: m },
  { key: 'returnRateNet', label: '% hoàn DS', get: (r) => r.returnRateNet, fmt: p, tone: badTone },
];

function LineTable({ rows, cols, level, first }: { rows: VdLine[]; cols: Col[]; level: Level; first: string }) {
  const sort = useSort<string>(cols[0].key);
  const sorted = sort.apply(rows, (r, k) => cols.find((c) => c.key === k)?.get(r) ?? null);
  if (!rows.length) return <EmptyState text="Chưa có đơn trong kỳ" />;
  return (
    <TableWrap maxHeight="32rem" sticky stickyFirst minWidth={level === 'person' ? 940 : 760}>
      <table className="tbl sticky-first">
        <thead><tr><th>{first}</th>{level === 'person' && <><th>Team</th><th>Bộ phận</th></>}{cols.map((c) => <SortTh key={c.key} k={c.key} label={<span title={c.title}>{c.label}</span>} sort={sort} />)}</tr></thead>
        <tbody>
          {sorted.map((r, i) => (
            <tr key={r.key}>
              <td className="font-medium"><span className="num mr-1.5 inline-block w-5 text-right text-xs text-ink-4">{i + 1}</span>{r.label}</td>
              {level === 'person' && <><td className="mut text-xs" title={r.team}>{r.team?.split(' · ').pop() || '—'}</td><td className="mut text-xs">{r.dept ?? '—'}</td></>}
              {cols.map((c) => { const v = c.get(r); return <td key={c.key} className={`n ${c.tone?.(v) ?? ''}`}>{c.fmt(v)}</td>; })}
            </tr>
          ))}
        </tbody>
      </table>
    </TableWrap>
  );
}

/** Thẻ / ghi chú thật trên đơn không xác nhận được, để chốt danh sách thẻ lý do cho Vận đơn. */
function FailedList({ title, empty, items }: { title: string; empty: string; items: Count[] }) {
  return (
    <div className="min-w-0">
      <p className="mb-2 text-xs font-semibold uppercase tracking-[.05em] text-ink-3">{title}</p>
      {items.length ? (
        <ul className="max-h-72 space-y-1 overflow-y-auto pr-1 text-sm">
          {items.map((x) => <li key={x.label} className="flex items-baseline justify-between gap-3 border-b border-line/60 py-1"><span className="min-w-0 break-words text-ink-2">{x.label}</span><span className="num shrink-0 text-ink">{vi.format(x.n)}</span></li>)}
        </ul>
      ) : <p className="text-sm text-ink-3">{empty}</p>}
    </div>
  );
}

export function VanDonView() {
  const { preset, start, end, setPreset, setStart, setEnd } = usePeriod();
  const [posIds, setPosIds] = usePosIds();
  // Mở từ bảng Vận đơn ở Tổng quan POS thì xem sẵn theo bộ phận (nav-focus.ts).
  const [level, setLevel] = useState<Level>(() => { const h = takeNavHint('van-don.level'); return h === 'team' || h === 'dept' || h === 'person' ? h : 'person'; });
  const url = useMemo(() => `/api/reports/van-don?${new URLSearchParams({ start, end, posIds: posIds.join(',') })}`, [start, end, posIds]);
  const { data: report, at, stale, loading, error, reload } = useApi<Report>(url, { keep: false });
  const period = `${dmy(start)}/${start.slice(0, 4)} – ${dmy(end)}/${end.slice(0, 4)}`;
  const t = report?.total;
  const sellers = report ? level === 'person' ? report.sellers : level === 'team' ? report.sellerTeams : report.sellerDepts : [];
  const confirmers = report ? level === 'person' ? report.confirmers : level === 'team' ? report.confirmerTeams : report.confirmerDepts : [];
  const first = level === 'person' ? 'Họ và tên' : level === 'team' ? 'Team' : 'Bộ phận';
  const maxReason = Math.max(1, ...(report?.reasons ?? []).map((r) => r.n));

  async function exportExcel() {
    if (!report) return;
    try {
      const XLSX = await import('xlsx');
      const wb = XLSX.utils.book_new();
      const sheet = (rows: VdLine[], cols: Col[], person: boolean) => XLSX.utils.aoa_to_sheet([
        ['Tên', ...(person ? ['Team', 'Bộ phận'] : []), ...cols.map((c) => c.label)],
        ...rows.map((r) => [r.label, ...(person ? [r.team ?? '', r.dept ?? ''] : []), ...cols.map((c) => c.get(r) ?? '')]),
      ]);
      XLSX.utils.book_append_sheet(wb, sheet(report.sellers, SELLER_COLS, true), 'Người chốt');
      XLSX.utils.book_append_sheet(wb, sheet(report.sellerTeams, SELLER_COLS, false), 'Team chốt');
      XLSX.utils.book_append_sheet(wb, sheet(report.sellerDepts, SELLER_COLS, false), 'Bộ phận chốt');
      XLSX.utils.book_append_sheet(wb, sheet(report.confirmers, CONFIRMER_COLS, true), 'Người xác nhận');
      XLSX.utils.book_append_sheet(wb, sheet(report.confirmerTeams, CONFIRMER_COLS, false), 'Team xác nhận');
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['Lý do', 'Số đơn', 'Người xác nhận'], ...report.reasons.map((r) => [r.reason, r.n, r.byConfirmer.map((c) => `${c.label} (${c.n})`).join(', ')])]), 'Lý do không XN');
      XLSX.writeFile(wb, `van-don-${start}-${end}.xlsx`);
    } catch { toast('Không xuất được file Excel.', { kind: 'error' }); }
  }

  return (
    <div className="space-y-5">
      <PageHeader eyebrow={period} title="Vận đơn" subtitle="Gọi xác nhận đơn và hàng hoàn: do người chốt hay do người xác nhận"
        badge={<StaleChip stale={stale} at={at} loading={loading} error={report ? error : null} onRetry={reload} />}
        actions={<Button onClick={exportExcel} disabled={!report}>Xuất Excel</Button>} />
      <PeriodToolbar preset={preset} start={start} end={end} onPreset={setPreset} onStart={setStart} onEnd={setEnd} loading={loading} onReload={reload}
        extra={<><span className="px-1 text-xs font-semibold text-ink-2">Xem theo</span><SegmentedControl<Level> ariaLabel="Xem theo" size="sm" value={level} onChange={setLevel} options={LEVELS} /></>} />
      <PosChips posIds={posIds} onChange={setPosIds} />
      <TrendNotes depts={['vandon']} />
      {error && !report && <ErrorBox error={error} onRetry={reload} />}
      {!report && !error && <><SkeletonKpis count={5} className="xl:grid-cols-5" /><SkeletonTable rows={8} /></>}
      {report && t && (
        <>
          <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-5" aria-busy={loading || undefined}>
            <KpiCard icon={ShoppingCart} tone="blue" label="Đơn chốt" value={vi.format(t.closed)} note={`${money(t.closedNet)} · từ Chờ xác nhận`} />
            <KpiCard icon={BadgeCheck} tone="green" label="Đã xác nhận" value={vi.format(t.confirmed)} note={`Xác nhận được ${pct(t.confirmRate)}`} />
            <KpiCard icon={PhoneOff} tone="orange" label="Không xác nhận được" value={vi.format(t.failed)} note={`${pct(t.failRate)} số đơn đã gọi`} />
            <KpiCard icon={Clock3} tone="teal" label="Đang chờ xác nhận" value={vi.format(t.waiting)} note="chưa gọi xong" />
            <KpiCard id="vd-return" icon={Undo2} tone="orange" label="Tỷ lệ hoàn" value={pct(t.returnRate)} note={`${vi.format(t.returned)} / ${vi.format(t.sent)} đơn gửi · DS hoàn ${pct(t.returnRateNet)}`} />
          </div>

          <ChartCard id="vd-sellers" icon={ShoppingCart} title="Phía chốt đơn (Sale, CSKH)" subtitle="Hoàn cao và nhiều đơn không xác nhận được ở người chốt là dấu hiệu chốt kém." info={report.definitions['Người chốt']}>
            <LineTable rows={sellers} cols={SELLER_COLS} level={level} first={first} />
          </ChartCard>

          <ChartCard icon={BadgeCheck} title="Phía xác nhận (Vận đơn)" subtitle="Hoàn cao ở đơn một người đã xác nhận là dấu hiệu gọi xác nhận kém." info={report.definitions['Người xác nhận']}>
            <LineTable rows={confirmers} cols={CONFIRMER_COLS} level={level} first={first} />
          </ChartCard>

          <ChartCard icon={PhoneOff} title="Lý do không xác nhận được" subtitle={`${vi.format(t.failed)} đơn bị hủy khi đang Chờ xác nhận`} info={report.definitions['Không xác nhận được']}>
            {report.reasons.length ? (
              <ul className="space-y-2.5">
                {report.reasons.map((r) => (
                  <li key={r.reason}>
                    <div className="flex items-baseline justify-between gap-3 text-sm"><span className="font-medium text-ink">{r.reason}</span><span className="num text-ink-2">{vi.format(r.n)} đơn · {pct(t.failed ? r.n / t.failed * 100 : null, 0)}</span></div>
                    <span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-surface-3" aria-hidden="true"><i className="block h-full rounded-full bg-t-orange" style={{ width: `${r.n / maxReason * 100}%` }} /></span>
                    <p className="mt-0.5 text-xs text-ink-3">{r.byConfirmer.slice(0, 5).map((c) => `${c.label} ${vi.format(c.n)}`).join(' · ')}</p>
                  </li>
                ))}
              </ul>
            ) : <EmptyState text="Không có đơn nào bị hủy khi đang Chờ xác nhận" />}
            {!!t.failed && (
              <div className="mt-5 grid gap-4 border-t border-line pt-4 md:grid-cols-2">
                <FailedList title="Thẻ đang gắn trên các đơn này" empty="Các đơn này chưa gắn thẻ nào" items={report.failedTags ?? []} />
                <FailedList title="Ghi chú trên các đơn này" empty="Các đơn này không có ghi chú" items={report.failedNotes ?? []} />
              </div>
            )}
          </ChartCard>

          <Definitions items={Object.entries(report.definitions).map(([term, def]) => `${term}: ${def}`)} />
        </>
      )}
    </div>
  );
}
