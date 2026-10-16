# App iPhone 0.10: đổi cột "Đã XN kho" thành "Đang đóng hàng", giống web thật (PR #79)

Tổ app viết, 16/10/2026. Codex trên PC làm, theo cách đã chạy lần sửa CI thứ 3 (`sua-ci-giao.md`).

Đọc và theo luật `docs/plans/2026-10-14-app-ios-android/CODEX.md`: vùng cấm, không mạng, không commit, không push (trừ khi người chạy em giao khác).

**Máy em chạy là PC Windows, không có Xcode.**
- Bỏ mục 10 và 13 của CODEX.md: không có `xcodebuild`, `xcrun`, `swiftc` hay máy ảo, đừng thử. CI trên GitHub build và quay video.
- Vùng cấm của mục 5 áp dụng cho mọi `~/.codex*`, `C:\tele-bot\**` và mọi file `.env`.
- Giữ xuống dòng LF như file gốc.

## Bối cảnh
- Ngày 16/10, web thật lên PR #79 (`origin/main` `1f6cde5`): cột "Đã XN kho" của bảng Từng nhân viên đổi thành **"Đang đóng hàng"**. Bản demo cũng đã chạy mã này.
- Trên dữ liệu thật, Sale tự bấm Đã xác nhận, nên `whRate` gần như luôn 0%. App 0.10 chưa phát hành, nên đổi luôn trong 0.10 cho giống web.
- Đọc mã web bằng `git show origin/main:<đường dẫn>`. Nhánh iOS cắt từ trước PR #78, nên mã web trên nhánh là bản cũ.
  - `app/api/reports/product-groups/route.ts`, `lib/van-don.ts` (`PACKED_SQL`), `app/product-group-blocks.tsx` (cột, bảng giải thích, danh sách).
  - `tests/product-groups-packed.test.ts` là hợp đồng.

## Hợp đồng API sau PR #79 (app chỉ đọc, không tự tính)
- `staff[]` và `staffTotal` có thêm bốn trường:
  - `packed`: đơn chốt đã vào Đang đóng hàng, hoặc đã đi tiếp.
  - `confirmedNotPacked`: còn Đã xác nhận, chưa đóng.
  - `cancelledBeforePack`: hủy trước khi đóng.
  - `packedRate`: `packed ÷ closed × 100`, chưa làm tròn, `null` khi `closed = 0`.
- `waiting` giữ nguyên.
- `definitions.packed`: câu định nghĩa của cột. App hiện đúng chữ máy chủ trả.
- Danh sách đơn của cột: thêm `&staffId=<mã>&packed=1` vào cùng đường dẫn bảng (thay cho `&wh=1`). Kết quả có cùng dạng đơn như danh sách Đơn chốt.
- Các trường cũ (`whConfirmed`, `whRate`, `selfConfirmed`, `unknownConfirmer`, `waitingUnconfirmed`, `warehouseConfirmed`, `backToWaiting`, `otherUnconfirmed`, `?wh=1`) máy chủ vẫn trả, nhưng **app không dùng nữa**.

## Làm

### 1. Mô hình (`StaffAPI.swift`)
- `StaffRow`, `StaffSum`:
  - thêm `packed`, `packedRate`, `confirmedNotPacked`, `cancelledBeforePack`, đều là `Double?` (thiếu trường thì `nil`, không làm hỏng giải mã cả bảng);
  - giữ `waiting`;
  - bỏ `whConfirmed`, `whRate`, `selfConfirmed`, `unknownConfirmer`, `warehouseConfirmed`, `otherUnconfirmed`, `backToWaiting`. Máy chủ còn trả các trường này thì bỏ qua.
- `StaffDefinitions`: thêm `packed: String?`. Bỏ `whConfirmed` nếu không còn chỗ dùng.
- `StaffOrderQuery`: đổi `wh` thành `packed`.
  - Đường dẫn: `(q.packed ? "&packed=1" : "")`.
  - Các chỗ chỉ chuyển tiếp query (`Shared.swift`, `NavMemory.swift`) đổi tên theo, giữ cách mã hóa route.
- `PGOrder`: thôi hiện `whConfirmedAt`, `confirmer` (có thể bỏ khỏi mô hình).
  - Giữ `closedAt` đọc từ `first_confirmed_at`: máy chủ vẫn để tên này cho giờ chốt.

### 2. Bảng (`StaffTable.swift`)
- `StaffValues`: đổi các trường kho sang `packed`, `packedRate`, `confirmedNotPacked`, `cancelledBeforePack`.
- Cột `whRate` đổi thành `packedRate`:
  - tiêu đề `StaffTerms.packed`, dòng nhỏ dưới tiêu đề `StaffTerms.packedHint`;
  - sắp xếp theo `packedRate`, `nil` xếp cuối, giữ cách phá hòa hiện có;
  - giữ độ rộng cột và chỗ `scrollTo`.
