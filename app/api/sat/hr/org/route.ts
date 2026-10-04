import { hrGet } from '@/lib/sat-proxy';

// App của sếp · Nhân sự / Sơ đồ: các phòng ban, trưởng bộ phận và thành viên.
export async function GET(request: Request) {
  return hrGet(request, '/api/v1/app/org');
}
