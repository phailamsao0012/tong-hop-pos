# Plan: cột "Đã XN kho" — tìm bước kho gọi khách xác nhận (15/10/2026)

Tổ web tổng viết, Codex làm, Tổ web tổng xem kết quả.

## 1. Mục tiêu

Anh Vũ 15/10: Sale bấm **Chờ xác nhận** là đơn đã chốt. Sau đó **kho còn một bước gọi khách xác nhận**. Cột "Đã XN kho" ở bảng Từng nhân viên phải đếm bước kho này. Nếu dữ liệu không ghi lại được bước đó thì đổi cột thành **Đang đóng hàng**.

Bước này (R1) chỉ **đọc dữ liệu thật để tìm** bước kho được ghi ở đâu. Sửa cột là bước sau, tổ viết khi đã có kết quả R1.

## 2. Hiện trạng

- `raw_pos_orders.first_confirmed_at/by` = lần đầu đơn vào trạng thái 1 "Đã xác nhận" và người chuyển (`lib/sync.ts`, `status_history` của Pancake).
- Từ 15/10, `whConfirmed` chỉ đếm đơn có `first_confirmed_by` khác `seller_id` (`app/api/reports/product-groups/route.ts`). Trên web thật, mọi Sale ra 0%: người chuyển sang Đã xác nhận gần như luôn là chính Sale. Vậy bước kho gọi khách **không** phải lúc chuyển sang trạng thái 1.
- Dữ liệu có sẵn trên mỗi đơn: `status_history_json` (old_status, status, editor_id, updated_at), `tags_json` (id, name), `sub_status`, `last_editor_id`, `creator_id`, `care_id`, `note`, `raw_json` (JSON gốc của Pancake, có thể có `histories`: lịch sử sửa đơn, ai sửa trường nào).
- `pos_users(pos_id, user_id, name)`: tên người có hậu tố bộ phận (SALE, CSKH, MKT…). Người kho / vận đơn có thể có hậu tố khác.
- Mã trạng thái: `lib/pancake.ts` (0 Mới, 17 Chờ xác nhận, 1 Đã xác nhận, 11 Chờ hàng, 12 Chờ in, 13 Đã in, 20 Đã đặt hàng, 8 Đang đóng hàng, 9 Chờ chuyển hàng, 2 Đã gửi hàng, 3 Đã nhận…).

## 3. Không được đổi

Không đổi code web, số liệu hay giao diện ở bước này. Không ghi gì vào web thật. Chỉ thêm job đọc.

## 4. Thiết kế R1

Job GitHub `.github/workflows/doc-kho-1510.yml`:
- Chạy khi đẩy lên nhánh `codex/doc-kho-1510` (và `workflow_dispatch`). Dùng secret `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` như `deploy.yml`.
- Chạy `pnpm exec wrangler d1 execute DB --remote --json --file scripts/doc-kho/<x>.sql > <file tạm>` cho từng câu, rồi `node scripts/doc-kho/tom-tat.mjs <các file tạm>` in bảng tỉ lệ ra log và `$GITHUB_STEP_SUMMARY`.
- Phạm vi: đơn chốt (`status_code NOT IN (0,6,7)`) có `first_closed_at` trong 7 ngày gần nhất, mọi POS. Lọc theo `first_closed_at` để dùng chỉ mục. Không quét cả bảng.

Mỗi câu SQL trả số **đếm gộp**; `tom-tat.mjs` đổi ra **%** (làm tròn 1 chữ số) trước khi in, không in số tuyệt đối. Nhãn người chỉ là **loại**, tính trong SQL:
`chính Sale của đơn` (= seller_id), `CSKH của đơn` (= care_id), `người khác hậu tố SALE`, `… CSKH`, `… MKT`, `… <hậu tố khác>` (hậu tố = từ cuối tên viết hoa, chỉ in khi là chữ in hoa không dấu ≤ 8 ký tự và có ≥ 2 người dùng; còn lại gộp "người khác, không hậu tố"), `không rõ` (không có trong pos_users hoặc rỗng).

Cần trả lời (mỗi mục một bảng):
1. **Chuyển trạng thái:** mỗi cặp `old→new` trong `status_history_json` chiếm bao nhiêu % số lần chuyển; với từng cặp, % theo loại người chuyển. Chú ý cặp 0→17, 17→1, 0→1, 1→8, 17→8, 1→11/12/13/20.
2. **Đường đi:** % đơn có vào 17; % đơn có vào 1; % đơn vào 1 mà không qua 17; % đơn qua 8 (Đang đóng hàng) trở đi.
3. **Khoảng cách giờ** 17→1 và 1→8: trung vị và phân vị 90 (phút) — đây là số thời gian, không phải số đơn, được in.
4. **sub_status:** % theo từng giá trị.
5. **Thẻ đơn:** tên thẻ có trên ≥ 3% đơn chốt, % đơn có thẻ. Bỏ thẻ có chuỗi ≥ 6 chữ số.
6. **`raw_json.histories`:** % đơn có `raw_json`; trong các mục histories, % theo tên trường được sửa (hoặc khoá chính của mục) và theo loại người sửa. Chỉ in tên trường, không in giá trị.
7. **`last_editor_id`:** % theo loại người.
8. **Hậu tố có trong pos_users:** danh sách hậu tố đủ điều kiện ở trên, % người dùng mỗi hậu tố.

