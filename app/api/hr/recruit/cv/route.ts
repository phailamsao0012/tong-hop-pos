import { env } from 'cloudflare:workers';
import { HR_SECRET_HEADER, secretMatches } from '@/lib/hr-link';
import { audit } from '@/lib/audit';
import { recruitCv } from '@/lib/recruit-api';

// Web nhân sự lấy file CV của một ứng viên để hiện trong trang Tuyển dụng.
// Nhật ký (luật dữ liệu cá nhân, 11/10/2026): web nhân sự gửi kèm người đang xem ở header x-hr-viewer (email), không có thì ghi "web nhân sự".
export async function GET(request: Request) {
  if (!secretMatches(env.HR_SHARED_SECRET, request.headers.get(HR_SECRET_HEADER))) return Response.json({ error: 'Sai bí mật liên kết.' }, { status: 403 });
  const res = await recruitCv(request);
  const viewer = request.headers.get('x-hr-viewer')?.slice(0, 120) ?? null;
  await audit({ action: 'recruit.cv.view', target: 'GET /api/hr/recruit/cv', email: viewer, name: viewer ? null : 'web nhân sự', detail: new URL(request.url).search.slice(1, 200), status: res.status, request });
  return res;
}
