import { env } from 'cloudflare:workers';
import { HR_SECRET_HEADER, groupPosStaff, secretMatches } from '@/lib/teams/hr-link';
import { posStaffSources } from '@/lib/teams/hr-api';

// Danh sách nhân viên trên các POS Pancake cho web nhân sự nhập lần đầu: gộp theo tài khoản Pancake,
// kèm ngày tạo tài khoản trên POS (ngày vào làm), ngày đầu tiên có đơn (dự phòng khi Pancake không trả ngày tạo)
// và ngày cuối cùng có đơn (web nhân sự dùng ước tính ngày nghỉ khi HR không ghi).
export async function GET(request: Request) {
  if (!secretMatches(env.HR_SHARED_SECRET, request.headers.get(HR_SECRET_HEADER))) return Response.json({ error: 'Sai bí mật liên kết.' }, { status: 403 });
  const [rows, first] = await posStaffSources();
  const staff = groupPosStaff(rows.results, new Map(first.results.map((r) => [r.seller_id, r.day])), new Map(first.results.map((r) => [r.seller_id, r.last])));
  return Response.json({ staff, fetchedAt: new Date().toISOString() }, { headers: { 'Cache-Control': 'no-store' } });
}
