import { env } from 'cloudflare:workers';
import { auditHeaders } from '@/lib/ops/audit';
import { forbidden, getSessionUser, unauthorized } from '@/lib/auth/auth';
import { isOwner } from '@/lib/auth/access';
import { isDemo } from '@/lib/demo/mode';
import { sendWatchTest } from '@/lib/bot/watch';
import { validateChats } from '@/lib/bot/watch-core';
import { incidentLog, readChats, saveChats } from '@/lib/bot/watch-store';

// Canh gác 24/7 (trang Cấu hình, chỉ chủ hệ thống): chat nhận tin canh gác (watch_chats, chỉ chat riêng), sự cố đang giữ trong bộ nhớ DO,
// nhật ký ops_incidents, nút gửi thử. Chưa đặt chat thì canh gác chỉ ghi nhật ký, không gửi (QA 11/10 điểm 9: không lấy chat cảnh báo cũ).
async function owner() {
  const user = await getSessionUser();
  if (!user) return { error: unauthorized() };
  if (!isOwner(user)) return { error: forbidden() };
  return { user };
}
const stub = () => env.SYNC_SCHEDULER.get(env.SYNC_SCHEDULER.idFromName('main'));

export async function GET() {
  const o = await owner();
  if (o.error) return o.error;
  const [chats, watch, log] = await Promise.all([
    readChats(),
    stub().watchStatus().catch(() => null),
    incidentLog(),
  ]);
  return Response.json({
    chats, demo: isDemo(), botReady: !!env.TELEGRAM_BOT_TOKEN?.trim(),
    lastAt: watch?.lastAt ?? null, incidents: watch?.incidents.map(({ key, severity, title, detail, openedAt, notifiedAt, resolvedAt }) => ({ key, severity, title, detail, openedAt, notifiedAt, resolvedAt })) ?? null,
    log,
  }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function PUT(request: Request) {
  const o = await owner();
  if (o.error) return o.error;
  let body: { chats?: unknown };
  try { body = await request.json(); } catch { return Response.json({ error: 'JSON không hợp lệ.' }, { status: 400 }); }
  const v = validateChats(body.chats);
  if ('error' in v) return Response.json({ error: v.error }, { status: 400 });
  await saveChats(v);
  return Response.json({ ok: true, chats: v.chats }, { headers: auditHeaders(`Chat nhận canh gác: ${v.chats.length} chat`) });
}

/** Gửi thử một tin canh gác tới các chat đã lưu. */
export async function POST() {
  const o = await owner();
  if (o.error) return o.error;
  const chats = await readChats();
  if (!chats.length) return Response.json({ error: 'Chưa lưu chat nhận canh gác.' }, { status: 400 });
  try {
    const r = await sendWatchTest(env, chats);
    return Response.json({ ok: r.sent > 0, ...r }, { status: r.sent ? 200 : 502, headers: auditHeaders(`Gửi thử canh gác: ${r.sent} chat nhận`) });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : 'Không gửi được.' }, { status: 400 });
  }
}
