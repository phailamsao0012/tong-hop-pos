import { env } from 'cloudflare:workers';
import { auditHeaders } from '@/lib/audit';
import { forbidden, getSessionUser, unauthorized } from '@/lib/auth';
import { isOwner } from '@/lib/access';
import { compareTeams, type HrTeam } from '@/lib/hr-copy';
import { hrSyncState, pullHr } from '@/lib/hr-sync';
import { pancakeTeamCase } from '@/lib/team';
import { TEAM_SOURCE_KEY, refreshTeamSource } from '@/lib/team-source';
import { todayVn } from '@/lib/report-time';

// Liên kết web nhân sự (chủ hệ thống): trạng thái kéo dữ liệu, đối chiếu team Pancake với team theo web nhân sự,
// và công tắc lấy team cho báo cáo từ web nhân sự. Chỉ nên bật khi đối chiếu khớp (không ai đổi team).
async function owner() {
  const user = await getSessionUser();
  if (!user) return { error: unauthorized() };
  if (!isOwner(user)) return { error: forbidden() };
  return { user };
}

async function source() {
  const row = await env.DB.prepare('SELECT value FROM app_settings WHERE key=?').bind(TEAM_SOURCE_KEY).first<{ value: string }>();
  return row?.value === 'hr' ? 'hr' as const : 'pancake' as const;
}

async function overview() {
  const month = todayVn().slice(0, 7);
  const [state, src, sellers, hr] = await Promise.all([
    hrSyncState(), source(),
    env.DB.prepare(`SELECT user_id AS id, MAX(name) AS name, MAX(${pancakeTeamCase}) AS pancake,
        COALESCE((SELECT SUM(closed_net) FROM stats_daily s WHERE s.seller_id=pos_users.user_id AND s.day>=?), 0) AS revenue
      FROM pos_users WHERE name<>'' GROUP BY user_id`).bind(`${month}-01`).all<{ id: string; name: string; pancake: 'sale' | 'cskh' | null; revenue: number }>(),
    env.DB.prepare('SELECT pos_user_id, team, employee_name, department, leader_name, head_name FROM hr_pos_team').all<{ pos_user_id: string; team: HrTeam; employee_name: string; department: string | null; leader_name: string | null; head_name: string | null }>()
      .catch(() => ({ results: [] as { pos_user_id: string; team: HrTeam; employee_name: string; department: string | null; leader_name: string | null; head_name: string | null }[] })),
  ]);
  const hrMap = new Map(hr.results.map((r) => [r.pos_user_id, r.team]));
  const cmp = compareTeams(sellers.results.map((s) => ({ ...s, revenue: Number(s.revenue) })), hrMap);
  const active = sellers.results.filter((s) => Number(s.revenue) > 0 || s.pancake);
  const info = new Map(hr.results.map((r) => [r.pos_user_id, r]));
  return {
    month, source: src, state: { ...state, hash: undefined }, ...cmp,
    mismatches: cmp.mismatches.slice(0, 50).map((m) => ({ ...m, department: info.get(m.id)?.department ?? null })),
    linked: active.filter((s) => hrMap.has(s.id)).length, unlinked: active.filter((s) => !hrMap.has(s.id)).map((s) => ({ id: s.id, name: s.name, pancake: s.pancake, revenue: Number(s.revenue) }))
      .sort((a, b) => b.revenue - a.revenue).slice(0, 30),
    unlinkedCount: active.filter((s) => !hrMap.has(s.id)).length,
  };
}

export async function GET() {
  const { error } = await owner();
  if (error) return error;
  return Response.json(await overview(), { headers: { 'Cache-Control': 'no-store' } });
}

/** Kéo lại ngay. */
export async function POST() {
  const { error } = await owner();
  if (error) return error;
  const state = await pullHr(true);
  if (state.error) return Response.json({ error: state.error }, { status: 502 });
  return Response.json(await overview(), { headers: auditHeaders('Kéo dữ liệu web nhân sự') });
}

/** Đổi nguồn team: { source: 'hr' | 'pancake' }. */
export async function PUT(request: Request) {
  const { error } = await owner();
  if (error) return error;
  let body: { source?: unknown };
  try { body = await request.json(); } catch { return Response.json({ error: 'JSON không hợp lệ.' }, { status: 400 }); }
  const next = body.source === 'hr' ? 'hr' : body.source === 'pancake' ? 'pancake' : null;
  if (!next) return Response.json({ error: 'Nguồn team không hợp lệ.' }, { status: 400 });
  if (next === 'hr') {
    const state = await hrSyncState();
    if (!state.pulledAt) return Response.json({ error: 'Chưa kéo được dữ liệu từ web nhân sự.' }, { status: 409 });
  }
  await env.DB.prepare('INSERT INTO app_settings (key,value,updated_at) VALUES (?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at')
    .bind(TEAM_SOURCE_KEY, next, new Date().toISOString()).run();
  await refreshTeamSource(true);
  return Response.json(await overview(), { headers: auditHeaders(next === 'hr' ? 'Báo cáo lấy team từ web nhân sự' : 'Báo cáo lấy team từ Pancake') });
}
