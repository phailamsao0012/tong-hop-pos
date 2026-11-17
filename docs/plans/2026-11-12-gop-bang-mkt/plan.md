# Gộp bảng Marketer với bảng Đối chiếu sheet + bộ Xếp hạng (anh Vũ 11/11 và 12/11/2026)

Yêu cầu:
- Anh hỏi gộp 2 bảng Marketing làm một, và chọn **phương án A**: một bảng chính theo POS, nút **"So với sheet"** bật dòng phụ ngay dưới số.
- Thêm **bộ xếp hạng** theo Doanh thu, DT New, DT CSKH, Tỉ lệ chốt…
- **Không** làm 3 thẻ Top 1–2–3 ("k cần 3 cái này").
- Ngày 12/11 anh nhắn "tiếp tục phần gộp các bảng ở bên mkt".

Mẫu anh đã duyệt: https://claude.ai/artifact/Qa4gwv9sujQ7vriNfTDrWe

**Trạng thái (12/11, 15:56):**
- Đang lên plan, chưa chốt mẫu.
- Claude tự làm, không giao Codex (anh Vũ 12/11). Phần Codex làm dở đã cất vào `git stash` "codex gop-bang-mkt dang do, chua chot".
- Áp quy tắc POS (`docs/plans/2026-11-12-pos-loc-dau-tien/plan.md`):
  - các dòng marketer chỉ gồm nhân sự trên POS đang chọn;
  - dòng tổng = tổng các dòng (có dòng "Người ngoài POS này" nếu anh chọn F);
  - Chi phí và so sheet theo lựa chọn A/B.

## Thêm 12/11 16:00: bảng "Xếp hạng marketer" (marketing-view.tsx, bảng dưới trang)

Anh Vũ (kèm ảnh): "cạnh cột sđt có cột số đơn chốt, cột số đơn đi (là từ trạng thái đang đóng hàng trở đi)".

- **Vị trí:** thêm 2 cột ngay sau cột SĐT, trước Đơn XN. Áp cho cả bảng theo nhân viên và theo team.
- **Đơn chốt** = `atConfirmed`, tức `stageMetrics.confirmed.orders`: đơn được xác nhận lần đầu trong kỳ và hiện không ở trạng thái mới, chờ, huỷ, xoá (`stageSql('confirmed')`).
- **Đơn đi** = `atPacked`, tức `stageMetrics.packed.orders`: đơn chốt trong kỳ đã vào "Đang đóng hàng" trở đi (`PACKED_SQL` ở `lib/reports/van-don.ts`). Gồm các trạng thái:
  - 8 đang đóng hàng
  - 9 chờ lấy hàng
  - 2 đã gửi
  - 3 đã nhận
  - 16
  - 4 đang hoàn
  - 15
  - 5 đã hoàn
  - đơn hủy sau khi đã đóng hàng (đọc lịch sử trạng thái)
- **Dữ liệu:** API `/api/reports/marketing` đã trả sẵn 2 số này (`marketing-overview.ts:159`), không đổi câu tính và không thêm truy vấn.
- **Dòng Tổng:** dùng `stageSummary.confirmed.orders` / `stageSummary.packed.orders`, theo quy tắc POS: tổng phải bằng tổng các dòng.
- **Sắp xếp:** có khoá sắp `atConfirmed`, `atPacked`.
- **Tiêu đề và tooltip:**
  - "Đơn chốt": "Đơn xác nhận lần đầu trong kỳ, trừ đơn đã hủy / xoá".
  - "Đơn đi": "Đơn chốt trong kỳ đã vào Đang đóng hàng trở đi (đóng hàng, chờ lấy, đã gửi, đã nhận, hoàn)".
