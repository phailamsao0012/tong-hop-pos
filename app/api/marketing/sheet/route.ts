import { getSessionUser, unauthorized } from '@/lib/auth';
import { newSheetKey, setSheetAlias, sheetStatus } from '@/lib/sheet-costs';

// Tình trạng nối Google Sheet chi phí MKT (GET), tạo mã nối mới (POST, chỉ chủ hệ thống; mã hiện đúng một lần)
// và ghép tay tên trên sheet với nhân viên POS (PUT, chỉ chủ hệ thống).
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

export async function PUT(request: Request) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  if (user.role !== 'owner') return Response.json({ error: 'Chỉ chủ hệ thống ghép được tên.' }, { status: 403 });
  const body = await request.json().catch(() => null) as { name?: unknown; userId?: unknown } | null;
  if (typeof body?.name !== 'string' || typeof body.userId !== 'string') return Response.json({ error: 'Thiếu tên hoặc nhân viên.' }, { status: 400 });
  const r = await setSheetAlias(body.name.slice(0, 200), body.userId.slice(0, 100), user.userId);
  return Response.json(r, { status: r.ok ? 200 : 400 });
}
