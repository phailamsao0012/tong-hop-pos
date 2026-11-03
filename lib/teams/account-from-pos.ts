// Thêm tài khoản từ người trên POS (anh Vũ 03/11/2026): chọn người POS thì tự điền tên, POS, hồ sơ; team họ quản lý đi theo tài khoản.
// Ô chọn người POS không bắt buộc (giám đốc không có trên POS).
import type { MarketingTeam } from '@/lib/teams/marketing-teams';
import type { WebTeam } from '@/lib/teams/web-teams';

export type OwnedTeam = {
  id: string;
  mentorUserId?: string | null;
  leaderUserId?: string | null;
  memberIds: string[];
};
export type PosPersonRow = {
  user_id: string;
  name: string;
  pos_id: string;
  department: string | null;
  employee_id: string | null;
};
export type PosPerson = {
  id: string;
  name: string;
  department: string | null;
  posIds: string[];
  employeeId: string | null;
};

/** Gộp các dòng pos_users (một người có thể ở nhiều POS) thành một người. */
export function groupPosPeople(rows: PosPersonRow[]): PosPerson[] {
  const byId = new Map<string, PosPerson>();
  for (const r of rows) {
    if (!r.user_id || !r.name) continue;
    const p = byId.get(r.user_id) ?? {
      id: r.user_id,
      name: r.name,
      department: r.department || null,
      posIds: [],
      employeeId: null,
    };
    if (r.pos_id && !p.posIds.includes(r.pos_id)) p.posIds.push(r.pos_id);
    p.employeeId ??= r.employee_id || null;
    p.department ??= r.department || null;
    byId.set(r.user_id, p);
  }
  return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name, 'vi'));
}

/** Team đang có tên người POS này: tích sẵn khi chọn người. */
export const teamsWithPerson = (teams: OwnedTeam[], posUserId: string) =>
  teams.filter((t) => t.memberIds.includes(posUserId)).map((t) => t.id);

/** Team tài khoản này đang phụ trách (Mentor hoặc Leader). */
export const teamsOwnedBy = (teams: OwnedTeam[], userId: string) =>
  teams
    .filter((t) => t.mentorUserId === userId || t.leaderUserId === userId)
    .map((t) => t.id);

export const ownerField = (role: string) =>
  role === 'mentor'
    ? ('mentorUserId' as const)
    : role === 'lead'
      ? ('leaderUserId' as const)
      : null;

/**
 * Gán tài khoản phụ trách các team đã tích: Mentor vào ô Mentor, Trưởng nhóm vào ô Leader.
 * Team không tích mà đang ghi tài khoản này thì gỡ ra. Vai trò khác chỉ gỡ. changed=false thì khỏi ghi.
 */
export function setOwnedTeams<T extends OwnedTeam>(
  teams: T[],
  userId: string,
  role: string,
  teamIds: string[],
): { teams: T[]; changed: boolean } {
  const field = ownerField(role),
    pick = new Set(teamIds);
  let changed = false;
  const next = teams.map((t) => {
    const out = { ...t };
    for (const f of ['mentorUserId', 'leaderUserId'] as const) {
      const want =
        f === field && pick.has(t.id)
          ? userId
          : out[f] === userId
            ? null
            : out[f];
      if ((want ?? null) !== (out[f] ?? null)) {
        changed = true;
        if (want) out[f] = want;
        else delete out[f];
      }
    }
    return out;
  });
  return { teams: next, changed };
}

export type TeamChoice = {
  id: string;
  name: string;
  dept: 'sale' | 'cskh' | 'mkt';
  size: number;
  mentorUserId: string | null;
  leaderUserId: string | null;
  memberIds: string[];
};
export function teamChoices(
  web: WebTeam[],
  mkt: MarketingTeam[],
): TeamChoice[] {
  return [
    ...web.map(
      (t): TeamChoice => ({
        id: t.id,
        name: t.name,
        dept: t.dept,
        size: t.memberIds.length,
        mentorUserId: t.mentorUserId ?? null,
        leaderUserId: t.leaderUserId ?? null,
        memberIds: t.memberIds,
      }),
    ),
    ...mkt.map(
      (t): TeamChoice => ({
        id: t.id,
        name: t.name,
        dept: 'mkt',
        size: t.memberIds.length,
        mentorUserId: t.mentorUserId ?? null,
        leaderUserId: t.leaderUserId ?? null,
        memberIds: t.memberIds,
      }),
    ),
  ];
}
