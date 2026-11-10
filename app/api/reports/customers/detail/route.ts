import { getSessionUser, unauthorized } from '@/lib/auth/auth';
import { allowedPos } from '@/lib/auth/access';
import { openPhoneRef, privateJson, seesFullPhone } from '@/lib/auth/phone-privacy';
import { customerDetail } from '@/lib/reports/customer-report';
import { POS } from '@/lib/shared/report-model';

// Hồ sơ một khách: số liệu tổng, lịch sử đơn (kèm sản phẩm), ghi chú trên đơn.
// Vai trò không thấy đủ SĐT: mở bằng mã tham chiếu `ref` (danh sách khách trả kèm), SĐT trong hồ sơ vẫn bị che.
export async function GET(request: Request) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  const p = new URL(request.url).searchParams;
  let posId = p.get('posId') ?? '';
  let phone = seesFullPhone(user.role) ? (p.get('phone') ?? '').trim() : '';
  const ref = p.get('ref');
  if (ref) {
    const opened = await openPhoneRef(ref);
    if (!opened) return Response.json({ error: 'Mã khách không hợp lệ.' }, { status: 400 });
    ({ posId, phone } = opened);
  }
  if (!POS.some((x) => x.id === posId) || !phone) return Response.json({ error: 'Thiếu POS hoặc SĐT.' }, { status: 400 });
  // POS lấy từ mã tham chiếu cũng phải thuộc phạm vi tài khoản (worker chỉ kiểm được posId trên URL).
  if (!allowedPos(user).includes(posId)) return Response.json({ error: 'POS này không thuộc phạm vi của bạn.' }, { status: 403 });
  return privateJson(user.role, await customerDetail(posId, phone), { headers: { 'Cache-Control': 'private, no-store' } });
}
