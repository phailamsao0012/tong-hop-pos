#!/bin/bash
# Báo tiến độ Codex của "Đợt 13 yêu cầu web tổng 17/10" qua Telegram (Tổ web tổng).
# Không tự đọc khóa bot: gửi bằng chính ~/codex-viec/tele/bao-tele.sh của tổ app (đã gửi được từ 15/10).
# Script này đổi dòng của ~/codex-viec/dot13-1710/tien-do.txt thành tin ngắn, ghi vào $V/tele/claude-tien-do.txt,
# rồi gọi bản sao bao-tele.sh (nhãn đổi thành "🤖 CODEX") với --mot-vong mỗi 20 giây. Cứ 20 phút thêm một tin tiến độ.
# Tự thoát khi script Codex đã ngừng. --thu: gửi một tin thử rồi thoát. Viết cho bash 3.2 của macOS.
set -u
V="${V:-$HOME/codex-viec/dot13-1710}"
TD="$V/tien-do.txt"
T="$V/tele"
DA="$V/.da-doi-tele"
LOG="$V/bao-tele.log"
GOC="${TELE_GOC:-$HOME/codex-viec/tele/bao-tele.sh}"
mkdir -p "$T"
[ -f "$GOC" ] || { echo "$(date -u '+%d/%m %H:%MZ') không thấy $GOC" >> "$LOG"; echo "Không thấy script Telegram của tổ app ($GOC)."; exit 2; }
sed -e 's/🧠 CLAUDE/🤖 CODEX/g' -e 's/Bắt đầu báo tiến độ app/Bắt đầu báo tiến độ Codex web/g' \
    -e 's/Thử báo Telegram từ Mac/Thử báo Telegram (Codex web) từ Mac/g' "$GOC" > "$T/gui.sh"
gui_vong() { V="$T" S="$T" bash "$T/gui.sh" "$@" > /dev/null 2>> "$LOG"; }

if [ "${1:-}" = "--thu" ]; then
  if gui_vong --thu; then echo "Đã gửi tin thử, anh xem Telegram."; else echo "Gửi thử lỗi, xem $T/bao-tele.log"; exit 1; fi
  exit 0
fi

mkdir "$V/.tele-dang-chay" 2>/dev/null || { echo "Đang chạy rồi."; exit 0; }
trap 'rmdir "$V/.tele-dang-chay" 2>/dev/null' EXIT

BUOC="A1 A2 A3 A4 A5 A6 A7 B1 B2 B3 C1 C2 D1 D2"; N=14
vt() { local i=0 b; for b in $BUOC; do i=$((i + 1)); [ "$b" = "$1" ] && { echo "$i/$N"; return; }; done; echo "?/$N"; }
TK="?"
rut_gon() {  # $1 = dòng "dd/mm HH:MMZ nội dung"; kết quả ở R (không gọi trong \$(...) để TK không mất)
  local mg nd b
  mg="$(printf '%s' "$1" | cut -d' ' -f1-2)"; nd="${1#* * }"
  b="$(printf '%s' "$nd" | sed -n 's/^\([A-D][0-9]\): .*/\1/p')"
  case "$nd" in
    "Bắt đầu ở "*) TK="$(printf '%s' "$nd" | sed -n 's/.*tài khoản đầu \([a-z0-9]*\).*/\1/p')"; nd="bắt đầu ($N bước, bước đã xong thì bỏ qua)" ;;
    *": bắt đầu ("*) nd="bước $(vt "$b") bắt đầu: $(printf '%s' "$nd" | sed 's/^[^(]*(//; s/)\.$//' | cut -c1-80)" ;;
    *": xong, commit "*) nd="✅ bước $(vt "$b") xong" ;;
    *": máy kiểm báo lỗi, giao lại vòng "*) nd="🔁 bước $(vt "$b") máy kiểm lỗi, Codex sửa lần $(printf "%s" "${nd##* }" | tr -d .)/3" ;;
    *": đã có commit, bỏ qua.") nd="bước $(vt "$b") đã xong từ trước" ;;
    "DỪNG ở "*) b="$(printf '%s' "$nd" | sed -n 's/^DỪNG ở \([a-z0-9]*\):.*/\1/p' | tr a-z A-Z)"; nd="⛔ DỪNG ở bước $(vt "$b"): $(printf '%s' "${nd#*: }" | cut -c1-200)" ;;
    *"hết lượt, đổi sang tài khoản"*) if [ "$TK" = codex ]; then TK=codex2; else TK=codex; fi; nd="🔄 hết lượt, đổi sang $TK" ;;
    *"cả hai tài khoản hết lượt"*) nd="⏸ cả hai tài khoản hết lượt, chờ 30 phút" ;;
    "Xong mọi bước"*) nd="🏁 xong cả $N bước" ;;
    "Đã đẩy lên "*) nd="📤 đã đẩy lên GitHub, Claude kiểm một lần" ;;
    *) nd="$(printf '%s' "$nd" | cut -c1-300)" ;;
  esac
  R="$mg Đợt 13 web tổng: $nd, tài khoản $TK"
}
ghi() { printf '%s\n' "$1" >> "$T/claude-tien-do.txt"; }
bay_gio() { date -u '+%d/%m %H:%MZ'; }

