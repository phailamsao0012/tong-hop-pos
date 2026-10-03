import { canView } from '@/lib/access';
import { forbidden, getSessionUser, unauthorized } from '@/lib/auth';
import { recruitGet } from '@/lib/recruit-api';

// App của sếp · Tuyển dụng: danh sách ứng viên; ?id=… trả chi tiết kèm lịch sử. Trang web đã chuyển sang web nhân sự.
export async function GET(request: Request) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  if (!canView(user, 'recruit')) return forbidden('Phần Tuyển dụng chỉ dành cho chủ hệ thống và giám đốc.');
  return recruitGet(request);
}
