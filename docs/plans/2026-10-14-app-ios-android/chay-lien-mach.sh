#!/bin/bash
# Chạy liền một mạch các bước Codex của một phần app (plan.md mục 5.6, lời anh Vũ 14/10/2026).
# Tổ app chạy trên Mac, ngoài sandbox của Codex, sau khi chuẩn bị worktree như mục 5.6:
#   nohup caffeinate -is bash chay-lien-mach.sh ios     <worktree> codex  > ~/codex-viec/app-1410/ios-chay.log 2>&1 &
#   nohup caffeinate -is bash chay-lien-mach.sh android <worktree> codex2 > ~/codex-viec/app-1410/android-chay.log 2>&1 &
# Mỗi bước: Codex làm (sandbox workspace-write), máy kiểm, sai thì giao lại tối đa 3 vòng, đạt thì commit trong nhánh máy.
# Hết các bước (hoặc dừng): gom tóm tắt vào ket-qua-<phần>.md, đẩy lên nhánh làm việc (iOS: nhánh PR #72;
# Android: chỉ khi có DAY_ANDROID=<nhánh anh đã cho phép>). Script không đọc khóa, không in bí mật.
# Viết cho bash 3.2 của macOS.
set -u
export PATH="$HOME/.local/node/bin:/opt/homebrew/bin:/usr/local/bin:$PATH"

PHAN="${1:?ios hoặc android}"
WT="$(cd "${2:?thư mục worktree}" && pwd)" || exit 2
CDX="${3:-codex}"
V="$HOME/codex-viec/app-1410"
mkdir -p "$V"
PLAN="docs/plans/2026-10-14-app-ios-android"
case "$PHAN" in
  ios)
    BUOC="i1 i2 i3 i4 i4b i7 i5a i5b i6"
    DUOC='^(ios/|\.github/workflows/ios(-preview)?\.yml$)'
    DAY="claude/project-thread-avd7td"
    TEN="App iOS 14/10" ;;
  android)
    BUOC="a0 a1a a1b a1c a2a a2b a6 a7 a7c a7b a8a a8b"
    DUOC='^(android/|\.github/workflows/android(-preview)?\.yml$)'
    DAY="${DAY_ANDROID:-}"
    TEN="App Android 14/10" ;;
  *) echo "Phần phải là ios hoặc android"; exit 2 ;;
esac

cd "$WT" || exit 2
mkdir "$V/$PHAN.dang-chay" 2>/dev/null || { echo "Phần $PHAN đang chạy (xóa $V/$PHAN.dang-chay nếu chắc là không)."; exit 2; }
trap 'rmdir "$V/$PHAN.dang-chay" 2>/dev/null' EXIT
# Android cắt từ main: commit tài liệu đầu nhánh (plan, CODEX.md, script) lấy từ nhánh iOS, như A0 ghi.
if [ "$PHAN" = android ] && [ ! -f "$PLAN/plan.md" ]; then
  git checkout origin/claude/project-thread-avd7td -- "$PLAN" \
    && git -c core.hooksPath=/dev/null commit -q -m "Tài liệu: plan app iOS và Android 14/10 (bản 1.3), luật cho Codex, script chạy liền một mạch" \
    || { echo "Không lấy được tài liệu từ origin/claude/project-thread-avd7td"; exit 2; }
fi
NHANH="$(git rev-parse --abbrev-ref HEAD)"
GOC="$(git rev-parse --short HEAD)"
TD="$V/$PHAN-tien-do.txt"
CB="$V/$PHAN-canh-bao.txt"
B="(chưa bắt đầu)"
ghi() { echo "$(date -u '+%d/%m %H:%MZ') $*" | tee -a "$TD"; }

