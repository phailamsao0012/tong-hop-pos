# Gắn Claude API vào web tổng: hỏi đáp và dự báo doanh thu (19/10/2026)

Tổ web tổng viết. Anh Vũ chọn "Làm cả hai" sau bản đánh giá ngày 19/10. Quy trình chung: Codex làm từng bước C1 → C5, máy kiểm sau mỗi bước, Claude kiểm một lần cuối, lên demo cho anh xem, anh ok mới lên web thật.

## Mục tiêu

1. **Hỏi thì làm.** Chủ hệ thống gõ câu hỏi trên web ("tuần này sale nào chốt kém, vì sao, so với người khác thế nào"). Claude đọc gói số đã tổng hợp rồi trả lời bằng tiếng Việt.
2. **Tự chạy hằng ngày.**
   - Code tính dự báo doanh thu hôm nay và tuần này, 30 phút một lần.
   - Code lưu dự báo ở từng mốc giờ.
   - Đầu ngày hôm sau, code tách phần chênh giữa dự báo và thực tế: do số chia, do tỉ lệ chốt của từng người, do giá trị đơn, do người không làm.
   - Claude chỉ viết vài dòng giải thích các con số code đã tính.
   - Thứ Hai có thêm bản cho cả tuần trước.

## Nguyên tắc bắt buộc

- **Số do code tính, Claude chỉ diễn giải.** Mọi con số hiện trên web (dự báo, chênh lệch, phần do ai) lấy từ code, không lấy từ chữ Claude viết. Claude không được tự tính số mới. Lời nhắc hệ thống phải ghi rõ: chỉ dùng số trong dữ liệu.
- **Không gửi dữ liệu cá nhân cho Claude.**
  - Không gửi SĐT, tên khách, ghi chú khách, địa chỉ hay nội dung tin nhắn.
  - Nhân viên chỉ gửi mã (`seller_id` / mã POS user), kèm bộ phận và mã team. Tên nhân viên do web tự thay khi hiện cho chủ hệ thống (xem mục "Mã nhân viên trong câu trả lời").
  - Lý do chưa chốt chỉ gửi số đếm theo nhóm lý do đã phân loại, không gửi chữ ghi chú gốc.
- **Khoá API.**
  - Biến bí mật `ANTHROPIC_API_KEY` của Worker. Không bao giờ ra trình duyệt, log, D1, test hay repo.
  - Không có khoá:
    - bản demo dùng trả lời mẫu (C1);
    - web thật hiện "Chưa gắn khoá Claude" và không gọi gì.
- **Tên số theo luật AGENTS.md.**
  - "Doanh thu" ở đây đúng là số ô Doanh thu của màn Điều hành: `overviewReport(...).current.total.closedNet`, toàn công ty, mọi POS.
  - Chỉ tính người có hậu tố MKT / CSKH / SALE như các báo cáo khác.
  - Không gọi số Vận đơn là doanh thu. Tính năng này không đụng số Vận đơn.
- **Ghi D1 ít.**
  - Không bảng mới, không migration, không chỉ mục mới. Mọi thứ lưu ở `app_settings` (khoá text, giá trị JSON).
  - Mức ghi phát sinh mục tiêu dưới 150 dòng mỗi ngày.
  - Mỗi lượt ghi là một câu `INSERT … ON CONFLICT(key) DO UPDATE` trên một dòng.
- **Không đổi** `WORLD_VERSION`, các `*_EPOCH`, `/api/ai/pack`, `/api/ai/insights`, `/api/ai/pair`, `scripts/codex-daily/**`, tóm tắt sáng Workers AI (`lib/ai-summary.ts`, `lib/ai-trends.ts`).

## Mô hình và giá (đã kiểm bằng tài liệu chính thức ngày 19/10/2026)

- **Mô hình:** `claude-sonnet-5-5` (Claude Sonnet 5.5) cho cả hỏi đáp và phân tích.
  - `output_config: { effort: 'medium' }`.
  - Không gửi `thinking` (mặc định tự suy nghĩ). Không gửi `temperature`/`top_p` (Sonnet 5.5 trả lỗi 400).
  - Không dùng `tool_choice` loại `any`/`tool` (trả lỗi 400). Chỉ dùng `auto`.
- **Giá, USD cho 1 triệu token** (để ước tiền đã dùng). Gói Batch: mọi giá nhân 0,5.

  | Loại token | USD / 1 triệu |
  |---|---|
  | Vào | 2 |
  | Ra | 10 |
  | Ghi bộ nhớ đệm 5 phút | 2,5 |
  | Đọc bộ nhớ đệm | 0,2 |

- **Thư viện:** `@anthropic-ai/sdk` bản đúng `0.131.0`. Script máy cài trước khi Codex làm C1; Codex không cài gì.
  - Gọi bằng `new Anthropic({ apiKey })` rồi `client.messages.create(...)` và `client.messages.batches.*`.
  - Không tự viết `fetch` tới API.
- **Trả lời bị từ chối.** Luôn kiểm `stop_reason` trước khi đọc `content`. `stop_reason === 'refusal'` thì lưu lỗi "Claude từ chối trả lời câu này", không ném lỗi chung.

## Hằng số (đặt trong `lib/claude.ts`, có chú thích)

- `CLAUDE_MODEL = 'claude-sonnet-5-5'`
- `ASK_DAILY_CAP = 40`: số câu hỏi tối đa mỗi ngày (giờ VN), toàn web.
- `AI_MONTHLY_USD_CAP = 30`: chi phí ước của tháng vượt mức này thì không nhận câu hỏi mới. Phân tích đêm vẫn chạy tới `AI_MONTHLY_USD_CAP + 5`, sau đó cũng dừng.
- `ASK_MAX_CHARS = 1000`: độ dài câu hỏi tối đa.

---

## Bước

**C1. Lõi gọi Claude: thư viện, khoá, tính tiền, trần chi tiêu, bản trả lời mẫu cho demo**

File được sửa: `lib/claude.ts` (mới), `lib/demo/fake-claude.ts` (mới), `db/env.d.ts`, `package.json`, `pnpm-lock.yaml`, `tests/*.test.ts`, `tests/support/**`.

Script máy đã chạy `pnpm add @anthropic-ai/sdk@0.131.0` trước khi giao bước này. Codex không chạy lệnh cài; thiếu gói thì ghi "Câu hỏi còn lại" và dừng.

