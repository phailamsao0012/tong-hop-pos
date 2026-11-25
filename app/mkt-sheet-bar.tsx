'use client';
// Nút "So với sheet" của bảng xếp hạng marketer gộp (25/11/2026). Trước nằm ở tab Marketer của khối số chính (mkt-headline.tsx);
// tab đó đã gộp vào bảng xếp hạng nên nút, dòng tổng, tên sheet chưa ghép và "Xem lệch theo từng ngày" chuyển theo, giữ nguyên cách so.
// Chỉ tải số sheet khi bật (phương án A cũ); bật thì báo bảng số so theo từng marketer qua onSheet.
import { useEffect, useMemo, useState } from 'react';
import { FileSpreadsheet } from 'lucide-react';
import { StatusChip, dmy, shortMoney, vi } from './ui-kit';
import { useApi } from './use-api';
import { useTeam } from './team-store';
import { compareSheet, gapOf, verdict, type SheetCheckData, type SheetCompare } from '@/lib/shared/mkt-sheet-compare';
import { MktSheetCheck } from './mkt-sheet-check';

export function SheetLine({ sheet, pos, fmt, label = 'sheet' }: { sheet: number; pos: number; fmt: (n: number) => string; label?: string }) {
  const g = gapOf(sheet, pos), v = verdict(g.pct);
  const sign = g.diff > 0 ? '+' : g.diff < 0 ? '−' : '';
  return <span className="block w-0 min-w-full whitespace-normal text-[11px] font-normal text-ink-3" title={`Sheet ghi ${fmt(sheet)}, POS ${fmt(pos)}, lệch ${sign}${fmt(Math.abs(g.diff))} (${g.pct > 0 ? '+' : ''}${g.pct.toFixed(1).replace('.', ',')}%)`}>
    {label} {fmt(sheet)} · {sign}{fmt(Math.abs(g.diff))} <StatusChip tone={v.tone}>{v.text}</StatusChip>
  </span>;
}

export function MktSheetBar({ start, end, posIds, unmatchedSheet, onSheet }: {
  start: string; end: string; posIds: string[];
  /** Tên trên sheet chưa ghép POS từ /api/marketing/analytics (khi chưa bật so sheet). */ unmatchedSheet?: { name: string; cost: number }[];
  onSheet: (s: SheetCompare | null) => void;
}) {
  const seg = useTeam();
  const [cmpOn, setCmpOn] = useState(false);
  const [dayView, setDayView] = useState(false);
  const sheetUrl = cmpOn ? `/api/marketing/sheet-check?${new URLSearchParams({ start, end, posIds: posIds.join(',') })}` : null;
  const sheetApi = useApi<SheetCheckData>(sheetUrl, { keep: true });
  const sheet = useMemo(() => sheetApi.data && cmpOn ? compareSheet(sheetApi.data, seg === 'sale' ? 'sale' : seg === 'cskh' ? 'cskh' : 'net') : null, [sheetApi.data, cmpOn, seg]);
  useEffect(() => { onSheet(sheet); }, [sheet, onSheet]);
  useEffect(() => () => onSheet(null), [onSheet]);
  return <div className="mb-3 flex flex-col gap-1.5">
    <div className="flex flex-wrap items-center gap-2">
      <button type="button" aria-pressed={cmpOn} onClick={() => setCmpOn((v) => !v)} className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[12.5px] font-semibold tap ${cmpOn ? 'border-primary bg-primary text-primary-ink' : 'border-line-3 text-ink-2 hover:border-primary'}`}><FileSpreadsheet size={14} />So với sheet</button>
      {cmpOn && sheetApi.loading && !sheet && <span className="text-[11.5px] text-ink-3">Đang tải số sheet…</span>}
      {cmpOn && sheetApi.error && !sheet && <span className="text-[11.5px] text-bad">Không tải được số sheet. <button type="button" className="underline" onClick={sheetApi.reload}>Tải lại</button></span>}
      {sheet && !(sheet.total.sheet.phones || sheet.total.sheet.orders || sheet.total.sheet.revenue) && <span className="text-[12px] text-ink-3">{sheetApi.data?.sheet.connected ? 'Sheet chưa có số SĐT / Đơn / DT trong kỳ này (sheet gửi mỗi giờ).' : 'Chưa nối Google Sheet chi phí (nối ở trang Chi phí & ROAS).'}</span>}
      {sheet && !!(sheet.total.sheet.phones || sheet.total.sheet.orders || sheet.total.sheet.revenue) && <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-ink-3">
        <span>Sheet tới hết <b className="text-ink-2">{dmy(sheet.cutoff)}</b></span>
        {([['SĐT', sheet.total.sheet.phones, sheet.total.posPhones, (n: number) => vi.format(n)], ['Đơn', sheet.total.sheet.orders, sheet.total.posClosed, (n: number) => vi.format(n)], ['DT', sheet.total.sheet.revenue, sheet.total.posNet, shortMoney]] as const).map(([l, sv, pv, fm]) => {
          const g = gapOf(sv, pv), v = verdict(g.pct);
          return <span key={l}>{l} <b className="text-ink-2">{fm(sv)}</b> / POS <b className="text-ink-2">{fm(pv)}</b> <StatusChip tone={v.tone}>{v.text} {g.pct > 0 ? '+' : ''}{g.pct.toFixed(1).replace('.', ',')}%</StatusChip></span>;
        })}
      </span>}
    </div>
    {!sheet && !!unmatchedSheet?.length && <p className="text-[12px] text-ink-3">Tên trên sheet chưa ghép với POS (không cộng vào chi phí, ROAS): {unmatchedSheet.map((u) => `${u.name} ${shortMoney(u.cost)}`).join(', ')} · ghép ở trang Chi phí &amp; ROAS.</p>}
    {sheet && <div className="flex flex-col gap-1.5 text-[12px] text-ink-3">
      {sheet.unmatched.length > 0 && <span>Tên trên sheet chưa ghép với POS: {sheet.unmatched.map((u) => `${u.name.replace(/ \(Sheet\)$/, '')} (CP ${shortMoney(u.cost)} · DT ${shortMoney(u.revenue)})`).join(', ')} · ghép ở trang Chi phí &amp; ROAS.</span>}
      <button type="button" className="self-start font-semibold text-primary underline decoration-dotted underline-offset-2" aria-expanded={dayView} onClick={() => setDayView((v) => !v)}>{dayView ? 'Ẩn lệch theo từng ngày' : 'Xem lệch theo từng ngày'}</button>
      {dayView && <MktSheetCheck start={start} end={end} posIds={posIds} />}
    </div>}
  </div>;
}
