# HANDOFF: ghi chú bàn giao (ghi đè mỗi lần dừng)

## Lần cập nhật cuối
- **Thời gian:** 2026-10-15 21:06 (giờ máy local)
- **Người viết:** Codex
- **Nhánh / commit:** demo-gop; HEAD acaaedf; đang merge 47d5c9b. Không chạy lệnh Git ghi.

## Đã xong
- Chỉ làm GOP-DEMO; đọc AGENTS, HANDOFF, PROGRESS, PLAN (gồm mục 6), CONVENTIONS.
- app/dashboard.tsx: gỡ 2 khối; giữ HrTeamPicker theo quyền và điều kiện !hrUnit của demo; giữ main max-w-[1360px], px-4/md:px-6 và nhánh presenting của giao diện mới. Nhóm menu vẫn dùng token, giữ tab/view/nhãn demo.
- app/overview-sections.tsx: gỡ 2 khối; import cả DeltaPill và TableWrap; caption Vận đơn theo sentBasis của demo, giữ TableWrap và kiểu dáng mới.
- app/ui-kit.tsx: gỡ 1 khối; giữ useTableCardLabels, tbl-wrap và class card gap-3/p-5/max-sm:p-4 của giao diện mới; giữ state critter và CritterSlot của demo.
- Không còn marker <<<<<<< / ======= / >>>>>>> trong 3 file (rg không có kết quả).
- npm run typecheck: exit 0 (tsc --noEmit).
- npm test: exit 1; Error: spawn EPERM; 45 file không khởi chạy, pass 0 / fail 45 ở mức file; chưa xác minh test nghiệp vụ.
- npm run build: exit 1; failed to load config from vite.config.ts; Build failed with 8 errors; plugin externalize-deps Error: spawn EPERM. Kèm UNLOADABLE_DEPENDENCY oxide (stream did not contain valid UTF-8), UNRESOLVED_IMPORT lightningcss (Could not resolve '../pkg'), resolve react/react-dom gặp spawn EPERM; chưa có Build complete.
- test/build: spawn EPERM, chờ Claude chạy. Áp dụng PLAN mục 6, không BLOCKED, không thử lách sandbox.
- git diff --check: exit 0; kiểm hex diff acaaedf trong 3 file không có kết quả. node_modules sẵn có, không cài gói.
- Đã tích GOP-DEMO và đặt STATUS: DONE; không làm task khác.

## Đang dở
- Không còn code đang sửa cho GOP-DEMO.
- Git index vẫn ghi UU cho 3 file do không git add; đây là trạng thái merge chưa được Claude stage, không phải còn marker trong working tree.

## Việc kế tiếp
- Claude kiểm tra diff, chạy npm test + npm run build ngoài sandbox, nghiệm thu và stage/hoàn tất merge khi đạt.
- Codex dừng sau GOP-DEMO theo yêu cầu, không tự chạy tiếp task nào.

## BLOCKED
- Không có; spawn EPERM thuộc ngoại lệ PLAN mục 6.

## Lưu ý cho người làm tiếp
- Lượt này chỉ sửa app/dashboard.tsx, app/overview-sections.tsx, app/ui-kit.tsx, docs/ai/PROGRESS.md và docs/ai/HANDOFF.md.
- Nhiều thay đổi đã có sẵn trong index do merge; docs/ai/PLAN.md cũng đã có thay đổi từ trước. Không sửa hoặc hoàn nguyên các thay đổi đó.
- Không git add/commit/merge/reset/checkout, không push/deploy, không đổi nhánh; giữ nguyên trạng thái merge cho Claude.
