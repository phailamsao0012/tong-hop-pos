'use client';

// Vận hành đơn theo nhân viên: từ đơn chốt → xuất kho → gửi hàng → đã nhận / hoàn / hủy, giống bảng kho làm tay.
import { usePosIds } from './pos-store';
import { usePeriod } from './period-store';
import { ICON } from './icons';
import { useEffect, useMemo, useRef, useState } from 'react';
import { PosBadge } from './pos-badge';
import { CheckCircle2, PackageCheck, Truck, Warehouse } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { POS } from '@/lib/shared/report-model';
import { PeriodToolbar, PosChips } from './overview-view';
import { OrderOriginFilter, useOrderOrigin } from './order-origin-filter';
import { useTeam } from './team-store';
import { useApi } from './use-api';
import { StaleChip } from './stale-chip';
import { ShippingLines } from './shipping-lines';
import { Th, ChartCard, ErrorBox, EmptyState, FoldBlock, Funnel, KpiCard, PageHeader, SegmentedControl, SkeletonKpis, SkeletonTable, SortTh, StatusChip, TableWrap, dmy, money, pct, posName, posVar, shortMoney, toast, vi, type SortState } from './ui-kit';
import { saveXlsx } from '@/app/save-xlsx';
import { BOSS_CANCEL_RED, BOSS_RETURN_RED, COACH_MIN_BASE } from '@/lib/zalo/boss-report';
import { CanXemStrip, KPI_RED, KPI_TIGHT, PageHeadMoi, WhySheet, overCancel, overRet, tileGrid, type CanXemItem, type WhySpec } from './trang-moi';

type Bucket = { orders: number; net: number; gross: number };
type BucketKey = 'closed' | 'processing' | 'shipping' | 'delivered' | 'returned' | 'cancelled' | 'shipped' | 'confirmed' | 'packing' | 'waiting' | 'other' | 'unconfirmed' | 'pending';
type Buckets = Record<BucketKey, Bucket>;
type Report = {
  period: { start: string; end: string }; basis: 'confirmed' | 'created'; total: Buckets;
  byEmployee: { sellerId: string; name: string; department: string | null; posIds: string[]; buckets: Buckets }[];
  byPos: { posId: string; posName: string; buckets: Buckets }[];
  departments: string[]; definitions: Record<string, string>;
};
type ColGroup = 'orders' | 'money' | 'rate';
const rate = (a: number, b: number) => b ? a / b * 100 : null;
const COLS: { key: string; label: string; group: ColGroup; get: (b: Buckets) => number | null; money?: boolean; tone?: string }[] = [
  { key: 'closed', label: 'Đơn chốt', group: 'orders', get: (b) => b.closed.orders },
  { key: 'processing', label: 'Chưa xuất kho', group: 'orders', get: (b) => b.processing.orders },
  { key: 'shipped', label: 'Đã xuất đi', group: 'orders', get: (b) => b.shipped.orders },
  { key: 'shipping', label: 'Đang giao', group: 'orders', get: (b) => b.shipping.orders },
  { key: 'delivered', label: 'Đã nhận', group: 'orders', get: (b) => b.delivered.orders },
  { key: 'returned', label: 'Hoàn', group: 'orders', get: (b) => b.returned.orders },
  { key: 'cancelled', label: 'Hủy', group: 'orders', get: (b) => b.cancelled.orders },
  { key: 'successRate', label: '% thành công', group: 'rate', get: (b) => rate(b.delivered.orders, b.shipped.orders) },
  { key: 'shippingRate', label: '% đang giao', group: 'rate', get: (b) => rate(b.shipping.orders, b.shipped.orders) },
  { key: 'returnRate', label: 'Tỷ lệ hoàn', group: 'rate', get: (b) => rate(b.returned.orders, b.shipped.orders) },
  { key: 'shipRate', label: 'Chuyển hàng/chốt', group: 'rate', get: (b) => rate(b.shipped.orders, b.closed.orders) },
  { key: 'closedNet', label: 'Doanh thu chốt', group: 'money', get: (b) => b.closed.net, money: true },
  { key: 'shippedNet', label: 'Doanh thu xuất đi', group: 'money', get: (b) => b.shipped.net, money: true },
  { key: 'deliveredNet', label: 'Doanh thu thành công', group: 'money', get: (b) => b.delivered.net, money: true },
  { key: 'aov', label: 'GTTB đơn chốt (AOV)', group: 'money', get: (b) => b.closed.orders ? b.closed.net / b.closed.orders : null, money: true },
  { key: 'shippingNet', label: 'Đang giao (tiền)', group: 'money', get: (b) => b.shipping.net, money: true },
  { key: 'returnedNet', label: 'Doanh thu hoàn', group: 'money', get: (b) => b.returned.net, money: true },
  { key: 'successMoneyRate', label: '% thành công (tiền)', group: 'rate', get: (b) => rate(b.delivered.net, b.shipped.net) },
  { key: 'returnMoneyRate', label: 'Tỷ lệ hoàn (tiền)', group: 'rate', get: (b) => rate(b.returned.net, b.shipped.net) },
  { key: 'shipMoneyRate', label: 'Chuyển hàng/chốt (tiền)', group: 'rate', get: (b) => rate(b.shipped.net, b.closed.net) },
];
// Nhóm cột hiện trong bảng nhân viên (chỉ là bộ lọc hiển thị; xuất Excel luôn đủ cột).
const GROUP_META: Record<ColGroup, { label: string; cls: string }> = { orders: { label: 'Số đơn', cls: 'text-primary' }, rate: { label: 'Tỷ lệ', cls: 'text-t-blue' }, money: { label: 'Tiền', cls: 'text-t-orange' } };
const GROUP_OPTIONS: { value: 'all' | ColGroup; label: string }[] = [{ value: 'all', label: 'Tất cả' }, { value: 'orders', label: 'Số đơn' }, { value: 'rate', label: 'Tỷ lệ' }, { value: 'money', label: 'Tiền' }];
const BASIS_OPTIONS: { value: 'confirmed' | 'created'; label: string; title: string }[] = [{ value: 'confirmed', label: 'Giờ chốt đơn', title: 'Theo giờ chốt đơn (như Pancake)' }, { value: 'created', label: 'Ngày tạo đơn', title: 'Theo ngày tạo đơn' }];

