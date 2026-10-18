#!/bin/bash
# Chạy liền một mạch các bước Codex của plan "Giảm dòng ghi D1 về trong phần gói đã gồm" (18/10/2026). Tổ web tổng viết (dựa trên bản Học từ Odoo).
# Chạy trên Mac (hoặc PC Git Bash), trong worktree riêng đã pnpm install:
#   bash docs/plans/2026-10-18-giam-ghi-d1/chay-lien-mach.sh
# Báo Telegram chạy song song: bash docs/plans/2026-10-18-giam-ghi-d1/bao-tele-giam-ghi.sh &
# Xong mọi bước thì tự đẩy nhánh codex/giam-ghi-d1-1810 (DAY=0 để không đẩy).
# Biến tuỳ chọn:
#   CODEX_BIN    lệnh gọi Codex (mặc định: codex)
#   CODEX_HOME_1 / CODEX_HOME_2  thư mục đăng nhập tài khoản 1 / 2 (mặc định ~/.codex và ~/.codex-2)
#   BAO_TELE     lệnh gửi một tin Telegram, nhận nội dung ở đối số đầu (vd: bash /c/codex-viec/tele/gui.sh)
#   CODEX_ARGS   cờ thêm cho codex exec, đặt SAU chữ exec (PC Windows: -c windows.sandbox=unelevated)
#   BUOC         danh sách bước muốn chạy (mặc định tất cả)
# Mỗi bước: Codex làm (sandbox workspace-write), máy kiểm, sai thì giao lại tối đa 3 vòng, đạt thì commit.
set -u
CODEX_BIN="${CODEX_BIN:-codex}"
H1="${CODEX_HOME_1:-$HOME/.codex}"
H2="${CODEX_HOME_2:-$HOME/.codex-2}"
WT="$(git rev-parse --show-toplevel)" || exit 2
cd "$WT" || exit 2
PLAN="docs/plans/2026-10-18-giam-ghi-d1"
V="${V:-$HOME/codex-viec/giam-ghi-d1-1810}"
mkdir -p "$V"
BUOC="${BUOC:-g1 g2 g3 g4 g5 g6 k1}"
TEN="Giảm ghi D1 18/10"
N="$(echo $BUOC | wc -w | tr -d ' ')"
mkdir "$V/dang-chay" 2>/dev/null || { echo "Đang chạy rồi (xóa $V/dang-chay nếu chắc là không)."; exit 2; }
TD="$V/tien-do.txt"
CB="$V/canh-bao.txt"
B="(chưa bắt đầu)"
TK=1

bao() { [ -n "${BAO_TELE:-}" ] && $BAO_TELE "🤖 CODEX web (giảm ghi D1): $*" > /dev/null 2>&1 || true; }
ghi() { echo "$(date -u '+%d/%m %H:%MZ') $*" | tee -a "$TD"; }

# Tin đều 20 phút một lần khi còn chạy (luật Telegram 15/10).
( while [ -d "$V/dang-chay" ]; do
    sleep 1200
    [ -d "$V/dang-chay" ] && bao "vẫn đang chạy: $(tail -1 "$TD" 2>/dev/null | cut -c1-200)"
  done ) &
NHIP=$!
trap 'rmdir "$V/dang-chay" 2>/dev/null; kill $NHIP 2>/dev/null' EXIT

EX="$(git rev-parse --git-common-dir)/info/exclude"
for p in .codex-out/ .dev.vars .wrangler/ dist/ .DS_Store; do
  grep -qxF "$p" "$EX" 2>/dev/null || echo "$p" >> "$EX"
done

pham_vi() {
  case "$1" in
    g1) echo '^(lib/(scheduler|sync|d1-usage)\.ts|app/api/sync/scheduler/usage/route\.ts|app/(d1-usage-panel|scheduler-panel)\.tsx|lib/demo/[^/]+\.ts|tests/[^/]*\.test\.ts|tests/support/[^/]+\.ts)$' ;;
    g2) echo '^(lib/sync\.ts|tests/[^/]*\.test\.ts|tests/support/[^/]+\.ts)$' ;;
    g3) echo '^(lib/(hr-sync|hr-copy)\.ts|tests/[^/]*\.test\.ts|tests/support/[^/]+\.ts)$' ;;
    g4) echo '^(lib/(dispatch|stuck-alert|scheduler|stats)\.ts|tests/[^/]*\.test\.ts|tests/support/[^/]+\.ts)$' ;;
    g5) echo '^(lib/(scheduler|dispatch)\.ts|lib/demo/[^/]+\.ts|worker\.ts|tests/[^/]*\.test\.ts)$' ;;
    g6) echo '^(lib/(scheduler|sync|d1-usage|watch-core|alerts|telegram)\.ts|worker\.ts|app/(d1-usage-panel|scheduler-panel)\.tsx|tests/[^/]*\.test\.ts)$' ;;
    k1) echo '^(tests/[^/]*\.test\.ts|tests/support/[^/]+\.ts|docs/plans/2026-10-18-giam-ghi-d1/do-ghi\.md)$' ;;
  esac
}

