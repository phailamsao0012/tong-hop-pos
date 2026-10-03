import { hrGet } from '@/lib/sat-proxy';

// App của sếp · Nhân sự / Tổng quan: quân số, vào / nghỉ theo chi nhánh và phòng ban (?from=&to=), lấy từ web nhân sự.
export async function GET(request: Request) {
  return hrGet(request, '/api/v1/app/overview', ['from', 'to']);
}
