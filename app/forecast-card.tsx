'use client';

import { useState } from 'react';
import { Line, LineChart, XAxis, YAxis } from 'recharts';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';
import { addDays, todayVn } from '@/lib/shared/report-time';
import type { forecastForDisplay } from '@/lib/kpi/forecast-run';
import type { ReviewRecord } from '@/lib/kpi/forecast-review';
import { useApi } from './use-api';
import { money, ProgressBar, shortMoney } from './ui-kit';
/** Chỉ đoạn, danh sách và chữ đậm; HTML luôn là nút chữ React được escape. */
export function markdownBlocks(text: string) {
  return text.split(/\r?\n/).filter(line => line.trim()).map(line => ({
    list: /^\s*[-*]\s+/.test(line),
    spans: line.replace(/^\s*[-*]\s+/, '').split(/(\*\*[^*]+\*\*)/g).filter(Boolean).map(value => ({ bold: value.startsWith('**') && value.endsWith('**'), text: value.startsWith('**') && value.endsWith('**') ? value.slice(2, -2) : value })),
  }));
}
export type ChartRow = { label: string; value: number };
const CHART_ROWS = 12;
/** Khối ```bieudo: dòng đầu là tiêu đề, mỗi dòng sau "nhãn;số". Không có dòng số nào hợp lệ thì trả null để hiện như chữ. */
export function parseChart(body: string): { title: string; rows: ChartRow[] } | null {
  const lines = body.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const rowOf = (line: string): ChartRow | null => {
    const at = line.lastIndexOf(';');
    if (at <= 0) return null;
    const raw = line.slice(at + 1).replace(/\s/g, '');
    if (!/^[+\-−]?\d+(?:[.,]\d+)?$/.test(raw)) return null;
    const value = Number(raw.replace('−', '-').replace('+', '').replace(',', '.'));
    return Number.isFinite(value) ? { label: line.slice(0, at).trim(), value } : null;
  };
  const title = lines[0] && !rowOf(lines[0]) ? lines[0] : '';
  const rows = lines.slice(title ? 1 : 0).map(rowOf).filter((r): r is ChartRow => r !== null).slice(0, CHART_ROWS);
  return rows.length ? { title, rows } : null;
}
type AiPart = { kind: 'text'; text: string } | { kind: 'chart'; title: string; rows: ChartRow[] };
/** Tách câu trả lời thành chữ và biểu đồ. Khối chưa đóng (câu bị cắt) vẫn đọc tới hết. */
export function aiParts(text: string): AiPart[] {
  const parts: AiPart[] = [];
  const fence = /```bieudo[^\S\r\n]*\r?\n([\s\S]*?)(```|$)/g;
  let last = 0;
  for (let m = fence.exec(text); m; m = fence.exec(text)) {
    if (m.index > last) parts.push({ kind: 'text', text: text.slice(last, m.index) });
    let body = m[1], rest = '';
    if (!m[2]) {
      // Khối chưa đóng: biểu đồ dừng ở dòng đầu tiên không phải "nhãn;số" (sau tiêu đề), phần sau là chữ (vd câu báo bị cắt).
      const lines = body.split(/\r?\n/);
      const stop = lines.findIndex((l, i) => i > 0 && l.trim() && !parseChart(`x\n${l}`));
      if (stop > 0) { body = lines.slice(0, stop).join('\n'); rest = lines.slice(stop).join('\n'); }
    }
    const chart = parseChart(body);
    parts.push(chart ? { kind: 'chart', ...chart } : { kind: 'text', text: body });
    if (rest.trim()) parts.push({ kind: 'text', text: rest });
    last = fence.lastIndex;
    if (m[0].length === 0) break;
  }
  if (last < text.length) parts.push({ kind: 'text', text: text.slice(last) });
  return parts.filter(p => p.kind === 'chart' || p.text.trim());
}
const chartNumber = (n: number) => n.toLocaleString('vi-VN', { maximumFractionDigits: 2 });
/** Thanh ngang có số ở cuối. Có số âm thì chia đôi quanh 0: tăng xanh, giảm đỏ. */
export function BarList({ title, rows, format = chartNumber }: { title?: string; rows: ChartRow[]; format?: (n: number) => string }) {
  const pos = Math.max(0, ...rows.map(r => r.value)), neg = Math.max(0, ...rows.map(r => -r.value)), span = pos + neg || 1;
  const zero = neg / span * 100, diverging = neg > 0;
  return <figure className="min-w-0 space-y-2 rounded-xl border border-line bg-surface-2/40 p-3">
    {title && <figcaption className="text-xs font-semibold text-ink-2">{title}</figcaption>}
    <ul className="space-y-1.5">{rows.map((r, i) => {
      const width = Math.abs(r.value) / span * 100, left = r.value < 0 ? zero - width : zero;
      return <li key={`${r.label}-${i}`} className="grid grid-cols-[minmax(0,7.5rem)_minmax(0,1fr)_auto] items-center gap-2 text-xs" title={`${r.label}: ${format(r.value)}`}>
        <span className="truncate text-ink-2">{r.label || '—'}</span>
        <span className="relative h-2.5 rounded-full bg-surface-2" aria-hidden="true">
          {diverging && <span className="absolute inset-y-[-3px] w-px bg-line-3" style={{ left: `${zero}%` }} />}
          <span className="absolute inset-y-0 rounded-full" style={{ left: `${left}%`, width: `max(${width}%, 2px)`, background: !diverging ? 'var(--primary)' : r.value < 0 ? 'var(--bad)' : 'var(--good)' }} />
        </span>
        <span className="num text-right tabular-nums text-ink">{format(r.value)}</span>
      </li>;
    })}</ul>
  </figure>;
}
function MarkdownText({ text }: { text: string }) {
  // Gom các dòng gạch đầu dòng liền nhau thành một danh sách.
  const groups: { list: boolean; items: ReturnType<typeof markdownBlocks> }[] = [];
  for (const b of markdownBlocks(text)) {
    const prev = groups[groups.length - 1];
    if (prev && prev.list && b.list) prev.items.push(b); else groups.push({ list: b.list, items: [b] });
  }
  const spans = (b: ReturnType<typeof markdownBlocks>[number]) => b.spans.map((s, j) => s.bold ? <strong key={j}>{s.text}</strong> : s.text);
  return <>{groups.map((g, i) => g.list
    ? <ul key={i} className="list-disc space-y-1 pl-5">{g.items.map((b, j) => <li key={j}>{spans(b)}</li>)}</ul>
    : g.items.map((b, j) => <p key={`${i}-${j}`}>{spans(b)}</p>))}</>;
}
export function AiMarkdown({ text }: { text: string }) {
  return <div className="space-y-2 whitespace-pre-wrap break-words text-sm leading-relaxed">{aiParts(text).map((p, i) => p.kind === 'chart'
    ? <BarList key={i} title={p.title} rows={p.rows} />
    : <MarkdownText key={i} text={p.text} />)}</div>;
}


