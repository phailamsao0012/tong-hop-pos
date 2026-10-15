#!/bin/bash
# Báo tiến độ Codex của đợt "API cho app 15/10" qua Telegram (Tổ web tổng). Đọc ~/codex-viec/api-1510/tien-do.txt
# do chay-lien-mach.sh ghi, gửi mỗi dòng mới thành một tin "🤖 CODEX | Web …". Tự thoát khi script Codex đã ngừng.
# Khóa bot đọc từ ~/tele-bot/.env lúc chạy, cùng luật với ~/codex-viec/tele/bao-tele.sh: không source, không in, không ghi.
# Viết cho bash 3.2 của macOS. TELE_GIA=1: không gọi mạng, in tin ra màn hình.
set -u
V="${V:-$HOME/codex-viec/api-1510}"
TD="$V/tien-do.txt"
DA="$V/.da-gui-tele"
LOG="$V/bao-tele.log"
ENVF="${TELE_ENV:-$HOME/tele-bot/.env}"
mkdir "$V/.tele-dang-chay" 2>/dev/null || { echo "Đang chạy rồi."; exit 0; }
trap 'rmdir "$V/.tele-dang-chay" 2>/dev/null' EXIT

TOKEN=""; CHAT=""
if [ -z "${TELE_GIA:-}" ]; then
  while IFS= read -r dong || [ -n "$dong" ]; do
    case "$dong" in *=*) ;; *) continue ;; esac
    ten="${dong%%=*}"; gt="${dong#*=}"
    gt="$(printf '%s' "$gt" | sed -e "s/^[[:space:]\"']*//" -e "s/[[:space:]\"']*\$//")"
    if [ -z "$TOKEN" ] && printf '%s' "$gt" | grep -qE '^[0-9]{6,12}:[A-Za-z0-9_-]{30,}$'; then TOKEN="$gt"; continue; fi
    if [ -z "$CHAT" ] && printf '%s' "$ten" | grep -qiE 'CHAT|USER|ADMIN|OWNER|ALLOWED'; then
      c="${gt%%,*}"; printf '%s' "$c" | grep -qE '^-?[0-9]+$' && CHAT="$c"
    fi
  done < "$ENVF"
  { [ -n "$TOKEN" ] && [ -n "$CHAT" ]; } || { echo "$(date -u '+%d/%m %H:%MZ') không tìm thấy khóa bot" >> "$LOG"; exit 2; }
fi

gui() {
  if [ -n "${TELE_GIA:-}" ]; then echo "$1"; return 0; fi
  local code t
  for t in 0 2 5 10; do
    [ "$t" -gt 0 ] && sleep "$t"
    code="$(printf 'url = "https://api.telegram.org/bot%s/sendMessage"\n' "$TOKEN" | curl -sS -m 20 -K - --data-urlencode "chat_id=$CHAT" --data-urlencode "text=$1" -o /dev/null -w '%{http_code}' 2>/dev/null)"
    [ "$code" = 200 ] && return 0
  done
  echo "$(date -u '+%d/%m %H:%MZ') gửi lỗi mã $code" >> "$LOG"; return 1
}

