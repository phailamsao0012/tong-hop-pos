import { forbidden, getSessionUser, unauthorized } from '@/lib/auth';
import { isOwner } from '@/lib/access';
import { readSummary, refreshSummary } from '@/lib/ai-summary';
import { addDays, todayVn } from '@/lib/report-time';

// GET → tóm tắt sáng hôm nay (chưa có thì hôm qua). POST (chủ hệ thống) → tạo lại ngay.
export async function GET() {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  const today = todayVn();
  const s = (await readSummary(today)) ?? (await readSummary(addDays(today, -1)));
  // Số tổng hợp cả công ty (facts) chỉ trả cho chủ hệ thống / giám đốc; người khác chỉ nhận đoạn tóm tắt.
  const full = user.role === 'owner' || user.role === 'director';
  return Response.json({ summary: s && !full ? { ...s, facts: undefined } : s }, { headers: { 'Cache-Control': 'private, no-store' } });
}

export async function POST() {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  if (!isOwner(user)) return forbidden('Chỉ chủ hệ thống tạo lại tóm tắt.');
  return Response.json({ summary: await refreshSummary() });
}
