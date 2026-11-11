'use client';

import { useState } from 'react';
import { Line, LineChart, XAxis, YAxis, CartesianGrid } from 'recharts';
import { TrendingUp } from 'lucide-react';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';
import { trendChartRows, trendTile } from '@/lib/reports/mkt-trend-rows';
import type { Bucket, mktTrend } from '@/lib/reports/mkt-trend';
import { daysBetween } from '@/lib/shared/report-time';
import { Th, ChartCard, ErrorBox, SegmentedControl, TableWrap, money, pct, short, shortMoney, vi } from './ui-kit';
import { useApi } from './use-api';
import { useTeam } from './team-store';

type Report = Awaited<ReturnType<typeof mktTrend>>;
const columns = [
  ['cost', 'Chi phí', 'Chi phí QC trong đoạn; không thay đổi theo POS.', money],
  ['phones', 'Số về', 'SĐT duy nhất theo marketer trong cả kỳ, gán vào ngày xuất hiện đầu tiên.', (n: number) => vi.format(n)],
  ['costPerLead', 'CP/số', 'Chi phí ÷ số về của marketer có chi phí trong cả kỳ (như số chính).', money],
  ['newOrders', 'Đơn New', 'Đơn MKT chốt theo ngày xác nhận lần đầu, người bán thuộc Sale.', (n: number) => vi.format(n)],
  ['closeRate', 'Tỷ lệ chốt', 'Đơn New ÷ số về × 100%.', (n: number) => pct(n)],
  ['newNet', 'DT New', 'Doanh thu đơn New trong đoạn.', money],
  ['roas', 'ROAS', 'DT New của marketer có chi phí trong cả kỳ ÷ chi phí; nút CSKH hiển thị —.', (n: number) => `${n.toFixed(2).replace('.', ',')}×`],
  ['costShare', '% chi phí', 'Chi phí ÷ DT New của marketer có chi phí × 100%.', (n: number) => pct(n)],
  ['aov', 'AOV New', 'DT New ÷ đơn New.', money],
] as const;
type Key = (typeof columns)[number][0];
// Thấp hơn là tốt: CP/số và % chi phí. Chi phí để màu trung tính.
const lowerBetter = new Set<Key>(['costPerLead', 'costShare']);

function Spark({ values }: { values: (number | null)[] }) {
  const nums = values.filter((v): v is number => v !== null);
  if (nums.length < 2) return <svg className="h-6 w-full" aria-hidden />;
  const min = Math.min(...nums), max = Math.max(...nums), span = max - min || 1;
  const pts = values.map((v, i) => v === null ? null : `${(i / (values.length - 1)) * 100},${22 - ((v - min) / span) * 20}`).filter(Boolean).join(' ');
  return <svg viewBox="0 0 100 24" preserveAspectRatio="none" className="h-6 w-full" aria-hidden><polyline points={pts} fill="none" stroke="var(--primary)" strokeWidth="1.6" vectorEffect="non-scaling-stroke" /></svg>;
}

