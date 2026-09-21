import { env } from 'cloudflare:workers';
import { attachCv, driveFileId, ingestSnapshot, type SnapshotPayload } from '@/lib/recruit';

// Apps Script (chạy bằng tài khoản Google của chủ web) gọi vào đây: JSON = snapshot các tab; multipart = tải một file CV.
// Xác thực bằng header X-Recruit-Secret (wrangler secret put RECRUIT_WEBHOOK_SECRET). Không dùng phiên đăng nhập web.
const timingSafeEqual = (a: string, b: string) => { if (a.length !== b.length) return false; let r = 0; for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i); return r === 0; };

export async function POST(request: Request) {
  const secret = env.RECRUIT_WEBHOOK_SECRET?.trim();
  const given = (request.headers.get('x-recruit-secret') ?? new URL(request.url).searchParams.get('secret') ?? '').trim();
  if (!secret || !given || !timingSafeEqual(secret, given)) return Response.json({ error: 'Sai mã bí mật.' }, { status: 401 });
  const type = request.headers.get('content-type') ?? '';
  try {
    if (type.includes('multipart/form-data')) {
      const form = await request.formData();
      const candidateId = String(form.get('candidateId') ?? '').slice(0, 300);
      const file = form.get('file');
      const fileId = String(form.get('driveFileId') ?? '') || driveFileId(String(form.get('url') ?? '')) || '';
      if (!candidateId || !(file instanceof File) || !fileId) return Response.json({ error: 'Thiếu candidateId / driveFileId / file.' }, { status: 400 });
      if (file.size > 19 * 1024 * 1024) return Response.json({ error: 'File quá 19 MB (giới hạn gửi Telegram).' }, { status: 413 });
      return Response.json(await attachCv(candidateId, fileId, file));
    }
    const body = await request.json() as SnapshotPayload;
    if (!body?.file?.id || !Array.isArray(body.tabs)) return Response.json({ error: 'Thiếu file.id hoặc tabs.' }, { status: 400 });
    const r = await ingestSnapshot(body);
    // Đánh thức bộ hẹn giờ để tin Telegram đi sau ~90 giây thay vì chờ lượt 5 phút.
    try { await env.SYNC_SCHEDULER.get(env.SYNC_SCHEDULER.idFromName('main')).pokeRecruit(); } catch (error) { console.error('pokeRecruit failed', error); }
    return Response.json({ ok: true, ...r });
  } catch (error) {
    console.error('recruit webhook failed', error);
    return Response.json({ error: error instanceof Error ? error.message : 'Lỗi xử lý.' }, { status: 500 });
  }
}
