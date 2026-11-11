# Chạy web tổng trên PC bằng Node (plan docs/plans/2026-11-01-chay-web-pc-node), thay chay-web.ps1 (wrangler dev).
# Task Scheduler "THP Web" gọi script này. Web dừng hay lỗi thì 5 giây sau tự chạy lại. Cron mỗi phút chạy trong tiến trình Node
# (không cần task "THP Cron"). Bản build: trong $App chạy `pnpm build` rồi `pnpm build:pc` (ra dist\pc\server.js).
# Quay lại wrangler: đổi action của "THP Web" về chay-web.ps1, bật lại "THP Cron", ghi "wrangler" vào C:\thp\che-do-web.txt.
# 10/11/2026 CHUYỂN HẲN: web chính là posmegatech.com chạy ở đây (anh Vũ "ok chuyển ngay bây giờ").
#   Bản build ở worktree C:\thp\cutover-c (nhánh claude/bo-xac-thuc-2-lop = main + công tắc THP_NO_MFA).
#   THP_READ_ONLY=0: mở quyền sửa (ghi đè giá trị 1 trong file khoá). THP_NO_MFA=1: bỏ mọi bước xác thực 2 lớp.
#   Web cũ Cloudflare: tonghopposmegatech.io.vn chuyển hướng 307 sang posmegatech.com (Redirect Rule), dữ liệu D1 giữ 30 ngày.
# Đổi bản chạy: build bản mới ở thư mục khác, sửa $App, rồi khởi động lại task "THP Web". Tiến trình cũ chạy quyền hệ thống,
# nên cần PowerShell quyền admin (Stop-Process) hoặc khởi động lại máy.
param(
  [string]$App = 'C:\thp\cutover-b',
  [string]$Db = 'C:\thp\db\thp.sqlite',
  [string]$Vars = 'C:\thp\bi-mat\.dev.vars',
  [int]$Port = 8787
)
$ErrorActionPreference = 'Continue'
$log = 'C:\thp\log'
New-Item -ItemType Directory -Force -Path $log | Out-Null
Set-Location $App
$env:THP_DB = $Db
$env:THP_VARS = $Vars
$env:PORT = "$Port"
$env:HOST = '127.0.0.1'
$env:THP_READ_ONLY = '0'
$env:THP_NO_MFA = '1'
# Thông báo ở trang đăng nhập (anh Vũ 10/11/2026). Muốn bỏ thì xoá dòng này rồi khởi động lại web.
$env:THP_LOGIN_NOTICE = "Web cũ (tonghopposmegatech.io.vn) đang bảo trì. Từ nay dùng web mới: https://posmegatech.com`nLần đầu vào: bấm ""Quên mật khẩu?"", nhập email công việc, lấy mã 6 số trong email (xem cả Spam) rồi đặt mật khẩu mới. Lần sau chỉ cần email + mật khẩu."
while ($true) {
  $stamp = Get-Date -Format 'yyyy-MM-dd'
  "$(Get-Date -Format s) bắt đầu chạy web (Node)" | Out-File -Append -Encoding utf8 "$log\web-node-$stamp.log"
  # Ghi log qua cmd để dòng nào ra là ghi ngay.
  cmd /c "node dist\pc\server.js >> `"$log\web-node-$stamp.log`" 2>&1"
  "$(Get-Date -Format s) web dừng (mã $LASTEXITCODE), chạy lại sau 5 giây" | Out-File -Append -Encoding utf8 "$log\web-node-$stamp.log"
  Start-Sleep -Seconds 5
}
