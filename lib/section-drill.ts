// Bấm vào số ở 4 bảng Tổng quan POS (anh Vũ 08/10/2026): mỗi số dẫn tới danh sách đơn tạo ra nó, cách tính và nguồn.
// Điều kiện ở đây phải khớp /api/reports/sections (cùng cột ngày, cùng trạng thái, cùng cách chia bộ phận).
import { CLOSED } from '@/lib/stats';
import { RETURNED_CODES, SENT_CODES } from '@/lib/shipping-lines';
import { teamSubquery } from '@/lib/team';

export const DRILL_NET = 'COALESCE(o.net_total,COALESCE(o.current_total,0)-COALESCE(o.total_discount,0))';
const IS_CLOSED = `o.first_closed_at IS NOT NULL AND o.${CLOSED}`;
const IS_CONFIRMED = 'o.first_confirmed_at IS NOT NULL AND o.status_code NOT IN (0,17,6,7)';
const HAS_MKT = "NULLIF(TRIM(o.marketer_id),'') IS NOT NULL";
const SENT = `o.status_code IN (${SENT_CODES.join(',')})`, RETURNED = `o.status_code IN (${RETURNED_CODES.join(',')})`;
// Cùng thứ tự CASE với /api/reports/sections: người vừa ở Sale vừa ở CSKH tính là Sale.
const teamSql = (team: 'sale' | 'cskh') => team === 'sale' ? `o.seller_id IN ${teamSubquery('sale')}` : `o.seller_id IN ${teamSubquery('cskh')} AND o.seller_id NOT IN ${teamSubquery('sale')}`;

export const DRILL_KEYS = [
  'sale.closed', 'sale.cohort', 'cskh.closed', 'cskh.self', 'cskh.fromMkt', 'mkt.confirmed', 'mkt.cohort',
  'ship.sent.all', 'ship.sent.sale', 'ship.sent.cskh', 'ship.returned.all', 'ship.returned.sale', 'ship.returned.cskh',
] as const;
export type DrillKey = typeof DRILL_KEYS[number];
export const isDrillKey = (v: string | null): v is DrillKey => !!v && (DRILL_KEYS as readonly string[]).includes(v);

export type Drill = {
  title: string;
  /** Cột ngày lọc theo kỳ. */ dateCol: 'first_closed_at' | 'created_at' | 'first_confirmed_at';
  where: string;
  /** Biểu thức đếm "đạt" trong danh sách (vd đơn đã chốt trong số đơn tạo), để ghi tỷ lệ. */ hit?: string; hitLabel?: string;
  formula: string[]; source: string;
  /** Trang chi tiết của bộ phận. */ view: { id: string; label: string };
};

const SOURCE_CLOSED = 'Đơn Pancake POS (bảng đơn nguồn), lọc theo ngày chốt = lần đầu đơn vào Chờ xác nhận hoặc trạng thái sau đó. Bỏ đơn mới, hủy, xóa. Người bán và bộ phận lấy theo web nhân sự (chưa gắn thì theo bộ phận trên Pancake).';
const SALE_VIEW = { id: 'sale-overview', label: 'Tổng quan Sale' }, CSKH_VIEW = { id: 'cskh-overview', label: 'Tổng quan CSKH' };
const MKT_VIEW = { id: 'marketing', label: 'Tổng quan MKT' }, VD_VIEW = { id: 'van-don', label: 'Vận đơn' };

