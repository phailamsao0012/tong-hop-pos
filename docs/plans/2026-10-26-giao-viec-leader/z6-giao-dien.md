# Z6: làm lại giao diện 3 trang Giao việc cho đồng bộ với web tổng (27/10/2026)

Anh Vũ xem bản đầu (27/10 06:43Z): "giao diện quá khó nhìn, không phân tầng, không có sự sắp xếp, không đồng bộ với toàn web".
Bước này **chỉ đổi giao diện**. Không đổi API, logic, bảng, quyền, số liệu.

Luật chung vẫn theo `CODEX.md` cùng thư mục (không commit/push, không mạng, không bí mật, không tên thật, bốn lệnh kiểm).

## File được sửa

- `app/giao-viec-view.tsx` (Tổng quan)
- `app/giao-viec-hop-view.tsx` (Họp)
- `app/giao-viec-zalo-view.tsx` (Danh bạ Zalo)
- Được tạo mới `app/giao-viec-ui.tsx` cho phần dùng chung của 3 trang (chip trạng thái, định dạng ngày giờ, Sheet chi tiết). Không tạo file CSS mới; nếu thật cần một lớp CSS thì thêm cuối `app/globals.css`, dưới chú thích `/* Giao việc */`, tối đa 30 dòng.
- `tests/zalo-web.test.ts` nếu test cũ đọc chữ/cấu trúc đã đổi (chỉ sửa cho khớp, không bỏ ca).

Không sửa file nào khác. Không sửa `lib/**`, `app/api/**`, `app/dashboard.tsx`.

## Nguyên tắc (bắt buộc)

1. **Dùng đúng linh kiện chung** trong `app/ui-kit.tsx` như các trang khác (mẫu tham khảo: `app/tasks-view.tsx`, `app/audit-view.tsx`, `app/calls-view.tsx`):
   `PageHeader`, `Toolbar`, `SegmentedControl`, `KpiCard`, `ChartCard`, `TableWrap` + `<table className="tbl">`, `StatusChip`, `Avatar`, `ProgressBar`, `MiniStat`, `EmptyState`, `ErrorBox`, `SkeletonKpis`, `SkeletonTable`, `Definitions`, `dmy`, `dt`, `timeOnly`, `vi`, `toast`.
   Nút dùng lớp `btn` / `btn sm` / `btn primary` như `tasks-view.tsx`. Không dùng `rounded-xl border p-3` tự chế cho khối nội dung; khối nào cũng là `ChartCard` hoặc `KpiCard`.
   Linh kiện shadcn có sẵn trong `components/ui/` (Sheet, Switch, NativeSelect, Input, Textarea, Label, Checkbox) được dùng; không chép thêm bản khác.
2. **Phân tầng rõ, từ tổng tới chi tiết:** tiêu đề trang một dòng → thanh lọc → 4 ô số → bảng theo leader → bảng việc → ghi chú cuối trang.
   Không khối tiêu đề to, không đoạn giải thích dài ở đầu trang; giải thích để trong `Definitions` cuối trang hoặc dấu (i) (`info` của `ChartCard`).
3. **Ngày giờ kiểu Việt Nam:** ngày `dd/mm` (dùng `dmy`), có năm khi khác năm nay; giờ `HH:mm`, không bao giờ hiện giây, không AM/PM. Tháng hiển thị "Tháng 10/2026". Không dùng `<input type="month">` / `type="time"` (trình duyệt hiện tiếng Anh, AM/PM); dùng `NativeSelect`.
4. **Trạng thái là chip màu** (`StatusChip`), dùng chung một bảng màu cho cả 3 trang:
   Mới giao `gray`, Đã nhận `blue`, Đang triển khai `teal`, Đã hoàn thành `green`, Chưa hoàn thành `orange`, Đã huỷ `gray`; Quá hạn thêm chip `red` "Quá hạn"; Gấp chip `red` "Gấp".
   Họp: Tham gia `green`, Không tham gia `red`, Chưa trả lời `gray`. Danh bạ: Đã nối `green`, Chưa nối `orange`, Ngừng `gray`.
