# App iPhone 0.11, lượt sửa S1 (sau khi tổ app kiểm 5 bước)

Tổ app viết, 16/10/2026. Codex trên PC làm hết, như `giao.md`. File này **chỉ thêm** việc sửa; mọi luật trong `giao.md` vẫn giữ.

Tổ app đã kiểm `30adf48` (W1, M1, M2, N1, T1):
- typecheck sạch, 167/167 test web đạt;
- CI `iOS` và `iOS preview` xanh trên `30adf48`.

Vẫn còn lỗi thật. Mỗi lỗi dưới đây đã được dựng lại bằng D1 giả (`demoWorld`) hoặc đọc thẳng từ ảnh và log của lượt quay `38867629705`.

## 0. Cho thread PC (người chạy script)

- **Nhánh.** Dùng lại worktree `C:\Users\PC\Projects\thp-app011`, nhánh máy `codex/app-0.11`.
  - Trước khi chạy: `git fetch origin claude/project-thread-avd7td` rồi `git merge --ff-only FETCH_HEAD` (lấy commit chứa file này).
  - Đẩy fast-forward lên `claude/project-thread-avd7td`, như `giao.md` mục 0. Không force, không đẩy nhánh khác.
- **Hai bước, theo thứ tự:** `S1W` rồi `S1I`. Mỗi bước một lần chạy Codex, một commit riêng.
  - `S1W`: mã web. Máy kiểm chạy `pnpm typecheck` và `pnpm test` **ngoài sandbox**.
  - `S1I`: mã iOS và workflow. Đẩy, chờ `iOS` rồi `iOS preview` trên commit cuối.
- **CI đỏ:** lấy annotation `::error::`, đưa Codex một vòng sửa. Tối đa 4 vòng mỗi bước.
  - `::warning::demo:` vẫn coi là xanh.
- **Lệnh cấm, vùng cấm:** như `CODEX.md` mục 4 và 5. File được sửa: xem mục 3.
- **Telegram:** như `giao.md`.
- **Xong:** Claude PC kiểm một lần (diff, CI xanh), rồi báo điều phối kèm commit cuối. Không merge, không phát hành.

## 1. `S1W`: sửa API `/api/reports/staff-detail`

File: `app/api/reports/staff-detail/route.ts`, `lib/staff-detail.ts` (nếu cần), `tests/staff-detail.test.ts`.

### 1.1. Ghi chú khách rỗng làm hỏng cả trang (nặng nhất)

**Lỗi.**
- Bảng `customer_notes` có cột `message` mặc định `''`. Ghi chú Pancake chỉ có ảnh được lưu thành chuỗi rỗng (`lib/customers-sync.ts`).
- Câu lấy ghi chú mới nhất (`ROW_NUMBER() ... WHERE rn=1`) không bỏ ghi chú rỗng.
- Hàm `textOut('')` trả `null`, nên API trả `customerNote: {"text": null, ...}`.
- Trên app, `Note.text` là `String` không tuỳ chọn. Giải mã hỏng cả `StaffDetailReport`, nên trang chỉ hiện chữ lỗi tiếng Anh.

**Sửa.**
1. Trong câu con của `customer_notes`, thêm điều kiện `TRIM(message)<>''` **trước** `ROW_NUMBER`. Như vậy câu lấy ghi chú mới nhất có chữ.
2. Khi dựng `customerNote`: chỉ trả object khi `n` có và `textOut(n.message)` khác `null`. Còn lại trả `null`.

**Test mới**, trong `tests/staff-detail.test.ts`:
- Chèn cho khách của một đơn chưa chốt hai ghi chú: một ghi chú có chữ (cũ hơn) và một ghi chú `message=''` (mới hơn).
- Gọi API với tư cách owner.
- Kỳ vọng `customerNote.text` là chữ của ghi chú cũ hơn, không phải `null`.
- Thêm một khách chỉ có ghi chú rỗng. Kỳ vọng `customerNote` của đơn đó là `null`.

### 1.2. Ẩn "Số chia" phải theo đúng dòng tổng quan của người đó

**Lỗi.**
- `route.ts` tự tính cờ ẩn: phòng ban khớp `/cskh|chăm sóc/` **hoặc** `team === 'cskh'`.
- `hideCskhAssigned` (`app/api/reports/overview/route.ts`) chỉ che dòng nhân viên theo phòng ban.
- Ví dụ: trưởng phòng CSKH có phòng ban "Quản trị viên" và chữ CSKH trong tên. Với người xem không phải owner/director, `team=cskh`, `rateBase=assigned`, kết quả là:
  - `summary.assignedHidden=false` với tỷ lệ theo số chia;
  - nhưng `base.kind='created'` và `assignedPhones=null`.
