// Báo cáo 8h gửi leader qua Zalo (mẫu anh Vũ chốt 02/11/2026, Artifact GNtjbu7MKFrpW34UcHtngN).
// Logic thuần: nhận số đã đọc sẵn, trả mô hình báo cáo và bản chữ; ảnh vẽ ở app/zalo-morning-image.tsx. Không đọc D1 ở đây.
import { addDays } from '@/lib/shared/report-time';
import { kpiPace, millions } from '@/lib/kpi/kpi-pace';

export type MorningDay = {
  day: string;
  net: number;
  orders: number;
  created: number;
  createdClosed: number;
};
export type MorningPerson = { name: string; net: number; orders: number };
export type MorningTask = { who: string; title: string };
export type MorningData = {
  team: string;
  /** Sale có tỉ lệ chốt; CSKH bỏ tỉ lệ chốt (anh Vũ 31/10/2026). */
  dept: 'sale' | 'cskh';
  /** Ngày gửi (YYYY-MM-DD, giờ Việt Nam). Số là của ngày hôm trước. */
  today: string;
  /** Doanh số theo ngày, ít nhất 14 ngày tới hôm qua; ngày thiếu coi là 0. */
  days: MorningDay[];
  /** Doanh số tháng của hôm qua tính tới hết hôm qua. */
  monthNet: number;
  goal: number | null;
  workingDays: number | null;
  /** Từng người trong team, số của hôm qua (kể cả người 0 đơn). */
  people: MorningPerson[];
  overdue: MorningTask[];
  dueToday: MorningTask[];
  meetings?: string[];
};

const WEEKDAYS = [
  'Chủ nhật',
  'thứ Hai',
  'thứ Ba',
  'thứ Tư',
  'thứ Năm',
  'thứ Sáu',
  'thứ Bảy',
];
const weekday = (day: string) =>
  WEEKDAYS[new Date(day + 'T00:00:00Z').getUTCDay()];
const dm = (day: string) => `${day.slice(8, 10)}/${day.slice(5, 7)}`;
const pct = (a: number, b: number) => (b > 0 ? ((a - b) / b) * 100 : null);
const rateOf = (d: MorningDay) =>
  d.created > 0 ? (d.createdClosed / d.created) * 100 : null;
const vn = (n: number) => Math.round(n).toLocaleString('vi-VN');
/** "742k" / "1,2 tr": TB đơn gọn. */
export const shortMoney = (n: number) =>
  n >= 1e6 ? millions(n) : `${vn(n / 1000)}k`;

type Tile = {
  label: string;
  value: string;
  delta: number | null;
  unit: 'đơn' | 'điểm' | 'người' | '%';
};
const withDeltaLabels = (tiles: Tile[]) =>
  tiles.map((t) => ({ ...t, deltaLabel: tileDelta(t) }));

export function buildMorningReport(d: MorningData) {
  const y = addDays(d.today, -1);
  const byDay = new Map(d.days.map((r) => [r.day, r]));
  const at = (day: string): MorningDay =>
    byDay.get(day) ?? { day, net: 0, orders: 0, created: 0, createdClosed: 0 };
  const cur = at(y),
    prev = at(addDays(y, -1)),
    lastWeek = at(addDays(y, -7));
  const week = Array.from({ length: 7 }, (_, i) => at(addDays(y, i - 6)));
  const weekBefore = Array.from({ length: 7 }, (_, i) =>
    at(addDays(y, i - 13)),
  );
  const avg = (r: MorningDay) => (r.orders ? r.net / r.orders : null);
  const avgNow = avg(cur),
    avgPrev = avg(prev);
  const rateNow = rateOf(cur),
    ratePrev = rateOf(prev);
  const daysInMonth = new Date(
    Date.UTC(Number(y.slice(0, 4)), Number(y.slice(5, 7)), 0),
  ).getUTCDate();
  const elapsed = Number(y.slice(8, 10));
  const pace = d.goal
    ? kpiPace({
        goal: d.goal,
        workingDays: d.workingDays,
        daysInMonth,
        daysElapsed: elapsed,
        monthNet: d.monthNet,
        todayNet: cur.net,
      })
    : null;
  const planDays =
    d.workingDays && d.workingDays > 0 ? d.workingDays : daysInMonth;
  const left = Math.max(0, planDays - elapsed);
  const kpi =
    d.goal && pace
      ? {
          goal: d.goal,
          done: d.monthNet,
          percent: (d.monthNet / d.goal) * 100,
          /** Vạch "đáng lẽ tới hôm nay" trên thanh tiến độ, 0–1. */
          paceMark: Math.min(1, pace.paceTarget / d.goal),
          paceDiff: pace.paceDiff,
          needPerDay: left > 0 ? Math.max(0, d.goal - d.monthNet) / left : null,
          month: Number(y.slice(5, 7)),
        }
      : null;
  const sorted = [...d.people].sort((a, b) => b.net - a.net);
  const withOrders = sorted.filter((p) => p.orders > 0);
  return {
    team: d.team,
    dept: d.dept,
    title: `Báo cáo sáng ${weekday(d.today)} ${dm(d.today)} · số của ngày ${dm(y)}`,
    yesterday: cur.net,
    vsPrev: pct(cur.net, prev.net),
    vsLastWeek: pct(cur.net, lastWeek.net),
    lastWeekLabel: `${weekday(addDays(y, -7))} tuần trước`,
    week: week.map((r) => ({ day: r.day, net: r.net })),
    weekBefore: weekBefore.map((r) => r.net),
    tiles: withDeltaLabels([
      {
        label: 'Đơn chốt',
        value: vn(cur.orders),
        delta: prev.orders || cur.orders ? cur.orders - prev.orders : null,
        unit: 'đơn' as const,
      },
      d.dept === 'sale'
        ? {
            label: 'Tỉ lệ chốt',
            value: rateNow === null ? '–' : `${Math.round(rateNow)}%`,
            delta:
              rateNow !== null && ratePrev !== null ? rateNow - ratePrev : null,
            unit: 'điểm' as const,
          }
        : {
            label: 'Người có đơn',
            value: `${withOrders.length}/${d.people.length}`,
            delta: null,
            unit: 'người' as const,
          },
      {
        label: 'TB đơn',
        value: avgNow === null ? '–' : shortMoney(avgNow),
        delta:
          avgNow !== null && avgPrev !== null ? pct(avgNow, avgPrev) : null,
        unit: '%' as const,
      },
    ]),
    kpi,
    best: withOrders.slice(0, 3),
    coach: sorted.filter((p) => p.orders === 0).map((p) => p.name),
    overdue: d.overdue,
    dueToday: d.dueToday,
    meetings: d.meetings ?? [],
    footer: `Doanh số tính theo người có hậu tố ${d.dept === 'sale' ? 'SALE' : 'CSKH'} trong team · ngày chốt đơn`,
  };
}
export type MorningReport = ReturnType<typeof buildMorningReport>;

