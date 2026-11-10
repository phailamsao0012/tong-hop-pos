import { canView } from '@/lib/auth/access';
import { forbidden, getSessionUser, unauthorized } from '@/lib/auth/auth';
import { recruitCv } from '@/lib/teams/recruit-api';

// App của sếp · Tuyển dụng: tải file CV của một ứng viên (?id=) để xem ngay trong app.
export async function GET(request: Request) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  if (!canView(user, 'recruit')) return forbidden('Phần Tuyển dụng chỉ dành cho chủ hệ thống và giám đốc.');
  return recruitCv(request);
}