- **Excel:** thêm 2 cột tương ứng.
- **Chờ anh xác nhận:** đơn đã đóng hàng rồi bị hủy, hoặc đang hoàn / đã hoàn, có tính là "đơn đi" không. Hiện cách tính sẵn có của mốc "Đóng hàng" là có tính.
- **Bỏ cột "Đơn XN"** (anh Vũ 12/11 16:04: "nếu đã có đơn chốt đơn đi thì bỏ đơn xn đi"). Áp cho bảng, dòng Tổng, sắp xếp; Excel giữ hay bỏ theo anh.
- **Cột "TL XN"** hiện bằng Đơn XN ÷ Đơn tạo (đơn tạo trong kỳ, tới nay đã xác nhận). Bỏ Đơn XN thì cột này mất số gốc trên bảng. Chờ anh chọn:
  - (a) giữ TL XN như cũ, rê chuột ghi rõ cách tính;
  - (b) đổi thành "TL chốt" = Đơn chốt ÷ SĐT, khớp với bảng gộp phía trên;
  - (c) bỏ luôn.
  - **Anh chốt (b)** (12/11 16:06: "tl chốt hợp lý"): đổi TL XN thành **TL chốt** = Đơn chốt ÷ SĐT × 100%. Tooltip: "Đơn chốt ÷ SĐT về".
- **Thêm cột "Tỉ lệ đi"** (anh Vũ 12/11 16:06): Đơn đi ÷ Đơn chốt × 100%, đặt ngay sau TL chốt. Tooltip: "Trong số đơn chốt, bao nhiêu % đã đi (đóng hàng trở đi)". Đơn chốt = 0 thì hiện `—`.
- **Thứ tự cột sau cùng:** Hạng | Marketer · Team | Đơn tạo | SĐT | Đơn chốt | Đơn đi | TL chốt | Tỉ lệ đi | Đơn mốc | Doanh thu | DT New | DT CSKH | Tiền HH | Sau HH | …
- **Dòng Tổng:** TL chốt = tổng Đơn chốt ÷ tổng SĐT; Tỉ lệ đi = tổng Đơn đi ÷ tổng Đơn chốt. Không lấy trung bình các dòng.
- **Đơn hoàn và đơn hủy sau khi đóng hàng** (anh Vũ 12/11 16:07: "đấy tính vào tỉ lệ hoàn và hủy"). Cách hiểu, chờ anh xác nhận:
  - Các đơn này vẫn tính là đơn đi, vì hàng đã ra khỏi kho (giữ `PACKED_SQL`).
  - Thêm cột **"TL hoàn hủy"** ngay sau "Tỉ lệ đi" = (đơn đi đang hoàn / đã hoàn: status 4, 15, 5 + đơn đi đã hủy: status 6 có lịch sử đóng hàng) ÷ Đơn đi × 100%.
  - Rê chuột vào ô hiện tách riêng: "x hoàn · y hủy sau đóng hàng".
  - Dòng Tổng tính từ tổng số.
  - Cần thêm vào `marketing-overview.ts` 2 số đếm trong câu tính sẵn có: `packed_returned`, `packed_cancelled`. Không thêm lượt đọc.
  - Số thật 30 ngày (13/10–12/11): 160 đơn hủy sau khi đóng hàng, trong đó 2 đơn đã giao ĐVVC, 58 đơn qua Chờ lấy hàng.
  - **Anh Vũ 12/11 16:14** (nguyên văn): "đơn kiểu vậy nếu gửi đi sẽ tính hủy, nếu chưa gửi đổi trạng thái đã giao dvvc thì sẽ tính hoàn".
  - Cách hiểu đang chờ anh xác nhận: hủy khi **chưa** giao ĐVVC (lịch sử chưa có 2, 3, 16, 4, 15, 5) thì tính **hủy**; hủy khi **đã** giao ĐVVC thì tính **hoàn**.
  - Hàm thuần `afterPackOutcome(order)` trả `'returned' | 'cancelled' | null`, có test.
  - **Anh chốt 12/11 16:15:** "đúng, vẫn tính đơn đi, nếu hủy sẽ làm cột tỉ lệ hủy, hoàn sẽ là cột tỉ lệ hoàn". Thay cột gộp "TL hoàn hủy" bằng **2 cột riêng**, cả hai chia cho **Đơn đi**:
    - **Tỉ lệ hủy** = đơn đi bị hủy khi chưa giao ĐVVC (status 6, lịch sử có 8, chưa có 2/3/16/4/15/5) ÷ Đơn đi.
    - **Tỉ lệ hoàn** = (đơn đi đang hoàn / đã hoàn: status 4, 15, 5 + đơn đi bị hủy sau khi đã giao ĐVVC) ÷ Đơn đi.
    - Rê chuột vào ô: số đơn cụ thể ("x đơn / y đơn đi").
    - Dòng Tổng tính từ tổng số. Đơn đi = 0 thì hiện `—`.
