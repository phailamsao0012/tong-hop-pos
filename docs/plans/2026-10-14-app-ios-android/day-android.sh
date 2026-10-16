#!/bin/bash
# Đẩy phần Android lên nhánh claude/app-android (anh Vũ trả lời câu 1 "có", 15/10/2026).
# Chờ script chạy liền phần Android dừng hẳn, kiểm đã xong cả 12 bước, phạm vi file và dữ liệu nhạy cảm,
# rồi mới đẩy. Không sửa code, không đọc khóa, không in bí mật. Viết cho bash 3.2 của macOS.
set -u
V=~/codex-viec/app-1410; WT=~/Projects/thp-app-android; DAY=claude/app-android
TD="$V/android-tien-do.txt"
ghi() { echo "$(date -u '+%d/%m %H:%MZ') $*" | tee -a "$TD"; }
dung() { ghi "KHÔNG ĐẨY Android: $*"; exit 1; }

mkdir "$V/day-android.dang-chay" 2> /dev/null || { echo "Đã có lượt chờ đẩy Android khác, thoát."; exit 1; }
trap 'rmdir "$V/day-android.dang-chay" 2> /dev/null' EXIT
ghi "Chờ phần Android chạy xong rồi tự đẩy lên $DAY."
while pgrep -f 'chay-lien-mach\.sh android' > /dev/null; do sleep 120; done

cd "$WT" || dung "không vào được $WT"
[ ! -f "$V/android-DUNG.md" ] || dung "Codex dừng giữa chừng (xem android-DUNG.md)"
grep -q 'a8b: xong' "$TD" || dung "chưa thấy bước cuối a8b xong"
[ -z "$(git status --porcelain --untracked-files=no)" ] || dung "worktree có thay đổi chưa commit"
git fetch -q origin || dung "không fetch được"
GOC="$(git merge-base HEAD origin/main)" || dung "không tìm được gốc so với main"

# Chỉ được có file Android, workflow Android và tài liệu plan.
ngoai="$(git diff --name-only "$GOC" HEAD | grep -vE '^(android/|\.github/workflows/android(-preview)?\.yml$|docs/plans/2026-10-14-app-ios-android/)' || true)"
[ -z "$ngoai" ] || dung "có file ngoài phạm vi: $(printf '%s ' $ngoai)"
# Repo công khai: dòng thêm mới không có dạng SĐT, email, token, khóa (như chay-lien-mach.sh).
NHAY='\+84 ?[0-9]|(^|[^0-9A-Za-z])0[0-9]{9}([^0-9A-Za-z]|$)|(^|[^0-9A-Za-z])0[0-9]{2}[ .][0-9]{3}[ .][0-9]{3,4}([^0-9]|$)|[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)*\.[a-z]{2,}|eyJ[A-Za-z0-9_-]{10,}|PRIVATE KEY'
NHAY_DUOC='chu@demo\.megatech\.vn|noreply@'
if git diff -U0 "$GOC" HEAD | grep -E '^\+' | grep -vE "$NHAY_DUOC" | grep -qE "$NHAY"; then dung "dòng mới có dạng dữ liệu nhạy cảm"; fi
git ls-files | grep -qE '\.(jks|keystore|p12|pem)$|local\.properties$' && dung "có file khóa trong git"

if git rev-parse -q --verify "origin/$DAY" > /dev/null; then
  git merge-base --is-ancestor "origin/$DAY" HEAD || dung "nhánh $DAY trên GitHub đã khác, không ghi đè"
fi
git -c core.hooksPath=/dev/null push -q origin "HEAD:refs/heads/$DAY" || dung "đẩy lỗi"
ghi "Đã đẩy Android lên $DAY ($(git rev-parse --short HEAD)). CI Android và video chạy trên GitHub."
