import { listedIds, personDetail } from '@/lib/people';
import { NO_STORE, hrBoss, satCall, satResponse } from '@/lib/sat-proxy';
import { performanceOf, posAccountsOf, type Performance } from '@/lib/satellites';

// App của sếp · Nhân sự / Hồ sơ một người (?id=): hồ sơ từ web nhân sự, kèm hiệu suất bán hàng tính ở web tổng
// theo tài khoản POS đầu tiên có số (doanh thu, đơn chốt, hạng trong bộ phận, 6 tháng gần nhất).
export async function GET(request: Request) {
  const { user, error } = await hrBoss();
  if (error) return error;
  const id = new URL(request.url).searchParams.get('id')?.trim().slice(0, 100) ?? '';
  if (!id) return Response.json({ error: 'Thiếu mã nhân sự.' }, { status: 400, headers: NO_STORE });
  const r = await satCall(user, `/api/v1/app/person?id=${encodeURIComponent(id)}`);
  if (r.status !== 200) return satResponse(r);
  return satResponse({ status: 200, body: { ...r.body, performance: await performance(posAccountsOf(r.body)) } });
}

/** Lỗi khi tính số không làm hỏng hồ sơ: trả null. */
async function performance(posIds: string[]): Promise<Performance | null> {
  try {
    // Kiểm rẻ trước tài khoản nào còn trong danh sách đo (người đã nghỉ thì không), rồi chỉ tính hồ sơ 360 một lần.
    const [posId] = await listedIds(posIds.slice(0, 50).map((v) => v.slice(0, 100)));
    const d = posId ? await personDetail(posId) : null;
    if (d) return performanceOf(posId, d);
  } catch (error) { console.error('person performance failed', error); }
  return null;
}
