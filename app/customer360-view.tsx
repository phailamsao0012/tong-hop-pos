'use client';

// Khách hàng 360 (giai đoạn 4a · 26/09/2026): khách gộp theo SĐT trên 6 POS, vòng đời, khoảng cách mua lại, danh sách tới hạn gọi lại.
import { useMemo, useState } from 'react';
import { CalendarClock, FileDown, Hourglass, PhoneCall, Repeat, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { POS } from '@/lib/report-model';
import type { Customer360 } from '@/lib/customer360';
import { ICON } from './icons';
import { PosChips } from './overview-view';
import { useApi } from './use-api';
import { ChartCard, Definitions, EmptyState, ErrorBox, KpiCard, PageHeader, SkeletonKpis, SkeletonTable, SortTh, TableWrap, ThinkingLine, dt, pct, shortMoney, useSort, vi } from './ui-kit';

const STAGE_COLORS: Record<string, string> = { new: 'var(--ai-3)', repeat: 'var(--primary)', loyal: 'var(--good)', risk: 'var(--warn)', sleep: 'var(--bad)', never: 'var(--ink-4)' };

export function Customer360View() {
  const [posIds, setPosIds] = useState<string[]>(POS.map((p) => p.id));
  const url = useMemo(() => `/api/reports/customer360?${new URLSearchParams({ posIds: posIds.join(',') })}`, [posIds]);
  const { data: r, loading, error, reload } = useApi<Customer360>(url);
  type K = 'net' | 'orders' | 'since' | 'overdue';
  const sort = useSort<K>('net');
  const due = useMemo(() => sort.apply(r?.due ?? [], (x, k) => x[k]), [r, sort]);
  const buyers = r ? r.stages.filter((s) => s.key !== 'never').reduce((t, s) => t + s.n, 0) : 0;
  const gapMax = Math.max(1, ...(r?.gaps ?? []).map((g) => g.n));
  const gapTotal = (r?.gaps ?? []).reduce((t, g) => t + g.n, 0);
  const exportDue = async () => {
    if (!r) return;
    const XLSX = await import('xlsx');
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
      ['Khách', 'SĐT', 'POS', 'Số lần mua', 'Tiền đã mua', 'Lần mua gần nhất', 'Đã qua (ngày)', 'Thường mua lại sau (ngày)', 'Người bán'],
      ...due.map((c) => [c.name, c.phone, c.posNames.join(', '), c.orders, c.net, dt(c.lastAt), c.since, c.gap, c.seller ?? '']),
    ]), 'Tới hạn gọi lại');
    XLSX.writeFile(wb, `khach-toi-han-goi-lai_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };
  return (
    <div className="space-y-5">
      <PageHeader eyebrow="Toàn bộ lịch sử" title="Khách hàng 360" subtitle="Khách gộp theo số điện thoại trên cả 6 POS: đang ở giai đoạn nào, bao lâu mua lại một lần, ai tới hạn cần gọi"
        actions={<Button variant="outline" onClick={() => void exportDue()} disabled={!r?.due.length}><FileDown size={14} />Xuất danh sách gọi lại</Button>} />
      <PosChips posIds={posIds} onChange={setPosIds} />
      {error && !r && <ErrorBox error={error} onRetry={reload} />}
      {!r && !error && <><SkeletonKpis count={4} className="xl:grid-cols-4" /><ChartCard title="Vòng đời khách" subtitle="Đang tải…"><ThinkingLine lines={['Đang gộp khách trên 6 POS…', 'Đang tính khoảng cách mua lại…']} /><SkeletonTable rows={4} cols={4} /></ChartCard></>}
      {r && (
        <>
          <div className={`grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4 ${loading ? 'opacity-70' : ''}`}>
            <KpiCard icon={Users} tone="blue" label="Khách (không trùng)" value={vi.format(r.total.unique)} note={`Đếm riêng từng POS là ${vi.format(r.total.perPosRows)}, trùng ${vi.format(r.total.perPosRows - r.total.unique)}`}
              tooltip={{ current: `${vi.format(r.total.unique)} SĐT`, definition: r.definitions.merge }} />
            <KpiCard icon={ICON.closed} tone="green" label="Đã mua thành công" value={vi.format(buyers)} note={`${pct(r.total.unique ? buyers / r.total.unique * 100 : null, 0)} khách · ${shortMoney(r.total.net)}`}
              tooltip={{ current: `${vi.format(buyers)} khách`, definition: r.definitions.stages }} />
            <KpiCard icon={Repeat} tone="purple" label="Mua ở nhiều POS" value={vi.format(r.total.multiPos)} note={`${pct(r.total.unique ? r.total.multiPos / r.total.unique * 100 : null, 1)} khách có đơn ở từ 2 POS`}
              tooltip={{ current: `${vi.format(r.total.multiPos)} khách`, definition: r.definitions.merge }} />
            <KpiCard icon={Hourglass} tone="teal" label="Mua lại sau (trung vị)" value={r.medianGap === null ? '—' : `${Math.round(r.medianGap)} ngày`} note={`${vi.format(gapTotal)} khách đã mua từ 2 lần`}
              tooltip={{ current: r.medianGap === null ? '—' : `${r.medianGap.toFixed(1).replace('.', ',')} ngày`, definition: r.definitions.gap }} />
          </div>

          <ChartCard icon={ICON.customers} title="Vòng đời khách" subtitle="Số khách và tiền đã mua ở từng giai đoạn · bấm Khách lâu chưa mua để xem danh sách nhóm nguy cơ / đang ngủ" info={r.definitions.stages}>
            <div className="flex h-4 gap-[2px] overflow-hidden rounded-full" role="img" aria-label={r.stages.map((s) => `${s.label} ${s.n}`).join(', ')}>
              {r.stages.map((s) => <i key={s.key} className="block h-full" style={{ width: `${r.total.unique ? s.n / r.total.unique * 100 : 0}%`, background: STAGE_COLORS[s.key] }} title={`${s.label}: ${vi.format(s.n)}`} />)}
            </div>
            <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
              {r.stages.map((s, i) => (
                <div key={s.key} className="rounded-xl border border-line p-3">
                  <p className="m-0 flex items-center gap-1.5 text-[12px] font-semibold text-ink-2"><i className="size-2.5 rounded-full" style={{ background: STAGE_COLORS[s.key] }} />{s.label}{i < 4 && <span className="ml-auto text-ink-4">→</span>}</p>
                  <p className="num m-0 mt-1 text-xl text-ink">{vi.format(s.n)}</p>
                  <p className="m-0 text-[11.5px] text-ink-3">{pct(r.total.unique ? s.n / r.total.unique * 100 : null, 0)} · {shortMoney(s.net)}</p>
                  <p className="m-0 mt-1 text-[11px] leading-snug text-ink-4">{s.hint}</p>
                </div>
              ))}
            </div>
          </ChartCard>

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
            <ChartCard icon={CalendarClock} title="Bao lâu mua lại một lần" subtitle="Khoảng cách trung bình giữa các lần mua của mỗi khách (khách mua từ 2 lần)" info={r.definitions.gap}>
              {gapTotal ? (
                <ul className="m-0 list-none space-y-2.5 p-0">
                  {r.gaps.map((g) => (
                    <li key={g.key} className="grid grid-cols-[6.5rem_minmax(0,1fr)_4.5rem] items-center gap-2 text-[12.5px]">
                      <span className="text-ink-2">{g.label}</span>
                      <span className="h-3 overflow-hidden rounded-full bg-surface-2"><i className="block h-full rounded-full bg-[var(--primary)]" style={{ width: `${g.n / gapMax * 100}%` }} /></span>
                      <span className="num text-right text-ink">{vi.format(g.n)} <span className="text-[11px] text-ink-3">{pct(g.n / gapTotal * 100, 0)}</span></span>
                    </li>
                  ))}
                </ul>
              ) : <EmptyState text="Chưa có khách mua từ 2 lần." />}
            </ChartCard>
            <ChartCard icon={PhoneCall} title={`Tới hạn gọi lại · ${vi.format(due.length)} khách`} subtitle="Đã tới lúc khách thường mua lại mà chưa mua · xếp theo tiền đã mua · tối đa 300 khách" info={r.definitions.due}>
              {due.length ? (
                <TableWrap minWidth={860} maxHeight="30rem" stickyFirst>
                  <table className="tbl">
                    <thead><tr>
                      <th className="text-left">Khách</th>
                      <th className="text-left">POS</th>
                      <SortTh k="orders" label="Số lần mua" sort={sort} />
                      <SortTh k="net" label="Đã mua" sort={sort} />
                      <SortTh k="since" label="Lần gần nhất" sort={sort} />
                      <SortTh k="overdue" label="Hạn gọi" sort={sort} />
                      <th className="text-left">Người bán</th>
                    </tr></thead>
                    <tbody>{due.map((c) => (
                      <tr key={c.phone}>
                        <td className="text-left font-medium text-ink">{c.name}<span className="block text-[11px] font-normal text-ink-3">{c.phone}</span></td>
                        <td className="text-left text-[12px] text-ink-2">{c.posNames.join(', ')}</td>
                        <td className="n">{vi.format(c.orders)}</td>
                        <td className="n">{shortMoney(c.net)}</td>
                        <td className="n">{c.since} ngày trước<span className="block text-[11px] text-ink-3">{dt(c.lastAt)}</span></td>
                        <td className={`n ${c.overdue > 0 ? 'text-bad' : 'text-warn'}`}>{c.overdue > 0 ? `trễ ${c.overdue} ngày` : c.overdue === 0 ? 'hôm nay' : `còn ${-c.overdue} ngày`}<span className="block text-[11px] text-ink-3">thường {c.gap} ngày</span></td>
                        <td className="text-left text-[12px] text-ink-2">{c.seller ?? '—'}</td>
                      </tr>
                    ))}</tbody>
                  </table>
                </TableWrap>
              ) : <EmptyState text="Không có khách nào tới hạn gọi lại." />}
            </ChartCard>
          </div>
          <Definitions items={r.definitions} />
        </>
      )}
    </div>
  );
}