BUOC="S1 S2 X1 W1 W2 W5"; N=6
vt() { local i=0 b; for b in $BUOC; do i=$((i + 1)); [ "$b" = "$1" ] && { echo "$i/$N"; return; }; done; echo "?/$N"; }
TK="?"
rut_gon() {  # $1 = dòng "dd/mm HH:MMZ nội dung"; kết quả ở R (không gọi trong \$(...) để TK không mất)
  local hm nd h m b
  hm="$(printf '%s' "$1" | cut -d' ' -f2 | tr -d Z)"; nd="${1#* * }"
  h="${hm%%:*}"; m="${hm##*:}"; h=$(( (10#$h + 7) % 24 )); hm="$(printf '%02d:%s' "$h" "$m")"
  b="$(printf '%s' "$nd" | sed -n 's/^\([SXW][0-9]\): .*/\1/p')"
  case "$nd" in
    "Bắt đầu ở "*) TK="$(printf '%s' "$nd" | sed -n 's/.*tài khoản đầu \([a-z0-9]*\).*/\1/p')"; nd="bắt đầu cả đợt (6 bước)" ;;
    *": bắt đầu ("*) nd="bước $(vt "$b") bắt đầu: $(printf '%s' "$nd" | sed 's/^[^(]*(//; s/)\.$//' | cut -c1-80)" ;;
    *": xong, commit "*) nd="✅ bước $(vt "$b") xong" ;;
    *": máy kiểm báo lỗi, giao lại vòng "*) nd="🔁 bước $(vt "$b") máy kiểm lỗi, Codex sửa lần $(printf "%s" "${nd##* }" | tr -d .)/3" ;;
    *": đã có commit, bỏ qua.") nd="bước $(vt "$b") đã xong từ trước" ;;
    "DỪNG ở "*) b="$(printf '%s' "$nd" | sed -n 's/^DỪNG ở \([a-z0-9]*\):.*/\1/p' | tr a-z A-Z)"; nd="⛔ DỪNG ở bước $(vt "$b"): $(printf '%s' "${nd#*: }" | cut -c1-200)" ;;
    *" hết lượt, đổi tài khoản") if [ "$TK" = codex ]; then TK=codex2; else TK=codex; fi; nd="🔄 hết lượt, đổi sang $TK" ;;
    *"cả hai tài khoản hết lượt"*) nd="⏸ cả hai tài khoản hết lượt, chờ 30 phút" ;;
    "Xong mọi bước"*) nd="🏁 xong cả 6 bước" ;;
    "Đã đẩy lên "*) nd="📤 đã đẩy lên GitHub, Claude kiểm một lần" ;;
    *) nd="$(printf '%s' "$nd" | cut -c1-300)" ;;
  esac
  R="🤖 CODEX | Web API cho app: $nd, $hm, tài khoản $TK"
}

# Đọc lại tài khoản từ các dòng đã có, để chạy lại không mất.
if [ -f "$TD" ] && [ -f "$DA" ]; then head -n "$(cat "$DA")" "$TD" > "$V/.da-gui-dong"; while IFS= read -r l; do rut_gon "$l"; done < "$V/.da-gui-dong"; fi
if [ -f "$TD" ] && [ ! -f "$DA" ]; then while IFS= read -r l; do rut_gon "$l"; done < "$TD"; fi
if [ ! -f "$DA" ]; then
  n=0; [ -f "$TD" ] && n="$(wc -l < "$TD" | tr -d ' ')"; echo "$n" > "$DA"
  cuoi=""; [ -f "$TD" ] && cuoi="$(tail -1 "$TD")"
  if [ -n "$cuoi" ]; then rut_gon "$cuoi"; gui "📡 Bắt đầu báo tiến độ Codex (web, API cho app). Đang ở: ${R#*: }"; else gui "📡 Bắt đầu báo tiến độ Codex (web, API cho app)"; fi
fi
while :; do
  dang_chay=0; [ -d "$V/dang-chay" ] && dang_chay=1
  if [ -f "$TD" ]; then
    da="$(cat "$DA")"; tong="$(wc -l < "$TD" | tr -d ' ')"
    while [ "$da" -lt "$tong" ]; do
      l="$(sed -n "$((da + 1))p" "$TD")"
      rut_gon "$l"; gui "$R" || break
      da=$((da + 1)); echo "$da" > "$DA"; sleep 1
    done
  fi
  if [ "$dang_chay" = 0 ]; then
    cuoi="$(tail -1 "$TD" 2>/dev/null)"
    case "$cuoi" in *"Đã đẩy"*|*"Đẩy lên"*|*"Không đẩy"*|*"không commit"*) ;; *) gui "⚠️ CODEX | Web API cho app: script ngừng giữa chừng, $(date -u -v+7H '+%H:%M' 2>/dev/null || date '+%H:%M')" ;; esac
    exit 0
  fi
  sleep 20
done
