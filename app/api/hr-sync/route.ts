import { auditHeaders } from '@/lib/ops/audit';
import { forbidden, getSessionUser, unauthorized } from '@/lib/auth/auth';
import { isOwner } from '@/lib/auth/access';
import { hrSyncState, pullHr } from '@/lib/teams/hr-sync';
import { refreshTeamSource } from '@/lib/teams/team-source';
import { overview, saveTeamSource } from '@/lib/teams/hr-sync-admin';

// Liên kết web nhân sự (chủ hệ thống): trạng thái kéo dữ liệu, đối chiếu team Pancake với team theo web nhân sự,
// và công tắc lấy team cho báo cáo từ web nhân sự. Chỉ nên bật khi đối chiếu khớp (không ai đổi team).
async function owner() {
  const user = await getSessionUser();
  if (!user) return { error: unauthorized() };
  if (!isOwner(user)) return { error: forbidden() };
  return { user };
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
  await saveTeamSource(next);
  await refreshTeamSource(true);
  return Response.json(await overview(), { headers: auditHeaders(next === 'hr' ? 'Báo cáo lấy team từ web nhân sự' : 'Báo cáo lấy team từ Pancake') });
}
