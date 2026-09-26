// Biểu tượng chuẩn theo khái niệm cho web (cùng nguồn lib/metric-icons.ts với app iPhone / Android).
// Dùng như icon Lucide: <ICON.closed size={16} />, hoặc truyền vào KpiCard/ChartCard (icon={ICON.revenue}).
import { createLucideIcon, type LucideIcon } from 'lucide-react';
import { METRIC_ICONS, type MetricIconId } from '@/lib/metric-icons';

export const ICON = Object.fromEntries(METRIC_ICONS.map((i) => [
  i.id, createLucideIcon(`thp-${i.id}`, i.paths.map((d, k) => ['path', { d, key: String(k) }])),
])) as Record<MetricIconId, LucideIcon>;
