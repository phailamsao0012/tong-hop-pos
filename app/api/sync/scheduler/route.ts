import { env } from 'cloudflare:workers';
import { forbidden, getSessionUser, unauthorized } from '@/lib/auth';
import { isOwner } from '@/lib/access';

const stub = () => env.SYNC_SCHEDULER.get(env.SYNC_SCHEDULER.idFromName('main'));

// Trạng thái bộ hẹn giờ đồng bộ nền.
export async function GET() {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  if (!isOwner(user)) return forbidden(); // chặn cả ở đây, không chỉ dựa vào worker (Đợt 0, K1)
  await stub().ensure();
  return Response.json(await stub().status(), { headers: { 'Cache-Control': 'no-store' } });
}

// Chạy ngay một lượt đồng bộ tất cả POS.
export async function POST() {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  if (!isOwner(user)) return forbidden(); // chặn cả ở đây, không chỉ dựa vào worker (Đợt 0, K1)
  const run = await stub().runNow();
  return Response.json({ ok: true, run, ...(await stub().status()) });
}
