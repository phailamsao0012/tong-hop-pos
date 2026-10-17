import { env } from 'cloudflare:workers';
import { getSessionUser, forbidden, unauthorized } from '@/lib/auth';
import { listPairs, requestPair, changePair } from '@/lib/device-pair';
async function owner() { const user = await getSessionUser(); return !user ? unauthorized() : user.role !== 'owner' ? forbidden('Chỉ chủ hệ thống duyệt máy.') : null; }
export async function GET() {
  const blocked = await owner(); if (blocked) return blocked;
  const pairs = await listPairs(env.DB);
  return Response.json({ now: Date.now(), pairs: pairs.map(({ id, device, code, expires, status }) => ({ id, device, code, expires, status })) }, { headers: { 'Cache-Control': 'no-store' } });
}
export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try { body = await request.json() as Record<string, unknown>; } catch { return Response.json({ error: 'JSON không hợp lệ' }, { status: 400 }); }
  if (!body || body.device !== 'PC' || typeof body.tokenHash !== 'string') return Response.json({ error: 'Yêu cầu không hợp lệ' }, { status: 400 });
  try { return Response.json(await requestPair(env.DB, body.tokenHash, request.headers.get('CF-Connecting-IP') ?? 'local')); }
  catch (error) { const message = error instanceof Error ? error.message : 'Không tạo được yêu cầu'; return Response.json({ error: message }, { status: /giới hạn|3 yêu cầu/.test(message) ? 429 : 400 }); }
}
export async function PATCH(request: Request) {
  const blocked = await owner(); if (blocked) return blocked;
  let body: Record<string, unknown>;
  try { body = await request.json() as Record<string, unknown>; } catch { return Response.json({ error: 'JSON không hợp lệ' }, { status: 400 }); }
  if (!body || typeof body.id !== 'string' || !['approve','revoke'].includes(String(body.action))) return Response.json({ error: 'Thao tác không hợp lệ' }, { status: 400 });
  const ok = await changePair(env.DB, body.id, body.action as 'approve' | 'revoke');
  return Response.json({ ok }, { status: ok ? 200 : 409 });
}