# Dữ liệu nhạy cảm trên dòng thêm mới (repo công khai). SĐT giả dạng 0900000001 được phép.
NHAY='\+84 ?[0-9]|(^|[^0-9A-Za-z])0[0-9]{9}([^0-9A-Za-z]|$)|[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)*\.[a-z]{2,}|eyJ[A-Za-z0-9_-]{10,}|PRIVATE KEY'
NHAY_DUOC='0900000[0-9]{3}|[a-z.]+@demo\.megatech\.vn|noreply@|example\.(com|vn)'
CAM='\.codex(-2)?([/\\ "'"'"']|$)|\.ssh|\.config/gh|tele-bot|wrangler[^;|&]*--remote|wrangler deploy|node scripts/deploy-demo'
LA='git (push|commit)|curl |wget |(^|[ ;&|(])gh |npm install|printenv|(^|[ ;&|(])env( |$)|pnpm format|oxfmt'

so_loi_lint() { pnpm lint 2>&1 | grep -c ': error '; }
ghi "Bắt đầu ở $WT, nhánh $(git rev-parse --abbrev-ref HEAD), gốc $(git rev-parse --short HEAD), $N bước."
bao "bắt đầu $N bước (A1 → D2)"
LINT_GOC="$(so_loi_lint)"; LINT_GOC="${LINT_GOC:-0}"
ghi "Lỗi lint ở gốc: $LINT_GOC."

# Số giây phải chờ: đọc "try again in 2 hours 5 minutes" / "in 37 minutes" / "at 18:30" trong lời báo; không đọc được thì 30 phút. Cộng thêm 2 phút.
gio_hoi() {
  node -e '
const fs = require("fs"); let t = "";
for (const f of process.argv.slice(1)) { try { t += fs.readFileSync(f, "utf8").slice(-20000); } catch {} }
let s = 0; const m = t.match(/in\s+((?:\d+\s*(?:days?|d|hours?|h|minutes?|mins?|m|seconds?|s)\b[\s,and]*)+)/i);
if (m) { for (const [, n, u] of m[1].matchAll(/(\d+)\s*(days?|d|hours?|h|minutes?|mins?|m|seconds?|s)\b/gi)) { const k = u[0].toLowerCase(); s += +n * (k === "d" ? 86400 : k === "h" ? 3600 : k === "m" ? 60 : 1); } }
if (!s) { const a = t.match(/(?:at|after)\s+(\d{1,2}):(\d{2})\s*(am|pm)?/i); if (a) { let h = +a[1]; if (a[3] && a[3].toLowerCase() === "pm" && h < 12) h += 12; if (a[3] && a[3].toLowerCase() === "am" && h === 12) h = 0; const now = new Date(); const d = new Date(now); d.setHours(h, +a[2], 0, 0); if (d <= now) d.setDate(d.getDate() + 1); s = Math.round((d - now) / 1000); } }
if (!s || s > 8 * 86400) s = 1800;
console.log(s + 120);' "$@" 2>/dev/null || echo 1920
}
het_luot() { grep -qiE 'usage limit|rate limit|quota|too many requests|429' "$@" 2>/dev/null; }
LAN=""
chay_codex() {
  local thu=0 rc h
  while :; do
    LAN="$V/$B-$2-tk$TK"
    if [ "$TK" = 2 ]; then h="$H2"; else h="$H1"; fi
    CODEX_HOME="$h" $CODEX_BIN exec ${CODEX_ARGS:-} -C "$WT" -s workspace-write -c 'approval_policy="never"' --json -o "$V/$B-tomtat.md" - < "$1" > "$LAN.jsonl" 2> "$LAN.err"
    rc=$?
    [ "$rc" -eq 0 ] && return 0
    if het_luot "$LAN.err" "$LAN.jsonl"; then
      thu=$((thu + 1))
      if [ "$TK" = 1 ]; then TK=2; else TK=1; fi
      ghi "$B: hết lượt, đổi sang tài khoản $TK"; bao "hết lượt, đổi sang tài khoản $TK"
      if [ $((thu % 2)) -eq 0 ]; then
        # Cả hai tài khoản hết lượt: tính giờ hồi từ lời báo lỗi (anh Vũ 15/10: chờ tới giờ hồi rồi tự làm tiếp, không hỏi).
        cho="$(gio_hoi "$LAN.err" "$LAN.jsonl")"
        ghi "$B: cả hai tài khoản hết lượt, chờ $((cho / 60)) phút rồi chạy tiếp"; bao "⏸ cả hai tài khoản hết lượt, chờ $((cho / 60)) phút rồi tự chạy tiếp"
        sleep "$cho"
      fi
      continue
    fi
    ghi "$B: codex thoát mã $rc"; return 1
  done
}
lenh_da_chay() {
  node -e '
const fs = require("fs");
for (const line of fs.readFileSync(process.argv[1], "utf8").split(/\r?\n/)) {
  let it; try { it = (JSON.parse(line) || {}).item || {}; } catch { continue; }
  if (it.type === "command_execution") { const c = it.command; console.log(typeof c === "string" ? c : (c || []).join(" ")); }
}' "$LAN.jsonl" 2>/dev/null
}

