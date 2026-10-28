# Chỉ tải ô đang xem (lazy load theo màn hình), 28/10/2026

Anh Vũ giao (28/10, sau khi xem video về IntersectionObserver): "làm". Codex viết code; Claude kiểm một lần khi xong.

## Mục tiêu

Hiện mỗi trang (Tổng quan Sale/CSKH, Tổng quan chung, Điều hành, Nhóm/Team…) vừa mở là gọi hết mọi API báo cáo, kể cả ô ở cuối trang người xem chưa kéo tới. Mỗi lời gọi là lượt đọc D1, mà web phải nằm trong gói 5 USD.

Sau khi làm:
- Ô nằm trong màn hình đầu tiên vẫn tải ngay như cũ.
- Ô ở dưới chỉ gọi API khi sắp lộ ra (cách mép màn hình khoảng 300px).
- Ô đã tải rồi thì giữ số, kéo đi kéo lại không gọi lại.
- Số liệu, giao diện, cách tính không đổi gì.

## Nền có sẵn (đọc trước)

- `app/use-api.ts`: `useApi(url, opts)`; `url = null` thì không tải. Có số lưu IndexedDB (`readSnapshot`) hiện ngay khi có.
- `app/ui/chart-motion.ts`, `app/ui/count-up.tsx`, `app/loading-critter/slot.tsx` đã dùng IntersectionObserver cho hiệu ứng: xem cách viết, giữ cùng kiểu.
- Người que chờ tải (`app/stickman/`, `app/loading-critter/`) chạy trên ô đang tải: ô chưa tới lượt tải KHÔNG được hiện người que hay khung lỗi, chỉ hiện khung chờ tĩnh như lúc đang tải hiện nay (hoặc số lưu nếu có).
- Luật giao diện: `docs/ai/AGENTS-giao-dien.md`.

## Việc cần làm

### Bước 1. Móc chung

Tạo `app/use-in-view.ts`:
- `useInView<T extends Element>(opts?: { rootMargin?: string; once?: boolean })` trả `[ref, seen]`.
- Mặc định `rootMargin: '300px 0px'`, `once: true` (đã thấy một lần thì `seen` giữ `true`, rồi `unobserve`).
- Trình duyệt không có IntersectionObserver, hoặc chạy phía máy chủ: `seen = true` ngay (tải như cũ).
- Callback nhẹ: chỉ `setSeen(true)`, luôn kiểm `entry.isIntersecting` (callback chạy ngay lúc observe với `false`).
- Ô đã nằm trong màn hình lúc mở trang phải ra `seen = true` ngay ở lần đo đầu, không trễ thêm một nhịp.

Tạo `useLazyApi<T>(url, opts)` trong `app/use-api.ts` (hoặc file riêng cạnh nó):
- Trả `{ ref, ...useApi(seen ? url : null, opts) }`.
- Khi chưa `seen`: vẫn đọc `readSnapshot(url)` để hiện số lưu lần trước nếu có (không gọi máy chủ). Trạng thái lúc này: `loading: true`, `stale: true` nếu có số lưu. Không tính vào `useRefreshStatus` (không làm nút Tải lại quay) cho tới khi thật sự gọi.
- `refreshMs` (tự tải lại định kỳ) chỉ chạy khi ô đã `seen`.

### Bước 2. Áp vào các trang

Trong từng file dưới, ô nào KHÔNG nằm trong màn hình đầu ở cả điện thoại 390×844 lẫn máy tính 1440×900 thì đổi `useApi` sang `useLazyApi` và gắn `ref` vào khung ngoài cùng của ô đó. Ô nằm trong màn hình đầu ở một trong hai cỡ thì giữ `useApi`.