export function drillOf(key: DrillKey): Drill {
  const [area, kind, part] = key.split('.') as [string, string, string | undefined];
  if (area === 'ship') {
    const team = part === 'sale' || part === 'cskh' ? part : null;
    const who = team === 'sale' ? 'Sale' : team === 'cskh' ? 'CSKH' : 'tổng';
    // Tổng = mọi đơn chốt (cả người bán ngoài Sale / CSKH), như cột Tổng ở bảng Vận đơn.
    const scope = team ? ` AND ${teamSql(team)}` : '';
    return kind === 'sent'
      ? { title: `Vận đơn · đơn đi · ${who}`, dateCol: 'first_closed_at', where: `${IS_CLOSED} AND ${SENT}${scope}`, hit: RETURNED, hitLabel: 'Hoàn',
          formula: ['Đơn đi = đơn chốt trong kỳ đang ở Đã gửi hàng, Đã nhận, Đã thu tiền, Đang hoàn, Hoàn một phần hoặc Đã hoàn.', 'Doanh số đi = tổng tiền hàng (sau giảm giá) của các đơn đó.', 'Tỷ lệ hoàn = đơn hoàn ÷ đơn đi.'],
          source: SOURCE_CLOSED, view: VD_VIEW }
      : { title: `Vận đơn · đơn hoàn · ${who}`, dateCol: 'first_closed_at', where: `${IS_CLOSED} AND ${RETURNED}${scope}`,
          formula: ['Đơn hoàn = đơn chốt trong kỳ đang ở Đang hoàn, Hoàn một phần hoặc Đã hoàn.', 'Doanh số hoàn = tổng tiền hàng của các đơn đó. % hoàn = so với đơn đi / doanh số đi.'],
          source: SOURCE_CLOSED, view: VD_VIEW };
  }
  if (area === 'mkt') {
    return kind === 'confirmed'
      ? { title: 'MKT · đơn đã xác nhận', dateCol: 'first_confirmed_at', where: `${IS_CONFIRMED} AND ${HAS_MKT}`,
          formula: ['Đơn có Marketer, đã xác nhận trên Pancake (Đã xác nhận trở đi, không tính Chờ xác nhận, hủy, xóa).', 'Lọc theo ngày xác nhận lần đầu. Doanh thu = tổng tiền hàng sau giảm giá. AOV = doanh thu ÷ số đơn.'],
          source: 'Đơn Pancake POS, cột Marketer trên đơn và mốc Đã xác nhận đầu tiên trong lịch sử trạng thái.', view: MKT_VIEW }
      : { title: 'MKT · đơn lên trong kỳ (mẫu số tỷ lệ chốt)', dateCol: 'created_at', where: `o.status_code<>7 AND ${HAS_MKT}`, hit: IS_CONFIRMED, hitLabel: 'Đã XN',
          formula: ['Đơn có Marketer tạo trong kỳ (theo ngày tạo, trừ đơn xóa).', 'Tỷ lệ chốt = số đơn trong danh sách này nay đã xác nhận ÷ tổng số đơn trong danh sách.'],
          source: 'Đơn Pancake POS, lọc theo ngày tạo đơn.', view: MKT_VIEW };
  }
  const team = area as 'sale' | 'cskh';
  const label = team === 'sale' ? 'Sale' : 'CSKH', view = team === 'sale' ? SALE_VIEW : CSKH_VIEW;
  if (kind === 'cohort') return {
    title: `${label} · đơn lên trong kỳ (mẫu số tỷ lệ chốt)`, dateCol: 'created_at', where: `o.status_code<>7 AND ${teamSql(team)}`, hit: IS_CLOSED, hitLabel: 'Đã chốt',
    formula: [`Đơn tạo trong kỳ có người bán thuộc ${label} (theo ngày tạo, trừ đơn xóa).`, 'Tỷ lệ chốt = số đơn trong danh sách này nay đã chốt (Chờ xác nhận trở đi) ÷ tổng số đơn trong danh sách.'],
    source: 'Đơn Pancake POS, lọc theo ngày tạo đơn; bộ phận theo người bán.', view,
  };
  const mkt = kind === 'self' ? ` AND NOT (${HAS_MKT})` : kind === 'fromMkt' ? ` AND ${HAS_MKT}` : '';
  const what = kind === 'self' ? ' · tự upsell (đơn không có Marketer)' : kind === 'fromMkt' ? ' · từ MKT (đơn có Marketer)' : ' · đơn chốt';
  return {
    title: `${label}${what}`, dateCol: 'first_closed_at', where: `${IS_CLOSED} AND ${teamSql(team)}${mkt}`,
    formula: [`Đơn chốt = đơn có người bán thuộc ${label}, từ Chờ xác nhận trở đi (Chờ xác nhận, Đã xác nhận, đóng gói, chờ chuyển, đang giao, đã nhận, hoàn).`, 'Lọc theo ngày chốt. Doanh thu = tổng tiền hàng sau giảm giá, chưa gồm phí ship. AOV = doanh thu ÷ số đơn chốt.'],
    source: SOURCE_CLOSED, view,
  };
}