5. **Điện thoại 390px:** không tràn ngang trang; bảng nằm trong `TableWrap` (tự đổi thành thẻ có nhãn trên điện thoại như các trang khác). Thanh tuần cuộn ngang trong chính nó nếu không đủ chỗ.
6. **Chữ tiếng Việt, gọn**, mỗi con số ghi rõ là số gì và phạm vi (luật AGENTS.md). Không dùng `confirm()`/`alert()`: xác nhận huỷ bằng hộp xác nhận trong trang (`components/ui/alert-dialog.tsx`).
7. Giữ nguyên mọi chức năng đang có (giao, sửa, đổi trạng thái, ghi chú, huỷ, tạo/huỷ họp, thêm/sửa/ngừng người, tạo mã nối, cài đặt thông báo, người được giao việc, nối webhook, hộp thư demo, nút "Chạy thử mốc 12h"). Gọi đúng các API cũ với đúng dữ liệu cũ.

## Trang 1: Tổng quan (`giao-viec-view.tsx`)

Thứ tự từ trên xuống:

1. `PageHeader` title "Giao việc", eyebrow là kỳ đang xem, ví dụ "Tuần 5 · 26/10–01/11" hoặc "Tháng 10/2026". actions: nút `btn primary` "+ Giao việc".
2. `Toolbar`: `NativeSelect` tháng (6 tháng trước tới 2 tháng sau tháng hiện tại, nhãn "Tháng 10/2026") + `SegmentedControl` size `sm` các tuần của tháng, nhãn "Tuần 1" và `title` là khoảng ngày "01/10–04/10", cuối là "Cả tháng".
3. Lưới 4 `KpiCard` (`grid grid-cols-2 gap-3 lg:grid-cols-4`), bấm để lọc bảng việc, bấm lại bỏ lọc:
   Đang mở (icon `ListTodo`, `blue`), Quá hạn (`AlertTriangle`, `red`), Chưa hoàn thành (`CircleSlash`, `orange`), Đã hoàn thành (`CheckCircle2`, `green`). `note` mỗi ô: "Việc có hạn trong tuần 5" / "trong tháng 10".
4. `ChartCard` "Theo leader" (icon `UsersRound`), `info` giải thích cột. Bảng `tbl`, mỗi dòng một leader, bấm dòng để chọn leader (dòng chọn tô nền nhạt, bấm lại bỏ chọn):
   | Leader (Avatar + tên, dòng phụ nhỏ "Team … · Sale/CSKH") | Sếp giao (đang mở) | Giao nhân viên (đang mở) | Quá hạn (đỏ khi > 0) | Chưa hoàn thành | Đã hoàn thành | Tiến độ (`ProgressBar` đã hoàn thành / tổng, kèm %) |
   Số canh phải, `tabular-nums`. Có dòng "Tổng" cuối bảng.
5. `ChartCard` "Danh sách việc" (icon `ClipboardList`), subtitle là phạm vi đang lọc ("Tất cả leader" hoặc tên leader; thêm "· Quá hạn" khi đang lọc ô số). action: `SegmentedControl` size `sm`: "Tất cả" / "Sếp giao leader" / "Leader giao nhân viên".
   Bảng `tbl`, sắp: Quá hạn trước, rồi theo hạn gần nhất, việc đóng xuống cuối:
   | Mã (`V12`, chữ đậm, `num`) | Việc (tên; chip Gấp; dòng phụ nhỏ là ghi chú mới nhất hoặc "Lý do: …" màu cam khi Chưa hoàn thành) | Người nhận (Avatar sm + tên; dòng phụ team) | Người giao | Hạn (dd/mm; "Hôm nay" / "Mai"; đỏ + chip Quá hạn khi quá hạn; "Không hạn" màu nhạt) | Trạng thái (chip) |
   Bấm dòng mở Sheet chi tiết. Không có việc: `EmptyState` "Không có việc trong kỳ này".
