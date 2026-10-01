'use client';

// Chất lượng khách của Sale (29/09/2026): Sale chốt cho khách nào, sản phẩm gì, và khách có quay lại mua qua CSKH không.
// Sale "chốt láo" thường hoàn nhiều và khách gần như không quay lại; Sale tốt thì CSKH upsell dễ, khách mua lại đều.
import { usePosIds } from './pos-store';
import { AiPackButton } from './ai-pack';
import { useMemo, useState } from 'react';
import { usePeriod } from './period-store';
import { PRESETS, isPreset } from '@/lib/periods';
import { HeartHandshake, Repeat, Timer, UserCheck } from 'lucide-react';
import { POS } from '@/lib/report-model';
import type { SaleQuality } from '@/lib/sale-quality';
import { ICON } from './icons';
import { PeriodToolbar, PosChips } from './overview-view';
import { useApi } from './use-api';
import { LadderMembers, LadderTable, ladderExtras, type LadderLine, type LadderPick } from './ladder-table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ChartCard, Definitions, EmptyState, ErrorBox, KpiCard, PageHeader, SegmentedControl, SkeletonKpis, SkeletonTable, SortTh, StatusChip, TableWrap, ThinkingLine, dmy, money, pct, shortMoney, useSort, vi } from './ui-kit';

type Row = SaleQuality['staff'][number];
const days = (d: number | null) => d === null ? '—' : d < 1 ? 'dưới 1 ngày' : `${vi.format(Math.round(d))} ngày`;
const tagText = (t: { tag: string; count: number }[]) => t.map((x) => `${x.tag} ${vi.format(x.count)}`).join(' · ') || '—';

