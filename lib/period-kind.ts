import { addDays, comparePeriod, daysBetween } from '@/lib/report-time';
import { PRESETS, presetRange, weekStart, type PresetKey } from '@/lib/periods';

export function periodKind(start: string, end: string, today: string, preset?: string) {
  const monthEnd = new Date(Date.UTC(Number(start.slice(0, 4)), Number(start.slice(5, 7)), 0)).toISOString().slice(0, 10);
  const inferred = start === today && end === today ? 'today' : start === weekStart(today) ? 'thisWeek' : start === `${today.slice(0, 7)}-01` ? 'month' : start === `${today.slice(0, 4)}-01-01` ? 'year' : '';
  const selected = preset ?? inferred;
  const periodEnd = selected === 'thisWeek' ? addDays(start, 6) : selected === 'month' ? monthEnd : selected === 'year' ? `${start.slice(0, 4)}-12-31` : end;
  const expected = presetRange(selected, today);
  const open = ['today', 'thisWeek', 'month', 'year'].includes(selected) && !!expected && start === expected.start && (end === today || end === periodEnd);
  const kind = selected === 'year' ? 'year' : selected === 'month' || selected === 'lastMonth' ? 'month' : selected === 'thisWeek' || selected === 'lastWeek' ? 'week' : ['week', 'quarter', 'all', 'custom'].includes(selected) ? 'range' : start === end ? 'day' : start.endsWith('-01') && start.slice(0, 7) === end.slice(0, 7) ? 'month' : start.endsWith('-01-01') && end.endsWith('-12-31') ? 'year' : start === weekStart(start) && daysBetween(start, end) === 7 ? 'week' : 'range';
  const prev = open && selected === 'year' ? { start: `${Number(start.slice(0, 4)) - 1}-01-01`, end: `${Number(start.slice(0, 4)) - 1}-12-31` } : comparePeriod(start, open ? periodEnd : end, 'previous');
  return { kind, open, label: PRESETS[selected as PresetKey] ?? `${start} – ${end}`, endLabel: selected === 'today' ? 'ngày' : selected === 'thisWeek' ? 'tuần' : selected === 'month' ? 'tháng' : 'năm', periodEnd: open ? periodEnd : end, prev, selected };
}
