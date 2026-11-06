import { env } from 'cloudflare:workers';
import { authorizeDevice } from '@/lib/auth/device-pair';
import { buildAiPack, readAiSetting, storeAiPack } from '@/lib/ai/ai-pack';
import { todayVn } from '@/lib/shared/report-time';
export async function GET(request: Request) {
  if (!await authorizeDevice(env.DB, request)) return Response.json({ error: 'Khóa không hợp lệ.' }, { status: 401 });
  const date = new URL(request.url).searchParams.get('date') ?? todayVn();
  if (date !== todayVn()) return Response.json({ error: 'Chỉ lấy gói hôm nay.' }, { status: 400 });
  const key = `ai_pack:${date}`;
  const cached = await readAiSetting(env.DB, key);
  const pack = cached ? JSON.parse(cached.value) : await buildAiPack(env.DB, date);
  if (!cached) await storeAiPack(env.DB, key, pack, date);
  const saved = await readAiSetting(env.DB, key);
  return Response.json(saved ? JSON.parse(saved.value) : pack, { headers: { 'Cache-Control': 'no-store' } });
}