export function formatReviewDate(date: string) {
  const [year, month, day] = date.split('-');
  return `${day}/${month}/${year}`;
}
export function formatReviewWeek(start: string) {
  const end = addDays(start, 6);
  const first = formatReviewDate(start);
  return `${start.slice(0, 4) === end.slice(0, 4) ? first.slice(0, 5) : first} – ${formatReviewDate(end)}`;
}

type ForecastData = ReturnType<typeof forecastForDisplay>;
const amount = (n: number | null) => n === null ? 'Chưa đủ dữ liệu' : money(n);
const signed = (n: number) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${money(Math.abs(n))}`;

export function ForecastCard({ onOpen }: { onOpen?: () => void }) {
  const api = useApi<ForecastData>('/api/ai/forecast', { refreshMs: 600000 });
  const d = api.data;
  const [beforeSeven] = useState(() => new Date(Date.now() + 7 * 3600000).getUTCHours() < 7);
  return <section className="card min-w-0 space-y-3 p-4">
    <h2 className="font-semibold">{onOpen ? <button type="button" className="link" onClick={onOpen}>Dự báo doanh thu · xem Hôm qua</button> : 'Dự báo doanh thu'}</h2>
    <p className="text-xs text-ink-3">Doanh thu đơn chốt · toàn công ty, mọi POS · MKT / CSKH / SALE · hôm nay và tuần thứ Hai–Chủ nhật</p>
    {api.error && <p role="alert">{api.error} <button className="link" onClick={api.reload}>Thử lại</button></p>}
    {!d ? <p>{api.loading ? 'Đang tải dự báo…' : 'Chưa có dự báo'}</p> : <>
      <div className="grid gap-4 sm:grid-cols-2">
        <div><p className="text-sm text-ink-2">Cuối ngày dự kiến</p><p className="num text-2xl">{amount(d.total)}</p><p className="text-sm">Đã có {amount(d.actual)}</p>{d.total !== null && d.actual !== null && <ProgressBar value={d.actual} max={d.total} />}</div>
        <div><p className="text-sm text-ink-2">Cả tuần dự kiến</p><p className="num text-2xl">{amount(d.week)}</p><p className="text-sm">Đã đạt {amount(d.weekActual)} / dự kiến {amount(d.week)}</p>{d.week !== null && d.weekActual !== null && <ProgressBar value={d.weekActual} max={d.week} />}</div>
      </div>
      {d.points.length >= 2 ? <ChartContainer className="h-44 w-full" config={{ actual: { label: 'Đã có', color: 'var(--primary)' }, today: { label: 'Dự kiến cuối ngày', color: 'var(--ink-2)' } }}><LineChart data={d.points}><XAxis dataKey="t" minTickGap={30} /><YAxis width={45} tickFormatter={n => `${Number(n) / 1000000}tr`} /><ChartTooltip content={<ChartTooltipContent />} /><Line dataKey="actual" stroke="var(--primary)" dot={false} /><Line dataKey="today" stroke="var(--ink-2)" strokeDasharray="5 4" dot={false} /></LineChart></ChartContainer> : <p className="text-sm text-ink-3">Đường dự báo sẽ hiện từ mốc 30 phút thứ hai (07:30)</p>}
      <p className="text-xs text-ink-3">{d.points.length ? `Tính lúc ${d.points[d.points.length - 1].t} · dự báo đầu ngày ${amount(d.morningTotal)}` : beforeSeven ? 'Dự báo bắt đầu từ 7:00' : 'Chưa có mốc dự báo hôm nay'}</p>
      {api.stale && <p className="text-xs text-warn">Số lưu lần trước · đang chờ cập nhật</p>}
    </>}
  </section>;
}

type ReviewData = ReviewRecord['data'];
type Person = ReviewData['people'][number];
const PART_LABELS = { soChia: 'Số chia', tiLeChot: 'Tỷ lệ chốt', giaTriDon: 'Giá trị đơn', nghi: 'Người nghỉ', moi: 'Người mới', khac: 'Khác' } as const;
/** Các bậc của biểu đồ thác: dự báo, từng phần lệch (phần 0 của người mới bỏ qua), thực tế. Khác gồm cả đơn chưa gán người. */
export function waterfallSteps(d: Pick<ReviewData, 'forecast' | 'actual' | 'parts'>) {
  if (d.forecast === null) return [];
  const p = d.parts, parts: [string, number][] = [[PART_LABELS.soChia, p.soChia], [PART_LABELS.tiLeChot, p.tiLeChot], [PART_LABELS.giaTriDon, p.giaTriDon], [PART_LABELS.nghi, p.nghi]];
  if (p.moi) parts.push([PART_LABELS.moi, p.moi]);
  parts.push([PART_LABELS.khac, p.khac + p.chuaGan]);
  let run = d.forecast;
  const steps: { label: string; from: number; to: number; kind: 'total' | 'part' }[] = [{ label: 'Dự báo', from: 0, to: d.forecast, kind: 'total' }];
  for (const [label, n] of parts) { steps.push({ label, from: run, to: run + n, kind: 'part' }); run += n; }
  steps.push({ label: 'Thực tế', from: 0, to: d.actual, kind: 'total' });
  return steps;
}
/** Lệch của một người = thực tế − kỳ vọng, và phần nào lớn nhất giải thích. */
export function personDeviation(p: Person) {
  const reasons: [string, number][] = [[PART_LABELS.soChia, p.soChia], [PART_LABELS.tiLeChot, p.tiLeChot], [PART_LABELS.giaTriDon, p.giaTriDon], ['nghỉ', p.nghi], ['mới vào', p.moi], [PART_LABELS.khac, p.khac + p.chuaGan]];
  const total = reasons.reduce((s, [, n]) => s + n, 0);
  const main = reasons.reduce((a, b) => Math.abs(b[1]) > Math.abs(a[1]) ? b : a);
  return { total, reason: p.group === 'nghi' ? 'nghỉ' : p.group === 'moi' ? 'mới vào' : main[1] ? main[0] : '' };
}
const signedShort = (n: number) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${shortMoney(Math.abs(n))}`;
const pct = (n: number) => `${n.toLocaleString('vi-VN', { maximumFractionDigits: 1, signDisplay: 'always' })}%`;

