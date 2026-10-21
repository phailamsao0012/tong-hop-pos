// Gom team ở ô Team thành nhóm mẹ-con (anh Vũ 21/10/2026: "muốn xem full team C Mơ").
// Mentor bên web nhân sự chỉ gắn ở một số team, nên ngoài mentor còn gom theo đuôi tên team ("... C Mơ", "... A Nghĩa"):
// team có mentor mà tên cũng có đuôi đó thì mentor ấy nối luôn các team cùng đuôi, kể cả team chưa gắn mentor.
export type PickerTeam = { id: string; name: string; office: string | null; mentor: string | null };
export type PickerGroup<T extends PickerTeam> = { key: string; label: string | null; mentor: string | null; teams: T[] };

const SUFFIX = /(?:^|\s)(C|A|Chị|Anh)\.?\s+([^\s·]+)$/iu;
/** "Sale TN C Mơ" → "C Mơ"; không có đuôi người phụ trách thì null. */
export function leadSuffix(name: string): string | null {
  const m = name.trim().match(SUFFIX);
  if (!m) return null;
  const who = /^(c|chị)$/iu.test(m[1]) ? 'C' : 'A';
  return `${who} ${m[2]}`;
}

export function pickerGroups<T extends PickerTeam>(list: T[]): PickerGroup<T>[] {
  const suffixOfMentor = new Map<string, string>();
  for (const t of list) { const s = leadSuffix(t.name); if (s && t.mentor && !suffixOfMentor.has(t.mentor)) suffixOfMentor.set(t.mentor, s); }
  const groups = new Map<string, PickerGroup<T>>();
  for (const t of list) {
    const s = leadSuffix(t.name) ?? (t.mentor ? suffixOfMentor.get(t.mentor) : undefined);
    const key = s ? `s:${s.toLocaleLowerCase('vi')}` : t.mentor ? `m:${t.mentor}` : `t:${t.id}`;
    const g = groups.get(key) ?? { key, label: s ? `Team ${s}` : t.mentor ? `Team ${t.mentor}` : null, mentor: null, teams: [] };
    g.mentor ??= t.mentor;
    g.teams.push(t);
    groups.set(key, g);
  }
  const sortName = (g: PickerGroup<T>) => g.label ?? g.teams[0].name;
  return [...groups.values()]
    .map((g) => ({ ...g, teams: g.teams.sort((a, b) => (a.office ?? '').localeCompare(b.office ?? '', 'vi') || a.name.localeCompare(b.name, 'vi')) }))
    .sort((a, b) => sortName(a).localeCompare(sortName(b), 'vi'));
}
