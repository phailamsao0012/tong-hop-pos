# HANDOFF: ghi chú bàn giao (ghi đè mỗi lần dừng)

## Lần cập nhật cuối
- **Thời gian:** 2026-10-15 17:20
- **Người viết:** Claude
- **Nhánh / commit:** `giao-dien-moi`; commit "T1: kiểm nền" chứa bản bàn giao này.

## Đã xong
- T1 xanh: typecheck exit 0, test 112/112 pass, build "Build complete" (test + build do Claude chạy ngoài sandbox).

## Đang dở
- Không có.

## Việc kế tiếp
- Làm T2 theo PLAN.md. Lượt này chỉ làm T2.
- Lưu ý PLAN mục 6: trong sandbox, `spawn EPERM` ở test/build là do sandbox, không BLOCKED; ghi "chờ Claude chạy" rồi vẫn commit nếu typecheck xanh.

## BLOCKED
- Không có.

## Lưu ý cho người làm tiếp
- Cách chạy Codex (PowerShell): `$env:CODEX_HOME="$env:USERPROFILE\.codex"` (tk2: `.codex-2`), rồi
  `codex exec -C C:\Users\PC\Projects\tong-hop-pos -s workspace-write -c 'windows.sandbox="unelevated"' "<lệnh>"`.
  Thiếu `windows.sandbox="unelevated"` thì Codex không chạy được lệnh nào.
- Không push, không deploy.
