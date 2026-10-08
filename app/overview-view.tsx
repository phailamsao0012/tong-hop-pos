'use client';

import { usePosIds } from './pos-store';
import { usePeriod } from './period-store';
import { SectionsGrid, type SectionsReport } from './overview-sections';
import { useEffect, useRef, useState } from 'react';
import { ArrowRight, CalendarDays, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { POS } from '@/lib/report-model';
import { todayVn } from '@/lib/report-time';
import { ErrorBox, PageHeader, ProgressBar, SegmentedControl, SkeletonKpis, Toolbar, Tooltip, dmy, dt, pct, posName, posVar, timeOnly, toast } from './ui-kit';
import { scopedPos, useScope } from './access-store';
import { useApi } from './use-api';
import { StaleChip } from './stale-chip';
import { PosBadge } from './pos-badge';

import { PRODUCT_SEGMENTS, type ProductSegment, type OrderFilters } from '@/lib/order-segments';

type Metrics = {
  orders: number; deletedOrders: number; gross: number; discount: number; net: number; shippingFee: number; cod: number; customers: number;
  closedOrders: number; closedGross: number; closedDiscount: number; closedNet: number; closedShippingFee: number;
  closedCustomers: number | null; closedQuantity: number; closeRate: number | null; assignedOrders: number; assignedCloseRate: number | null;
  averageOrder: number | null; deliveredAverage: number | null;
  groups: Record<'new' | 'confirmed' | 'shipping' | 'delivered' | 'returned' | 'cancelled', { orders: number; net: number }>;
};
type Period = {
  period: { start: string; end: string };
  /** Đếm lại từ đơn gốc để đối chiếu với total (xem reconcile-line.tsx). */ reconcile?: { orders: number; gross: number; discount: number; net: number } | null;
  total: Metrics;
  byPos: (Metrics & { posId: string })[];
  series: (Metrics & { bucket: string; posId: string })[];
  byEmployee: (Metrics & { sellerId: string; name: string; department: string | null; saleGroup: string | null; assignedHidden?: boolean })[];
  byEmployeePos: (Metrics & { posId: string; sellerId: string; name: string; department: string | null; saleGroup: string | null; assignedHidden?: boolean })[];
  byProduct: { posId: string; productId: string; name: string; orders: number; quantity: number; total: number; closedQuantity: number; closedTotal: number; deliveredQuantity: number; deliveredTotal: number; returnedQuantity: number }[];
};
export type OverviewReport = {
  filters?: OrderFilters; productSegments?: (Metrics & { key: string })[]; origins?: (Metrics & { marketerId: string; marketerName: string })[];
  generatedAt: string; groupBy: 'day' | 'week' | 'month'; syncedAt: string | null;
  pos: { id: string; name: string; connected: boolean; status: string; syncedAt: string | null; historyStart: string | null; backfillDone: boolean; backfillMonth: string | null; lastError: string | null }[];
  current: Period; compare: Period | null; definitions: Record<string, string>; departments: string[];
  comparePeriod: { start: string; end: string; cutoff?: string | null } | null; assignedVisible?: boolean;
};

// Bộ lọc kỳ dùng chung cho toàn web (yêu cầu 30/09/2026): cùng một danh sách kỳ, chọn ở trang nào thì sang trang khác vẫn giữ.
import { PRESETS, PRESET_SHORT, presetRange, type PresetKey } from '@/lib/periods';
export { PRESETS, presetRange };
const PRESET_OPTIONS = (Object.keys(PRESETS) as PresetKey[]).map((k) => ({ value: k as string, label: PRESET_SHORT[k], title: PRESETS[k], icon: k === 'custom' ? CalendarDays : undefined }));
const GROUPS = { day: 'Theo ngày', week: 'Theo tuần', month: 'Theo tháng' };
const COMPARES = { none: 'Không so sánh', previous: 'Kỳ liền trước', year: 'Cùng kỳ năm trước', custom: 'Kỳ tùy chọn' };
/** Ô "mục tiêu" trong bảng: thanh tiến độ + % hoàn thành + dòng phụ. */
export function GoalCell({ value, goal, sub }: { value: number; goal: number; sub: string }) {
  if (!goal) return <span className="text-xs text-ink-4">—</span>;
  const d = value / goal * 100;
  return (
    <span className="inline-flex flex-col gap-0.5 align-middle">
      <span className="flex items-center gap-2"><ProgressBar value={value} max={goal} width={56} size="sm" color={d >= 100 ? 'var(--good)' : d >= 70 ? 'var(--warn)' : 'var(--bad)'} /><span className="num text-xs">{pct(d, 0)}</span></span>
      <span className="whitespace-nowrap text-[11px] font-normal text-ink-3">{sub}</span>
    </span>
  );
}

/** Bộ chọn kỳ (kỳ có sẵn + cặp ngày) — một bộ lọc ngày duy nhất cho toàn web, dùng trong PeriodToolbar hoặc gắn vào thanh lọc riêng của trang. */
export function PeriodFields(props: { preset: string; start: string; end: string; onPreset: (v: string) => void; onStart: (v: string) => void; onEnd: (v: string) => void }) {
  const today = todayVn();
  return (
    <>
      <span className="px-1 text-[12.5px] font-semibold text-ink-2">Kỳ</span>
      {/* Màn hình rộng: bộ chọn phân đoạn (mũi tên ←→); màn hình hẹp: menu chọn gọn hơn. Cùng một state. */}
      <SegmentedControl<string> ariaLabel="Kỳ báo cáo" className="hidden lg:inline-flex" value={props.preset} onChange={props.onPreset} options={PRESET_OPTIONS} />
      <Select value={props.preset} items={PRESETS} onValueChange={(v) => props.onPreset(String(v))}>
        <SelectTrigger className="min-w-32 lg:hidden" aria-label="Kỳ báo cáo"><SelectValue /></SelectTrigger>
        <SelectContent>{Object.entries(PRESETS).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}</SelectContent>
      </Select>
      {/* Cặp ngày đi chung một nhóm để mũi tên không bao giờ rớt thành dòng lẻ trên điện thoại. */}
      <div className="flex min-w-0 basis-full items-center gap-2 sm:basis-auto">
        <Input aria-label="Từ ngày" type="date" className="w-auto" value={props.start} max={props.end} onChange={(e) => props.onStart(e.target.value)} />
        <ArrowRight size={14} className="shrink-0 text-ink-4" aria-hidden="true" />
        <Input aria-label="Đến ngày" type="date" className="w-auto" value={props.end} min={props.start} max={today} onChange={(e) => props.onEnd(e.target.value)} />
      </div>
    </>
  );
}

/** Thanh chọn kỳ + so sánh + POS, dùng chung cho các trang có kỳ. */
export function PeriodToolbar(props: {
  preset: string; start: string; end: string; groupBy?: 'day' | 'week' | 'month'; compare?: string; cstart?: string; cend?: string;
  onPreset: (v: string) => void; onStart: (v: string) => void; onEnd: (v: string) => void;
  onGroupBy?: (v: 'day' | 'week' | 'month') => void; onCompare?: (v: string) => void; onCstart?: (v: string) => void; onCend?: (v: string) => void;
  loading?: boolean; onReload?: () => void; onExport?: () => void; exportDisabled?: boolean; extra?: React.ReactNode;
}) {
  return (
    <Toolbar>
      <PeriodFields preset={props.preset} start={props.start} end={props.end} onPreset={props.onPreset} onStart={props.onStart} onEnd={props.onEnd} />
      {props.groupBy && props.onGroupBy && (
        <Select value={props.groupBy} items={GROUPS} onValueChange={(v) => props.onGroupBy!(v as 'day' | 'week' | 'month')}>
          <SelectTrigger className="min-w-32" aria-label="Nhóm theo"><SelectValue /></SelectTrigger>
          <SelectContent>{Object.entries(GROUPS).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}</SelectContent>
        </Select>
      )}
      {props.compare !== undefined && props.onCompare && (
        <>
          <span className="px-1 text-[12.5px] font-semibold text-ink-2">So với</span>
          <Select value={props.compare} items={COMPARES} onValueChange={(v) => props.onCompare!(String(v))}>
            <SelectTrigger className="min-w-40" aria-label="Kỳ so sánh"><SelectValue /></SelectTrigger>
            <SelectContent>{Object.entries(COMPARES).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}</SelectContent>
          </Select>
          {props.compare === 'custom' && (
            <div className="flex min-w-0 basis-full items-center gap-2 sm:basis-auto">
              <Input aria-label="So sánh từ" type="date" className="w-auto" value={props.cstart} onChange={(e) => props.onCstart?.(e.target.value)} />
              <ArrowRight size={14} className="shrink-0 text-ink-4" aria-hidden="true" />
              <Input aria-label="So sánh đến" type="date" className="w-auto" value={props.cend} onChange={(e) => props.onCend?.(e.target.value)} />
            </div>
          )}
        </>
      )}
      {props.extra}
      <div className="ml-auto flex gap-2">
        {props.onReload && (
          <Button variant="outline" className={props.loading ? 'ai-border' : ''} onClick={props.onReload} disabled={props.loading} aria-busy={props.loading || undefined}>
            <RotateCcw size={14} aria-hidden="true" />{props.loading ? 'Đang tính…' : 'Tải lại'}
          </Button>
        )}
        {props.onExport && <Button onClick={props.onExport} disabled={props.exportDisabled}>Xuất Excel</Button>}
      </div>
    </Toolbar>
  );
}

export function PosChips({ posIds, onChange, info }: { posIds: string[]; onChange: (v: string[]) => void; info?: OverviewReport['pos'] }) {
  const scope = useScope();
  const visible = scopedPos(scope);
  if (visible.length <= 1) return null;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-[12.5px] font-semibold text-ink-2">POS:</span>
      {visible.map((p) => {
        const on = posIds.includes(p.id);
        const i = info?.find((x) => x.id === p.id);
        // Trạng thái kết nối / đồng bộ / lịch sử hiện trong tooltip (rê chuột, focus, chạm) thay vì title chỉ hiện khi rê chuột.
        const tip = i ? (
          <>
            <b>{p.name}</b>
            <span className="r"><span>Trạng thái</span><span>{i.lastError ? 'Lỗi đồng bộ' : i.status === 'connected' ? 'Đã kết nối' : i.status}</span></span>
            <span className="r"><span>Đồng bộ</span><span className="num">{dt(i.syncedAt, true)}</span></span>
            <span className="r"><span>Lịch sử</span><span>{i.backfillDone ? 'Đã lấy đủ' : i.backfillMonth ? `đang lấy tháng ${i.backfillMonth.slice(5)}/${i.backfillMonth.slice(0, 4)}` : 'chưa lấy'}</span></span>
            {i.lastError && <span className="how block whitespace-normal">Lỗi: {i.lastError}</span>}
          </>
        ) : null;
        return (
          <Tooltip key={p.id} content={tip}>
            <button type="button" aria-pressed={on}
              onClick={() => onChange(on ? (posIds.length > 1 ? posIds.filter((id) => id !== p.id) : posIds) : [...posIds, p.id])}
              className={`poschip ${on ? '' : 'is-off'}`} style={{ '--c': posVar(p.id) } as React.CSSProperties}>
              <PosBadge posId={p.id} size={26} muted={!on} />
              {p.name}
              {i?.lastError ? <span className="rounded-full bg-bad-bg px-1.5 text-[10.5px] font-bold text-bad">lỗi</span> : i && !i.backfillDone && on ? <span className="rounded-full bg-warn-bg px-1.5 text-[10.5px] font-bold text-warn">lịch sử…</span> : null}
              <span className="ck" aria-hidden="true"><svg viewBox="0 0 12 12" width="9" height="9" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="m2.5 6.2 2.3 2.3 4.7-5" /></svg></span>
            </button>
          </Tooltip>
        );
      })}
      <button type="button" className="link text-[12.5px]" onClick={() => onChange(visible.map((p) => p.id))}>Tất cả</button>
      {/* Lựa chọn POS dùng chung mọi trang và nhớ qua lần mở sau (app/pos-store.ts). */}
      {visible.some((p) => !posIds.includes(p.id)) && <span className="text-[11.5px] text-ink-3">· đang lọc {posIds.filter((id) => visible.some((p) => p.id === id)).length}/{visible.length} POS, giữ nguyên khi sang trang khác</span>}
    </div>
  );
}