- **Thứ tự cột chốt:** Hạng | Marketer · Team | Đơn tạo | SĐT | Đơn chốt | Đơn đi | TL chốt | Tỉ lệ đi | Tỉ lệ hủy | Tỉ lệ hoàn | Đơn mốc | Doanh thu | DT New | DT CSKH | Tiền HH | Sau HH…

## Thêm 12/11 16:18: thu gọn bảng "Đơn gần nhất" (marketing-view.tsx ~dòng 321)

Anh Vũ (kèm ảnh): "phần này cho thu gọn lại nhé, dài dòng quá thừa thãi".

**Hiện trạng:**
- Bảng có 10 cột: Mã đơn (+ giờ) | POS | SĐT | Marketer | Sale | CSKH | Trạng thái | Nguồn | Ghi chú đơn | Doanh thu.
- Hiện đủ 60 đơn một lúc.
- Ghi chú đơn dài bị ép vào cột hẹp nên mỗi dòng cao 5–8 dòng chữ.
- Cột CSKH và Nguồn hầu như toàn "—".

**Đề xuất (chờ anh duyệt):**
1. Mặc định hiện **10 đơn**. Nút "Xem thêm 10" ở cuối bảng, nhiều nhất 60 như cũ. Tiêu đề phụ rút còn "Đơn mới nhất khớp bộ lọc".
2. **Mỗi đơn đúng 1 dòng**, cao ~40px:
   - Ghi chú đơn chỉ 1 dòng, cắt "…".
   - Rê chuột hiện đủ; bấm vào dòng thì mở rộng ghi chú ngay dưới dòng đó. Bấm lại thì đóng.
3. **Gộp cột**, còn 7 cột: Mã đơn · giờ | POS | SĐT | Người (dòng trên "Marketer", dòng dưới nhỏ "Sale / CSKH") | Trạng thái | Ghi chú | DT.
   - Ngày giờ viết gọn "12/11 08:40" ngay dưới mã đơn, chữ nhỏ.
   - POS viết tên ngắn: Bio Nano, Siêu Võ Gạo, Oxytetra; bỏ hậu tố "- Megatech".
4. **Cột CSKH và Nguồn chỉ hiện khi** trong các đơn đang hiện có ít nhất 1 đơn có giá trị. Nguồn "-1" (giá trị lạ từ Pancake) hiện "—".
5. Tiêu đề cột theo quy tắc tiêu đề tự co giãn (`docs/plans/2026-11-12-cot-tu-co-gian/plan.md`).
6. Quy tắc POS: danh sách chỉ gồm đơn của POS đang chọn (đã đúng, API lọc `posIds`).

## Thêm 12/11 16:19: thu gọn bảng "Sản phẩm do Marketing mang về" (marketing-view.tsx ~dòng 316)

Anh Vũ (kèm ảnh): "bảng này cũng thế, cho cái thu gọn lại".

**Hiện trạng:**
- 5 cột: # | Sản phẩm | Đơn/SP | SĐT | SL bán | Tiền dòng SP.
- Hiện mọi sản phẩm, mỗi dòng cao 48px.
- Đơn/SP và SĐT gần như luôn bằng nhau.
- Có tên trùng: "Bổ đậm đặc (1kg)" xuất hiện 2 dòng (63 và 22 đơn). Rất có thể là cùng tên ở 2 POS hoặc 2 mã sản phẩm khác nhau.

**Đề xuất (chờ anh duyệt):**
1. Mặc định hiện **top 10** theo tiền, nút "Xem thêm" ở cuối. Dòng cuối luôn là "Tổng" (đơn duy nhất).
2. Dòng thấp ~36px, tiêu đề theo quy tắc tự co giãn.
3. **Bỏ cột SĐT**, vì gần như trùng Đơn/SP. Rê chuột vào số đơn hiện "x SĐT".
4. Tên sản phẩm trùng nhau: **gộp thành 1 dòng** cộng số lại. Rê chuột hiện tách theo POS / mã sản phẩm. Chữ in hoa toàn bộ ("THUỐC THÚ Y GENTADOX") giữ nguyên như Pancake.
5. Cột còn lại: # | Sản phẩm | Đơn | SL bán | Tiền.