function Waterfall({ d }: { d: ReviewData }) {
  const steps = waterfallSteps(d);
  if (!steps.length) return null;
  // Trục cắt bớt phần chung: phần lệch nhỏ so với tổng, bắt đầu từ 0 thì không thấy được.
  const levels = steps.flatMap(s => s.kind === 'total' ? [s.to] : [s.from, s.to]);
  const lo = Math.min(...levels), hi = Math.max(...levels), pad = (hi - lo) * 0.25 || Math.abs(hi) * 0.05 || 1;
  // Tổng chạy âm thì trục đi xuống dưới 0; cột tổng luôn mọc từ 0 (hoặc từ mốc cắt trục).
  const min = Math.min(Math.max(0, lo - pad), lo - pad * 0.2), max = hi + pad * 0.2, base = Math.max(min, 0);
  const at = (n: number) => Math.min(100, Math.max(0, (n - min) / (max - min) * 100));
  return <figure className="min-w-0 space-y-2">
    <figcaption className="text-xs font-semibold text-ink-2">Từ dự báo đến thực tế</figcaption>
    <ul className="space-y-1.5">{steps.map(s => {
      const a = at(s.kind === 'total' ? base : Math.min(s.from, s.to)), b = at(s.kind === 'total' ? s.to : Math.max(s.from, s.to)), n = s.to - s.from;
      const color = s.kind === 'total' ? s.label === 'Thực tế' ? 'var(--primary)' : 'var(--ink-3)' : n < 0 ? 'var(--bad)' : 'var(--good)';
      return <li key={s.label} className="grid grid-cols-[5.5rem_minmax(0,1fr)_4.75rem] items-center gap-2 text-xs" title={`${s.label}: ${s.kind === 'total' ? money(s.to) : signed(n)}`}>
        <span className={s.kind === 'total' ? 'font-semibold' : 'text-ink-2'}>{s.label}</span>
        <span className="relative h-4 rounded bg-surface-2/60" aria-hidden="true">
          <span className="absolute inset-y-0 rounded" style={{ left: `${a}%`, width: `max(${b - a}%, 2px)`, background: color }} />
        </span>
        <span className={`num text-right tabular-nums ${s.kind === 'total' ? 'font-semibold' : ''}`}>{s.kind === 'total' ? shortMoney(s.to) : signedShort(n)}</span>
      </li>;
    })}</ul>
    {min > 0 && <p className="text-[11px] text-ink-3">Trục bắt đầu từ {shortMoney(min)} để thấy rõ phần lệch · xanh là kéo lên, đỏ là kéo xuống</p>}
  </figure>;
}

