// Đọc bảng chia team anh Vũ dán từ Google Sheet (anh Vũ 21/10/2026: "chia team theo bảng của tôi, không dùng web nhân sự nữa").
// Bảng có nhiều khối đặt cạnh nhau, mỗi khối 3 cột: nhóm lớn (Marketing: 20, CSKH: 38, Sale Hà Nội: 11…), team (A Đăng: 10, Sale c Mơ: 12…),
// người ("1. Họ Tên"). Ô gộp khi copy chỉ còn giá trị ở dòng đầu, nên nhóm và team được kéo xuống các dòng dưới.
export type SheetDept = 'sale' | 'cskh' | 'mkt';
export type SheetTeam = { key: string; group: string; name: string; dept: SheetDept | null; office: string | null; members: string[] };
export type StaffPerson = { id: string; name: string; department: string | null };

/** TSV như Google Sheet chép ra: ô có xuống dòng hoặc dấu " thì nằm trong "…". */
export function parseTsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], cell = '', quoted = false, start = true;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"' && start) { quoted = true; start = false; }
    else if (c === '\t') { row.push(cell); cell = ''; start = true; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); rows.push(row); row = []; cell = ''; start = true;
    } else { cell += c; start = false; }
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

const MEMBER = /^\s*\d{1,3}\s*[.)]\s*(.+?)\s*$/u;
const clean = (s: string) => s.replace(/\([^)]*\)/gu, ' ').replace(/\s+/gu, ' ').trim();
/** "A Đăng: 10" → "A Đăng"; "Xuân Nghĩa:\nOXY - 5" → "Xuân Nghĩa OXY"; "Đắc Đạt: 4 (ngồi vp BYD)" → "Đắc Đạt". */
export function cleanTeamName(s: string) {
  return clean(s).replace(/[\s:–-]*\d+\s*(người)?\s*$/iu, '').replace(/\s*:\s*/gu, ' ').replace(/^[\s–-]+|[\s:–-]+$/gu, '').replace(/\s+/gu, ' ').trim();
}
const OFFICES: [RegExp, string][] = [[/hà nội|(^|\s)hn(\s|$)/iu, 'Hà Nội'], [/thái nguyên|(^|\s)tn(\s|$)/iu, 'Thái Nguyên']];
export const officeOf = (...texts: string[]) => { for (const t of texts) for (const [re, name] of OFFICES) if (re.test(t)) return name; return null; };
export function deptOf(...texts: string[]): SheetDept | null {
  for (const t of texts) {
    const s = t.toLocaleLowerCase('vi');
    if (/marketing|(^|\W)mkt(\W|$)/u.test(s)) return 'mkt';
    if (/cskh|chăm sóc/u.test(s)) return 'cskh';
    if (/sale|bán hàng/u.test(s)) return 'sale';
  }
  return null;
}
/** Người trong ô: "3. Đinh Thị Lan Anh (part tối)" → "Đinh Thị Lan Anh". */
export const memberName = (cell: string) => { const m = cell.match(MEMBER); return m ? clean(m[1]) : null; };

export function parseTeamSheet(text: string): SheetTeam[] {
  const rows = parseTsv(text.replace(/\u00a0/gu, ' '));
  const width = Math.max(0, ...rows.map((r) => r.length));
  const carry: string[] = Array(width).fill('');
  const teams = new Map<string, SheetTeam>();
  for (const row of rows) {
    // Ô có chữ mà không phải "N. Tên" là tên nhóm/team mới cho cột đó (ô gộp kéo xuống tới khi gặp tên mới).
    for (let c = 0; c < width; c++) { const v = (row[c] ?? '').trim(); if (v && !MEMBER.test(v)) carry[c] = v; }
    for (let c = 0; c < width; c++) {
      const name = memberName(row[c] ?? '');
      if (!name) continue;
      const rawTeam = c >= 1 ? carry[c - 1] : '', rawGroup = c >= 2 ? carry[c - 2] : '';
      const group = cleanTeamName(rawGroup);
      let team = cleanTeamName(rawTeam);
      // Team chỉ ghi chi nhánh ("Hà Nội: 1" trong khối CSKH Part time): ghép tên nhóm cho rõ.
      if (!team || officeOf(team) && cleanTeamName(team.replace(/hà nội|thái nguyên/giu, '')) === '') team = [group, team].filter(Boolean).join(' ');
      if (!team) continue;
      const key = `${c}|${rawGroup}|${rawTeam}`;
      const t = teams.get(key) ?? { key, group, name: team, dept: deptOf(team, group), office: officeOf(team, group), members: [] };
      if (!t.members.includes(name)) t.members.push(name);
      teams.set(key, t);
    }
  }
  return [...teams.values()];
}

/** So tên trong bảng với tên Pancake: bỏ hậu tố bộ phận (SALE, CSKH, MKT, TP, Part…), chữ thường, giữ dấu. */
export function nameKey(name: string) {
  return clean(name.normalize('NFC').toLocaleLowerCase('vi')).replace(/[-_.,]/gu, ' ')
    .split(' ').filter((w) => w && !/^(sale|sales|cskh|mkt|marketing|tp|part|time|pt|\d+)$/u.test(w)).join(' ');
}
const staffDept = (p: StaffPerson) => deptOf(p.name, p.department ?? '');

/** Mã tài khoản Pancake của một người trong bảng (một người có thể có tài khoản ở nhiều POS). Trùng tên thì ưu tiên người cùng bộ phận. */
export function matchStaff(name: string, dept: SheetDept | null, people: StaffPerson[]): string[] {
  const k = nameKey(name);
  if (!k) return [];
  const same = people.filter((p) => nameKey(p.name) === k);
  const inDept = dept ? same.filter((p) => staffDept(p) === dept) : [];
  return (inDept.length ? inDept : same).map((p) => p.id);
}
