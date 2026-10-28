# Giao việc bản 3: lệnh Zalo dễ hiểu, khoảng thời gian, KPI team, báo cáo tuỳ chỉnh có ảnh (28/10/2026)

Viết trên Mac (thread "Làm trang giao việc cho leader"). Nối tiếp bản 2 (`docs/plans/2026-10-26-giao-viec-leader/plan.md`, đã lên web thật qua PR #91, #93, #95, #98).
Quy trình (AGENTS.md, luật 15/10): Codex làm từng bước, máy kiểm sau mỗi bước, Claude kiểm một lần cuối. **Không lên demo** (anh 27/10: tốn Cloudflare); kiểm bằng `pnpm dev` + `DEMO_MODE=1` trên máy. Lên web thật khi anh ok, sao lưu D1 trước vì có migration.

## 1. Lời anh (nguyên văn, 28/10/2026)

- 08:16Z: "muốn làm 1 số lệnh thống nhất, dễ hiểu hơn đi, như này người mới sẽ khó hiểu, lệnh cứ v12 v13 là gì họ sẽ k hiểu".
- 08:19Z (ảnh khung "Giao việc cho leader"): "phải cho chọn khoảng thời gian, từ ngày nào đến ngày nào, thêm 1 phần chi tiết nữa nếu muốn thêm giờ thì tích vào ô chọn giờ".
- 08:24Z: "có 1 phần là set kpi, kpi có kpi về doanh thu, kpi trung bình đơn, kpi tỉ lệ chốt, kpi tất cả mọi thứ, và nó áp vào team trên web luôn ... báo cáo 8h sáng hằng ngày cho các đầu lead, báo cáo toàn bộ tình hình của team người đó nắm về zalo, ... 1 file mô típ báo cáo dễ đọc, dễ hiểu, dễ hình dung, tăng trưởng so với hôm qua hay k, so với tuần trước hay k, rồi báo cáo đấy phải cho tôi set, báo cáo lúc nào, báo cáo lặp lại hay k, báo cáo tùy chỉnh, báo cáo những gì, yêu cầu làm 1 trang để setting cái đấy cho tôi".
- 08:44Z trả lời 3 câu hỏi:
  1. Kỳ KPI: "tôi sẽ tự chọn, bạn cho tôi các tùy chọn ấn nhanh, và cả tùy chọn thủ công".
  2. "KPI này là cho cả team, còn lại lead sẽ chia nhân sự nào đó là việc của lead".
  3. Ảnh: "có ảnh càng tốt".

## 2. Mục tiêu (4 phần, làm theo 5 bước G1 → G5)

| Phần | Nội dung | Bước |
|---|---|---|
| A | Khoảng thời gian khi giao việc: từ ngày → đến ngày, tích "Chọn giờ" thì có giờ | G1 (dữ liệu) + G3 (giao diện) |
| B | Lệnh Zalo dễ hiểu: bot hỏi kèm số chọn, hiểu chữ thường ngày, "menu", giao việc kiểu hỏi đáp | G2 |
| C | KPI cho cả team, nhiều chỉ tiêu, kỳ tự chọn; áp lên trang team trên web | G1 (dữ liệu) + G3 (giao diện) |
| D | Trang "Cài đặt báo cáo": nhiều mẫu, giờ gửi, lặp lại, so sánh, chọn mục; báo cáo gửi Zalo có ảnh | G4 (chữ) + G5 (ảnh) |

Mẫu báo cáo: `mau-bao-cao.md` và `mau-bao-cao.png` cùng thư mục. **Anh duyệt ảnh mẫu 28/10 10:20Z ("ok hình ổn đấy").**

## 3. Không được đổi

- Số liệu, cách tính, tên số, quyền xem các trang khác. Mọi số trong KPI và báo cáo lấy từ `overviewReport` (`lib/overview-report.ts`), không viết câu tính doanh số mới. Số Zalo phải trùng ô tương ứng ở trang Tổng quan Sale/CSKH khi lọc đúng team và đúng ngày.
- Bảng `targets` (KPI tháng hiện có, `app/targets-panel.tsx`, `app/team-kpi-progress.tsx`, `/api/targets`): không đổi cấu trúc, không đổi cách tính. Chỉ được **ghi thêm** dòng scope `team` khi KPI kỳ trọn tháng (mục 6.3).
- `WORLD_VERSION`, `*_EPOCH`, `wrangler*.json*` (cron mỗi phút có sẵn, không thêm cron), `.github/**`, `scripts/**`, `lib/auth.ts`, `drizzle/meta/**`, `db/schema.ts`.
- Lệnh Zalo cũ (`V12 nhan`, `H5 co`…) vẫn chạy (người đã quen).
- Không đụng `lib/zalo-poll.ts` / `pollZaloUpdates` (vừa sửa xong ở #98) trừ khi bước ghi rõ.
- Repo công khai: không tên thật, không số thật, không token.
- Chi phí Cloudflare: không thêm câu đọc nặng chạy mỗi phút; mục 9 là ước tính phải giữ.

## 4. Hiện trạng (main c20b179)

- `drizzle/0047_giao_viec_zalo.sql`: `zalo_contacts`, `zalo_tasks` (có `due_date` YYYY-MM-DD, **chưa có ngày bắt đầu, chưa có giờ**), `zalo_task_events`, `zalo_meetings`, `zalo_meeting_invites`, `zalo_pair_codes`.
- `lib/zalo-work.ts`: `parseCommand` (dòng ~38), `handleZaloUpdate` (~197), `formatTaskMessage`, `formatHelp`, `formatList`, `formatMorning`, `formatSlotReport`, `DEFAULT_ZALO_SETTINGS` (~276), `readZaloSetting` / `writeZaloSetting` (khoá trong `app_settings`).
- `lib/zalo-tick.ts`: `maybeZaloTick` chạy mỗi phút, đọc một dòng `app_settings` gộp; bản tin 8h (`formatMorning`), báo 12h/17h/22h (`formatSlotReport`), nhắc quá hạn, báo thiếu số, nhắc họp. `zaloTeamSnapshot(leader, day)` gọi `overviewReport` theo team web nhân sự (`resolveHrUnit`).
- `lib/zalo.ts`: `call(token, method, body)`, `sendZalo`, `createZaloSender`, `deleteWebhook`, `pollZaloUpdates`.
- Web: `app/giao-viec-view.tsx` (Tổng quan, Sheet giao việc: Hôm nay / Mai / Cuối tuần / Không hạn + `Input type=date`), `app/giao-viec-hop-view.tsx`, `app/giao-viec-zalo-view.tsx` (Danh bạ + Cài đặt thông báo), `app/giao-viec-ui.tsx`. API `app/api/giao-viec/**`.
- `targets`: (`month`, `scope` pos|employee|team, `ref_id`, `revenue`, `closed_orders`, `working_days`). Team KPI hiện chỉ có doanh thu + đơn chốt, theo tháng.
- `overviewReport` cho mỗi kỳ: `closedNet` (doanh thu), `closedOrders`, `averageOrder` (GTTB), `closeRate`, `assignedOrders` (số được chia), `assignedCloseRate`, `customers`/`closedCustomers`, `groups.returned` / `cancelRatio` / `returnRatio`, `byEmployee`.
- Zalo Bot API có `sendPhoto { chat_id, photo, caption }` (caption 1–2000 ký tự); tài liệu chỉ ghi `photo` là "đường dẫn ảnh", **chưa rõ** có nhận URL công khai hay không → G5 thử trước (mục 8.1).

## 5. Phần A: khoảng thời gian khi giao việc

### 5.1 Dữ liệu (G1)

Migration mới `drizzle/0048_giao_viec_v3.sql` (chỉ THÊM, không đổi/xoá):

```sql
ALTER TABLE `zalo_tasks` ADD `start_date` text;   -- YYYY-MM-DD giờ VN, NULL = như cũ (tính từ ngày tạo)
ALTER TABLE `zalo_tasks` ADD `start_time` text;   -- HH:mm, NULL = không chọn giờ
ALTER TABLE `zalo_tasks` ADD `due_time` text;     -- HH:mm, NULL = hết ngày due_date
```

- `due_date` giữ nguyên nghĩa "đến ngày". Việc cũ: `start_date` NULL → coi là ngày tạo.
- Ràng buộc (kiểm ở `lib/zalo-work.ts`, không dùng CHECK SQL): `start_date <= due_date`; có giờ thì phải có cả hai giờ và nếu cùng ngày thì `start_time < due_time`; giờ đúng dạng `HH:mm`, phút chia hết 15.
- `taskState`: quá hạn khi `now > due_date + due_time` (giờ VN); không có giờ thì sau 23:59 ngày `due_date` như cũ.
- Lọc theo tuần/tháng (`listTasks`): việc hiện ở kỳ nếu **khoảng [start, due] giao với kỳ** (việc không hạn: theo ngày tạo như cũ). Câu SQL dùng chỉ mục sẵn có `idx_zalo_tasks_assignee`; bảng nhỏ (vài nghìn dòng), không thêm chỉ mục.

### 5.2 Giao diện (G3) — Sheet "Giao việc cho leader" và Sheet chi tiết việc

```
Thời gian
[Từ ngày  28/10/2026 ▾]  →  [Đến ngày  30/10/2026 ▾]
(Hôm nay) (Mai) (Cuối tuần) (Cuối tháng) (Không hạn)      ← nút nhanh, đặt "Đến ngày"; "Không hạn" làm mờ ô Đến ngày
☐ Chọn giờ
   [08:00 ▾]  →  [17:00 ▾]                              ← chỉ hiện khi tích; NativeSelect 06:00–22:00 bước 15 phút
```

- Ngày dùng `Input type="date"` (đã dùng sẵn), hiển thị lại dạng `dd/mm` ở mọi chỗ khác.
- Giờ dùng `NativeSelect` (không `type=time`, tránh AM/PM).
- Lỗi nhập hiện ngay dưới ô (chữ đỏ nhỏ), nút "Giao việc và gửi Zalo" bị khoá tới khi hợp lệ.
- Bảng "Danh sách việc": cột "Hạn" đổi thành "Thời gian": `28/10 → 30/10`, có giờ thì `28/10 08:00 → 30/10 17:00`; một ngày thì `30/10 08:00–17:00`; vẫn có "Hôm nay"/"Mai" và chip Quá hạn.
- Tin Zalo: `Thời gian: Thứ Ba 28/10 08:00 → Thứ Năm 30/10 17:00`.

## 6. Phần C: KPI cho cả team

### 6.1 Dữ liệu (G1)

Trong cùng `0048`:

```sql
CREATE TABLE IF NOT EXISTS `team_kpis` (
  `id` text PRIMARY KEY NOT NULL,
  `team_id` text NOT NULL,          -- mã team web nhân sự (giống zalo_contacts.team_id, targets.ref_id scope team)
  `dept` text NOT NULL,             -- 'sale' | 'cskh'
  `period_start` text NOT NULL,     -- YYYY-MM-DD giờ VN
  `period_end` text NOT NULL,       -- YYYY-MM-DD giờ VN, >= period_start, tối đa 366 ngày
  `metrics` text NOT NULL,          -- JSON { [metricKey]: number }
  `note` text NOT NULL DEFAULT '',
  `created_by` text NOT NULL,       -- users.id
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL,
  `cancelled_at` text
);
CREATE INDEX IF NOT EXISTS `idx_team_kpis_team` ON `team_kpis` (`team_id`, `period_end`);
```

Danh sách chỉ tiêu (`lib/team-kpi.ts`, hằng `KPI_METRICS`), mỗi chỉ tiêu có: khoá, tên hiện, đơn vị, hướng tốt (cao/thấp), hàm lấy số thực từ `overviewReport().current.total`:

| Khoá | Tên | Đơn vị | Lấy từ | Hướng |
|---|---|---|---|---|
| `revenue` | Doanh thu | đ | `closedNet` | cao |
| `closedOrders` | Đơn chốt | đơn | `closedOrders` | cao |
| `averageOrder` | Giá trị trung bình đơn (GTTB) | đ | `averageOrder` | cao |
| `closeRate` | Tỉ lệ chốt | % | `closeRate` (CSKH: `assignedCloseRate` khi trang CSKH đang dùng nó; theo đúng `rate` của "Cách tính") | cao |
| `assignedOrders` | Số được chia | số | `assignedOrders` | cao |
| `closedCustomers` | Khách chốt | khách | `closedCustomers` | cao |
| `returnRatio` | Tỉ lệ hoàn | % | `returnRatio` | thấp |
| `cancelRatio` | Tỉ lệ huỷ | % | `cancelRatio` | thấp |

Chỉ tiêu nào để trống thì không đặt. Thêm chỉ tiêu sau này = thêm một dòng vào hằng số.

### 6.2 Cách tính tiến độ

- Số thực tế = `overviewReport({ start: period_start, end: min(period_end, hôm nay), team, unit })` (giống `zaloTeamSnapshot`).
- Chỉ tiêu cộng dồn (doanh thu, đơn, số chia, khách): `% đạt = thực tế / KPI`; "đúng tiến độ" = KPI × (số ngày đã qua / tổng số ngày kỳ); "cần mỗi ngày" = (KPI − thực tế) / số ngày còn lại.
- Chỉ tiêu tỉ lệ/trung bình (GTTB, tỉ lệ chốt, hoàn, huỷ): so thẳng giá trị kỳ với KPI; hướng "thấp" thì đạt khi ≤ KPI.
- Màu: đạt/vượt tiến độ xanh, chậm ≤ 10% cam, chậm > 10% đỏ.

### 6.3 Áp vào team trên web (G3)

- Tab mới **"KPI"** trong nhóm Giao việc (`app/giao-viec-kpi-view.tsx`, `?view=giao-viec-kpi`), cùng quyền như Giao việc (chủ hệ thống + người được giao việc).
  - Thanh trên: chọn team (Sale/CSKH, từ web nhân sự như ô Team), chọn kỳ:
    - nút nhanh: Hôm nay · Tuần này · Tuần sau · Tháng này · Tháng sau · Quý này;
    - thủ công: Từ ngày → Đến ngày.
  - Form chỉ tiêu: mỗi dòng một chỉ tiêu ở 6.1 (ô số, có đơn vị, gợi ý "tháng trước đạt …" lấy từ `overviewReport` kỳ trước cùng độ dài).
  - Nút "Lưu và gửi Zalo cho leader": lưu `team_kpis`, gửi tin cho leader team đó (nếu đã nối Zalo).
  - Danh sách KPI đang chạy và đã xong: bảng `tbl` mỗi dòng một team × kỳ, cột từng chỉ tiêu "thực tế / KPI (%)" có `ProgressBar`, nút Sửa / Huỷ (hộp xác nhận).
- **Trang Tổng quan Sale/CSKH** (`app/team-overview-view.tsx`), khi đang lọc một team: thêm thẻ "KPI team" ngay dưới thanh KPI tháng hiện có (dùng `LazyBlock` như các khối khác), hiện các KPI của team có kỳ giao với hôm nay. Không lọc team thì không hiện (tránh câu đọc nặng).
- KPI kỳ **trọn một tháng** (ngày 1 → ngày cuối): khi lưu, ghi thêm/ghi đè dòng `targets` (`month`, scope `team`, `ref_id`=team_id, `revenue`, `closed_orders`) để thanh KPI tháng sẵn có hiện cùng số. Kỳ khác tháng thì không chạm `targets`.
- API: `app/api/giao-viec/kpi/route.ts` GET (danh sách + tiến độ, chỉ các KPI còn chạy hoặc kết thúc trong 45 ngày), POST (tạo), PATCH (sửa), DELETE (huỷ mềm). Kiểm quyền bằng `bossRoute` như các route Giao việc.
- Zalo: leader gõ "kpi" (hoặc chọn trong menu) xem KPI team mình và tiến độ.

## 7. Phần B: lệnh Zalo dễ hiểu (G2)

Nguyên tắc: **bot hỏi, người trả lời bằng số hoặc chữ thường ngày**. Không ai phải nhớ "V12".

### 7.1 Trạng thái hội thoại

- Lưu một "câu bot vừa hỏi" cho mỗi chat: `app_settings` khoá `zalo_dialog:<contactId>` = JSON `{ kind, taskId?, meetingId?, options?, step?, draft?, expires }`, hết hạn sau 30 phút. (Không thêm bảng; ghi tối đa 1 dòng mỗi tin.)
- Tin đến được xử lý theo thứ tự: mã nối 6 số → lệnh cũ (`V12 …`, `H5 …`) → trả lời câu bot đang hỏi → từ khoá thường ngày → "menu" → không hiểu thì gợi ý.

### 7.2 Từ khoá thường ngày (bỏ dấu, không phân biệt hoa thường; `fold()` sẵn có)

| Ý | Chấp nhận |
|---|---|
| Đã nhận | `1` (khi đang hỏi trạng thái), `nhan`, `da nhan`, `ok`, `oke`, `nhan viec`, `👍` |
| Đang làm | `2`, `dang lam`, `dang trien khai`, `dang` |
| Xong | `3`, `xong`, `da xong`, `hoan thanh`, `done` |
| Chưa xong | `4`, `chua xong`, `chua` (+ lý do sau "vì"/":"/dấu cách; thiếu thì bot hỏi "Vì sao chưa xong?") |
| Tham gia họp | `1` (khi đang hỏi họp), `co`, `tham gia`, `di` |
| Không tham gia | `2`, `khong`, `khong di`, `ban` (+ lý do; thiếu thì hỏi) |
| Menu | `menu`, `?`, `hd`, `huong dan`, `help`, `bat dau` |

- Khi người dùng gõ "xong" mà đang có **một** việc mở → áp cho việc đó. Có **nhiều** việc mở → bot hỏi "Bạn báo xong việc nào?" kèm danh sách đánh số (tối đa 9, việc gần hạn trước), trả lời số là xong.
- Câu chứa "chưa", "không" đứng trước động từ thì không bị hiểu nhầm là xong/nhận (bài học bot order `aebdf2e`).

### 7.3 Mẫu tin mới

Giao việc (cho leader hoặc nhân viên):

```
📌 Việc mới từ anh Vũ
Chuẩn bị báo cáo team tuần
Thời gian: Thứ Ba 28/10 → Thứ Năm 30/10 17:00
⚡ Gấp
Nội dung: …

Trả lời 1 số:
1. Đã nhận
2. Đang làm
3. Xong rồi
4. Chưa xong (bot sẽ hỏi lý do)
(Việc số 12 · gõ "menu" để xem các việc khác)
```

Họp:

```
📅 Mời họp: Họp rà soát tuần
Thứ Hai 03/11 · 14:00 · Phòng họp tầng 2
Ghi chú: …

Trả lời 1 số:
1. Tham gia
2. Không tham gia (bot sẽ hỏi lý do)
```

Menu (leader; nhân viên không có mục 4–6):

```
Bạn muốn làm gì? Trả lời 1 số:
1. Việc của tôi
2. Báo cáo một việc
3. Lịch họp
4. Giao việc cho nhân viên
5. Thêm nhân viên
6. KPI team
```

Giao việc cho nhân viên (leader), hỏi đáp từng bước, mỗi bước có "0. Huỷ":

```
Giao cho ai?  1. Lan  2. Hùng  3. Mai
→ "2"
Việc gì? (gõ tên việc)
→ "Gọi lại 20 khách cũ"
Hạn khi nào?  1. Hôm nay  2. Mai  3. Cuối tuần  4. Không hạn  (hoặc gõ ngày, vd 30/10)
→ "3"
Giao cho Hùng: "Gọi lại 20 khách cũ", hạn Chủ nhật 02/11.
1. Giao   0. Huỷ
```

Thêm nhân viên: "Tên nhân viên?" → tên → bot tạo mã nối và nói "Gửi mã 123456 cho <tên>, bảo họ nhắn mã này cho bot".

Không hiểu: "Mình chưa hiểu 🙏 Gõ 'menu' để xem các việc bạn có thể làm." (không im lặng).

Tin báo cho sếp khi leader trả lời giữ như cũ nhưng viết thành câu: "Lan (Team Sói Xám) báo XONG việc: Chuẩn bị báo cáo team tuần".

### 7.4 Hướng dẫn khi nối

Sau khi nối mã, bot gửi: "Đã nối Zalo với hệ thống giao việc ✅. Khi có việc, mình sẽ nhắn kèm các lựa chọn, bạn chỉ cần trả lời bằng số. Gõ 'menu' bất cứ lúc nào." (Bỏ danh sách lệnh V12 dài.)

## 8. Phần D: báo cáo tuỳ chỉnh + trang cài đặt

### 8.1 Trang "Cài đặt báo cáo" (G4), tab mới trong Giao việc (`app/giao-viec-bao-cao-view.tsx`)

Danh sách mẫu báo cáo (thẻ), nút "+ Tạo báo cáo". Mỗi mẫu:

- **Tên** (vd "Báo cáo sáng cho leader").
- **Gửi cho**: Mỗi leader (báo cáo team của chính họ) · Sếp (anh Vũ, anh Nghĩa: báo cáo gộp mọi team) · Chọn người cụ thể.
- **Phạm vi số**: Hôm qua · Hôm nay tới lúc gửi · Khung giờ trước (vd 8–12h) · Tuần này tới hôm qua · Tháng này tới hôm qua.
- **Lúc gửi**: giờ (NativeSelect bước 15 phút).
- **Lặp lại**: Hằng ngày · Thứ 2–Thứ 7 · Chọn thứ (7 ô tích) · Hằng tuần vào thứ … · Ngày … hằng tháng · Một lần vào ngày ….
- **So sánh với** (tích nhiều): Hôm trước · Cùng ngày tuần trước · Tuần trước · Tháng trước.
- **Mục trong báo cáo** (tích, kéo để đổi thứ tự): Doanh thu · Đơn chốt · GTTB · Tỉ lệ chốt · Số được chia · KPI team (tiến độ, cần mỗi ngày) · Xếp hạng nhân viên (top 3 / cần kèm) · Nhân viên 0 đơn · Việc quá hạn / tới hạn · Lịch họp hôm nay · Theo khung giờ.
- **Dạng gửi**: Ảnh + chữ (mặc định) · Chỉ chữ.
- **Bật/tắt**.
- Nút **Xem trước** (hiện đúng ảnh + chữ với số thật của một team chọn) và **Gửi thử cho tôi** (gửi Zalo cho người đang đăng nhập nếu đã nối).

Mặc định tạo sẵn 4 mẫu tương đương hành vi hiện tại để không mất gì: "Bản tin 8h" (hôm qua, so hôm trước + cùng ngày tuần trước, có KPI, việc, họp), "Doanh số 12h/17h/22h" (3 mẫu khung giờ). Công tắc cũ trong "Cài đặt thông báo" (Bản tin 8h, Tổng hợp doanh số) được thay bằng liên kết "Chỉnh trong Cài đặt báo cáo"; báo thiếu số và nhắc họp giữ ở chỗ cũ.

Lưu: `app_settings` khoá `zalo_reports_v1` = JSON mảng mẫu (tối đa 30 mẫu). Lần gửi cuối mỗi mẫu lưu trong `zalo_tick_v1` hiện có (thêm trường `reports: { [id]: 'YYYY-MM-DD HH:mm' }`) để không thêm câu đọc mỗi phút.

### 8.2 Chạy báo cáo (G4) — `lib/zalo-reports.ts`

- `maybeZaloTick` đọc thêm `zalo_reports_v1` trong **cùng câu** gộp app_settings đang có (không thêm lượt đọc). Phút nào không có mẫu tới giờ thì thoát như cũ.
- Mẫu tới giờ: với mỗi người nhận → dựng `ReportData` (số kỳ, số các kỳ so sánh, KPI, xếp hạng, việc, họp) bằng `overviewReport` + câu đọc việc/họp sẵn có; gửi; ghi lần gửi.
- Giới hạn: tối đa 30 tin mỗi phút (giữ luật cũ), mẫu nào lỗi thì ghi log và đi tiếp.
- `formatReportText(data, template)`: chữ ≤ 2000 ký tự, mẫu ở `mau-bao-cao.md`.

### 8.3 Ảnh báo cáo (G5)

- **Bước thử trước tiên (bắt buộc, trước khi code ảnh):** route tạm `POST /api/giao-viec/zalo/test-photo` (chỉ chủ hệ thống) gửi `sendPhoto` cho chính người bấm với `photo` = URL công khai của một ảnh PNG tĩnh trong `public/`. Ghi kết quả (ok / mã lỗi / có hiện ảnh không) vào `ket-qua-may.md`. Nếu Zalo không nhận URL → dừng G5, báo lại (báo cáo vẫn chạy dạng chữ).
- Dựng ảnh: SVG từ `ReportData` (khổ 1080 × 1350, phông Inter có sẵn trong repo nếu có, không thì phông hệ thống sans), đổi sang PNG bằng `@resvg/resvg-wasm` trong Worker.
  - **Rủi ro kích thước Worker**: wasm ~2,5 MB. Kiểm `pnpm build` + `wrangler deploy --dry-run --outdir` báo kích thước gói sau nén; vượt 9 MB (giới hạn gói trả phí 10 MB) thì dừng, ghi lại. Chỉ nạp wasm bằng `import()` trong đường gửi báo cáo, không nạp ở trang web.
- Phát ảnh: route công khai `GET /api/zalo/report-image/<id>.png?sig=<HMAC>`; `sig` = HMAC-SHA256(token bot, id) như `webhookSecret`; ảnh lưu tạm trong `app_settings` khoá `zalo_img:<id>` (base64, ≤ 400 KB; xoá sau 2 ngày bởi tick). Cho qua lớp đăng nhập ở `worker.ts` giống `/api/zalo/webhook`. Đường dẫn ảnh dùng tên miền chính `https://tonghopposmegatech.io.vn` (không dùng workers.dev — bài học 5f66695).
- Gửi: `sendPhoto` (ảnh) + caption là bản chữ rút gọn ≤ 2000 ký tự. Lỗi ảnh → gửi bản chữ đầy đủ.

## 9. Ước chi phí Cloudflare

- D1 đọc: phút thường không đổi (vẫn 1 câu gộp). Mỗi lần gửi báo cáo: mỗi team ~3–5 lần `overviewReport` (kỳ + so sánh), ước < 50.000 dòng đọc/lần/team; 5 team × 4 mẫu/ngày ≈ < 1 triệu dòng/ngày. Thẻ KPI trên trang team chỉ chạy khi lọc một team và mở tới thẻ.
- D1 ghi: hội thoại Zalo ≤ 1 dòng/tin; ảnh ≤ 30 dòng/ngày; KPI vài dòng/tuần.
- CPU Worker: dựng ảnh ~200–500 ms/ảnh, chỉ khi gửi báo cáo (≤ 30 ảnh/lượt). Nếu CPU vượt giới hạn trong cron → giảm còn gửi ảnh cho sếp và leader lần lượt nhiều phút (ghi rõ trong code).
- Không thêm cron, không thêm binding (không R2/KV).

## 10. Các bước cho Codex

Mỗi bước: chỉ sửa đúng file liệt kê; `pnpm typecheck`, `pnpm test`, `pnpm lint` (không thêm lỗi), `pnpm build`; tóm tắt theo mẫu `CODEX.md` mục 10 (thư mục bản 2). Không commit/push (script hoặc Claude commit).

**G1. Dữ liệu: khoảng thời gian, KPI, hội thoại**
- File: `drizzle/0048_giao_viec_v3.sql` (mới), `lib/zalo-work.ts`, `lib/team-kpi.ts` (mới), `tests/zalo-work.test.ts`, `tests/team-kpi.test.ts` (mới), `tests/support/*`.
- Làm: migration 5.1 + 6.1; `createTask`/`editTask` nhận `startDate`, `startTime`, `dueTime` và kiểm ràng buộc; `taskState` theo giờ; `listTasks` lọc theo khoảng giao kỳ; `lib/team-kpi.ts`: `KPI_METRICS`, `saveTeamKpi`, `listTeamKpis`, `kpiProgress(kpi, report, today)` (thuần, test được), ghi `targets` khi kỳ trọn tháng.
- Test: việc có giờ quá hạn đúng phút; việc vắt tuần hiện ở cả 2 tuần; ràng buộc sai bị từ chối; tiến độ KPI cộng dồn và tỉ lệ (hướng thấp); kỳ trọn tháng ghi `targets`, kỳ lẻ không ghi; migration chạy lại không lỗi.

**G2. Lệnh Zalo dễ hiểu**
- File: `lib/zalo-work.ts`, `lib/zalo-dialog.ts` (mới), `tests/zalo.test.ts`, `tests/zalo-dialog.test.ts` (mới).
- Làm: mục 7 đầy đủ; mẫu tin 7.3; lệnh cũ vẫn chạy.
- Test (bằng payload đúng dạng Zalo thật có `result`): trả lời "1" sau tin giao việc → Đã nhận; "xong" khi 1 việc mở / khi 3 việc mở (bot hỏi chọn, trả "2" → đúng việc); "chưa xong" thiếu lý do → bot hỏi, trả lý do → lưu; "chưa xong vì thiếu số" một lần; "không ổn" không bị hiểu là nhận; họp "2" → hỏi lý do; leader giao việc hỏi đáp đủ 4 bước và "0" huỷ giữa chừng; hội thoại hết hạn 30 phút; tin lạ → gợi ý menu; `V12 xong` vẫn đúng; nhân viên không thấy mục leader.

**G3. Web: khoảng thời gian + KPI**
- File: `app/giao-viec-view.tsx`, `app/giao-viec-ui.tsx`, `app/giao-viec-kpi-view.tsx` (mới), `app/api/giao-viec/route.ts`, `app/api/giao-viec/**/route.ts` liên quan việc, `app/api/giao-viec/kpi/route.ts` (mới), `app/team-overview-view.tsx` (chỉ thêm thẻ KPI team), `app/team-kpi-card.tsx` (mới), `app/dashboard.tsx`, `lib/nav-structure.ts`, `lib/access.ts`, `lib/demo/zalo-work.ts`, `tests/*.test.ts`.
- Làm: 5.2, 6.3; dữ liệu demo có 2 KPI (một kỳ tuần, một kỳ tháng) và vài việc có giờ.
- Kiểm `pnpm dev` + `DEMO_MODE=1` ở 1280 và 390: chụp Sheet giao việc (có và không tích giờ), tab KPI, thẻ KPI trên Tổng quan Sale khi lọc 1 team.

**G4. Báo cáo tuỳ chỉnh (chữ) + trang cài đặt**
- Chỉ bắt đầu sau khi anh duyệt `mau-bao-cao.md`/`.png`.
- File: `lib/zalo-reports.ts` (mới), `lib/zalo-tick.ts`, `lib/zalo-work.ts` (chỉ settings/format), `app/giao-viec-bao-cao-view.tsx` (mới), `app/giao-viec-zalo-view.tsx` (thay 2 công tắc bằng liên kết), `app/api/giao-viec/bao-cao/route.ts` (mới, GET/PUT/POST preview/POST gửi thử), `app/dashboard.tsx`, `lib/nav-structure.ts`, `lib/access.ts`, `lib/demo/zalo-work.ts`, `tests/*.test.ts`.
- Test: lặp lại (hằng ngày / thứ 2–7 / chọn thứ / hằng tháng / một lần) đúng phút và chỉ một lần; so sánh hôm trước và cùng ngày tuần trước đúng số (fixture `overviewReport`); mục bỏ tích không xuất hiện; mỗi leader chỉ nhận team mình; sếp nhận bản gộp; 4 mẫu mặc định cho ra tin tương đương bản cũ; ≤ 2000 ký tự; câu đọc phút thường vẫn một câu.

**G5. Ảnh báo cáo**
- Bước 8.3 "thử trước" chạy được trên web thật chỉ khi anh cho phép (gửi 1 ảnh tĩnh cho anh). Không cho thì Codex chỉ làm phần dựng ảnh + test cục bộ, việc thử để Claude làm khi lên web thật.
- File: `lib/report-image.ts` (mới), `app/api/zalo/report-image/[id]/route.ts` (mới), `worker.ts` (chỉ thêm đường dẫn ảnh vào danh sách cho qua đăng nhập), `lib/zalo.ts` (thêm `sendZaloPhoto`), `lib/zalo-reports.ts`, `package.json` + `pnpm-lock.yaml` (thêm `@resvg/resvg-wasm`), `tests/report-image.test.ts` (mới).
- Test: SVG có đủ các mục đã tích; số định dạng Việt (45,2 tr; 31%); PNG dựng ra có kích thước 1080 × 1350; sig sai → 403; ảnh hết hạn → 404; gửi ảnh lỗi → gửi chữ.

## 11. Tiêu chí xong

- Giao một việc có khoảng ngày + giờ trên web → leader nhận tin có "Thời gian …" và 4 lựa chọn; trả "1" → web đổi "Đã nhận"; trả "4" → bot hỏi lý do → web hiện lý do; qua giờ kết thúc mà chưa xong → nhắc quá hạn.
- Người mới chỉ cần đọc tin bot là biết trả lời gì; gõ "menu" thấy bảng chọn; leader giao việc cho nhân viên bằng hỏi đáp.
- Đặt KPI tuần cho team → tab KPI và thẻ KPI trên Tổng quan Sale (lọc team đó) hiện thực tế/KPI/% đúng với số trang Tổng quan; KPI trọn tháng hiện luôn trên thanh KPI tháng cũ.
- Trang Cài đặt báo cáo tạo được mẫu với giờ, lặp lại, so sánh, mục; "Xem trước" và "Gửi thử" chạy; 8h sáng mỗi leader nhận báo cáo team mình (ảnh + chữ, hoặc chữ nếu Zalo không nhận ảnh).
- Không đổi số ở trang khác; test cũ vẫn qua.

## 12. Rủi ro và cách lùi

| Rủi ro | Cách xử lý |
|---|---|
| Zalo không nhận `photo` là URL | Bước thử 8.3 trước; không được thì báo cáo chỉ chữ, G5 dừng |
| Gói Worker vượt giới hạn vì wasm | Đo ở G5; vượt thì bỏ ảnh, giữ chữ |
| Cron mỗi phút bị chiếm giờ (đã từng làm "0/6 POS" ngày 28/10) | Báo cáo chạy sau đồng bộ đơn trong `scheduled`, có quỹ thời gian riêng ≤ 15 giây; dựng ảnh rải qua nhiều phút |
| Hiểu nhầm từ khoá (vd "không ổn") | Test riêng; câu có chưa/không đứng trước thì không coi là đồng ý |
| Hai nơi KPI tháng lệch nhau | Chỉ một đường ghi: lưu KPI trọn tháng ghi luôn `targets`; sửa ở trang KPI cũ thì tab KPI hiện theo `targets` cho kỳ tháng đó |
| Lùi | Mỗi bước một commit; revert commit; migration chỉ thêm cột/bảng nên để nguyên không hại |