Xét lần lượt (đếm số `useApi` trong file):
- `app/center-view.tsx` (9), `app/team-groups-view.tsx` (6), `app/cskh-view.tsx` (4), `app/sale-quality-view.tsx` (4), `app/product-group-blocks.tsx` (4), `app/team-overview-view.tsx` (3), `app/overview-trends.tsx` (3), `app/forecast-card.tsx` (3), `app/overview-view.tsx`, `app/overview-sections.tsx`, `app/van-don-view.tsx`, `app/team-kpi-progress.tsx`, `app/sale-analytics-view.tsx`, `app/compare-view.tsx`, `app/care-view.tsx`, `app/advisor-panel.tsx`, `app/uncounted-view.tsx`, `app/staff-compare.tsx`.
- Bỏ qua: ô chọn/lọc (`hr-team-picker.tsx`, danh sách nhân viên cho bộ lọc), thanh trên cùng, mọi API không phải báo cáo số (đăng nhập, cài đặt, giao việc).

Chú ý:
- Hai ô gọi chung một URL (máy chủ nhớ 3 phút theo URL, ví dụ thẻ Tổng quan và bảng bên dưới cùng gọi `/api/reports/product-groups?...`): ô nào tải trước thì ô kia vẫn gọi lại khi lộ ra, nhưng máy chủ trả từ bộ nhớ, không đọc D1 lại. Không cần gộp.
- Đổi bộ lọc (kỳ, POS, Sale/CSKH, team…): ô đã thấy thì tải lại như cũ; ô chưa thấy thì chưa gọi, tới khi lộ ra mới gọi với bộ lọc mới.
- Bấm vào số mở trang chi tiết: trang chi tiết là trang mới, áp cùng luật.
- Xuất Excel hay nút nào cần dữ liệu của ô chưa tải: bấm thì gọi tải ô đó trước rồi mới xuất (hoặc giữ `useApi` cho ô đó). Liệt kê trong mục "Kết quả" các ô giữ `useApi` vì lý do này.
- Ảnh chụp tự động (`kiem-trinh-duyet` trong CI, Playwright) có thể chụp cả trang: nếu test chờ mọi ô có số thì test phải cuộn tới cuối trang trước (không tắt lazy load trong test).

### Bước 3. Đo trước/sau (bắt buộc, ghi vào mục Kết quả)

Chạy cục bộ chế độ demo (DEMO_MODE=1, dữ liệu ảo), Playwright, tài khoản `chu@demo.megatech.vn`. Với mỗi trang: Tổng quan (`?view=overview`), Tổng quan Sale (`sale-overview`), Tổng quan CSKH (`cskh-overview`), Điều hành (`center`):
- Đếm số lời gọi `/api/reports/*` và `/api/*` khác trong 10 giây đầu, KHÔNG cuộn. Cỡ 390×844 và 1440×900.
- Đếm lại sau khi cuộn tới cuối trang.
- Bảng trước (main) / sau (nhánh này). Kỳ vọng: không cuộn thì ít hơn rõ; cuộn hết thì bằng trước.

## Kiểm

- Test mới `tests/use-in-view.test.ts` (node:test, theo kiểu test giao diện sẵn có trong `tests/`): giả IntersectionObserver; ô chưa giao thì `useLazyApi` không gọi fetch; giao màn hình thì gọi đúng 1 lần; giao lại không gọi thêm; không có IntersectionObserver thì gọi ngay.
- `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build` đều đạt. Không `pnpm format` cả repo.
- CI clone nông: test không gọi lịch sử git.
- Không migration, không đổi API máy chủ, WORLD_VERSION giữ '5'.

## Ước chi phí Cloudflare

- Không thêm câu đọc hay ghi nào. Chỉ bớt lượt gọi API khi người xem không kéo hết trang, nên lượt đọc D1 giảm (mức giảm ghi ở bảng đo bước 3).
- Không thêm Worker, không thêm bảng.

## Bàn giao

Nhánh `codex/tai-theo-man-hinh-2810` (từ main). Xong thì đẩy nhánh, ghi mục "Kết quả" (bảng đo + danh sách ô giữ `useApi` và lý do) vào cuối file này, báo điều phối kèm commit. Không lên demo (anh cấm), không lên web thật. Claude kiểm một lần, chụp ảnh gửi anh; anh "ok lên" mới lên web thật.

## Kết quả

(Codex điền)