1. `db/env.d.ts`: thêm `ANTHROPIC_API_KEY?: string;` vào `Cloudflare.Env`, kèm chú thích "Khoá Claude API (biến bí mật, đặt trên trang Cloudflare). Không bao giờ ghi ra log hay trả về trình duyệt."
2. `lib/claude.ts` xuất:
   - Các hằng số ở mục trên, và `PRICES` theo bảng giá trên. Chỉ có dòng cho `claude-sonnet-5-5`.
   - `type ClaudeUsage = { input: number; output: number; cacheRead: number; cacheWrite: number }`.
   - `usageOf(u)`: đổi `response.usage` của SDK sang `ClaudeUsage`. Các trường có thể thiếu hoặc null, coi là 0: `input_tokens`, `output_tokens`, `cache_read_input_tokens`, `cache_creation_input_tokens`.
   - `costUsd(usage, { batch?: boolean })`: hàm thuần, trả USD. Làm tròn 6 chữ số chỉ khi lưu, không làm tròn khi cộng.
   - `claudeClient()`:
     - Trả `new Anthropic({ apiKey: env.ANTHROPIC_API_KEY, maxRetries: 2, timeout: 120_000 })`.
     - Không có khoá thì trả `null`.
     - Không đọc khoá ở nơi nào khác.
   - `claudeMode()`: trả `'live'` (có khoá), `'demo'` (không khoá và `isDemo()`), hoặc `'off'` (không khoá, web thật).
   - **Sổ chi tiêu tháng**, khoá `app_settings` là `ai_spend:YYYY-MM` (tháng giờ VN):
     - giá trị JSON `{ usd, calls, input, output, cacheRead, cacheWrite }`;
     - `addSpend(db, usage, { batch })` cộng dồn bằng **một** câu SQL `INSERT … ON CONFLICT(key) DO UPDATE SET value = json_set(…)`, dùng `json_extract` để cộng, không đọc rồi ghi;
     - `readSpend(db, month)`.
   - **Đếm câu hỏi trong ngày**, khoá `ai_ask_count:YYYY-MM-DD`, cũng một câu SQL cộng 1:
     - `takeAskSlot(db, date)` trả `{ ok: boolean; used: number }`;
     - đã đủ `ASK_DAILY_CAP` thì `ok:false` và không cộng.
     - Làm bằng một câu `INSERT … ON CONFLICT DO UPDATE … WHERE` rồi đọc `meta.changes`, hoặc tương đương nguyên tử.
   - `budgetLeft(db, kind: 'ask' | 'review')`: so tháng hiện tại với trần.
     - Trả `{ ok: boolean; usd: number; cap: number }`.
     - `ask` dùng `AI_MONTHLY_USD_CAP`, `review` dùng `AI_MONTHLY_USD_CAP + 5`.
   - **Dọn dòng cũ:** hàm `pruneAiRows(db, today)` xoá các khoá sau:

     | Khoá | Giữ lại |
     |---|---|
     | `ai_ask_count:*` | 7 ngày |
     | `ai_ask:*` (C4) | 30 ngày |
     | `ai_forecast:*` (C2) | 60 ngày |
     | `ai_review:*`, `ai_week:*` (C3) | 60 ngày |

     Dùng `DELETE … WHERE key GLOB 'ai_ask:*' AND substr(…) < …`, giống `saveInsight` trong `lib/ai-insight.ts`. Gọi mỗi ngày một lần từ C2.
3. `lib/demo/fake-claude.ts`: `fakeAnswer(kind: 'ask' | 'review' | 'week', input: string)` trả chuỗi tiếng Việt mở đầu bằng "(Trả lời mẫu của bản demo, chưa gắn khoá Claude)".
   - Chỉ dựa vào `input` (đếm dòng, lấy mã nhân viên đầu tiên có trong gói), không bịa số mới.
   - Không gọi mạng.
   - Usage của trả lời mẫu là 0, và không cộng sổ chi tiêu.
4. Test (`tests/claude-core.test.ts`):
   - `costUsd`: đúng giá ở bảng trên cho từng loại token. Batch bằng nửa. Thiếu trường thì coi là 0.
   - `takeAskSlot`: trên SQLite giả của test (xem cách các test hiện có giả D1, ví dụ `tests/support`), câu thứ 41 bị từ chối và bộ đếm dừng ở 40.
   - `addSpend`: gọi hai lần thì cộng đúng, chỉ có một dòng.
   - `claudeMode`: không khoá + demo ra `'demo'`; không khoá + web thật ra `'off'`. Nếu khó giả `env`, tách hàm thuần nhận `(key, demo)`.
   - Không test nào gọi mạng thật hay cần khoá thật.

Tiêu chí xong: typecheck, test, lint, build đạt. `rg -n "ANTHROPIC_API_KEY" app` không ra dòng nào: khoá không nằm trong code chạy ở trình duyệt.

**C2. Dự báo doanh thu hôm nay và tuần này (code tính), lưu từng mốc 30 phút**

File được sửa: `lib/forecast-day.ts` (mới, hàm thuần), `lib/forecast-run.ts` (mới, đọc D1), `app/api/ai/forecast/route.ts` (mới), `worker.ts`, `lib/access.ts`, `tests/*.test.ts`, `tests/support/**`.

**Định nghĩa**
- Ngày và giờ theo giờ Việt Nam. Tuần là thứ Hai đến Chủ nhật.
- "Doanh thu" như mục Nguyên tắc.
- `D` là hôm nay. "Cùng thứ" là 4 ngày cùng thứ gần nhất trước `D`: `D-7`, `D-14`, `D-21`, `D-28`.

**Hàm thuần trong `lib/forecast-day.ts`** (không import `cloudflare:workers`, không đọc D1):

1. `hourShares(days: number[][])`: nhận mỗi ngày một mảng 24 số doanh thu theo giờ chốt. Trả mảng 25 số `cum[h]`: phần doanh thu đã có tính tới đầu giờ `h`, trung bình các ngày.
   - `cum[0] = 0`, `cum[24] = 1`.
   - Ngày tổng 0 thì bỏ.
   - **Ngày lạ:** tổng dưới 30% trung vị của các ngày đưa vào thì bỏ (ví dụ ngày nghỉ lễ). Bỏ hết thì dùng đều theo giờ: `cum[h] = h/24`.
2. `shareAt(cum, minuteOfDay)`: nội suy tuyến tính trong giờ hiện tại.
3. `forecastToday({ actual, share, baseline })` với `baseline` là trung bình tổng các ngày cùng thứ còn giữ lại:
   - `share >= 0.25`: trả `actual / share`.
   - `0 < share < 0.25`: `w = share / 0.25`, trả `w * (actual / share) + (1 - w) * baseline`.
   - `share == 0`: trả `max(actual, baseline)`.
   - Kết quả luôn `>= actual`. Không có dữ liệu gì thì trả `null`.
