# Web tổng học từ Odoo: cách chia trang quản trị và tối ưu cho doanh nghiệp (15/10/2026)

Thread "Kế hoạch Odoo Megatech" viết. Anh Vũ duyệt hướng ngày 12/10 ("giao diện vẫn ưu tiên bên mình… học trong đấy cách chia các trang quản trị, cách người ta tối ưu cho doanh nghiệp") và ngày 15/10 bảo triển khai: "m lên plan chi tiết, codex làm, xong xuôi m kiểm thử".
Bản cho anh xem: plan bản 2 (12 ý, 5 đợt). Plan này là bản chi tiết để Codex làm.

## 1. Mục tiêu
- Giữ nguyên giao diện web tổng (màu, kiểu thẻ, biểu đồ, giao diện mới đang làm trên nhánh `giao-dien-moi`). Chỉ học Odoo:
  - Mỗi bộ phận chia trang theo một khuôn cố định: **Hôm nay · Danh mục · Báo cáo · Cấu hình**.
  - Mỗi người có **Việc của tôi** chia **Quá hạn / Hôm nay / Sắp tới**.
  - Trang chi tiết khách có **nút số** bấm ra danh sách và **dòng lịch sử**.
  - **Ô tìm kiếm chung** có Bộ lọc, Nhóm theo, Yêu thích.
  - **Quyền theo bậc** cho từng bộ phận thay cho tích từng trang.
  - Báo cáo **lý do hoàn**, **dự báo cuối tháng**, **bảng xoay**.
- Nguồn học (đã đọc mã Odoo 19.0): `addons/sale/views/sale_menus.xml`, `addons/crm/views/crm_menu_views.xml`, `addons/account/views/account_menuitem.xml`, `addons/sales_team/security/sales_team_security.xml` (3 bậc: chỉ của mình / tất cả / quản trị), `addons/mail/models/mail_activity_mixin.py` (activity_state: overdue / today / planned).

## 2. Không được đổi
- Mọi con số và cách tính đang có (doanh thu = ô Tổng cộng Pancake từng POS cộng lại, tách Sale/CSKH/MKT; doanh số chỉ tính người có hậu tố MKT, CSKH, SALE).
- Tên nghiệp vụ: Vận đơn dùng "Đơn chuyển đi", "Doanh số chuyển đi", "Đơn vào Chờ xác nhận", "Người lên đơn"; không gọi là bán hàng/chốt/doanh thu.
- Quyền phía máy chủ: mọi API vẫn kiểm bằng `lib/access.ts` như cũ. KPI (`cskh-kpi`, `sale-kpi`), `config`, `audit`, `dispatch` vẫn chỉ chủ hệ thống (`OWNER_VIEWS`).
- Id trang (`View` trong `app/dashboard.tsx`) và đường dẫn `#<id>` cũ vẫn mở đúng trang.
- Bộ lọc ngày chung, bấm số ra trang giữ bộ lọc, che SĐT theo vai trò, con vật chờ tải, kiểu dáng của giao diện mới.
- Không thêm migration, không sửa `.github/**`, `wrangler*.json*`, `drizzle/**`, `migrations/**`. Cấu hình mới lưu ở bảng `app_settings` có sẵn (khóa dạng `odoo.<tên>`).
- Không ghi gì về Pancake hay web nhân sự.

