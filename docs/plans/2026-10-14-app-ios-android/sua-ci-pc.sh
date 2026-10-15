#!/bin/bash
# Sửa lỗi CI iPhone trên PC Windows (anh Nam 15/10: "Làm trên pc ấy, pc mới mở 24/7").
# Giống sua-ci-chung.sh của Mac nhưng không build (PC không có Xcode): Codex sửa theo
# sua-ci-giao.md trên nhánh, máy kiểm phạm vi và dữ liệu nhạy cảm, commit, đẩy lên PR #72.
# CI trên GitHub build và quay video. Báo Telegram lúc bắt đầu, 20 phút một tin, xong hoặc dừng.
# Chạy bằng Git Bash, từ bản chép ngoài repo (không chạy thẳng file trong clone).
# Tham số: tài khoản đầu (1 hoặc 2, mặc định 1).
# Biến tùy chọn: CDX (đường dẫn codex), CDX_HOME_1, CDX_HOME_2 (CODEX_HOME của từng tài khoản,
# trống là mặc định), $V/codex-them.txt (tham số thêm cho codex exec, mỗi dòng một tham số,
# ví dụ cách bật sandbox Windows ghi trong HANDOFF), TELE_ENV (file khóa bot), TELE_TAT=1 (tắt báo).
set -u
V="$HOME/codex-viec/app-1410"; WT="$HOME/Projects/thp-app-ios"; DAY=claude/project-thread-avd7td
TL=docs/plans/2026-10-14-app-ios-android
REPO_PC="$HOME/Projects/tong-hop-pos"
TK="${1:-1}"
export GIT_TERMINAL_PROMPT=0 GCM_INTERACTIVE=never
mkdir -p "$V"

gio() { date -u -d '+7 hours' '+%H:%M'; }
tele() {
  [ -z "${TELE_TAT:-}" ] || return 0
  local f="${TELE_ENV:-/c/tele-bot/.env}" tok chat
  [ -r "$f" ] || { echo "$(gio) không có file khóa bot" >> "$V/tele-pc.log"; return 0; }
  tok="$(tr -d '\r' < "$f" | sed -nE "s/^[[:space:]]*(export[[:space:]]+)?[A-Za-z_][A-Za-z0-9_]*[[:space:]]*=[[:space:]]*['\"]?([0-9]{6,12}:[A-Za-z0-9_-]{30,})['\"]?[[:space:]]*$/\2/p" | head -n 1)"
  chat="$(tr -d '\r' < "$f" | grep -iE '^[[:space:]]*(export[[:space:]]+)?[A-Za-z0-9_]*(CHAT|USER|ADMIN|OWNER|ALLOWED)[A-Za-z0-9_]*[[:space:]]*=' \
    | sed -nE "s/^[^=]*=[[:space:]]*['\"]?(-?[0-9]+)[[:space:]]*(['\",].*)?$/\1/p" | head -n 1)"
  if [ -z "$tok" ] || [ -z "$chat" ]; then echo "$(gio) không tìm thấy khóa bot" >> "$V/tele-pc.log"; return 0; fi
  local ma
  ma="$(printf 'url = "https://api.telegram.org/bot%s/sendMessage"\n' "$tok" \
    | curl -sS -m 20 -K - --data-urlencode "chat_id=$chat" --data-urlencode "text=$1" -o /dev/null -w '%{http_code}' 2> /dev/null)"
  echo "$(gio) gửi tin, mã ${ma:-lỗi}" >> "$V/tele-pc.log"
}
ghi() { echo "$(date -u '+%d/%m %H:%MZ') $*" >> "$V/ios-tien-do.txt"; echo "$*"; }
dung() { ghi "DỪNG ở sửa CI trên PC: $*"; tele "⛔ CODEX | iPhone DỪNG ở sửa CI trên PC: $*, $(gio)"; exit 1; }