4. `forecastWeek({ actualToYesterday, todayForecast, restBaselines })`: tổng của
   - doanh thu thứ Hai đến hôm qua,
   - dự báo hôm nay,
   - các ngày còn lại trong tuần, mỗi ngày bằng `baseline` cùng thứ của ngày đó (trung bình 4 ngày cùng thứ gần nhất, bỏ ngày lạ như trên).
5. `decompose(expected: Parts, actual: Parts)` với `Parts = { assigned: number; closed: number; net: number }`. Tách theo ba yếu tố, cộng lại đúng bằng `actual.net − expected.net`:
   - Gọi `A` là số được chia, `c = closed / assigned`, `v = net / closed`. Chỉ số 0 là dự kiến, chỉ số 1 là thực tế.
   - `soChia = (A1 − A0) * c0 * v0`
   - `tiLeChot = A1 * (c1 − c0) * v0`
   - `giaTriDon = A1 * c1 * (v1 − v0)`
   - Khi `A0 = 0` hoặc `A1 = 0` (ví dụ CSKH không nhận số), coi `A = 1`, `c = closed`, rồi tính như trên.
   - Khi `closed = 0` ở một phía, `v` của phía đó lấy bằng `v` của phía kia (cả hai 0 thì `v = 0`).
   - Thêm `khac` = phần dư làm tròn, để tổng luôn khớp tuyệt đối.
   - Trả `{ soChia, tiLeChot, giaTriDon, khac, tong }`.
6. `personExpected(rows28, companyWeekdayFactor)`: số dự kiến của từng người cho hôm nay.
   - `rows28` là số từng ngày của người đó trong 28 ngày trước `D`.
   - Chỉ tính ngày người đó **có làm**: `assigned > 0` hoặc `closed > 0`.
   - Kết quả = trung bình `assigned`, `closed`, `net` các ngày có làm, nhân `companyWeekdayFactor`.
   - `companyWeekdayFactor` = doanh thu trung bình 4 ngày cùng thứ / doanh thu trung bình 28 ngày, cả công ty. Mẫu 0 thì bằng 1.
   - Người có dưới 3 ngày có làm trong 28 ngày thì không có số dự kiến (ghi `null`) và đứng ở nhóm "người mới".

**Đọc D1 trong `lib/forecast-run.ts`** (chỉ đọc, trừ dòng lưu ở mục 9):

7. Doanh thu theo ngày + giờ chốt của các ngày cùng thứ và của hôm nay.
   - Lấy theo `first_closed_at` (giờ VN), cùng điều kiện đơn chốt và cách tính tiền như truy vấn `hourly` trong `lib/sale-analytics.ts`.
   - **Bỏ** lọc chỉ Sale. Lọc người được tính bằng `countedFilter('seller_id')` của `lib/team.ts`.
   - Một câu `GROUP BY strftime('%Y-%m-%d %H', …)` cho cả 5 ngày (dùng `IN (…)` các khoảng ngày, hoặc 5 câu trong `db.batch`).
8. Số từng người theo ngày từ `stats_daily`, 28 ngày trước `D` và hôm nay: `SUM(assigned_orders)`, `SUM(closed_orders)`, `SUM(closed_net)`, gom theo `day, seller_id`, có `countedFilter`.
   - Kiểm khớp: tổng `closed_net` các người của một ngày phải bằng doanh thu toàn công ty của ngày đó lấy từ `overviewReport`. Lệch thì phần lệch vào dòng "Khác / chưa gán người" (`seller_id = ''`). Không âm thầm bỏ.
   - Số hôm nay đến giờ (`actual`) lấy từ `overviewReport({ posIds: [], start: D, end: D }).current.total.closedNet`, đúng như ô Doanh thu của Điều hành.
9. **Lưu**, khoá `ai_forecast:YYYY-MM-DD`, giá trị JSON:
   ```
   { date, weekStart, morning: { at, total, week, people: [{ id, dept, team, assigned, closed, net } | …] } | null,
     points: [{ t: 'HH:MM', actual, today, week }], updatedAt, version: 1 }
   ```
   - `morning`: chụp **một lần**, ở lượt đầu tiên từ 07:00 giờ VN. Đây là "dự báo đầu ngày" dùng để so cuối ngày. Đã có thì không ghi đè.
   - `points`: thêm một điểm mỗi lượt, tối đa 34 điểm/ngày. Mốc trùng `t` thì thay.
   - Ghi bằng **một** câu upsert mỗi lượt.
10. `maybeForecastTick(now)`:
    - Gọi từ `scheduled` trong `worker.ts`, cạnh `maybeDailySummary`, trong `ctx.waitUntil(...catch(log))`.
    - Chỉ chạy khi phút VN là `0` hoặc `30` (cron 5 phút một lần: kiểm `getUTCMinutes() % 30 === 0`) và giờ VN từ 07:00 tới 23:30.
    - Chạy cả web thật lẫn demo.
    - Lượt lỗi thì log ngắn (không log dữ liệu), không ném ra ngoài.
    - Lượt đầu tiên sau 07:00 mỗi ngày gọi thêm `pruneAiRows` (C1).
11. `app/api/ai/forecast/route.ts`, `GET ?date=YYYY-MM-DD` (mặc định hôm nay):
    - trả `{ date, total, week, actual, points, morningTotal, people? }`;
    - `people` chỉ trả cho chủ hệ thống (`isOwner`); vai trò khác không có trường này;
    - quyền đọc như `/api/ai/summary`: thêm `['/api/ai/forecast', ['center']]` vào bảng quyền trong `lib/access.ts`, đặt trước dòng `/api/ai/summary`;
    - `Cache-Control: no-store`.

**Test** (`tests/forecast-day.test.ts`, `tests/forecast-run.test.ts`):
- `hourShares` bỏ ngày lạ đúng; `cum` tăng dần, `cum[24]=1`.
- `forecastToday`: ba nhánh `share`. Kết quả không nhỏ hơn `actual`. Lúc 23:59 sai khác với `actual` không quá 2%.
- `forecastWeek` cộng đúng.
- `decompose`: 6 ca, tổng `soChia + tiLeChot + giaTriDon + khac` bằng đúng `actual.net − expected.net` (so số nguyên). Gồm ca CSKH không nhận số, ca `closed = 0`, ca người nghỉ (`A1 = 0, closed1 = 0`).
- `personExpected` bỏ ngày không làm; người dưới 3 ngày ra `null`.
- `maybeForecastTick` trên D1 giả: lượt 7:00 tạo `morning` và một điểm; lượt 7:30 thêm điểm, giữ nguyên `morning`; lượt 6:30 không làm gì. Mỗi lượt ghi đúng 1 dòng (đếm qua D1 giả).
- Route: vai trò khác chủ hệ thống không nhận `people`.