## 3. Hiện trạng (dòng theo nhánh demo `claude/project-thread-3ujeoc` @47d5c9b; trên `demo-gop`/`giao-dien-moi` dòng có thể lệch, tìm theo tên)
- `app/dashboard.tsx:162` kiểu `View`; `:367` mảng `navigation` (id, nhãn, biểu tượng); `:406` `NavGroup`; `:408` `DEPTS` (Sale 8 tab, CSKH 7, Marketing 2, Vận đơn 2); `:418` `deptOf`; `:419` `NAV_GROUPS` (Điều hành, Doanh thu, Bộ phận, Khách hàng, Báo cáo & AI, Hệ thống); `:643` `SidebarNav`; `:1385` dựng `navGroups` theo `canView`; `:1392` `navCounts` (số nhỏ trên menu); `:1506-1522` thanh tab bộ phận (`nav.dept-tabs`).
- `lib/access.ts`: `Role`, `VIEW_LABELS`, `ALL_VIEWS`, `OWNER_VIEWS`, `DIRECTOR_VIEWS`, `IMPLIED`, `canView`, `parseAccess`.
- `app/users-panel.tsx:20-32`: nhóm trang khi tích quyền và `PRESETS` theo vai trò.
- `app/api/reports/cskh-badge/route.ts`: đếm khách quá 20 ngày chưa ghi chú (`pos_customers.last_note_at`).
- `lib/customer360.ts`, `app/customer360-view.tsx`: Khách hàng 360 đọc `customer_stats` (không quét đơn gốc), có danh sách khách tới hạn gọi lại.
- `app/raw-orders-view.tsx`: danh sách đơn nguồn, chi tiết đơn có `history` (lịch sử trạng thái) và `returnedReason` (từ `raw_json.returned_reason_name`, xem `app/api/raw/orders/detail/route.ts:52`).
- `app/customers-view.tsx`: Hồ sơ khách hàng.
- `lib/alerts.ts`: cảnh báo Telegram theo `alert_rules`; `worker.ts:338` `scheduled` chạy mỗi phút, phần nặng mỗi 5 phút.
- `db/schema.ts`: `raw_pos_orders` (status_code, seller_id, creator_id, first_confirmed_at, last_status_at, returned_at, raw_json…), `targets` (mục tiêu tháng theo POS/nhân viên), `report_presets` (lưu bộ báo cáo), `customer_notes`, `pos_users` (email nhân viên Pancake), `app_settings`.
- Nối tài khoản web với nhân viên Pancake: `lower(pos_users.email) = lower(users.email)` (một người có thể có tài khoản ở nhiều POS).
- `lib/demo/`: dữ liệu ảo; mọi logic mới phải chạy được với `DEMO_MODE=1`.

## 4. Thiết kế
- `lib/nav-structure.ts` (mới, không import React): một chỗ duy nhất mô tả bộ phận → nhóm (Hôm nay / Danh mục / Báo cáo / Cấu hình) → id trang + nhãn tab. `app/dashboard.tsx` đọc từ đây thay cho hằng `DEPTS`.
- `lib/my-tasks.ts` (mới): tính việc của một người từ dữ liệu sẵn có, chỉ đọc. `app/api/tasks/route.ts` (mới).
- `lib/stuck-alert.ts` (mới): cảnh báo đơn kẹt, cấu hình ở `app_settings`, gọi trong `scheduled`.
- `lib/customer-timeline.ts` (mới) + `app/api/reports/customer-detail/route.ts` (mới): nút số và dòng lịch sử của một khách.
- `app/search-bar.tsx` (mới): ô tìm kiếm chung, Yêu thích lưu bằng `/api/presets` sẵn có (kiểu preset mới `search:<trang>`), nếu API không nhận thì lưu `localStorage` bọc try/catch.
- `lib/access-levels.ts` (mới): bậc quyền theo bộ phận → danh sách trang + nhóm; chỉ là cách điền nhanh vào `views`/`team` có sẵn, không đổi bảng.
- `lib/return-reasons.ts` (mới) + route; `lib/forecast.ts` (mới); bảng xoay trong `app/custom-report-view.tsx`.

## 5. Các bước
Mỗi bước: Codex chỉ sửa file trong danh sách, tự chạy `pnpm typecheck`, `pnpm test`, `pnpm lint`, `pnpm build`. Mọi nhãn mới tiếng Việt. Không đổi số.

**N1. Khung chia trang theo khuôn Odoo**
- File được sửa: `lib/nav-structure.ts` (mới), `tests/nav-structure.test.ts` (mới).
- Việc cần làm:
  - Xuất `SECTIONS = [{ key: 'today', label: 'Hôm nay' }, { key: 'catalog', label: 'Danh mục' }, { key: 'reports', label: 'Báo cáo' }, { key: 'settings', label: 'Cấu hình' }]`.
  - Xuất `DEPT_LAYOUT`: mảng bộ phận `{ key, label, sections: { key, tabs: [viewId, nhãn][] }[] }`, đúng như sau (nhãn tab giữ như cũ):
    - `sale` "Sale": today = `tasks` "Việc của tôi", `shift` "Trong ngày · chốt nóng", `dispatch` "Chia số"; reports = `sale-overview` "Tổng quan", `sale-teams` "Theo team", `compare` "Nhân viên", `sale-analytics` "Phân tích", `sale-quality` "Chất lượng khách", `returns` "Lý do hoàn"; settings = `sale-kpi` "KPI".
    - `cskh` "CSKH": today = `tasks` "Việc của tôi", `calls` "Cuộc gọi", `care` "Khách theo nhân viên"; reports = `cskh-overview` "Tổng quan", `cskh-teams` "Theo team", `cskh-analytics` "Phân tích", `origin` "Tự ups & từ MKT"; settings = `cskh-kpi` "KPI".
    - `mkt` "Marketing": reports = `marketing` "Tổng quan", `mkt-roas` "Chi phí & ROAS".
    - `van-don` "Vận đơn": today = `pipeline` "Vận hành đơn"; reports = `van-don` "Tổng quan", `returns` "Lý do hoàn".
    - `khach` "Khách hàng": catalog = `customer360` "Khách hàng 360", `customers` "Hồ sơ khách"; reports = `repurchase` "Mua lại & Upsell", `dormant` "Khách lâu chưa mua".
    - `cai-dat` "Cài đặt": settings = `config` "Kết nối & cấu hình", `audit` "Nhật ký", `raw-orders` "Đơn nguồn Pancake", `security` "Bảo mật tài khoản".
  - Một trang có thể nằm ở hai bộ phận (`tasks`, `returns`). Xuất `deptKeysOf(viewId)`, `layoutFor(deptKey, can: (id) => boolean)` (bỏ tab không xem được, bỏ nhóm rỗng), `firstDeptOf(viewId, preferred?)`.
  - Xuất `NEW_VIEWS = ['tasks', 'returns']` để bước sau thêm vào `View` và `VIEW_LABELS`.