mkdir "$V/sua-ci-pc.dang-chay" 2> /dev/null || { echo "Đang có lượt sửa CI trên PC khác chạy, thoát."; exit 1; }
TICK=""
don() { [ -z "$TICK" ] || kill "$TICK" 2> /dev/null; rmdir "$V/sua-ci-pc.dang-chay" 2> /dev/null; }
trap don EXIT

CDX="${CDX:-$(command -v codex || true)}"
[ -n "$CDX" ] || dung "không thấy lệnh codex"
THEM=()
if [ -f "$V/codex-them.txt" ]; then
  while IFS= read -r d || [ -n "$d" ]; do d="${d%$'\r'}"; [ -z "$d" ] || THEM+=("$d"); done < "$V/codex-them.txt"
fi
# Luật: Codex chỉ chạy workspace-write, không bao giờ full access hay bỏ qua sandbox.
if [ ${#THEM[@]} -gt 0 ] && printf '%s\n' "${THEM[@]}" | grep -qiE 'danger|full-access|bypass|yolo|approval|--sandbox|^-s$'; then
  dung "codex-them.txt có tham số bị cấm"
fi

# Clone riêng cho iPhone, không đụng cây đang làm của thread Giao diện mới.
if [ ! -d "$WT/.git" ]; then
  URL="$(git -C "$REPO_PC" remote get-url origin 2> /dev/null || echo https://github.com/phailamsao0012/tong-hop-pos.git)"
  git clone -q -c core.autocrlf=input --single-branch --branch "$DAY" "$URL" "$WT" || dung "không clone được"
fi
cd "$WT" || dung "không vào được $WT"
git config core.autocrlf input
git config user.email > /dev/null || { git config user.name "Codex PC"; git config user.email "codex-pc@users.noreply.github.com"; }
git fetch -q origin "$DAY" || dung "không fetch được"
[ -z "$(git status --porcelain --untracked-files=no)" ] || dung "clone có thay đổi chưa commit"
git checkout -q -B "$DAY" "origin/$DAY" || dung "không về được ngọn $DAY"
git show "origin/$DAY:$TL/sua-ci-giao.md" | tr -d '\r' > "$V/sua-ci-giao.md" || dung "không lấy được lời giao"
TIEU_DE="$(sed -n '1s/^# //p' "$V/sua-ci-giao.md")"
[ -n "$TIEU_DE" ] || dung "lời giao thiếu tiêu đề"
GOC="$(git rev-parse HEAD)"

chay() {
  local home=""
  [ "$1" = 1 ] && home="${CDX_HOME_1:-}"
  [ "$1" = 2 ] && home="${CDX_HOME_2:-}"
  ghi "$TIEU_DE: Codex bắt đầu trên PC, tài khoản $1."
  tele "🤖 CODEX | iPhone sửa CI trên PC bắt đầu: ${TIEU_DE:0:80}, $(gio), tài khoản $1"
  rm -f "$V/sua-ci-tomtat.md"
  if [ -n "$home" ]; then export CODEX_HOME="$(cygpath -w "$home")"; else unset CODEX_HOME; fi
  "$CDX" exec -C "$(cygpath -w "$WT")" -s workspace-write -c 'approval_policy="never"' ${THEM[@]+"${THEM[@]}"} \
    -o "$(cygpath -w "$V/sua-ci-tomtat.md")" - < "$V/sua-ci-giao.md" > "$V/sua-ci-codex.log" 2>&1
}
# Tin 20 phút; sleep ngắn và không giữ stdout để script kết thúc ngay khi xong.
( while :; do for _ in $(seq 120); do sleep 10; done; tele "🤖 CODEX | iPhone sửa CI trên PC vẫn đang làm, $(gio)"; done ) > /dev/null 2>&1 &
TICK=$!
if ! chay "$TK"; then
  grep -qiE 'usage limit|rate limit|quota' "$V/sua-ci-codex.log" || dung "Codex lỗi, xem sua-ci-codex.log"
  KHAC=2; [ "$TK" = 2 ] && KHAC=1
  ghi "tài khoản $TK hết lượt, đổi tài khoản"
  tele "🔄 CODEX | tài khoản $TK hết lượt, đổi sang tài khoản $KHAC"
  chay "$KHAC" || dung "Codex lỗi lần hai, xem sua-ci-codex.log"
fi
kill "$TICK" 2> /dev/null; TICK=""
[ -s "$V/sua-ci-tomtat.md" ] || dung "Codex không viết tóm tắt"
[ "$(git rev-parse HEAD)" = "$GOC" ] || dung "Codex tự commit, không đẩy"

# Chỉ được đổi file Swift có sẵn trong ios/Megatech và file ios-preview.yml; không thêm file mới.
doi="$(git diff --name-only)"
[ -n "$doi" ] || dung "Codex không sửa gì"
ngoai="$(printf '%s\n' "$doi" | grep -vE '^(ios/Megatech/.*\.swift|\.github/workflows/ios-preview\.yml)$' || true)"
[ -z "$ngoai" ] || dung "Codex sửa ngoài phạm vi: $(printf '%s ' $ngoai)"
moi="$(git ls-files --others --exclude-standard -- ios .github | head -n 5)"
[ -z "$moi" ] || dung "Codex thêm file mới: $(printf '%s ' $moi)"
git diff | grep -q $'\r' && dung "dòng mới có xuống dòng kiểu Windows"
# Repo công khai: dòng thêm mới không có dạng SĐT, email, token, khóa.
NHAY='\+84 ?[0-9]|(^|[^0-9A-Za-z])0[0-9]{9}([^0-9A-Za-z]|$)|(^|[^0-9A-Za-z])0[0-9]{2}[ .][0-9]{3}[ .][0-9]{3,4}([^0-9]|$)|[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)*\.[a-z]{2,}|eyJ[A-Za-z0-9_-]{10,}|PRIVATE KEY|storePassword|keyPassword'
NHAY_DUOC='chu@demo\.megatech\.vn|noreply@'
if git diff -U0 | grep -E '^\+' | grep -vE "$NHAY_DUOC" | grep -qE "$NHAY"; then dung "dòng mới có dạng dữ liệu nhạy cảm"; fi
tr -d '\r' < "$V/sua-ci-tomtat.md" | grep -vE "$NHAY_DUOC" | grep -qE "$NHAY" && dung "tóm tắt có dạng dữ liệu nhạy cảm"

KY='Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_019SV92CuahtnUGh3h8vsV3f'
git add -u -- ios
git diff --cached --quiet || git -c core.hooksPath=/dev/null commit -q -m "App iOS 14/10: $TIEU_DE (Codex sửa trên PC, tổ app kiểm)" -m "$KY" || dung "không commit được code"
git add -u -- .github/workflows/ios-preview.yml
git diff --cached --quiet || git -c core.hooksPath=/dev/null commit -q -m "App iOS 14/10: $TIEU_DE, file CI (ngoại lệ có tên, Codex sửa trên PC, tổ app kiểm)" -m "$KY" || dung "không commit được file CI"
tr -d '\r' < "$V/sua-ci-tomtat.md" > "$TL/sua-ci-tomtat.md" && git add -- "$TL/sua-ci-tomtat.md" \
  && { git diff --cached --quiet || git -c core.hooksPath=/dev/null commit -q -m "App iOS 14/10: $TIEU_DE, tóm tắt của Codex" -m "$KY"; }
git fetch -q origin "$DAY" || dung "không fetch được trước khi đẩy"
git merge-base --is-ancestor "origin/$DAY" HEAD || dung "nhánh $DAY trên GitHub đã đổi, không ghi đè"
git -c core.hooksPath=/dev/null push -q origin "HEAD:refs/heads/$DAY" || dung "không đẩy được"
ghi "Đã đẩy lên $DAY ($(git rev-parse --short HEAD)): $TIEU_DE. CI GitHub build và quay video."
tele "📤 CODEX | iPhone sửa CI trên PC xong, đã đẩy lên GitHub, $(gio)"