function PeopleBars({ people, nameOf, onOpen }: { people: Person[]; nameOf: (id: string) => string; onOpen: () => void }) {
  const rows = people.filter(p => p.id).map(p => ({ p, ...personDeviation(p) })).filter(r => r.total)
    .sort((a, b) => Math.abs(b.total) - Math.abs(a.total) || a.p.id.localeCompare(b.p.id)).slice(0, 8);
  if (!rows.length) return <p className="text-sm text-ink-3">Không ai lệch so với dự báo.</p>;
  const span = Math.max(...rows.map(r => Math.abs(r.total))) || 1;
  return <figure className="min-w-0 space-y-2">
    <figcaption className="flex flex-wrap items-center justify-between gap-2 text-xs"><span className="font-semibold text-ink-2">Ai làm lệch nhiều nhất</span>
      <span className="flex gap-3 text-ink-3"><span className="inline-flex items-center gap-1"><i className="inline-block h-2 w-2 rounded-full bg-bad" />kéo xuống</span><span className="inline-flex items-center gap-1"><i className="inline-block h-2 w-2 rounded-full bg-good" />kéo lên</span></span></figcaption>
    <ul className="space-y-2">{rows.map(({ p, total, reason }) => {
      const w = Math.abs(total) / span * 50;
      return <li key={p.id} className="space-y-1 text-xs">
        <div className="flex items-baseline justify-between gap-2"><button type="button" className="link min-w-0 truncate text-left" onClick={onOpen}>{nameOf(p.id)}</button><span className="num shrink-0 tabular-nums">{signedShort(total)}</span></div>
        <div className="relative h-2.5 rounded-full bg-surface-2" aria-hidden="true">
          <span className="absolute inset-y-[-3px] left-1/2 w-px bg-line-3" />
          <span className="absolute inset-y-0 rounded-full" style={{ left: total < 0 ? `${50 - w}%` : '50%', width: `max(${w}%, 2px)`, background: total < 0 ? 'var(--bad)' : 'var(--good)' }} />
        </div>
        {reason && <p className="text-[11px] text-ink-3">Chủ yếu do {reason.toLowerCase()}</p>}
      </li>;
    })}</ul>
  </figure>;
}

