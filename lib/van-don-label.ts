/** Nhãn riêng khi hiển thị nội dung dùng chung trên trang Vận đơn. */
export function vanDonLabel(text: string): string {
  return text
    .replace(/doanh thu/giu, 'Doanh số chuyển đi')
    .replace(/người bán/giu, 'Người lên đơn')
    .replace(/(?<!đơn )chốt/giu, 'vào Chờ xác nhận')
    .replace(/(?<![\p{L}])bán(?![\p{L}])/giu, 'lên đơn');
}