- Tiêu chí xong: test chứng minh (a) mọi id trong `DEPTS` cũ có mặt trong `DEPT_LAYOUT`; (b) mọi id trong nhóm "Khách hàng" và "Hệ thống" cũ có mặt ở `khach`/`cai-dat`; (c) `layoutFor` bỏ đúng tab không được xem và nhóm rỗng; (d) không bộ phận nào có tab trùng id trong cùng bộ phận.
- Cách kiểm: `pnpm test` có `nav-structure`.

**N2. Menu và thanh tab dùng khung mới**
- File được sửa: `app/dashboard.tsx`, `app/globals.css`, `lib/access.ts`, `tests/access*.test.ts`.
- Việc cần làm:
  - Thêm `'tasks'` và `'returns'` vào `View`, vào `navigation` (biểu tượng `ListTodo` và `Undo2` của lucide), vào `VIEW_LABELS` ("Việc của tôi", "Lý do hoàn"). `tasks` ai đăng nhập cũng xem được (sửa `canView` như cách đang làm với `security`); `returns` cấp như trang thường, và tự mở cho ai xem được `van-don`, `pipeline` hoặc `sale-overview` (thêm `returns: ['van-don', 'pipeline', 'sale-overview']` vào `IMPLIED`).
  - Thay hằng `DEPTS` bằng dữ liệu từ `lib/nav-structure.ts`. `deptOf(view)` dùng `firstDeptOf(view, deptĐangMở)` để trang chung (`tasks`, `returns`) giữ bộ phận người dùng vừa bấm.
  - `NAV_GROUPS`: nhóm "Bộ phận" gồm Sale, CSKH, Marketing, Vận đơn; nhóm "Khách hàng" và "Hệ thống" đổi thành mục bộ phận `khach` và `cai-dat` (mỗi mục mở trang đầu tiên được xem, các trang con là tab). Điều hành, Doanh thu, Báo cáo & AI giữ như cũ.
  - Thanh tab bộ phận (`nav.dept-tabs`): trước mỗi nhóm có nhãn nhóm nhỏ (`<span class="dept-sec">Hôm nay</span>`…), chỉ hiện khi bộ phận có từ 2 nhóm trở lên. Trên điện thoại vẫn cuộn ngang như cũ. `.dept-sec` dùng màu chữ phụ có sẵn, cỡ 11px, chữ hoa, giãn chữ nhẹ; không thêm màu mới.
  - Số nhỏ trên tab (`navCounts`) giữ nguyên.
  - Trang `tasks`, `returns` chưa có nội dung thì hiện `EmptyState` "Đang làm" (bước V2, B1 sẽ thay).
- Tiêu chí xong: mọi `#<id>` cũ vẫn mở đúng trang và đúng bộ phận; người không có quyền không thấy tab; `pnpm build` qua.
- Cách kiểm: test cho `IMPLIED` mới trong `lib/access.ts`; chạy `pnpm dev` (DEMO_MODE=1) mở `#sale-overview`, `#calls`, `#customer360`, `#config`, `#raw-orders` xem đúng tab sáng.

