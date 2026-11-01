# Chạy web tổng trên PC bằng Node (plan docs/plans/2026-11-01-chay-web-pc-node), thay chay-web.ps1 (wrangler dev).
# Task Scheduler "THP Web" gọi script này. Web dừng hay lỗi thì 5 giây sau tự chạy lại. Cron mỗi phút chạy trong tiến trình Node
# (không cần task "THP Cron"). Bản build: trong $App chạy `pnpm build` rồi `pnpm build:pc` (ra dist\pc\server.js).
# Quay lại wrangler: đổi action của "THP Web" về chay-web.ps1, bật lại "THP Cron", ghi "wrangler" vào C:\thp\che-do-web.txt.
param(
  [string]$App = 'C:\thp\node-main',
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
while ($true) {
  $stamp = Get-Date -Format 'yyyy-MM-dd'
  "$(Get-Date -Format s) bắt đầu chạy web (Node)" | Out-File -Append -Encoding utf8 "$log\web-node-$stamp.log"
  # Ghi log qua cmd để dòng nào ra là ghi ngay.
  cmd /c "node dist\pc\server.js >> `"$log\web-node-$stamp.log`" 2>&1"
  "$(Get-Date -Format s) web dừng (mã $LASTEXITCODE), chạy lại sau 5 giây" | Out-File -Append -Encoding utf8 "$log\web-node-$stamp.log"
  Start-Sleep -Seconds 5
}
