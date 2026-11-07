import { handoffAlive, validPcCode } from '@/lib/auth/pc-link';
import { isReadOnly } from '@/lib/ops/read-only';
import { redeemHandoff, sha256 } from '@/lib/teams/hr-api';

// Web chính: bản PC đổi mã một lần lấy mã tài khoản. Mã dùng xong là xoá, hết hạn sau 2 phút.
export async function POST(request: Request) {
  if (isReadOnly()) return new Response('Không có ở bản PC.', { status: 404 });
  const body = await request.json().catch(() => null) as { code?: unknown } | null;
  if (!validPcCode(body?.code)) return Response.json({ error: 'Mã không hợp lệ.' }, { status: 400 });
  const userId = handoffAlive(await redeemHandoff(await sha256(body.code)), Date.now());
  if (!userId) return Response.json({ error: 'Mã đã hết hạn hoặc đã dùng.' }, { status: 410 });
  return Response.json({ userId }, { headers: { 'Cache-Control': 'no-store' } });
}
