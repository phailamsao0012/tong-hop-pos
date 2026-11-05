// Lịch gửi và nội dung báo cáo Zalo (trang Giao việc → Cài đặt báo cáo, anh Vũ 28/10/2026: "báo cáo lúc nào, báo cáo lặp lại hay k,
// báo cáo những gì"). Lưu ở app_settings zalo_report_v1, không migration. Bật / tắt vẫn ở zalo_settings_v1 (morningBrief, slotReports)
// như công tắc cũ ở Danh bạ Zalo, để một việc chỉ có một chỗ lưu. Chưa chỉnh thì mặc định giữ đúng lịch đang chạy: báo cáo sáng 08:00,
// báo cáo ca 12:00 / 17:00 / 22:00, hằng ngày, đủ mọi mục. Logic thuần (không đọc D1, không import env) để trình duyệt và test dùng chung.

export const REPORT_SCHEDULE_KEY = 'zalo_report_v1';

/** Các mục trong báo cáo leader (bản ảnh và bản chữ). Dòng doanh số đầu báo cáo luôn có. */
export const REPORT_SECTIONS = {
  chart: 'Biểu đồ doanh số 7 ngày',
  tiles: 'Đơn chốt, tỉ lệ chốt (CSKH: người có đơn), TB đơn',
  kpi: 'Tiến độ KPI tháng',
  best: 'Tốt nhất (3 người doanh số cao nhất)',
  coach: 'Cần kèm (người 0 đơn)',
  tasks: 'Việc quá hạn, tới hạn hôm nay',
  meetings: 'Họp hôm nay',
} as const;
export type ReportSection = keyof typeof REPORT_SECTIONS;
export const SECTION_KEYS = Object.keys(REPORT_SECTIONS) as ReportSection[];

/** Lặp lại: hằng ngày, các thứ đã chọn (0 = Chủ nhật … 6 = thứ Bảy), hoặc một lần vào một ngày. */
export type Repeat = { mode: 'daily' } | { mode: 'days'; days: number[] } | { mode: 'once'; date: string };
export type ReportSchedule = {
  morning: { time: string; repeat: Repeat; sections: ReportSection[] };
  /** Báo cáo ca: mỗi giờ một lần, số từ 0h tới giờ đó; báo cáo gộp cho sếp tính khung từ giờ báo cáo trước. */
  slots: { times: string[]; repeat: Repeat; sections: ReportSection[] };
};

export const DEFAULT_REPORT_SCHEDULE: ReportSchedule = {
  morning: { time: '08:00', repeat: { mode: 'daily' }, sections: [...SECTION_KEYS] },
  slots: { times: ['12:00', '17:00', '22:00'], repeat: { mode: 'daily' }, sections: [...SECTION_KEYS] },
};
export const MAX_SLOTS = 4;
/** Giờ chọn được: 05:00 → 23:45, bước 15 phút (cron chạy mỗi phút, so đúng phút). */
export const TIME_OPTIONS: string[] = Array.from({ length: (24 - 5) * 4 }, (_, i) => {
  const m = 5 * 60 + i * 15;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
});
export const WEEKDAY_SHORT = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'] as const;

const TIME_RE = /^([01]\d|2[0-3]):(00|15|30|45)$/;
const DATE_RE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

/** Khoá giờ trong bộ nhớ của lượt cron (state.hist / state.snap): giờ chẵn giữ dạng cũ "12", giờ lẻ "12:30". */
export const timeKey = (time: string) => (time.endsWith(':00') ? time.slice(0, 2) : time);
/** "8h", "12h30" — chữ hiện trong báo cáo. */
export const timeLabel = (time: string) => `${Number(time.slice(0, 2))}h${time.endsWith(':00') ? '' : time.slice(3, 5)}`;
/** Khoá cũ đánh dấu đã gửi ca (slot12, slot17, slot22): giữ để ngày lên bản không gửi trùng. */
export const legacySlotKey = (time: string) => ({ '12:00': 'slot12', '17:00': 'slot17', '22:00': 'slot22' } as const)[time as '12:00'] ?? null;

/** Ngày (YYYY-MM-DD, giờ VN) có gửi theo cách lặp đã chọn không. */
export function runsOn(repeat: Repeat, day: string) {
  if (repeat.mode === 'daily') return true;
  if (repeat.mode === 'once') return repeat.date === day;
  return repeat.days.includes(new Date(`${day}T00:00:00Z`).getUTCDay());
}

/** Giờ báo cáo liền trước giờ ca này trong ngày (báo cáo sáng hoặc ca trước); null = chưa có, tính từ 0h. */
export function previousTime(schedule: ReportSchedule, time: string): string | null {
  return [schedule.morning.time, ...schedule.slots.times].filter((t) => t < time).sort().at(-1) ?? null;
}

/** Các mục bị bỏ khỏi báo cáo. */
export const hiddenSections = (sections: ReportSection[]): ReportSection[] => SECTION_KEYS.filter((k) => !sections.includes(k));