## Chốt 12/11 16:20: thu cả khối vào dòng tiêu đề

Anh Vũ: "cứ thu gọn hết lại vào dòng tiêu đề của cái đấy, nào xổ ra thì có". Áp cho 2 khối "Sản phẩm do Marketing mang về" và "Đơn gần nhất":

1. **Mặc định đóng.** Chỉ còn 1 dòng tiêu đề, có mũi tên ▸, kèm tóm tắt ngắn:
   - Sản phẩm: "Sản phẩm do Marketing mang về · 24 SP · 233 tr".
   - Đơn gần nhất: "Đơn gần nhất · 60 đơn · mới nhất 08:40".
2. **Bấm cả dòng tiêu đề để mở** (▾), bấm lại để đóng. Có `aria-expanded`, dùng được bằng bàn phím.
3. **Khi mở:** hiện bảng đã thu gọn theo 2 mục ở trên. Sản phẩm: top 10 + Xem thêm, bỏ SĐT, gộp tên trùng. Đơn: 10 đơn + Xem thêm, mỗi đơn 1 dòng, 7 cột.
4. **Nhớ trạng thái đóng/mở** theo từng người trên máy đó (localStorage, khoá `mkt-collapse-products`, `mkt-collapse-recent`).
5. Làm thành component dùng chung `CollapsibleCard` trong `app/ui-kit.tsx`, để sau này thu gọn khối khác chỉ cần đổi 1 dòng.

## Hai bảng hiện có

1. **Bảng Marketer.** `BreakdownTable` trong `app/mkt-headline.tsx` (khoảng dòng 186–250), hiện trong `MktHeadline` của trang Marketing.
   - Cột: Marketer | Chi phí | Doanh thu | DT New | DT CSKH | ROAS | Đơn chốt | Số | CP/đơn New | CP/số | % CP/DT New.
   - Dùng cho cả dòng marketer lẫn dòng team, qua prop `first`.
2. **Bảng Đối chiếu sheet.** `MktSheetCheck` trong `app/mkt-sheet-check.tsx`, hiện ở `app/marketing-view.tsx` dòng ~236.
   - Có 3 ô tổng, dòng gợi ý, và bảng Chi tiết theo Marketer / Ngày.
   - Lấy số từ API `/api/marketing/sheet-check`.

## Kết quả cần có

### 1. Bộ "Xếp hạng theo" (trên bảng Marketer, cả khi dòng là marketer lẫn team)

- **Thanh nút:** dùng `SegmentedControl` size `sm`, có cuộn ngang trên điện thoại. Nhãn: `Xếp hạng theo`. Lựa chọn, theo thứ tự:
  - Doanh thu (`net`), **mặc định**
  - DT New (`newNet`), chỉ hiện khi bảng có cột DT New/CSKH (`split`)
  - DT CSKH (`cskhNet`), như trên
  - Tỉ lệ chốt (`rate`)
  - ROAS (`roas`)
  - Đơn chốt (`closed`)
  - Số (`phones`)
  - CP/đơn thấp (`cpcLow`)
- **Bấm một nút:** gọi `sort` sang khoá đó, giảm dần. Riêng `cpcLow` sắp **tăng dần theo `costPerClosed`**: người không có chi phí hoặc `costPerClosed === null` đứng cuối. Cột của chỉ số đang chọn được tô nền nhẹ cả `th` lẫn `td` (class `bg-tint-2/60`, dùng chung một hằng). Bấm tiêu đề cột vẫn sắp như cũ; nếu khoá cột trùng một nút thì nút đó sáng theo, không trùng thì không nút nào sáng.
- **Cột hạng mới**, đứng đầu bảng trước tên (vẫn giữ `stickyFirst` cho cột tên; cột hạng hẹp `w-8`):
  - Hiện số hạng 1..n theo thứ tự đang hiển thị.
  - Hạng 1–3 dùng chip tròn có màu (1 vàng `var(--t-amber)` hoặc token tương đương có sẵn, 2 bạc `var(--ink-4)`, 3 đồng `var(--t-orange)`). Chỉ là chip số, **không** làm thẻ Top.
  - Dòng id bắt đầu `__` (ví dụ `__unassigned`) không có hạng (hiện `–`) và luôn xếp cuối.