# File máy của Codex và của build không bao giờ vào git (chỉ ở máy).
EX="$(git rev-parse --git-common-dir)/info/exclude"
for p in .codex-dd/ .codex-out/ .gradle-home/ .android-home/ android/.gradle/ android/build/ android/app/build/ \
         android/.kotlin/ android/local.properties ios/Megatech/build/ xcuserdata/ '*.xcuserstate' .DS_Store .idea/ '*.iml'; do
  grep -qxF "$p" "$EX" 2>/dev/null || echo "$p" >> "$EX"
done

# Dữ liệu nhạy cảm trên dòng thêm mới (repo công khai). NHAY: chặn. MEM: chỉ ghi để tổ app soát cuối phần.
NHAY='\+84 ?[0-9]|(^|[^0-9A-Za-z])0[0-9]{9}([^0-9A-Za-z]|$)|(^|[^0-9A-Za-z])0[0-9]{2}[ .][0-9]{3}[ .][0-9]{3,4}([^0-9]|$)|[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)*\.[a-z]{2,}|eyJ[A-Za-z0-9_-]{10,}|PRIVATE KEY'
NHAY_DUOC='chu@demo\.megatech\.vn|noreply@'
MEM='thp_session=|storePassword|keyPassword|ANDROID_KEYSTORE_B64|MEGATECH_[A-Z_]*PASSWORD'
# Lệnh Codex đã chạy. CAM: dừng cả phần. LA: chỉ ghi cảnh báo.
CAM='(~|\$HOME|/Users/[^/ ]+)/\.megatech|(~|\$HOME|/Users/[^/ ]+)/\.ssh|\.config/gh|(~|\$HOME|/Users/[^/ ]+)/\.codex(-2)?([/ "'"'"']|$)'
LA='git (push|commit)|curl |wget |(^|[ ;&|(])gh |npm |keytool|apksigner|assembleRelease|bundleRelease|printenv|local\.properties|tao-khoa-ky\.sh'

khac() { if [ "$1" = codex ]; then echo codex2; else echo codex; fi; }
het_luot() { grep -qiE 'usage limit|rate limit|quota|too many requests|429' "$@" 2>/dev/null; }

# $1 = file lời giao, $2 = tên lần chạy. Hết lượt thì đổi tài khoản; cả hai hết thì chờ 30 phút (tối đa 6 giờ).
LAN=""
chay_codex() {
  local thu=0 rc
  while :; do
    LAN="$V/app-1410-$B-$2-$CDX"
    "$CDX" exec -C "$WT" -s workspace-write --json -o "$V/app-1410-$B-tomtat.md" - < "$1" > "$LAN.jsonl" 2> "$LAN.err"
    rc=$?
    [ "$rc" -eq 0 ] && return 0
    if het_luot "$LAN.err" "$LAN.jsonl"; then
      thu=$((thu + 1)); ghi "$B: $CDX hết lượt, đổi tài khoản"; CDX="$(khac "$CDX")"
      if [ $((thu % 2)) -eq 0 ]; then
        [ "$thu" -ge 24 ] && return 1
        ghi "$B: cả hai tài khoản hết lượt, chờ 30 phút"; sleep 1800
      fi
      continue
    fi
    ghi "$B: codex thoát mã $rc"; return 1
  done
}

# Lệnh Codex đã chạy trong lần $LAN (trường command của mục command_execution).
lenh_da_chay() {
  python3 - "$LAN.jsonl" <<'PY'
import json, sys
for line in open(sys.argv[1], encoding="utf-8", errors="replace"):
    try:
        it = (json.loads(line) or {}).get("item") or {}
    except Exception:
        continue
    if it.get("type") == "command_execution":
        c = it.get("command")
        print(c if isinstance(c, str) else " ".join(map(str, c or [])))
PY
}

