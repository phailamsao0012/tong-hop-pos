import { env } from 'cloudflare:workers';
import { HR_SECRET_HEADER, secretMatches } from '@/lib/hr-link';
import { peopleGet, peoplePut } from '@/lib/people-api';

// Web nhân sự đọc / sửa phần Con người (hiệu suất, hồ sơ 360, cấp bậc, tổ chức & mục tiêu). Web nhân sự kiểm quyền người dùng trước khi gọi.
const denied = (request: Request) => !secretMatches(env.HR_SHARED_SECRET, request.headers.get(HR_SECRET_HEADER));
export async function GET(request: Request) {
  if (denied(request)) return Response.json({ error: 'Sai bí mật liên kết.' }, { status: 403 });
  return peopleGet(request);
}
export async function PUT(request: Request) {
  if (denied(request)) return Response.json({ error: 'Sai bí mật liên kết.' }, { status: 403 });
  return peoplePut(request);
}