export function ForecastReview({ week, title = 'Hôm qua dự báo lệch bao nhiêu', onNavigate }: { week?: string; title?: string; onNavigate: (view: string) => void }) {
  const date = addDays(todayVn(), -1);
  const query: Record<string, string> = week ? { week } : { date };
  const api = useApi<ReviewRecord>(`/api/ai/forecast/review?${new URLSearchParams(query)}`, { refreshMs: 300000 });
  const staff = useApi<{ id: string; name: string }[]>('/api/employees');
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const r = api.data, d = r?.data;
  async function regenerate() {
    setBusy(true); setError('');
    try {
      const res = await fetch('/api/ai/forecast/review', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(query) });
      const body = await res.json() as { error?: string };
      if (!res.ok) throw new Error(body.error || 'Không thể phân tích lại');
      api.reload();
    } catch (e) { setError(e instanceof Error ? e.message : 'Không thể phân tích lại'); }
    finally { setBusy(false); }
  }
  const nameOf = (id: string) => staff.data?.find(s => s.id === id)?.name ?? 'Nhân viên không rõ';
  const ratio = d && d.forecast && d.delta !== null ? d.delta / d.forecast * 100 : null;
  const tone = d?.delta == null || d.delta === 0 ? 'text-ink' : d.delta < 0 ? 'text-bad' : 'text-good';
  return <section id={week ? 'ai-last-week' : 'ai-yesterday'} className="card min-w-0 space-y-4 p-4">
    <header className="flex flex-wrap items-start justify-between gap-2">
      <div className="min-w-0"><h2 className="font-semibold">{title}</h2><p className="text-xs text-ink-3">{week ? formatReviewWeek(week) : formatReviewDate(date)} · doanh thu đơn chốt · toàn công ty, mọi POS · MKT / CSKH / SALE</p></div>
      <button type="button" className="btn" disabled={busy || api.loading} onClick={() => void regenerate()}>{busy ? 'Đang phân tích…' : 'Phân tích lại'}</button>
    </header>
    {(error || api.error) && <p role="alert">{error || api.error}</p>}
    {!d ? <p>{api.loading ? 'Đang tải…' : 'Chưa có bản phân tích.'}</p> : <>
      <div className="grid grid-cols-3 gap-2">
        <div className="min-w-0 rounded-xl bg-surface-2 p-2.5"><p className="text-[11px] text-ink-3">{'basis' in d && d.basis === 'tinh-lai' ? 'Dự báo tính lại' : week ? 'Dự báo tuần' : 'Dự báo đầu ngày'}</p><p className="num truncate text-base font-semibold">{d.forecast === null ? '—' : shortMoney(d.forecast)}</p></div>
        <div className="min-w-0 rounded-xl bg-surface-2 p-2.5"><p className="text-[11px] text-ink-3">Thực tế</p><p className="num truncate text-base font-semibold">{shortMoney(d.actual)}</p></div>
        <div className="min-w-0 rounded-xl bg-surface-2 p-2.5"><p className="text-[11px] text-ink-3">Lệch</p><p className={`num truncate text-base font-semibold ${tone}`}>{d.delta === null ? '—' : `${d.delta < 0 ? '▼' : d.delta > 0 ? '▲' : ''} ${ratio === null ? '' : pct(ratio)}`}</p><p className={`num truncate text-[11px] ${tone}`}>{d.delta === null ? 'chưa xác định' : signedShort(d.delta)}</p></div>
      </div>
      <div className="grid gap-5 lg:grid-cols-2"><Waterfall d={d} /><PeopleBars people={d.people ?? []} nameOf={nameOf} onOpen={() => onNavigate('compare')} /></div>
      <div className="rounded-xl border border-line bg-tint-2 p-3"><p className="mb-1 text-xs font-semibold text-ink-2">Claude giải thích</p>
        {r.status === 'batch' ? <p className="text-sm">Claude đang viết, có trước 7h sáng</p> : r.status === 'off' ? <p className="text-sm">Chưa gắn khoá Claude, biểu đồ số vẫn đúng{r.error ? ` · ${r.error}` : ''}</p> : r.status === 'error' ? <p role="alert" className="text-sm">{r.error || 'Không thể phân tích bằng Claude'}</p> : <AiMarkdown text={r.text ?? ''} />}</div>
      <details className="text-sm"><summary className="cursor-pointer text-xs text-ink-3">Xem bảng số</summary>
        <div className="mt-2 overflow-x-auto"><table className="tbl w-full"><thead><tr><th>Phần</th><th>Lệch</th></tr></thead><tbody>{waterfallSteps(d).filter(s => s.kind === 'part').map(s => <tr key={s.label}><td>{s.label}</td><td data-label="Lệch">{signed(s.to - s.from)}</td></tr>)}</tbody></table></div>
        <div className="mt-2 overflow-x-auto"><table className="tbl w-full"><thead><tr><th>Nhân viên</th><th>Tỷ lệ chốt</th><th>Giá trị đơn</th></tr></thead><tbody>{d.top.map(p => <tr key={p.id}><td><button className="link" onClick={() => onNavigate('compare')}>{nameOf(p.id)}</button></td><td data-label="Tỷ lệ chốt">{signed(p.tiLeChot)}</td><td data-label="Giá trị đơn">{signed(p.giaTriDon)}</td></tr>)}</tbody></table></div>
      </details>
    </>}
  </section>;
}