- **Cột mới "Tỉ lệ chốt"**, đặt sau cột Số:
  - Công thức: `closed / phones` × 100, hiện 1 chữ số thập phân, dấu phẩy, `%`.
  - `phones = 0` thì hiện `—`, và khi sắp thì xếp cuối.
  - Tooltip tiêu đề: "Đơn chốt ÷ Số (SĐT về) × 100%". Thêm vào từ điển `lib/shared/column-labels.ts` nếu cột cần nhãn tắt (3 âm tiết thì giữ nguyên).
- **Hàm thuần đặt ở file mới `lib/shared/mkt-rank.ts`**, có test:
  - `rateOf(closed, phones): number | null`
  - `rankValue(key, m): number | null`
  - `compareForRank(key)`: so sánh với null luôn xếp cuối, `cpcLow` tăng dần, còn lại giảm dần.
  - `BreakdownTable` dùng các hàm này cho nút xếp hạng; `useSort` vẫn dùng cho tiêu đề cột. Nếu `useSort` không nhận hàm so sánh riêng thì giữ state `rankKey` riêng: khi `rankKey` có giá trị, sắp bằng `compareForRank`; khi người dùng bấm một tiêu đề cột thì `rankKey = null`.

### 2. Nút "So với sheet" (phương án A), chỉ khi dòng là marketer

- **Vị trí và cách bật:** công tắc (toggle button, `aria-pressed`) đặt cạnh thanh Xếp hạng, nhãn "So với sheet", icon `FileSpreadsheet`, mặc định tắt. Khi dòng là team: nút bị tắt (`disabled`), title "Chỉ so sheet khi xem theo marketer".
- **Khi bật:**
  - Gọi `useApi('/api/marketing/sheet-check?start&end&posIds')`, cùng kỳ và POS với bảng. Chỉ gọi khi bật, không gọi khi tắt.
  - **Tính số sheet giống hệt `MktSheetCheck` hiện nay:**
    - mốc `cutoff` = ngày cuối sheet có số;
    - cộng `detail` theo `marketerId` tới hết `cutoff`;
    - basis = `confirmed` (ngày xác nhận, như ô Doanh thu MKT);
    - cột POS so sánh theo nút Sale / CSKH đầu trang: Tất cả → `net`/`closed`, Sale → `sale`/`saleClosed`, CSKH → `cskh`/`cskhClosed`.
    - Chuyển các hàm `gapOf`, `verdict`, `pctText`, `signed`, `addRow`, `zeroRow`, `pick` sang `lib/shared/mkt-sheet-compare.ts` (thuần, có test). `mkt-sheet-check.tsx` import lại từ đó nếu file còn dùng.
  - **Dòng phụ dưới số**, đúng kiểu dòng phụ hôm 11/11: `className="block w-0 min-w-full whitespace-normal text-[11px] font-normal text-ink-3"`, `title` = câu đủ. Không được làm cột rộng ra.
    - Dưới **Chi phí**: `CP sheet {shortMoney(sheet.cost)}`. Title: "Chi phí QC marketer ghi trên sheet: {money}".
    - Dưới **Doanh thu**: `sheet {shortMoney(sheet.revenue)} · {signed(diff, shortMoney)}` + `StatusChip` cỡ nhỏ (Khớp / Lệch nhẹ / Lệch nhiều, ngưỡng như `verdict`). Diff = sheet − POS(sheet-check, tới `cutoff`).
    - Dưới **Đơn chốt**: `sheet {vi.format(sheet.orders)} · {signed}` + chip.
    - Dưới **Số**: `sheet {vi.format(sheet.phones)} · {signed}` (so với `created.phones`) + chip.
    - Marketer không có dòng sheet, hoặc sheet toàn 0: một dòng phụ duy nhất dưới Doanh thu, "sheet chưa ghi". `counted === false`: "không so (chưa có hậu tố MKT)".
  - **Một dòng tóm tắt ngay trên bảng** (thay cho 3 ô tổng cũ), class `text-[12px] text-ink-3`:
    - "Sheet tới hết {dmy(cutoff)} · SĐT {sheet}/{POS} {chip} · Đơn {sheet}/{POS} {chip} · DT {shortMoney sheet}/{shortMoney POS} {chip}".
    - Tổng chỉ tính marketer `counted`, như `MktSheetCheck`.
  - **Tên trên sheet chưa ghép** (id bắt đầu `sheet:`): không chen vào bảng. Liệt kê dưới bảng: "Tên trên sheet chưa ghép với POS: A (CP x, DT y), B (…) — ghép ở trang Chi phí & ROAS".
  - Đang tải: dòng phụ hiện `…`. Lỗi: một dòng `text-bad` "Không tải được số sheet" + nút Tải lại.
