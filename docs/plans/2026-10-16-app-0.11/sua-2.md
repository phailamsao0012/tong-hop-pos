# App iPhone 0.11, lượt sửa S2 (nhỏ, sau khi tổ app kiểm S1)

Tổ app viết, 16/10/2026. Codex trên PC làm, như `giao.md` và `sua-1.md`. Mọi luật cũ vẫn giữ.

Tổ app đã kiểm S1 (`ea7c8a0`, `c6695ce`):
- 17 mục đều đã sửa đúng.
- Đoạn 14 chạy đủ phần chi tiết nhân viên; số app khớp API.

Còn hai lỗi nhỏ ở lượt quay và hai lỗi nhỏ ở API. Trang trên app không đổi.

## 0. Cho thread PC

- Worktree `C:\Users\PC\Projects\thp-app011`, nhánh máy `codex/app-0.11`.
  - Trước khi chạy: `git fetch origin claude/project-thread-avd7td` rồi `git merge --ff-only FETCH_HEAD`.
  - Đẩy fast-forward lên `claude/project-thread-avd7td`.
- **Hai bước:** `S2W` (web), rồi `S2I` (chỉ `.github/workflows/ios-preview.yml`, không sửa Swift).
  - `S2W`: máy kiểm chạy `pnpm typecheck` và `pnpm test` ngoài sandbox.
  - `S2I`: đẩy, chờ `iOS` rồi `iOS preview` trên commit cuối.
- Đỏ thì một vòng sửa với annotation `::error::`, tối đa 4 vòng mỗi bước.
- Xong: Claude PC kiểm một lần, báo điều phối kèm commit cuối. Không merge, không phát hành.

## 1. `S2W`: API `/api/reports/staff-detail`

File: `app/api/reports/staff-detail/route.ts`, `tests/staff-detail.test.ts`.

### 1.1. Cờ ẩn "Số chia" phải đóng chặt khi không có dòng tổng quan

**Lỗi.**
- Khi tổng quan không có dòng của người đó (`row` rỗng), cờ ẩn lấy phòng ban từ câu `pos_users` đã lọc theo POS và team (mục 1.4 của S1).
- Một nhân viên phòng CSKH có thể không có dòng `pos_users` ở POS đang chọn. Khi đó câu trả `null`, cờ thành `false`, và người không phải owner/director thấy số chia của nhân viên CSKH.

**Sửa.**
- Giữ nguyên `person` (tên trả về vẫn lọc theo POS và team).
- Riêng cho cờ ẩn: khi `!assignedVisible` và không có `row`, đọc phòng ban **không lọc** bằng `SELECT MAX(department) AS department FROM pos_users WHERE user_id=?`. Phòng ban này **không** đưa vào JSON.
```ts
const hideDept = !assignedVisible && !row
  ? (await env.DB.prepare('SELECT MAX(department) AS department FROM pos_users WHERE user_id=?').bind(sellerId).first<{department: string | null}>())?.department ?? ''
  : '';
const assignedHidden = !assignedVisible && (row ? Boolean(row.assignedHidden) : /cskh|chăm sóc/i.test(hideDept));
```

**Test mới.**
- Dựng một người có phòng ban `CSKH`, có đơn ở POS A, nhưng dòng `pos_users` chỉ ở POS B.
- Tên người đó không có hậu tố tính doanh số, để tổng quan không có dòng của họ.
- Đăng nhập staff với `views:['cskh-overview']`, gọi `posIds=A&rateBase=assigned`.
- Kỳ vọng:
  - `base.kind === 'created'`;
  - `summary === null` hoặc `summary.assignedPhones === null`;
  - `person.department === null` (tên vẫn không lộ).

### 1.2. Ghi chú chỉ có xuống dòng, tab hoặc dấu cách cứng vẫn che ghi chú thật

**Lỗi.** Hàm `TRIM(message)` của SQLite chỉ bỏ dấu cách thường. Một ghi chú `'\n'` hay `'\t '` mới hơn vẫn được chọn là ghi chú mới nhất, và che mất ghi chú có chữ cũ hơn.