- Một trang hiện hai mẫu số mâu thuẫn. Vi phạm `giao.md` 2.1 bước 2 (cùng luật ẩn với tổng quan).

**Sửa.** Một nguồn duy nhất:
```ts
const row = current ?? previous;
const assignedHidden = !assignedVisible && (row ? Boolean(row.assignedHidden) : /cskh|chăm sóc/i.test(person?.department ?? ''));
```
- Dòng `row` đã qua `hideCskhAssigned`.
- Không thêm `team === 'cskh'` vào đây. Dòng của người đó ở So sánh nhân viên cũng không che theo team, nên trang chi tiết phải khớp dòng đó.

**Test mới:**
- Đặt một nhân viên CSKH có `department='Quản trị viên'` và tên chứa `CSKH`.
- Đăng nhập staff với `views:['cskh-overview']`, gọi `team=cskh&rateBase=assigned`.
- Kỳ vọng:
  - `summary.assignedHidden === false`;
  - `base.kind === 'assigned'`;
  - `base.total === summary.assignedOrders`;
  - `base.closed === summary.rateTop`;
  - `assignedPhones` là số.
- Ca phòng ban "CSKH" thật vẫn ẩn, như test cũ.

### 1.3. Câu đếm SĐT quét toàn bộ lịch sử đơn

**Lỗi.**
- Câu `createdPhones`/`assignedPhones` chỉ lọc `${common}` (POS, người bán, trạng thái, bộ lọc, team). Điều kiện kỳ nằm trong `COUNT(DISTINCT CASE ...)`.
- D1 vì thế đi qua mọi đơn của các POS từ trước tới nay, mỗi lần mở trang.
- Số vẫn đúng, nhưng chậm và tốn lượt đọc.

**Sửa.** Tách thành hai câu, cả hai nằm trong cùng `db.batch`:
- `SELECT COUNT(DISTINCT NULLIF(o.phone,'')) AS n FROM raw_pos_orders o WHERE ${common} AND o.created_at>=? AND o.created_at<?`
- Câu thứ hai giống hệt nhưng dùng `o.seller_assigned_at`.
- Thứ tự tham số: `[...posIds, sellerId, ...f.binds, startUtc, endUtc]`, như `binds`.

**Test mới:**
- So `createdPhones` và `assignedPhones` với số đếm thẳng bằng SQL trên D1 giả, cho cùng người và cùng kỳ.
- Chạy cả `rateBase=created` lẫn `assigned`.

### 1.4. Tên người ngoài phạm vi lộ qua câu dự phòng

**Lỗi.** Khi tổng quan không có dòng của người đó, route đọc `SELECT MAX(name), MAX(department) FROM pos_users WHERE user_id=?`. Câu này không lọc team và không lọc POS. Tài khoản bị giới hạn team Sale vẫn đọc được tên và phòng ban của người CSKH nếu biết mã.

**Sửa.**
```sql
SELECT MAX(name) AS name, MAX(department) AS department FROM pos_users
WHERE user_id=? AND pos_id IN (<posIds>) ${teamFilter('user_id', team, true, unit)}
```
Không có dòng thì `person.name = 'Nhân viên'`, `department = null` (như hiện tại).

**Test mới:**
- Gọi với `team=sale` và `sellerId` là một người CSKH.
- Kỳ vọng `person.name === 'Nhân viên'` và `person.department === null`.

### 1.5. `limit=` rỗng thành 1

Đổi thành:
```ts
const raw = p.get('limit');
const value = raw ? Number(raw) : 200;
```
Test: `limit=` rỗng trả `orders.length` như mặc định (≤ 200).

## 2. `S1I`: sửa app và lượt quay

File: `ios/Megatech/Megatech/StaffDetail.swift`, `MarketingView.swift`, `MarketingRank.swift`, `Terms.swift`, `CskhViews.swift`, `Tabs.swift`, `DecodeSelfTest.swift`, `.github/workflows/ios-preview.yml`.

### 2.1. App đọc chịu được giá trị rỗng

`StaffDetail.swift`, `API.StaffDetailReport.Order`:
- `Note.text` thành `String?`.
  - Dòng "Ghi chú khách" chỉ hiện khi `text` có chữ.
  - Sửa `StaffDetailTerms.customerNote(_:)` cho hợp.
- `group` thành `String?`. Máy chủ trả `null` cho mã trạng thái lạ.
- `statusName` giữ `String`, vì máy chủ luôn trả chuỗi.

`DecodeSelfTest.swift`, thêm ba ca:
1. `customerNote` có `text: null`;
2. `group: null`;
3. `customerNote` cả object là `null`.

Cả ba đều phải giải mã được.

### 2.2. Kiểm `[NV] loc` sai khi người đó có hơn 200 đơn chưa chốt (CI sẽ đỏ khi demo có API)

