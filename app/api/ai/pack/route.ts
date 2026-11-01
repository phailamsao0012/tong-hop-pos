import { env } from 'cloudflare:workers';
import { authorizeDevice } from '@/lib/auth/device-pair';
import { buildAiPack } from '@/lib/ai/ai-pack';
import { todayVn } from '@/lib/shared/report-time';
export async function GET(request: Request) {
  if (!await authorizeDevice(env.DB, request)) return Response.json({ error: 'Khóa không hợp lệ.' }, { status: 401 });
  const date = new URL(request.url).searchParams.get('date') ?? todayVn();
  if (date !== todayVn()) return Response.json({ error: 'Chỉ lấy gói hôm nay.' }, { status: 400 });
  const key = `ai_pack:${date}`;
  const cached = await env.DB.prepare('SELECT value FROM app_settings WHERE key=?').bind(key).first<{ value: string }>();
  const pack = cached ? JSON.parse(cached.value) : await buildAiPack(env.DB, date);
  if (!cached) await env.DB.batch([
    env.DB.prepare("INSERT OR IGNORE INTO app_settings(key,value,updated_at) VALUES (?,?,datetime('now'))").bind(key, JSON.stringify(pack)),
    env.DB.prepare("DELETE FROM app_settings WHERE key GLOB 'ai_pack:*' AND substr(key,9)<date(?, '-29 days')").bind(date),
  ]);
  const saved = await env.DB.prepare('SELECT value FROM app_settings WHERE key=?').bind(key).first<{ value: string }>();
  return Response.json(saved ? JSON.parse(saved.value) : pack, { headers: { 'Cache-Control': 'no-store' } });
}