Tiêu chí xong: bốn lệnh đạt. Chạy demo local (`DEMO_MODE=1`), gọi `/api/ai/forecast` có số hợp lý (không âm, không NaN), chép một mẫu JSON (số ảo của demo) vào tóm tắt.

**C3. Tách chênh lệch cuối ngày, cuối tuần, và Claude viết giải thích qua Batch**

File được sửa: `lib/forecast-review.ts` (mới), `lib/forecast-run.ts`, `lib/demo/fake-claude.ts`, `app/api/ai/forecast/review/route.ts` (mới), `worker.ts`, `lib/access.ts`, `tests/*.test.ts`, `tests/support/**`.

1. `buildDayReview(db, date)`: cho ngày `date` đã qua (thường là hôm qua).
   - Đọc `ai_forecast:<date>` (phần `morning`) và số thực tế từng người trong `stats_daily` của `date`.
   - Không có `morning`: lấy `personExpected` tính lại tại chỗ, ghi rõ `basis: 'tinh-lai'`.
   - Với mỗi người, phân loại rồi tách chênh:

     | Nhóm | Điều kiện | Tách chênh |
     |---|---|---|
     | `nghi` | dự kiến có số mà thực tế `assigned = 0` và `closed = 0` | ghi hết phần dự kiến, không qua `decompose` |
     | `moi` | không có dự kiến | không tách |
     | `binhThuong` | còn lại | `decompose(dự kiến, thực tế)` |

   - Toàn công ty:
     - `soChia` = tổng `soChia` mọi người. Đây là phần do số được chia (MKT đổ số) nhiều hay ít.
     - `tiLeChot`, `giaTriDon`, `nghi`, `moi`, `khac`, `chuaGan` = dòng `seller_id = ''`.
     - Tổng các phần phải bằng đúng `thực tế − dự báo đầu ngày`. Có test.
   - `top`: 5 người có `|tiLeChot + giaTriDon|` lớn nhất, ghi dấu (kéo xuống hay kéo lên).
   - **Độ chính xác dự báo:** từ `points` của ngày, lấy dự báo ở các mốc 10:00, 12:00, 15:00, 18:00 (điểm gần nhất trước mốc). So với doanh thu cuối ngày, ra `% sai` từng mốc.
   - Trả `DayReview` (JSON, chỉ số, mã nhân viên, không tên).
2. `buildWeekReview(db, weekStart)` cho tuần thứ Hai đến Chủ nhật vừa xong:
   - "dự kiến" của từng người = trung bình 4 tuần trước đó (các tuần đủ 7 ngày);
   - tách bằng `decompose` như trên trên tổng tuần;
   - thêm `% sai` trung bình của dự báo ngày trong tuần, mốc 12:00.
3. **Lời nhắc hệ thống** cho phân tích (hằng `REVIEW_SYSTEM`, tiếng Việt):
   - "Bạn là trợ lý phân tích bán hàng của một công ty bán thuốc thú y / thủy sản qua 6 cửa hàng Pancake POS, bộ phận Sale, CSKH, Marketing. Dữ liệu là JSON đã tính sẵn: dự báo đầu ngày, thực tế, phần chênh đã tách theo nguyên nhân và theo người."
   - "Viết tối đa 8 gạch đầu dòng tiếng Việt, mỗi dòng một câu ngắn: chênh bao nhiêu, phần lớn nhất do đâu, ai kéo xuống, ai kéo lên, người nghỉ, một việc nên làm."
   - "Chỉ dùng số có trong dữ liệu, viết tiền dạng '12,5 triệu'. Không tự cộng trừ ra số mới. Không đoán nguyên nhân ngoài dữ liệu."
   - "Nhắc tới nhân viên thì viết đúng dạng [[nv:MÃ]], không viết tên. Không dùng chữ 'chốt', 'doanh thu' cho Vận đơn."
4. **Gửi bằng Batch:**
   - `maybeReviewTick(now)` gọi từ `scheduled` 5 phút một lần, các việc:

     | Giờ VN | Việc | Khoá lưu |
     |---|---|---|
     | Từ 00:20 | Tạo bản ngày cho hôm qua, nếu chưa có | `ai_review:<date>` |
     | Thứ Hai từ 00:40 | Tạo bản tuần trước, nếu chưa có | `ai_week:<weekStart>` |

   - Giá trị JSON: `{ status: 'batch' | 'done' | 'error' | 'off', data: DayReview, batchId?, text?, usage?, usd?, at, error? }`.
   - Trình tự:
     1. Tạo bản ghi với `data` trước (để web hiện số ngay).
     2. `claudeMode()` là `'live'` và `budgetLeft(db,'review').ok`: gửi `client.messages.batches.create({ requests: [{ custom_id, params }] })` với `params = { model, max_tokens: 4000, system: REVIEW_SYSTEM, messages: [{ role:'user', content: JSON.stringify(data) }], output_config: { effort: 'medium' } }`. Lưu `status:'batch'`, `batchId`.
     3. `'demo'`: lấy `fakeAnswer('review' | 'week', …)`, lưu `status:'done'` ngay.
     4. `'off'` hoặc hết trần: lưu `status:'off'` kèm lý do. Web vẫn hiện bảng số.
   - Lượt sau, với bản đang `batch` và lần hỏi gần nhất quá 5 phút:
     - `client.messages.batches.retrieve(batchId)`;
     - `processing_status === 'ended'` thì đọc `client.messages.batches.results(batchId)`, khớp theo `custom_id`, không theo thứ tự;
     - `succeeded`: kiểm `stop_reason` (xem mục Mô hình), lấy chữ, lưu `done`, `usage`, `usd`, rồi `addSpend(…, { batch: true })`;
     - `errored` / `expired` / `canceled`: lưu `error`;
     - quá 26 giờ chưa xong: lưu `error`.
   - Mỗi lần hỏi trạng thái ghi lại mốc `checkedAt`, một dòng mỗi 5 phút, tối đa vài lần mỗi ngày.