export function SaleQualityView() {
  // Kỳ theo bộ lọc ngày chung của web (yêu cầu 30/09/2026), không còn chọn riêng từng tháng.
  const { preset, start, end, setPreset, setStart, setEnd } = usePeriod();
  const [posIds, setPosIds] = usePosIds();
  const [pick, setPick] = useState<{ id: string; name: string } | null>(null);
  const base = useMemo(() => new URLSearchParams({ start, end, posIds: posIds.join(',') }).toString(), [start, end, posIds]);
  const { data: r, loading, error, reload } = useApi<SaleQuality>(`/api/reports/sale-quality?${base}`, { keep: false });
  const detail = useApi<SaleQuality>(pick ? `/api/reports/sale-quality?${base}&staffId=${encodeURIComponent(pick.id)}` : null, { keep: false });
  type K = 'customers' | 'returnRate' | 'repeatRateMature' | 'cskhOrders' | 'cskhNet' | 'cskhNetPerCustomer' | 'ordersPerRepeater' | 'avgDaysToRepeat';
  const sort = useSort<K>('repeatRateMature');
  const staff = useMemo(() => sort.apply(r?.staff ?? [], (s, k) => s[k]), [r, sort]);
  const t = r?.total;
  const flag = (s: Row) => {
    if (!t || s.mature < 10 || s.repeatRateMature === null || t.repeatRateMature === null) return null;
    if (s.repeatRateMature < t.repeatRateMature * 0.5 || (s.returnRate ?? 0) > Math.max(15, (t.returnRate ?? 0) * 1.8)) return <StatusChip tone="red">Cần xem</StatusChip>;
    if (s.repeatRateMature >= t.repeatRateMature * 1.3) return <StatusChip tone="green">Khách quay lại tốt</StatusChip>;
    return null;
  };
  const range = start === end ? dmy(start) : `${dmy(start)}–${dmy(end)}`;
  const label = isPreset(preset) && preset !== 'custom' ? `${PRESETS[preset]} (${range})` : range;
  return (
    <div className="space-y-5">
      <PageHeader eyebrow={`${label} · theo dõi tới hôm nay`} title="Chất lượng khách của Sale"
        subtitle="Sale chốt cho khách nào, sản phẩm gì, và khách có quay lại mua qua CSKH không — Sale tốt thì khách ít hoàn và CSKH upsell dễ"
        actions={<AiPackButton disabled={!r} pack={() => r && ({
          page: 'Chất lượng khách của Sale', period: label,
          facts: [['Khách Sale chốt', r.total.customers], ['Đủ 30 ngày theo dõi', r.total.mature], ['Mua lại qua CSKH (đủ 30 ngày)', pct(r.total.repeatRateMature)], ['Đơn CSKH từ khách Sale', r.total.cskhOrders], ['Doanh thu CSKH từ khách Sale', Math.round(r.total.cskhNet)], ['Tỷ lệ hoàn đơn Sale', pct(r.total.returnRate)]],
          tables: [{ title: 'Từng Sale', staffCol: 0, columns: ['Sale', 'Khách', 'Đủ 30 ngày', 'Hoàn', 'Mua lại qua CSKH (đủ 30 ngày)', 'Đơn CSKH', 'Doanh thu CSKH', 'DT CSKH / khách', 'Ngày tới lần mua lại', 'Sale chốt gì', 'Khách mua lại gì'],
            rows: r.staff.map((s) => [s.name, s.customers, s.mature, pct(s.returnRate), pct(s.repeatRateMature), s.cskhOrders, Math.round(s.cskhNet), s.cskhNetPerCustomer === null ? null : Math.round(s.cskhNetPerCustomer), days(s.avgDaysToRepeat), tagText(s.saleTags), tagText(s.repeatTags)]) }],
          definitions: r.definitions,
          questions: ['Sale nào có khách quay lại qua CSKH thấp bất thường so với mặt bằng — dấu hiệu chốt ép / tư vấn sai?', 'Sản phẩm Sale chốt nào dẫn tới khách mua lại nhiều nhất?', 'Có Sale nào vừa hoàn cao vừa ít khách quay lại không?', 'CSKH nên ưu tiên chăm nhóm khách của Sale nào?'],
        })} />} />
      <PeriodToolbar preset={preset} start={start} end={end} loading={loading} onReload={reload}
        onPreset={(v) => { setPreset(v); setPick(null); }} onStart={(v) => { setStart(v); setPick(null); }} onEnd={(v) => { setEnd(v); setPick(null); }} />
      <PosChips posIds={posIds} onChange={(v) => { setPosIds(v); setPick(null); }} />
      {error && !r && <ErrorBox error={error} onRetry={reload} />}
      {!r && !error && <><SkeletonKpis count={4} className="xl:grid-cols-4" /><ChartCard title="Từng Sale" subtitle="Đang tải…"><ThinkingLine /><SkeletonTable rows={6} cols={8} /></ChartCard></>}
      {r && t && (
        <>
          {r.followDays < 45 && <p className="notice m-0 text-[12.5px]">Khách của {label} mới được theo dõi {vi.format(r.followDays)} ngày — nhiều khách chưa tới lúc mua lại. So sánh giữa các Sale nên dựa vào cột "đủ {r.matureDays} ngày", hoặc chọn kỳ sớm hơn (ví dụ Tháng trước).</p>}
          <div className={`grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4 ${loading ? 'opacity-70' : ''}`}>
            <KpiCard icon={UserCheck} tone="blue" label="Khách Sale chốt" value={vi.format(t.customers)} note={`${vi.format(t.saleOrders)} đơn Sale · ${vi.format(t.mature)} khách đủ ${r.matureDays} ngày`}
              tooltip={{ period: label, current: `${vi.format(t.customers)} khách`, definition: r.definitions.cohort }} />
            <KpiCard icon={Repeat} tone="green" label="Mua lại qua CSKH" value={pct(t.repeatRateMature)} note={`${vi.format(t.repeatMature)}/${vi.format(t.mature)} khách đủ ${r.matureDays} ngày · tất cả ${pct(t.repeatRate)}`}
              progress={t.repeatRateMature === null ? undefined : { value: t.repeatRateMature, max: 100 }} tooltip={{ period: label, current: pct(t.repeatRateMature), rows: [['Tất cả khách', `${vi.format(t.repeat)}/${vi.format(t.customers)} (${pct(t.repeatRate)})`], ['Quay lại qua Sale', `${vi.format(t.saleAgain)} khách`]], definition: `${r.definitions.repeat} ${r.definitions.mature}` }} />
            <KpiCard icon={HeartHandshake} tone="teal" label="Doanh thu CSKH từ khách Sale" value={shortMoney(t.cskhNet)} note={`${vi.format(t.cskhOrders)} đơn · ${shortMoney(t.cskhNetPerCustomer)} / khách Sale · ${t.ordersPerRepeater === null ? '—' : t.ordersPerRepeater.toFixed(1).replace('.', ',')} đơn / khách mua lại`}
              tooltip={{ period: label, current: money(t.cskhNet), rows: [['Khách mua lại gì', tagText(t.repeatTags)]], definition: r.definitions.repeat }} />
            <KpiCard icon={ICON.returned} tone="orange" invert label="Hoàn đơn Sale · quay lại sau" value={pct(t.returnRate)} note={`${vi.format(t.returned)} đơn hoàn · lần mua lại đầu sau ${days(t.avgDaysToRepeat)}`}
              tooltip={{ period: label, current: pct(t.returnRate), rows: [['Ngày tới lần mua lại đầu (TB)', days(t.avgDaysToRepeat)]], definition: r.definitions.returnRate }} />
          </div>

          <ChartCard icon={Timer} title="Từng Sale" subtitle={`Bấm một dòng để xem từng khách · "Cần xem" = tỷ lệ mua lại (đủ ${r.matureDays} ngày) dưới một nửa mặt bằng hoặc hoàn cao bất thường`}>
            {!staff.length ? <EmptyState text="Chưa có khách Sale chốt trong kỳ này." /> : (
              <TableWrap minWidth={1180} maxHeight="36rem" stickyFirst>
                <table className="tbl">
                  <thead><tr>
                    <th className="text-left">Sale</th>
                    <SortTh k="customers" label="Khách" sort={sort} />
                    <SortTh k="returnRate" label="Hoàn" sort={sort} />
                    <SortTh k="repeatRateMature" label={`Mua lại qua CSKH (đủ ${r.matureDays} ngày)`} sort={sort} />
                    <SortTh k="cskhOrders" label="Đơn CSKH" sort={sort} />
                    <SortTh k="cskhNet" label="Doanh thu CSKH" sort={sort} />
                    <SortTh k="cskhNetPerCustomer" label="DT CSKH / khách" sort={sort} />
                    <SortTh k="ordersPerRepeater" label="Đơn / khách mua lại" sort={sort} />
                    <SortTh k="avgDaysToRepeat" label="Quay lại sau" sort={sort} />
                    <th className="text-left">Sale chốt gì</th>
                    <th className="text-left">Khách mua lại gì</th>
                  </tr></thead>
                  <tbody>
                    {staff.map((s) => (
                      <tr key={s.staffId} tabIndex={0} className={`cursor-pointer ${pick?.id === s.staffId ? 'bg-tint-2' : ''}`} onClick={() => setPick(pick?.id === s.staffId ? null : { id: s.staffId, name: s.name })}
                        onKeyDown={(e) => { if (e.key === 'Enter') setPick({ id: s.staffId, name: s.name }); }}>
                        <td className="text-left font-medium text-ink">{s.name}<span className="mt-0.5 block">{flag(s)}</span></td>
                        <td className="n">{vi.format(s.customers)}<span className="block text-[11px] font-normal text-ink-3">{vi.format(s.saleOrders)} đơn · {vi.format(s.mature)} đủ {r.matureDays} ngày</span></td>
                        <td className="n">{pct(s.returnRate)}<span className="block text-[11px] font-normal text-ink-3">{vi.format(s.returned)}/{vi.format(s.saleOrders)} đơn</span></td>
                        <td className="n font-semibold">{pct(s.repeatRateMature)}<span className="block text-[11px] font-normal text-ink-3">{vi.format(s.repeatMature)}/{vi.format(s.mature)} · tất cả {vi.format(s.repeat)}/{vi.format(s.customers)}</span></td>
                        <td className="n">{vi.format(s.cskhOrders)}</td>
                        <td className="n">{shortMoney(s.cskhNet)}</td>
                        <td className="n">{shortMoney(s.cskhNetPerCustomer)}</td>
                        <td className="n">{s.ordersPerRepeater === null ? '—' : s.ordersPerRepeater.toFixed(1).replace('.', ',')}</td>
                        <td className="n">{days(s.avgDaysToRepeat)}</td>
                        <td className="max-w-[16rem] text-left text-[12px] text-ink-2">{tagText(s.saleTags)}</td>
                        <td className="max-w-[16rem] text-left text-[12px] text-ink-2">{tagText(s.repeatTags)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot><tr>
                    <td className="text-left">Tổng · {vi.format(staff.length)} Sale</td>
                    <td className="n">{vi.format(t.customers)}</td>
                    <td className="n">{pct(t.returnRate)}<span className="block text-[11px] font-normal text-ink-3">{vi.format(t.returned)}/{vi.format(t.saleOrders)} đơn</span></td>
                    <td className="n">{pct(t.repeatRateMature)}<span className="block text-[11px] font-normal text-ink-3">{vi.format(t.repeatMature)}/{vi.format(t.mature)}</span></td>
                    <td className="n">{vi.format(t.cskhOrders)}</td><td className="n">{shortMoney(t.cskhNet)}</td><td className="n">{shortMoney(t.cskhNetPerCustomer)}</td>
                    <td className="n">{t.ordersPerRepeater === null ? '—' : t.ordersPerRepeater.toFixed(1).replace('.', ',')}</td><td className="n">{days(t.avgDaysToRepeat)}</td>
                    <td className="text-left text-[12px] font-normal">{tagText(t.saleTags)}</td><td className="text-left text-[12px] font-normal">{tagText(t.repeatTags)}</td>
                  </tr></tfoot>
                </table>
              </TableWrap>
            )}
          </ChartCard>

          {pick && (
            <ChartCard icon={UserCheck} title={`Khách của ${pick.name}`} subtitle={`${label} · đơn gốc Sale chốt và các lần khách mua lại sau đó (xếp theo doanh thu CSKH)`}
              more={{ label: 'Đóng', onClick: () => setPick(null) }}>
              {detail.error ? <ErrorBox error={detail.error} onRetry={detail.reload} /> : !detail.data?.list ? <SkeletonTable rows={6} cols={6} /> : !detail.data.list.length ? <EmptyState text="Không có khách." /> : (
                <TableWrap minWidth={1000} maxHeight="40rem">
                  <table className="tbl text-[12.5px]">
                    <thead><tr><th className="text-left">Khách</th><th className="text-left">Đơn gốc (Sale chốt)</th><th>Tiền</th><th className="text-left">Mua lại qua CSKH</th><th>Tiền CSKH</th><th className="text-left">NV CSKH</th><th>Qua Sale</th></tr></thead>
                    <tbody>{detail.data.list.map((c) => (
                      <tr key={`${c.phone}-${c.at}`}>
                        <td className="text-left"><b className="text-ink">{c.name || 'Khách'}</b><span className="block text-[11px] text-ink-3">{c.phone} · {c.posName}</span></td>
                        <td className="text-left">{c.tags.join(', ') || 'Chưa gắn thẻ'}<span className="block text-[11px] text-ink-3">{c.code ? `#${c.code} · ` : ''}{dmy(c.at.slice(0, 10))}{' '}{c.returned ? <StatusChip tone="red">Hoàn</StatusChip> : c.delivered ? <StatusChip tone="green">Đã nhận</StatusChip> : <StatusChip tone="gray">Đang xử lý / giao</StatusChip>}</span></td>
                        <td className="n">{shortMoney(c.net)}</td>
                        <td className="text-left">{c.cskhOrders ? <>{vi.format(c.cskhOrders)} đơn · {c.cskhTags.join(', ') || 'Chưa gắn thẻ'}<span className="block text-[11px] text-ink-3">lần đầu sau {days(c.daysToRepeat)}{c.cskhOrders > 1 && c.cskhLast ? ` · gần nhất ${dmy(c.cskhLast.slice(0, 10))}` : ''}</span></> : <span className="text-ink-4">Chưa mua lại</span>}</td>
                        <td className="n">{c.cskhOrders ? shortMoney(c.cskhNet) : '—'}</td>
                        <td className="text-left text-ink-2">{c.cskhStaff.join(', ') || '—'}</td>
                        <td className="n">{c.saleAgain ? `${vi.format(c.saleAgain)} đơn` : '—'}</td>
                      </tr>
                    ))}</tbody>
                  </table>
                </TableWrap>
              )}
            </ChartCard>
          )}
          <SaleGroupLadderBlock posIds={posIds} start={start} end={end} label={label} staff={r.staff.map((x) => ({ id: x.staffId, name: x.name }))} />
          <SaleLadderBlock posIds={posIds} staff={r.staff.map((x) => ({ id: x.staffId, name: x.name }))} />
          <Definitions items={r.definitions} />
        </>
      )}
    </div>
  );
}

type SaleGroupLadderRes = { customers: number; other: number; approx: number; groups: (LadderLine & { label: string })[]; total: LadderLine; steps: number; definitions: Record<string, string> };

/** Khách mới Sale đưa về trong kỳ, chia theo nhóm sản phẩm của đơn đầu (Kháng sinh / Combo) như bảng T0, T1, T2 bên CSKH. */
function SaleGroupLadderBlock({ posIds, start, end, label, staff }: { posIds: string[]; start: string; end: string; label: string; staff: { id: string; name: string }[] }) {
  const [staffId, setStaffId] = useState('');
  const base = `/api/reports/sale-ladder?${new URLSearchParams({ by: 'group', start, end, posIds: posIds.join(','), ...(staffId ? { staffId } : {}) })}`;
  const api = useApi<SaleGroupLadderRes>(base, { keep: false });
  const [pick, setPick] = useState<LadderPick | null>(null);
  const r = api.data;
  const who = staff.find((x) => x.id === staffId)?.name;
  return (
    <ChartCard icon={Repeat} title={`Khách Sale đưa về · T0, T1, T2 theo nhóm sản phẩm${who ? ` · ${who}` : ''}`} loading={api.loading && !r} info={r ? Object.values(r.definitions).join(' ') : undefined}
      subtitle={`${label} · T0 = đơn đã nhận đầu tiên của khách do Sale bán trong kỳ, xếp theo Kháng sinh / Combo · T1 = lần mua thứ 2, T2 = lần thứ 3… (ai bán cũng tính, chủ yếu qua CSKH) · bấm số để xem danh sách khách và xuất Excel`}
      action={<Select value={staffId || '__all'} items={{ __all: 'Tất cả Sale', ...Object.fromEntries(staff.map((x) => [x.id, x.name])) }} onValueChange={(v) => setStaffId(v === '__all' ? '' : String(v))}>
        <SelectTrigger className="min-w-40 text-xs" aria-label="Sale"><SelectValue /></SelectTrigger>
        <SelectContent><SelectItem value="__all">Tất cả Sale</SelectItem>{staff.map((x) => <SelectItem key={x.id} value={x.id}>{x.name}</SelectItem>)}</SelectContent>
      </Select>}>
      {api.error && !r ? <ErrorBox error={api.error} onRetry={api.reload} /> : !r ? <SkeletonTable rows={3} cols={8} /> : !r.customers ? <EmptyState text="Chưa có khách mới Sale đưa về (đơn đầu đã nhận) trong kỳ này." /> : (
        <LadderTable first="Đơn đầu (T0)" steps={r.steps} rows={r.groups.map((g) => ({ key: g.label, label: g.label, line: g }))}
          extra={[ladderExtras.cross, ladderExtras.later, ladderExtras.days]} total={{ label: 'Tổng 2 nhóm', line: r.total }} onPick={setPick} picked={pick} />
      )}
      {r && pick && <LadderMembers key={`${base}|${pick.row}|${pick.step}`} baseUrl={base} pick={pick} onClose={() => setPick(null)} title={`khach-sale-${who ?? 'tat-ca'}`} />}
      {r && (r.other || r.approx) ? <p className="m-0 mt-2 text-[12px] text-ink-3">
        {r.other ? `${vi.format(r.other)} khách có đơn đầu không thuộc Kháng sinh hay Combo nên không tính. ` : ''}
        {r.approx ? `${vi.format(r.approx)} đơn chưa gắn thẻ nên chưa xét tên sản phẩm (không vào nhóm nào) — chọn một Sale hoặc kỳ ngắn hơn để số chính xác hơn.` : ''}
      </p> : null}
    </ChartCard>
  );
}

type SaleLadderRes = { approx: number; months: (LadderLine & { month: string; followDays: number })[]; total: LadderLine; steps: number; definitions: Record<string, string> };

/** Khách mới Sale đưa về theo tháng của đơn đã nhận đầu tiên: bao nhiêu khách mua tiếp lần 2, 3… (6 tháng gần nhất). */
function SaleLadderBlock({ posIds, staff }: { posIds: string[]; staff: { id: string; name: string }[] }) {
  const [staffId, setStaffId] = useState('');
  const [group, setGroup] = useState<'' | 'Kháng sinh' | 'Combo'>('');
  const api = useApi<SaleLadderRes>(`/api/reports/sale-ladder?${new URLSearchParams({ posIds: posIds.join(','), ...(staffId ? { staffId } : {}), ...(group ? { group } : {}) })}`);
  const r = api.data;
  const who = staff.find((x) => x.id === staffId)?.name;
  return (
    <ChartCard icon={Repeat} title={`Khách mới Sale đưa về · mua tiếp theo tháng${who ? ` · ${who}` : ''}${group ? ` · ${group}` : ''}`} loading={api.loading && !r} info={r ? Object.values(r.definitions).join(' ') : undefined}
      subtitle="Mỗi dòng = khách có đơn đã nhận ĐẦU TIÊN do Sale bán trong tháng đó (T0) · T1 = lần mua thứ 2, T2 = lần thứ 3… (ai bán cũng tính, chủ yếu qua CSKH) · tháng gần đây mới theo dõi ít ngày"
      action={<span className="flex flex-wrap items-center gap-2">
        <Select value={staffId || '__all'} items={{ __all: 'Tất cả Sale', ...Object.fromEntries(staff.map((x) => [x.id, x.name])) }} onValueChange={(v) => setStaffId(v === '__all' ? '' : String(v))}>
          <SelectTrigger className="min-w-40 text-xs" aria-label="Sale"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="__all">Tất cả Sale</SelectItem>{staff.map((x) => <SelectItem key={x.id} value={x.id}>{x.name}</SelectItem>)}</SelectContent>
        </Select>
        <SegmentedControl size="sm" ariaLabel="Nhóm sản phẩm đơn đầu" value={group || 'all'} onChange={(v) => setGroup(v === 'all' ? '' : v as 'Kháng sinh' | 'Combo')}
          options={[{ value: 'all', label: 'Tất cả' }, { value: 'Kháng sinh', label: 'Kháng sinh' }, { value: 'Combo', label: 'Combo' }]} />
      </span>}>
      {api.error && !r ? <ErrorBox error={api.error} onRetry={api.reload} /> : !r ? <SkeletonTable rows={6} cols={8} /> : (
        <LadderTable first="Tháng của đơn đầu" steps={r.steps}
          rows={[...r.months].reverse().map((m) => ({ key: m.month, label: `Tháng ${Number(m.month.slice(5))}/${m.month.slice(0, 4)}`, sub: `theo dõi ${vi.format(m.followDays)} ngày`, line: m }))}
          extra={[ladderExtras.later]} total={{ label: 'Tổng 6 tháng', line: r.total }} />
      )}
      {r?.approx ? <p className="m-0 mt-2 text-[12px] text-ink-3">{vi.format(r.approx)} đơn đầu chưa gắn thẻ nên chưa xét tên sản phẩm khi lọc nhóm (không được tính vào nhóm nào) — chọn một Sale để số chính xác hơn.</p> : null}
    </ChartCard>
  );
}
