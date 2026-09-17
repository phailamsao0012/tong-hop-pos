import { env } from 'cloudflare:workers';
import { getSessionUser, unauthorized } from '@/lib/auth';

const stub = () => env.SYNC_SCHEDULER.get(env.SYNC_SCHEDULER.idFromName('main'));

// Trạng thái bộ hẹn giờ đồng bộ nền.
export async function GET() {
  if (!(await getSessionUser())) return unauthorized();
  await stub().ensure();
  return Response.json(await stub().status(), { headers: { 'Cache-Control': 'no-store' } });
}

// Chạy ngay một lượt đồng bộ tất cả POS.
export async function POST() {
  if (!(await getSessionUser())) return unauthorized();
  const run = await stub().runNow();
  return Response.json({ ok: true, run, ...(await stub().status()) });
}
