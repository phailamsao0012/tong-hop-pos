import type { OverviewReport } from '../overview-view';

type EmployeeDay = { sellerId: string; day: string; closedNet: number };
/** Align by day in each reporting period, preserving missing comparison data as null. */
export function peopleTrendSeries(report: OverviewReport, employeeIds?: readonly string[]) {
  const build = (period: OverviewReport['current']) => {
    const buckets = new Map<string, number>();
    const add = (day: string, net: number) => buckets.set(day, (buckets.get(day) ?? 0) + net);
    if (employeeIds) {
      const ids = new Set(employeeIds);
      const rows = (period as OverviewReport['current'] & { byEmployeeDay?: EmployeeDay[] }).byEmployeeDay;
      for (const row of rows ?? []) if (ids.has(row.sellerId)) add(row.day, row.closedNet);
    } else {
      for (const row of period.series) add(row.bucket, row.closedNet);
    }
    return buckets;
  };
  const now = build(report.current);
  const before = report.compare ? build(report.compare) : new Map<string, number>();
  const offset = report.compare ? Date.parse(report.compare.period.start) - Date.parse(report.current.period.start) : 0;
  const days = [...now.keys()].sort();
  return {
    labels: days,
    current: days.map((day) => now.get(day)!),
    previous: days.map((day) => before.get(new Date(Date.parse(day) + offset).toISOString().slice(0, 10)) ?? null),
  };
}
