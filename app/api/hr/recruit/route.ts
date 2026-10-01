import { env } from 'cloudflare:workers';
import { HR_SECRET_HEADER, secretMatches } from '@/lib/hr-link';
import { recruitGet } from '@/lib/recruit-api';

// Web nhân sự đọc danh sách / chi tiết ứng viên (đã kiểm quyền người dùng ở phía web nhân sự).
export async function GET(request: Request) {
  if (!secretMatches(env.HR_SHARED_SECRET, request.headers.get(HR_SECRET_HEADER))) return Response.json({ error: 'Sai bí mật liên kết.' }, { status: 403 });
  return recruitGet(request);
}