function cleanRepeat(v: unknown): Repeat | null {
  if (!v || typeof v !== 'object') return null;
  const r = v as { mode?: unknown; days?: unknown; date?: unknown };
  if (r.mode === 'daily') return { mode: 'daily' };
  if (r.mode === 'once') return typeof r.date === 'string' && DATE_RE.test(r.date) ? { mode: 'once', date: r.date } : null;
  if (r.mode === 'days' && Array.isArray(r.days)) {
    const days = [...new Set(r.days.filter((d): d is number => Number.isInteger(d) && d >= 0 && d <= 6))].sort((a, b) => a - b);
    return days.length ? { mode: 'days', days } : null;
  }
  return null;
}
function cleanSections(v: unknown): ReportSection[] | null {
  if (!Array.isArray(v)) return null;
  return SECTION_KEYS.filter((k) => v.includes(k));
}
function cleanTimes(v: unknown): string[] | null {
  if (!Array.isArray(v) || !v.length || v.length > MAX_SLOTS || v.some((t) => typeof t !== 'string' || !TIME_RE.test(t))) return null;
  const times = [...new Set(v as string[])].sort();
  return times.length === v.length ? times : null;
}

/** Đọc từ D1: phần nào thiếu hoặc hỏng thì dùng mặc định (không bao giờ làm lỡ báo cáo đang chạy). */
export function parseReportSchedule(raw: unknown): ReportSchedule {
  let v: unknown = raw;
  if (typeof raw === 'string') { try { v = JSON.parse(raw); } catch { v = null; } }
  const o = (v && typeof v === 'object' ? v : {}) as { morning?: Record<string, unknown>; slots?: Record<string, unknown> };
  const d = DEFAULT_REPORT_SCHEDULE;
  const morningTime = typeof o.morning?.time === 'string' && TIME_RE.test(o.morning.time) ? o.morning.time : d.morning.time;
  const slotTimes = (cleanTimes(o.slots?.times) ?? d.slots.times).filter((t) => t !== morningTime);
  return {
    morning: { time: morningTime, repeat: cleanRepeat(o.morning?.repeat) ?? d.morning.repeat, sections: cleanSections(o.morning?.sections) ?? [...d.morning.sections] },
    slots: { times: slotTimes.length ? slotTimes : [...d.slots.times].filter((t) => t !== morningTime), repeat: cleanRepeat(o.slots?.repeat) ?? d.slots.repeat, sections: cleanSections(o.slots?.sections) ?? [...d.slots.sections] },
  };
}

/** Kiểm dữ liệu trang Cài đặt báo cáo gửi lên: sai thì báo lỗi bằng tiếng Việt, đúng thì trả bản đã làm sạch. */
export function validateReportSchedule(input: unknown): ReportSchedule {
  const o = (input && typeof input === 'object' ? input : null) as { morning?: Record<string, unknown>; slots?: Record<string, unknown> } | null;
  if (!o?.morning || !o.slots) throw new Error('Thiếu cài đặt báo cáo sáng hoặc báo cáo ca.');
  const time = o.morning.time;
  if (typeof time !== 'string' || !TIME_RE.test(time)) throw new Error('Giờ gửi báo cáo sáng phải là giờ:phút, bước 15 phút.');
  const times = cleanTimes(o.slots.times);
  if (!times) throw new Error(`Giờ báo cáo ca: 1 đến ${MAX_SLOTS} giờ khác nhau, bước 15 phút.`);
  if (times.includes(time)) throw new Error('Giờ báo cáo ca không được trùng giờ báo cáo sáng.');
  const morningRepeat = cleanRepeat(o.morning.repeat), slotRepeat = cleanRepeat(o.slots.repeat);
  if (!morningRepeat || !slotRepeat) throw new Error('Cách lặp lại không hợp lệ: chọn ít nhất một thứ, hoặc một ngày cụ thể.');
  const morningSections = cleanSections(o.morning.sections), slotSections = cleanSections(o.slots.sections);
  if (!morningSections || !slotSections) throw new Error('Danh sách mục trong báo cáo không hợp lệ.');
  return { morning: { time, repeat: morningRepeat, sections: morningSections }, slots: { times, repeat: slotRepeat, sections: slotSections } };
}

/** Một câu mô tả lịch cho phần tổng quan của trang: "Hằng ngày", "T2, T3, T4", "Chỉ ngày 05/11/2026". */
export function repeatLabel(repeat: Repeat) {
  if (repeat.mode === 'daily') return 'Hằng ngày';
  if (repeat.mode === 'once') return `Chỉ ngày ${repeat.date.slice(8, 10)}/${repeat.date.slice(5, 7)}/${repeat.date.slice(0, 4)}`;
  return repeat.days.length === 7 ? 'Hằng ngày' : [...repeat.days].sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7)).map((d) => WEEKDAY_SHORT[d]).join(', ');
}
