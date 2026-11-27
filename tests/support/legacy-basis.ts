// Bản cũ fad5bb7 của lib/reports/stats.ts (dùng ở K1, K2, K3, G8 để so cách GHI) còn xếp doanh thu theo ngày chốt và chưa có cột
// received_*. Từ 27/11/2026 doanh thu xếp theo ngày tạo đơn và có DT đã nhận (plan phần A, B): đổi đúng mấy câu đó trong bản cũ để
// hai bản ra cùng NỘI DUNG bảng, phép so chỉ còn đo cách ghi (số dòng ghi), như mục đích ban đầu của các test này.
const RULES: [string, string][] = [
  ["${dayExpr('first_closed_at')}", "${dayExpr('created_at')}"],
  ["${dayExpr('o.first_closed_at')}", "${dayExpr('o.created_at')}"],
  ['AND first_closed_at>=? AND first_closed_at<? AND ${CLOSED}', 'AND created_at>=? AND created_at<? AND ${CLOSED}'],
  ['o.first_closed_at>=? AND o.first_closed_at<?', 'o.created_at>=? AND o.created_at<?'],
  ["'closed_shipping_fee', 'closed_quantity',\n] as const;", "'closed_shipping_fee', 'closed_quantity', 'received_orders', 'received_net',\n] as const;"],
  ['  COALESCE(SUM(shipping_fee),0) AS closed_shipping_fee\n`;',
    '  COALESCE(SUM(shipping_fee),0) AS closed_shipping_fee,\n  SUM(CASE WHEN status_code IN (3,16) THEN 1 ELSE 0 END) AS received_orders,\n  COALESCE(SUM(CASE WHEN status_code IN (3,16) THEN ${NET} ELSE 0 END),0) AS received_net\n`;'],
];

/** Chỉ đổi file 'stats'; mỗi luật phải khớp ít nhất một chỗ (bản cũ đổi thì test báo ngay). */
export function legacyRevenueBasis(file: string, source: string) {
  if (file !== 'stats') return source;
  source = source.replaceAll('\r\n', '\n');
  for (const [from, to] of RULES) {
    if (!source.includes(from)) throw new Error(`legacy stats: không thấy "${from.slice(0, 60)}"`);
    source = source.split(from).join(to);
  }
  return source;
}
