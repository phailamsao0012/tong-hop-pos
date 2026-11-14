// Web nhân sự giả cho app của sếp ở bản demo (13/11/2026): Tổng quan Nhân sự (/api/v1/app/overview) và số việc chờ
// (/api/v1/app/badge), tính từ người ảo trong lib/demo/world.ts. Hàm thuần, không đụng runtime Cloudflare.
import { STAFF, UNITS, uuidOf, type Staff } from '@/lib/demo/world';

const OFFICES = [{ id: 'office-hn', name: 'Hà Nội', branch: 'HN' }, { id: 'office-tn', name: 'Thái Nguyên', branch: 'TN' }] as const;
const PROBATION_DAYS = 60;
const working = (s: Staff, day: string) => s.joined <= day && (!s.left || s.left > day);
const between = (day: string | null, from: string, to: string) => !!day && day >= from && day <= to;
const addDays = (day: string, n: number) => new Date(Date.parse(`${day}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
const onProbation = (s: Staff, day: string) => working(s, day) && s.joined > addDays(day, -PROBATION_DAYS);
const pct = (left: number, start: number, end: number) => (start + end > 0 ? Math.round((left / ((start + end) / 2)) * 1000) / 10 : 0);
/** Phòng gốc của một đơn vị (team thuộc phòng nào). */
const rootOf = (unit: string) => { let u = unit; while (UNITS[u]?.parent) u = UNITS[u].parent!; return u; };
const officeName = (s: Staff) => (s.branch === 'HN' ? 'Hà Nội' : 'Thái Nguyên');

export function demoHrOverview(from: string, to: string, staff: Staff[] = STAFF) {
  const before = addDays(from, -1);
  const start = staff.filter((s) => working(s, before)).length;
  const end = staff.filter((s) => working(s, to)).length;
  const joined = staff.filter((s) => between(s.joined, from, to));
  const left = staff.filter((s) => between(s.left, from, to));
  const offices = OFFICES.map((o) => {
    const mine = staff.filter((s) => s.branch === o.branch);
    return {
      id: o.id, name: o.name, headcount: mine.filter((s) => working(s, to)).length,
      joined: mine.filter((s) => between(s.joined, from, to)).length, left: mine.filter((s) => between(s.left, from, to)).length,
      probation: mine.filter((s) => onProbation(s, to)).length,
    };
  });
  const departments = Object.entries(UNITS).filter(([, u]) => !u.parent).map(([id, u]) => {
    const mine = staff.filter((s) => rootOf(s.unit) === id);
    const a = mine.filter((s) => working(s, before)).length, b = mine.filter((s) => working(s, to)).length;
    const l = mine.filter((s) => between(s.left, from, to)).length;
    return {
      id: `dept-${id}`, name: u.name, parent_id: null, kind: u.kind, office_id: u.office === 'HN' ? 'office-hn' : 'office-tn',
      headcount: b, joined: mine.filter((s) => between(s.joined, from, to)).length, left: l, turnover: pct(l, a, b),
    };
  }).filter((d) => d.headcount > 0 || d.joined > 0 || d.left > 0);
  const series = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(Date.parse(`${to.slice(0, 7)}-01T00:00:00Z`));
    d.setUTCMonth(d.getUTCMonth() - (5 - i));
    const month = d.toISOString().slice(0, 7);
    const last = addDays(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1)).toISOString().slice(0, 10), -1);
    const mEnd = last < to ? last : to;
    return {
      month, headcount: staff.filter((s) => working(s, mEnd)).length,
      joined: staff.filter((s) => s.joined.startsWith(month)).length, left: staff.filter((s) => s.left?.startsWith(month)).length,
    };
  });
  const flow = (s: Staff, day: string | null) => ({
    employee_id: uuidOf(`emp:${s.key}`), name: s.name, day, department: UNITS[s.unit]?.name ?? null, office: officeName(s), reason: null,
  });
  return {
    from, to, total: { start, end, joined: joined.length, left: left.length, turnover: pct(left.length, start, end) },
    probation: staff.filter((s) => onProbation(s, to)).length, unplaced: 0, pending: 0,
    offices, departments, series,
    joined: joined.map((s) => flow(s, s.joined)), left: left.map((s) => flow(s, s.left)),
  };
}

/** Trả lời các đường /api/v1/app/* của web nhân sự giả; đường khác trả null. */
export function demoHrApp(path: string, today: string): unknown | null {
  const url = new URL(path, 'https://hr.demo');
  if (url.pathname === '/api/v1/app/badge') return { pending: 0 };
  if (url.pathname === '/api/v1/app/overview') {
    const iso = /^\d{4}-\d{2}-\d{2}$/;
    const to = iso.test(url.searchParams.get('to') ?? '') ? url.searchParams.get('to')! : today;
    const from = iso.test(url.searchParams.get('from') ?? '') ? url.searchParams.get('from')! : `${to.slice(0, 7)}-01`;
    return demoHrOverview(from <= to ? from : to, to);
  }
  return null;
}
