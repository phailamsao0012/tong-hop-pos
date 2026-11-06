import { env } from 'cloudflare:workers';
import { authorizeDevice } from '@/lib/auth/device-pair';
import { validInsight, saveInsight } from '@/lib/ai/ai-insight';
import type { Insight } from '@/lib/ai/ai-insight';
import { readAiSetting, type AiPack } from '@/lib/ai/ai-pack';
import { demoInsight, demoAiPack, demoStaffNames } from '@/lib/demo/ai-pack';
import { isDemo } from '@/lib/demo/mode';
import { insightForDisplay } from '@/lib/ai/ai-insight';
import { todayVn } from '@/lib/shared/report-time';
import { getSessionUser, forbidden, unauthorized } from '@/lib/auth/auth';
export async function POST(request: Request) {
  if (!await authorizeDevice(env.DB, request)) return unauthorized();
  const raw = await request.text();
  if (new TextEncoder().encode(raw).length > 100000) return Response.json({ error: 'Kết quả quá lớn.' }, { status: 413 });
  let value: unknown;
  try { value = JSON.parse(raw); } catch { return Response.json({ error: 'JSON không hợp lệ.' }, { status: 400 }); }
  if (!validInsight(value) || value.date !== todayVn()) return Response.json({ error: 'Kết quả sai schema hoặc ngày.' }, { status: 400 });
  const row = await readAiSetting(env.DB, `ai_pack:${value.date}`);
  if (!row) return Response.json({ error: 'Chưa có gói cùng ngày.' }, { status: 409 });
  return Response.json(await saveInsight(env.DB, value, JSON.parse(row.value) as AiPack));
}
export async function GET() {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  // Phân tích toàn công ty: không trả cho tài khoản có phạm vi hẹp.
  if (user.role !== 'owner') return forbidden('Chỉ chủ hệ thống xem phân tích toàn công ty.');
  const row = await readAiSetting(env.DB, `ai_insight:${todayVn()}`);
  const insight: Insight | null = row ? JSON.parse(row.value) : isDemo() ? demoInsight(todayVn()) : null;
  let display = null;
  if (insight) {
    const stored = await readAiSetting(env.DB, `ai_pack:${insight.date}`);
    const pack: AiPack | null = stored ? JSON.parse(stored.value) : isDemo() ? demoAiPack(insight.date) : null;
    display = await insightForDisplay(env.DB, insight, pack, isDemo() ? { ...demoStaffNames } : {});
  }
  return Response.json({ insight: display }, { headers: { 'Cache-Control': 'private, no-store' } });
}