// Tổng quan POS (anh Vũ 08/10/2026): chỉ còn 4 bảng Sale, CSKH, MKT, Vận đơn khổ 2x2; các khối cũ (5 ô KPI, đối chiếu,
// số tham chiếu Pancake, biểu đồ, bảng nhân viên / POS / sản phẩm) đã bỏ khỏi trang này.
export function OverviewView() {
  const { preset, start, end, setPreset, setStart, setEnd } = usePeriod();
  const [posIds, setPosIds] = usePosIds();
  const [productSegment, setProductSegment] = useState<ProductSegment>('all');
  const url = `/api/reports/sections?${new URLSearchParams({ start, end, posIds: posIds.join(','), productSegment })}`;
  const { data, at, stale, loading, error, reload: refetch } = useApi<SectionsReport>(url, { refreshMs: 10 * 60000, keep: false });
  const manualRef = useRef(false);
  const reload = () => { manualRef.current = true; refetch(); };
  useEffect(() => { if (!loading && manualRef.current) { manualRef.current = false; if (!error) toast('Đã tải lại số liệu'); } }, [loading, error]);

  const exportExcel = async () => {
    if (!data) return;
    const XLSX = await import('xlsx');
    const { sale, cskh, mkt, shipping } = data;
    const r = (v: number | null) => v === null ? '' : Number(v.toFixed(2));
    const rows: (string | number)[][] = [
      [`Tổng quan POS · ${dmy(start)}/${start.slice(0, 4)} – ${dmy(end)}/${end.slice(0, 4)} · ${posIds.length === POS.length ? 'Tất cả POS' : posIds.map(posName).join(', ')} · ${PRODUCT_SEGMENTS[productSegment]}`], [],
      ['Mục', 'Chỉ số', 'Giá trị'],
      ['Sale', 'Doanh thu', sale.net], ['Sale', 'Đơn chốt', sale.orders], ['Sale', 'Tỷ lệ chốt (%)', r(sale.rate)], ['Sale', 'Đơn lên', sale.created],
      ['CSKH', 'Doanh thu', cskh.net], ['CSKH', 'Đơn chốt', cskh.orders], ['CSKH', 'AOV', r(cskh.aov)], ['CSKH', 'Đơn tự upsell', cskh.self.orders], ['CSKH', 'Doanh thu tự upsell', cskh.self.net], ['CSKH', 'Đơn từ MKT', cskh.fromMkt.orders], ['CSKH', 'Doanh thu từ MKT', cskh.fromMkt.net],
      ['MKT', 'Chi phí', ''], ['MKT', 'Doanh thu', mkt.net], ['MKT', 'Đơn đã xác nhận', mkt.orders], ['MKT', 'Tỷ lệ chốt (%)', r(mkt.rate)], ['MKT', 'AOV', r(mkt.aov)],
      ...([['Tổng', shipping.total], ['Sale', shipping.sale], ['CSKH', shipping.cskh]] as const).flatMap(([k, s]) => [
        [`Vận đơn ${k}`, 'Đơn đi', s.orders], [`Vận đơn ${k}`, 'Doanh số đi', s.net], [`Vận đơn ${k}`, 'Đơn hoàn', s.returned], [`Vận đơn ${k}`, 'Doanh số hoàn', s.returnedNet],
        [`Vận đơn ${k}`, 'Tỷ lệ hoàn theo đơn (%)', r(s.rateOrders)], [`Vận đơn ${k}`, 'Tỷ lệ hoàn theo doanh số (%)', r(s.rateNet)],
      ]),
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), 'Tổng quan');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(Object.entries(data.definitions)), 'Cách tính');
    XLSX.writeFile(wb, `tong-quan-pos_${start}_${end}.xlsx`);
  };

  return (
    <div className="space-y-5">
      <PageHeader eyebrow={`${dmy(start)}/${start.slice(0, 4)} – ${dmy(end)}/${end.slice(0, 4)}`} title="Tổng quan POS"
        subtitle={`Sale · CSKH · MKT · Vận đơn${data?.syncedAt ? ` · đồng bộ ${timeOnly(data.syncedAt)} ${dt(data.syncedAt)}` : ''}`}
        actions={<><StaleChip stale={stale} at={at} loading={loading} error={data ? error : null} onRetry={reload} /><Button onClick={exportExcel} disabled={!data}>Xuất Excel</Button></>} />
      <PeriodToolbar preset={preset} start={start} end={end} onPreset={setPreset} onStart={setStart} onEnd={setEnd} loading={loading} onReload={reload} />
      <PosChips posIds={posIds} onChange={setPosIds} />
      <div className="flex flex-wrap items-center gap-3"><span className="text-sm font-semibold text-ink-2">Nhóm đơn</span>
        <SegmentedControl<ProductSegment> ariaLabel="Nhóm sản phẩm / nhãn đơn" value={productSegment} onChange={setProductSegment} options={Object.entries(PRODUCT_SEGMENTS).map(([value, label]) => ({ value: value as ProductSegment, label }))} />
        <span className="text-xs text-ink-3">Gentadox theo sản phẩm bán · SK + GK theo nhãn đơn Pancake</span>
      </div>
      {error && !data && <ErrorBox error={error} onRetry={reload} />}
      {!data && !error && <SkeletonKpis count={4} className="lg:grid-cols-2" />}
      {data && <div className={loading ? 'opacity-70 transition-opacity' : 'transition-opacity'} aria-busy={loading || undefined}><SectionsGrid data={data} /></div>}
    </div>
  );
}
