# HANDOFF: ghi chú bàn giao (ghi đè mỗi lần dừng)

## Lần cập nhật cuối
- **Thời gian:** 2026-10-15 17:25 (giờ máy local)
- **Người viết:** Codex
- **Nhánh / commit:** giao-dien-moi; HEAD a6441d3; T6 chưa commit theo PLAN mục 6.

## Đã xong
- Chỉ làm T6: đọc AGENTS/HANDOFF/PROGRESS/PLAN/CONVENTIONS; rà toàn diff 3e4e35a..HEAD bằng lệnh kiểm hex ở mục 6 và đối chiếu các dòng thêm với hex còn trong file hiện tại.
- Không sửa code. Không có vị trí hex mới được thêm ngoài vùng cho phép trong diff; có hai giá trị hex tại vị trí metadata đã tồn tại ở layout.tsx:21–22 được đổi sang màu nền mới (#F4F7F1 / #0A1310). Đây vẫn là hex ngoài vùng được phép theo quy ước, cần Claude xét; không coi chúng là token hoặc tự tạo ngoại lệ. Metadata màu thanh trình duyệt cần giá trị màu cụ thể, nên không thay bằng var(--bg) không được phân giải trong metadata.
- Các dòng hex được thêm còn lại đều thuộc :root/.dark trong globals.css hoặc STATUS_COLORS trong ui-kit.tsx. Các hex bị xóa ở nhóm menu và exec-blocks không còn trong file hiện tại. Các dòng mask #000 xuất hiện trong ngữ cảnh diff đã có từ nền, không phải hex mới.
- npm run typecheck: exit 0 (tsc --noEmit).
- npm test: exit 1; 28 file không khởi chạy vì Error: spawn EPERM; pass 0, fail 28 ở mức file; chưa xác minh 112 test nghiệp vụ.
- npm run build: exit 1; failed to load config from vite.config.ts; Build failed with 8 errors; [plugin externalize-deps] Error: spawn EPERM; kèm UNLOADABLE_DEPENDENCY oxide (stream did not contain valid UTF-8), UNRESOLVED_IMPORT lightningcss (Could not resolve '../pkg'), resolve react-dom gặp spawn EPERM. Chưa có Build complete.
- test/build: spawn EPERM, chờ Claude chạy. Áp dụng PLAN mục 6, không BLOCKED, không thử lách sandbox.
- git diff --check đạt. node_modules sẵn có nên không cài gói. Không git add/commit, push hoặc deploy.

## Đang dở
- Không có code đang sửa. T6 đã tích theo ngoại lệ PLAN mục 6; PROGRESS đặt DONE | T6.
- Kiểm thử ngoài sandbox, quyết định về hex metadata và nghiệm thu trực quan còn chờ Claude.

## Việc kế tiếp
- **chờ Claude nghiệm thu giao diện**.
- Claude chạy npm test (ít nhất 112/112) và npm run build (Build complete) ngoài sandbox, xem các hex còn lại dưới đây; thêm FIX-* nếu cần.
- Claude làm NT: sáng/tối ở 390 / 768 / 1280 / 1920px, tương phản, bàn phím/focus/KPI, so số liệu cùng bộ lọc; commit T6 sau khi đạt.
- Codex dừng tại T6, không thực hiện NT.

## BLOCKED
- Không có lỗi lệnh ngoài trường hợp sandbox đã được PLAN mục 6 cho ngoại lệ.

## Lưu ý cho người làm tiếp
- Khi bắt đầu working tree sạch, nhánh giao-dien-moi, HEAD a6441d3. Lượt này chỉ sửa PROGRESS.md và HANDOFF.md.
- Không sửa PLAN.md / CONVENTIONS.md hoặc file cấm. Không đánh dấu NT hoàn tất.
- Danh sách dưới đây ghi mọi dòng còn hex trong các file được chỉ định và các view thuộc phạm vi; bỏ khối đăng nhập .den-* và các file ngoài phạm vi mục 2. Hex cũ ngoài token chỉ được ghi nhận, không tự sửa theo T6 (T6 chỉ cho sửa hex mới lọt ra).

## Hex còn lại trong phạm vi
- globals.css: token :root/.dark, token Google :root, mask đen, các màu cứng cũ ở badge/menu/chip/demo; ui-kit.tsx: POS_COLORS, fallback posColor và STATUS_COLORS.
- layout.tsx: hai màu metadata như ghi ở trên.
- compare-view.tsx, monthly-view.tsx, overview-view.tsx: màu chart xuất slide có sẵn.
- center-view.tsx, exec-blocks.tsx, dashboard.tsx, overview-sections.tsx, uncounted-view.tsx và components/ui/sidebar.tsx: không còn hex.
- Chi tiết file:dòng và nội dung (số dòng tại HEAD a6441d3):
```text
app/compare-view.tsx:203: { type: 'chart', height: Math.min(560, 60 + chartRows.length * 28), config: { type: 'bar', data: { labels: chartRows.map((r) => r.name), datasets: [{ label: 'Tỷ lệ chốt %', data: chartRows.map((r) => r.rate), backgroundColor: chartRows.map((r) => r.rate >= TARGET ? SLIDE_COLORS.green : r.rate >= (totals.median ?? 0) ? '#5bbf91' : SLIDE_COLORS.orange), borderRadius: 4, unit: '%' }] }, options: { indexAxis: 'y', plugins: { legend: { display: false } }, scales: { x: { min: 0, max: 100 } } } } },
app/globals.css:66: --bg:#F4F7F1; --surface:#FFFFFF; --surface-2:#EDF2E9; --surface-3:#E4EBDF; --card-line:var(--line); --line:#DFE7DB; --line-2:#d5dfd6; --line-3:#c9d6ca;
app/globals.css:67: --ink:#0F2318; --ink-2:#4A6153; --ink-3:#596D62; --ink-4:#5D6C63;
app/globals.css:68: --primary:#17684B; --primary-2:#145a41; --primary-ink:#FFFFFF; --accent-ink:var(--primary); --ring:#17684B; --tint:rgba(23,104,75,.12); --tint-2:#eef7f1;
app/globals.css:69: --good:#147745; --good-bg:rgba(27,175,122,.12); --bad:#B83332; --bad-bg:rgba(240,128,119,.12); --warn:#B24700; --warn-bg:rgba(255,138,61,.12);
app/globals.css:70: --sb:#0F3328; --sb-ink:#E8F5EC; --sb-ink-2:#A7C6B3; --sb-ink-3:#7F9A8B; --sb-line:#2b5d4e; --sb-accent:#255947; --sb-hover:#1a4a3b; --sb-box:#1b4c3b; --sb-panel:rgba(217,243,109,.06); --lime:#D9F36D; --lime-ink:#0F3328;
app/globals.css:71: --t-green-bg:#e4f5ea; --t-green:#17684b; --t-blue-bg:#e6f0fb; --t-blue:#266CC1; --t-orange-bg:#fdeee4; --t-orange:#B34F23; --t-teal-bg:#e1f5f0; --t-teal:#0D7C65;
app/globals.css:72: --t-red-bg:#fdeaea; --t-red:#C03D3C; --t-purple-bg:#ede9f9; --t-purple:#5b48b8; --t-gray-bg:#eef1ee; --t-gray:#5d7266; --t-lime-bg:#f1f8d6; --t-lime:#5a7a12;
app/globals.css:73: --pos-1:#2a78d6; --pos-2:#eb6834; --pos-3:#1baf7a; --pos-4:#eda100; --pos-5:#e87ba4; --pos-6:#4a3aa7;
app/globals.css:74: --st-new:#89988F; --st-confirmed:#2a78d6; --st-shipping:#C78700; --st-delivered:#1a9c5b; --st-returned:#eb6834; --st-cancelled:#d24b4b;
app/globals.css:75: --series-1:#17684B; --series-2:#B24700; --series-3:#2A78D6;
app/globals.css:76: --chart-grid:#e6ede6; --chart-fill:rgba(23,104,75,.12); --chart-bar:rgba(23,104,75,.45);
app/globals.css:78: --skel-1:#e8eee7; --skel-2:#f6f9f5;
app/globals.css:79: --ai-1:#b8d63a; --ai-2:#1baf7a; --ai-3:#2a78d6; --ai-4:#7f6fd2; --ai-5:#e87ba4;
app/globals.css:88: --bg:#0A1310; --surface:#11211A; --surface-2:#182D23; --surface-3:#20392D; --card-line:#24402F; --line:#24402F; --line-2:#2f4638; --line-3:#375547;
app/globals.css:89: --ink:#ECF3EC; --ink-2:#A8BDAF; --ink-3:#8DA195; --ink-4:#92A096;
app/globals.css:90: --primary:#D9F36D; --primary-2:#D9F36D; --primary-ink:#0F3328; --accent-ink:var(--primary); --ring:#D9F36D; --tint:rgba(217,243,109,.16); --tint-2:#1a3d2f;
app/globals.css:91: --good:#5FCF8F; --good-bg:rgba(95,207,143,.16); --bad:#F08077; --bad-bg:rgba(240,128,119,.16); --warn:#FF8A3D; --warn-bg:rgba(255,138,61,.16);
app/globals.css:92: --sb:#0F3328; --sb-ink:#E8F5EC; --sb-ink-2:#A7C6B3; --sb-ink-3:#7F9A8B; --sb-line:#1f3a2e; --sb-accent:#1b3429; --sb-hover:#152820; --sb-box:#12261d; --sb-panel:rgba(217,243,109,.05);
app/globals.css:93: --t-green-bg:#1c4634; --t-green:#8bd5ab; --t-blue-bg:#1d3a5c; --t-blue:#8fbdf0; --t-orange-bg:#4a2a1a; --t-orange:#f2a27c; --t-teal-bg:#173f38; --t-teal:#6fd3bb;
app/globals.css:94: --t-red-bg:#4a2320; --t-red:#f39a94; --t-purple-bg:#2d2750; --t-purple:#b3a6ee; --t-gray-bg:#22342b; --t-gray:#b5caba; --t-lime-bg:#2e3a12; --t-lime:#cfe27a;
app/globals.css:95: --pos-1:#3f86dc; --pos-2:#e06a3c; --pos-3:#1baf7a; --pos-4:#bf8608; --pos-5:#d66594; --pos-6:#7f6fd2;
app/globals.css:96: --st-new:#8a9a90; --st-confirmed:#3f86dc; --st-shipping:#c99010; --st-delivered:#2fb36f; --st-returned:#e06a3c; --st-cancelled:#e06060;
app/globals.css:97: --series-1:#D9F36D; --series-2:#FF8A3D; --series-3:#6FD3BB;
app/globals.css:98: --chart-grid:#26392f; --chart-fill:rgba(217,243,109,.16); --chart-bar:rgba(217,243,109,.5);
app/globals.css:100: --skel-1:#1e3228; --skel-2:#284035;
app/globals.css:101: --ai-1:#d9f36d; --ai-2:#3fd49a; --ai-3:#5b9cf0; --ai-4:#a597f0; --ai-5:#f09ac0;
app/globals.css:110: --sidebar-accent: var(--sb-accent); --sidebar-accent-foreground: #fff; --sidebar-border: var(--sb-line); --sidebar-ring: var(--lime);
app/globals.css:203: .tbl-wrap[data-more="right"] { -webkit-mask-image: linear-gradient(to left, transparent 0, #000 32px); mask-image: linear-gradient(to left, transparent 0, #000 32px); }
app/globals.css:204: .tbl-wrap[data-more="left"] { -webkit-mask-image: linear-gradient(to right, transparent 0, #000 32px); mask-image: linear-gradient(to right, transparent 0, #000 32px); }
app/globals.css:205: .tbl-wrap[data-more="left right"] { -webkit-mask-image: linear-gradient(to right, transparent 0, #000 32px, #000 calc(100% - 32px), transparent 100%); mask-image: linear-gradient(to right, transparent 0, #000 32px, #000 calc(100% - 32px), transparent 100%); }
app/globals.css:299: -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0); -webkit-mask-composite: xor; mask-composite: exclude;
app/globals.css:330: -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0); -webkit-mask-composite: xor; mask-composite: exclude; animation: ai-spin 2.2s linear infinite; }
app/globals.css:468: .demo-login { padding: 12px; border-radius: 14px; border: 1px dashed rgb(167 198 179 / .3); background: rgb(7 30 22 / .45); color: #cde3d4; }
app/globals.css:469: .demo-account { display: flex; align-items: center; justify-content: space-between; gap: 10px; width: 100%; padding: 8px 10px; border-radius: 10px; border: 1px solid rgb(167 198 179 / .2); background: rgb(26 74 59 / .6); text-align: left; cursor: pointer; color: #e8f5ec; }
app/globals.css:470: .demo-account:hover { border-color: #8bd5ab; }
app/globals.css:472: .demo-ribbon { position: fixed; left: 50%; bottom: calc(10px + env(safe-area-inset-bottom)); transform: translateX(-50%); z-index: 80; pointer-events: none; padding: 4px 12px; border-radius: 999px; font-size: 11.5px; font-weight: 600; color: #5b3a00; background: #ffe9b3; border: 1px solid #f3cf73; box-shadow: 0 2px 8px rgb(0 0 0 / .12); white-space: nowrap; }
app/globals.css:477: .dark .posb { color: color-mix(in srgb, var(--c) 70%, #fff); background: color-mix(in srgb, var(--c) 22%, var(--surface)); }
app/globals.css:478: .posb.is-solid { background: var(--c); color: #fff; box-shadow: none; }
app/globals.css:493: .poschip .ck { width: 15px; height: 15px; border-radius: 50%; background: var(--c); color: #fff; display: grid; place-items: center; }
app/globals.css:494: .dark .poschip .ck { background: color-mix(in srgb, var(--c) 75%, #fff); color: var(--bg); }
app/globals.css:545: .nav-item:hover { color: #fff; }
app/globals.css:547: .nav-item.is-active { color: #fff; font-weight: 500; background: var(--sb-accent); }
app/globals.css:551: .nav-item .cnt.hot { color: #ffd6d3; background: rgba(240,128,119,.18); }
app/globals.css:557: .nav-title .badge { font-family: var(--font-ui); font-variant-numeric: tabular-nums; font-weight: 600; font-size: 10px; letter-spacing: 0; text-transform: none; color: #d6f2e0; background: rgba(126,226,168,.16); border-radius: 999px; padding: 1px 7px; white-space: nowrap; }
app/globals.css:640: -webkit-mask-image: linear-gradient(to bottom, transparent, #000 .24em, #000 calc(100% - .24em), transparent); mask-image: linear-gradient(to bottom, transparent, #000 .24em, #000 calc(100% - .24em), transparent); }
app/globals.css:676: -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0); -webkit-mask-composite: xor; mask: linear-gradient(#000 0 0) content-box exclude, linear-gradient(#000 0 0); }
app/globals.css:683: .mod-chip { flex: none; display: grid; place-items: center; width: 18px; height: 18px; border-radius: 6px; color: #fff; box-shadow: inset 0 0 0 1px rgba(255,255,255,.18); }
app/globals.css:691: .dept-name { display: inline-flex; align-items: center; gap: 6px; padding: 6px 12px 6px 8px; margin-right: 4px; font-weight: 700; font-size: 13px; color: #c2410c; border-right: 1px solid var(--line); }
app/globals.css:703: :root { --g-blue: #4285f4; --g-purple: #9b72cb; --g-red: #ea4335; --g-yellow: #fbbc04; --g-green: #34a853;
app/globals.css:711: -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0); -webkit-mask-composite: xor; mask-composite: exclude; animation: ai-spin 3.2s linear infinite; }
app/layout.tsx:21: { media: '(prefers-color-scheme: light)', color: '#F4F7F1' },
app/layout.tsx:22: { media: '(prefers-color-scheme: dark)', color: '#0A1310' },
app/monthly-view.tsx:162: { type: 'chart', height: 380, config: { type: 'bar', data: { labels: posChart.map((p) => p.name), datasets: [{ label: 'Đơn chốt (tr)', data: posChart.map((p) => p.closed), backgroundColor: '#9fd8b8', borderRadius: 4, unit: 'tr' }, { label: 'Giao thành công (tr)', data: posChart.map((p) => p.delivered), backgroundColor: posChart.map((p) => posColor(p.id)), borderRadius: 4, unit: 'tr' }] }, options: { scales: { y: { beginAtZero: true } } } } },
app/overview-view.tsx:405: ...(report.compare ? [{ label: 'Kỳ trước: đơn tạo', data: series.map((r) => r.compareOrders), borderColor: '#c9d9cf', borderDash: [4, 4], pointRadius: 0, tension: .3 }, { label: 'Kỳ trước: đơn chốt', data: series.map((r) => r.compareClosed), borderColor: '#9db3a5', borderDash: [4, 4], pointRadius: 0, tension: .3 }] : []),
app/ui-kit.tsx:42: export const POS_COLORS = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#4a3aa7'];
app/ui-kit.tsx:43: export const posColor = (posId: string) => POS_COLORS[POS.findIndex((p) => p.id === posId)] ?? '#52514e';
app/ui-kit.tsx:46: export const STATUS_COLORS = { new: '#89988F', confirmed: '#2a78d6', shipping: '#C78700', delivered: '#1a9c5b', returned: '#eb6834', cancelled: '#d24b4b' } as const;
```
