// Biểu đồ cho bot Telegram: dựng cấu hình Chart.js từ báo cáo rồi nhờ QuickChart render PNG.
import { overviewReport } from '@/lib/overview-report';
import { POS } from '@/lib/report-model';
import { parsePeriod, type Period } from '@/lib/bot-parse';

const POS_COLORS = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#4a3aa7'];
const short = (n: number) => n >= 1e9 ? `${(n / 1e9).toFixed(2)} tỷ` : n >= 1e6 ? `${(n / 1e6).toFixed(1)} tr` : String(Math.round(n));
const dmy = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;

export const CHART_KINDS = {
  doanhthu: 'Doanh thu theo ngày',
  donchot: 'Đơn chốt theo ngày',
  pos: 'Doanh thu theo POS',
  possong: 'Doanh thu từng POS theo ngày',
  top: 'Top nhân viên theo doanh thu',
  tyle: 'Tỷ lệ chốt nhân viên',
  trangthai: 'Trạng thái đơn',
} as const;
export type ChartKind = keyof typeof CHART_KINDS;

type ChartResult = { url: string; caption: string };

function tick(groupBy: 'day' | 'week' | 'month') {
  return (b: string) => groupBy === 'month' ? b : dmy(b);
}

export async function buildChart(kind: ChartKind, period: Period, posIds: string[]): Promise<ChartResult> {
  const days = Math.round((Date.parse(period.end) - Date.parse(period.start)) / 86400000) + 1;
  const groupBy: 'day' | 'week' | 'month' = days > 120 ? 'month' : days > 45 ? 'week' : 'day';
  const r = await overviewReport({ posIds, start: period.start, end: period.end, groupBy, compare: period.compare ?? 'none' });
  const posLabel = posIds.length ? posIds.map((id) => POS.find((p) => p.id === id)?.name ?? id).join(', ') : 'tất cả POS';
  const title = `${CHART_KINDS[kind]} · ${period.label} · ${posLabel}`;
  const buckets = [...new Set(r.current.series.map((s) => s.bucket))].sort();
  const sumBy = (key: 'closedNet' | 'closedOrders' | 'orders') => buckets.map((b) => r.current.series.filter((s) => s.bucket === b).reduce((a, s) => a + s[key], 0));
  const prevBuckets = r.compare ? [...new Set(r.compare.series.map((s) => s.bucket))].sort() : [];
  const prevSum = (key: 'closedNet' | 'closedOrders') => prevBuckets.map((b) => r.compare!.series.filter((s) => s.bucket === b).reduce((a, s) => a + s[key], 0));
  const money = { callback: '(v)=>v>=1e9?(v/1e9).toFixed(1)+" tỷ":v>=1e6?(v/1e6).toFixed(0)+" tr":v' };
  let config: Record<string, unknown>;
  let caption = title;

  if (kind === 'doanhthu' || kind === 'donchot') {
    const key = kind === 'doanhthu' ? 'closedNet' : 'closedOrders';
    const datasets: Record<string, unknown>[] = [{ label: 'Kỳ này', data: sumBy(key), backgroundColor: '#2a78d6', borderRadius: 4 }];
    if (r.compare && prevBuckets.length) datasets.unshift({ label: 'Kỳ so sánh', data: prevSum(key), backgroundColor: '#c3c2b7', borderRadius: 4 });
    config = {
      type: 'bar',
      data: { labels: buckets.map(tick(groupBy)), datasets },
      options: {
        plugins: { title: { display: true, text: title }, legend: { display: datasets.length > 1 } },
        scales: { y: { beginAtZero: true, ticks: kind === 'doanhthu' ? money : {} } },
      },
    };
    const total = r.current.total;
    caption = `${title}\nTổng: ${kind === 'doanhthu' ? short(total.closedNet) + ' đ' : total.closedOrders + ' đơn chốt'}${r.compare ? ` · kỳ trước ${kind === 'doanhthu' ? short(r.compare.total.closedNet) + ' đ' : r.compare.total.closedOrders + ' đơn'}` : ''}`;
  } else if (kind === 'pos') {
    const rows = POS.map((p) => ({ name: p.name, cur: r.current.byPos.find((x) => x.posId === p.id)?.closedNet ?? 0, prev: r.compare?.byPos.find((x) => x.posId === p.id)?.closedNet ?? 0 }));
    const datasets: Record<string, unknown>[] = [{ label: 'Kỳ này', data: rows.map((x) => x.cur), backgroundColor: POS_COLORS, borderRadius: 4 }];
    if (r.compare) datasets.unshift({ label: 'Kỳ so sánh', data: rows.map((x) => x.prev), backgroundColor: '#c3c2b7', borderRadius: 4 });
    config = { type: 'bar', data: { labels: rows.map((x) => x.name), datasets }, options: { indexAxis: 'y', plugins: { title: { display: true, text: title }, legend: { display: !!r.compare } }, scales: { x: { beginAtZero: true, ticks: money } } } };
    caption = `${title}\n${rows.filter((x) => x.cur).sort((a, b) => b.cur - a.cur).map((x) => `${x.name}: ${short(x.cur)} đ`).join(' · ')}`;
  } else if (kind === 'possong') {
    const ids = posIds.length ? posIds : POS.map((p) => p.id);
    config = {
      type: 'line',
      data: { labels: buckets.map(tick(groupBy)), datasets: ids.map((id) => ({
        label: POS.find((p) => p.id === id)?.name ?? id, borderColor: POS_COLORS[POS.findIndex((p) => p.id === id)] ?? '#52514e', fill: false, tension: 0.3, pointRadius: 2,
        data: buckets.map((b) => r.current.series.find((s) => s.bucket === b && s.posId === id)?.closedNet ?? 0),
      })) },
      options: { plugins: { title: { display: true, text: title } }, scales: { y: { beginAtZero: true, ticks: money } } },
    };
  } else if (kind === 'top' || kind === 'tyle') {
    const rows = r.current.byEmployee.filter((e) => e.sellerId && (e.closedOrders || e.assignedOrders))
      .sort((a, b) => kind === 'top' ? b.closedNet - a.closedNet : (b.assignedCloseRate ?? -1) - (a.assignedCloseRate ?? -1)).slice(0, 15);
    config = {
      type: 'bar',
      data: { labels: rows.map((e) => e.name.slice(0, 22)), datasets: [kind === 'top'
        ? { label: 'Doanh thu', data: rows.map((e) => e.closedNet), backgroundColor: '#2a78d6', borderRadius: 4 }
        : { label: 'Tỷ lệ chốt %', data: rows.map((e) => Number((e.assignedCloseRate ?? 0).toFixed(1))), backgroundColor: rows.map((e) => (e.assignedCloseRate ?? 0) < 40 ? '#e34948' : '#1baf7a'), borderRadius: 4 }] },
      options: { indexAxis: 'y', plugins: { title: { display: true, text: title }, legend: { display: false } }, scales: { x: { beginAtZero: true, ticks: kind === 'top' ? money : {}, ...(kind === 'tyle' ? { max: 100 } : {}) } } },
    };
    caption = `${title}\n${rows.slice(0, 5).map((e, i) => `${i + 1}. ${e.name}: ${kind === 'top' ? short(e.closedNet) + ' đ' : `${(e.assignedCloseRate ?? 0).toFixed(1)}% (${e.closedOrders}/${e.assignedOrders})`}`).join('\n')}`;
  } else {
    const g = r.current.total.groups;
    const labels = ['Mới/chờ XN', 'Đã XN/xử lý', 'Đang giao', 'Giao TC', 'Hoàn', 'Hủy'];
    const data = [g.new.orders, g.confirmed.orders, g.shipping.orders, g.delivered.orders, g.returned.orders, g.cancelled.orders];
    config = { type: 'doughnut', data: { labels, datasets: [{ data, backgroundColor: ['#c3c2b7', '#2a78d6', '#eda100', '#1baf7a', '#e87ba4', '#e34948'] }] }, options: { plugins: { title: { display: true, text: `${title} (đơn tạo trong kỳ)` }, doughnutlabel: { labels: [{ text: String(r.current.total.orders), font: { size: 24 } }, { text: 'đơn tạo' }] } } } };
    caption = `${title}\n${labels.map((l, i) => `${l}: ${data[i]}`).join(' · ')}`;
  }
  const url = await renderChart(config);
  return { url, caption };
}

/** Nhờ QuickChart tạo ảnh và trả về URL ngắn để Telegram tải. */
export async function renderChart(config: Record<string, unknown>) {
  const response = await fetch('https://quickchart.io/chart/create', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chart: config, width: 900, height: 520, backgroundColor: 'white', format: 'png', version: '4' }),
    signal: AbortSignal.timeout(15000),
  });
  const result = await response.json() as { success?: boolean; url?: string };
  if (!response.ok || !result.success || !result.url) throw new Error('Không tạo được ảnh biểu đồ.');
  return result.url;
}

/** Phân tích `/bieudo [loại] [kỳ] [pos]` → loại + kỳ + POS. */
export function parseChartArgs(args: string[], parsePosFn: (tokens: string[]) => { posIds: string[]; rest: string[] }) {
  const { period, rest } = parsePeriod(args);
  const { posIds, rest: rest2 } = parsePosFn(rest);
  const kindToken = rest2.map((t) => t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/[^a-z]/g, ''))
    .find((t): t is ChartKind => t in CHART_KINDS);
  return { kind: kindToken ?? 'doanhthu', period, posIds };
}
