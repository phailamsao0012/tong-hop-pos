// Lưu file Excel trên trình duyệt và ghi nhật ký lượt xuất (mọi cỡ, không chỉ ≥1000 dòng): luật bảo vệ dữ liệu cá nhân, QA 11/10/2026.
// Chỉ gửi tên file + số dòng, không gửi nội dung. Ghi nhật ký lỗi cũng không chặn việc tải file.
import type { WorkBook } from 'xlsx';

type XlsxLib = { writeFile: (wb: WorkBook, name: string) => void; utils: { decode_range: (ref: string) => { s: { r: number }; e: { r: number } } } };

export function countRows(XLSX: XlsxLib, wb: WorkBook) {
  return wb.SheetNames.reduce((n, name) => {
    const ref = wb.Sheets[name]?.['!ref'];
    if (!ref) return n;
    const r = XLSX.utils.decode_range(ref);
    return n + Math.max(0, r.e.r - r.s.r); // trừ dòng tiêu đề
  }, 0);
}

export function saveXlsx(XLSX: XlsxLib, wb: WorkBook, fileName: string) {
  try {
    const view = typeof location === 'undefined' ? '' : new URLSearchParams(location.search).get('view') ?? '';
    void fetch('/api/activity', {
      method: 'POST', keepalive: true, headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ view: view || 'export', export: { file: fileName, rows: countRows(XLSX, wb), sheets: wb.SheetNames.length } }),
    }).catch(() => {});
  } catch { /* nhật ký không được làm hỏng việc tải file */ }
  XLSX.writeFile(wb, fileName);
}
