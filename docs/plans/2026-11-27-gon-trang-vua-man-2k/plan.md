# Gọn trang và vừa màn 2K

Anh Vũ duyệt 27/11/2026 8h34: "ok plan gọn trang và vừa màn 2K, build và lên web thật từng đợt".

## Mục tiêu
- Web dùng hết bề ngang trên màn PC 27 inch 2K (2560×1440; khi Windows phóng 125% là 2048×1152).
- Số nào đang hiện nhiều lần trong một trang hoặc ở nhiều trang thì gộp lại hoặc chỉ giữ một chỗ.

## Không đổi
- Không đổi con số, cách tính, quyền xem, tên nghiệp vụ. Ngoại lệ đã báo anh: TL chốt ở bảng nhân viên gộp tính theo nút "Cách tính" (rateBase), khớp ô TL chốt đầu trang.
- Laptop và điện thoại giữ bố cục hiện nay.
- Không đụng `migrations/**`, `drizzle/**`, workflow, wrangler.

## Hiện trạng (bản 365f48d)
- `app/dashboard.tsx` thẻ `main` có `max-w-[1360px]`: mọi trang bị khoá bề ngang, màn 2560 chỉ dùng khoảng 59%.
- Lưới cố định số cột: `team-overview-view.tsx` hàng ô số (`lg:grid-cols-3`), ô POS (`xl:grid-cols-3`), `product-group-blocks.tsx` ô nhóm sản phẩm (`xl:grid-cols-4`), `sale-analytics-view.tsx` (`xl:grid-cols-4`).
- Bảng theo thẻ đơn (`product-group-blocks.tsx`, min-width tăng theo số thẻ) phải kéo ngang vì bị khoá 1360.
- Tổng quan Sale có hai bảng nhân viên: `SaleGroupBlock` (API product-groups) và bảng "Theo nhân viên" (API overview). Trùng Doanh thu, Đơn chốt, TL chốt, Hoàn, Hủy. TL chốt hai bảng dùng mẫu số khác nhau.
- Tổng quan CSKH: hai bảng tương tự, một bảng gán theo nhân viên chăm sóc, một bảng theo người bán.
- `AdvisorPanel`, `PancakeReference` lặp ở Điều hành, Tổng quan POS, Tổng quan Sale, CSKH, Marketing, Vận đơn.

## Đợt 1: vừa màn 2K
1. Bỏ mức khoá 1360 ở `main` (giữ lề; đặt trần rộng, ví dụ 2400, để màn siêu rộng không loãng).
2. Lưới ô số, ô POS, ô nhóm sản phẩm thêm cột ở màn rộng (điểm ngắt `2xl` hoặc lưới tự giãn). Dưới 1536 giữ như cũ.
3. Bảng: rà các bảng có min-width, bảo đảm ở 1920, 2048, 2560 không có thanh kéo ngang với bảng cột cố định.

Tiêu chí xong: chụp 2560×1440, 2048×1152, 1920×1080, 1366×768 và điện thoại ở Tổng quan POS, Sale, CSKH, Marketing, Vận đơn, Theo tháng, Hồ sơ, Cài đặt: trang không có thanh kéo ngang; ở 2560 nội dung chiếm trên 90% bề ngang còn lại sau menu; 1366 và điện thoại không đổi so với trước.

## Đợt 2: gộp bảng nhân viên Sale và CSKH
1. Tổng quan Sale: một bảng, cột: Nhân viên, Số được chia, Đơn chốt, TL chốt (x/y), Doanh thu (dòng nhỏ tỷ trọng), AOV, DT đóng+ (dòng nhỏ %), Hoàn, Hủy, Đã nhận, So cùng kỳ, cột thẻ đơn (ẩn hiện được).
2. Một nguồn số cho các cột chung, cùng định nghĩa với ô số đầu trang. TL chốt dùng `closeRateOf` với rateBase.
3. Giữ: sắp xếp theo cột, bấm số ra từng đơn, nút So sánh nhân viên, nút Ẩn cột thẻ đơn, lọc thẻ, lọc nhóm đơn.
4. Tổng quan CSKH: gộp tương tự, gán theo nhân viên chăm sóc (trống thì người bán). CSKH không có TL chốt.

Tiêu chí xong: test trong `tests/` so dòng tổng bảng gộp với số ô đầu trang trên dữ liệu ảo (Doanh thu, Đơn chốt, TL chốt, Hoàn, Hủy) bằng nhau; ảnh trước và sau.

## Đợt 3: bỏ chỗ lặp
- `AdvisorPanel`, `PancakeReference`: chỉ giữ ở Điều hành và Tổng quan POS.
- Tổng quan Sale: bỏ biểu đồ "Doanh thu và đơn chốt theo ngày".
- Tổng quan CSKH: bỏ ô "Cuộc gọi" (giữ biểu đồ), bỏ ô "Tự upsell / Từ MKT" (giữ khối nguồn đơn).
- Tổng quan POS: "Hiệu suất theo POS" giữ bảng, bỏ hàng ô; bỏ hàng ô trạng thái, giữ thẻ "Trạng thái đơn".
- Phân tích Sale: bảng nhân viên chỉ giữ cột riêng (Chốt data, Chốt sau).
- Sau đó rà tiếp Marketing, Theo tháng, Hồ sơ, Giao việc; danh sách đợt sau gửi anh duyệt riêng.

Tiêu chí xong: mỗi mục có ảnh trước và sau; quyền xem và nút xuất Excel còn nguyên ở nơi giữ lại.

## Kiểm và lên
- Mỗi đợt một nhánh từ bản đang chạy web thật. PC viết code, không chạy typecheck, test, build bản thử trên PC.
- Máy đám mây: `pnpm typecheck`, `pnpm lint` (không thêm lỗi), `pnpm build`, `pnpm test`, chụp các cỡ màn.
- PC build đúng commit đã đạt ở thư mục riêng, đổi đường dẫn, khởi động lại ngoài 30 phút quanh 8h, 12h, 17h, 22h. Lùi: trả file chạy cũ, khởi động lại.

## Chi phí và rủi ro
- Không tăng đọc ghi dữ liệu, không tốn Cloudflare.
- Rủi ro: bảng gộp lệch tổng với ô đầu trang (chặn bằng test đợt 2); bố cục vỡ ở cỡ màn trung gian (chặn bằng chụp 5 cỡ).
