import { getSessionUser, unauthorized } from '@/lib/auth/auth';
import { customerNotesFull } from '@/lib/reports/care-notes';

// Toàn bộ ghi chú trao đổi của một khách (mới nhất trước), như khung xổ xuống ở cột Ghi chú trao đổi của Pancake.
export async function GET(request: Request) {
  if (!(await getSessionUser())) return unauthorized();
  const p = new URL(request.url).searchParams;
  const posId = (p.get('posId') ?? '').slice(0, 50), customerId = (p.get('customerId') ?? '').slice(0, 100);
  if (!posId || !customerId) return Response.json({ error: 'Thiếu khách hàng.' }, { status: 400 });
  return Response.json(await customerNotesFull(posId, customerId), { headers: { 'Cache-Control': 'private, no-store' } });
}
