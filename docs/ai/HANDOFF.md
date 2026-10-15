# HANDOFF: ghi chú bàn giao (ghi đè mỗi lần dừng)

## Lần cập nhật cuối
- **Thời gian:** 2026-10-15 17:10
- **Người viết:** Codex
- **Nhánh / commit:** `giao-dien-moi`; HEAD `38cdfbc`; thay đổi T2 chưa commit do quyền ghi .git bị từ chối.

## Đã xong
- T2: đổi `--sb-ink-3` ở `:root` thành `#7F9A8B`.
- `app/globals.css:728–731`: thêm luật dark dùng outline/border theo `--ring` / `--primary` cho KPI đang chọn, lift focus, ring-hover focus, nav-flash và KPI đang/vừa cập nhật. Giữ luật light; không sửa @theme inline hoặc .den-*.
- `npm run typecheck`: exit 0 (`tsc --noEmit`).
- `npm test`: exit 1, `Error: spawn EPERM` (28 file không khởi chạy được, chưa xác minh 112 test).
- `npm run build`: exit 1, `failed to load config ... vite.config.ts`, có `[plugin externalize-deps] Error: spawn EPERM`; kèm `UNLOADABLE_DEPENDENCY` oxide (`stream did not contain valid UTF-8`) và `UNRESOLVED_IMPORT` lightningcss (`Could not resolve '../pkg'`). Chưa có `Build complete`.
- Theo PLAN mục 6: test/build: spawn EPERM, chờ Claude chạy; không thử lách sandbox, không BLOCKED.
- Kiểm mã: đủ 5 nhóm selector có luật dark; không có box-shadow !important quét toàn cục; diff hex chỉ đổi token :root; `git diff --check` đạt.

## Đang dở
- Code T2 đã xong; app/globals.css, docs/ai/PROGRESS.md và docs/ai/HANDOFF.md chưa commit. Test/build chờ Claude xác minh ngoài sandbox.

## Việc kế tiếp
- Làm T3 theo PLAN.md. Lượt này chỉ làm T3. Không git add/commit (PLAN mục 6).

## BLOCKED
- Không có. (Không commit được .git là do sandbox; Claude commit, xem PLAN mục 6.)

## Lưu ý cho người làm tiếp
- PROGRESS đặt BLOCKED vì chưa commit được; checklist T2 đã tích theo ngoại lệ kiểm tra tại PLAN mục 6. T3–T6 chưa hoàn thành.
- Không push, không deploy. Không sửa PLAN.md hoặc CONVENTIONS.md.