export function MktTrendPanel({ start, end, posIds, marketerId, teamId }: { start: string; end: string; posIds: string[]; marketerId: string; teamId: string }) {
  const [choice, setChoice] = useState<{ period: string; bucket: Bucket } | null>(null);
  const period = `${start}:${end}`;
  const bucket = choice?.period === period ? choice.bucket : daysBetween(start, end) <= 31 ? 'day' : daysBetween(start, end) <= 120 ? 'week' : 'month';
  const team = useTeam();
  const p = new URLSearchParams({ start, end, posIds: posIds.join(','), bucket, team });
  if (marketerId !== '__all') p.set('marketerId', marketerId);
  if (teamId !== '__all') p.set('teamId', teamId);
  const { data, error, reload } = useApi<Report>(`/api/marketing/trend?${p}`, { keep: false });
  const [open, setOpen] = useState<Key | null>(null);
  const word = bucket === 'day' ? 'ngày' : bucket === 'week' ? 'tuần' : 'tháng';
  const format = (value: number | null, fn: (n: number) => string) => value === null ? '—' : fn(value);
  return <ChartCard icon={TrendingUp} title="Xu hướng MKT" subtitle="Theo kỳ, POS, team MKT và marketer đang chọn · đơn New do Sale chốt; chi phí theo phạm vi số chính">
    <SegmentedControl value={bucket} onChange={(v) => setChoice({ period, bucket: v })} options={[{ value: 'day', label: 'Ngày' }, { value: 'week', label: 'Tuần' }, { value: 'month', label: 'Tháng' }]} />
    {error && <ErrorBox error={error} onRetry={reload} />}
    {!data && !error && <output className="block p-4 text-ink-3">Đang tải xu hướng MKT…</output>}
    {data && <>
      <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-5 xl:grid-cols-9">{columns.map(([key, label, tip, fn]) => {
        const t = trendTile(data.rows, key);
        const good = t.change === null || key === 'cost' ? null : (t.change > 0) !== lowerBetter.has(key);
        return <button type="button" key={key} onClick={() => setOpen(open === key ? null : key)} aria-pressed={open === key} title={`Cách tính: ${tip}`} className={`min-w-0 rounded-lg border p-2 text-left ${open === key ? 'border-primary bg-primary/5' : 'border-line hover:bg-muted/50'}`}>
          <div className="truncate text-[11px] text-ink-3">{label}</div>
          <div className="truncate text-sm font-semibold tabular-nums">{format(data.total[key], fn === money ? shortMoney : fn)}</div>
          <Spark values={t.spark} />
          <div className={`truncate text-[11px] tabular-nums ${good === null ? 'text-ink-3' : good ? 'text-emerald-700 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>{t.change === null ? '—' : `${t.change > 0 ? '+' : ''}${t.change.toFixed(0)}%`}</div>
        </button>;
      })}</div>
      <p className="mt-1 text-[11px] text-ink-3">Số đậm: tổng kỳ · đường nhỏ: 14 {word} đã đủ gần nhất · %: {word} đủ gần nhất so {word} trước đó (xanh tốt lên, đỏ xấu đi) · bấm ô xem biểu đồ to.</p>
      {open && (() => { const [key, label, , fn] = columns.find(c => c[0] === open)!; return <div className="mt-3 rounded-xl border border-line p-3">
        <h3 className="text-sm font-semibold">{label}</h3>
        <ChartContainer config={{ [key]: { label, color: 'var(--primary)' } }} className="mt-2 h-56 w-full aspect-auto">
          <LineChart data={trendChartRows(data.rows, key)} margin={{ left: 0, right: 8 }}><CartesianGrid vertical={false} /><XAxis dataKey="key" minTickGap={28} tick={{ fontSize: 11 }} /><YAxis width={52} tick={{ fontSize: 11 }} tickFormatter={(n: number) => short(n)} /><ChartTooltip content={<ChartTooltipContent formatter={(v) => format(typeof v === 'number' ? v : null, fn)} />} /><Line name={label} dataKey="complete" stroke="var(--primary)" dot={false} isAnimationActive={false} /><Line name={`${label} · đang chạy`} dataKey="running" stroke="var(--primary)" strokeDasharray="5 4" dot={{ fill: "white", stroke: "var(--primary)", r: 3 }} isAnimationActive={false} /></LineChart>
        </ChartContainer>
      </div>; })()}
      <p className="mt-2 text-[11px] text-ink-3">Số về tính một lần trong kỳ theo từng marketer; đoạn đang chạy nét đứt; chi phí từ sheet CPQC Daily theo giờ.</p>
      {data.notes.length > 0 && <ul className="my-3 list-disc pl-5 text-sm">{data.notes.map(n => <li key={n}>{n}</li>)}</ul>}
      <details className="mt-3"><summary className="cursor-pointer text-sm text-ink-2">Bảng từng {word}</summary><TableWrap><table className="tbl"><thead><tr><Th>Đoạn bắt đầu</Th>{columns.map(([key, label, tip]) => <Th key={key} title={`Cách tính: ${tip}`} className="n">{label}</Th>)}</tr></thead>
        <tbody>{data.rows.map(r => <tr key={r.key}><td>{r.key}{r.partial && <span className="ml-1 text-xs text-ink-3">· đang chạy{r.cost === 0 ? " · chưa có chi phí" : ""}</span>}</td>{columns.map(([key, , tip, fn]) => <td className="n" key={key} title={`Cách tính: ${tip}`}>{r.partial && r.cost === 0 && (key === 'cost' || key === 'costPerLead' || key === 'roas' || key === 'costShare') ? 'chưa có chi phí' : format(r[key], fn)}</td>)}</tr>)}</tbody>
        <tfoot><tr><td>Tổng kỳ</td>{columns.map(([key, , tip, fn]) => <td key={key} className="n" title={`Cách tính: ${tip}`}>{format(data.total[key], fn)}</td>)}</tr></tfoot>
      </table></TableWrap></details>
    </>}
  </ChartCard>;
}
