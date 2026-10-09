import { getSessionUser, unauthorized } from '@/lib/auth';
import { newSheetKey, sheetStatus } from '@/lib/sheet-costs';

// Tình trạng nối Google Sheet chi phí MKT (GET) và tạo mã nối mới (POST, chỉ chủ hệ thống; mã hiện đúng một lần).
export async function GET() {
  if (!(await getSessionUser())) return unauthorized();
  return Response.json(await sheetStatus(), { headers: { 'Cache-Control': 'private, no-store' } });
}

export async function POST() {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  if (user.role !== 'owner') return Response.json({ error: 'Chỉ chủ hệ thống tạo được mã nối Google Sheet.' }, { status: 403 });
  return Response.json({ key: await newSheetKey(user.userId) }, { headers: { 'Cache-Control': 'no-store' } });
}
