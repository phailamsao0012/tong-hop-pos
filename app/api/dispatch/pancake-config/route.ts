import { forbidden, getSessionUser, unauthorized } from '@/lib/auth';
import { isOwner } from '@/lib/access';
import { readAllAssignConfigs } from '@/lib/pancake-probe';

// Đọc (chỉ GET) cấu hình "Phân công xử lý đơn" của từng POS trên Pancake. Chỉ chủ hệ thống; không ghi gì lên Pancake.
export async function GET() {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  if (!isOwner(user)) return forbidden();
  return Response.json(await readAllAssignConfigs(), { headers: { 'Cache-Control': 'no-store' } });
}
