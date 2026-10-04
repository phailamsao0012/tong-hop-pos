import { hrGet } from '@/lib/sat-proxy';

// App của sếp · Nhân sự / Danh sách: mọi nhân viên (không có trường nhạy cảm), app tự lọc.
export async function GET(request: Request) {
  return hrGet(request, '/api/v1/app/people');
}
