import { getSessionUser, unauthorized } from '@/lib/auth';
import { customerDetail } from '@/lib/customer-report';
import { POS } from '@/lib/report-model';

// Hồ sơ một khách: số liệu tổng, lịch sử đơn (kèm sản phẩm), ghi chú trên đơn.
export async function GET(request: Request) {
  if (!(await getSessionUser())) return unauthorized();
  const p = new URL(request.url).searchParams;
  const posId = p.get('posId') ?? '';
  const phone = (p.get('phone') ?? '').trim();
  if (!POS.some((x) => x.id === posId) || !phone) return Response.json({ error: 'Thiếu POS hoặc SĐT.' }, { status: 400 });
  return Response.json(await customerDetail(posId, phone), { headers: { 'Cache-Control': 'private, no-store' } });
}
