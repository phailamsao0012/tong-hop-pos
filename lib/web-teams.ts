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
