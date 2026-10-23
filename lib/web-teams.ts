// Team Sale / CSKH chia ngay trên web tổng (anh Vũ 21/10/2026: "không dùng theo crm nữa"), lưu ở app_settings như team Marketing.
// Dùng khi nguồn team không phải web nhân sự (team_source khác 'hr'); mã team dạng wt_<uuid> để lọc ?hrTeam= như team web nhân sự.
export type WebTeam = { id: string; name: string; dept: 'sale' | 'cskh'; office: string | null; memberIds: string[] };
export const WEB_TEAMS_KEY = 'web_teams_v1';
/** Bản cũ trước mỗi lần lưu (team Sale/CSKH, team MKT, nguồn team), để lấy lại khi lưu nhầm. */
export const WEB_TEAMS_BACKUP_KEY = 'web_teams_backup_v1';
export const WEB_TEAM_ID = /^wt_[a-f0-9-]{36}$/;
const hasControl = (value: string) => { for (const char of value) if (char.charCodeAt(0) < 32) return true; return false; };

export function parseWebTeams(value: string | null | undefined): WebTeam[] {
  if (!value) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((x): x is WebTeam => !!x && typeof x === 'object' && typeof x.id === 'string' && typeof x.name === 'string' && (x.dept === 'sale' || x.dept === 'cskh') && Array.isArray(x.memberIds));
  } catch { return []; }
}

export function validateWebTeams(input: unknown): { teams?: WebTeam[]; error?: string } {
  if (!Array.isArray(input) || input.length > 60) return { error: 'Tối đa 60 team Sale, CSKH.' };
  const teams: WebTeam[] = [], ids = new Set<string>(), names = new Set<string>();
  for (const item of input) {
    if (!item || typeof item !== 'object') return { error: 'Team không hợp lệ.' };
    const row = item as Record<string, unknown>;
    const id = typeof row.id === 'string' ? row.id.trim() : '', name = typeof row.name === 'string' ? row.name.trim() : '';
    const dept = row.dept === 'sale' || row.dept === 'cskh' ? row.dept : null;
    const office = typeof row.office === 'string' && row.office.trim() ? row.office.trim().slice(0, 40) : null;
    if (!WEB_TEAM_ID.test(id) || ids.has(id)) return { error: 'Mã team không hợp lệ.' };
    if (!name || name.length > 80 || hasControl(name)) return { error: 'Tên team không hợp lệ.' };
    if (!dept) return { error: `Team ${name}: chưa chọn bộ phận Sale hay CSKH.` };
    const nameKey = `${dept}:${name.toLocaleLowerCase('vi')}`;
    if (names.has(nameKey)) return { error: `Hai team cùng tên "${name}".` };
    if (!Array.isArray(row.memberIds) || row.memberIds.length > 300) return { error: 'Danh sách người không hợp lệ.' };
    const memberIds = [...new Set(row.memberIds.map((x) => typeof x === 'string' ? x.trim() : ''))];
    if (memberIds.some((x) => !x || x.length > 100 || hasControl(x))) return { error: 'Danh sách người không hợp lệ.' };
    ids.add(id); names.add(nameKey); teams.push({ id, name, dept, office, memberIds });
  }
  return { teams };
}

/**
 * Ghép team chia trên web tổng vào team web nhân sự (anh Vũ 23/10/2026: 4 team CSKH Hà Nội là team con của CSKH Hà Nội, team Sale, C Mơ vẫn giữ):
 * người đã ở team web tổng thì rút khỏi team web nhân sự (kể cả "Chưa vào team"); team web nhân sự không còn ai thì bỏ. "Chưa vào team" luôn ở cuối.
 * parent: team web tổng → tên team web nhân sự chứa nhiều thành viên của nó nhất (thành thư mục mẹ ở ô Team); team mẹ còn người cũng vào thư mục đó.
 */
export function overlayWebTeams<G extends { id: string; name: string; members: { posUserId: string }[] }>(hr: G[], web: G[]): { teams: G[]; parent: Map<string, string> } {
  const placed = new Set(web.flatMap((g) => g.members.map((m) => m.posUserId)));
  const parent = new Map<string, string>(), mother = new Set<string>();
  for (const w of web) {
    const ids = new Set(w.members.map((m) => m.posUserId));
    let best: G | null = null, most = 0;
    for (const g of hr) { if (g.id === 'none') continue; const n = g.members.filter((m) => ids.has(m.posUserId)).length; if (n > most) { best = g; most = n; } }
    if (best) { parent.set(w.id, best.name); mother.add(best.id); }
  }
  const rest = hr.map((g) => ({ ...g, members: g.members.filter((m) => !placed.has(m.posUserId)) })).filter((g) => g.members.length);
  for (const g of rest) if (mother.has(g.id)) parent.set(g.id, g.name);
  return { teams: [...rest.filter((g) => g.id !== 'none'), ...web, ...rest.filter((g) => g.id === 'none')], parent };
}