export function PipelineView({ uiMoi = false }: { /** Cờ THP_UI_MOI: bật thì bố cục kiểu mới, tắt thì y như cũ. */ uiMoi?: boolean } = {}) {
  // Giao diện mới: khung "Vì sao ra số này" đang mở (null = đóng).
  const [why, setWhy] = useState<WhySpec | null>(null);
  const team = useTeam();
  const { orderOrigin, marketerId } = useOrderOrigin(team);
  const { preset, start, end, setPreset, setStart, setEnd } = usePeriod();
  const [posIds, setPosIds] = usePosIds();
  const [basis, setBasis] = useState<'confirmed' | 'created'>('confirmed');
  const [department, setDepartment] = useState('all');
  const [sortKey, setSortKey] = useState('closed');
  const [colGroup, setColGroup] = useState<'all' | ColGroup>('all');
  // Số lần trước hiện ngay (useApi đọc bản lưu trong trình duyệt); đổi kỳ / POS / cách tính thì tải lại, request cũ bị hủy.
  const url = useMemo(() => `/api/reports/pipeline?${new URLSearchParams({ start, end, posIds: posIds.join(','), basis, team, orderOrigin, marketerId })}`, [start, end, posIds, basis, team, orderOrigin, marketerId]);
  const { data: report, at, stale, loading, error, reload } = useApi<Report>(url, { keep: false });
  // "Tải lại": báo toast khi lượt tải thủ công xong (thành công hay lỗi).
  const manualRef = useRef(false);
  const update = () => { manualRef.current = true; reload(); };
  useEffect(() => {
    if (loading || !manualRef.current) return;
    manualRef.current = false;
    if (error) toast('Không tải lại được báo cáo.', { kind: 'error' });
    else toast('Đã cập nhật báo cáo vận hành đơn');
  }, [loading, error, report]);
  const busy = loading && !stale;

  const rows = useMemo(() => {
    const col = COLS.find((c) => c.key === sortKey) ?? COLS[0];
    return (report?.byEmployee ?? []).filter((e) => department === 'all' || (department === '__none' ? !e.department : e.department === department))
      .sort((a, b) => (col.get(b.buckets) ?? -1) - (col.get(a.buckets) ?? -1));
  }, [report, department, sortKey]);
  const totals = useMemo(() => {
    const t: Buckets = Object.fromEntries((Object.keys(report?.total ?? {}) as BucketKey[]).map((k) => [k, { orders: 0, net: 0, gross: 0 }])) as Buckets;
    for (const e of rows) for (const k of Object.keys(t) as BucketKey[]) { t[k].orders += e.buckets[k].orders; t[k].net += e.buckets[k].net; t[k].gross += e.buckets[k].gross; }
    return t;
  }, [rows, report]);
  const T = report ? totals : null;
  const cell = (c: typeof COLS[number], b: Buckets) => { const v = c.get(b); return c.group === 'rate' ? pct(v) : c.money ? money(v) : vi.format(v ?? 0); };
  const shownCols = colGroup === 'all' ? COLS : COLS.filter((c) => c.group === colGroup);
  // Nhóm tiêu đề (Số đơn / Tỷ lệ / Tiền) theo thứ tự cột đang hiện, để hàng tiêu đề trên gộp đúng số cột.
  const headGroups = shownCols.reduce<{ group: ColGroup; span: number }[]>((acc, c) => { const last = acc[acc.length - 1]; if (last && last.group === c.group) last.span++; else acc.push({ group: c.group, span: 1 }); return acc; }, []);
  // Tiêu đề cột bấm được (SortTh): luôn giảm dần theo cột đã chọn, khớp với ô "Sắp xếp".
  const sort: SortState = { key: sortKey, desc: true, toggle: (k) => setSortKey(String(k)), mark: () => '' };

  const exportExcel = async () => {
    if (!report) return;
    const XLSX = await import('xlsx');
    const wb = XLSX.utils.book_new();
    const header = ['Nhân viên', 'Bộ phận', 'POS', ...COLS.map((c) => c.label)];
    const line = (name: string, dept: string, pos: string, b: Buckets) => [name, dept, pos, ...COLS.map((c) => { const v = c.get(b); return c.group === 'rate' ? (v === null ? '' : Number(v.toFixed(2))) : Math.round(v ?? 0); })];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
      [`Vận hành đơn theo nhân viên · ${report.period.start} → ${report.period.end} · ${basis === 'confirmed' ? 'theo giờ chốt' : 'theo ngày tạo'}`], [],
      header, ...rows.map((e) => line(e.name, e.department ?? '', e.posIds.map((id) => POS.find((p) => p.id === id)?.name ?? id).join(', '), e.buckets)), line('Tổng', '', '', totals),
    ]), 'Theo nhân viên');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['POS', ...COLS.map((c) => c.label)], ...report.byPos.map((p) => line(p.posName, '', '', p.buckets).filter((_, i) => i !== 1 && i !== 2)), line('Tổng', '', '', report.total).filter((_, i) => i !== 1 && i !== 2)]), 'Theo POS');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(Object.entries(report.definitions).map(([k, v]) => [k, v])), 'Cách tính');
    saveXlsx(XLSX, wb, `van-hanh-don_${report.period.start}_${report.period.end}.xlsx`);
    toast('Đã xuất Excel vận hành đơn');
  };

  const period = `${dmy(start)}/${start.slice(0, 4)} – ${dmy(end)}/${end.slice(0, 4)}`;
  const kpiTip = (current: string, definition: string) => ({ period, current, definition });

  // [khối chung] Các khối dùng chung cho bố cục cũ và bố cục kiểu mới (cờ THP_UI_MOI): cùng JSX, chỉ chỗ đặt khác nhau.
  // fold: chỉ bố cục mới truyền (thu gọn thẻ); bố cục cũ không truyền nên thẻ y như trước.
  const periodBar = () => (
      <PeriodToolbar preset={preset} start={start} end={end} onPreset={setPreset}
        onStart={setStart} onEnd={setEnd} loading={loading} onReload={update}
        extra={
          <>
            <span className="px-1 text-xs font-semibold text-ink-2">Tính theo</span>
            <SegmentedControl ariaLabel="Tính theo" size="sm" value={basis} onChange={setBasis} options={BASIS_OPTIONS} />
            {report && (
              <>
                <span className="px-1 text-xs font-semibold text-ink-2">Bộ phận</span>
                <Select value={department} items={{ all: 'Tất cả bộ phận', ...Object.fromEntries(report.departments.map((d) => [d, d])), __none: 'Chưa có bộ phận' }} onValueChange={(v) => setDepartment(String(v))}>
                  <SelectTrigger className="min-w-40" aria-label="Bộ phận"><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="all">Tất cả bộ phận</SelectItem>{report.departments.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}<SelectItem value="__none">Chưa có bộ phận</SelectItem></SelectContent>
                </Select>
              </>
            )}
          </>
        } />
  );
  const flowCard = (report: Report, T: Buckets) => (
            <ChartCard icon={Truck} title="Hành trình đơn trong kỳ" subtitle={report.definitions.flow}>
              <Funnel steps={[
                { label: 'Đơn chốt', value: T.closed.orders, note: shortMoney(T.closed.net) },
                { label: 'Đã xuất đi (shipper đã lấy)', value: T.shipped.orders, note: `${pct(rate(T.shipped.orders, T.closed.orders))} chuyển hàng/chốt` },
                { label: 'Đã nhận', value: T.delivered.orders, note: `${pct(rate(T.delivered.orders, T.shipped.orders))} thành công` },
              ]} />
              <div className="mt-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-5">
                {([['pending', 'Chờ xác nhận'], ['confirmed', 'Đã xác nhận'], ['packing', 'Đang đóng hàng'], ['waiting', 'Chờ chuyển hàng'], ['other', 'Chờ hàng / in']] as const).map(([k, l]) => (
                  <div key={k} className="rounded-lg bg-surface-2 p-2.5 transition-colors duration-[var(--dur)] ease-[var(--ease)] hover:bg-surface-3">
                    <div className="truncate text-[11px] text-ink-3" title={l}>{l}</div>
                    <div className="num text-lg leading-tight text-ink">{vi.format(T[k].orders)}</div>
                    <div className="num text-[11px] text-ink-3">{shortMoney(T[k].net)}</div>
                  </div>
                ))}
              </div>
            </ChartCard>
  );
  const posCard = (report: Report, fold?: { storageKey: string; summary?: string }) => (
            <ChartCard collapse={fold} icon={PackageCheck} title="Theo POS" subtitle="Cùng bộ lọc kỳ và bộ phận (bộ phận áp cho bảng nhân viên)">
              <TableWrap minWidth={640}>
                <table className="tbl">
                  <thead><tr><Th>POS</Th><Th className="n">Chốt</Th><Th className="n">Xuất đi</Th><Th className="n">Đã nhận</Th><Th className="n">% TC</Th><Th className="n">Hoàn</Th><Th className="n">% hoàn</Th><Th className="n">Hủy</Th><Th className="n">DT thành công</Th></tr></thead>
                  <tbody>
                    {report.byPos.map((p) => (
                      <tr key={p.posId}>
                        <td className="font-medium"><PosBadge posId={p.posId} size={16} className="mr-2 align-middle" />{p.posName}</td>
                        <td className="n">{vi.format(p.buckets.closed.orders)}</td><td className="n">{vi.format(p.buckets.shipped.orders)}</td><td className="n text-primary">{vi.format(p.buckets.delivered.orders)}</td>
                        <td className="n">{pct(rate(p.buckets.delivered.orders, p.buckets.shipped.orders))}</td><td className="n">{vi.format(p.buckets.returned.orders)}</td><td className="n">{pct(rate(p.buckets.returned.orders, p.buckets.shipped.orders))}</td>
                        <td className="n">{vi.format(p.buckets.cancelled.orders)}</td><td className="n">{money(p.buckets.delivered.net)}</td>
                      </tr>
                    ))}
                    {!report.byPos.length && <tr><td colSpan={9} className="py-4 text-center text-xs text-ink-3">Không có đơn trong kỳ.</td></tr>}
                  </tbody>
                  {report.byPos.length > 1 && (
                    <tfoot>
                      <tr><td>Tổng</td><td className="n">{vi.format(report.total.closed.orders)}</td><td className="n">{vi.format(report.total.shipped.orders)}</td><td className="n">{vi.format(report.total.delivered.orders)}</td>
                        <td className="n">{pct(rate(report.total.delivered.orders, report.total.shipped.orders))}</td><td className="n">{vi.format(report.total.returned.orders)}</td><td className="n">{pct(rate(report.total.returned.orders, report.total.shipped.orders))}</td>
                        <td className="n">{vi.format(report.total.cancelled.orders)}</td><td className="n">{money(report.total.delivered.net)}</td></tr>
                    </tfoot>
                  )}
                </table>
              </TableWrap>
            </ChartCard>
  );
  const staffCard = (report: Report) => (
          <ChartCard icon={CheckCircle2} title={`Theo nhân viên · ${rows.length} người`} subtitle={`${report.definitions.shipped} ${report.definitions.rates}`}
            action={
              <div className="flex flex-wrap items-center gap-2">
                <SegmentedControl ariaLabel="Nhóm cột hiển thị" size="sm" value={colGroup} onChange={setColGroup} options={GROUP_OPTIONS} />
                <Select value={sortKey} items={Object.fromEntries(COLS.map((c) => [c.key, c.label]))} onValueChange={(v) => setSortKey(String(v))}>
                  <SelectTrigger className="min-w-48 text-xs" aria-label="Sắp xếp theo"><span className="text-ink-3">Sắp xếp:</span>&nbsp;<SelectValue /></SelectTrigger>
                  <SelectContent>{COLS.map((c) => <SelectItem key={c.key} value={c.key}>{c.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            }>
            {rows.length ? (
              <TableWrap maxHeight="40rem" sticky stickyFirst minWidth={colGroup === 'all' ? 1280 : 720}>
                <table className="tbl sticky-first">
                  <thead>
                    {/* Hàng nhóm cột không dính (tránh đè lên hàng tên cột khi cuộn); hàng tên cột dính đầu bảng. */}
                    <tr className="[&>th]:static [&>th]:py-1"><th aria-hidden="true" /><th aria-hidden="true" />{headGroups.map((g, i) => <Th key={i} colSpan={g.span} className={`text-center ${GROUP_META[g.group].cls}`}>{GROUP_META[g.group].label}</Th>)}</tr>
                    <tr><Th>Họ và tên</Th><Th>Bộ phận</Th>{shownCols.map((c) => <SortTh key={c.key} k={c.key} label={c.label} sort={sort} />)}</tr>
                  </thead>
                  <tbody>
                    {rows.map((e, i) => (
                      <tr key={e.sellerId || 'none'}>
                        <td className="font-medium"><span className="num mr-1.5 inline-block w-5 text-right text-xs text-ink-4">{i + 1}</span>{e.name}<div className="pl-[26px] text-[11px] font-normal text-ink-3">{e.posIds.map((id) => <span key={id} className="mr-1.5"><PosBadge posId={id} size={14} className="mr-0.5" />{posName(id)}</span>)}</div></td>
                        <td className="mut text-xs">{e.department ?? '—'}</td>
                        {shownCols.map((c) => {
                          const v = c.get(e.buckets);
                          const bad = (c.key === 'returnRate' || c.key === 'returnMoneyRate') && (v ?? 0) > 10;
                          const good = (c.key === 'successRate' || c.key === 'successMoneyRate') && (v ?? 0) >= 85;
                          const key = c.key === sortKey;
                          return <td key={c.key} className={`n ${key ? 'bg-tint-2/60' : ''} ${bad ? 'text-bad' : good ? 'text-good' : c.key === 'closed' || c.key === 'delivered' || c.key === 'deliveredNet' ? 'text-ink' : 'text-ink-2'}`}>{cell(c, e.buckets)}</td>;
                        })}
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr><td>Tổng</td><td />{shownCols.map((c) => <td key={c.key} className="n">{cell(c, totals)}</td>)}</tr>
                  </tfoot>
                </table>
              </TableWrap>
            ) : <EmptyState text="Không có nhân viên có đơn trong kỳ với bộ lọc này." />}
            <p className="mt-3 flex flex-wrap items-center gap-1.5 text-xs text-ink-3">{report.definitions.basis} <StatusChip tone="red">Đỏ: tỷ lệ hoàn trên 10%</StatusChip> <StatusChip tone="green">Xanh: thành công từ 85%</StatusChip></p>
          </ChartCard>
  );
  // [hết khối chung]
  // Thanh chọn kỳ dùng hàm update (đọc manualRef): dựng một lần, cả hai bố cục dùng chung phần tử này (luật react-compiler).
  const periodEl = periodBar();

  // ===== Bố cục kiểu mới (cờ THP_UI_MOI; plan "giao diện mới cả trang trong" 27/11/2026). Cờ tắt thì nhánh này không chạy. =====
  // Trên xuống: đầu trang (PageHeadMoi: chọn kỳ kèm cách tính, bộ phận; StaleChip, Excel; POS) → lọc nguồn đơn
  // → "Cần xem" (hoàn ÷ đã xuất từ 7%, hủy sau chốt ÷ đơn chốt từ 5%: cả trang, từng POS, từng người từ 20 đơn) → một hàng 6 ô số
  // (bấm mở "Vì sao ra số này") → Hành trình đơn → bảng chính Theo nhân viên → khối phụ thu gọn: Theo POS, Theo đơn vị vận chuyển.
  if (uiMoi) {
    const scope = `${period} · ${posIds.length <= 3 ? posIds.map(posName).join(', ') : `${vi.format(posIds.length)} POS`} · ${basis === 'confirmed' ? 'theo giờ chốt' : 'theo ngày tạo'} · chốt → xuất kho → gửi hàng → đã nhận / hoàn / hủy`;
    const head = <PageHeadMoi title="Vận hành đơn theo nhân viên" scope={scope} hint="Chốt → xuất kho → gửi hàng → đã nhận / hoàn / hủy" tools={periodEl}
      right={<><StaleChip stale={stale} at={at} loading={loading} error={report ? error : null} onRetry={reload} /><Button onClick={exportExcel} disabled={!report}>Xuất Excel</Button></>}
      pos={<PosChips posIds={posIds} onChange={setPosIds} />} />;
    if (!report || !T) return <div className="min-w-0 space-y-4">{head}<OrderOriginFilter team={team} />{error ? <ErrorBox error={error} onRetry={reload} /> : <SkeletonKpis count={6} className="sm:grid-cols-3 xl:grid-cols-6" />}</div>;
    const retOf = (b: Buckets) => rate(b.returned.orders, b.shipped.orders), canOf = (b: Buckets) => rate(b.cancelled.orders, b.closed.orders);
    const whyB = (who: string, b: Buckets, kind: 'ret' | 'cancel'): WhySpec => {
      const v = kind === 'ret' ? retOf(b) : canOf(b), over = kind === 'ret' ? overRet(v) : overCancel(v);
      return {
        title: `${kind === 'ret' ? 'Tỷ lệ hoàn' : 'Hủy sau chốt'} · ${who}`, value: pct(v), tone: over ? 'bad' : undefined, scope, mark: kind === 'ret' ? `Đỏ từ ${BOSS_RETURN_RED}%` : `Đỏ từ ${BOSS_CANCEL_RED}%`,
        rows: kind === 'ret'
          ? [{ label: 'Đơn hoàn', value: vi.format(b.returned.orders) }, { label: 'Đơn đã xuất đi', value: vi.format(b.shipped.orders) }, { label: '= Tỷ lệ hoàn', value: pct(v), strong: true, tone: over ? 'bad' : undefined }]
          : [{ label: 'Đơn hủy sau chốt', value: vi.format(b.cancelled.orders) }, { label: 'Đơn chốt', value: vi.format(b.closed.orders) }, { label: '= Hủy sau chốt', value: pct(v), strong: true, tone: over ? 'bad' : undefined }],
        definition: kind === 'ret' ? 'Tỷ lệ hoàn = hoàn ÷ đã xuất đi.' : 'Hủy = đơn bị hủy sau khi đã chốt; % tính trên đơn chốt.',
      };
    };
    const need: CanXemItem[] = [];
    const scan = (key: string, who: string, b: Buckets, team: boolean) => {
      const h = retOf(b), x = canOf(b);
      if (overRet(h) && (team || b.shipped.orders >= COACH_MIN_BASE)) need.push({ key: `r-${key}`, team, text: `${who}: hoàn ${pct(h)}`, gap: (h ?? 0) - BOSS_RETURN_RED, onClick: () => setWhy(whyB(who, b, 'ret')) });
      if (overCancel(x) && (team || b.closed.orders >= COACH_MIN_BASE)) need.push({ key: `c-${key}`, team, text: `${who}: hủy sau chốt ${pct(x)}`, gap: (x ?? 0) - BOSS_CANCEL_RED, onClick: () => setWhy(whyB(who, b, 'cancel')) });
    };
    scan('all', 'Cả trang', T, true);
    if (report.byPos.length > 1) for (const p of report.byPos) scan(p.posId, p.posName, p.buckets, false);
    for (const e of rows) scan(e.sellerId || 'none', e.name, e.buckets, false);
    const tile = (label: string, b: { orders: number; net: number }, definition: string, extra: { label: string; value: string }[] = []) => () => setWhy({ title: label, value: `${vi.format(b.orders)} đơn`, scope, rows: [{ label: 'Tiền', value: money(b.net) }, ...extra], definition });
    const k = (s: string) => `ui-moi:pipeline:${s}`;
    return (
      <div className="min-w-0 space-y-4">
        {head}
        <OrderOriginFilter team={team} />
        <CanXemStrip items={need} note={`Hoàn ÷ đã xuất từ ${BOSS_RETURN_RED}%, hủy sau chốt từ ${BOSS_CANCEL_RED}% · POS / người từ ${COACH_MIN_BASE} đơn`} />
        <div className={tileGrid(6)} aria-busy={busy || undefined}>
          <KpiCard icon={CheckCircle2} tone="green" label={basis === 'confirmed' ? 'Đơn chốt trong kỳ' : 'Đơn tạo trong kỳ đã chốt'} className={KPI_TIGHT} value={vi.format(T.closed.orders)}
            note={`Doanh số ${shortMoney(T.closed.gross)}${basis === 'created' && T.unconfirmed.orders ? ` · ${vi.format(T.unconfirmed.orders)} chưa chốt` : ''}`}
            onClick={tile('Đơn chốt', T.closed, report.definitions.basis, [{ label: 'Doanh số', value: money(T.closed.gross) }])} />
          <KpiCard icon={Warehouse} tone="gray" label="Chưa xuất kho" className={KPI_TIGHT} value={vi.format(T.processing.orders)} note={`${pct(rate(T.processing.orders, T.closed.orders))} đơn chốt · ${shortMoney(T.processing.net)}`}
            onClick={tile('Chưa xuất kho', T.processing, 'Chưa xuất = đã xác nhận, đang đóng hàng, chờ chuyển hàng, chờ hàng/in.', [{ label: '% đơn chốt', value: pct(rate(T.processing.orders, T.closed.orders)) }])} />
          <KpiCard icon={ICON.shipping} tone="orange" label="Đang giao" className={KPI_TIGHT} value={vi.format(T.shipping.orders)} note={`${pct(rate(T.shipping.orders, T.shipped.orders))} đơn đã xuất · ${shortMoney(T.shipping.net)}`}
            onClick={tile('Đang giao', T.shipping, 'Đang giao = shipper đã lấy, chưa giao xong; % tính trên đơn đã xuất đi.', [{ label: 'Đơn đã xuất đi', value: vi.format(T.shipped.orders) }])} />
          <KpiCard icon={PackageCheck} tone="teal" label="Đã nhận (thành công)" className={KPI_TIGHT} value={vi.format(T.delivered.orders)} note={`${pct(rate(T.delivered.orders, T.shipped.orders))} đơn đã xuất · ${shortMoney(T.delivered.net)}`}
            onClick={tile('Đã nhận', T.delivered, '% thành công = đã nhận ÷ đã xuất đi.', [{ label: 'Đơn đã xuất đi', value: vi.format(T.shipped.orders) }, { label: '% thành công', value: pct(rate(T.delivered.orders, T.shipped.orders)) }])} />
          <KpiCard icon={ICON.returned} tone="purple" label="Hoàn" className={`${KPI_TIGHT} ${overRet(retOf(T)) ? KPI_RED : ''}`} value={vi.format(T.returned.orders)} note={`Tỷ lệ hoàn ${pct(retOf(T))} · ${shortMoney(T.returned.gross)}`}
            onClick={() => setWhy(whyB('Cả trang', T, 'ret'))} />
          <KpiCard icon={ICON.cancelled} tone="red" label="Hủy sau chốt" className={`${KPI_TIGHT} ${overCancel(canOf(T)) ? KPI_RED : ''}`} value={vi.format(T.cancelled.orders)} note={`${pct(canOf(T))} đơn chốt`}
            onClick={() => setWhy(whyB('Cả trang', T, 'cancel'))} />
        </div>
        {flowCard(report, T)}
        {staffCard(report)}
        <div className="grid min-w-0 gap-3">
          {posCard(report, { storageKey: k('pos'), summary: `${vi.format(report.byPos.length)} POS` })}
          <FoldBlock icon={Truck} title="Vận đơn theo dòng sản phẩm" storageKey={k('lines')}><ShippingLines start={start} end={end} posIds={posIds} basis={basis} team={team} /></FoldBlock>
        </div>
        <WhySheet spec={why} onClose={() => setWhy(null)} />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <PageHeader eyebrow={period} title="Vận hành đơn theo nhân viên" subtitle="Chốt → xuất kho → gửi hàng → đã nhận / hoàn / hủy"
        badge={<StaleChip stale={stale} at={at} loading={loading} error={report ? error : null} onRetry={reload} />}
        actions={<Button onClick={exportExcel} disabled={!report}>Xuất Excel</Button>} />
      {periodEl}
      <PosChips posIds={posIds} onChange={setPosIds} />
      <OrderOriginFilter team={team} />
      {error && !report && <ErrorBox error={error} onRetry={reload} />}
      {!report && !error && (
        <>
          <SkeletonKpis count={6} className="2xl:grid-cols-6" />
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
            <ChartCard icon={Truck} title="Hành trình đơn trong kỳ" loading><div className="h-48" /></ChartCard>
            <ChartCard icon={PackageCheck} title="Theo POS"><SkeletonTable rows={6} cols={6} /></ChartCard>
          </div>
          <ChartCard icon={CheckCircle2} title="Theo nhân viên"><SkeletonTable rows={8} cols={8} /></ChartCard>
        </>
      )}
      {report && T && (
        <>
          <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3 2xl:grid-cols-6 transition-opacity duration-[var(--dur)]" aria-busy={busy || undefined}>

            <KpiCard icon={CheckCircle2} tone="green" label={basis === 'confirmed' ? 'Đơn chốt trong kỳ' : 'Đơn tạo trong kỳ đã chốt'} value={vi.format(T.closed.orders)} countUp rawValue={T.closed.orders} format={(n) => vi.format(Math.round(n))}
              note={`Doanh số ${shortMoney(T.closed.gross)}${basis === 'created' && T.unconfirmed.orders ? ` · ${vi.format(T.unconfirmed.orders)} chưa chốt` : ''}`}
              tooltip={kpiTip(`${vi.format(T.closed.orders)} đơn · ${money(T.closed.gross)}`, report.definitions.basis)} />
            <KpiCard icon={Warehouse} tone="gray" label="Chưa xuất kho" value={vi.format(T.processing.orders)} countUp rawValue={T.processing.orders} format={(n) => vi.format(Math.round(n))}
              note={`${pct(rate(T.processing.orders, T.closed.orders))} đơn chốt · ${shortMoney(T.processing.net)}`}
              tooltip={kpiTip(`${vi.format(T.processing.orders)} đơn · ${money(T.processing.net)}`, 'Chưa xuất = đã xác nhận, đang đóng hàng, chờ chuyển hàng, chờ hàng/in.')} />
            <KpiCard icon={ICON.shipping} tone="orange" label="Đang giao" value={vi.format(T.shipping.orders)} countUp rawValue={T.shipping.orders} format={(n) => vi.format(Math.round(n))}
              note={`${pct(rate(T.shipping.orders, T.shipped.orders))} đơn đã xuất · ${shortMoney(T.shipping.net)}`}
              tooltip={kpiTip(`${vi.format(T.shipping.orders)} đơn · ${money(T.shipping.net)}`, 'Đang giao = shipper đã lấy, chưa giao xong; % tính trên đơn đã xuất đi.')} />
            <KpiCard icon={PackageCheck} tone="teal" label="Đã nhận (thành công)" value={vi.format(T.delivered.orders)} countUp rawValue={T.delivered.orders} format={(n) => vi.format(Math.round(n))}
              note={`${pct(rate(T.delivered.orders, T.shipped.orders))} đơn đã xuất · ${shortMoney(T.delivered.net)}`}
              tooltip={kpiTip(`${vi.format(T.delivered.orders)} đơn · ${money(T.delivered.net)}`, '% thành công = đã nhận ÷ đã xuất đi.')} />
            <KpiCard icon={ICON.returned} tone="purple" label="Hoàn" value={vi.format(T.returned.orders)} countUp rawValue={T.returned.orders} format={(n) => vi.format(Math.round(n))}
              note={`Tỷ lệ hoàn ${pct(rate(T.returned.orders, T.shipped.orders))} · ${shortMoney(T.returned.gross)}`}
              tooltip={kpiTip(`${vi.format(T.returned.orders)} đơn · ${money(T.returned.gross)}`, 'Tỷ lệ hoàn = hoàn ÷ đã xuất đi; tiền hoàn tính theo doanh số (tổng giá sản phẩm).')} />
            <KpiCard icon={ICON.cancelled} tone="red" label="Hủy sau chốt" value={vi.format(T.cancelled.orders)} countUp rawValue={T.cancelled.orders} format={(n) => vi.format(Math.round(n))}
              note={`${pct(rate(T.cancelled.orders, T.closed.orders))} đơn chốt`}
              tooltip={kpiTip(`${vi.format(T.cancelled.orders)} đơn`, 'Hủy = đơn bị hủy sau khi đã chốt; % tính trên đơn chốt.')} />
          </div>
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
            {flowCard(report, T)}
            {posCard(report)}
          </div>
          <ShippingLines start={start} end={end} posIds={posIds} basis={basis} team={team} />
          {staffCard(report)}
        </>
      )}
    </div>
  );
}
