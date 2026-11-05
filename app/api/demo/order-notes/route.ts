import { getSessionUser, unauthorized } from '@/lib/auth/auth';
import { isDemo } from '@/lib/demo/mode';
import { POS } from '@/lib/shared/report-model';
import { addNote, ensureSchema, findOrder, listNotes } from '@/lib/demo/order-notes';

// Ghi chép lên đơn, bản thử chỉ có ở demo (lib/demo/order-notes.ts). Web thật trả 404.

export async function GET(request: Request) {
  if (!isDemo()) return Response.json({ error: 'Không có.' }, { status: 404 });
  const user = await getSessionUser(); if (!user) return unauthorized();
  await ensureSchema();
  const orderId = new URL(request.url).searchParams.get('orderId') ?? '';
  if (!orderId) return Response.json({ error: 'Thiếu đơn.' }, { status: 400 });
  return Response.json({ orderId, notes: await listNotes(orderId) }, { headers: { 'Cache-Control': 'no-store' } });
}

/** Thêm ghi chú lên một đơn. Không gửi orderId thì lấy ngẫu nhiên một đơn 30 ngày gần đây (cho bài test tải). */
export async function POST(request: Request) {
  if (!isDemo()) return Response.json({ error: 'Không có.' }, { status: 404 });
  const user = await getSessionUser(); if (!user) return unauthorized();
  let body: { orderId?: unknown; note?: unknown };
  try { body = await request.json(); } catch { return Response.json({ error: 'JSON không hợp lệ.' }, { status: 400 }); }
  const note = typeof body.note === 'string' ? body.note.trim().slice(0, 1000) : '';
  if (!note) return Response.json({ error: 'Nhập ghi chú.' }, { status: 400 });
  await ensureSchema();
  const posId = POS[Math.floor(Math.random() * POS.length)].id;
  const order = await findOrder(body, posId);
  if (!order) return Response.json({ error: 'Không có đơn.' }, { status: 404 });
  await addNote(order, user, note);
  return Response.json({ orderId: order.id, notes: await listNotes(order.id) }, { headers: { 'Cache-Control': 'no-store' } });
}
