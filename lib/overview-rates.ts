// Điền tỷ lệ chốt / hoàn / hủy theo "Cách tính" vào báo cáo tổng quan: API (theo tham số URL) và bot (theo mặc định công ty).
import { cancelRateOf, closeRateOf, closeRateTop, returnRateOf, type MetricSettings } from '@/lib/metrics';
import { companyMetrics } from '@/lib/metric-prefs';
import { overviewReport, type Metrics, type OverviewReport } from '@/lib/overview-report';

export function annotateRates<R extends OverviewReport>(report: R, ms: MetricSettings): R & { metricSettings: MetricSettings } {
  const one = (m: Metrics) => { m.rate = closeRateOf(m, ms.rateBase); m.returnRatio = returnRateOf(m, ms.returnBase); m.cancelRatio = cancelRateOf(m); };
  for (const part of [report.current, report.compare]) {
    if (!part) continue;
    one(part.total);
    for (const list of [part.byPos, part.byEmployee, part.byEmployeePos, part.series] as Metrics[][]) list.forEach(one);
  }
  return Object.assign(report, { metricSettings: ms });
}

/** Báo cáo tổng quan đã điền tỷ lệ theo mặc định công ty (dùng cho bot). */
export async function ratedOverview(opts: Parameters<typeof overviewReport>[0]) {
  const [report, ms] = await Promise.all([overviewReport(opts), companyMetrics()]);
  return annotateRates(report, ms);
}

/** "12 chốt / 30 tạo" hoặc "… / 30 chia" theo mẫu số đang chọn. */
export const rateFraction = (m: Metrics, ms: MetricSettings, fmt: (n: number) => string) =>
  ms.rateBase === 'assigned' ? `${fmt(closeRateTop(m, 'assigned'))} đã chốt / ${fmt(m.assignedOrders)} chia` : `${fmt(closeRateTop(m, 'created'))} đã chốt / ${fmt(m.orders)} tạo`;
/** Nhãn ngắn cho bot: "Tỷ lệ chốt (÷ đơn lên)". */
export const rateLabel = (ms: MetricSettings) => `Tỷ lệ chốt (${ms.rateBase === 'assigned' ? '÷ data chia' : '÷ đơn lên'})`;
export type RatedReport = OverviewReport & { metricSettings: MetricSettings };