kiem() {
  local ds ngoai f n
  git add -A
  ds="$(git diff --cached --name-only)"
  if [ -z "$ds" ]; then echo "- Chưa có file nào thay đổi cho bước $BU."; return; fi
  ngoai="$(printf '%s\n' "$ds" | grep -vE "$(pham_vi "$B")")"
  [ -n "$ngoai" ] && echo "- File ngoài danh sách của bước $BU (trả về như cũ hoặc ghi vào Câu hỏi còn lại): $(echo $ngoai)"
  git diff --cached -U0 | awk '/^\+\+\+ /{f=substr($0,7);next} /^\+/{print f"\t"substr($0,2)}' > "$V/.them.txt"
  f="$(grep -E "$NHAY" "$V/.them.txt" | grep -vE "$NHAY_DUOC" | cut -f1 | sort -u)"
  [ -n "$f" ] && echo "- Dòng thêm mới có dạng SĐT / email / token (repo công khai), ở: $(echo $f). Dùng SĐT giả dạng 0900000001."
  { [ -s "$V/$B-tomtat.md" ] && grep -q '^# Tóm tắt' "$V/$B-tomtat.md"; } || echo "- Thiếu tóm tắt theo mẫu CODEX.md mục 9."
  pnpm typecheck > "$V/$B-typecheck.log" 2>&1 || { echo "- pnpm typecheck lỗi:"; grep -E 'error TS' "$V/$B-typecheck.log" | head -15; }
  pnpm test > "$V/$B-test.log" 2>&1 || { echo "- pnpm test lỗi:"; grep -E '^not ok|# fail|Error' "$V/$B-test.log" | head -15; }
  pnpm build > "$V/$B-build.log" 2>&1 || { echo "- pnpm build lỗi:"; grep -iE 'error' "$V/$B-build.log" | head -15; }
  n="$(so_loi_lint)"; n="${n:-0}"
  [ "$n" -gt "$LINT_GOC" ] && { echo "- pnpm lint có $n lỗi, gốc có $LINT_GOC: sửa lỗi mới."; pnpm lint 2>&1 | grep ': error ' | grep -v '^public/vendor' | cut -c1-200 | head -15; }
}

ket_thuc() {
  local kq="$PLAN/ket-qua-may.md" b f
  {
    echo "# Kết quả chạy liền một mạch: $TEN"
    echo
    echo "Codex làm từng bước, máy kiểm sau mỗi bước. Claude kiểm một lần sau khi đọc file này và diff."
    echo; echo "## Tiến độ"; echo '```'; sed -E 's#(/c/Users|C:\\Users|/Users|/home)/[^/\\ ]+#~#g' "$TD"; echo '```'
    if [ -s "$CB" ]; then echo; echo "## Cảnh báo"; echo '```'; sed -E 's#(/c/Users|C:\\Users|/Users|/home)/[^/\\ ]+#~#g' "$CB"; echo '```'; fi
    for b in $BUOC; do
      f="$V/$b-tomtat.md"
      [ -s "$f" ] && { echo; echo "---"; echo; sed -E 's/^#/##/; s#(/c/Users|C:\\Users|/Users|/home)/[^/\\ ]+#~#g' "$f"; }
    done
  } > "$kq"
  if grep -E "$NHAY" "$kq" | grep -vqE "$NHAY_DUOC"; then
    ghi "ket-qua-may.md có dòng dạng SĐT / email / token: không commit, để ở máy."
  else
    git add -- "$kq" && git -c core.hooksPath=/dev/null commit -q -m "$TEN: tóm tắt của Codex các bước (Claude kiểm cuối)" -- "$kq"
  fi
}
dung() { ghi "DỪNG ở $B: $*"; bao "⛔ DỪNG ở bước $BU: $(echo "$*" | cut -c1-200)"; printf '# Dừng ở bước %s\n\n%s\n' "$B" "$*" > "$V/DUNG.md"; ket_thuc; exit 1; }

