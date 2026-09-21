import { env } from 'cloudflare:workers';
import { getSessionUser, unauthorized } from '@/lib/auth';
import { telegramFileUrl } from '@/lib/telegram';

// Xem CV trên web: lấy lại file đã gửi qua Telegram (file_id) và trả về cho trình duyệt (PDF mở ngay trong trang).
export async function GET(request: Request) {
  if (!(await getSessionUser())) return unauthorized();
  const id = new URL(request.url).searchParams.get('id') ?? '';
  const token = env.TELEGRAM_BOT_TOKEN?.trim();
  if (!token) return Response.json({ error: 'Chưa cấu hình bot Telegram.' }, { status: 503 });
  const cv = await env.DB.prepare('SELECT telegram_file_id, name, mime FROM recruit_cv WHERE candidate_id=?').bind(id).first<{ telegram_file_id: string | null; name: string; mime: string }>();
  if (!cv?.telegram_file_id) return Response.json({ error: 'CV chưa có bản lưu (chưa gửi qua Telegram).' }, { status: 404 });
  try {
    const url = await telegramFileUrl(token, cv.telegram_file_id);
    const upstream = await fetch(url, { signal: AbortSignal.timeout(30000) });
    if (!upstream.ok) return Response.json({ error: `Telegram trả ${upstream.status}.` }, { status: 502 });
    const name = (cv.name || 'cv.pdf').replace(/[^\w.\- ()]+/g, '_');
    return new Response(upstream.body, { headers: { 'Content-Type': cv.mime || 'application/pdf', 'Content-Disposition': `inline; filename="${name}"`, 'Cache-Control': 'private, max-age=600' } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : 'Không tải được CV.' }, { status: 502 });
  }
}
