import { env } from 'cloudflare:workers';
import { forbidden, getSessionUser, unauthorized } from '@/lib/auth/auth';
import { isOwner } from '@/lib/auth/access';
import { auditHeaders } from '@/lib/ops/audit';
import { linkAccountZalo, linkSavedTeamZalo } from '@/lib/zalo/team-link';

// Nút "Gắn Zalo" cạnh Mentor / Leader ở trang Chia team (chỉ chủ hệ thống). Team phải được lưu trước.
// Không gửi teamId = nối theo tài khoản ở danh sách Tài khoản (anh Vũ 07/11/2026).
export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  if (!isOwner(user)) return forbidden();
  let body: { userId?: unknown; teamId?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'JSON không hợp lệ.' }, { status: 400 });
  }
  try {
    if (body.teamId === undefined) {
      const acc = await linkAccountZalo(env.DB, body.userId);
      if ('error' in acc) return Response.json({ error: acc.error }, { status: 400 });
      return Response.json(acc.result, { headers: { 'Cache-Control': 'no-store', ...auditHeaders(`Gắn Zalo cho tài khoản ${acc.account.name}`) } });
    }
    const out = await linkSavedTeamZalo(env.DB, body.teamId, body.userId);
    if ('error' in out)
      return Response.json({ error: out.error }, { status: 400 });
    return Response.json(out.result, {
      headers: {
        'Cache-Control': 'no-store',
        ...auditHeaders(`Gắn Zalo cho phụ trách team ${out.team.name}`),
      },
    });
  } catch (error) {
    return Response.json(
      {
        error: error instanceof Error ? error.message : 'Không gắn được Zalo.',
      },
      { status: 400 },
    );
  }
}
