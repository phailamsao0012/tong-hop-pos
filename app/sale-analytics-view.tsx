'use client';

// Phân tích Sale (giai đoạn 3b · 26/09/2026): tỷ lệ chốt data, thời gian chốt, giờ vàng (24 khung giờ từng ngày, 05/10/2026),
// chất lượng đơn chốt (hoàn, hủy sau chốt) và bảng xếp hạng từng người.
import { usePosIds } from './pos-store';
import { usePeriod } from './period-store';
import { AiPackButton } from './ai-pack';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Clock, Flame, Trophy } from 'lucide-react';
import { RATE_THRESHOLDS, rateLevel } from '@/lib/metrics';
import type { SaleAnalytics } from '@/lib/sale-analytics';
import { todayVn } from '@/lib/report-time';
import { WEEKDAYS, byWeekday, dayTotal, sumRows, vnDayHour, weekdayOf, type DayHours } from '@/lib/sale-hours';
import { ICON } from './icons';
import { PeriodToolbar, PosChips } from './overview-view';
import { useApi } from './use-api';
import { ChartCard, CountUp, Definitions, EmptyState, ErrorBox, KpiCard, PageHeader, SegmentedControl, SkeletonKpis, SkeletonTable, SortTh, TableWrap, ThinkingLine, TipContent, dmy, pct, shortMoney, useSort, useTip, vi } from './ui-kit';

const WEEKDAY_FULL = ['Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy', 'Chủ nhật'];
export const duration = (m: number | null | undefined) => m === null || m === undefined ? '—'
  : m < 60 ? `${Math.round(m)} phút` : m < 1440 ? `${(m / 60).toFixed(1).replace('.', ',')} giờ` : `${(m / 1440).toFixed(1).replace('.', ',')} ngày`;
const LEVEL_TEXT = { good: 'text-good', warn: 'text-warn', bad: 'text-bad' } as const;

// Giờ vàng 24 khung giờ (05/10/2026): biểu đồ cột 0h–23h của ngày đang chọn (số đổi theo ngày, cột chạy mượt)
// và bảng mọi ngày × 24 khung giờ. Bấm một ngày để xem riêng ngày đó; xem theo ngày hoặc gộp theo thứ.
type Metric = 'a' | 'c' | 'rate' | 'o' | 'net';
const METRICS: { value: Metric; label: string; title: string }[] = [
  { value: 'a', label: 'Số được chia', title: 'Số được chia cho Sale trong khung giờ (theo giờ chia số)' },
  { value: 'c', label: 'Chốt từ số', title: 'Số được chia trong khung giờ đó đã chốt' },
  { value: 'rate', label: '% chốt', title: 'Tỷ lệ chốt data = chốt từ số ÷ số được chia' },
  { value: 'o', label: 'Đơn chốt', title: 'Đơn xác nhận lần đầu trong khung giờ (không tính hủy sau chốt)' },
  { value: 'net', label: 'Doanh thu', title: 'Doanh thu đơn chốt trong khung giờ (theo giờ xác nhận)' },
];
const HOURS = Array.from({ length: 24 }, (_, h) => h);
type Row = DayHours & { key: string; label: string; sub?: string; title: string; note: string; days?: number };
const cellValue = (r: DayHours, m: Metric, h: number) => m === 'rate' ? (r.a[h] ? r.c[h] / r.a[h] * 100 : null) : r[m][h];
const rowTotal = (r: DayHours, m: Metric) => { if (m !== 'rate') return dayTotal(r, m); const a = dayTotal(r, 'a'); return a ? dayTotal(r, 'c') / a * 100 : null; };
/** Số gọn trong ô: 123tr · 5,4tr · 850k (từ 9,95 trở lên bỏ số lẻ để không thành "10,0tr"). */
const fixed = (x: number) => (x >= 9.95 ? x.toFixed(0) : x.toFixed(1)).replace('.', ',');
const tiny = (n: number) => n >= 9.95e8 ? `${fixed(n / 1e9)}tỷ` : n >= 999500 ? `${fixed(n / 1e6)}tr` : n >= 1e3 ? `${Math.round(n / 1e3)}k` : vi.format(Math.round(n));
const fmtCell = (v: number | null, m: Metric) => v === null ? '' : m === 'rate' ? String(Math.round(v)) : !v ? '' : m === 'net' ? tiny(v) : vi.format(v);
const fmtFull = (v: number | null, m: Metric) => v === null ? '—' : m === 'rate' ? pct(v, 0) : m === 'net' ? shortMoney(v) : vi.format(v);

