// Báo cáo 8h gửi leader qua Zalo (mẫu anh Vũ chốt 02/11/2026, Artifact GNtjbu7MKFrpW34UcHtngN).
// Logic thuần: nhận số đã đọc sẵn, trả mô hình báo cáo, ảnh SVG và bản chữ. Không đọc D1 ở đây.
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
    tiles: [
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
    ],
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
const signedPct = (v: number | null) =>
  v === null
    ? 'chưa có số so'
    : Math.round(v) === 0
      ? '= 0%'
      : `${arrow(v)} ${Math.abs(Math.round(v))}%`;
const tileDelta = (t: MorningReport['tiles'][number]) =>
  t.delta === null
    ? ''
    : t.unit === '%'
      ? signedPct(t.delta)
      : Math.round(t.delta) === 0
        ? '= 0'
        : `${arrow(t.delta)} ${Math.abs(Math.round(t.delta))}${t.unit === 'điểm' ? ' điểm' : ''}`;
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
    `Doanh số hôm qua: ${millions(r.yesterday)} (${signedPct(r.vsPrev)} so hôm trước · ${signedPct(r.vsLastWeek)} so ${r.lastWeekLabel})`,
    r.tiles
      .map(
        (t) =>
          `${t.label} ${t.value}${tileDelta(t) ? ` (${tileDelta(t)})` : ''}`,
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

const esc = (s: string) =>
  s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
const clip = (s: string, n: number) =>
  s.length > n ? s.slice(0, n - 1) + '…' : s;
const C = {
  bg: '#ffffff',
  ink: '#14231c',
  muted: '#5f6f67',
  line: '#e3ebe6',
  soft: '#f3f8f5',
  green: '#17684b',
  up: '#17804f',
  down: '#c2410c',
  warn: '#b45309',
  dash: '#9aaaa2',
};
const tone = (v: number | null) =>
  v === null || Math.round(v) === 0 ? C.muted : v > 0 ? C.up : C.down;

/** Ảnh báo cáo (SVG 720 px ngang). Chữ nằm trong ảnh nên leader xem trên Zalo không cần mở web. */
export function morningSvg(r: MorningReport) {
  const W = 720,
    P = 32;
  const out: string[] = [];
  let y = 0;
  const text = (
    x: number,
    yy: number,
    s: string,
    o: {
      size?: number;
      weight?: number;
      fill?: string;
      anchor?: 'start' | 'end' | 'middle';
    } = {},
  ) =>
    out.push(
      `<text x="${x}" y="${yy}" font-size="${o.size ?? 22}" font-weight="${o.weight ?? 400}" fill="${o.fill ?? C.ink}"${o.anchor ? ` text-anchor="${o.anchor}"` : ''}>${esc(s)}</text>`,
    );
  // Đầu ảnh
  out.push(`<rect x="0" y="0" width="${W}" height="112" fill="${C.green}"/>`);
  text(P, 50, clip(r.team, 40), { size: 30, weight: 700, fill: '#ffffff' });
  text(P, 88, r.title, { size: 20, fill: '#d6efe3' });
  y = 150;
  // Số lớn
  text(P, y, 'Doanh số hôm qua', { size: 20, fill: C.muted });
  text(P, y + 58, millions(r.yesterday), { size: 56, weight: 700 });
  text(P, y + 96, `${signedPct(r.vsPrev)} so hôm trước`, {
    size: 20,
    weight: 600,
    fill: tone(r.vsPrev),
  });
  text(P, y + 124, `${signedPct(r.vsLastWeek)} so ${r.lastWeekLabel}`, {
    size: 20,
    weight: 600,
    fill: tone(r.vsLastWeek),
  });
  // Biểu đồ 7 ngày, tuần trước nét đứt (cùng một thang)
  const cx = 380,
    cw = W - P - cx,
    ch = 120,
    cy = y + 4;
  const max = Math.max(1, ...r.week.map((d) => d.net), ...r.weekBefore);
  const pt = (i: number, v: number) =>
    `${(cx + (i * cw) / 6).toFixed(1)},${(cy + ch - (v / max) * ch).toFixed(1)}`;
  out.push(
    `<line x1="${cx}" y1="${cy + ch}" x2="${cx + cw}" y2="${cy + ch}" stroke="${C.line}" stroke-width="2"/>`,
  );
  out.push(
    `<polyline points="${r.weekBefore.map((v, i) => pt(i, v)).join(' ')}" fill="none" stroke="${C.dash}" stroke-width="2" stroke-dasharray="6 6"/>`,
  );
  out.push(
    `<polyline points="${r.week.map((d, i) => pt(i, d.net)).join(' ')}" fill="none" stroke="${C.green}" stroke-width="3" stroke-linejoin="round"/>`,
  );
  const last = pt(6, r.week[6].net).split(',');
  out.push(
    `<circle cx="${last[0]}" cy="${last[1]}" r="6" fill="${C.green}" stroke="#fff" stroke-width="2"/>`,
  );
  r.week.forEach((d, i) => {
    if (i === 0 || i === 6)
      text(
        cx + (i * cw) / 6,
        cy + ch + 26,
        `${d.day.slice(8, 10)}/${d.day.slice(5, 7)}`,
        { size: 16, fill: C.muted, anchor: i ? 'end' : 'start' },
      );
  });
  text(cx + cw, cy - 12, '— 7 ngày · - - tuần trước', {
    size: 15,
    fill: C.muted,
    anchor: 'end',
  });
  y += 160;
  // Ba ô nhỏ
  const tw = (W - 2 * P - 2 * 16) / 3;
  r.tiles.forEach((t, i) => {
    const x = P + i * (tw + 16);
    out.push(
      `<rect x="${x}" y="${y}" width="${tw}" height="104" rx="14" fill="${C.soft}"/>`,
    );
    text(x + 18, y + 32, t.label, { size: 18, fill: C.muted });
    text(x + 18, y + 70, t.value, { size: 30, weight: 700 });
    const delta = tileDelta(t);
    if (delta)
      text(x + 18, y + 94, delta, {
        size: 16,
        weight: 600,
        fill: tone(t.delta),
      });
  });
  y += 136;
  // KPI tháng
  if (r.kpi) {
    const k = r.kpi,
      bw = W - 2 * P;
    text(P, y, `KPI tháng ${k.month}`, { size: 20, weight: 600 });
    text(
      W - P,
      y,
      `${millions(k.done)} / ${millions(k.goal)} · ${Math.round(k.percent)}%`,
      { size: 20, weight: 600, anchor: 'end' },
    );
    out.push(
      `<rect x="${P}" y="${y + 16}" width="${bw}" height="18" rx="9" fill="${C.line}"/>`,
    );
    out.push(
      `<rect x="${P}" y="${y + 16}" width="${(bw * Math.min(1, k.percent / 100)).toFixed(1)}" height="18" rx="9" fill="${C.green}"/>`,
    );
    const mx = P + bw * k.paceMark;
    out.push(
      `<rect x="${(mx - 2).toFixed(1)}" y="${y + 8}" width="4" height="34" rx="2" fill="${C.ink}"/>`,
    );
    text(
      P,
      y + 68,
      `${k.paceDiff >= 0 ? 'Vượt' : 'Chậm'} ${millions(Math.abs(k.paceDiff))} so tiến độ tới hôm qua (vạch đen)`,
      { size: 18, fill: k.paceDiff >= 0 ? C.up : C.down },
    );
    if (k.needPerDay !== null)
      text(W - P, y + 68, `Cần ${millions(k.needPerDay)}/ngày`, {
        size: 18,
        weight: 600,
        anchor: 'end',
      });
    y += 104;
  } else {
    text(P, y, 'KPI tháng: chưa đặt cho team', { size: 20, fill: C.muted });
    y += 40;
  }
  // Người
  out.push(
    `<line x1="${P}" y1="${y}" x2="${W - P}" y2="${y}" stroke="${C.line}" stroke-width="2"/>`,
  );
  y += 40;
  const row = (label: string, body: string, color = C.ink) => {
    text(P, y, label, { size: 18, fill: C.muted });
    text(P + 150, y, clip(body, 46), { size: 20, weight: 600, fill: color });
    y += 40;
  };
  if (r.best.length) {
    r.best.forEach((p, i) => {
      if (!i) text(P, y, 'Tốt nhất', { size: 18, fill: C.muted });
      text(P + 150, y, `${i + 1}. ${clip(p.name, 28)}`, {
        size: 20,
        weight: 600,
      });
      text(W - P, y, `${millions(p.net)} · ${p.orders} đơn`, {
        size: 20,
        weight: 600,
        fill: C.green,
        anchor: 'end',
      });
      y += 36;
    });
    y += 4;
  } else row('Tốt nhất', 'Chưa ai có đơn');
  row(
    'Cần kèm',
    r.coach.length
      ? `${r.coach.length} người 0 đơn: ${r.coach.join(', ')}`
      : 'Ai cũng có đơn',
    r.coach.length ? C.down : C.up,
  );
  row(
    'Việc',
    r.overdue.length || r.dueToday.length
      ? `${r.overdue.length} quá hạn · ${r.dueToday.length} tới hạn hôm nay`
      : 'Không có việc quá hạn',
    r.overdue.length ? C.warn : C.ink,
  );
  y += 4;
  text(P, y, r.footer, { size: 15, fill: C.muted });
  const H = y + 28;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="'Be Vietnam Pro','Segoe UI',Roboto,Arial,sans-serif"><rect width="${W}" height="${H}" fill="${C.bg}"/>${out.join('')}</svg>`;
}