# Máy kiểm sau mỗi lần chạy. In lỗi (rỗng là đạt). Không in nội dung dòng nhạy cảm, chỉ tên file.
kiem() {
  local ds ngoai f rc
  git add -A
  ds="$(git diff --cached --name-only)"
  if [ -z "$ds" ]; then echo "- Chưa có file nào thay đổi cho bước $BU."; return; fi
  ngoai="$(printf '%s\n' "$ds" | grep -vE "$DUOC")"
  [ -n "$ngoai" ] && echo "- File ngoài phạm vi phần $PHAN (không được sửa, trả về như cũ): $(echo $ngoai)"
  printf '%s\n' "$ds" | grep -qE '\.(jks|keystore|p12|pem)$|local\.properties$' && echo "- Có file khóa hoặc local.properties trong thay đổi: bỏ ra."
  git diff --cached -U0 | awk '/^\+\+\+ /{f=substr($0,7);next} /^\+/{print f"\t"substr($0,2)}' > "$V/.them-$PHAN.txt"
  f="$(grep -E "$NHAY" "$V/.them-$PHAN.txt" | grep -vE "$NHAY_DUOC" | cut -f1 | sort -u)"
  [ -n "$f" ] && echo "- Dòng thêm mới có dạng SĐT / email / token / khóa (repo công khai), ở: $(echo $f). Thay bằng số giả, tên giả như CODEX.md mục 6."
  grep -E "$MEM" "$V/.them-$PHAN.txt" | cut -f1 | sort -u | sed "s/^/$B: dòng có tên bí mật ở /" >> "$CB"
  [ -s "$V/app-1410-$B-tomtat.md" ] && grep -q '^# Tóm tắt' "$V/app-1410-$B-tomtat.md" \
    || echo "- Thiếu tóm tắt theo mẫu CODEX.md mục 11 (tin nhắn cuối phải là tóm tắt)."
  if [ "$PHAN" = ios ]; then
    xcodebuild -project ios/Megatech/Megatech.xcodeproj -target Megatech -sdk iphonesimulator -configuration Debug \
      SYMROOT="$WT/.codex-dd" CODE_SIGNING_ALLOWED=NO COMPILER_INDEX_STORE_ENABLE=NO build > "$V/app-1410-$B-build.log" 2>&1 \
      || { echo "- Build iOS lỗi (xcodebuild, target Megatech, máy ảo):"; grep -E 'error:' "$V/app-1410-$B-build.log" | sed "s#$WT/##" | sort -u | head -20; }
    # Giống bước chặn của ios.yml: định dạng số / ngày chỉ trong Format.swift.
    grep -rnH --include='*.swift' --exclude=Format.swift --exclude=FormatSelfTest.swift \
      -e 'Formatter(' -e 'Formatter\.localizedString' -e '\.formatted(' -e 'FormatStyle[(.]' -e 'format: *\.' \
      -e 'style: *\.time' -e 'style: *\.date' -e 'style: *\.relative' -e 'style: *\.offset' -e 'style: *\.timer' \
      -e '" ₫"' -e ') ₫' -e 'String(format: *"%[^"]*[fFeEgG]' -e 'String(format: *[^" ]' ios > "$V/.dinh-dang.txt"
    rc=$?
    [ "$rc" -eq 0 ] && { echo "- Định dạng số / ngày ngoài Format.swift (bước chặn của ios.yml):"; head -10 "$V/.dinh-dang.txt"; }
    [ "$rc" -gt 1 ] && echo "- Lệnh kiểm định dạng lỗi (mã $rc)."
  elif [ -n "${ANDROID_HOME:-}" ] && [ -d "${ANDROID_HOME:-/khong-co}/platforms" ] && [ -n "${JAVA_HOME:-}" ]; then
    (cd android && ./gradlew --offline -q :app:testDebugUnitTest :app:assembleDebug) > "$V/app-1410-$B-build.log" 2>&1 \
      || { echo "- Build / test Android lỗi (gradlew --offline :app:testDebugUnitTest :app:assembleDebug):"; \
           grep -E '^e: |error:|FAILED|What went wrong|Could not resolve' "$V/app-1410-$B-build.log" | sed "s#$WT/##" | sort -u | head -20; }
  fi
}

