# Plan: quy chuẩn chung web tổng ↔ Telegram

Ngày: 2026-10-31. Trạng thái: chờ anh Vũ duyệt ("ok Telegram").

Mục tiêu: một khuôn tin, một bảng tên số, một thư viện định dạng dùng chung cho web, Telegram và Zalo. Không đổi cách tính số, không đổi quyền.

Mọi số trong file này là số ảo. Không có tên thật, số thật, khoá.

Mục đích: mỗi tin Telegram đọc trên điện thoại trong 5 giây là biết **chuyện gì, ở đâu, lớn bao nhiêu, cần làm gì, bấm đâu**. Tên số trên Telegram phải trùng tên số trên web.

---

## 1. Kiểm kê: web đang gửi những gì

Đếm được **19 loại tin** (14 loại Telegram trong repo, 1 loại từ PC, 4 loại Zalo). Người nhận: *chat tin cậy* = chat riêng của chủ và giám đốc (`lib/bot-access.ts` trustedChatIds); *chat cảnh báo* = chat cấu hình ở Cài đặt › Cảnh báo; *chat canh gác* = watch_chats.

| # | Tin | Khi nào | Nhận | Code | Ví dụ hiện tại (số ảo) | Nhận xét |
|---|---|---|---|---|---|---|
| 1 | ⚠️ Tỷ lệ chốt dưới ngưỡng | Mỗi lượt cron trong ca, từng nhân viên dưới ngưỡng; cooldown + nhắc lại | chat cảnh báo | `lib/alerts.ts:41` formatAlert | `⚠️ Tỷ lệ chốt dưới ngưỡng` / `Nhân viên: Hoa SALE` / `Ca: 08:00–17:00` / `Số đã nhận: 42` / `Số đã chốt: 9` / `Tỷ lệ chốt: 21% — dưới ngưỡng 30%` / `Đơn chốt từ tệp này: 9` / `Tổng giá trị chốt từ tệp này: 12.400.000 đồng` / `Dữ liệu cập nhật tới: 14:05` | 9 dòng cho 1 người; 10 người dưới ngưỡng = 10 tin liên tiếp (lũ tin). "Số đã nhận/Số đã chốt" không có trên web (web gọi "Số được chia", "Đơn chốt"). Tiền ghi "đồng" dài. Không link. Không nói so với hôm qua. Không nói cần làm gì. |
| 2 | 🛑 Lỗi dữ liệu | Đồng bộ cũ > 20 phút khi chạy cảnh báo | chat cảnh báo | `lib/alerts.ts:104` | `🛑 Lỗi dữ liệu` / `Đồng bộ cũ 35 phút` / `Chưa gửi cảnh báo hiệu suất vì số liệu thiếu.` | Trùng ý với tin Canh gác pos_stale (#4): cùng một sự cố báo hai nơi, hai giọng. |
| 3 | Báo đơn kẹt | Mỗi 30 phút, đơn Mới/Chờ XN quá N giờ, lặp sau 3h nếu không đổi | chat cảnh báo | `lib/stuck-alert.ts:25` | `Báo đơn kẹt Mới / Chờ xác nhận quá 4 giờ` / `Hoa SALE: 7 đơn` / `Lan CSKH: 3 đơn` / `Tổng: 10 đơn (30 ngày gần nhất, tối đa 200 đơn).` | Không icon, không mức. Danh sách có thể 50 dòng. Không link tới trang đơn kẹt. Không nói kẹt tăng hay giảm so với lần trước. |
| 4 | 🔴🟠🟡 Canh gác: sự cố | Mỗi lượt cron 24/7; im 22:00–07:00; nhắc lại sau 4h | chat canh gác | `lib/watch-core.ts:186` alertText, `remindText` | `🔴 Đồng bộ đơn cũ 65 phút` / `Lần cuối 13:00` / `Từ 14:05` | Tốt nhất hiện có: ngắn, có mức. Thiếu: cần làm gì, link tới Cài đặt › Dữ liệu. Tiêu đề từng key mỗi người viết một kiểu. |
| 5 | 🌅 Canh gác · tóm tắt sự cố chờ báo | Lượt đầu sau 07:00 | chat canh gác | `lib/watch-core.ts:199` digestText | `🌅 Canh gác · tóm tắt sự cố chờ báo` / `🟡 Sao lưu đêm chưa chạy · từ 02:10` / `✅ D1 ghi 80% · đã ổn 05:30` | Ổn. Thiếu link. |
| 6 | ✅ Đã ổn lại | Khi sự cố hết | chat canh gác | `lib/watch-core.ts:196`, `:413` | `✅ Đã ổn lại · Đồng bộ đơn cũ (kéo dài 1 giờ 20 phút)` | Ổn. |
| 7 | 🔴 Bộ hẹn giờ đồng bộ không chạy | Cron không chạy 2 lượt | chat canh gác | `lib/watch-core.ts:409` schedDeadText | `🔴 Bộ hẹn giờ đồng bộ không chạy` / `Lượt cuối 13:30 · …` | Ổn. Thiếu "cần làm gì" (ai bật lại, ở đâu). |
| 8 | ✅ Canh gác · tin thử | Bấm "Gửi thử" ở Cài đặt | chat canh gác | `lib/watch-core.ts:205` TEST_TEXT | `✅ Canh gác · tin thử` / `Chat này sẽ nhận cảnh báo khi…` | Ổn. |
| 9 | ✅ Tổng hợp POS đã kết nối Telegram | Bấm "Gửi thử" chat cảnh báo | chat cảnh báo | `app/api/telegram/route.ts:72` | `✅ Tổng hợp POS đã kết nối Telegram.` / `Cảnh báo tỷ lệ chốt sẽ gửi vào đây trong ca làm.` | Hai tin thử (#8, #9) hai giọng, không nói chat này nhận loại nào. |
| 10 | Bot báo cáo (lệnh / menu / nút) | Người dùng bấm | người hỏi | `lib/bot.ts:60` overviewLines, `:98` xếp hạng, `:112` nhân viên, `:191` theo POS, `:240` chốt nóng, `:254` SP bán chạy, `:263` mua lại, `:320` đồng bộ; `lib/bot-menu.ts:65` | `MEGATECH · Tổng hợp POS` / `Tổng quan hôm nay` / `31/10 · cập nhật 14:05` / `───` / `Đơn tạo mới: 120 ↑8%` / `Đơn chốt: 64 ↑3%` / `Tỷ lệ chốt: 53% ▰▰▰▰▰▱▱▱▱▱` / `Doanh thu: 86,2 tr ↑5%` / `Giảm giá/quà: 4,1 tr (đã trừ khỏi doanh thu)` / `GTTB: 1,35 tr · SL: 180 · khách: 60` / `───` / `Giao TC: 40 đơn · 52 tr` / `Hoàn: 3 · Hủy: 5 · Đang giao: 16` | 13 dòng. **"Doanh thu"** trên bot nhưng web gọi "Doanh số" (chỉ MKT/CSKH/SALE) và vận đơn là "Đơn chuyển đi" → số bot có thể khác số web. Không nói phạm vi ai được tính. Hoàn/Hủy không có %, không màu. Không link web. So sánh "↑8%" là so cả kỳ trước, không phải cùng giờ. |
| 11 | Biểu đồ bot | Nút "Biểu đồ" | người hỏi | `lib/bot-charts.ts:13` | ảnh PNG QuickChart "Doanh thu theo ngày" | Cùng lỗi tên "Doanh thu". Caption không có số tổng. |
| 12 | 🔐 Yêu cầu dùng bot | Người lạ /start | chat tin cậy | `lib/bot-access.ts:117` | `🔐 Yêu cầu dùng bot` / `Tên · @user · id` / [✅ Cho phép] [❌ Từ chối] | Tốt: có nút. Giữ làm mẫu. |
| 13 | 📥 Đã nạp N ứng viên / 🆕 Ứng viên mới / ✏️ Cập nhật / 📎 CV | Đồng bộ file tuyển dụng | chat tin cậy | `lib/recruit.ts:190,212,292,298` | `🆕 Ứng viên mới` / `👤 Mai — Sale` / `📄 file.xlsx › Tab HN · dòng 12` / link web nhân sự | Tốt: có link, protect. Khi nạp file lần đầu có thể 30 tin liền (mỗi ứng viên 1 tin) → cần gom. |
| 14 | HR notify | Web nhân sự gọi | chat tin cậy | `app/api/hr/notify/route.ts:19` | `<b>tiêu đề</b>` / nội dung / `Mở web nhân sự` | Ổn, nhưng không icon/mức, tuỳ bên gửi. |
| 15 | 🔐 Đăng nhập từ máy mới | Máy lạ đăng nhập | chat tin cậy | `lib/login-session.ts:50` | `🔐 Đăng nhập từ máy mới` / `Tên (email)` / `Chrome · Hà Nội · IP 1.2.3.4` / `Cách vào: mật khẩu · 14:05 31/10` / `Không phải người này? Vào web → Bảo mật…` | Có "cần làm gì" nhưng là 2 dòng chữ, không nút/không link thẳng tới Bảo mật. |
| 16 | PC web tổng | Script canh máy ở PC | chat canh gác | `scripts/pc/canh-may.mjs:59` | `PC web tổng` / `Web: ok 120ms` / `Đồng bộ: 3 phút trước` | Không icon, không mức, không cùng khuôn Canh gác. |
| 17 | Zalo 📌 Việc / 📅 Họp / danh sách / tuần | Giao việc, hẹn họp | nhân viên Zalo | `lib/zalo-work.ts:122-128,210` | `📌 Việc số 12 · Việc mới từ Vũ: Gọi lại khách hoàn` / `Hạn 15:00 hôm nay (Gấp)` / `Trả lời: nhận việc 12 …` | Ổn cho Zalo (không có nút). |
| 18 | Zalo Doanh số team khung / Bản tin đầu ngày | Cuối khung giờ, 7h | leader Zalo | `lib/zalo-work.ts:129,130` | `Doanh số team HN 14–16h` / `Doanh số khung: 12.400.000 · Luỹ kế hôm nay: 58.000.000` / `Đơn chốt: 9` / `Cao nhất: Hoa, Lan, Mai` / `Chưa có đơn trong khung: Tú, Nam` | Tiền viết đầy đủ "12.400.000" khó đọc; không so cùng khung hôm qua; không nói doanh số tính ai. |
| 19 | Zalo ⚠️ idle | Nhân viên không có số mới N phút | leader Zalo | `lib/zalo-work.ts:131` | `⚠️ Hoa chưa có số mới 45 phút (lần cuối 13:20)` | Ổn, ngắn. Thiếu "cần làm gì". |

### 5 vấn đề lớn nhất
1. **Tên số lệch web.** Bot và Zalo dùng "Doanh thu", "Đơn chốt", "Số đã nhận"; web dùng "Doanh số" (chỉ MKT/CSKH/SALE), "Đơn chuyển đi", "Số được chia". Anh đọc Telegram xong mở web thấy số khác, không biết vì sao.
2. **Số không ghi phạm vi.** Hầu hết tin không nói "tính ai, kỳ nào, cập nhật lúc nào". Riêng bot có dòng cập nhật, cảnh báo thì không.
3. **Không có đường về web.** 13/19 loại không có link; không tin nào mở đúng trang + bộ lọc. Người đọc phải tự tìm.
4. **Lũ tin và tin dài.** Tỷ lệ chốt gửi 1 tin/người, tuyển dụng 1 tin/ứng viên, đơn kẹt liệt kê tới 3000 ký tự, bot tổng quan 13 dòng. Trên điện thoại chỉ thấy 5–6 dòng đầu.
5. **Không nói cần làm gì, không có mức.** Chỉ Canh gác có 🔴🟠🟡. Cảnh báo kinh doanh (tỷ lệ chốt, đơn kẹt, hoàn/hủy) không có mức, không có câu hành động; cùng sự cố "đồng bộ cũ" báo hai nơi hai giọng (#2 và #4).

Ngoài ra: 6 chỗ tự viết hàm tiền/escape/giờ VN (alerts, bot, watch-core, stuck-alert, zalo-work, login-session) thay vì dùng chung `lib/kpi-pace.ts` millions/signedShort.

---

## 2. Quy chuẩn đề xuất

### 2.1 Khuôn một tin (tối đa 7 dòng)
```
<icon mức> <b>Chuyện gì</b> · phạm vi · kỳ
Số 1: <b>giá trị</b> (so cùng giờ kỳ trước ↑↓)
Số 2: …
Số 3: …
→ Cần làm: một câu
[nút mở web]  [nút phụ]
```
- Dòng 1 luôn có **icon mức + tên tin + phạm vi + kỳ**. Ví dụ: `🟡 Doanh số chuyển đi · Team HN · hôm nay tới 14:00`.
- **Tối đa 3 số**, mỗi số có tên đúng như trên web và so **cùng giờ kỳ trước** (hôm nay 14:00 so hôm qua 14:00), không so cả ngày hôm qua.
- **Một dòng "Cần làm"**. Không có việc phải làm thì ghi "Chỉ để biết".
- **Một nút mở web** tới đúng trang, mang sẵn bộ lọc (team, kỳ, POS) qua query string, giống luật "bấm vào số thì mở trang tính ra số đó".
- Tin thông tin (báo cáo theo lệnh) có thể dài hơn nhưng số chính vẫn ở 3 dòng đầu, phần còn lại sau `───`.

### 2.2 Tên số: dùng đúng tên web (AGENTS.md)
| Telegram đang dùng | Đổi thành | Ghi chú |
|---|---|---|
| Doanh thu | **Doanh số** | chỉ người có hậu tố MKT/CSKH/SALE; ghi rõ "Doanh số (MKT+CSKH+SALE)" ở lần đầu trong tin |
| Đơn chốt | Đơn chốt | giữ, đây là tên web |
| Vận đơn / Giao TC | **Đơn chuyển đi** / Giao thành công | không gọi vận đơn là bán hàng hay doanh thu |
| Số đã nhận / Số đã chốt | **Số được chia** / Đơn chốt từ số được chia | trùng `lib/ai-insight.ts` labels |
| Đơn tạo mới | Đơn vào Chờ xác nhận hoặc Đơn tạo mới | theo trang đang tính |
| Tỷ lệ hoàn, hủy | Hoàn % / Hủy % | màu: hoàn ≥7% 🔴, ≥5% 🟡; hủy ≥7% 🔴, ≥5% 🟡 (cùng ngưỡng web) |
| "12.400.000 đồng" | **12,4 tr** | `millions()` trong `lib/kpi-pace.ts`; từ 1 tỷ ghi "1,24 tỷ" |
| ↑8% | **+8%** / **−3%** | `signedShort()`; không mũi tên để đọc được khi thu nhỏ |

Mỗi tin có số thì dòng cuối cùng trước nút ghi: `Số tính cho: <ai> · cập nhật 14:05`.

### 2.3 Mức và icon
| Mức | Icon | Nghĩa | Gửi |
|---|---|---|---|
| Đỏ | 🔴 | Hỏng, mất tiền, cần người làm ngay | Ngay, kể cả đêm; nhắc lại sau 4h |
| Vàng | 🟡 | Lệch ngưỡng, nên xem trong giờ làm | Gom theo khung, im 22:00–07:00 |
| Xanh | 🟢 | Đã ổn lại, đủ mục tiêu, tin tốt | Gom vào bản tin |
| Thông tin | 📊 / 📌 / 🔐 | Báo cáo, việc, bảo mật | Theo lịch hoặc theo lệnh |

Bỏ 🟠 và 🛑 (gộp vào 🔴/🟡) để chỉ còn 3 màu, trùng màu trên web.

### 2.4 Giờ gửi và gom tin
- **07:30 Bản tin sáng**: hôm qua (Doanh số, Đơn chốt, Hoàn/Hủy %), sự cố đêm, việc hôm nay. 1 tin.
- **Cuối mỗi khung** 11:00 / 14:00 / 17:00 / 21:00: Doanh số khung theo team, so cùng khung hôm qua. 1 tin / team.
- **Cảnh báo kinh doanh** (tỷ lệ chốt, idle, đơn kẹt): gom **1 tin / team / khung**, liệt kê tối đa 5 người, còn lại "… và 4 người khác" + nút xem đủ. Không gửi 1 tin / người.
- **Sự cố hệ thống** 🔴: ngay. 🟡: gom 30 phút, và vào tóm tắt sáng nếu trong giờ yên lặng (giữ cơ chế Canh gác hiện có).
- **Tuyển dụng**: nạp file lần đầu = 1 tin tổng; ứng viên mới gom 15 phút = 1 tin "🆕 3 ứng viên mới" + nút.
- **Đăng nhập máy mới, xin quyền bot**: ngay, có nút.
- Một chat **không quá 6 tin / giờ** trừ 🔴. Vượt thì gom thành 1 tin "còn N cảnh báo, xem trên web".

### 2.5 Nút (inline keyboard)
- Mọi tin có nút đầu tiên là **Mở web** → `https://tonghopposmegatech.io.vn/<trang>?team=HN&ky=homnay&pos=…` (đã có `sendWithMarkup`).
- Tin cần quyết: nút ✅/❌ như "Yêu cầu dùng bot" (`lib/bot-access.ts`).
- Tin bảo mật: nút "Đăng xuất máy đó" (gọi API có xác nhận), nút "Là tôi".
- Tin cảnh báo người: nút "Xem người này" mở trang nhân viên.
- Nút phụ "Tắt tin này 1 ngày" để anh tự giảm ồn mà không vào Cài đặt.

### 2.6 Một thư viện định dạng chung
`lib/notify/format.ts` (thuần, không React, có test):
- `tr(n)`, `signed(n)` lấy từ `lib/kpi-pace.ts`.
- `vnClock`, `vnDay` từ `lib/watch-core.ts`.
- `esc()` HTML, `scrub()` SĐT/khoá từ `watch-core`.
- `buildMessage({ level, title, scope, period, metrics[≤3], action, link, buttons })` → text + reply_markup. Mọi file gửi tin đều qua hàm này; muốn đổi khuôn thì sửa một chỗ.
- `batch(items, { max: 5, more: url })` gom danh sách người.
- `levelOf(metric, value)` dùng chung ngưỡng với web (`lib/metrics.ts`).

### 2.7 Luật giữ an toàn (giữ nguyên)
- Không đưa SĐT khách, tên khách, khoá vào tin (`scrub`, `protect: true` cho tin nhân sự/bảo mật).
- Demo không gọi Telegram thật (`guardDemo`).
- Cắt 4000 ký tự (`clip`).

---

## 3. Mẫu trước / sau (số ảo)

### 3.1 Tỷ lệ chốt dưới ngưỡng
**Trước** (1 tin / người, 9 dòng):
```
⚠️ Tỷ lệ chốt dưới ngưỡng
Nhân viên: Hoa SALE
Ca: 08:00–17:00
Số đã nhận: 42
Số đã chốt: 9
Tỷ lệ chốt: 21% — dưới ngưỡng 30%
Đơn chốt từ tệp này: 9
Tổng giá trị chốt từ tệp này: 12.400.000 đồng
Dữ liệu cập nhật tới: 14:05
```
**Sau** (1 tin / team / khung):
```
🟡 Tỷ lệ chốt dưới 30% · Team Sale HN · ca 08–17h, tới 14:00
Hoa SALE: 21% (9/42) · hôm qua giờ này 34%
Tú SALE: 25% (6/24) · hôm qua giờ này 28%
… và 2 người khác
Team: 38% (−4% so hôm qua giờ này)
→ Cần làm: leader HN xem số được chia của Hoa, Tú.
Số tính cho Sale HN · cập nhật 14:05
[Mở Sale theo team]  [Tắt tin này 1 ngày]
```

### 3.2 Bot tổng quan hôm nay
**Trước** (13 dòng, "Doanh thu", "Giao TC", không link):
```
MEGATECH · Tổng hợp POS
Tổng quan hôm nay
31/10 · cập nhật 14:05
──────────────────
Đơn tạo mới: 120 ↑8%
Đơn chốt: 64 ↑3%
Tỷ lệ chốt: 53% ▰▰▰▰▰▱▱▱▱▱
Doanh thu: 86,2 tr ↑5%
Giảm giá/quà: 4,1 tr (đã trừ khỏi doanh thu)
GTTB: 1,35 tr · SL: 180 · khách: 60
──────────────────
Giao TC: 40 đơn · 52 tr
Hoàn: 3 · Hủy: 5 · Đang giao: 16
```
**Sau**:
```
📊 Tổng quan · tất cả POS · hôm nay tới 14:00
Doanh số (MKT+CSKH+SALE): 86,2 tr (+5% so hôm qua giờ này)
Đơn chốt: 64 (+3%) · Tỷ lệ chốt 53%
Đơn chuyển đi: 40 · Hoàn 🟡 5,2% · Hủy 3,1%
→ Chỉ để biết. Hoàn đang sát ngưỡng vàng.
───
Đơn tạo mới 120 · GTTB 1,35 tr · khách 60 · giảm giá 4,1 tr
Cập nhật 14:05
[Mở Tổng quan]  [Theo POS]  [Xếp hạng]
```

### 3.3 Đơn kẹt
**Trước**:
```
Báo đơn kẹt Mới / Chờ xác nhận quá 4 giờ
Hoa SALE: 7 đơn
Lan CSKH: 3 đơn
(… tới 50 dòng)
Tổng: 10 đơn (30 ngày gần nhất, tối đa 200 đơn).
```
**Sau**:
```
🟡 Đơn kẹt quá 4 giờ · tất cả POS · 14:00
Tổng: 10 đơn (+3 so lúc 11:00)
Hoa SALE 7 · Lan CSKH 3
→ Cần làm: giục Hoa xác nhận 7 đơn Mới.
Đếm đơn Mới / Chờ xác nhận 30 ngày gần nhất
[Mở danh sách đơn kẹt]
```

### 3.4 Sự cố hệ thống
**Trước**: `🔴 Đồng bộ đơn cũ 65 phút` / `Lần cuối 13:00` / `Từ 14:05`
**Sau**:
```
🔴 Đồng bộ đơn dừng 65 phút · 6 POS
Lần đồng bộ cuối 13:00 · bộ hẹn giờ vẫn chạy
→ Cần làm: vào Cài đặt › Dữ liệu bấm "Đồng bộ ngay"; không được thì báo Claude.
[Mở Cài đặt › Dữ liệu]
```
Khi hết: `🟢 Đã ổn lại · Đồng bộ đơn (dừng 1 giờ 20 phút)`.

### 3.5 Đăng nhập máy mới
**Sau**:
```
🔐 Đăng nhập từ máy mới · tài khoản Vũ
Chrome · Hà Nội · 14:05 31/10 · bằng mật khẩu
→ Không phải anh thì bấm nút dưới.
[Là tôi]  [Đăng xuất máy đó]  [Mở Bảo mật]
```

### 3.6 Bản tin sáng 07:30 (gộp Canh gác tóm tắt + Zalo bản tin + bot)
```
🌅 Bản tin sáng 31/10 · tất cả POS
Hôm qua: Doanh số 212 tr (+6% so 29/10) · Đơn chốt 158 · Hoàn 🟡 5,4%
Đêm qua: 🟢 sao lưu xong 02:10 · 🟢 không sự cố
Hôm nay: 2 việc đến hạn · họp 09:00
→ Cần làm: xem hoàn của POS Siêu Vô Gạo (7,8% 🔴).
[Mở Tổng quan hôm qua]  [Việc hôm nay]
```

---

## 4. Bước làm (mỗi bước = 1 PR nhỏ vào nhánh demo)

Ghi vào `docs/plans/2026-10-31-quy-chuan-telegram/plan.md`. Không bước nào đổi cách tính số; chỉ đổi cách trình bày và gom tin.

| Bước | Việc | File | Xong khi | Kiểm |
|---|---|---|---|---|
| 1 | Thư viện định dạng chung | mới `lib/notify/format.ts` (buildMessage, batch, levelOf, dùng lại millions/signedShort/vnClock/esc/scrub), `tests/notify-format.test.ts` | buildMessage ra đúng khuôn 7 dòng, nút, cắt 4000 | `pnpm test`; test snapshot với số ảo |
| 2 | Bảng tên số chung | `lib/notify/names.ts` (map metric → tên web, lấy từ `lib/metrics.ts`), test | Không còn chuỗi "Doanh thu" tự viết trong lib gửi tin | grep "Doanh thu" trong lib/bot*.ts, zalo-work.ts = 0 |
| 3 | Bot tổng quan + biểu đồ đổi tên và thêm nút Mở web | `lib/bot.ts` overviewLines, `lib/bot-menu.ts`, `lib/bot-charts.ts` | Mẫu 3.2; link mang team/kỳ/POS | test `tests/bot.test.ts` so chuỗi; bấm thử bot demo |
| 4 | Cảnh báo tỷ lệ chốt gom theo team/khung | `lib/alerts.ts` formatAlert → formatTeamAlert, giữ cooldown; thêm "so cùng giờ hôm qua" (query có sẵn ở `lib/sale-analytics.ts` theo giờ) | Mẫu 3.1; 1 tin/team | test alerts; dryRun demo đếm số tin ≤ số team |
| 5 | Đơn kẹt | `lib/stuck-alert.ts` buildStuckMessage dùng buildMessage + batch 5 + so lần trước | Mẫu 3.3 | test stuck-alert |
| 6 | Canh gác: 3 màu + câu cần làm + nút | `lib/watch-core.ts` (ICON, alertText, remindText, digestText, schedDeadText thêm action + link), `lib/watch.ts` dùng sendWithMarkup | Mẫu 3.4; bỏ 🟠 | test watch-core |
| 7 | Gộp "🛑 Lỗi dữ liệu" vào Canh gác pos_stale | `lib/alerts.ts:104` bỏ gửi, chỉ ghi log | Một sự cố chỉ một tin | test alerts dryRun |
| 8 | Hai tin thử thành một | `app/api/telegram/route.ts`, `lib/watch-core.ts` TEST_TEXT nói rõ chat này nhận loại nào | 1 chuỗi chung | bấm Gửi thử demo |
| 9 | Đăng nhập máy mới + HR notify qua buildMessage, thêm nút | `lib/login-session.ts`, `app/api/hr/notify/route.ts`, callback trong `app/api/telegram/webhook/route.ts` | Mẫu 3.5; nút "Đăng xuất máy đó" hỏi xác nhận trước | test login-session; thử demo |
| 10 | Tuyển dụng gom 15 phút | `lib/recruit.ts` notify: gom ứng viên mới thành 1 tin + nút | Nạp 30 ứng viên = 1 tin | test recruit |
| 11 | Zalo cùng tên số và "tr" | `lib/zalo-work.ts` formatSlotReport, formatMorning, formatIdleAlert dùng names + tr + so cùng khung hôm qua | Không còn "12.400.000" | test zalo-work |
| 12 | Bản tin sáng 07:30 một tin | mới `lib/notify/morning.ts` gộp digest Canh gác + số hôm qua + việc; cron hiện có gọi | Mẫu 3.6 | test morning với số ảo; dryRun demo |
| 13 | Chống lũ: ≤6 tin/giờ/chat | `lib/notify/throttle.ts` dùng Cache API như watch; áp cho mọi sendTelegram trừ 🔴 | Gửi 20 tin thử → 6 tin + 1 tin gom | test throttle |
| 14 | PC canh máy cùng khuôn | `scripts/pc/canh-may.mjs` (nhánh claude/plan-chuyen-pc) | Có icon mức + 1 dòng cần làm | chạy khi anh cho phép |
| 15 | Trang web "Tin đã gửi" (sau cùng, tuỳ anh) | đọc `alert_log` + watch outbox, hiện trong Cài đặt › Cảnh báo | Anh xem lại tin cũ không cần mở Telegram | thử demo |

Thứ tự: 1 → 2 → 3 (anh thấy ngay trên bot) → 4, 5, 6 (giảm ồn) → còn lại. Mỗi bước chạy đủ `pnpm typecheck`, `pnpm test`, `pnpm lint`, `pnpm build`. Lên web thật chỉ khi anh nhắn "ok lên".
