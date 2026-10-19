import { env } from 'cloudflare:workers';
import { forbidden, getSessionUser, unauthorized } from '@/lib/auth';
import { isOwner } from '@/lib/access';
import { AskError, askClaude, askHistory } from '@/lib/ai-ask';
const reply = (value: unknown, status = 200) => Response.json(value, { status, headers: { 'Cache-Control': 'no-store' } });
export async function GET() {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  if (!isOwner(user)) return forbidden('Chỉ chủ hệ thống mới dùng được phần này.');
  return reply(await askHistory(env.DB));
}
export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  if (!isOwner(user)) return forbidden('Chỉ chủ hệ thống mới dùng được phần này.');
  let question: unknown;
  try {
    const body: unknown = await request.json();
    if (!body || typeof body !== 'object' || Array.isArray(body)) return reply({ error: 'Câu hỏi không hợp lệ' },400);
    question = (body as { question?: unknown }).question;
  } catch { return reply({ error: 'Câu hỏi không hợp lệ' },400); }
  try { return reply(await askClaude(env.DB,question,user)); }
  catch (error) { return reply({ error: error instanceof AskError ? error.message : 'Không thể trả lời bằng Claude' },error instanceof AskError ? error.status : 502); }
}