5. `app/api/ai/forecast/review/route.ts`, chỉ chủ hệ thống:
   - `GET ?date=` trả bản ngày;
   - `GET ?week=YYYY-MM-DD` trả bản tuần;
   - `POST { date }` hoặc `{ week }` ("Phân tích lại"): gọi `client.messages.create` trực tiếp (không Batch), cùng `params`. Kiểm `budgetLeft` trước, cộng `addSpend` sau. Trả bản mới.
   - Thêm `/api/ai/forecast/review` vào `OWNER_ONLY` trong `lib/access.ts`. Phải khớp trước `/api/ai/forecast`; kiểm thứ tự so khớp tiền tố trong file.
6. **Mã nhân viên trong chữ:**
   - Hàm `withNames(text, names)` thay `[[nv:MÃ]]` bằng tên nhân viên (lấy như `insightForDisplay` trong `lib/ai-insight.ts`). Mã lạ thì thành "nhân viên không rõ".
   - Chỉ chạy ở phía máy chủ khi trả cho chủ hệ thống. Trong D1 vẫn lưu dạng mã.
7. **Test:**
   - Tổng các phần khớp tuyệt đối.
   - Người nghỉ, người mới, dòng chưa gán vào đúng nhóm.
   - `top` đúng thứ tự.
   - Trạng thái Batch qua client giả: `create` rồi `retrieve` (đang chạy), `retrieve` (xong) rồi `results`, ra `done`. Cũng thử nhánh `errored` và nhánh `refusal`.
   - Không có khoá + demo ra `done` với trả lời mẫu. Không khoá + web thật ra `off`.
   - `withNames` thay đúng, mã lạ không lộ ra.
   - Route: vai trò khác chủ hệ thống bị 403.

Tiêu chí xong: bốn lệnh đạt. Demo local có `ai_review:<hôm qua>` trạng thái `done` (trả lời mẫu). Chép mẫu JSON vào tóm tắt.

**C4. Hỏi đáp: gói số, công cụ đọc số, gọi Claude, trần câu hỏi, nhật ký**

File được sửa: `lib/ai-ask.ts` (mới), `lib/ai-ask-pack.ts` (mới), `lib/demo/fake-claude.ts`, `app/api/ai/ask/route.ts` (mới), `lib/access.ts`, `tests/*.test.ts`, `tests/support/**`.

1. **Gói số** `buildAskPack(db, today)` trả một chuỗi văn bản. Phải **giống hệt từng byte** khi gọi lại trong cùng ngày nếu số không đổi: sắp xếp cố định theo mã, số làm tròn cố định, không chèn giờ hiện tại. Nội dung theo thứ tự, mỗi phần có dòng tiêu đề và dòng tên cột (kiểu CSV, phân cách `;`):
   - a. **Định nghĩa** (cố định):
     - "số được chia" = số điện thoại được giao trong ngày;
     - "chốt trong số chia" = trong số đó đã chốt;
     - "đơn chốt" theo ngày xác nhận lần đầu;
     - "doanh thu" = tiền đơn chốt, triệu đồng, 1 chữ số thập phân;
     - "hoàn" = đơn hoàn;
     - "tỉ lệ chốt" = chốt trong số chia / số được chia.
   - b. **Theo tuần, 8 tuần đủ gần nhất** (thứ Hai – Chủ nhật, không gồm tuần hiện tại), mỗi người một dòng mỗi tuần: `tuan;ma;bo_phan;team;so_chia;chot_tu_so;don_chot;doanh_thu_tr;hoan`.
   - c. **Theo ngày, 14 ngày đến hôm qua**, cùng cột với `ngay` thay `tuan`.
   - d. **Giờ vàng toàn công ty 28 ngày đến hôm qua, gộp theo thứ × giờ:** `thu;gio;so_chia;chot_tu_so;doanh_thu_tr`, chỉ các ô khác 0. Lấy theo cách của `lib/sale-hours.ts` / truy vấn giờ trong `lib/sale-analytics.ts`, không lọc chỉ Sale.
   - e. **Lý do chưa chốt 14 ngày, theo người:** `ma;ly_do;so_don`.
     - Nhóm lý do lấy từ phân loại có sẵn (`reasonSummary` / `classifyReason` trong `lib/advisor.ts`, cùng truy vấn nguồn ở `advisorReport`).
     - **Chỉ gửi số đếm theo nhóm, không gửi chữ ghi chú.**
     - Nếu tách theo người tốn nhiều đọc D1 (quá 2 giây trên demo) thì chỉ gửi toàn công ty, ghi vào "Chỗ làm khác plan".
   - f. **Chi phí MKT theo ngày 14 ngày** (toàn công ty, triệu đồng), lấy từ nguồn mà trang Chi phí & ROAS đang dùng.
   - Người: chỉ người được tính (counted). Kèm bộ phận (`sale`/`cskh`/`mkt`/`other`) và mã team như `buildAiPack` trong `lib/ai-pack.ts`. Không tên.
   - Giới hạn: gói vượt 200.000 ký tự thì bỏ bớt phần b từ tuần cũ nhất, ghi một dòng "đã bỏ tuần … vì gói quá lớn" (không cắt im lặng).
2. **Phần hôm nay** (đặt **sau** điểm cache, vì đổi theo giờ): dự báo mới nhất từ `ai_forecast:<hôm nay>` (`actual`, `today`, `week`, giờ) và số hôm nay đến giờ từng người (`stats_daily` của hôm nay).
3. **Công cụ** (định nghĩa JSON Schema, `strict: true`, `additionalProperties: false`), chỉ đọc:
   - `so_lieu_nguoi`:
     - vào: `{ tu: string, den: string, ma_nv: string[] | null, gom: 'ngay' | 'tuan' | 'ca_ky' }`;
     - khoảng ngày tối đa 92 ngày, không trước `COMPANY_START`, không sau hôm nay; tối đa 3.000 dòng;
     - trả CSV như phần b/c.
   - `gio_vang`:
     - vào: `{ tu: string, den: string, ma_nv: string[] | null }`;
     - tối đa 31 ngày;
     - trả CSV như phần d, có thể lọc theo người.
   - Tham số sai: trả `tool_result` có `is_error: true` và lời báo ngắn, không ném lỗi.