**Sửa.**
- Trong câu con: `TRIM(message, ' '||char(9)||char(10)||char(13)||char(160))<>''`.
- Ở JS: chỉ trả `customerNote` khi `n.message.trim()` khác rỗng.

**Test mới.** Thêm vào ca có sẵn của mục 1.1 (S1) ba ghi chú mới hơn: `'\n'`, `'\t '`, `'\u00a0'`. Kỳ vọng `customerNote.text` vẫn là ghi chú có chữ cũ hơn.

## 2. `S2I`: lượt quay đoạn 14

File: `.github/workflows/ios-preview.yml`, chỉ đoạn 14.

### 2.1. Gọi API đồng bộ làm ảnh chụp trễ một mốc

**Lỗi.**
- Lệnh `curl` trong vòng `stages14` chạy đồng bộ ngay sau ảnh chụp. App không chờ workflow, nên vòng sau chụp trễ.
- Ví dụ: ảnh `14-mkt-pos.png` của lượt `38875156616` đã là trạng thái "Xếp theo: Doanh thu" (mốc sau).
- Ảnh `14-mkt-xep-doanh-thu.png` thì thấy hộp "Xếp theo" đang trượt lên.
- Video không sao. Chỉ ảnh làm bằng chứng bị lệch.

**Sửa.**
- Chạy mỗi `curl` trong vòng ở **nền** (`&`).
- Ghi PID và nhãn lỗi vào mảng, ví dụ `pids14+=($!)` và `labels14+=("không lấy được JSON xếp hạng")`.
- Đường dẫn overview cho NV vẫn tính bằng Python ngay trong vòng (nhanh); chỉ hai `curl` chạy nền.
- Sau `stop; mark "het-14"` và **trước** khối Python:
```bash
for i in "${!pids14[@]}"; do
  wait "${pids14[$i]}" || { echo "::error::14-mkt-nv: ${labels14[$i]}"; exit 1; }
done
```
- Không in đường dẫn hay JSON; file vẫn chỉ ở `$RUNNER_TEMP`.

### 2.2. Số dòng log phải đếm cùng một cách ở bash và Python

**Lỗi.** Bash đặt tên file theo `grep -n` (chỉ đếm `\n`). Python lại tra bằng `read_text().splitlines()`, hàm này còn tách theo `\r`, `\x0b`, `\x0c`, `\x1c`–`\x1e`, `\x85`, U+2028, U+2029. Nếu log có các ký tự đó, hai bên lệch số dòng.

**Sửa.**
- Trong khối Python của đoạn 14, đọc log bằng `open(path, encoding='utf-8', newline='').read().split('\n')` thay cho `read_text().splitlines()`.
- Bỏ phần tử rỗng cuối nếu có. Không đổi gì khác.

## 3. Phạm vi file

| Bước | Được sửa |
|---|---|
| `S2W` | `app/api/reports/staff-detail/route.ts`, `tests/staff-detail.test.ts` |
| `S2I` | `.github/workflows/ios-preview.yml` (chỉ đoạn 14) |

Không sửa Swift, không đổi số bản (0.11 / 11), không migration, không đổi `WORLD_VERSION`.

## 4. Máy kiểm

- `S2W`: `pnpm typecheck`, `pnpm test` ngoài sandbox, test mới đạt.
- `S2I`: `iOS` và `iOS preview` xanh. Đoạn 14 chạy `NV=1` (demo đã có API).
  - `14-mkt-pos.png` phải là trang Marketing đã chọn một POS, chưa cuộn tới "Tách theo".
  - `14-mkt-xep-doanh-thu.png` phải là "Tách theo" xếp theo Doanh thu, chưa có hộp "Xếp theo".

## 5. Tóm tắt khi xong

Ghi thêm vào `ket-qua.md`: mỗi mục 1.1, 1.2, 2.1, 2.2 sửa ở đâu, test hay ảnh nào chứng minh. Không ghi số thật.