**Lỗi.**
- App in `hien` = số đơn đã tải (tối đa 200) mang lý do 1.
- App in `ky-vong=min(n lý do 1, số đơn đã tải)`.
- Nhưng `n` đếm trên tới 2000 đơn. Khi `hasMore` là true, một phần đơn lý do 1 không nằm trong 200 đơn đã tải, nên `hien < ky-vong` dù mã đúng.
- Lỗi này nằm ở công thức của tổ app trong `giao.md` 7.3. Codex làm đúng lời giao.

**Sửa.**
- App giữ dòng `[NV] loc ly-do=1 hien=<số thẻ đang hiện>`. Bỏ `ky-vong` khỏi app.
- Python (đoạn 14) tự tính kỳ vọng từ JSON staff-detail đã lấy (mục 2.3):
  - `expected = số phần tử của data['orders'] có reason == data['reasons'][0]['reason']`;
  - `equal('loc', hien, expected)`;
  - chỉ khi `not data['hasMore']`: thêm `equal('loc.n', hien, data['reasons'][0]['n'])`.

### 2.3. Đoạn 14 lấy số API sau khi quay xong, nên có lúc lệch số app (đỏ ngẫu nhiên)

**Lỗi.**
- Python gọi API cho `[MKTRQ]` và `[NVQ]` sau khi cả lượt quay kết thúc, chậm hơn lúc app tải khoảng 35–90 giây.
- Demo đồng bộ 5 phút một lần, và đơn giả sinh theo giờ.
- Nếu một lần đồng bộ rơi vào khoảng đó, `confirmationRate` lệch quá 0,05, và các số `[NV] tom-tat` lệch hẳn.

**Sửa** (làm như đoạn 12 ở `dh-thang-nay`): lấy JSON **ngay trong vòng lặp `stages14`**, sát lúc app tải.
1. Sau mỗi `wait_mktnv "$stage"` và chụp ảnh:
   - Nếu file log có thêm dòng `[MKTRQ] path=` mới kể từ lần lấy trước, `curl -sS --fail --max-time 30` đúng đường dẫn đó.
   - Ghi vào `$RUNNER_TEMP/mktrq-<số thứ tự dòng>.json`.
2. Sau `nv-tom-tat`, lấy ngay vào `$RUNNER_TEMP`:
   - đường dẫn `[NVQ] path=` → `nv.json`;
   - câu overview dựng từ đường dẫn đó (như Python đang dựng) → `nv-ov.json`.
3. Python đọc các file này, **không** gọi `fetch` sau lượt quay nữa.
   - Với Marketing: dùng file của dòng `[MKTRQ]` cuối cùng trước mốc `mkt-hang-tl`.
4. Không in đường dẫn hay JSON ra log; file chỉ ở `$RUNNER_TEMP`, không chép vào `$OUT`.
5. Thiếu file thì `fail(...)` như cũ. Không được coi là đạt.

### 2.4. Mốc `mkt-xep-khoa` không cho thấy ba lựa chọn xám

**Lỗi.**
- Hộp `confirmationDialog` thay menu "Xếp theo" (bản DEBUG) gắn vào `Color.clear.frame(height: 0)` ở cuối trang, nằm ngoài màn hình.
- Ảnh `14-mkt-xep-khoa.png` chỉ thấy một mẩu tiêu đề "Xếp theo".
- Cũng thiếu dòng gợi ý `MktSort.posHint`.

**Sửa.**
- Gắn hộp này vào hàng tiêu đề "Tách theo" (đang ở trên màn hình sau `cuon:mkt-tach`).
  - Hoặc dùng `.sheet` liệt kê đủ 8 lựa chọn, ba lựa chọn cần mọi POS hiện xám.
- Thêm `message: { Text(MktSort.posHint) }` khi `posLimited`.
- Trong `tourTap("mkt-xep-khoa")`: mở hộp, chờ khoảng 2 giây, rồi mới đặt `MktNvTour.done = true`.
- Hộp đóng ở mốc sau, như hiện tại.
- Ảnh `14-mkt-xep-khoa.png` phải thấy rõ ba lựa chọn xám và dòng gợi ý.

### 2.5. Mốc `nv-tong-quan` mở trang chi tiết hai lần

`Tabs.swift`, vòng `for _ in 0..<120`: kiểm `nav.overviewPath.isEmpty` **trước** khi chạm, và chờ 1 giây giữa hai lần chạm.
```swift
for _ in 0..<120 {
    if !nav.overviewPath.isEmpty { break }
    DebugTap.shared.tap("nhan-vien")
    await play([(1.0, {})])
}
```

### 2.6. Mốc `nv-mo` phải mở đúng dòng 1 của "Cần hỗ trợ"