- **Ô:** giữ cách chạm hiện có.
  - Dòng trên là `Fmt.pct(s.packedRate)`; chạm vào mở bảng giải thích.
  - Dòng dưới là `packed` in đậm, rồi `/<closed> đơn chốt`; chạm vào mở danh sách `packed=1`.
  - `packed` là `nil` thì hiện `—`, không có liên kết.
  - Ô của dòng Tổng giữ cách cũ: chạm thì mở bảng giải thích.
  - Nhãn VoiceOver của ô: `"<tên> · <packed> đơn chốt đã vào Đang đóng hàng"`.
- **Bảng giải thích của cột:**
  - Tiêu đề: `"<tên> · đã vào Đang đóng hàng"`.
  - Các dòng theo đúng thứ tự, mỗi dòng một số máy chủ trả; trường `nil` thì bỏ dòng, như hàm `count` hiện có:
    1. `Đã vào Đang đóng hàng hoặc đi tiếp` → `packed`
    2. `Còn Đã xác nhận, chưa đóng` → `confirmedNotPacked`
    3. `Còn Chờ xác nhận` → `waiting`
    4. `Hủy trước khi đóng` → `cancelledBeforePack`
  - Không có dòng "Khác": web tự trừ ở trình duyệt, còn app không tự tính.
  - Câu định nghĩa: `definitions.packed`.
- **Danh sách đơn của cột:**
  - Tiêu đề: `"<tên> · đơn chốt đã vào Đang đóng hàng"`.
  - Bỏ hai dòng `Giờ XN kho:` và `Người XN:` ở mỗi đơn, giữ `Giờ chốt:`.
  - `expected` dùng `packed` (thay `whConfirmed`).
- Danh sách Đơn chốt không đổi.
- Móc DEBUG `xnk-cot`, `xnk-o`, `xnk-ds`, `xnk-chot`: trỏ sang cột mới, giữ tên móc.

### 3. Chữ (`Terms.swift`)
- `whConfirmed = "Đã XN kho"` → `packed = "Đang đóng hàng"`.
- `warehouseHint` → `packedHint = "Đơn chốt kho đã chuyển sang Đang đóng hàng (hoặc đã đi tiếp)"`.
- Bỏ: `warehouse` ("Kho xác nhận"), `selfConfirmed`, `unknownConfirmer`, `other`, `includingSelfConfirmed`, `includingUnknownConfirmer`, nếu không còn chỗ dùng.
- Thêm:
  - `"Đã vào Đang đóng hàng hoặc đi tiếp"`
  - `"Còn Đã xác nhận, chưa đóng"`
  - `"Hủy trước khi đóng"`
  - hai hàm tiêu đề ở mục 2.
- Giữ `waiting = "Còn Chờ xác nhận"`.
- Số trong chuỗi phải qua `Fmt` (bước chặn của `ios.yml`).
- Hàm `warehouseOrders` đổi tên thì sửa cả `FormatSelfTest.swift`.

### 4. Kiểm thử giải mã (`DecodeSelfTest.swift`)
- JSON mẫu có bốn trường mới, mỗi trường một giá trị khác nhau để bắt nhầm trường, ví dụ `"packed":10,"confirmedNotPacked":1,"cancelledBeforePack":0,"packedRate":null,"waiting":1`.
- Thêm một mẫu không có bốn trường đó. Phải giải mã được, và cho ra `nil`.
- `definitions.packed` có trong mẫu và được kiểm.
- Kiểm đường dẫn `PATH_ORDERS` / `PATH_ENCODE` có `&packed=1`, không còn `&wh=1`.
- Bỏ các kiểm của trường đã bỏ. Giữ ca `ORDER_CLOSED` (`first_confirmed_at`).

### 5. Log DEBUG (chỉ trong `#if DEBUG`)
- Dòng `[XNK] dong=…` và `[TEAM] dong=…`: thay `xn=<whConfirmed>/<closed>` bằng `dh=<packed>/<closed> tldh=<packedRate>`.
  - `packed` là `nil` thì in `dh=—`.
  - Định dạng qua `Fmt`, như các trường khác.
- Dòng `[XNK] ds wh=…` đổi thành `[XNK] ds dh=1|0 don=… du=co|khong`.
- Khi `MEGATECH_TOUR == "xnkho"`, mỗi lần bảng tải xong in thêm một dòng `[XNKQ] path=<đường dẫn bảng app vừa gọi>` (đúng hàm `staffTablePath`), rồi `fflush(stdout)`.
  - Tiền tố khác `[XNK]` để không lọt vào `tour_log_tail`.
  - Lượt `xnkho` không chọn team nên đường dẫn không có mã team.

