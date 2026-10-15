#!/bin/bash
# Sửa lỗi CI iPhone theo lời giao trên nhánh (sua-ci-giao.md cùng thư mục):
# Codex sửa, máy build kiểm, commit (code và file CI tách riêng), rồi đẩy lên PR #72.
# Anh chạy cùng một dòng lệnh cho mọi lần sửa; tổ app chỉ đổi sua-ci-giao.md trên nhánh.
# Tham số: tài khoản đầu (codex hoặc codex2, mặc định codex2). Viết cho bash 3.2 của macOS.
set -u
V=~/codex-viec/app-1410; WT=~/Projects/thp-app-ios; DAY=claude/project-thread-avd7td
TL=docs/plans/2026-10-14-app-ios-android
CDX=~/.local/node/bin/codex
TK="${1:-codex2}"
ghi() { echo "$(date -u '+%d/%m %H:%MZ') $*" >> "$V/ios-tien-do.txt"; echo "$*"; }
dung() { ghi "DỪNG ở sửa CI: $*"; exit 1; }

mkdir "$V/sua-ci.dang-chay" 2> /dev/null || { echo "Đang có lượt sửa CI khác chạy, thoát."; exit 1; }
trap 'rmdir "$V/sua-ci.dang-chay" 2> /dev/null' EXIT
cd "$WT" || exit 1
git fetch -q origin || dung "không fetch được"
[ -z "$(git status --porcelain --untracked-files=no)" ] || dung "worktree có thay đổi chưa commit"
git merge -q --ff-only "origin/$DAY" || dung "nhánh máy không tiến thẳng tới $DAY được"
git show "origin/$DAY:$TL/sua-ci-giao.md" > "$V/sua-ci-giao.md" || dung "không lấy được lời giao"
TIEU_DE="$(sed -n '1s/^# //p' "$V/sua-ci-giao.md")"
[ -n "$TIEU_DE" ] || dung "lời giao thiếu tiêu đề"

chay() {
  local home=~/.codex
  [ "$1" = codex2 ] && home=~/.codex-2
  ghi "$TIEU_DE: Codex bắt đầu, tài khoản $1."
  CODEX_HOME="$home" "$CDX" exec -C "$WT" -s workspace-write -c 'approval_policy="never"' \
    -o "$V/sua-ci-tomtat.md" - < "$V/sua-ci-giao.md" > "$V/sua-ci-codex.log" 2>&1
}
if ! chay "$TK"; then
  grep -qi 'usage limit' "$V/sua-ci-codex.log" || dung "Codex lỗi, xem sua-ci-codex.log"
  KHAC=codex2; [ "$TK" = codex2 ] && KHAC=codex
  ghi "$TK hết lượt, đổi tài khoản"
  chay "$KHAC" || dung "Codex lỗi lần hai, xem sua-ci-codex.log"
fi

# Chỉ được đổi file Swift có sẵn trong ios/Megatech và file ios-preview.yml.
doi="$(git status --porcelain --untracked-files=no | awk '{print $2}')"
[ -n "$doi" ] || dung "Codex không sửa gì"
ngoai="$(printf '%s\n' "$doi" | grep -vE '^(ios/Megatech/.*\.swift|\.github/workflows/ios-preview\.yml)$' || true)"
[ -z "$ngoai" ] || dung "Codex sửa ngoài phạm vi: $(printf '%s ' $ngoai)"
# Dòng thêm mới không có dạng SĐT, email, token, khóa (plan 5.5.4 mục 6).
MAU='\+84 ?[0-9]|\b0[0-9]{9}\b|0[0-9]{2}[ .][0-9]{3}[ .][0-9]{3,4}|@[A-Za-z0-9-]+\.[a-z]{2,}|eyJ[A-Za-z0-9_-]{10,}|PRIVATE KEY|storePassword|keyPassword'
if git diff -U0 | grep -E '^\+' | grep -qE "$MAU"; then dung "dòng mới có dạng dữ liệu nhạy cảm"; fi
grep -qE "$MAU" "$V/sua-ci-tomtat.md" && dung "tóm tắt có dạng dữ liệu nhạy cảm"

ghi "$TIEU_DE: Codex xong, build kiểm."
rm -rf "$WT/.codex-dd/ci" "$WT/.codex-dd/ci-obj"
xcodebuild -project ios/Megatech/Megatech.xcodeproj -target Megatech -sdk iphoneos -configuration Debug \
  SYMROOT="$WT/.codex-dd/ci" OBJROOT="$WT/.codex-dd/ci-obj" CODE_SIGNING_ALLOWED=NO CODE_SIGNING_REQUIRED=NO \
  CODE_SIGN_IDENTITY="" COMPILER_INDEX_STORE_ENABLE=NO \
  'OTHER_SWIFT_FLAGS=$(inherited) -Xfrontend -warn-long-expression-type-checking=150' build > "$V/sua-ci-build.log" 2>&1 \
  || { grep 'error:' "$V/sua-ci-build.log" | sed "s#$WT/##" | sort -u | head; dung "build lỗi, xem sua-ci-build.log"; }
cham="$(grep -E 'warning: expression took' "$V/sua-ci-build.log" | grep -c 'ios/Megatech/' || true)"

git add -u -- ios
git diff --cached --quiet || git -c core.hooksPath=/dev/null commit -q -m "App iOS 14/10: $TIEU_DE (Codex sửa, tổ app kiểm)" || dung "không commit được code"
git add -u -- .github/workflows/ios-preview.yml
git diff --cached --quiet || git -c core.hooksPath=/dev/null commit -q -m "App iOS 14/10: $TIEU_DE, file CI (ngoại lệ có tên, Codex sửa, tổ app kiểm)" || dung "không commit được file CI"
cp "$V/sua-ci-tomtat.md" "$TL/sua-ci-tomtat.md" && git add -- "$TL/sua-ci-tomtat.md" \
  && git -c core.hooksPath=/dev/null commit -q -m "App iOS 14/10: $TIEU_DE, tóm tắt của Codex" -- "$TL/sua-ci-tomtat.md"
git -c core.hooksPath=/dev/null push -q origin "HEAD:$DAY" || dung "không đẩy được (nhánh xa đã đổi?)"
ghi "Đã đẩy lên $DAY ($(git rev-parse --short HEAD)): $TIEU_DE. Còn $cham biểu thức kiểm kiểu chậm."