**V1. Tính "Việc của tôi"**
- File được sửa: `lib/my-tasks.ts` (mới), `app/api/tasks/route.ts` (mới), `lib/demo/**` (bản giả), `tests/my-tasks.test.ts` (mới).
- Việc cần làm:
  - Xác định nhân viên Pancake của người đăng nhập: các `pos_users` có `lower(email)=lower(user.email)`. Chủ hệ thống/giám đốc/trưởng nhóm có thêm tham số `scope=team` (người trong `team` của họ theo `lib/team.ts`) và `scope=all` (chỉ owner, director).
  - Ba loại việc, mỗi việc `{ kind, id, title, subtitle, dueAt, state: 'overdue'|'today'|'planned', link: { view, hint } }`:
    1. `stuck`: đơn của người đó (`seller_id` hoặc `creator_id`) đang ở trạng thái Mới/Chờ xác nhận quá 24 giờ kể từ `created_at` (lấy mã trạng thái từ `lib/order-status.ts`). Quá hạn nếu quá 48 giờ, hôm nay nếu 24–48 giờ. Đọc qua chỉ mục `idx_raw_orders_pos_status_origin`, chỉ 30 ngày gần nhất, tối đa 200 dòng, KHÔNG đọc `raw_json`.
    2. `callback`: khách `pos_customers.assigned_user_id` là người đó, `last_note_at` quá 20 ngày (quá hạn), 15–20 ngày (sắp tới, `dueAt` = last_note_at + 20 ngày), giống luật `cskh-badge`; hôm nay = tới hạn trong ngày.
    3. `dormant`: khách tới hạn gọi lại trong `lib/customer360.ts` (danh sách "tới hạn") có `seller_id` là người đó; tới hạn hôm nay = hôm nay, quá hạn = đã qua, sắp tới = 7 ngày tới.
  - `GET /api/tasks?scope=mine|team|all` trả `{ counts: { overdue, today, planned }, items }`, sắp quá hạn trước. Che SĐT theo vai trò như các route khách hàng hiện có. `Cache-Control: private, max-age=60`.
  - `link`: `stuck` → `raw-orders` kèm gợi ý mã đơn (dùng `nav-focus`), `callback`/`dormant` → `customer360` kèm SĐT (bản đã che nếu vai trò bị che).
- Tiêu chí xong: test hàm thuần chia `state` theo giờ VN (ca biên 24h, 48h, nửa đêm), test che SĐT, demo trả dữ liệu.
- Cách kiểm: `pnpm test`; `pnpm dev` gọi `/api/tasks`.

**V2. Trang "Việc của tôi" và số đỏ trên menu**
- File được sửa: `app/tasks-view.tsx` (mới), `app/dashboard.tsx`, `app/globals.css`.
- Việc cần làm:
  - Trang `tasks`: hàng thẻ số Quá hạn / Hôm nay / Sắp tới (bấm thẻ lọc danh sách), danh sách việc nhóm theo trạng thái, mỗi dòng bấm ra `link`. Trưởng nhóm trở lên có nút chọn "Của tôi / Cả team" (owner, director thêm "Tất cả"). Không có việc thì `EmptyState` "Không có việc tồn".
  - `navCounts.tasks` = số Quá hạn (kiểu `hot`) + Hôm nay; lấy từ `/api/tasks` (chỉ `counts`), làm mới cùng nhịp với `cskhBadge`.
  - Dùng linh kiện có sẵn trong `app/ui-kit.tsx` (KpiCard, TableWrap, EmptyState, StatusChip). Không thêm màu.
- Tiêu chí xong: điện thoại 390px không cuộn ngang trang; sáng/tối đúng; bấm việc mở đúng trang.
- Cách kiểm: `pnpm dev`, chụp `tasks` sáng/tối, 1280px và 390px (nếu máy có Playwright; không có thì ghi lại).

**V3. Tự động báo đơn kẹt**
- File được sửa: `lib/stuck-alert.ts` (mới), `worker.ts` (chỉ thêm một dòng gọi trong `scheduled`, nhịp 30 phút), `app/alert-panel.tsx`, `app/api/stuck-alert/route.ts` (mới, chỉ chủ hệ thống: GET đọc cấu hình, PUT lưu, POST `?dry=1` xem trước), `tests/stuck-alert.test.ts` (mới).
- Việc cần làm:
  - Cấu hình ở `app_settings` khóa `odoo.stuck_alert`: `{ enabled: false, hours: 24, chatId: '', perSellerMax: 5 }`. Mặc định TẮT.
  - Khi bật: mỗi 30 phút đếm đơn kẹt (định nghĩa như V1 loại `stuck`) theo người lên đơn, gửi MỘT tin Telegram tổng hợp vào `chatId` (danh sách người + số đơn kẹt, không SĐT, không tên khách). Không gửi lại cùng một danh sách trong 3 giờ (ghi dấu ở `app_settings` khóa `odoo.stuck_alert.last`).
  - Ở `DEMO_MODE` không gửi Telegram, chỉ trả bản xem trước.
  - Trong Cài đặt → cảnh báo (`alert-panel.tsx`): khối "Báo đơn kẹt Chờ xác nhận": bật/tắt, số giờ, Chat ID, nút "Xem trước" (chạy khô).
