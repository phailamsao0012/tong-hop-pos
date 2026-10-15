#!/bin/bash
# Chạy liền một mạch các bước Codex của plan "số mới cho app và ô tìm đơn" (15/10/2026). Tổ web tổng viết.
# Chạy trên Mac, ngoài sandbox của Codex, trong worktree đã cài sẵn (xem khối lệnh trong plan.md mục 8):
#   nohup caffeinate -is bash docs/plans/2026-10-15-api-cho-app/chay-lien-mach.sh codex > ~/codex-viec/api-1510/chay.log 2>&1 &
# Mỗi bước: Codex làm (sandbox workspace-write), máy kiểm, sai thì giao lại tối đa 3 vòng, đạt thì commit.
# Xong (hoặc dừng): gom tóm tắt vào ket-qua.md, đẩy lên codex/api-app-1510. Không đẩy vào nhánh demo hay main.
# Viết cho bash 3.2 của macOS.
set -u
export PATH="$HOME/.local/node/bin:/opt/homebrew/bin:/usr/local/bin:$PATH"

CDX="${1:-codex}"
WT="$(git rev-parse --show-toplevel)" || exit 2
cd "$WT" || exit 2
V="$HOME/codex-viec/api-1510"
mkdir -p "$V"
PLAN="docs/plans/2026-10-15-api-cho-app"
BUOC="s1 s2 x1 w1 w2 w5"
DAY="codex/api-app-1510"
TEN="API cho app 15/10"
mkdir "$V/dang-chay" 2>/dev/null || { echo "Đang chạy rồi (xóa $V/dang-chay nếu chắc là không)."; exit 2; }
trap 'rmdir "$V/dang-chay" 2>/dev/null' EXIT
# Tự bật báo Telegram (anh Vũ 15/10: mỗi lần Codex chạy đều phải có tin, không cần dán thêm lệnh).
[ -f "$PLAN/bao-tele-api.sh" ] && (nohup bash "$WT/$PLAN/bao-tele-api.sh" > /dev/null 2>&1 &)
rm -f "$V/DUNG.md"
git fetch -q origin claude/project-thread-avd7td claude/project-thread-3ujeoc 2>/dev/null
NHANH="$(git rev-parse --abbrev-ref HEAD)"
GOC="$(git rev-parse --short HEAD)"
TD="$V/tien-do.txt"
CB="$V/canh-bao.txt"
B="(chưa bắt đầu)"
ghi() { echo "$(date -u '+%d/%m %H:%MZ') $*" | tee -a "$TD"; }

EX="$(git rev-parse --git-common-dir)/info/exclude"
for p in .codex-out/ .codex-dd/ .dev.vars .wrangler/ dist/ .DS_Store; do
  grep -qxF "$p" "$EX" 2>/dev/null || echo "$p" >> "$EX"
done

pham_vi() {
  case "$1" in
    s1) echo '^(lib/search-query\.ts|lib/audit\.ts|app/api/raw/orders/route\.ts|app/api/reports/customers/route\.ts|lib/demo/|tests/)' ;;
    s2) echo '^(wrangler\.jsonc|scripts/deploy-demo\.mjs|db/env\.d\.ts|lib/search-limit\.ts|app/api/raw/orders/route\.ts|app/api/reports/customers/route\.ts|tests/)' ;;
    x1) echo '^(app/api/reports/product-groups/route\.ts|app/product-group-blocks\.tsx|app/[^/]+\.tsx|app/api/[^ ]+/route\.ts|lib/|tests/)' ;;
    w1) echo '^(app/api/reports/product-groups/route\.ts|lib/|tests/)' ;;
    w2) echo '^(app/api/reports/staff-compare/route\.ts|lib/|tests/)' ;;
    w5) echo '^(app/api/reports/staff-compare/route\.ts|lib/compare-chart\.ts|app/staff-compare\.tsx|tests/)' ;;
  esac
}

# Dữ liệu nhạy cảm trên dòng thêm mới (repo công khai). SĐT giả dạng 0900000001 được phép.
NHAY='\+84 ?[0-9]|(^|[^0-9A-Za-z])0[0-9]{9}([^0-9A-Za-z]|$)|(^|[^0-9A-Za-z])0[0-9]{2}[ .][0-9]{3}[ .][0-9]{3,4}([^0-9]|$)|[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)*\.[a-z]{2,}|eyJ[A-Za-z0-9_-]{10,}|PRIVATE KEY'
NHAY_DUOC='900[ .]?000[ .]?00[0-9]|chu@demo\.megatech\.vn|noreply@'
CAM='(~|\$HOME|/Users/[^/ ]+)/\.megatech|(~|\$HOME|/Users/[^/ ]+)/\.ssh|\.config/gh|(~|\$HOME|/Users/[^/ ]+)/\.codex(-2)?([/ "'"'"']|$)|--remote|wrangler deploy'
LA='git (push|commit)|curl |wget |(^|[ ;&|(])gh |npm install|printenv|(^|[ ;&|(])env( |$)|pnpm format'

