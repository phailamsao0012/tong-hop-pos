import { forbidden, getSessionUser, unauthorized } from '@/lib/auth/auth';
import { isOwner } from '@/lib/auth/access';
import { audit } from '@/lib/ops/audit';
import { DEFAULT_HOLIDAYS, HOLIDAYS_KEY, parseHolidays } from '@/lib/shared/holidays';
import { readHolidays, writeHolidays } from '@/lib/ops/holidays-db';

// Ngày lễ cố định trong năm (anh Vũ 12/11/2026): ai đăng nhập cũng đọc được (để đánh dấu trên biểu đồ); chỉ chủ hệ thống sửa.
// Chưa lưu lần nào thì trả danh sách gợi ý mặc định.
export async function GET() {
  if (!(await getSessionUser())) return unauthorized();
  const r = await readHolidays();
  return Response.json({ holidays: r.saved ? r.holidays : DEFAULT_HOLIDAYS, saved: r.saved }, { headers: { 'Cache-Control': 'private, no-store' } });
}

export async function PUT(request: Request) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  if (!isOwner(user)) return forbidden();
  let body: unknown;
  try { body = await request.json(); } catch { return Response.json({ error: 'JSON không hợp lệ.' }, { status: 400 }); }
  const raw = (body as { holidays?: unknown })?.holidays;
  if (!Array.isArray(raw) || raw.length > 60) return Response.json({ error: 'Danh sách ngày lễ không hợp lệ.' }, { status: 400 });
  const holidays = parseHolidays(raw);
  if (holidays.length !== raw.length) return Response.json({ error: 'Có ngày lễ sai tên, tháng hoặc ngày.' }, { status: 400 });
  await writeHolidays(holidays);
  await audit({ action: 'holidays.set', userId: user.userId, target: HOLIDAYS_KEY, detail: JSON.stringify({ count: holidays.length }), request });
  return Response.json({ ok: true, holidays });
}
