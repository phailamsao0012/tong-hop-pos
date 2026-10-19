'use client';

import { useState } from 'react';
import { Line, LineChart, XAxis, YAxis } from 'recharts';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';
import { addDays, todayVn } from '@/lib/report-time';
import type { forecastForDisplay } from '@/lib/forecast-run';
import type { ReviewRecord } from '@/lib/forecast-review';
import { useApi } from './use-api';
import { money, ProgressBar } from './ui-kit';
/** Chỉ đoạn, danh sách và chữ đậm; HTML luôn là nút chữ React được escape. */
export function markdownBlocks(text: string) {
  return text.split(/\r?\n/).filter(line => line.trim()).map(line => ({
    list: /^\s*[-*]\s+/.test(line),
    spans: line.replace(/^\s*[-*]\s+/, '').split(/(\*\*[^*]+\*\*)/g).filter(Boolean).map(value => ({ bold: value.startsWith('**') && value.endsWith('**'), text: value.startsWith('**') && value.endsWith('**') ? value.slice(2, -2) : value })),
  }));
}
export function AiMarkdown({ text }: { text: string }) {
  return <div className="space-y-2 whitespace-pre-wrap break-words text-sm">{markdownBlocks(text).map((b, i) => {
    const content = b.spans.map((s, j) => s.bold ? <strong key={j}>{s.text}</strong> : s.text);
    return b.list ? <ul key={i} className="list-disc pl-5"><li>{content}</li></ul> : <p key={i}>{content}</p>;
  })}</div>;
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
      {d.points.length > 0 && <ChartContainer className="h-44 w-full" config={{ actual: { label: 'Đã có', color: 'var(--primary)' }, today: { label: 'Dự kiến cuối ngày', color: 'var(--ink-2)' } }}><LineChart data={d.points}><XAxis dataKey="t" minTickGap={30} /><YAxis width={45} tickFormatter={n => `${Number(n) / 1000000}tr`} /><ChartTooltip content={<ChartTooltipContent />} /><Line dataKey="actual" stroke="var(--primary)" dot={false} /><Line dataKey="today" stroke="var(--ink-2)" strokeDasharray="5 4" dot={false} /></LineChart></ChartContainer>}
      <p className="text-xs text-ink-3">{d.points.length ? `Tính lúc ${d.points[d.points.length - 1].t} · dự báo đầu ngày ${amount(d.morningTotal)}` : beforeSeven ? 'Dự báo bắt đầu từ 7:00' : 'Chưa có mốc dự báo hôm nay'}</p>
      {api.stale && <p className="text-xs text-warn">Số lưu lần trước · đang chờ cập nhật</p>}
    </>}
  </section>;
}

function largestPart(parts: readonly (readonly [string, number])[]) {
  let max = 1;
  for (const [, value] of parts) max = Math.max(max, Math.abs(value));
  return max;
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
  const parts = d ? [['Số chia', d.parts.soChia], ['Tỷ lệ chốt', d.parts.tiLeChot], ['Giá trị đơn', d.parts.giaTriDon], ['Nghỉ', d.parts.nghi], ['Khác (gồm mới, chưa gán)', d.parts.khac + d.parts.moi + d.parts.chuaGan]] as const : [];
  const max = largestPart(parts);
  return <section id={week ? 'ai-last-week' : 'ai-yesterday'} className="card min-w-0 space-y-3 p-4">
    <h2 className="font-semibold">{title}</h2><p className="text-xs text-ink-3">{week ? `${week} – ${addDays(week, 6)}` : date} · doanh thu đơn chốt · toàn công ty, mọi POS · MKT / CSKH / SALE</p>
    {(error || api.error) && <p role="alert">{error || api.error}</p>}
    {!d ? <p>{api.loading ? 'Đang tải…' : 'Chưa có bản phân tích.'}</p> : <>
      <p>{'basis' in d && d.basis === 'tinh-lai' ? 'Dự báo tính lại' : week ? 'Dự báo tuần' : 'Dự báo đầu ngày'} {amount(d.forecast)}, thực tế {amount(d.actual)}, lệch {d.delta === null ? 'chưa xác định' : signed(d.delta)} ({d.forecast ? `${((d.delta ?? 0) / d.forecast * 100).toLocaleString('vi-VN', { maximumFractionDigits: 1, signDisplay: 'always' })}%` : 'chưa có tỷ lệ'})</p>
      <div className="space-y-2">{parts.map(([label, n]) => <div key={label} className="text-xs"><div className="flex flex-wrap justify-between gap-1"><span>{label} · {n < 0 ? 'giảm' : n > 0 ? 'tăng' : 'không đổi'}</span><span>{signed(n)}</span></div><div className="mt-1 h-2 rounded bg-surface-2"><div className="h-2 rounded" style={{ width: `${Math.abs(n) / max * 100}%`, background: n < 0 ? 'var(--bad)' : 'var(--good)' }} /></div></div>)}</div>
      <div className="overflow-x-auto"><table className="tbl w-full"><thead><tr><th>Nhân viên</th><th>Tỷ lệ chốt</th><th>Giá trị đơn</th></tr></thead><tbody>{d.top.map(p => <tr key={p.id}><td><button className="link" onClick={() => onNavigate('compare')}>{staff.data?.find(s => s.id === p.id)?.name ?? 'Nhân viên không rõ'}</button></td><td>{signed(p.tiLeChot)}</td><td>{signed(p.giaTriDon)}</td></tr>)}</tbody></table></div>
      {r.status === 'batch' ? <p>Claude đang viết, có trước 7h sáng</p> : r.status === 'off' ? <p>Chưa gắn khoá Claude, bảng số vẫn đúng{r.error ? ` · ${r.error}` : ''}</p> : r.status === 'error' ? <p role="alert">{r.error || 'Không thể phân tích bằng Claude'}</p> : <AiMarkdown text={r.text ?? ''} />}
    </>}
    <button type="button" className="btn" disabled={busy || api.loading} onClick={() => void regenerate()}>{busy ? 'Đang phân tích…' : 'Phân tích lại'}</button>
  </section>;
}
