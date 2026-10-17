'use client';

import { useState } from 'react';
import { Line, LineChart, XAxis, YAxis, CartesianGrid } from 'recharts';
import { TrendingUp } from 'lucide-react';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';
import { trendChartRows, type Bucket, type mktTrend } from '@/lib/mkt-trend';
import { daysBetween } from '@/lib/report-time';
import { ChartCard, ErrorBox, SegmentedControl, TableWrap, money, short, vi } from './ui-kit';
import { useApi } from './use-api';
import { useTeam } from './team-store';

type Report = Awaited<ReturnType<typeof mktTrend>>;
const columns = [
  ['cost', 'Chi phí', 'Chi phí QC trong đoạn; không thay đổi theo POS.', money],
  ['phones', 'Số về', 'SĐT duy nhất theo marketer trong cả kỳ, gán vào ngày xuất hiện đầu tiên.', (n: number) => vi.format(n)],
  ['costPerLead', 'CP/số', 'Chi phí ÷ số về của marketer có chi phí trong cả kỳ (như số chính).', money],
  ['newOrders', 'Đơn New', 'Đơn MKT chốt theo ngày xác nhận lần đầu, người bán thuộc Sale.', (n: number) => vi.format(n)],
  ['closeRate', 'Tỷ lệ chốt', 'Đơn New ÷ số về × 100%.', (n: number) => `${n.toFixed(1)}%`],
  ['newNet', 'DT New', 'Doanh thu đơn New trong đoạn.', money],
  ['roas', 'ROAS', 'DT New của marketer có chi phí trong cả kỳ ÷ chi phí; nút CSKH hiển thị —.', (n: number) => `${n.toFixed(2)}×`],
  ['costShare', '% chi phí', 'Chi phí ÷ DT New của marketer có chi phí × 100%.', (n: number) => `${n.toFixed(1)}%`],
  ['aov', 'AOV New', 'DT New ÷ đơn New.', money],
] as const;

export function MktTrendPanel({ start, end, posIds, marketerId, teamId }: { start: string; end: string; posIds: string[]; marketerId: string; teamId: string }) {
  const [choice, setChoice] = useState<{ period: string; bucket: Bucket } | null>(null);
  const period = `${start}:${end}`;
  const bucket = choice?.period === period ? choice.bucket : daysBetween(start, end) <= 31 ? 'day' : daysBetween(start, end) <= 120 ? 'week' : 'month';
  const team = useTeam();
  const p = new URLSearchParams({ start, end, posIds: posIds.join(','), bucket, team });
  if (marketerId !== '__all') p.set('marketerId', marketerId);
  if (teamId !== '__all') p.set('teamId', teamId);
  const { data, error, reload } = useApi<Report>(`/api/marketing/trend?${p}`, { keep: false });
  const format = (value: number | null, fn: (n: number) => string) => value === null ? '—' : fn(value);
  return <ChartCard icon={TrendingUp} title="Xu hướng MKT" subtitle="Theo kỳ, POS, team MKT và marketer đang chọn · đơn New do Sale chốt; chi phí theo phạm vi số chính">
    <SegmentedControl value={bucket} onChange={(v) => setChoice({ period, bucket: v })} options={[{ value: 'day', label: 'Ngày' }, { value: 'week', label: 'Tuần' }, { value: 'month', label: 'Tháng' }]} />
    {error && <ErrorBox error={error} onRetry={reload} />}
    {!data && !error && <output className="block p-4 text-ink-3">Đang tải xu hướng MKT…</output>}
    {data && <>
      <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{columns.map(([key, label, tip, fn]) => <div key={key} className="min-w-0 rounded-xl border border-line p-3">
        <h3 className="text-sm font-semibold" title={`Cách tính: ${tip}`}>{label}</h3>
        <ChartContainer config={{ [key]: { label, color: 'var(--primary)' } }} className="mt-2 h-36 w-full aspect-auto">
          <LineChart data={trendChartRows(data.rows, key)} margin={{ left: 0, right: 8 }}><CartesianGrid vertical={false} /><XAxis dataKey="key" minTickGap={28} tick={{ fontSize: 10 }} /><YAxis width={52} tick={{ fontSize: 10 }} tickFormatter={(n: number) => short(n)} /><ChartTooltip content={<ChartTooltipContent formatter={(v) => format(typeof v === 'number' ? v : null, fn)} />} /><Line name={label} dataKey="complete" stroke="var(--primary)" dot={false} isAnimationActive={false} /><Line name={`${label} · đang chạy`} dataKey="running" stroke="var(--primary)" strokeDasharray="5 4" dot={{ fill: "white", stroke: "var(--primary)", r: 3 }} isAnimationActive={false} /></LineChart>
        </ChartContainer>
        <p className="text-[11px] text-ink-3">{key === 'cost' || key === 'newNet' || key === 'aov' || key === 'costPerLead' ? 'Trục: đồng (tr: triệu, tỷ: tỷ đồng).' : key === 'closeRate' || key === 'costShare' ? 'Trục: %.' : key === 'roas' ? 'Trục: lần.' : 'Trục: số lượng.'}</p>
      </div>)}</div>
      <p className="mt-3 text-xs text-ink-3">Số về được tính một lần trong kỳ theo từng marketer. Đoạn đang chạy dùng nét đứt và điểm rỗng; chi phí từ sheet CPQC Daily cập nhật theo giờ. Nhận định chỉ so các đoạn đã đủ, với 4 đoạn trước, ngưỡng 10%.</p>
      {data.notes.length > 0 && <ul className="my-3 list-disc pl-5 text-sm">{data.notes.map(n => <li key={n}>{n}</li>)}</ul>}
      <TableWrap><table className="tbl"><thead><tr><th>Đoạn bắt đầu</th>{columns.map(([key, label, tip]) => <th key={key} title={`Cách tính: ${tip}`} className="n">{label}</th>)}</tr></thead>
        <tbody>{data.rows.map(r => <tr key={r.key}><td>{r.key}{r.partial && <span className="ml-1 text-xs text-ink-3">· đang chạy{r.cost === 0 ? " · chưa có chi phí" : ""}</span>}</td>{columns.map(([key, , tip, fn]) => <td className="n" key={key} title={`Cách tính: ${tip}`}>{r.partial && r.cost === 0 && (key === 'cost' || key === 'costPerLead' || key === 'roas' || key === 'costShare') ? 'chưa có chi phí' : format(r[key], fn)}</td>)}</tr>)}</tbody>
        <tfoot><tr><td>Tổng kỳ</td>{columns.map(([key, , tip, fn]) => <td key={key} className="n" title={`Cách tính: ${tip}`}>{format(data.total[key], fn)}</td>)}</tr></tfoot>
      </table></TableWrap>
    </>}
  </ChartCard>;
}
