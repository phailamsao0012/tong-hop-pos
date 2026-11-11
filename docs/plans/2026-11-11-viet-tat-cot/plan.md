# Viết tắt tên cột dài, rê chuột hiện tên đủ và giải thích

Anh Vũ 11/11/2026:
> "các chữ nào 3 âm tiết trở lên mà dài quá thì viết tắt cho gọn cột, khi đưa chuột vào nó sẽ ra tên và giải thích chi tiết của cột đó"

Nhánh `claude/bo-xac-thuc-2-lop`, worktree `C:\thp\cutover`. Không đổi số, cách tính, quyền, dữ liệu. Chỉ đổi chữ tiêu đề cột và phần giải thích khi rê chuột.

## Quy tắc
- Tiêu đề cột từ **3 âm tiết trở lên** thì viết tắt. Ví dụ "Doanh thu New" (3), "Số điện thoại" (3), "Tỷ lệ xác nhận" (4).
- Từ 2 âm tiết trở xuống giữ nguyên. Ví dụ "Chi phí", "Đơn chốt", "Số", "ROAS".
- Tên người, tên team, tên POS trong ô dữ liệu: không đụng.
- Rê chuột vào tiêu đề: hiện **tên đầy đủ** ở dòng đầu, rồi **giải thích** (tính thế nào, phạm vi nào) ở dòng sau.
  - Tiêu đề có sẵn `title` giải thích (vd. cột Hạng) thì gộp vào phần giải thích, không mất.
  - Cột bấm sắp xếp được: thêm "Bấm để sắp xếp" ở cuối.
- Điện thoại không có rê chuột. Ở chế độ bảng dạng thẻ trên màn hẹp (`useTableCardLabels` trong `app/ui-kit.tsx`), nhãn mỗi ô dùng **tên đầy đủ**, không dùng chữ tắt.

## Từ điển viết tắt (dùng chung, đặt ở `lib/shared/column-labels.ts`)
| Tên đầy đủ | Viết tắt |
|---|---|
| Doanh thu | DT |
| Doanh thu New | DT New |
| Doanh thu CSKH | DT CSKH |
| Doanh thu theo mốc | DT mốc |
| Doanh thu sau hoàn hủy | DT sau HH |
| Doanh thu / SĐT | DT/SĐT |
| Doanh số | DS |
| Số điện thoại | SĐT |
| Đơn xác nhận | Đơn XN |
| Tỷ lệ xác nhận | TL XN |
| Tỷ lệ chốt | TL chốt |
| Tỷ lệ giao thành công | TL giao TC |
| Đơn theo mốc | Đơn mốc |
| Tiền hoàn / hủy | Hoàn/hủy |
| Chi phí / đơn New | CP/đơn New |
| Chi phí / số | CP/số |
| % chi phí / DT New | %CP/DT New |
| Giá trị đơn trung bình | AOV |
| Khách hàng mới | KH mới |
| Nhân viên | (giữ, 2 âm tiết) |

Gặp tiêu đề dài khác không có trong bảng thì tự đặt chữ tắt theo cùng kiểu: chữ cái đầu viết hoa cho cụm quen (DT, SĐT, XN, TL, CP, KH), giữ chữ ngắn có nghĩa. Thêm vào từ điển và ghi lại trong `ket-qua.md`.

Giải thích từng cột: viết 1–2 câu tiếng Việt dễ hiểu. Lấy theo đúng cách tính trong code (comment, `title` có sẵn, `lib/reports/*`), không đoán. Ví dụ:
- "Doanh thu New: doanh thu sau giảm trừ của đơn do Sale chốt, theo ngày xác nhận."
- "Tỷ lệ xác nhận: đơn xác nhận ÷ đơn tạo trong kỳ."

## Làm
1. Thêm `lib/shared/column-labels.ts`: từ điển `{ full, short, hint }` theo khoá. Thêm hàm `colLabel(key)` và test cho từ điển: không trùng chữ tắt, chữ tắt ngắn hơn tên đủ.
2. `SortTh` (`app/ui-kit.tsx`):
   - Thêm prop `full?: string` và `hint?: string`. Hiện `label` (chữ tắt).
   - `title` = `full` + xuống dòng + `hint` + xuống dòng + "Bấm để sắp xếp".
   - Thêm `aria-label` = tên đủ cho trình đọc màn hình.
   - Thêm component `Th` cho tiêu đề không sắp xếp, cùng cách.
3. Bảng dạng thẻ: nhãn ô lấy `data-full` nếu có, không thì lấy chữ hiện tại.
4. Áp cho **mọi bảng** trong `app/*.tsx` có tiêu đề ≥ 3 âm tiết (khoảng 40 file). Ưu tiên trang Marketing, Sale, CSKH, Tổng quan, Đối chiếu sheet.
   - Không đổi khoá sắp xếp, không đổi thứ tự cột.
   - File xuất Excel giữ **tên đầy đủ**, không viết tắt.
5. `ket-qua.md`: bảng các cột đã đổi (file, tên cũ → chữ tắt) và các tiêu đề cố ý giữ nguyên.

## Kiểm
- tsc, lint các file đổi, test liên quan bằng bộ nạp native như các lần trước. Claude chạy đủ test và build ngoài sandbox.
- Không commit, Claude kiểm và commit.
