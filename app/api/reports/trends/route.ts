import { getSessionUser, unauthorized } from '@/lib/auth';
import { POS } from '@/lib/report-model';
import { DATE_RE } from '@/lib/report-time';
import { trendsReport } from '@/lib/trends-report';

// Xu hướng 10 tuần đến ngày cuối kỳ đang chọn, theo bộ phận / team / sản phẩm, và trạng thái đơn 14 ngày theo ngày tạo (lib/trends.ts).
export async function GET(request: Request) {
  if (!(await getSessionUser())) return unauthorized();
  const p = new URL(request.url).searchParams;
  const start = p.get('start') ?? '', end = p.get('end') ?? '';
  if (!DATE_RE.test(start) || !DATE_RE.test(end) || start > end) return Response.json({ error: 'Khoảng ngày không hợp lệ.' }, { status: 400 });
  const validPos = new Set<string>(POS.map((x) => x.id));
  const requested = (p.get('posIds') ?? '').split(',').filter(Boolean);
  if (requested.some((id) => !validPos.has(id))) return Response.json({ error: 'POS không hợp lệ.' }, { status: 400 });
  const pp = p.get('productSegment');
  const productSegment = pp === 'gentadox' || pp === 'skgk' ? pp : 'all';
  const report = await trendsReport({ posIds: requested.length ? requested : POS.map((x) => x.id), productSegment, start, end });
  return Response.json({
    ...report,
    definitions: {
      'Cửa sổ': '10 tuần đến ngày cuối kỳ đang chọn (luôn đủ 10 tuần kể cả khi xem "Hôm nay"). Nền xanh nhạt là kỳ đang chọn. Tuần và % tăng giảm tính đến ngày đủ gần nhất (hôm nay chưa hết ngày thì đến hôm qua).',
      'Tăng / giảm': 'Tuần gần nhất so với trung bình 4 tuần trước đó. Lệch dưới 3% là đi ngang.',
      'Bộ phận': 'Sale, CSKH: doanh thu đơn chốt theo ngày chốt. MKT: doanh thu đơn có Marketer đã xác nhận, theo ngày xác nhận. Vận đơn: doanh số đơn chốt đã gửi đi, theo ngày chốt (ngày gần đây thấp hơn vì đơn chưa kịp gửi).',
      'Team': 'Sale / CSKH theo team của người bán trên web nhân sự; MKT theo team Marketing đã xếp ở trang Marketing.',
      'Sản phẩm': 'Tiền dòng sản phẩm (sau giảm giá dòng, không tính quà) trên đơn chốt, gộp theo loại: Oxy, SK + GK, Gentadox, Vita Plus, Mega Green, Khác. Số lượng là số sản phẩm bán.',
      'Trạng thái theo ngày tạo': 'Đơn tạo mỗi ngày trong 14 ngày gần nhất, chia theo trạng thái hiện tại. Ngày cũ còn nhiều đơn chưa xong là có đơn bị kẹt.',
    },
  }, { headers: { 'Cache-Control': 'private, no-store' } });
}