### 6. Lượt tự xem `xnkho` (`Tabs.swift`) và CI (`ios-preview.yml`)
- Lượt hiện chạy trên Tháng trước. Demo đã xong mọi đơn tháng 9, nên cột sẽ là 100% ở mọi dòng, và danh sách `packed` trùng danh sách Đơn chốt. Như vậy không chứng minh được bộ lọc.
- Thêm ca Tháng này, ngay sau mốc `chart-through-today` (màn So sánh nhân viên Tháng này đã mở và đã cuộn tới bảng), trước bước `nav.overviewPath = []` của ca Hôm nay:
  1. `(2, { DebugTap.shared.tap("cuon:bang-nhan-vien") })`, rồi `(3, { DebugTap.shared.tap("xnk-cot"); warehouseMark("dh-thang-nay") })`
  2. `(3, { DebugTap.shared.tap("xnk-o"); warehouseMark("dh-thang-nay-giai-thich") })`
  3. `(5, { DebugTap.shared.tap("xnk-dong") })`
  4. `(2, { DebugTap.shared.tap("xnk-ds"); warehouseMark("dh-thang-nay-ds") })`
  - Thứ tự và cách làm theo đúng bốn bước `cot`, `giai-thich`, `xnk-dong`, `ds` ở đầu lượt.
  - Không thêm bước nào đổi chế độ so: ca `reopen-custom` ở cuối đoạn cần chế độ `custom`.
  - Bước `nav.overviewPath = []` của ca Hôm nay ngay sau đó sẽ đóng danh sách.
- Trong `ios-preview.yml`, đoạn 12:
  - Thêm ba mốc vào vòng chụp, ngay sau `chart-through-today`: `dh-thang-nay dh-thang-nay-giai-thich dh-thang-nay-ds`. Ảnh tên `12-so-<mốc>.png` như các mốc khác.
  - Sau `wait_xnk dh-thang-nay`, đối chiếu API như đã làm cho Vận đơn ở đoạn 13:
    - lấy dòng `[XNKQ] path=` cuối cùng trong `$RUNNER_TEMP/xnk-12.txt`, không có thì `::error::` và thoát 1;
    - `curl -sS --fail -b "thp_session=$TOKEN" "$BASE$path"`;
    - đọc bằng `python3 -c` từ stdin, ghi vào `$OUT/12-dong-hang-api.txt`:
      - một dòng `tong packed=… closed=… packedRate=…` từ `staffTotal`;
      - năm dòng `dong=<1..5> packed=… closed=…` từ `staff[0..4]`. Máy chủ sắp theo doanh thu giảm dần, như bảng app mặc định.
    - Không ghi tên, mã người, JSON thô. Không `echo` đường dẫn, không in `TOKEN`.
  - Sau `stop; mark "het-12"`:
    - `cat "$OUT/12-dong-hang-api.txt"`, rồi thêm vào cuối file đó các dòng `[XNK] bang` và `[XNK] dong=` của app in giữa mốc `rieng-end` và mốc `dh-thang-nay` (lúc bảng Tháng này tải), để QA đối chiếu.
    - Thêm hai lệnh kiểm bằng `can_co` (giữ mức nghiêm như các kiểm khác):
      - có ít nhất 1 dòng `\[XNK\] ds dh=1 .*du=co`;
      - giữa mốc `rieng-end` và mốc `dh-thang-nay`, có ít nhất 1 dòng `[XNK] dong=` mà số trước dấu `/` của `dh=` nhỏ hơn số sau dấu `/`. Bỏ dấu chấm nghìn trước khi so. Kiểm này chứng minh bộ lọc `packed` có tác dụng.
- Không đổi tên file `12-don-xn-kho.png` hay mốc cũ: tránh sửa các chỗ khác.

### 7. Phạm vi
- Chỉ sửa `ios/Megatech/**/*.swift` và `.github/workflows/ios-preview.yml`. Không thêm file `.swift` mới.
- Không đổi phần nào khác của app: So cùng kỳ, team, Vận đơn, widget, số phiên bản (vẫn 0.10, build 10, chưa phát hành).
- Không còn chỗ nào trong app hiện chữ "Đã XN kho", "Giờ XN kho", "Người XN" hay "(không tính)" của cột kho. Kiểm bằng `rg` trong `ios/`.

### 8. Kiểm (không build được)
- Tách từng run block đã đổi của `ios-preview.yml` ra file trong `.codex-out/dh/` (không commit), chạy `bash -n`. Tất cả phải đạt.
- Tự đọc lại kỹ diff Swift:
  - mọi tên trường, hàm, kiểu có thật;
  - optional được xử lý ở mọi chỗ hiện số;
  - ngoặc đủ;
  - mọi `print` mới nằm trong `#if DEBUG`;
  - `rg -n 'whConfirmed|whRate|selfConfirmed|unknownConfirmer|wh=1|\.wh\b' ios/` không còn ra chỗ nào đang dùng.
- `git diff --stat` chỉ có các file trong phạm vi.

### 9. Tóm tắt
Viết ngắn, mở đầu `# Tóm tắt`, gồm:
- đã sửa gì theo từng mục, có `file:dòng`;
- chỗ nào làm khác lời giao, và vì sao;
- kết quả kiểm.

Không ghi tên người, SĐT, email, mã team hay khóa.
