import { env } from 'cloudflare:workers';
import { getSessionUser, unauthorized, forbidden } from '@/lib/auth';
import { parseStuckConfig, readStuckConfig, saveStuckConfig, runStuckAlert } from '@/lib/stuck-alert';
const headers = { 'Cache-Control': 'no-store' };
async function guard() {
  const user = await getSessionUser();
  return !user ? unauthorized() : user.role !== 'owner' ? forbidden() : null;
}
export async function GET() {
  const denied = await guard(); if (denied) return denied;
  return Response.json(await readStuckConfig(env.DB), { headers });
}
export async function PUT(request: Request) {
  const denied = await guard(); if (denied) return denied;
  if (env.DEMO_MODE === '1') return forbidden('Demo chỉ cho xem trước, không lưu cấu hình.');
  let config;
  try { config = parseStuckConfig(await request.json()); }
  catch { return Response.json({ error: 'Cấu hình không hợp lệ.' }, { status: 400, headers }); }
  await saveStuckConfig(env.DB, config);
  return Response.json({ ok: true }, { headers });
}
export async function POST(request: Request) {
  const denied = await guard(); if (denied) return denied;
  if (new URL(request.url).searchParams.get('dry') !== '1') return Response.json({ error: 'Chỉ hỗ trợ xem trước dry=1.' }, { status: 400, headers });
  let config;
  try { const body = await request.text(); config = body ? parseStuckConfig(JSON.parse(body)) : undefined; }
  catch { return Response.json({ error: 'Cấu hình không hợp lệ.' }, { status: 400, headers }); }
  return Response.json(await runStuckAlert(env.DB, { demo: env.DEMO_MODE === '1', dry: true, config }), { headers });
}