- Tiêu chí xong: test dựng tin không chứa SĐT/tên khách; test chống gửi lặp; mặc định tắt.
- Cách kiểm: `pnpm test`; xem trước trên demo.

**C1. Trang chi tiết khách: nút số và dòng lịch sử**
- File được sửa: `lib/customer-timeline.ts` (mới), `app/api/reports/customer-detail/route.ts` (mới), `app/customer-detail.tsx` (mới), `app/customer360-view.tsx`, `app/customers-view.tsx`, `lib/demo/**`, `tests/customer-timeline.test.ts` (mới).
- Việc cần làm:
  - Bấm tên khách trong Khách hàng 360 và Hồ sơ khách mở khung chi tiết (Sheet/Dialog có sẵn trong `components/ui/`).
  - Hàng nút số (như smart button của Odoo): Đơn, Thành công, Hoàn, Huỷ, Tổng tiền (theo cách tính của `customer_stats`), Ghi chú. Bấm nút đơn mở `raw-orders` lọc đúng SĐT và trạng thái; bấm Ghi chú cuộn tới dòng lịch sử.
  - Dòng lịch sử gộp, mới nhất trước: ghi chú (`customer_notes`), đổi trạng thái đơn (từ `status_history_json` của tối đa 20 đơn gần nhất của SĐT đó), lượt xem/tải hồ sơ khách trong `audit_log` (chỉ chủ hệ thống thấy dòng này). Không đọc `raw_json`.
  - Che SĐT theo vai trò như hiện có; quyền theo POS/nhóm như route khách hàng hiện có.
- Tiêu chí xong: test gộp và sắp xếp lịch sử, test che SĐT; mở trên demo được.
- Cách kiểm: `pnpm dev`, mở một khách ở Khách hàng 360.

**C2. Ô tìm kiếm chung: Bộ lọc, Nhóm theo, Yêu thích**
- File được sửa: `app/search-bar.tsx` (mới), `app/raw-orders-view.tsx`, `app/customers-view.tsx`, `app/api/presets/route.ts` (chỉ để nhận kiểu `search:<trang>` nếu đang chặn), `tests/search-bar*.test.ts` (mới, test hàm thuần).
- Việc cần làm:
  - Linh kiện `SearchBar` nhận: ô chữ, danh sách bộ lọc có sẵn (chip bật/tắt), danh sách "Nhóm theo", và khóa trang để lưu Yêu thích. Bộ lọc đang bật hiện thành chip có nút ×.
  - Yêu thích: "Lưu bộ lọc đang dùng" (đặt tên), danh sách Yêu thích bấm là áp lại; lưu qua `/api/presets` theo người dùng.
  - Áp vào Đơn nguồn Pancake (lọc theo trạng thái, POS, Tự ups/từ MKT có sẵn; Nhóm theo: trạng thái, POS, người lên đơn) và Hồ sơ khách (lọc theo người phụ trách, cấp khách; Nhóm theo: người phụ trách, POS). "Nhóm theo" chỉ nhóm các dòng đã tải trên trang, có dòng tổng mỗi nhóm.
  - Không đổi API dữ liệu, không đổi số; bộ lọc cũ đang có thì chuyển vào SearchBar, giữ nguyên tham số gửi lên máy chủ.
- Tiêu chí xong: test hàm nhóm và hàm dựng tham số; hai trang chạy như cũ khi không dùng tính năng mới.
- Cách kiểm: `pnpm dev`, thử lưu và áp một Yêu thích.