4. **Gọi Claude**, hàm `askClaude(db, question, user)`:
   - Kiểm `question` là chuỗi, cắt khoảng trắng, dài 1 … `ASK_MAX_CHARS`.
   - `takeAskSlot` (hết lượt thì trả 429 "Hôm nay đã hỏi đủ 40 câu").
   - `budgetLeft(db,'ask')` (hết thì 429 "Đã chạm trần chi phí tháng này").
   - `claudeMode()`:
     - `'off'` trả 503 "Chưa gắn khoá Claude";
     - `'demo'` trả `fakeAnswer('ask', pack)`.
   - `'live'`:
     - `system` là mảng hai khối: `[{ type:'text', text: ASK_SYSTEM }, { type:'text', text: pack, cache_control: { type:'ephemeral' } }]`;
     - `messages: [{ role:'user', content: <phần hôm nay> + '\n\nCâu hỏi: ' + question }]`;
     - `tools` như trên, `tool_choice: { type: 'auto' }`, `max_tokens: 8000`, `output_config: { effort: 'medium' }`.
   - Vòng công cụ:
     - `stop_reason === 'tool_use'`: chạy mọi `tool_use` trong lượt, trả **tất cả** `tool_result` trong **một** tin `user`;
     - nối nguyên `response.content` của trợ lý vào `messages` (giữ cả khối `thinking`, không sửa hay xoá tin cũ);
     - tối đa 4 vòng, quá thì trả phần chữ đã có kèm câu "Câu hỏi cần nhiều số hơn, anh hỏi hẹp lại giúp em".
   - `stop_reason === 'refusal'` thì báo từ chối; `max_tokens` thì trả phần đã có kèm ghi chú bị cắt.
   - Cộng `addSpend` cho **mỗi** lần gọi API trong vòng (cộng dồn usage).
   - `ASK_SYSTEM` (tiếng Việt) gồm các ý sau:
     - trợ lý phân tích bán hàng của công ty (như C3);
     - "dữ liệu trong khối số và công cụ là nguồn duy nhất; thiếu số để trả lời thì nói thiếu gì, không bịa";
     - trả lời ngắn, mở đầu bằng câu trả lời; dùng gạch đầu dòng; so sánh thì so với trung bình bộ phận và với 2–3 người cùng bộ phận;
     - nói "vì sao" chỉ khi số chỉ ra (tỉ lệ chốt, số chia, giá trị đơn, lý do chưa chốt, giờ làm việc);
     - nhắc nhân viên bằng `[[nv:MÃ]]`; tiền viết "12,5 triệu";
     - không dùng chữ chốt / doanh thu cho Vận đơn.
5. **Nhật ký**, khoá `ai_ask:<YYYY-MM-DD>:<số thứ tự 3 chữ số>`:
   - `{ q, a, usage, usd, at, by: user.userId, mode }`;
   - một dòng mỗi câu; `a` lưu dạng mã;
   - số thứ tự lấy từ `used` của `takeAskSlot`.
6. `app/api/ai/ask/route.ts`, chỉ chủ hệ thống (thêm `/api/ai/ask` vào `OWNER_ONLY`):
   - `POST { question }` trả `{ answer (đã thay tên), usd, mode, used, cap }`;
   - `GET` trả 20 câu gần nhất trong 7 ngày (đã thay tên) và chi tiêu tháng `{ usd, cap, calls }`.
7. **Test:**
   - Gói giống hệt từng byte giữa hai lần gọi.
   - Gói không có chuỗi dạng SĐT, email, chữ ghi chú, tên người: dùng dữ liệu giả có tên và ghi chú, kiểm chúng không lọt vào gói.
   - Gói quá lớn bị bỏ tuần cũ có ghi dòng báo.
   - Công cụ từ chối khoảng ngày quá dài.
   - Vòng công cụ với client giả:
     - một lượt `tool_use` rồi `end_turn`, đúng thứ tự tin, mọi `tool_result` trong một tin;
     - 5 lượt `tool_use` thì dừng ở 4;
     - nhánh `refusal`.
   - Trần 40 câu và trần tiền.
   - `addSpend` cộng mọi lần gọi.
   - Route 403 với vai trò khác.

Tiêu chí xong: bốn lệnh đạt. Demo local hỏi một câu ra trả lời mẫu. Ghi độ dài gói (ký tự) trên dữ liệu demo vào tóm tắt.

**C5. Giao diện: thẻ dự báo trên Điều hành, bản phân tích đêm, trang Hỏi AI**

File được sửa: `app/center-view.tsx`, `app/exec-blocks.tsx`, `app/ai-ask-view.tsx` (mới), `app/forecast-card.tsx` (mới), `app/dashboard.tsx`, `lib/access.ts`, `lib/nav-structure.ts`, `app/globals.css`, `tests/*.test.ts`.

1. **Thẻ "Dự báo doanh thu"** trên Điều hành (`app/forecast-card.tsx`, đặt trong `center-view.tsx`, gần khối tiến độ tháng `MonthPace`). Đọc `/api/ai/forecast`, làm mới 10 phút một lần.
   - Hai số lớn: "Cuối ngày dự kiến" và "Cả tuần dự kiến", kèm "Đã có X" và thanh tiến độ đã có / dự kiến.
   - Biểu đồ đường nhỏ (Recharts có sẵn trong repo) theo các điểm `points`:
     - đường "Đã có" (màu chính `--primary`);
     - đường "Dự kiến cuối ngày" (nét đứt);
     - trục giờ.
   - Dòng nhỏ "Tính lúc HH:MM · dự báo đầu ngày X". Chưa tới 7:00 thì "Dự báo bắt đầu từ 7:00".
   - Không đặt nhãn chữ đè góc ô số (lỗi 19/10). Không dùng `::after` tuyệt đối trong ô.
   - Bấm vào thẻ (chủ hệ thống) thì mở trang Hỏi AI, mục "Hôm qua".
2. **Khối "Hôm qua dự báo lệch bao nhiêu"** (chỉ chủ hệ thống, trên Điều hành dưới thẻ dự báo, và trong trang Hỏi AI). Đọc `/api/ai/forecast/review?date=<hôm qua>`.
   - Một dòng: "Dự báo đầu ngày X, thực tế Y, lệch Z (±%)".
   - Thanh ngang chia phần lệch theo nguyên nhân: số chia, tỉ lệ chốt, giá trị đơn, nghỉ, khác. Âm màu đỏ, dương màu xanh. Có chú thích chữ, không chỉ dựa màu.
   - Bảng 5 người ảnh hưởng nhất: tên, phần do tỉ lệ chốt, phần do giá trị đơn. Bấm tên mở trang nhân viên như các bảng khác, giữ bộ lọc.
   - Các gạch đầu dòng Claude viết; đang chờ thì "Claude đang viết, có trước 7h sáng".
   - Trạng thái `off` thì "Chưa gắn khoá Claude, bảng số vẫn đúng".
   - Nút "Phân tích lại" (POST).