- **Khi tắt:** bảng giữ y như sau bước 1, không thêm dòng phụ nào.

### 3. Bỏ khối Đối chiếu sheet riêng

- Bỏ `<MktSheetCheck … />` ở `app/marketing-view.tsx` (dòng ~236) và import của nó.
- Giữ file `app/mkt-sheet-check.tsx` và API (không xoá), để còn đường quay lại.
- Xem theo **Ngày** của bảng đối chiếu cũ: thêm một liên kết nhỏ dưới bảng khi "So với sheet" đang bật, nhãn "Xem lệch theo từng ngày". Bấm thì mở `MktSheetCheck` cũ ngay dưới bảng, dạng thu gọn/mở rộng (`details`/`summary` hoặc state). Mặc định đóng. Như vậy không mất tính năng xem theo ngày.

### 4. Không đổi

- Cách tính số POS, API báo cáo, bảng xếp hạng marketer/team phía dưới trang (`marketing-view.tsx` phần ChartCard "Xếp hạng marketer") và Excel.
- Không đổi nhãn Vận đơn (test bảo vệ chữ "Doanh số chuyển đi").
- Không thêm thẻ Top 1–2–3.

## Các bước

1. Tạo `lib/shared/mkt-rank.ts` và `lib/shared/mkt-sheet-compare.ts` cùng test trong `tests/`:
   - `rateOf` khi phones 0 / null;
   - `compareForRank` với null, `cpcLow` tăng dần, dòng `__` cuối;
   - `gapOf` / `verdict` ở các ngưỡng ±2 %, ±10 %;
   - cộng tới `cutoff`;
   - chọn cột theo Tất cả / Sale / CSKH.
2. Sửa `BreakdownTable`: cột hạng, cột Tỉ lệ chốt, thanh Xếp hạng theo, tô cột đang xếp.
3. Thêm nút So với sheet + dòng phụ + dòng tóm tắt + danh sách tên chưa ghép + mục "Xem lệch theo từng ngày".
   - Truyền `team` (Tất cả / Sale / CSKH) và `start`/`end`/`posIds` xuống `BreakdownTable` hoặc tính ở `MktHeadline`, rồi truyền map `sheetByMarketer`.
4. Bỏ `MktSheetCheck` khỏi `marketing-view.tsx`.
5. `pnpm typecheck`, `pnpm test`, `pnpm build:pc`. Không chạy được trong sandbox thì ghi rõ trong `ket-qua.md`.
6. Ghi `docs/plans/2026-11-12-gop-bang-mkt/ket-qua.md`: đã đổi file nào, chỗ nào khác plan và vì sao, lệnh đã chạy và kết quả.

## Tiêu chí xong

- Một bảng Marketer duy nhất trên trang Marketing.
- Thanh "Xếp hạng theo" đổi thứ tự đúng, cột sáng đúng.
- Hạng 1–3 có chip màu, không có thẻ Top.
- Bật "So với sheet": mỗi marketer có dòng phụ sheet dưới Chi phí, Doanh thu, Đơn chốt, Số.
  - Số sheet và lệch **trùng khớp** với bảng Đối chiếu sheet cũ cùng kỳ (basis Ngày xác nhận, cột Tổng, khi đầu trang là Tất cả).
  - Cột không rộng thêm.
- Tắt "So với sheet": không gọi `/api/marketing/sheet-check`.
- typecheck, test, build qua.

## Rủi ro và cách quay lại

- Số sheet lệch với bảng cũ: dùng chung hàm đã chuyển sang `lib/shared/mkt-sheet-compare.ts` và có test so với cách tính cũ.
- Bảng rộng trên điện thoại: dòng phụ dùng `w-0 min-w-full`, thanh nút cuộn ngang.
- Quay lại: revert commit; `MktSheetCheck` vẫn còn nguyên file, chỉ cần thêm lại 1 dòng render.