**Q1. Quyền theo bậc cho từng bộ phận**
- File được sửa: `lib/access-levels.ts` (mới), `app/users-panel.tsx`, `tests/access-levels.test.ts` (mới).
- Việc cần làm:
  - Bậc cho mỗi bộ phận (Sale, CSKH, Marketing, Vận đơn, Khách hàng): `none` "Không xem", `mine` "Của tôi", `team` "Cả team", `dept` "Cả bộ phận", `admin` "Quản trị bộ phận".
  - Hàm `viewsForLevels(levels)` trả danh sách trang (lấy từ `DEPT_LAYOUT`: `mine` = nhóm Hôm nay; `team`/`dept` = Hôm nay + Báo cáo + Danh mục; `admin` = thêm Cấu hình trừ trang trong `OWNER_VIEWS`). `teamForLevels` trả `team` hiện có (`team` nếu bậc cao nhất là mine/team, `all` nếu dept/admin) — không thêm giá trị team mới.
  - `levelsFromViews(views, team)` đoán ngược bậc để hiện đúng khi mở người cũ.
  - Trong `users-panel.tsx`: thêm khối "Cấp theo bộ phận" (5 hàng, mỗi hàng một ô chọn bậc) phía trên khối tích từng trang; chọn bậc thì điền lại danh sách trang và nhóm, vẫn tích tay thêm/bớt được. Lưu như cũ (`views`, `team`), không đổi API.
- Tiêu chí xong: test `viewsForLevels` không bao giờ trả trang trong `OWNER_VIEWS`; test vòng `levelsFromViews(viewsForLevels(x))` cho các tổ hợp chính.
- Cách kiểm: `pnpm test`; mở Cài đặt → Người dùng trên demo.
- Ghi chú: bước này đụng quyền, QA phải kiểm 4 vai trước khi lên web thật.

**B1. Báo cáo lý do hoàn**
- File được sửa: `lib/return-reasons.ts` (mới), `app/api/reports/returns/route.ts` (mới), `app/returns-view.tsx` (mới), `app/dashboard.tsx` (gắn trang `returns`), `lib/demo/**`, `tests/return-reasons.test.ts` (mới).
- Việc cần làm:
  - Đơn hoàn trong kỳ (theo `returned_at` nằm trong khoảng ngày đang chọn; trạng thái hoàn theo `lib/order-status.ts`), POS đang chọn, nhóm đang chọn. Lọc trước bằng `pos_id` + `created_at` (kỳ mở rộng thêm 60 ngày về trước) + `status_code`, rồi mới `json_extract(raw_json,'$.returned_reason_name')`. Tối đa 5.000 đơn, quá thì ghi rõ "đã giới hạn".
  - Bảng: lý do (trống → "Không ghi lý do") × số đơn, tỉ lệ, tiền hàng; nhóm theo POS, Người lên đơn, sản phẩm chính (dòng hàng đầu tiên). Biểu đồ cột ngang lý do. Bấm một lý do mở `raw-orders` lọc đơn hoàn kỳ đó.
  - Ghi rõ phạm vi: "Đơn hoàn trong kỳ theo ngày hoàn, lý do lấy từ Pancake".
  - Bộ nhớ 10 phút theo vai trò + tham số (như các báo cáo khác dùng).
- Tiêu chí xong: test gom lý do (trống, khác hoa thường, khoảng trắng); trang chạy trên demo.
- Cách kiểm: `pnpm dev` mở `#returns`.

**B2. Mục tiêu và dự báo cuối tháng**
- File được sửa: `lib/forecast.ts` (mới), `app/team-overview-view.tsx`, `app/api/reports/sections/route.ts` hoặc route đang cấp số Tổng quan Sale/CSKH (chỉ thêm trường, không đổi trường cũ), `tests/forecast.test.ts` (mới).
- Việc cần làm:
  - Hàm thuần `forecastMonth({ actual, dayOfMonth, daysInMonth, workingDaysLeft? })` = thực tế ÷ số ngày đã qua × số ngày của tháng (có ngày làm việc thì dùng ngày làm việc). Chỉ hiện khi bộ lọc ngày là tháng hiện tại từ ngày 1.
  - Ở Tổng quan Sale và Tổng quan CSKH: cạnh số doanh thu tháng có dòng "Dự báo cuối tháng: …" và "% mục tiêu" nếu `targets` của tháng có mục tiêu. Ghi rõ "dự báo theo tốc độ từ đầu tháng".
- Tiêu chí xong: test ngày 1, ngày cuối tháng, tháng 2 năm nhuận, không có mục tiêu.
- Cách kiểm: `pnpm dev` mở Tổng quan Sale với kỳ tháng này.