3. **Trang "Hỏi AI"** (`app/ai-ask-view.tsx`):
   - view id `ai-ask`; thêm vào `OWNER_VIEWS` và `VIEW_LABELS` ("Hỏi AI") trong `lib/access.ts`;
   - nạp lười trong `app/dashboard.tsx` như `DispatchView`, chỉ hiện khi `isOwner(user)`;
   - lối vào: nút "Hỏi AI" ở đầu màn Điều hành (chỉ chủ hệ thống), cộng một tab trong nhóm phù hợp của `lib/nav-structure.ts` nếu Điều hành có nhóm. Không có thì chỉ nút.
   - Nội dung trang:
     - ô nhập nhiều dòng (tối đa 1000 ký tự, có đếm), nút "Hỏi", và 4 câu gợi ý bấm được:
       - "Tuần này sale nào chốt kém nhất, vì sao?"
       - "So sánh tỉ lệ chốt các team Sale 4 tuần gần đây"
       - "CSKH nào tăng doanh thu tốt nhất tháng này?"
       - "Giờ nào số về nhiều mà chốt ít?"
     - đang chờ: hiện "Claude đang đọc số…" và khoá nút;
     - lỗi 429 / 503 hiện đúng lời báo.
   - Câu trả lời hiện markdown đơn giản: in đậm, gạch đầu dòng, đoạn. Tự viết bộ đổi nhỏ hoặc dùng thư viện có sẵn trong repo. **Không** dùng `dangerouslySetInnerHTML` với chữ chưa lọc.
   - Lịch sử 20 câu gần nhất (thu gọn được).
   - Thẻ nhỏ "Chi phí tháng này: ~X USD / trần 30 USD · hôm nay đã hỏi N/40".
   - Các mục "Hôm qua" (khối ở mục 2) và "Tuần trước" (bản tuần, cùng kiểu).
4. Sáng / tối và bề rộng 390px đều đọc được. Dùng biến màu có sẵn trong `app/globals.css`, không thêm màu cứng.
5. **Test:**
   - Test thuần cho bộ đổi markdown: không cho thẻ HTML lọt qua.
   - Test quyền: `ai-ask` thuộc `OWNER_VIEWS`.
6. **Chụp ảnh** demo local (ảnh để ngoài repo, ghi đường dẫn vào tóm tắt):
   - Điều hành có thẻ dự báo;
   - trang Hỏi AI sau một câu hỏi (trả lời mẫu);
   - mỗi trang ở 1440px và 390px, sáng và tối.

Tiêu chí xong: bốn lệnh đạt, có ảnh.

---

**R1. Sửa sau kiểm: quyền xem dự báo, chỉ mục pos_id, mã Batch, ghi D1 và chi phí**

Tổ web tổng và một người soát độc lập đã đọc C1–C5. Bước này sửa đúng các điểm dưới, không thêm tính năng. Giữ nguyên mọi con số đang có trên web.

File được sửa: `lib/claude.ts`, `lib/forecast-day.ts`, `lib/forecast-run.ts`, `lib/forecast-review.ts`, `lib/ai-ask.ts`, `lib/ai-ask-pack.ts`, `lib/access.ts`, `lib/demo/fake-claude.ts`, `app/api/ai/ask/route.ts`, `app/api/ai/forecast/route.ts`, `app/api/ai/forecast/review/route.ts`, `app/center-view.tsx`, `app/forecast-card.tsx`, `app/ai-ask-view.tsx`, `app/dashboard.tsx`, `worker.ts`, `tests/*.test.ts`, `tests/support/*`.

Phải sửa (chặn gộp demo):

1. **Mã yêu cầu Batch sai dạng.** API Batch chỉ nhận `custom_id` khớp `^[a-zA-Z0-9_-]{1,64}$`. Hiện code gửi `ai_review:2026-10-18` (có dấu `:`), nên mọi lần gửi bản đêm và bản tuần sẽ bị trả lỗi 400.
   - Dùng `custom_id` dạng `review-2026-10-18` / `week-2026-10-13`, ở cả lúc gửi lẫn lúc khớp kết quả.
   - `keyOf` chỉ dùng làm khoá `app_settings`.
   - Client giả trong test phải kiểm `custom_id` theo đúng mẫu trên, và có test chứng minh mã có `:` bị từ chối.
2. **Câu đọc `raw_pos_orders` và `stats_daily` không lọc `pos_id`, nên quét toàn bảng.** Mọi chỉ mục của hai bảng này đều bắt đầu bằng `pos_id`, và bảng đơn trên web thật rất lớn.
   - Thêm `pos_id IN (?,…)` với danh sách `POS` (lấy từ `lib/report-model.ts`) vào mọi câu đọc hai bảng này trong `lib/forecast-run.ts`, `lib/forecast-review.ts`, `lib/ai-ask-pack.ts`. Làm như `lib/advisor.ts` đang làm.
   - Câu theo giờ trong `runForecast` đang nối 5 khoảng ngày bằng `OR`. Tách thành 5 câu (gọi `db.batch` hoặc lần lượt), mỗi câu `pos_id IN (…) AND first_closed_at>=? AND first_closed_at<?` để dùng được chỉ mục `idx_raw_orders_pos_closed_status_money`.
   - Không tạo chỉ mục mới. Không đổi cách tính.
   - Test: dựng SQLite với chỉ mục như migration, chạy `EXPLAIN QUERY PLAN` các câu mới, khẳng định không còn `SCAN raw_pos_orders` / `SCAN stats_daily` (phải là `SEARCH … USING … INDEX`).
3. **Lộ số toàn công ty cho tài khoản bị giới hạn.** `/api/ai/forecast` hiện trả doanh thu hôm nay, dự báo ngày, dự báo tuần và đường theo giờ của toàn công ty cho bất kỳ ai xem được Điều hành, kể cả tài khoản chỉ được vài POS hoặc một nhóm.
   - Chỉ trả số khi người xem là chủ hệ thống, hoặc là giám đốc (`role === 'director'`) được xem mọi POS (`posIds === null`) và mọi nhóm (`team === 'all'`). Đây là cách `/api/ai/summary` đang chặn phần số.
   - Người khác nhận 403. `ForecastCard` không hiện với họ (truyền cờ từ `dashboard.tsx` / `center-view.tsx` như `canRegenerateAi`, hoặc thẻ tự ẩn khi nhận 403, không báo lỗi đỏ).
   - Test route: chủ hệ thống thấy số; giám đốc đủ quyền thấy số nhưng không có `people`; trưởng nhóm, nhân viên, giám đốc bị giới hạn POS hay nhóm đều nhận 403.

