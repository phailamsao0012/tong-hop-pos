// Tách khỏi app/api/demo/order-notes/route.ts (cải tổ B5, 05/11/2026): chỉ dời chỗ, câu SQL giữ nguyên.
import { env } from 'cloudflare:workers';

// Ghi chép lên đơn, bản thử chỉ có ở demo (10/10/2026, anh Vũ hỏi web chịu được bao nhiêu người khi thêm tính năng này):
// dùng cho bài test tải để đo phần ghi vào D1 giống tính năng thật (thêm một dòng ghi chú + nhật ký hoạt động, rồi đọc lại ghi chú của đơn).
// Web thật trả 404, không tạo bảng.
let ready = false;
export async function ensureSchema() {
  if (ready) return;
  await env.DB.batch([
    env.DB.prepare('CREATE TABLE IF NOT EXISTS demo_order_notes (id TEXT PRIMARY KEY, pos_id TEXT NOT NULL, order_id TEXT NOT NULL, user_id TEXT NOT NULL, note TEXT NOT NULL, created_at TEXT NOT NULL)'),
    env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_demo_order_notes_order ON demo_order_notes (order_id, created_at)'),
  ]);
  ready = true;
}

type Note = { id: string; user_id: string; note: string; created_at: string };
export const listNotes = (orderId: string) =>
  env.DB.prepare('SELECT id,user_id,note,created_at FROM demo_order_notes WHERE order_id=? ORDER BY created_at DESC LIMIT 20').bind(orderId).all<Note>().then((r) => r.results);

type Order = { id: string; pos_id: string };
/** Đơn để ghi chú: theo mã gửi lên, không có thì lấy ngẫu nhiên một đơn 30 ngày gần đây của `posId` (cho bài test tải). */
export async function findOrder(body: { orderId?: unknown }, posId: string) {
  let order = typeof body.orderId === 'string' && body.orderId
    ? await env.DB.prepare('SELECT id,pos_id FROM raw_pos_orders WHERE id=?').bind(body.orderId).first<Order>()
    : await env.DB.prepare('SELECT id,pos_id FROM raw_pos_orders WHERE pos_id=? AND created_at>=? ORDER BY created_at DESC LIMIT 1 OFFSET ?')
      .bind(posId, new Date(Date.now() - 30 * 86400000).toISOString(), Math.floor(Math.random() * 500)).first<Order>();
  if (!order) order = await env.DB.prepare('SELECT id,pos_id FROM raw_pos_orders WHERE pos_id=? ORDER BY created_at DESC LIMIT 1').bind(posId).first<Order>();
  return order;
}

export const addNote = (order: Order, user: { userId: string }, note: string) =>
  env.DB.prepare('INSERT INTO demo_order_notes (id,pos_id,order_id,user_id,note,created_at) VALUES (?,?,?,?,?,?)')
    .bind(crypto.randomUUID(), order.pos_id, order.id, user.userId, note, new Date().toISOString()).run();