function HourBoard({ days, definition }: { days: DayHours[]; definition: string }) {
  const [metric, setMetric] = useState<Metric>('a');
  const [mode, setMode] = useState<'day' | 'week'>('day');
  const [picked, setPicked] = useState('all');
  // Đồng hồ trang: mỗi phút cập nhật giờ hiện tại để ô giờ đang chạy và các giờ chưa tới của hôm nay tự đổi.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 60000); return () => clearInterval(t); }, []);
  const today = todayVn(now), nowHour = vnDayHour(now).hour;
  const multi = days.length > 1;
  const first = days[0]?.day ?? '', last = days[days.length - 1]?.day ?? '';
  // Dòng theo thứ tự thời gian (dùng cho nút ‹ ›); bảng vẽ ngày mới nhất lên đầu.
  const chrono: Row[] = useMemo(() => mode === 'week' && multi
    ? byWeekday(days).filter((r) => r.days > 0).map((r) => ({ ...r, key: r.day, label: r.day, sub: `${r.days} ngày`, title: `Mọi ${WEEKDAY_FULL[(WEEKDAYS as readonly string[]).indexOf(r.day)] ?? r.day}`, note: `${r.days} ngày trong kỳ, cộng dồn` }))
    : days.map((d) => {
      const w = weekdayOf(d.day), isToday = d.day === today;
      return { ...d, key: d.day, label: `${WEEKDAYS[w]} · ${dmy(d.day)}`, sub: isToday ? 'Hôm nay' : undefined, title: `${WEEKDAY_FULL[w]}, ${dmy(d.day)}/${d.day.slice(0, 4)}`, note: isToday ? `Hôm nay · tới ${nowHour}h` : 'Một ngày' };
    }), [days, mode, multi, today, nowHour]);
  const total: Row = useMemo(() => ({ ...sumRows(days, 'all'), key: 'all', label: 'Cả kỳ', title: 'Cả kỳ', note: `${dmy(first)} – ${dmy(last)} · ${days.length} ngày cộng dồn` }), [days, first, last]);
  const rows = useMemo(() => mode === 'week' ? chrono : [...chrono].reverse(), [chrono, mode]);
  const byKey = useMemo(() => new Map([...chrono, total].map((r) => [r.key, r])), [chrono, total]);
  // Một ngày thì xem luôn ngày đó; nhiều ngày mặc định Cả kỳ. Đổi kỳ / đổi cách xem mà ngày đang chọn không còn → về mặc định.
  const focusKey = !multi ? chrono[0]?.key ?? 'all' : byKey.has(picked) ? picked : 'all';
  const focus = byKey.get(focusKey) ?? total;
  const at = chrono.findIndex((r) => r.key === focusKey);
  const prev = at > 0 ? chrono[at - 1] : at === -1 ? chrono[chrono.length - 1] : null;
  const next = at >= 0 && at < chrono.length - 1 ? chrono[at + 1] : null;
  const future = (r: Row, h: number) => r.day === today && h > nowHour;

  // Màu ô: số đếm theo căn bậc hai của tỷ lệ so với ô lớn nhất (ô nhỏ vẫn thấy màu); % chốt theo khoảng thấp nhất → cao nhất của ô đủ 5 số.
  const scale = useMemo(() => {
    if (metric !== 'rate') return { max: Math.max(1, ...rows.flatMap((r) => r[metric])), lo: 0, hi: 0 };
    const rates = rows.flatMap((r) => HOURS.filter((h) => r.a[h] >= 5).map((h) => r.c[h] / r.a[h] * 100));
    return { max: 1, lo: rates.length ? Math.min(...rates) : 0, hi: rates.length ? Math.max(...rates) : 100 };
  }, [rows, metric]);

  // Tooltip chung cho cả bảng và biểu đồ: ô nào đang rê thì hiện đủ 5 số của ô đó.
  const [hot, setHot] = useState<{ k: string; h: number } | null>(null);
  const hotRow = hot ? byKey.get(hot.k) : undefined;
  const tip = useTip(hot && hotRow ? (future(hotRow, hot.h)
    ? <><b>{hotRow.title} · {hot.h}h</b><span className="how block">Chưa tới khung giờ này.</span></>
    : <TipContent title={`${hotRow.title} · ${hot.h}:00–${hot.h}:59`} rows={[
      ['Số được chia', vi.format(hotRow.a[hot.h])], ['Chốt từ số', vi.format(hotRow.c[hot.h])], ['% chốt data', pct(cellValue(hotRow, 'rate', hot.h), 0)],
      ['Đơn chốt', vi.format(hotRow.o[hot.h])], ['Doanh thu', shortMoney(hotRow.net[hot.h])],
    ]} definition="số được chia và chốt từ số theo giờ chia số; đơn chốt và doanh thu theo giờ xác nhận lần đầu." />) : null, { side: 'bottom', auto: true, delay: 60 });
  const lastCell = useRef<Element | null>(null);
  const onOver = (e: React.MouseEvent) => {
    const el = (e.target as HTMLElement).closest<HTMLElement>('[data-h]');
    if (el === lastCell.current) return;
    lastCell.current = el;
    const k = el?.closest<HTMLElement>('[data-k]')?.dataset.k;
    if (!el || !k) { setHot(null); tip.hide(); return; }
    setHot({ k, h: Number(el.dataset.h) }); tip.show(el, false);
  };
  const onLeave = () => { lastCell.current = null; setHot(null); tip.hide(); };
  const onPick = (e: React.MouseEvent) => { const k = (e.target as HTMLElement).closest<HTMLElement>('[data-k]')?.dataset.k; if (k && byKey.has(k)) setPicked(k); };

  const values = HOURS.map((h) => cellValue(focus, metric, h));
  const live = HOURS.filter((h) => !future(focus, h));
  const peak = live.filter((h) => (metric === 'rate' ? focus.a[h] >= 5 : (values[h] ?? 0) > 0)).sort((x, y) => (values[y] ?? 0) - (values[x] ?? 0))[0];
  const active = HOURS.filter((h) => (metric === 'rate' ? focus.a[h] : values[h] ?? 0) > 0);
  // Cột % chốt lấy mốc cao nhất từ khung đủ 5 số (khung 1/1 = 100% không kéo lệch cả biểu đồ).
  const solid = live.filter((h) => metric !== 'rate' || focus.a[h] >= 5).map((h) => values[h] ?? 0);
  const barMax = Math.max(1, ...(solid.length ? solid : values.map((v) => v ?? 0)));
  const focusTotal = rowTotal(focus, metric);

  const body = useMemo(() => rows.map((r) => {
    const on = r.key === focusKey, isToday = r.day === today;
    const lvl = (v: number | null) => v === null ? 0 : metric === 'rate' ? (scale.hi > scale.lo ? Math.max(0, Math.min(1, (v - scale.lo) / (scale.hi - scale.lo))) : 0.5) : Math.sqrt(Math.max(0, v) / scale.max);
    return (
      <tr key={r.key} data-k={r.key}>
        <th scope="row" className="sticky left-0 z-[1] bg-surface p-0 text-left" style={{ boxShadow: '0 0 0 3px var(--surface)' }}>
          <button type="button" aria-pressed={on} title={`Xem riêng ${r.title}`}
            className={`block w-full whitespace-nowrap rounded-md px-1.5 py-1 text-left text-[11.5px] leading-tight transition-colors ${on ? 'bg-primary font-semibold text-primary-ink' : 'text-ink-2 hover:bg-surface-2'}`}>
            {r.label}{r.sub && <span className={`block text-[10px] font-normal ${on ? 'opacity-80' : 'text-ink-3'}`}>{r.sub}</span>}
          </button>
        </th>
        {HOURS.map((h) => {
          if (isToday && h > nowHour) return <td key={h} data-h={h} aria-label="Chưa tới" className="h-7 min-w-[2.3rem] rounded-md border border-dashed border-line" />;
          const v = cellValue(r, metric, h), lv = lvl(v), shade = Math.round(8 + 82 * lv), thin = metric === 'rate' && r.a[h] < 5;
          const empty = v === null || (!v && metric !== 'rate');
          return (
            <td key={h} data-h={h} className={`h-7 min-w-[2.3rem] cursor-pointer rounded-md px-0.5 text-center align-middle num text-[10.5px] ${isToday && h === nowHour ? 'ring-2 ring-primary ring-offset-1 ring-offset-surface' : ''}`}
              style={{ background: empty ? 'var(--surface-2)' : `color-mix(in oklab, var(--primary) ${shade}%, var(--surface-2))`, opacity: thin ? 0.45 : 1, color: !empty && shade > 55 ? 'var(--primary-ink)' : 'var(--ink-2)' }}>
              {fmtCell(v, metric)}
            </td>
          );
        })}
        <td className={`whitespace-nowrap pl-2 text-right num text-[11.5px] ${on ? 'font-bold text-primary' : 'font-semibold text-ink'}`}>{fmtFull(rowTotal(r, metric), metric)}</td>
      </tr>
    );
  }), [rows, focusKey, metric, scale, today, nowHour]);

  if (!dayTotal(total, 'a') && !dayTotal(total, 'o')) return (
    <ChartCard icon={Flame} title="Giờ vàng · 24 khung giờ" subtitle="Giờ Việt Nam, mỗi khung 1 tiếng" info={definition}><EmptyState text="Chưa có số được chia hay đơn chốt của Sale trong kỳ." /></ChartCard>
  );
  return (
    <ChartCard icon={Flame} title="Giờ vàng · 24 khung giờ mỗi ngày" subtitle="Giờ Việt Nam, mỗi khung 1 tiếng (9h = 9:00–9:59) · bấm một ngày để xem riêng · rê chuột vào ô để xem đủ số" info={definition}
      action={<div className="flex max-w-full flex-wrap items-center gap-2">
        {multi && <SegmentedControl size="sm" ariaLabel="Xem theo" value={mode} onChange={setMode} options={[{ value: 'day', label: 'Theo ngày' }, { value: 'week', label: 'Gộp theo thứ' }]} />}
        <div className="max-w-full overflow-x-auto"><SegmentedControl size="sm" ariaLabel="Chỉ số" value={metric} onChange={setMetric} options={METRICS} /></div>
      </div>}>
      <div className="space-y-4">
        <div className="rounded-xl border border-line bg-surface-2/50 p-3 sm:p-4">
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
            <div className="flex items-center gap-1">
              {multi && <button type="button" className="btn sm ghost px-1.5" disabled={!prev} onClick={() => prev && setPicked(prev.key)} aria-label="Trước" title={prev ? `Xem ${prev.title}` : undefined}><ChevronLeft size={16} /></button>}
              <div className="min-w-[11rem] px-1">
                <div className="text-[14px] font-semibold leading-tight text-ink">{focus.title}</div>
                <div className="text-[11.5px] text-ink-3">{focus.note}</div>
              </div>
              {multi && <button type="button" className="btn sm ghost px-1.5" disabled={!next} onClick={() => next && setPicked(next.key)} aria-label="Sau" title={next ? `Xem ${next.title}` : undefined}><ChevronRight size={16} /></button>}
              {multi && focusKey !== 'all' && <button type="button" className="btn sm ghost ml-1" onClick={() => setPicked('all')}>Xem cả kỳ</button>}
            </div>
            <div className="flex flex-wrap items-baseline gap-x-5 gap-y-1 text-[12px] text-ink-3">
              <span>{METRICS.find((m) => m.value === metric)?.label} {focusKey === 'all' ? 'cả kỳ' : mode === 'week' && multi ? 'cộng dồn' : 'cả ngày'} <b className="num ml-1 text-[15px] text-ink">{focusTotal === null ? '—' : <CountUp value={focusTotal} duration={500} format={(n) => fmtFull(n, metric)} />}</b></span>
              {peak !== undefined && <span>Cao nhất <b className="num ml-1 text-ink">{peak}h</b> · <b className="num text-primary">{fmtFull(values[peak], metric)}</b></span>}
              {active.length > 0 && <span>Có số từ <b className="num text-ink">{active[0]}h</b> đến <b className="num text-ink">{active[active.length - 1]}h</b></span>}
            </div>
          </div>
          <div className="mt-3 overflow-x-auto">
            <div className="min-w-[38rem]" data-k={focusKey} onMouseOver={onOver} onMouseLeave={onLeave}>
              <div className="grid h-40 grid-cols-[repeat(24,minmax(0,1fr))] items-end gap-[3px]">
                {HOURS.map((h) => {
                  const v = values[h], isFuture = future(focus, h), ratio = isFuture ? 0 : Math.min(1, (v ?? 0) / barMax), thin = metric === 'rate' && focus.a[h] < 5;
                  return (
                    <div key={h} data-h={h} className="flex h-full cursor-default flex-col items-center justify-end">
                      <span className={`num mb-0.5 whitespace-nowrap text-[10px] leading-none ${h === peak ? 'font-bold text-primary' : 'text-ink-2'}`}>{isFuture ? '' : fmtCell(v, metric)}</span>
                      {isFuture
                        ? <i className="block h-2 w-full rounded-t-[4px] border border-b-0 border-dashed border-line-2" />
                        : <i className="block w-full rounded-t-[5px] transition-[height] duration-500 ease-out"
                          style={{ height: `calc((100% - 14px) * ${ratio})`, minHeight: v ? 2 : 0, opacity: thin ? 0.45 : 1, background: h === peak ? 'var(--primary)' : 'color-mix(in oklab, var(--primary) 42%, var(--surface-2))' }} />}
                    </div>
                  );
                })}
              </div>
              <div className="mt-1 grid grid-cols-[repeat(24,minmax(0,1fr))] gap-[3px] border-t border-line pt-1">
                {HOURS.map((h) => (
                  <span key={h} className={`num text-center text-[10px] ${focus.day === today && h === nowHour ? 'rounded bg-primary font-bold text-primary-ink' : 'text-ink-3'}`}>{h}h</span>
                ))}
              </div>
            </div>
          </div>
        </div>
        <div className="max-h-[30rem] overflow-auto rounded-lg">
          <table className="w-full border-separate border-spacing-[3px] text-[11px]" onMouseOver={onOver} onMouseLeave={onLeave} onClick={onPick}>
            <thead><tr>
              <th className="sticky left-0 top-0 z-[3] bg-surface px-1.5 text-left text-[11px] font-medium text-ink-3" style={{ boxShadow: '0 0 0 3px var(--surface)' }}>{mode === 'week' && multi ? 'Thứ' : 'Ngày'}</th>
              {HOURS.map((h) => <th key={h} className="sticky top-0 z-[2] bg-surface px-0 text-center num text-[10.5px] font-normal normal-case tracking-normal text-ink-3" style={{ boxShadow: '0 0 0 3px var(--surface)' }}>{h}h</th>)}
              <th className="sticky top-0 z-[2] whitespace-nowrap bg-surface pl-2 text-right text-[11px] font-medium text-ink-3" style={{ boxShadow: '0 0 0 3px var(--surface)' }}>Cả ngày</th>
            </tr></thead>
            <tbody>{body}</tbody>
            {multi && (
              <tfoot><tr data-k="all">
                <th scope="row" className="sticky bottom-0 left-0 z-[3] bg-surface p-0 text-left" style={{ boxShadow: '0 0 0 3px var(--surface)' }}>
                  <button type="button" aria-pressed={focusKey === 'all'} className={`block w-full rounded-md px-1.5 py-1 text-left text-[11.5px] font-semibold ${focusKey === 'all' ? 'bg-primary text-primary-ink' : 'text-ink hover:bg-surface-2'}`}>Cả kỳ</button>
                </th>
                {HOURS.map((h) => <td key={h} data-h={h} className="sticky bottom-0 z-[2] h-7 cursor-pointer rounded-md bg-surface-3 px-0.5 text-center align-middle num text-[10.5px] font-semibold text-ink" style={{ boxShadow: '0 0 0 3px var(--surface)' }}>{fmtCell(cellValue(total, metric, h), metric)}</td>)}
                <td className="sticky bottom-0 z-[2] whitespace-nowrap bg-surface pl-2 text-right num text-[11.5px] font-bold text-ink" style={{ boxShadow: '0 0 0 3px var(--surface)' }}>{fmtFull(rowTotal(total, metric), metric)}</td>
              </tr></tfoot>
            )}
          </table>
        </div>
        <p className="m-0 text-[11.5px] text-ink-3">
          Số trong ô = {METRICS.find((m) => m.value === metric)?.title.toLowerCase()}; màu càng đậm số càng cao{metric === 'rate' ? `, từ ô thấp nhất (${pct(scale.lo, 0)}) tới cao nhất (${pct(scale.hi, 0)}); ô ít hơn 5 số được làm mờ` : ''}.
          {(mode === 'day' || !multi) && days.some((d) => d.day === today) && ' Ô viền nét đứt là giờ chưa tới của hôm nay, ô viền đậm là giờ hiện tại.'}
        </p>
      </div>
      {tip.node}
    </ChartCard>
  );
}

