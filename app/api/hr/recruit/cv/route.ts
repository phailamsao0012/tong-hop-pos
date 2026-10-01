import { env } from 'cloudflare:workers';
import { HR_SECRET_HEADER, secretMatches } from '@/lib/hr-link';
import { recruitCv } from '@/lib/recruit-api';

// Web nhân sự lấy file CV của một ứng viên để hiện trong trang Tuyển dụng.
export async function GET(request: Request) {
  if (!secretMatches(env.HR_SHARED_SECRET, request.headers.get(HR_SECRET_HEADER))) return Response.json({ error: 'Sai bí mật liên kết.' }, { status: 403 });
  return recruitCv(request);
}
