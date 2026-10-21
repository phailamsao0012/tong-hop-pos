'use client';
import { vanDonLabel } from '@/lib/van-don-label';
import { usePeriod } from './period-store';
import { usePosIds } from './pos-store';
import { useTeam, useHrUnit, useBranch, useMktTeam, withUnit, unitFor } from './team-store';
import { useApi } from './use-api';
import { staffGap, bucketBars, reasonBars, type AdvisorReport } from '@/lib/advisor';
import type { ReactNode } from 'react';
import { shortMoney } from './ui-kit';
import type { DisplayInsight } from '@/lib/ai-insight';
import type { TrendDept } from '@/lib/trend-period';

export function AdvisorPanel({ dept }: { dept?: TrendDept }) {
  const label = (text: string) => dept === 'vandon' ? vanDonLabel(text) : text;
  const { start, end, preset } = usePeriod();
  const [posIds] = usePosIds();
  const selected = useTeam(), hrUnit = useHrUnit();
  const branch = useBranch(), mkt = useMktTeam();
  const team = dept === 'sale' || dept === 'cskh' ? dept : selected;
  const p = new URLSearchParams({ start, end, preset, posIds: posIds.join(','), team, depts: dept ?? 'sale,cskh,mkt,vandon' });
  if (branch) p.set('branch', branch);
  if (mkt) p.set('mktTeam', mkt.id);
  const url = withUnit(`/api/reports/advisor?${p}`, unitFor(hrUnit, team));
  const { data, error, loading, reload } = useApi<AdvisorReport>(url);
  const deep = useApi<{ insight: DisplayInsight | null }>('/api/ai/insights');
  const number = (n: number) => n.toLocaleString('vi-VN', { maximumFractionDigits: 1 });
  const percent = (n: number) => `${(n * 100).toLocaleString('vi-VN', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
  const why = (title: string) => data?.items.filter(i => i.title === title).map(i => i.why).join(' ') ?? '';
  const sale = data?.viz.sale, care = data?.viz.cskh, marketing = data?.viz.mkt;
  const gap = sale ? staffGap(sale.have, sale.need) : null;
  const chip = (text: string, warn = false, green = false) => <span className={`rounded-md px-2 py-1 text-[11px] ${warn ? 'text-warn bg-warn-bg' : green ? 'text-primary bg-tint' : 'text-ink-3 bg-tint'}`}>{label(text)}</span>;
  const tile = (title: string, status: ReactNode, content: ReactNode, note: string, explanation: ReactNode) => <div className="min-w-0 rounded-xl border border-line p-3 space-y-3">
    <div className="flex flex-wrap items-start justify-between gap-2"><h3 className="text-sm font-semibold">{label(title)}</h3>{status}</div>
    {content}<p className="text-xs text-ink-3">{label(note)}</p>
    <details className="text-xs text-ink-3"><summary className="cursor-pointer text-primary">Cách tính</summary><div className="mt-2 space-y-1">{explanation}</div></details>
  </div>;
  return <section className="rounded-2xl border border-line bg-white p-4 space-y-3">
    {/* Tiêu đề và kỳ chung một dòng (anh Vũ 21/10/2026). */}
    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
      <h2 className="font-semibold text-ink">Dự đoán & khuyến nghị</h2>
      <p className="text-xs text-ink-3">{start.slice(8, 10)}/{start.slice(5, 7)} – {end.slice(8, 10)}/{end.slice(5, 7)} · theo bộ lọc đang chọn</p>
    </div>
    {loading && !data && <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3" aria-label="Đang tải khuyến nghị">{[1, 2, 3].map(n => <div key={n} className="h-48 animate-pulse rounded-xl bg-tint" />)}</div>}
    {error && <button type="button" onClick={reload} className="text-sm underline">Chưa tải được khuyến nghị · Thử lại</button>}
    {data && <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {sale && gap && tile('Sức chứa Sale', <span className={gap.kind === 'over' || gap.kind === 'even' ? 'text-primary' : ''}>{chip(gap.kind === 'unknown' ? 'Chưa đủ số' : gap.kind === 'even' ? 'Vừa đủ' : `${gap.kind === 'over' ? 'Dư' : 'Thiếu'} khoảng ${number(gap.n)} người`, gap.kind === 'short', gap.kind === 'over' || gap.kind === 'even')}</span>,
        <div className="space-y-3">{[{ title: 'Đang có', n: sale.have, main: true }, ...(sale.need === null ? [] : [{ title: 'Cần ~', n: sale.need, main: false }])].map(b => <div key={b.title}>
          <p className="num mb-1 text-sm">{b.title} {number(b.n)}</p><div className="h-3 rounded bg-surface-3"><div className={`h-full rounded ${b.main ? 'bg-primary' : 'bg-tint'}`} style={{ width: `${b.n / Math.max(sale.have, sale.need ?? 0, 1) * 100}%` }} /></div>
        </div>)}</div>, [sale.load === null ? '' : `Tải hiện tại ${number(sale.load)} số/người/ngày`, sale.leadsDaily === null ? '' : `${number(sale.leadsDaily)} số về mỗi ngày`].filter(Boolean).join(' · '), label(why('Sức chứa Sale')))}
      {sale && tile('Tỷ lệ chốt theo tải mỗi ngày', sale.best ? chip(`Tốt nhất ${sale.best} số`) : chip('Chưa đủ số'),
        <div className="grid grid-cols-4 gap-2">{bucketBars(sale.buckets, sale.best).map(b => <div key={b.label} className="min-w-0 text-center">
          <div className="flex h-36 flex-col justify-end gap-1">{b.enough ? <><span className="num text-xs">{percent(b.rate!)}</span><div className={`mx-auto w-full max-w-12 rounded-t ${b.best ? 'bg-primary' : 'bg-primary/30'}`} style={{ height: `${b.height * 96}px` }} /></> : <div className="rounded border border-dashed border-line p-1 text-[10px] text-ink-3">chưa đủ số</div>}</div><p className="num mt-2 text-xs">{b.label}</p>
        </div>)}</div>, 'Số được chia cho một Sale trong một ngày, 60 ngày đã kết thúc', <><p>Lịch sử tải Sale: 60 ngày đã kết thúc.</p>{sale.buckets.map(b => <p key={b.label}>{b.label}: {label(why(`Tỷ lệ chốt theo tải ${b.label}`))}</p>)}</>)}
      {care && tile('Sức chứa CSKH', chip('Chưa đủ số để khuyên tuyển'), <div><p className="num text-2xl font-semibold">{care.notesPerPerson === null ? 'Chưa đủ số' : care.notesPerPerson.toLocaleString('vi-VN', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}</p><p className="text-xs text-ink-3">note/ngày/người · {number(care.have)} CSKH</p></div>, `${number(care.notes)} ghi chú trong ${number(care.days)} ngày`, label(why('Sức chứa CSKH')))}
      {marketing && tile(marketing.open ? 'DT New dự đoán cuối kỳ' : 'DT New trong kỳ', !marketing.open ? chip('Kỳ đã kết thúc') : marketing.forecast === null ? chip('Chưa đủ số') : chip(`Đạt ${percent(marketing.forecast ? marketing.actual / marketing.forecast : 0)} dự đoán`, true),
        <div className="space-y-3"><p className="num text-2xl font-semibold">{marketing.open && marketing.forecast === null ? 'Chưa đủ số' : shortMoney(marketing.open ? marketing.forecast : marketing.actual)}</p>
          {marketing.open && marketing.forecast !== null && <><div className="h-3 overflow-hidden rounded border border-dashed border-line bg-surface-3"><div className="h-full bg-primary" style={{ width: `${Math.min(100, marketing.forecast > 0 ? marketing.actual / marketing.forecast * 100 : 0)}%` }} /></div><div className="num flex flex-wrap justify-between gap-2 text-xs"><span>Đã có {shortMoney(marketing.actual)}</span><span>Còn dự kiến {shortMoney(marketing.forecast - marketing.actual)}</span></div></>}
        </div>, 'Đơn New do Sale xử lý · theo bộ lọc đang chọn', <>{data.items.filter(i => i.dept === 'mkt').map(i => <p key={i.title}>{label(i.why)}</p>)}</>)}
      {data.reasons && tile('Lý do không mua', chip(data.reasons.coverage === null || data.reasons.coverage < .3 ? 'Ít ghi chú, chỉ tham khảo' : `${percent(data.reasons.coverage)} có ghi chú phân loại được`, data.reasons.coverage === null || data.reasons.coverage < .3),
        <div className="space-y-2">{reasonBars(data.reasons.groups).map(g => <div key={g.reason} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] items-center gap-2 text-xs"><span className="break-words">{label(g.reason)}</span><div className="h-2 rounded bg-surface-3"><div className={`h-full rounded ${g.reason === 'Khác' ? 'bg-ink-3' : 'bg-primary'}`} style={{ width: `${g.share * 100}%` }} /></div><span className="num">{number(g.count)} đơn</span></div>)}</div>, `${number(data.reasons.total)} đơn hủy/hoàn/không xác nhận`, <>{data.reasons.classified}/{data.reasons.total} đơn. {label(data.reasonScope)}</>)}
    </div>}
    {!deep.error && deep.data && <div className="space-y-2 text-sm">
      {!deep.data.insight ? <p className="text-xs text-ink-3">Phân tích sâu: hôm nay chưa có</p> : <>
        <div className="flex flex-wrap items-center gap-2"><h3 className="font-medium">Phân tích sâu sáng nay</h3>{chip('Chỉ chủ hệ thống')}</div>
        <p className="text-xs text-ink-3">{label(deep.data.insight.summary)}</p>
        {deep.data.insight.items.filter(i => !dept || i.dept === dept || i.dept === 'company').map((i, index) => <div key={index} className="rounded-xl border border-line p-3 space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2"><p className="font-semibold">{label(i.title)}</p>{chip(`tin cậy ${i.confidence}`)}</div>
          <p>{label(i.action)}</p>
          <details className="text-xs text-ink-3"><summary className="cursor-pointer text-primary">Vì sao</summary><div className="mt-2 space-y-1"><p>{label(i.detail)}</p>{!i.verified && <p>Chưa kiểm được số</p>}{i.evidence.map((e, n) => <p key={n}>{label(e.text || 'Số trong gói hôm nay')}</p>)}<p>Toàn công ty, 60 ngày tới hôm qua; không theo bộ lọc trang</p></div></details>
        </div>)}
      </>}
    </div>}
  </section>;
}
