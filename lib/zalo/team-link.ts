// Gắn Zalo cho Mentor / Leader ngay ở trang Chia team (anh Vũ 03/11/2026).
// Mỗi tài khoản đăng nhập có một người nhận việc Zalo (kind 'leader'), gắn với team đầu tiên được bấm.
// Team không có Leader vẫn chạy bình thường: không bắt buộc gắn ai.
import { WEB_TEAMS_KEY, parseWebTeams, type WebTeam } from '@/lib/teams/web-teams';
import {
  createPairCode,
  saveContact,
  type Contact,
} from '@/lib/zalo/zalo-work';

export type TeamZaloState = {
  userId: string;
  linked: boolean;
  teamName: string;
};

/** Trạng thái Zalo của các tài khoản đã có người nhận việc. */
export async function teamZaloStates(db: D1Database): Promise<TeamZaloState[]> {
  const rows = (
    await db
      .prepare(
        "SELECT user_id,chat_id,team_name FROM zalo_contacts WHERE kind='leader' AND active=1 AND user_id IS NOT NULL ORDER BY created_at",
      )
      .all<Pick<Contact, 'user_id' | 'chat_id' | 'team_name'>>()
  ).results;
  const out = new Map<string, TeamZaloState>();
  for (const r of rows) {
    const was = out.get(r.user_id!);
    if (!was || (!was.linked && r.chat_id))
      out.set(r.user_id!, {
        userId: r.user_id!,
        linked: !!r.chat_id,
        teamName: r.team_name,
      });
  }
  return [...out.values()];
}

/** Tạo (hoặc dùng lại) người nhận việc của tài khoản rồi cấp mã nối 6 số. */
export async function linkTeamZalo(
  db: D1Database,
  input: {
    userId: string;
    name: string;
    teamId: string;
    teamName: string;
    dept: 'sale' | 'cskh';
  },
  now = Date.now(),
) {
  const found = await db
    .prepare(
      "SELECT * FROM zalo_contacts WHERE kind='leader' AND active=1 AND user_id=? ORDER BY chat_id IS NULL, created_at LIMIT 1",
    )
    .bind(input.userId)
    .first<Contact>();
  const contact =
    found ??
    (await saveContact(
      db,
      {
        kind: 'leader',
        name: input.name.slice(0, 60),
        user_id: input.userId,
        team_id: input.teamId,
        team_name: input.teamName,
        dept: input.dept,
        active: 1,
      },
      now,
    ));
  if (contact.chat_id)
    return { linked: true as const, teamName: contact.team_name };
  return {
    linked: false as const,
    code: await createPairCode(db, contact.id, now),
    teamName: contact.team_name,
  };
}

/** Gắn Zalo cho Mentor / Leader của một team đã lưu. Trả lỗi bằng chữ khi không hợp lệ. */
export async function linkSavedTeamZalo(
  db: D1Database,
  teamId: unknown,
  userId: unknown,
  now = Date.now(),
) {
  const saved = await db
    .prepare('SELECT value FROM app_settings WHERE key=?')
    .bind(WEB_TEAMS_KEY)
    .first<{ value: string }>();
  const team = parseWebTeams(saved?.value).find((t) => t.id === teamId);
  if (!team) return { error: 'Lưu cách chia team trước rồi mới gắn Zalo.' };
  if (
    typeof userId !== 'string' ||
    (userId !== team.mentorUserId && userId !== team.leaderUserId)
  )
    return {
      error: 'Người này chưa được lưu làm Mentor hoặc Leader của team.',
    };
  const account = await db
    .prepare(
      "SELECT id,COALESCE(NULLIF(name,''),email) AS name FROM users WHERE id=? AND disabled=0",
    )
    .bind(userId)
    .first<{ id: string; name: string }>();
  if (!account) return { error: 'Tài khoản không còn dùng được.' };
  return {
    team,
    result: await linkTeamZalo(
      db,
      {
        userId: account.id,
        name: account.name,
        teamId: team.id,
        teamName: team.name,
        dept: team.dept,
      },
      now,
    ),
  };
}

/**
 * Báo cáo Zalo gửi theo team (anh Vũ 03/11/2026: "leader mentor đều được nhận"): người nhận gắn với tài khoản web
 * nhận báo cáo của MỌI team mình là Mentor hoặc Leader ở trang Chia team; người nhận cũ (không gắn tài khoản,
 * hoặc chưa phụ trách team nào) nhận theo team của mình như trước. Mỗi phần tử là người nhận, mang team cần báo.
 */
export function reportTargets(contacts: Contact[], teams: WebTeam[]): Contact[] {
  return contacts.flatMap((c) => {
    const mine = c.user_id ? teams.filter((t) => t.mentorUserId === c.user_id || t.leaderUserId === c.user_id) : [];
    if (!mine.length) return c.team_id ? [c] : [];
    return mine.map((t) => ({ ...c, team_id: t.id, team_name: t.name, dept: t.dept }));
  });
}

export async function loadReportTargets(db: D1Database, contacts: Contact[]) {
  const saved = await db.prepare('SELECT value FROM app_settings WHERE key=?').bind(WEB_TEAMS_KEY).first<{ value: string }>();
  return reportTargets(contacts, parseWebTeams(saved?.value));
}
