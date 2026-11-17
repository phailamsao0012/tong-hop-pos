# Tiêu đề cột tự co giãn: cột rộng theo giá trị, chữ tiêu đề tự viết tắt theo màn hình (anh Vũ 12/11/2026)

Yêu cầu, nguyên văn: "cho viết tắt chữ hết cho t, độ rộng của cột là độ rộng của giá trị trong cột đó, text ở trên chiếm ít diện tích nhất có thể. đối với màn hình nhỏ thì sẽ auto viết tắt, đối với màn hình lớn sẽ chuyển về viết đầy đủ tùy từng độ lớn của màn hình".

**Trạng thái: đang lên plan, chưa chốt, chưa code.** Người làm: Claude.

## Nền đã có (bản 11/11, commit 88ec8fd, chờ lên ở đợt khởi động lại PC)

- Từ điển `lib/shared/column-labels.ts`: 178 tên cột, mỗi tên có `full`, `short`, `hint`.
- `Th` / `SortTh` trong `app/ui-kit.tsx` (dòng ~458–474): luôn hiện tên tắt, rê chuột hiện tên đủ + giải thích.
- Còn khoảng 158 dòng dùng `<th>` thô, chưa qua `Th`, nên không viết tắt được.

## Kết quả cần có

1. **Cột rộng theo giá trị, không theo chữ tiêu đề.**
   - Chữ tiêu đề không bao giờ làm cột rộng thêm. Nhãn nằm trong một khối `w-0 min-w-full`, giống cách làm dòng phụ hôm 11/11.
   - Độ rộng cột do số trong ô quyết định: số tiền, số đơn, %.
2. **Tiêu đề chọn nhãn theo chỗ trống thật của từng cột**, không theo một mốc màn hình cố định:
   - Đủ chỗ cho tên đầy đủ trên 1 dòng: hiện tên đầy đủ.
   - Không đủ: hiện tên tắt.
   - Tên tắt vẫn không đủ: tên tắt xuống tối đa 2 dòng, cỡ chữ tiêu đề 11px.
   - Như vậy màn hình to tự hiện chữ đủ, màn hình nhỏ tự viết tắt, màn hình vừa thì cột nào rộng hiện đủ, cột nào hẹp hiện tắt.
   - Đổi kích cỡ cửa sổ, xoay điện thoại, đổi kỳ hay bộ lọc làm số dài ra hoặc ngắn lại: nhãn tự đổi theo.
3. **Rê chuột** (trên điện thoại: chạm giữ) vào tiêu đề luôn hiện tên đầy đủ + giải thích cách tính, như bản 11/11.
4. **Tiêu đề chiếm ít diện tích nhất có thể:**
   - Bỏ chữ IN HOA và giãn chữ ở tiêu đề bảng (hiện `HẠNG`, `ĐƠN TẠO`… in hoa, letter-spacing rộng). Dùng chữ thường 11.5px, đậm vừa.
   - Thu padding tiêu đề: cao 32px thay vì 48px.
5. **Áp cho mọi bảng trên web:**
   - Đổi hết `<th>` thô sang `Th` / `SortTh`.
   - Tên nào chưa có trong từ điển thì thêm tên tắt và giải thích.
   - Giữ nguyên ngoại lệ đã có: nhãn Vận đơn "Doanh số chuyển đi" có test bảo vệ.
   - File Excel vẫn ghi tên đầy đủ.

## Cách làm

1. **`app/ui-kit.tsx`: thêm `useFitLabel(full, short)`.**
   - Dùng `ResizeObserver` trên thẻ `th` để đo bề rộng nội dung của cột (do ô giá trị quyết định, vì nhãn đã `w-0 min-w-full`).
   - Đo bề rộng chữ của tên đầy đủ bằng một thẻ đo ẩn dùng chung, cùng font, hoặc `canvas.measureText`.
   - Chọn `full` khi vừa, ngược lại chọn `short`.
   - Chỉ đổi state khi khác giá trị cũ, có debounce theo `requestAnimationFrame`, tránh nhấp nháy.
   - Lần vẽ đầu (SSR) dùng tên tắt, để không có cột nào bị kéo rộng lúc tải.
2. **`Th` / `SortTh`** dùng `useFitLabel`.
   - Nhãn đặt trong `<span class="th-label">`, có `display:block; width:0; min-width:100%`.
   - Mũi tên sắp xếp nằm ngoài khối đo.
3. **`globals.css`:** thêm `table.tbl th { height:auto; padding:6px 8px; text-transform:none; letter-spacing:0; font-size:11.5px; line-height:1.25 }` và lớp `.th-label`. Kiểm lại bảng `compact`, `sticky-first`, `tfoot`.
4. **Đổi `<th>` thô sang `Th`** trong khoảng 158 dòng, theo từng file. Tên nào thiếu thì bổ sung `column-labels.ts`.
5. **Test (`tests/column-labels.test.ts`):**
   - Mọi chữ trong `Th`/`SortTh` có trong từ điển, hoặc ngắn ≤ 2 âm tiết.
   - Không còn `<th>` thô trong `app/` (trừ danh sách ngoại lệ có lý do).
   - Tên tắt không trùng nhau trong cùng một bảng.
6. **Kiểm bằng Playwright trên bản thử PC (cổng 8789).** Chụp trang Marketing, Sale, CSKH, Tổng quan, Vận đơn ở 3 cỡ:
   - 390px (điện thoại): hầu hết tên tắt;
   - 1280px: cột rộng hiện đủ, cột hẹp hiện tắt;
   - 1920px: gần như đủ hết.
   - Đo thêm: bề rộng mỗi cột không lớn hơn bề rộng giá trị dài nhất + padding.
7. typecheck, test, build:pc. Gom vào đợt khởi động lại PC.

## Rủi ro

- Bảng dài (hàng trăm dòng): `ResizeObserver` chỉ gắn trên `th`, không gắn trên từng ô, nên nhẹ.
- Cột nhãn chữ (Marketer, Sản phẩm) không áp quy tắc "rộng theo giá trị", vì giá trị là chữ. Giữ như cũ, tự xuống dòng.
- Quay lại: revert commit. `Th` giữ prop cũ nên các bảng không phải sửa lại.

## Liên quan

- Plan gộp bảng Marketing và bảng Xếp hạng marketer (cột Đơn chốt, Đơn đi): `docs/plans/2026-11-12-gop-bang-mkt/plan.md`. Hai cột mới dùng `Th` có tên tắt.
- Quy tắc POS: `docs/plans/2026-11-12-pos-loc-dau-tien/plan.md`.