6. Khi đã chọn một leader: `ChartCard` "Nhân viên của {tên leader}" (icon `UserRound`), bảng `tbl`: Nhân viên | Đang mở | Quá hạn | Xong tuần này. Bấm dòng lọc bảng việc theo nhân viên đó (hiện chip "Nhân viên: … ✕" ở action của thẻ Danh sách việc để bỏ lọc).
7. `Definitions` cuối trang: Quá hạn là gì, tuần tính từ thứ Hai, kỳ lọc theo hạn của việc, tối đa 500 việc, việc đóng chỉ giữ 45 ngày.

**Sheet chi tiết việc** (giữ `Sheet` bên phải, rộng `sm:max-w-lg`), chia mục có tiêu đề nhỏ (`text-xs font-semibold uppercase tracking-wide text-ink-3`) và `Separator` giữa các mục:
- Đầu Sheet: "V12 · tên việc", dưới là chip trạng thái + chip Quá hạn/Gấp, dòng "Giao bởi … · lúc dd/mm HH:mm".
- Mục "Cập nhật trạng thái": `NativeSelect` trạng thái + ô Lý do (chỉ hiện khi chọn Chưa hoàn thành, bắt buộc) + nút `btn primary sm` "Lưu trạng thái". Nút "Huỷ việc" `btn sm` màu đỏ nằm riêng cuối Sheet, có hộp xác nhận.
- Mục "Thông tin việc": người nhận (`NativeSelect`, chỉ người hợp lệ như code cũ), tên, nội dung, hạn (nút nhanh Hôm nay/Mai/Cuối tuần/Không hạn bằng `SegmentedControl` size `sm` + `Input type="date"`), Gấp (`Switch`). Nút "Lưu thông tin".
- Mục "Ghi chú": `Textarea` + nút "Thêm ghi chú".
- Mục "Lịch sử": danh sách dọc, mỗi dòng "dd/mm HH:mm · tên" chữ nhạt + nội dung, có vạch dọc trái.
**Sheet giao việc mới:** Người nhận là `NativeSelect` leader (nhãn "Tên · Team"), Tên việc, Nội dung, Hạn, Gấp, nút "Giao việc và gửi Zalo".

## Trang 2: Họp (`giao-viec-hop-view.tsx`)

1. `PageHeader` title "Họp", eyebrow "Sắp tới và 14 ngày qua · giờ Việt Nam", actions "+ Tạo họp" (`btn primary`).
2. Hàng 3 `MiniStat`: Họp sắp tới, Leader chưa trả lời (cuộc sắp tới), Leader báo không tham gia (cuộc sắp tới).
3. Mục "Sắp tới" rồi mục "Đã qua" (dùng `SectionTitle` nhỏ hoặc tiêu đề h2 `text-sm font-semibold` như `tasks-view.tsx`). Mỗi cuộc họp là một `ChartCard`:
   - title "H2 · Họp rà soát tuần"; subtitle "Thứ Hai 26/10 · 14:00 · Phòng họp"; họp đã huỷ thêm chip `gray` "Đã huỷ" và chữ mờ.
   - action: 3 chip đếm (Tham gia `green`, Không `red`, Chưa trả lời `gray`) + nút `btn sm` "Huỷ họp" (chỉ họp chưa diễn ra, có hộp xác nhận).
   - Thân: ghi chú họp (nếu có) một dòng nhạt, rồi bảng `tbl`: Leader (Avatar + tên + team) | Trả lời (chip) | Lý do | Trả lời lúc (dd/mm HH:mm).
4. Sheet tạo họp: Tên, Ngày (`Input type="date"`), Giờ (`NativeSelect` 06:00–22:00 mỗi 15 phút), Địa điểm, Ghi chú, Mời (danh sách `Checkbox` leader, mặc định chọn hết, có "Chọn tất cả / Bỏ chọn"). Nút "Tạo họp và gửi Zalo".

