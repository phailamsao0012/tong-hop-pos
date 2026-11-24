// Đơn MKT "đã chốt" (anh Vũ 24/11/2026: "doanh thu chốt phải có đơn hủy chứ, hoàn hủy tính sau mà"; "số nào cho nó rõ ràng số đó").
// Một chỗ dùng chung cho mọi số MKT: đơn đã xác nhận lần đầu, KỂ CẢ hủy / hoàn sau đó; chỉ trừ đơn mới (0), chờ (17), xoá (7).
// DT chốt = tiền các đơn này; DT chuyển / Đơn đi = trong đó đã đóng hàng trở đi (PACKED_SQL); hủy, hoàn là số riêng, dòng nhỏ
// "sau hoàn hủy" mới trừ (4,5,15,6). Số Sale / CSKH / Tổng quan POS không dùng hằng này (vẫn CLOSED trong lib/reports/stats.ts).

export const MKT_CLOSED_EXCLUDED = '0,17,7';
/** Điều kiện trạng thái đơn MKT đã chốt trên cột trạng thái `col` (vd 'o.status_code', 'status_code'). */
export const mktClosedStatus = (col = 'o.status_code') => `${col} NOT IN (${MKT_CLOSED_EXCLUDED})`;
/** Đơn MKT đã chốt (bí danh bảng `a`, rỗng = không bí danh): đã xác nhận lần đầu và không phải mới / chờ / xoá. */
export const mktClosedSql = (a = 'o') => { const p = a ? `${a}.` : ''; return `${p}first_confirmed_at IS NOT NULL AND ${mktClosedStatus(`${p}status_code`)}`; };