ket_thuc() {
  local kq="$PLAN/ket-qua-$PHAN.md" b f
  {
    echo "# Kết quả chạy liền một mạch: $TEN"
    echo
    echo "Codex làm từng bước theo plan mục 5.6, máy kiểm sau mỗi bước. Tổ app kiểm một lần cho cả phần sau khi đọc file này, diff và CI."
    echo
    echo "## Tiến độ"
    echo '```'; sed -E 's#/Users/[^/ ]+#~#g' "$TD"; echo '```'
    if [ -s "$CB" ]; then echo; echo "## Cảnh báo cho tổ app soát"; echo '```'; sed -E 's#/Users/[^/ ]+#~#g' "$CB"; echo '```'; fi
    for b in $BUOC; do
      f="$V/app-1410-$b-tomtat.md"
      [ -s "$f" ] && { echo; echo "---"; echo; sed -E 's/^#/##/; s#/Users/[^/ ]+#~#g' "$f"; }
    done
  } > "$kq"
  if grep -E "$NHAY" "$kq" | grep -vqE "$NHAY_DUOC"; then
    ghi "ket-qua-$PHAN.md có dòng dạng SĐT / email / token: không commit, để ở máy ($WT/$kq)."
  else
    git add -- "$kq" && git -c core.hooksPath=/dev/null commit -q -m "$TEN: tóm tắt của Codex các bước (chạy liền một mạch, tổ app kiểm cuối phần)" -- "$kq"
  fi
  [ -n "$DAY" ] || { ghi "Không đẩy: phần $PHAN chờ anh cho phép nhánh. Nhánh máy $NHANH."; return 0; }
  git fetch -q origin "$DAY" 2>/dev/null
  if git rev-parse -q --verify "origin/$DAY" > /dev/null && ! git merge-base --is-ancestor "origin/$DAY" HEAD; then
    git -c core.hooksPath=/dev/null rebase -q --autostash "origin/$DAY" || { git rebase --abort; ghi "Nhánh xa đã đổi, rebase xung đột: không đẩy."; return 1; }
  fi
  for t in 2 4 8 16 0; do
    if git -c core.hooksPath=/dev/null push -q origin "HEAD:$DAY"; then ghi "Đã đẩy lên $DAY ($(git rev-parse --short HEAD))."; return 0; fi
    [ "$t" -gt 0 ] && sleep "$t"
  done
  ghi "Đẩy lên $DAY lỗi."; return 1
}

dung() { ghi "DỪNG ở $B: $*"; printf '# Dừng ở bước %s\n\n%s\n' "$B" "$*" > "$V/$PHAN-DUNG.md"; ket_thuc; exit 1; }

loi_giao() {  # $1 = file ra, $2 = phần thêm (vòng sửa)
  {
    echo "Repo phailamsao0012/tong-hop-pos. Em đang ở worktree $WT, nhánh máy $NHANH (không có trên GitHub)."
    echo "Đọc $PLAN/CODEX.md, rồi plan.md cùng thư mục. Chỉ làm bước **$BU** ở mục 5 của plan, không làm bước khác."
    echo "Đây là chạy liền một mạch (plan mục 5.6, CODEX.md mục 12): các bước trước đã commit trong nhánh này; không ai trả lời câu hỏi giữa chừng."
    echo "Em tự build, test, chạy thử trên máy ảo, chụp ảnh / quay video và các ca máy ảo của bước (CODEX.md mục 10)."
    echo "Ảnh, video và tóm tắt để ở .codex-out/app-1410-$b/. Tin nhắn cuối là tóm tắt theo mẫu ở CODEX.md mục 11, tiêu đề '# Tóm tắt app-1410-$b'."
    [ -s "$V/$PHAN-ghi-them.md" ] && { echo; echo "Ghi thêm của tổ app:"; cat "$V/$PHAN-ghi-them.md"; }
    [ -n "$2" ] && { echo; echo "$2"; }
  } > "$1"
}

