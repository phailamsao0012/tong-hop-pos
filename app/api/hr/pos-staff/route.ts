import { env } from 'cloudflare:workers';
import { HR_SECRET_HEADER, groupPosStaff, secretMatches, type PosStaffRow } from '@/lib/hr-link';

// Danh sách nhân viên trên các POS Pancake cho web nhân sự nhập lần đầu: gộp theo tài khoản Pancake,
// kèm ngày tạo tài khoản trên POS (ngày vào làm) và ngày đầu tiên có đơn (dự phòng khi Pancake không trả ngày tạo).
export async function GET(request: Request) {
  if (!secretMatches(env.HR_SHARED_SECRET, request.headers.get(HR_SECRET_HEADER))) return Response.json({ error: 'Sai bí mật liên kết.' }, { status: 403 });
  const [rows, first] = await Promise.all([
    env.DB.prepare('SELECT user_id,pos_id,name,email,phone,is_active,department,sale_group,source_created_at FROM pos_users').all<PosStaffRow>(),
    env.DB.prepare("SELECT seller_id, MIN(day) AS day FROM stats_daily WHERE seller_id<>'' GROUP BY seller_id").all<{ seller_id: string; day: string }>(),
  ]);
  const staff = groupPosStaff(rows.results, new Map(first.results.map((r) => [r.seller_id, r.day])));
  return Response.json({ staff, fetchedAt: new Date().toISOString() }, { headers: { 'Cache-Control': 'no-store' } });
}