`tom-tat.mjs` có hàm thuần (xuất ra để test) đổi số đếm sang %, gộp nhãn, lọc thẻ có số. Test bằng dữ liệu giả trong `tests/doc-kho.test.ts`.

## 5. Các bước

**R1. Job đọc dữ liệu thật: bước kho gọi khách được ghi ở đâu**
- File được sửa: `.github/workflows/doc-kho-1510.yml` (mới), `scripts/doc-kho/**` (mới: các file `.sql`, `tom-tat.mjs`), `tests/**`.
- Xong khi: test của `tom-tat.mjs` qua (đổi % đúng, không in số tuyệt đối, thẻ có ≥ 6 chữ số bị bỏ, nhãn người đúng loại). Mọi file `.sql` chỉ có SELECT (WITH … SELECT được). Thử câu SQL trên D1 local (`pnpm db:migrate:local` rồi `wrangler d1 execute DB --local --file …`) chạy không lỗi. YAML hợp lệ, không in biến bí mật, không `set -x`, không tải artifact.

**R1B. Báo cáo không được hỏng cả bảng vì một bảng lỗi**
- Lượt chạy đầu (15/10 09:57Z): cả 8 câu SQL đọc được, nhưng `tom-tat.mjs` ném lỗi nên không in gì ("Không tạo được báo cáo"). Không biết bảng nào lỗi.
- File được sửa: `scripts/doc-kho/**`, `tests/**`.
- Sửa `renderReport`: dựng từng bảng trong `try/catch` riêng. Bảng lỗi thì in dòng `Bảng <tên bảng>: lỗi <thông điệp>`, chỉ khi thông điệp là một trong các câu cố định do chính script viết (danh sách hằng). Lỗi khác in `lỗi không rõ`. Không in dữ liệu, không in stack.
- Không ném lỗi vì dữ liệu lệch nhẹ: khoảng giờ âm (lịch sử lệch thứ tự) thì bỏ khỏi trung vị và ghi `% mẫu bị bỏ`; tổng cặp lệch thì vẫn in % theo tổng tính lại và ghi chú `tổng lệch`; n > total thì in `—`.
- `readD1Results` nhận cả khi mảng kết quả có nhiều phần tử: lấy phần tử cuối có `results`.
- Xong khi: test mới cho từng ca trên (một bảng lỗi thì bảy bảng kia vẫn in; khoảng âm bị bỏ; thông điệp lạ thành `lỗi không rõ`). Script vẫn thoát mã 0 khi in được ít nhất một bảng, để job xanh và đọc được summary.

**Kết quả R1 (job lượt 3, 15/10 15:23Z, sau R1B và R1C trên nhánh `codex/doc-kho-1510`)**
- 7 ngày gần nhất, đơn chốt mọi POS: lịch sử trạng thái gần như không có đơn nào đi qua Chờ xác nhận (17). Sale chuyển thẳng Mới → Đã xác nhận (1) cho phần lớn đơn.
- Bước đầu tiên kho làm và có ghi lại là **Đã xác nhận → Đang đóng hàng (8)**: phần lớn do người không có hậu tố SALE/CSKH/MKT (kho), trung vị khoảng 20 phút sau khi đơn vào Đã xác nhận.
- Không có dấu vết riêng cho bước "kho gọi khách": `sub_status` gần như trống, không có thẻ đơn kiểu "đã gọi", `raw_json` không còn `histories`.
- Kết luận theo lời anh Vũ ("không truy xuất được thì thay bằng cột Đang đóng hàng"): làm R2.

**R2. Đổi cột "Đã XN kho" thành "Đang đóng hàng"**
- Nhánh: `codex/xn-kho-r2` (tạo từ nhánh demo). Không đẩy vào nhánh demo hay main; Tổ web tổng lo đưa lên demo.
- File được sửa: `lib/van-don.ts`, `app/api/reports/product-groups/route.ts`, `app/product-group-blocks.tsx`, `lib/demo/**`, `tests/**`. Bước này **được đổi code web** (mục 3 chỉ áp cho R1).
- Định nghĩa mới, viết một lần trong `lib/van-don.ts`: `PACKED_SQL(a = 'o')` và bản TS `isPacked(o)`. Đơn chốt "đã vào Đang đóng hàng" khi:
  - trạng thái hiện tại thuộc 8 Đang đóng hàng, 9 Chờ chuyển hàng, 2 Đã gửi hàng, 3 Đã nhận, 16 Đã thu tiền, 4 Đang hoàn, 15 Hoàn một phần, 5 Đã hoàn; hoặc
  - trạng thái hiện tại là 6 Đã hủy và `status_history_json` có một mục `status` = 8 (dùng `json_each` chỉ trong nhánh status 6, để không đọc JSON của mọi đơn).