Nên sửa trong bước này:

4. **Gói số cho hỏi đáp dựng lại mỗi câu hỏi.** Giữ trong bộ nhớ của isolate theo ngày giờ VN (`today`). Cùng ngày thì dùng lại, đổi ngày thì dựng mới. Như vậy phần đầu lời nhắc giống hệt từng byte, nên đọc được từ cache.
5. **Chặn nhầm câu hỏi có tên nhân viên.** Mã nhân viên dạng UUID làm biểu thức SĐT khớp nhầm khoảng 15% số câu.
   - Kiểm SĐT / email trên câu gốc `question.trim()` trước khi đổi tên thành mã.
   - Đổi tên chỉ khi khớp trọn từ (ranh giới từ Unicode), không thay giữa chữ.
   - Test với mã UUID giả và tên ngắn nằm trong từ dài hơn.
6. **Bớt dòng ghi D1** (mục tiêu dưới 170 dòng mỗi ngày như bảng "Ước ghi D1").
   - Hỏi đáp: cộng chi tiêu các lượt trong vòng công cụ vào biến, ghi `addSpend` một lần cuối câu (kể cả khi lỗi giữa chừng). Kiểm trần ở mỗi lượt bằng chi tiêu đã lưu cộng phần đang cộng dồn.
   - Hỏi trạng thái Batch: chỉ ghi `app_settings` khi trạng thái đổi. Mốc lần hỏi cuối giữ trong bộ nhớ, hoặc hỏi 30 phút một lần.
7. **Mất tiền của Batch khi bấm "Phân tích lại".** Bản ghi đang ở trạng thái `batch` thì không cho phân tích lại trực tiếp, trả lời "Đang chờ bản phân tích đêm". Nếu không, Batch cũ bị bỏ, không ai hỏi kết quả, và tiền của nó không vào sổ chi tiêu.
8. **Giới hạn "Phân tích lại".** Tối đa 3 lần mỗi ngày giờ VN, đếm bằng khoá `ai_review_count:YYYY-MM-DD` theo cách của `takeAskSlot`. Thêm tiền tố này vào `pruneAiRows` (giữ 7 ngày). Lần gọi trực tiếp tính vào trần hỏi đáp 30 USD, không dùng 5 USD thêm của bản đêm.
9. **`max_tokens` của bản phân tích là 4000, quá thấp.** Sonnet 5.5 nghĩ trước khi viết và phần nghĩ tính vào `max_tokens`. Nâng lên 16000. Tiền chỉ tính theo token dùng thật.
10. **Lượt hỏi bị trừ dù không gọi.** Kiểm trần tiền và kiểm chế độ (`off`) trước `takeAskSlot`.
11. **Báo sai lý do khi chạm trần.** Bản phân tích dừng vì trần chi tiêu phải có `status: 'error'` và câu "Đã chạm trần chi phí tháng này", không phải `off` ("Chưa gắn khoá").
12. **Trường có thể rỗng trong công cụ.** `ma_nv` dùng `anyOf: [{ type: 'array', items: { type: 'string' } }, { type: 'null' }]` thay cho `type: ['array','null']`.
13. **Chữ thừa từ lượt gọi công cụ.** Câu trả lời chỉ lấy phần chữ của lượt cuối (lượt không dừng ở `tool_use`), không nối chữ kiểu "để em xem số…" của các lượt trước.
14. **Lỗi lịch chạy.**
    - `worker.ts`: `maybeReviewTick(...)` có `.catch` như các dòng bên cạnh.
    - Log lỗi ghi tên loại lỗi (`error.name`, mã HTTP nếu có), không ghi nội dung yêu cầu hay khoá.
    - Bản đêm lỗi thì lần chạy lịch sau trong cùng khung giờ được thử lại một lần.
    - `createReview` không ghi bản ghi `off` trước khi gọi API. Chỉ ghi kết quả sau khi gọi xong hoặc khi gửi Batch xong.
15. **Tổng thực tế tuần.** `forecastForDisplay` trả thêm `weekActual` (thực tế từ thứ Hai đến giờ). Thẻ dự báo hiện "Đã đạt X / dự kiến Y" và thanh tiến độ tuần thay cho câu "Chưa có tổng thực tế tuần trong gói dự báo".
16. **Bỏ ký tự BOM** ở đầu `lib/ai-ask.ts`, `lib/forecast-review.ts`, `app/api/ai/ask/route.ts`, `app/api/ai/forecast/review/route.ts`, `tests/support/register-native.mjs`.

Tiêu chí xong:
- Bốn lệnh `pnpm typecheck`, `pnpm test`, `pnpm lint`, `pnpm build` đều qua. Lint không thêm lỗi.
- Có test mới cho các mục 1, 2, 3, 5, 6, 7, 8, 10, 11, 13.
- Tóm tắt ghi số câu đọc `raw_pos_orders` / `stats_daily` mỗi lần chạy dự báo và mỗi câu hỏi, trước và sau khi sửa.

## Sau khi Codex xong (Claude làm, không phải Codex)

1. Kiểm một lần trên đám mây:
   - đọc diff;
   - chạy lại bốn lệnh;
   - chạy riêng các test mới;
   - `rg` tìm `ANTHROPIC_API_KEY`, `dangerouslySetInnerHTML`, chữ ghi chú hay SĐT lọt vào gói.
2. Gộp vào nhánh demo bằng merge thường, `WORLD_VERSION` giữ `'5'`.
3. Gửi anh Artifact ảnh và hướng dẫn có ảnh để anh tự dán khoá vào biến bí mật của Worker. Bản demo là Worker `tong-hop-pos-demo`; muốn xem trả lời thật trên số ảo thì dán ở đó trước.
4. Anh xem demo xong, nhắn ok, mới lên web thật. Khi đó anh dán khoá vào Worker `tong-hop-pos`.

## Ước ghi D1 (để đối chiếu khi kiểm)

| Việc | Dòng mỗi ngày |
|---|---|
| Dự báo 30 phút một lần (07:00–23:30) | ≈ 34 |
| Bản đêm + hỏi trạng thái Batch | ≈ 10 |
| Bản tuần (chia đều cho 7 ngày) | ≈ 2 |
| Hỏi đáp: ≤ 40 câu × 3 dòng (nhật ký, đếm câu, sổ chi tiêu) | ≤ 120 |
| Dọn dòng cũ | ≈ 5 |

Tổng dưới 170 dòng mỗi ngày, khoảng 5.000 dòng mỗi tháng, dưới 0,01% phần gói gồm.