loi_giao() {
  {
    echo "Repo phailamsao0012/tong-hop-pos. Em đang ở worktree $WT, nhánh $(git rev-parse --abbrev-ref HEAD)."
    echo "Đọc $PLAN/CODEX.md, rồi $PLAN/plan.md. Chỉ làm bước **$BU** của plan, không làm bước khác."
    echo "Chạy liền một mạch: các bước trước đã commit trong nhánh này; không ai trả lời câu hỏi giữa chừng."
    echo "Tin nhắn cuối là tóm tắt theo mẫu CODEX.md mục 9, tiêu đề '# Tóm tắt $BU'."
    [ -s "$V/ghi-them.md" ] && { echo; echo "Ghi thêm của Claude:"; cat "$V/ghi-them.md"; }
    [ -n "$2" ] && { echo; echo "$2"; }
  } > "$1"
}

i=0
for b in $BUOC; do
  i=$((i + 1)); B="$b"; BU="$(echo "$b" | tr a-z A-Z)"
  if git log --format=%s -n 60 | grep -q "^$TEN $BU: "; then ghi "$BU: đã có commit, bỏ qua."; continue; fi
  TIEU_DE="$(sed -n "s/^\*\*$BU\. \(.*\)\*\*\$/\1/p" "$PLAN/plan.md" | head -1)"
  [ -n "$TIEU_DE" ] || dung "Không thấy bước $BU trong plan.md."
  ghi "$BU: bắt đầu ($TIEU_DE)."; bao "bước $i/$N bắt đầu: $TIEU_DE"
  loi_giao "$V/$b-giao.md" ""
  chay_codex "$V/$b-giao.md" "lan0" || dung "Codex không chạy được (xem $LAN.err)."
  vong=0
  while :; do
    cam="$(lenh_da_chay | grep -E "$CAM" | grep -vE ".codex/(plugins|skills)/" | head -3)"
    [ -n "$cam" ] && dung "Codex chạy lệnh đụng thư mục khóa / bí mật / web thật (xem $LAN.jsonl)."
    lenh_da_chay | grep -E "$LA" | cut -c1-160 | sed "s/^/$BU: lệnh lạ: /" >> "$CB"
    LOI="$(kiem)"
    [ -z "$LOI" ] && break
    vong=$((vong + 1))
    printf '%s\n' "$LOI" > "$V/$b-loi-vong$vong.txt"
    [ "$vong" -gt 3 ] && dung "Hết 3 vòng sửa mà máy kiểm vẫn báo lỗi (xem $V/$b-loi-vong$vong.txt)."
    ghi "$BU: máy kiểm báo lỗi, giao lại vòng $vong."; bao "🔁 bước $i/$N máy kiểm lỗi, Codex sửa lần $vong/3"
    loi_giao "$V/$b-giao-vong$vong.md" "Đây là vòng sửa $vong/3 của bước $BU. Worktree đang có phần em làm ở lần trước (chưa commit: xem git status, git diff). Máy kiểm báo:
$LOI
Chỉ sửa đúng các lỗi này trong phạm vi bước $BU, rồi viết lại tóm tắt đủ mẫu."
    chay_codex "$V/$b-giao-vong$vong.md" "vong$vong" || dung "Codex không chạy được ở vòng sửa $vong (xem $LAN.err)."
  done
  git -c core.hooksPath=/dev/null commit -q -m "$TEN $BU: $TIEU_DE (Codex viết, chạy liền một mạch; Claude kiểm cuối)"
  ghi "$BU: xong, commit $(git rev-parse --short HEAD)."; bao "✅ bước $i/$N xong: $TIEU_DE"
done
ghi "Xong mọi bước."
ket_thuc
if [ "${DAY:-1}" = 1 ]; then
  if git push -q origin HEAD:codex/giam-ghi-d1-1810; then ghi "Đã đẩy lên codex/giam-ghi-d1-1810 ($(git rev-parse --short HEAD))."; else ghi "Không đẩy được lên GitHub, commit vẫn ở máy."; fi
fi
bao "🏁 xong cả $N bước, Claude kiểm một lần"