# Đọc lại tài khoản từ các dòng đã đổi, để chạy lại không mất. Lần đầu: chỉ đổi dòng mới từ lúc bật.
if [ ! -f "$DA" ]; then n=0; [ -f "$TD" ] && n="$(wc -l < "$TD" | tr -d ' ')"; echo "$n" > "$DA"; fi
[ -f "$TD" ] && head -n "$(cat "$DA")" "$TD" > "$V/.da-doi-dong" && while IFS= read -r l; do rut_gon "$l"; done < "$V/.da-doi-dong"

# Dòng mở đầu, gửi ngay để bao-tele.sh ghi nhận file (lần đầu nó chỉ gửi dòng cuối, không gửi dòng cũ).
rut_gon "$(bay_gio) bật báo"; ghi "$(bay_gio) Đợt 13 web tổng: 📡 bật báo tiến độ, tài khoản $TK"; gui_vong --mot-vong
NHIP="${NHIP:-1200}"; LAN_CUOI="$(date +%s)"; BAT_DAU="$LAN_CUOI"; DA_THAY=0
while :; do
  dang_chay=0; [ -d "$V/dang-chay" ] && { dang_chay=1; DA_THAY=1; }
  if [ -f "$TD" ]; then
    da="$(cat "$DA")"; tong="$(wc -l < "$TD" | tr -d ' ')"
    while [ "$da" -lt "$tong" ]; do
      rut_gon "$(sed -n "$((da + 1))p" "$TD")"; ghi "$R"
      da=$((da + 1)); echo "$da" > "$DA"; LAN_CUOI="$(date +%s)"
    done
  fi
  # Anh Vũ 15/10: cứ 20 phút báo một tin tiến độ, kể cả khi chưa có dòng mới.
  if [ "$dang_chay" = 1 ] && [ $(( $(date +%s) - LAN_CUOI )) -ge "$NHIP" ] && [ -f "$TD" ]; then
    xong="$(grep -c ': xong, commit ' "$TD")"; rut_gon "$(tail -1 "$TD")"
    ghi "$(bay_gio) Đợt 13 web tổng: ⏱ 20 phút, đã xong $xong/$N bước. Mới nhất: ${R#* * Đợt 13 web tổng: }"
    LAN_CUOI="$(date +%s)"
  fi
  if [ "$dang_chay" = 0 ] && { [ "$DA_THAY" = 1 ] || [ $(( $(date +%s) - BAT_DAU )) -ge 600 ]; }; then
    cuoi="$(tail -1 "$TD" 2>/dev/null)"
    if [ "$DA_THAY" = 1 ]; then
      case "$cuoi" in *"Đã đẩy"*|*"Đẩy lên"*|*"Không đẩy"*|*"không commit"*) ;; *) ghi "$(bay_gio) Đợt 13 web tổng: ⚠️ script Codex ngừng giữa chừng, tài khoản $TK" ;; esac
    fi
    gui_vong --mot-vong
    exit 0
  fi
  gui_vong --mot-vong
  sleep 20
done
