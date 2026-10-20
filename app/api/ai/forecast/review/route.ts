import { env } from 'cloudflare:workers';
import { forbidden, getSessionUser, unauthorized } from '@/lib/auth';
import { isOwner } from '@/lib/access';
import { ReviewError, createReview, readReview, reviewForDisplay, validReviewDate } from '@/lib/forecast-review';
const reply = (value: unknown, status = 200) => Response.json(value, { status, headers: { 'Cache-Control': 'no-store' } });
async function handle(request: Request, direct: boolean) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  if (!isOwner(user)) return forbidden('Chỉ chủ hệ thống mới dùng được phần này.');
  let input: Record<string, unknown>;
  try {
    const body: unknown = direct ? await request.json() : Object.fromEntries(new URL(request.url).searchParams);
    if (!body || typeof body !== 'object' || Array.isArray(body)) return reply({ error: 'Ngày không hợp lệ.' }, 400);
    input = body as Record<string, unknown>;
  } catch { return reply({ error: 'Ngày không hợp lệ.' }, 400); }
  const kind = Object.hasOwn(input, 'week') ? 'week' : 'review', date = input[kind === 'week' ? 'week' : 'date'];
  if (Object.hasOwn(input, 'week') && Object.hasOwn(input, 'date') || !validReviewDate(date, kind)) return reply({ error: 'Ngày không hợp lệ.' }, 400);
  try {
    const record = direct ? await createReview(env.DB, kind, date as string, new Date(), true) : await readReview(env.DB, kind, date as string);
    return reply(await reviewForDisplay(env.DB, record));
  } catch (error) {
    if (error instanceof ReviewError) return reply({ error: error.message }, error.status);
    throw error;
  }
}
export async function GET(request: Request) { return handle(request, false); }
export async function POST(request: Request) { return handle(request, true); }