`CskhViews.swift`, đoạn `#if DEBUG` bắt `nv-mo`: dựng `low` và `top` **đúng như phần thân** dựng cho `RankBlock`.
- Dùng cùng biến `qualified` (lấy từ `rows`, đã xếp theo doanh thu), rồi cùng phép `sorted`.
- Nên tách một hàm nhỏ dùng chung cho cả `RankBlock` và mốc tour.
- Hiện tại mốc tour xếp lại từ `all` (thứ tự máy chủ). Khi hai người bằng tỷ lệ, tour có thể mở người khác dòng 1.

### 2.7. Dòng `[MKT] tach` gắn nhãn POS mới cho số cũ

`MarketingView.swift`, `tourTap`:
- Ở `mkt-pos` và `mkt-tat-ca-pos`, không gọi `tourNumbers()` ngay sau khi đổi `pos`.
- `load()` đã in lại sau khi tải xong.
- Cách khác: chỉ in khi POS của dữ liệu đang có bằng `pos`.

### 2.8. Khối Xếp hạng tự che tiền, khác cả trang

`MarketingRank.swift`:
- Bỏ `@AppStorage("thp_hide_money")` và mọi chỗ thay tiền bằng `••••`.
- Các khối khác của trang Marketing không che. `giao.md` 5.4 bảo dùng đúng các hàm `Fmt` như `MarketingView`.

### 2.9. `averageOrder` và `revenuePerPhone` rỗng phải hiện "—", không phải 0

`MarketingRank.swift`, chỗ giải mã (khoảng dòng 28–31):
- Giữ `nil` cho cả bốn trường `confirmationRate`, `deliveryRate`, `averageOrder`, `revenuePerPhone` khi JSON là `null`.
- `display()` đã in "—" cho `nil`.
- Khi xếp, `nil` nằm cuối như web.
- `DecodeSelfTest`: thêm một dòng có `averageOrder: null`.

### 2.10. Chữ khi trống, đúng nguyên văn web

`Terms.swift`, `MarketingRankTerms`: thay `empty` bằng hai hằng, chọn theo chế độ:
- Theo nhân viên: `Không có đơn gắn Marketer trong phạm vi đang chọn.`
- Theo team: `Không có team hoặc đơn Marketing trong phạm vi đang chọn.`

### 2.11. Chuyển sang "Theo team" khi đang xếp theo "Team Marketing"

`MarketingRank.swift`, `.onChange(of: team)`: nếu chuyển sang team mà cách xếp đang là `.team`, đặt về `.net` (Doanh thu). Web làm vậy ở `app/marketing-view.tsx`, nút Theo team.

### 2.12. Màu thanh trạng thái theo đúng màu `StatusChip`

`StaffDetail.swift`, `statusColor`:
- Lấy màu từ `StatusChip` cho một mã đại diện của nhóm: new→0, confirmed→1, shipping→2, delivered→3, returned→4, cancelled→6.
- Nếu `StatusChip` chưa có hàm màu dùng chung, tách ra một hàm `static func tint(code:)` trong `Shared.swift` và dùng ở cả hai nơi.
- `StatusChip` trên thẻ đơn chuyển lên hàng 1, cùng `#mã đơn`, `PosBadge`, giờ (`giao.md` 6.2 mục 6).

## 3. Phạm vi file

| Bước | Được sửa |
|---|---|
| `S1W` | `app/api/reports/staff-detail/route.ts`, `lib/staff-detail.ts`, `tests/staff-detail.test.ts` |
| `S1I` | `ios/Megatech/Megatech/{StaffDetail,MarketingView,MarketingRank,Terms,CskhViews,Tabs,DecodeSelfTest,Shared}.swift`, `.github/workflows/ios-preview.yml` |

Không sửa file nào khác. Không đổi số bản (vẫn 0.11 / 11). Không migration, không đổi `WORLD_VERSION`.

## 4. Máy kiểm

- `S1W`: `pnpm typecheck`, `pnpm test` (ngoài sandbox). Test mới của mục 1.1–1.5 phải có trong `tests/staff-detail.test.ts` và đạt.
- `S1I`:
  - workflow `iOS` xanh;
  - `iOS preview` xanh trên commit cuối;
  - `14-mkt-xep-khoa.png` thấy ba lựa chọn xám.
- Nếu demo đã có API (precheck trả 400, `NV=1`): đoạn 14 phải xanh với các kiểm `loc` mới.
  - Nếu demo vẫn trả 404: `::warning::demo:` vẫn coi là xanh.

## 5. Tóm tắt khi xong

Theo mẫu `giao.md` mục 12. Thêm một dòng cho mỗi mục 1.1–1.5 và 2.1–2.12: đã sửa ở file nào, test hay ảnh nào chứng minh. Không ghi số thật.