- API `/api/reports/product-groups`:
  - Thêm cho từng người và dòng tổng: `packed` (số đơn), `packedRate` (= packed ÷ closed × 100, null khi closed = 0), `confirmedNotPacked` (trạng thái 1, 11, 12, 13, 20), `cancelledBeforePack` (6 mà không thỏa PACKED). Chờ xác nhận dùng lại `waiting`.
  - Thêm `definitions.packed`: "Đang đóng hàng = trong số Đơn chốt ở cột bên cạnh, bao nhiêu đơn đã được kho chuyển sang Đang đóng hàng (kể cả đơn đã đi tiếp: chờ chuyển, đã gửi, đã nhận, hoàn). Tỷ lệ = Đang đóng hàng ÷ Đơn chốt. Dữ liệu Pancake không ghi riêng bước kho gọi khách, nên đây là bước kho đầu tiên đo được."
  - Thêm `?packed=1` cho danh sách đơn chi tiết (giống `?wh=1` hiện có, cùng bộ lọc).
  - **Giữ nguyên** `whConfirmed`, `whRate`, `selfConfirmed`, `unknownConfirmer`, `?wh=1` và định nghĩa cũ: app iPhone/Android đang đọc các trường này. Không đổi nghĩa trường cũ.
- Giao diện `app/product-group-blocks.tsx` (bảng Từng nhân viên ở trang Sale và CSKH):
  - Cột "Đã XN kho" đổi thành **"Đang đóng hàng"**, title "Đơn chốt kho đã chuyển sang Đang đóng hàng (hoặc đã đi tiếp)", sắp xếp theo `packedRate`.
  - Ô từng người: % lớn, dòng nhỏ "x/y đơn chốt"; bấm số mở danh sách đơn `?packed=1`, giữ bộ lọc như ô cũ. Tiêu đề danh sách "đơn chốt đã vào Đang đóng hàng".
  - Bảng "Vì sao" của ô: Đã vào Đang đóng hàng hoặc đi tiếp; Còn Đã xác nhận, chưa đóng; Còn Chờ xác nhận; Hủy trước khi đóng; Khác (phần còn lại, chỉ hiện khi > 0). Định nghĩa lấy từ `definitions.packed`.
  - Dòng Tổng dùng `packed`/`packedRate`. Các chỗ khác trên web còn chữ "XN kho" trong bảng này đổi theo.
- Demo (`lib/demo/**`): đơn giả phải cho ra tỉ lệ Đang đóng hàng khác nhau giữa các người (không phải toàn 0% hay toàn 100%), có ít nhất một đơn hủy sau khi đã vào 8. Tăng `WORLD_VERSION` nếu đổi dữ liệu giả.
- Xong khi:
  - Test `isPacked` và `PACKED_SQL` cho đủ ca: 8, 9, 2, 3, 16, 4, 15, 5 tính; 1, 11, 12, 13, 20, 17 không tính; 6 có lịch sử vào 8 thì tính, 6 không có thì không; lịch sử JSON hỏng không lỗi.
  - Test API trên D1 giả: `packed`, `packedRate`, `confirmedNotPacked`, `cancelledBeforePack` đúng; các trường cũ (`whConfirmed`…) giữ nguyên giá trị như trước khi sửa; `?packed=1` chỉ trả đơn thỏa PACKED.
  - `pnpm typecheck`, `pnpm test`, `pnpm build` qua; `pnpm lint` không thêm lỗi.
  - Chạy `pnpm dev` với `DEMO_MODE=1`, mở trang Sale và CSKH, chụp ảnh bảng Từng nhân viên (máy tính và điện thoại) để Tổ web tổng xem.

## 6. Sau R1

Script đẩy `codex/doc-kho-1510` → job chạy trên GitHub. Tổ web tổng đọc bảng tỉ lệ một lần, rồi viết bước R2: hoặc cột tính theo bước kho tìm được, hoặc đổi thành "Đang đóng hàng". R2 làm trên nhánh demo như thường, anh xem demo rồi mới lên web thật. Xong việc thì xoá nhánh `codex/doc-kho-1510` và các lượt chạy job.

## 7. Khối lệnh trên Mac (anh dán một lần)

```
mkdir -p ~/codex-viec/xn-kho-1510 && cd ~/Projects/tong-hop-pos && git fetch -q origin claude/project-thread-3ujeoc && git worktree add -B codex/doc-kho-1510 ~/Projects/thp-xnkho origin/claude/project-thread-3ujeoc && cd ~/Projects/thp-xnkho && pnpm install --frozen-lockfile && (nohup caffeinate -is bash docs/plans/2026-10-15-xn-kho/chay-lien-mach.sh codex > ~/codex-viec/xn-kho-1510/chay.log 2>&1 &)
```

Script tự bật báo Telegram ("🤖 CODEX | Web Đã XN kho …"): bắt đầu, 20 phút một tin, xong, dừng giữa chừng.
