import { env } from 'cloudflare:workers';
import { getSessionUser, unauthorized } from '@/lib/auth';
import { isDemo } from '@/lib/demo/mode';
import { POS } from '@/lib/report-model';

// Ghi chép lên đơn, bản thử chỉ có ở demo (10/10/2026, anh Vũ hỏi web chịu được bao nhiêu người khi thêm tính năng này):
// dùng cho bài test tải để đo phần ghi vào D1 giống tính năng thật (thêm một dòng ghi chú + nhật ký hoạt động, rồi đọc lại ghi chú của đơn).
// Web thật trả 404, không tạo bảng.
let ready = false;
async function ensureSchema() {
  if (ready) return;
  await env.DB.batch([
    env.DB.prepare('CREATE TABLE IF NOT EXISTS demo_order_notes (id TEXT PRIMARY KEY, pos_id TEXT NOT NULL, order_id TEXT NOT NULL, user_id TEXT NOT NULL, note TEXT NOT NULL, created_at TEXT NOT NULL)'),
    env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_demo_order_notes_order ON demo_order_notes (order_id, created_at)'),
  ]);
  ready = true;
}

type Note = { id: string; user_id: string; note: string; created_at: string };
const listNotes = (orderId: string) =>
  env.DB.prepare('SELECT id,user_id,note,created_at FROM demo_order_notes WHERE order_id=? ORDER BY created_at DESC LIMIT 20').bind(orderId).all<Note>().then((r) => r.results);

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
  type Order = { id: string; pos_id: string };
  const posId = POS[Math.floor(Math.random() * POS.length)].id;
  let order = typeof body.orderId === 'string' && body.orderId
    ? await env.DB.prepare('SELECT id,pos_id FROM raw_pos_orders WHERE id=?').bind(body.orderId).first<Order>()
    : await env.DB.prepare('SELECT id,pos_id FROM raw_pos_orders WHERE pos_id=? AND created_at>=? ORDER BY created_at DESC LIMIT 1 OFFSET ?')
      .bind(posId, new Date(Date.now() - 30 * 86400000).toISOString(), Math.floor(Math.random() * 500)).first<Order>();
  if (!order) order = await env.DB.prepare('SELECT id,pos_id FROM raw_pos_orders WHERE pos_id=? ORDER BY created_at DESC LIMIT 1').bind(posId).first<Order>();
  if (!order) return Response.json({ error: 'Không có đơn.' }, { status: 404 });
  await env.DB.prepare('INSERT INTO demo_order_notes (id,pos_id,order_id,user_id,note,created_at) VALUES (?,?,?,?,?,?)')
    .bind(crypto.randomUUID(), order.pos_id, order.id, user.userId, note, new Date().toISOString()).run();
  return Response.json({ orderId: order.id, notes: await listNotes(order.id) }, { headers: { 'Cache-Control': 'no-store' } });
}