so_loi_lint() { pnpm lint 2>&1 | grep -c ': error '; }
ghi "Bắt đầu ở $WT, nhánh $NHANH, gốc $GOC, tài khoản đầu $CDX."
LINT_GOC="$(so_loi_lint)"; LINT_GOC="${LINT_GOC:-0}"
ghi "Lỗi lint ở gốc: $LINT_GOC."

khac() { if [ "$1" = codex ]; then echo codex2; else echo codex; fi; }
het_luot() { grep -qiE 'usage limit|rate limit|quota|too many requests|429' "$@" 2>/dev/null; }
LAN=""
chay_codex() {
  local thu=0 rc
  while :; do
    LAN="$V/$B-$2-$CDX"
    if [ "$CDX" = codex2 ]; then H="$HOME/.codex-2"; else H="$HOME/.codex"; fi
    CODEX_HOME="$H" codex exec -C "$WT" -s workspace-write -c 'approval_policy="never"' --json -o "$V/$B-tomtat.md" - < "$1" > "$LAN.jsonl" 2> "$LAN.err"
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

kiem() {
  local ds ngoai f n
  git add -A
  ds="$(git diff --cached --name-only)"
  if [ -z "$ds" ]; then echo "- Chưa có file nào thay đổi cho bước $BU."; return; fi
  ngoai="$(printf '%s\n' "$ds" | grep -vE "$(pham_vi "$B")")"
  [ -n "$ngoai" ] && echo "- File ngoài danh sách của bước $BU (trả về như cũ): $(echo $ngoai)"
  git diff --cached -U0 | awk '/^\+\+\+ /{f=substr($0,7);next} /^\+/{print f"\t"substr($0,2)}' > "$V/.them.txt"
  f="$(grep -E "$NHAY" "$V/.them.txt" | grep -vE "$NHAY_DUOC" | cut -f1 | sort -u)"
  [ -n "$f" ] && echo "- Dòng thêm mới có dạng SĐT / email / token (repo công khai), ở: $(echo $f). Dùng SĐT giả dạng 0900000001."
  [ -s "$V/$B-tomtat.md" ] && grep -q '^# Tóm tắt' "$V/$B-tomtat.md" || echo "- Thiếu tóm tắt theo mẫu CODEX.md mục 9."
  pnpm typecheck > "$V/$B-typecheck.log" 2>&1 || { echo "- pnpm typecheck lỗi:"; grep -E 'error TS' "$V/$B-typecheck.log" | head -15; }
  pnpm test > "$V/$B-test.log" 2>&1 || { echo "- pnpm test lỗi:"; grep -E '^not ok|# fail|Error' "$V/$B-test.log" | head -15; }
  pnpm build > "$V/$B-build.log" 2>&1 || { echo "- pnpm build lỗi:"; grep -iE 'error' "$V/$B-build.log" | head -15; }
  n="$(so_loi_lint)"; n="${n:-0}"
  [ "$n" -gt "$LINT_GOC" ] && { echo "- pnpm lint có $n lỗi, gốc có $LINT_GOC: sửa lỗi mới."; pnpm lint 2>&1 | grep ': error ' | grep -v '^public/vendor' | cut -c1-200 | head -15; }
}

ket_thuc() {
  local kq="$PLAN/ket-qua.md" b f
  {
    echo "# Kết quả chạy liền một mạch: $TEN"
    echo
    echo "Codex làm từng bước, máy kiểm sau mỗi bước. Tổ web tổng kiểm một lần sau khi đọc file này và diff."
    echo; echo "## Tiến độ"; echo '```'; sed -E 's#/Users/[^/ ]+#~#g' "$TD"; echo '```'
    if [ -s "$CB" ]; then echo; echo "## Cảnh báo cho tổ soát"; echo '```'; sed -E 's#/Users/[^/ ]+#~#g' "$CB"; echo '```'; fi
    for b in $BUOC; do
      f="$V/$b-tomtat.md"
      [ -s "$f" ] && { echo; echo "---"; echo; sed -E 's/^#/##/; s#/Users/[^/ ]+#~#g' "$f"; }
    done
  } > "$kq"
  if grep -E "$NHAY" "$kq" | grep -vqE "$NHAY_DUOC"; then
    ghi "ket-qua.md có dòng dạng SĐT / email / token: không commit, để ở máy."
  else
    git add -- "$kq" && git -c core.hooksPath=/dev/null commit -q -m "$TEN: tóm tắt của Codex các bước (Tổ web tổng kiểm cuối)" -- "$kq"
  fi
  [ -z "${KHONG_DAY:-}" ] || { ghi "Không đẩy (dừng vì lệnh đụng thư mục khóa / bí mật / web thật)."; return 0; }
  for t in 2 4 8 16 0; do
    if git -c core.hooksPath=/dev/null push -q -f origin "HEAD:$DAY"; then ghi "Đã đẩy lên $DAY ($(git rev-parse --short HEAD))."; return 0; fi
    [ "$t" -gt 0 ] && sleep "$t"
  done
  ghi "Đẩy lên $DAY lỗi."; return 1
}
dung() { ghi "DỪNG ở $B: $*"; printf '# Dừng ở bước %s\n\n%s\n' "$B" "$*" > "$V/DUNG.md"; ket_thuc; exit 1; }

loi_giao() {
  {
    echo "Repo phailamsao0012/tong-hop-pos. Em đang ở worktree $WT, nhánh $NHANH."
    echo "Đọc $PLAN/CODEX.md, rồi $PLAN/plan.md. Chỉ làm bước **$BU** ở mục 5 của plan, không làm bước khác."
    echo "Chạy liền một mạch: các bước trước đã commit trong nhánh này; không ai trả lời câu hỏi giữa chừng."
    echo "Tin nhắn cuối là tóm tắt theo mẫu CODEX.md mục 9, tiêu đề '# Tóm tắt $BU'."
    [ -s "$V/ghi-them.md" ] && { echo; echo "Ghi thêm của Tổ web tổng:"; cat "$V/ghi-them.md"; }
    [ -n "$2" ] && { echo; echo "$2"; }
  } > "$1"
}

for b in $BUOC; do
  B="$b"; BU="$(echo "$b" | tr a-z A-Z)"
  if git log --format=%s -n 40 | grep -q "^$TEN $BU: "; then ghi "$BU: đã có commit, bỏ qua."; continue; fi
  TIEU_DE="$(sed -n "s/^\*\*$BU\. \(.*\)\*\*\$/\1/p" "$PLAN/plan.md" | head -1)"
  [ -n "$TIEU_DE" ] || dung "Không thấy bước $BU trong plan.md."
  ghi "$BU: bắt đầu ($TIEU_DE)."
  loi_giao "$V/$b-giao.md" ""
  chay_codex "$V/$b-giao.md" "lan0" || dung "Codex không chạy được (xem $LAN.err)."
  vong=0
  while :; do
    cam="$(lenh_da_chay | grep -E "$CAM" | head -3)"
    [ -n "$cam" ] && { KHONG_DAY=1; dung "Codex chạy lệnh đụng thư mục khóa / bí mật / web thật (xem $LAN.jsonl). Không đẩy gì."; }
    lenh_da_chay | grep -E "$LA" | cut -c1-160 | sed "s/^/$BU: lệnh lạ: /" >> "$CB"
    LOI="$(kiem)"
    [ -z "$LOI" ] && break
    vong=$((vong + 1))
    printf '%s\n' "$LOI" > "$V/$b-loi-vong$vong.txt"
    [ "$vong" -gt 3 ] && dung "Hết 3 vòng sửa mà máy kiểm vẫn báo lỗi (xem $V/$b-loi-vong$vong.txt)."
    ghi "$BU: máy kiểm báo lỗi, giao lại vòng $vong."
    loi_giao "$V/$b-giao-vong$vong.md" "Đây là vòng sửa $vong/3 của bước $BU. Worktree đang có phần em làm ở lần trước (chưa commit: xem git status, git diff). Máy kiểm báo:
$LOI
Chỉ sửa đúng các lỗi này trong phạm vi bước $BU, rồi viết lại tóm tắt đủ mẫu."
    chay_codex "$V/$b-giao-vong$vong.md" "vong$vong" || dung "Codex không chạy được ở vòng sửa $vong (xem $LAN.err)."
  done
  git -c core.hooksPath=/dev/null commit -q -m "$TEN $BU: $TIEU_DE (Codex viết, chạy liền một mạch; Tổ web tổng kiểm cuối)"
  ghi "$BU: xong, commit $(git rev-parse --short HEAD)."
done
ghi "Xong mọi bước."
ket_thuc
