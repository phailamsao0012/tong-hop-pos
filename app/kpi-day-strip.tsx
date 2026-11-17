'use client';

// Dải KPI tháng chia ngày trong khối Sale / CSKH / MKT ở Tổng quan (anh Vũ 12/11/2026).
// Số chính: thiếu (đỏ) / dư (xanh) so với phải đạt tới hết hôm qua; số tự đổi khi có đơn chốt mới. Dòng nhỏ: % tháng, hôm nay cần bao nhiêu.
import type { KpiDayDept, KpiDayReport } from '@/lib/kpi/kpi-day-report';
import { signedShort, millions } from '@/lib/kpi/kpi-pace';
import { posShortName } from '@/lib/shared/pos-short';
import { useApi } from './use-api';
import { holidayLabel, useHolidays } from './holidays-store';

export function useKpiDay(posIds: string[]) {
  return useApi<KpiDayReport>(`/api/reports/kpi-day?${new URLSearchParams({ posIds: posIds.join(',') })}`, { refreshMs: 5 * 60000, keep: true });
}

export function KpiDayStrip({ dept, report }: { dept: KpiDayDept | undefined; report: KpiDayReport | undefined }) {
  const holidays = useHolidays();
  if (!report || !dept) return null;
  const k = dept.kpi;
  const label = `KPI T${Number(report.month.slice(5))}`;
  const holiday = holidayLabel(holidays, report.today);
  if (!k) return <p className="rounded-lg bg-surface-2 px-3 py-1.5 text-[11.5px] text-ink-3">{label}: chưa đặt cho POS đang chọn (trang Mục tiêu › Bộ phận × POS).</p>;
  const behind = k.diff < 0;
  const title = [
    `${label}: ${millions(k.goal)} · ${millions(k.daily)}/ngày (${k.daysInMonth} ngày)`,
    `Phải đạt tới hết hôm qua (${k.dayOfMonth - 1} ngày): ${millions(k.mustByYesterday)}`,
    `Đã đạt tới lúc này: ${millions(k.achieved)} (hôm nay ${millions(k.achievedToday)})`,
    'Đã chốt là chốt: đơn hoàn / hủy về sau không trừ.',
    ...dept.byPos.filter((r) => r.goal > 0).map((r) => `· ${posShortName(r.posId)}: KPI ${millions(r.goal)} · đạt ${millions(r.achieved)}`),
  ].join('\n');
  return (
    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 rounded-lg bg-surface-2 px-3 py-1.5 text-[11.5px] text-ink-3" title={title}>
      <span className="font-semibold text-ink-2">{label}</span>
      <span className={`num text-[15px] font-bold ${behind ? 'text-bad' : 'text-good'}`}>{behind ? 'Thiếu ' : 'Dư '}{signedShort(k.diff)}</span>
      <span className="num">{k.pctMonth.toFixed(1).replace('.', ',')}% tháng · đạt {millions(k.achieved)} / {millions(k.goal)}</span>
      <span className="num">hôm nay cần {millions(k.needToday)} · đã có {millions(k.achievedToday)}</span>
      {holiday && <span className="rounded-full bg-tint-2 px-2 text-primary">{holiday}</span>}
    </div>
  );
}