## Trang 3: Danh bạ Zalo (`giao-viec-zalo-view.tsx`)

1. `PageHeader` title "Danh bạ Zalo", eyebrow "Leader và nhân viên nhận việc qua Zalo", actions "+ Thêm người" (mở Sheet).
2. Hàng 3 `MiniStat`: Leader (số, note "x đã nối Zalo"), Nhân viên (số, note "x đã nối"), Chưa nối Zalo (`orange`).
3. Bố cục 2 cột trên máy tính `grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]`, 1 cột trên điện thoại:
   - Cột trái: `ChartCard` "Theo team" bảng `tbl` phân tầng: dòng leader (chữ đậm, Avatar, team, chip Sale/CSKH, chip Đã nối/Chưa nối), ngay dưới là các dòng nhân viên của leader đó thụt vào (`pl-8`, chữ thường). Cột cuối là các nút `btn sm`: "Mã nối", "Sửa", và "Ngừng" (đỏ nhạt, có hộp xác nhận). Mã nối vừa tạo hiện trong một ô nổi bật ngay dòng đó (chữ số lớn `num`, kèm "hết hạn sau 24 giờ", nút Chép).
     Sếp không nằm trong bảng này.
   - Cột phải (xếp dọc):
     a. `ChartCard` "Cài đặt thông báo": mỗi dòng một `Switch` + nhãn (Bản tin 8h; Doanh số 12h/17h/22h), rồi "Báo thiếu số sau" (`Input` số + chữ "phút"), "Khung giờ báo thiếu số" (2 `NativeSelect` giờ từ–đến, bước 30 phút), "Nhắc họp trước" (số + "phút"). Nút "Lưu cài đặt".
     b. Chỉ chủ hệ thống: `ChartCard` "Người được giao việc": danh sách `Checkbox` tài khoản + nút "Lưu". Dưới là dòng trạng thái bot: chip "Đã có mã bot" (`green`) / "Chưa có mã bot" (`orange`) + nút `btn sm` "Nối webhook Zalo".
     c. Chỉ bản demo: `ChartCard` "Hộp thư Zalo (demo)": tin bot đã gửi hiển thị như khung chat (bong bóng, tên người nhận + giờ HH:mm nhỏ), mới nhất ở trên, tối đa cao 420px cuộn trong thẻ; dưới là form thử: chọn người (`NativeSelect`), ô tin, nút "Gửi thử"; nút "Chạy thử mốc 12h" và "Làm mới".
4. Sheet thêm/sửa người: Vai trò (`SegmentedControl` Leader / Nhân viên), Tên, Team (leader: `NativeSelect` team Sale/CSKH như code cũ) hoặc Leader quản lý (nhân viên), Mã người bán POS (nhân viên, như code cũ). Nút "Lưu".

## Xong khi

- 3 trang dùng đúng các linh kiện ở trên, không còn khối `rounded-xl border p-3` tự chế, không còn ngày `2026-10-26`, giờ có giây, hay AM/PM ở đâu trên 3 trang.
- `pnpm typecheck`, `pnpm test`, `pnpm build` đạt; `pnpm lint` không thêm lỗi so với trước bước (so số lỗi trong các file đã sửa).
- Chạy `pnpm dev` với `DEMO_MODE=1`, đăng nhập `chu@demo.megatech.vn` / `demo@2026`, mở `?view=giao-viec`, `?view=giao-viec-hop`, `?view=giao-viec-zalo` ở bề rộng 1280 và 390: không lỗi console, không tràn ngang. Thử: bấm ô Quá hạn lọc bảng; chọn một leader; mở Sheet một việc, đổi trạng thái Chưa hoàn thành có lý do; tạo họp; tạo mã nối; gửi thử tin ở hộp thư demo.
- Tóm tắt theo mẫu trong `CODEX.md`, tiêu đề "# Tóm tắt Z6".
