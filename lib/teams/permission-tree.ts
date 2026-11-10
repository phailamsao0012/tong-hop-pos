// Sơ đồ quyền xem (anh Vũ 03/11/2026, chọn "Bảng sơ đồ quyền"): cây Giám đốc → Leader → Mentor → Team, mỗi tài khoản ghi rõ
// xem được bộ phận nào, POS nào, những ai. Chỉ đọc lại cách web đang tính quyền (lib/auth/access.ts, teamScopeFor), không đổi quyền.
import { POS } from '@/lib/shared/report-model';
import { WEB_TEAM_ID, type WebTeam } from '@/lib/teams/web-teams';

export type Viewer = { id: string; name: string; role: string; team: string | null; posIds: string[] | null };
type Dept = 'sale' | 'cskh' | 'all';
export type TreeTeam = { id: string; name: string; dept: 'sale' | 'cskh'; office: string | null; mentor: string | null; people: string[] };
export type TreeAccount = {
  id: string; name: string; role: string;
  /** Bộ phận xem được: theo team phụ trách nếu có, không thì theo tài khoản. */
  dept: Dept; pos: string[] | 'all';
  /** null = không giới hạn người (xem cả bộ phận / cả công ty). */
  people: string[] | null;
  teams: TreeTeam[]; warnings: string[];
};
export type PermissionTree = { top: TreeAccount[]; leaders: (TreeAccount & { mentors: TreeAccount[] })[]; loneMentors: TreeAccount[]; others: TreeAccount[] };

const DEPT_LABEL: Record<Dept, string> = { sale: 'Sale', cskh: 'CSKH', all: 'Sale + CSKH' };
export const deptLabel = (d: Dept) => DEPT_LABEL[d];
export const posLabel = (pos: string[] | 'all') => pos === 'all' ? 'Mọi POS' : pos.map((id) => POS.find((p) => p.id === id)?.name ?? id).join(', ') || 'Chưa cấp POS';

export function buildPermissionTree(viewers: Viewer[], teams: WebTeam[], nameOf: Map<string, string>): PermissionTree {
  const web = teams.filter((t) => WEB_TEAM_ID.test(t.id));
  const accountName = new Map(viewers.map((v) => [v.id, v.name]));
  const treeTeam = (t: WebTeam): TreeTeam => ({
    id: t.id, name: t.name, dept: t.dept, office: t.office, mentor: t.mentorUserId ? accountName.get(t.mentorUserId) ?? null : null,
    people: [...new Set(t.memberIds.map((id) => nameOf.get(id) ?? id))].sort((a, b) => a.localeCompare(b, 'vi')),
  });
  const node = (v: Viewer): TreeAccount => {
    const mine = web.filter((t) => t.mentorUserId === v.id || t.leaderUserId === v.id);
    const own: Dept = v.team === 'sale' || v.team === 'cskh' ? v.team : 'all';
    const depts = new Set(mine.map((t) => t.dept));
    const dept: Dept = mine.length ? (depts.size === 1 ? mine[0].dept : 'all') : own;
    const warnings: string[] = [];
    if ((v.role === 'mentor' || v.role === 'lead') && !mine.length) warnings.push(`Chưa gán team nào: đang xem cả bộ phận ${deptLabel(own)}.`);
    if (mine.length && own !== 'all' && dept !== own) warnings.push(`Tài khoản đặt bộ phận ${deptLabel(own)} nhưng team phụ trách là ${deptLabel(dept)}.`);
    const pos = v.posIds ?? 'all';
    if (pos !== 'all' && !pos.length) warnings.push('Chưa cấp POS nào.');
    const people = mine.length ? [...new Set(mine.flatMap((t) => treeTeam(t).people))].sort((a, b) => a.localeCompare(b, 'vi')) : null;
    return { id: v.id, name: v.name, role: v.role, dept, pos, people, teams: mine.map(treeTeam), warnings };
  };
  const active = viewers.filter((v) => v.role !== 'owner');
  const top = active.filter((v) => v.role === 'director').map(node);
  const leaders = active.filter((v) => v.role === 'lead' || web.some((t) => t.leaderUserId === v.id) && v.role !== 'mentor').map((v) => {
    const n = node(v);
    const mentorIds = new Set(web.filter((t) => t.leaderUserId === v.id && t.mentorUserId).map((t) => t.mentorUserId!));
    return { ...n, mentors: active.filter((m) => mentorIds.has(m.id)).map(node) };
  });
  const underLeader = new Set(leaders.flatMap((l) => l.mentors.map((m) => m.id)));
  const loneMentors = active.filter((v) => v.role === 'mentor' && !underLeader.has(v.id)).map(node);
  const placed = new Set([...top, ...leaders, ...loneMentors].map((n) => n.id));
  const others = active.filter((v) => !placed.has(v.id) && !underLeader.has(v.id)).map(node);
  return { top, leaders, loneMentors, others };
}