export function SaleAnalyticsView() {
  const { preset, start, end, setPreset, setStart, setEnd } = usePeriod();
  const [posIds, setPosIds] = usePosIds();
  const url = useMemo(() => `/api/reports/sale-analytics?${new URLSearchParams({ start, end, posIds: posIds.join(',') })}`, [start, end, posIds]);
  const { data: r, loading, error, reload } = useApi<SaleAnalytics>(url);
  type K = 'net' | 'assigned' | 'dataRate' | 'medianMinutes' | 'closed' | 'aov' | 'returnRate' | 'cancelAfterClose';
  const sort = useSort<K>('net');
  const staff = useMemo(() => sort.apply(r?.staff ?? [], (s, k) => s[k]), [r, sort]);
  const bucketMax = Math.max(1, ...(r?.buckets ?? []).map((b) => b.n));
  const periodLabel = `${dmy(start)}/${start.slice(0, 4)} – ${dmy(end)}/${end.slice(0, 4)}`;
  return (
    <div className="space-y-5">
      <PageHeader eyebrow={periodLabel} title="Phân tích Sale" subtitle="Chốt nhanh, chốt đúng: tỷ lệ chốt data, thời gian chốt, giờ vàng, hoàn và hủy theo người chốt"
        actions={<AiPackButton disabled={!r} pack={() => r && ({
          page: 'Phân tích Sale', period: periodLabel,
          facts: [['Số được chia', r.total.assigned], ['Chốt từ số được chia', r.total.closedFromAssigned], ['Tỷ lệ chốt data', pct(r.total.dataRate)], ['Thời gian chốt trung vị', duration(r.total.medianMinutes)],
            ['Đơn chốt', r.total.closed], ['Doanh thu', Math.round(r.total.net)], ['GTTB', r.total.aov === null ? null : Math.round(r.total.aov)], ['Tỷ lệ hoàn', pct(r.total.returnRate)], ['Hủy sau chốt', pct(r.total.cancelAfterClose)]],
          tables: [
            { title: 'Chốt sau bao lâu', columns: ['Khoảng', 'Số đơn'], rows: r.buckets.map((b) => [b.label, b.n]) },
            { title: 'Giờ vàng · 24 khung giờ (cộng cả kỳ)', columns: ['Giờ', 'Số được chia', 'Chốt từ số', 'Tỷ lệ chốt data', 'Đơn chốt', 'Doanh thu'], rows: (() => { const t = sumRows(r.days, 'all'); return Array.from({ length: 24 }, (_, h) => [`${h}h`, t.a[h], t.c[h], pct(t.a[h] ? t.c[h] / t.a[h] * 100 : null, 0), t.o[h], Math.round(t.net[h])]); })() },
            { title: 'Từng ngày', columns: ['Ngày', 'Số được chia', 'Chốt từ số', 'Tỷ lệ chốt data', 'Đơn chốt', 'Doanh thu', 'Giờ nhiều số nhất', 'Giờ nhiều đơn chốt nhất'], rows: r.days.map((d) => { const a = dayTotal(d, 'a'), c = dayTotal(d, 'c'), top = (k: 'a' | 'o') => { const m = Math.max(...d[k]); return m ? `${d[k].indexOf(m)}h (${m})` : '—'; }; return [d.day, a, c, pct(a ? c / a * 100 : null, 0), dayTotal(d, 'o'), Math.round(dayTotal(d, 'net')), top('a'), top('o')]; }) },
            { title: 'Từng nhân viên', staffCol: 0, columns: ['Nhân viên', 'Doanh thu', 'Đơn chốt', 'GTTB', 'Số được chia', 'Chốt data', 'Chốt sau', 'Hoàn', 'Hủy sau chốt'], rows: r.staff.map((s) => [s.name, Math.round(s.net), s.closed, s.aov === null ? null : Math.round(s.aov), s.assigned, pct(s.dataRate), duration(s.medianMinutes), pct(s.returnRate), pct(s.cancelAfterClose)]) },
          ],
          definitions: r.definitions,
          questions: ['Ai chốt tốt nhất và vì sao (tỷ lệ, tốc độ, GTTB)? Ai cần hỗ trợ?', 'Giờ nào nên dồn người trực nhận số? Ngày nào khung giờ nào số nhảy bất thường?', 'Chốt nhanh có đi kèm hoàn / hủy cao không?', 'Nên đặt mục tiêu tỷ lệ chốt data bao nhiêu cho tháng tới?'],
        })} />} />
      <PeriodToolbar preset={preset} start={start} end={end} loading={loading} onReload={reload}
        onPreset={setPreset}
        onStart={setStart} onEnd={setEnd} />
      <PosChips posIds={posIds} onChange={setPosIds} />
      {error && !r && <ErrorBox error={error} onRetry={reload} />}
      {!r && !error && <><SkeletonKpis count={4} className="xl:grid-cols-4" /><ChartCard title="Giờ vàng" subtitle="Đang tải…"><ThinkingLine /><SkeletonTable rows={5} cols={6} /></ChartCard></>}
      {r && (
        <>
          <div className={`grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4 ${loading ? 'opacity-70' : ''}`}>
            <KpiCard icon={ICON.rate} tone="green" label="Tỷ lệ chốt data" value={pct(r.total.dataRate)} note={`${vi.format(r.total.closedFromAssigned)} chốt / ${vi.format(r.total.assigned)} số được chia`}
              progress={r.total.dataRate === null ? undefined : { value: r.total.dataRate, max: 100 }} tooltip={{ period: periodLabel, current: pct(r.total.dataRate), definition: r.definitions.dataRate }} />
            <KpiCard icon={Clock} tone="blue" label="Thời gian chốt (trung vị)" value={duration(r.total.medianMinutes)} note="Từ lúc nhận số tới lúc xác nhận" tooltip={{ period: periodLabel, current: duration(r.total.medianMinutes), definition: r.definitions.time }} />
            <KpiCard icon={ICON.aov} tone="teal" label="GTTB đơn chốt" value={shortMoney(r.total.aov)} note={`${vi.format(r.total.closed)} đơn · ${shortMoney(r.total.net)}`} tooltip={{ period: periodLabel, current: shortMoney(r.total.aov), definition: 'Doanh thu ÷ đơn chốt của người bán thuộc Sale.' }} />
            <KpiCard icon={ICON.returned} tone="orange" invert label="Hoàn · hủy sau chốt" value={`${pct(r.total.returnRate, 1)}`} note={`Hủy sau chốt ${pct(r.total.cancelAfterClose, 1)}`} tooltip={{ period: periodLabel, current: `Hoàn ${pct(r.total.returnRate)} · hủy sau chốt ${pct(r.total.cancelAfterClose)}`, definition: r.definitions.quality }} />
          </div>
          <HourBoard days={r.days} definition={r.definitions.heat} />
          <div className="grid grid-cols-1 gap-4">
            <ChartCard icon={Clock} title="Chốt sau bao lâu" subtitle="Số đơn chốt theo thời gian từ lúc nhận số" info={r.definitions.time}>
              <ul className="m-0 list-none space-y-2.5 p-0">
                {r.buckets.map((b, i) => (
                  <li key={b.key} className="grid grid-cols-[6.5rem_minmax(0,1fr)_4.5rem] items-center gap-2 text-[12.5px]">
                    <span className="text-ink-2">{b.label}</span>
                    <span className="h-3 overflow-hidden rounded-full bg-surface-2"><i className="block h-full rounded-full" style={{ width: `${b.n / bucketMax * 100}%`, background: i < 2 ? 'var(--good)' : i < 3 ? 'var(--primary)' : i < 4 ? 'var(--warn)' : 'var(--bad)' }} /></span>
                    <span className="num text-right text-ink">{vi.format(b.n)} <span className="text-[11px] text-ink-3">{pct(r.total.closedFromAssigned ? b.n / r.total.closedFromAssigned * 100 : null, 0)}</span></span>
                  </li>
                ))}
              </ul>
            </ChartCard>
          </div>
          <ChartCard icon={Trophy} title={`Xếp hạng · ${staff.length} người`} subtitle={`Màu tỷ lệ chốt data: xanh từ ${RATE_THRESHOLDS.good}%, vàng từ ${RATE_THRESHOLDS.warn}% · bấm tiêu đề cột để sắp xếp`} info={r.definitions.scope}>
            {staff.length ? (
              <TableWrap minWidth={960} maxHeight="34rem" stickyFirst>
                <table className="tbl">
                  <thead><tr>
                    <th className="w-8">#</th>
                    <th className="text-left">Nhân viên</th>
                    <SortTh k="net" label="Doanh thu" sort={sort} />
                    <SortTh k="closed" label="Đơn chốt" sort={sort} />
                    <SortTh k="aov" label="GTTB" sort={sort} />
                    <SortTh k="assigned" label="Số được chia" sort={sort} />
                    <SortTh k="dataRate" label="Chốt data" sort={sort} />
                    <SortTh k="medianMinutes" label="Chốt sau" sort={sort} />
                    <SortTh k="returnRate" label="Hoàn" sort={sort} />
                    <SortTh k="cancelAfterClose" label="Hủy sau chốt" sort={sort} />
                  </tr></thead>
                  <tbody>{staff.map((s) => (
                    <tr key={s.staffId}>
                      <td className="num text-[11px] text-ink-4">{s.rank}</td>
                      <td className="text-left font-medium text-ink">{s.name}{s.department && <span className="block text-[11px] font-normal text-ink-3">{s.department}</span>}</td>
                      <td className="n">{shortMoney(s.net)}</td>
                      <td className="n">{vi.format(s.closed)}</td>
                      <td className="n">{shortMoney(s.aov)}</td>
                      <td className="n">{vi.format(s.assigned)}</td>
                      <td className={`n font-semibold ${s.dataRate === null ? '' : LEVEL_TEXT[rateLevel(s.dataRate)]}`}>{pct(s.dataRate)}<span className="block text-[11px] font-normal text-ink-3">{vi.format(s.closedFromAssigned)} chốt</span></td>
                      <td className="n">{duration(s.medianMinutes)}</td>
                      <td className="n">{pct(s.returnRate)}</td>
                      <td className="n">{pct(s.cancelAfterClose)}</td>
                    </tr>
                  ))}</tbody>
                </table>
              </TableWrap>
            ) : <EmptyState text="Chưa có số được chia hay đơn chốt của Sale trong kỳ." />}
          </ChartCard>
          <Definitions items={r.definitions} />
        </>
      )}
    </div>
  );
}