ghi "Bắt đầu phần $PHAN ở $WT, nhánh máy $NHANH, gốc $GOC, tài khoản đầu $CDX."
if [ "$PHAN" = android ] && ! { [ -n "${ANDROID_HOME:-}" ] && [ -d "${ANDROID_HOME:-/khong-co}/platforms" ] && [ -n "${JAVA_HOME:-}" ]; }; then
  ghi "Mac không có Android SDK / JDK: máy kiểm không build Android, CI build khi đẩy."
fi
for b in $BUOC; do
  B="$b"; BU="$(echo "${b:0:1}" | tr a-z A-Z)${b:1}"
  if git log --format=%s -n 80 | grep -q "^$TEN $BU: "; then ghi "$BU: đã có commit, bỏ qua."; continue; fi
  TIEU_DE="$(sed -n "s/^\*\*$BU\. \(.*\)\*\*\$/\1/p" "$PLAN/plan.md" | head -1)"
  [ -n "$TIEU_DE" ] || dung "Không thấy bước $BU trong plan.md."
  ghi "$BU: bắt đầu ($TIEU_DE)."
  loi_giao "$V/app-1410-$b-giao.md" ""
  chay_codex "$V/app-1410-$b-giao.md" "lan0" || dung "Codex không chạy được (xem $LAN.err)."
  vong=0
  while :; do
    cam="$(lenh_da_chay | grep -E "$CAM" | head -3)"
    [ -n "$cam" ] && dung "Codex chạy lệnh đụng thư mục khóa / bí mật (xem lệnh trong $LAN.jsonl). Không đẩy gì."
    lenh_da_chay | grep -E "$LA" | cut -c1-160 | sed "s/^/$BU: lệnh lạ: /" >> "$CB"
    LOI="$(kiem)"
    [ -z "$LOI" ] && break
    vong=$((vong + 1))
    printf '%s\n' "$LOI" > "$V/app-1410-$b-loi-vong$vong.txt"
    [ "$vong" -gt 3 ] && dung "Hết 3 vòng sửa mà máy kiểm vẫn báo lỗi (xem $V/app-1410-$b-loi-vong$vong.txt)."
    ghi "$BU: máy kiểm báo lỗi, giao lại vòng $vong."
    loi_giao "$V/app-1410-$b-giao-vong$vong.md" "Đây là vòng sửa $vong/3 của bước $BU. Worktree đang có phần em làm ở lần trước (chưa commit: xem git status, git diff, .codex-out/app-1410-$b/tomtat.md). Máy kiểm báo:
$LOI
Chỉ sửa đúng các lỗi này trong phạm vi bước $BU, rồi viết lại tóm tắt đủ mẫu."
    chay_codex "$V/app-1410-$b-giao-vong$vong.md" "vong$vong" || dung "Codex không chạy được ở vòng sửa $vong (xem $LAN.err)."
  done
  # Commit code trước, file CI có tên commit riêng sau (plan 5.5.4 mục 9).
  WF="$(git diff --cached --name-only | grep '^\.github/' || true)"
  [ -n "$WF" ] && git reset -q -- $WF
  git diff --cached --quiet || git -c core.hooksPath=/dev/null commit -q -m "$TEN $BU: $TIEU_DE (Codex viết, chạy liền một mạch; tổ app kiểm cuối phần)"
  if [ -n "$WF" ]; then
    git add -- $WF
    git -c core.hooksPath=/dev/null commit -q -m "$TEN $BU: file CI (ngoại lệ có tên, Codex sửa, tổ app kiểm cuối phần)"
  fi
  ghi "$BU: xong, commit $(git rev-parse --short HEAD)."
done
ghi "Xong mọi bước của phần $PHAN."
ket_thuc
