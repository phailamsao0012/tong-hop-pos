import { env } from 'cloudflare:workers';
import { HR_SECRET_HEADER, secretMatches } from '@/lib/hr-link';
import { pullHr } from '@/lib/hr-sync';

// Web nhân sự báo vừa có thay đổi (đã duyệt): kéo lại bản sao ngay, không chờ lượt 5 phút.
export async function POST(request: Request) {
  if (!secretMatches(env.HR_SHARED_SECRET, request.headers.get(HR_SECRET_HEADER))) return Response.json({ error: 'Sai bí mật liên kết.' }, { status: 403 });
  const state = await pullHr();
  return Response.json({ ok: !state.error, changedAt: state.changedAt, error: state.error });
}