**B3. Bảng xoay trong Báo cáo tùy chỉnh**
- File được sửa: `app/custom-report-view.tsx`, `lib/pivot.ts` (mới), `tests/pivot.test.ts` (mới).
- Việc cần làm:
  - Thêm kiểu hiển thị "Bảng xoay": chọn Hàng (nhân viên, POS, ngày/tuần/tháng có sẵn) và Cột (POS, tháng), một chỉ số đang chọn. Dùng dữ liệu đã tải của báo cáo hiện tại (`/api/reports/overview`), không gọi API mới.
  - Có dòng/cột Tổng; xuất Excel bằng `app/save-xlsx.ts` sẵn có. Lưu vào bộ báo cáo (`config.display = 'pivot'`, thêm `pivotRow`, `pivotCol`; đọc bản cũ không có trường này vẫn chạy).
- Tiêu chí xong: test `lib/pivot.ts` (tổng hàng, tổng cột, ô trống); bộ báo cáo cũ vẫn mở được.
- Cách kiểm: `pnpm dev` mở Báo cáo tùy chỉnh.

**K1. Kiểm tổng và ảnh demo**
- File được sửa: `docs/plans/2026-10-15-hoc-tu-odoo/anh/**` (ảnh), `docs/plans/2026-10-15-hoc-tu-odoo/ket-qua.md`.
- Việc cần làm: chạy `pnpm dev` với `DEMO_MODE=1`; nếu máy có Playwright thì chụp (sáng và tối, 1280px và 390px) các trang: thanh tab Sale, CSKH, Khách hàng, Cài đặt; `tasks`; khung chi tiết khách; Đơn nguồn có SearchBar; `returns`; Tổng quan Sale có dự báo; Báo cáo tùy chỉnh dạng bảng xoay; Người dùng có khối cấp theo bộ phận. Không có Playwright thì ghi "chưa chụp" và lý do. Ảnh chỉ có số ảo.
- Tiêu chí xong: `ket-qua.md` liệt kê từng bước, lệnh kiểm và mã thoát, ảnh đã chụp.

**S1. Sửa sau lượt kiểm của Claude (16/10)**
- Bối cảnh: Claude kiểm nhánh `codex/hoc-tu-odoo` @479700f. Bốn lệnh đạt (test 256/256, lint 1156 lỗi, không hơn gốc 1159). Còn 3 lỗi dưới đây. Chỉ sửa đúng 3 lỗi này, không làm thêm.
- File được sửa: `app/api/reports/overview/route.ts`, `lib/forecast.ts`, `tests/forecast.test.ts`, `lib/my-tasks.ts`, `lib/demo/my-tasks.ts`, `tests/my-tasks.test.ts`, `app/tasks-view.tsx`, `app/dashboard.tsx`, `app/customer-detail.tsx`, `app/api/reports/customer-detail/route.ts`, `lib/customer-timeline.ts`, `tests/customer-timeline.test.ts`.
- Lỗi 1, quyền KPI (B2): trong `app/api/reports/overview/route.ts`, nhánh tính `target` hiện cho cả người không phải chủ hệ thống khi `team === 'sale' && !unit`. Luật đã chốt: KPI Sale và KPI CSKH chỉ chủ hệ thống xem. Sửa: chỉ tính `target` khi `isOwner(user)`; người khác vẫn thấy "Dự báo cuối tháng" nhưng `target` và `targetPercent` luôn `null`. Tách điều kiện thành hàm thuần `forecastTargetAllowed(role)` trong `lib/forecast.ts`, có test: owner được, director/admin/staff không.
- Lỗi 2, link việc khách (V1/V2): việc `callback` và `dormant` mở `customer360` với SĐT đã che, nên vai bị che không tìm được khách, việc không làm được. Sửa:
  - `lib/my-tasks.ts`: mỗi việc `callback`/`dormant` có thêm `customerId` (id dòng `pos_customers`; với `dormant` lấy `MAX(c.id)` của `pos_customers` cùng SĐT trong các POS người đó được xem). Giữ nguyên `subtitle` (SĐT che theo vai như hiện nay). Bản demo `lib/demo/my-tasks.ts` có `customerId` giả.
  - `app/api/reports/customer-detail/route.ts`: nhận thêm tham số `customerId` thay cho `phone`. Máy chủ tự tra SĐT và `pos_id` từ `pos_customers`; `pos_id` phải nằm trong POS người đó được xem (cùng hàm đang dùng cho đường `phone`), không thì 403. Quyền: được xem khi qua kiểm như đường `phone` (`canView` khách hàng / Khách hàng 360), HOẶC khi khách đó có trong chính việc của người đó (`pos_customers.assigned_user_id`, hoặc `customer_stats.seller_id` cùng SĐT, là `pos_users.user_id` khớp email người đó, cùng cách nối email như `loadTaskData` scope `mine`). Vẫn ghi `audit` như cũ. Không trả SĐT đầy đủ cho vai bị che (giữ `customerPhone`).
  - `app/customer-detail.tsx`: prop `customer` nhận `{ phone, posIds }` hoặc `{ customerId }`.
  - `app/tasks-view.tsx` + `app/dashboard.tsx`: bấm việc `callback`/`dormant` mở thẳng khung chi tiết khách (`CustomerDetail` với `customerId`) ngay trên trang Việc của tôi, không chuyển trang. Việc `stuck` giữ như cũ.
  - Test: `customerId` của POS ngoài quyền bị chặn (hàm thuần tách ra trong `lib/customer-timeline.ts`), việc có `customerId`.