const arrow = (v: number | null) => (v === null ? '' : v >= 0 ? '▲' : '▼');
/** "▲ 12%" / "▼ 4%" / "= 0%" / "chưa có số so". */
export const morningDeltaLabel = (v: number | null) =>
  v === null
    ? 'chưa có số so'
    : Math.round(v) === 0
      ? '= 0%'
      : `${arrow(v)} ${Math.abs(Math.round(v))}%`;
function tileDelta(t: Tile) {
  return t.delta === null
    ? ''
    : t.unit === '%'
      ? morningDeltaLabel(t.delta)
      : Math.round(t.delta) === 0
        ? '= 0'
        : `${arrow(t.delta)} ${Math.abs(Math.round(t.delta))}${t.unit === 'điểm' ? ' điểm' : ''}`;
}
const names = (list: MorningTask[]) =>
  list
    .slice(0, 3)
    .map((t) => `${t.who}: ${t.title}`)
    .join('; ') + (list.length > 3 ? `; +${list.length - 3} việc` : '');

/** Bản chữ: gửi kèm dưới ảnh, và là bản dự phòng khi Zalo không nhận ảnh. Zalo giới hạn 2000 ký tự. */
export function morningText(r: MorningReport) {
  const lines = [
    `📊 ${r.team}`,
    r.title,
    `Doanh số hôm qua: ${millions(r.yesterday)} (${morningDeltaLabel(r.vsPrev)} so hôm trước · ${morningDeltaLabel(r.vsLastWeek)} so ${r.lastWeekLabel})`,
    r.tiles
      .map(
        (t) =>
          `${t.label} ${t.value}${t.deltaLabel ? ` (${t.deltaLabel})` : ''}`,
      )
      .join(' · '),
  ];
  if (r.kpi)
    lines.push(
      `KPI tháng ${r.kpi.month}: ${millions(r.kpi.done)} / ${millions(r.kpi.goal)} (${Math.round(r.kpi.percent)}%) · ${r.kpi.paceDiff >= 0 ? 'vượt' : 'chậm'} ${millions(Math.abs(r.kpi.paceDiff))} so tiến độ${r.kpi.needPerDay !== null ? ` · cần ${millions(r.kpi.needPerDay)}/ngày` : ''}`,
    );
  else lines.push('KPI tháng: chưa đặt cho team');
  if (r.best.length)
    lines.push(
      `Tốt nhất: ${r.best.map((p) => `${p.name} ${millions(p.net)}`).join(', ')}`,
    );
  if (r.coach.length)
    lines.push(
      `Cần kèm (0 đơn): ${r.coach.slice(0, 6).join(', ')}${r.coach.length > 6 ? ` +${r.coach.length - 6}` : ''}`,
    );
  if (r.overdue.length)
    lines.push(`⚠️ Quá hạn ${r.overdue.length}: ${names(r.overdue)}`);
  if (r.dueToday.length)
    lines.push(`Tới hạn hôm nay ${r.dueToday.length}: ${names(r.dueToday)}`);
  if (!r.overdue.length && !r.dueToday.length)
    lines.push('Việc: không có việc quá hạn hay tới hạn hôm nay');
  if (r.meetings.length) lines.push(`Họp hôm nay: ${r.meetings.join(', ')}`);
  lines.push(`(${r.footer})`);
  return lines.join('\n').slice(0, 2000);
}
