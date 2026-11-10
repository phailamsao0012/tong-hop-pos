// Tách khỏi app/api/reports/care/notes/route.ts (cải tổ B4/B5, 05/11/2026): chỉ dời chỗ, câu SQL giữ nguyên.
import { env } from 'cloudflare:workers';

// Toàn bộ ghi chú trao đổi của một khách (mới nhất trước), như khung xổ xuống ở cột Ghi chú trao đổi của Pancake.
export async function customerNotesFull(posId: string, customerId: string) {
  const [notes, names] = await env.DB.batch([
    env.DB.prepare('SELECT id, author_id, author_name, message, order_id, created_at, source FROM customer_notes WHERE pos_id=? AND customer_id=? ORDER BY created_at DESC LIMIT 500').bind(posId, customerId),
    env.DB.prepare("SELECT user_id, MAX(name) AS name FROM pos_users WHERE name<>'' GROUP BY user_id"),
  ]);
  const nameMap = new Map((names.results as { user_id: string; name: string }[]).map((r) => [r.user_id, r.name]));
  return {
    notes: (notes.results as { id: string; author_id: string | null; author_name: string | null; message: string; order_id: string | null; created_at: string; source: string }[])
      .map((n) => ({ id: n.id, author: n.author_name ?? (n.author_id ? nameMap.get(n.author_id) ?? '' : ''), message: n.message, orderId: n.order_id, createdAt: n.created_at, source: n.source })),
  };
}