- Lỗi 3, tải (V1): câu `callback` trong `loadTaskData` không có `LIMIT`. Thêm `LIMIT 300` (giống `dormant`).
- Tiêu chí xong: 4 lệnh đạt, lint không hơn số gốc, test mới đạt.
- Cách kiểm: đọc diff; test `forecastTargetAllowed` và chặn `customerId` ngoài quyền.

## 6. Kiểm thử (Claude kiểm một lần khi Codex xong hẳn)
- Chạy lại 4 lệnh trên nhánh cuối.
- Đọc diff theo mục 2: không đổi số, không đổi tên nghiệp vụ, không đụng file cấm, không có dữ liệu thật.
- Đăng nhập demo bằng 4 vai (chủ hệ thống, giám đốc, trưởng nhóm, nhân viên): đếm tab thấy được, mở trực tiếp `#sale-kpi` bằng vai nhân viên phải bị chặn, `/api/tasks?scope=all` bằng vai nhân viên phải bị chặn.
- So số trước/sau ở Tổng quan Sale, CSKH, Vận đơn trên demo: phải bằng nhau.
- Đụng quyền (Q1) và số (B1, B2) nên QA kiểm trước khi anh duyệt lên web thật.

## 7. Rủi ro và cách lùi
- Xung đột với giao diện mới: làm trên nhánh nền `demo-gop` (giao diện mới đã gộp nhánh demo) trên PC; dữ liệu menu tách ra `lib/nav-structure.ts` để phần sửa trong `dashboard.tsx` nhỏ nhất. Lùi: bỏ commit N2 là menu về như cũ.
- Tải D1 (điểm gãy khoảng 10 lời gọi/giây): việc của tôi và báo đơn kẹt chỉ đọc chỉ mục có sẵn, giới hạn số dòng, bộ nhớ 60 giây; lý do hoàn có giới hạn 5.000 đơn và bộ nhớ 10 phút.
- Báo đơn kẹt gửi Telegram thật: mặc định tắt, chỉ bật khi anh đồng ý.
- Sai quyền (Q1): chỉ đổi cách điền danh sách trang, máy chủ vẫn kiểm như cũ; QA kiểm 4 vai.
- Ý "lưu trữ thay vì xoá" trong plan bản 2 bỏ ra: web tổng đã ẩn người nghỉ theo web nhân sự, không cần làm thêm.

## 8. Cách chạy trên PC (phiên Remote Control của thread này làm, không nhờ anh dán)
1. Trong `C:\Users\PC\Projects\tong-hop-pos` chỉ dùng `git fetch` và `git worktree`: `git fetch origin claude/project-thread-k051e7`, rồi `git worktree add -b codex/hoc-tu-odoo C:\Users\PC\Projects\thp-odoo demo-gop` (không có `demo-gop` thì `giao-dien-moi`, không có nữa thì `origin/claude/project-thread-3ujeoc`).
2. Trong `thp-odoo`: `git checkout origin/claude/project-thread-k051e7 -- docs/plans/2026-10-15-hoc-tu-odoo`, commit "Plan học từ Odoo", `pnpm install --frozen-lockfile`.
3. Chạy `bash docs/plans/2026-10-15-hoc-tu-odoo/chay-lien-mach.sh` (Git Bash). Script tự báo Telegram nếu có `BAO_TELE`, làm lần lượt N1 → K1, mỗi bước máy kiểm, sai thì giao lại tối đa 3 vòng, đạt thì commit. Xong hoặc dừng thì gom `ket-qua.md`.
4. Đẩy `codex/hoc-tu-odoo` lên GitHub nếu được phép; bị chặn thì để ở máy, Claude kiểm ngay trên PC.
5. Không deploy demo khi chưa báo điều phối (demo dùng chung).
