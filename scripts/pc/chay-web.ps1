# Chạy web tổng trên PC Windows của anh Vũ (plan docs/plans/2026-10-31-chuyen-sang-pc).
# Chạy liên tục: web dừng hay lỗi thì 5 giây sau tự chạy lại. Task Scheduler gọi script này khi đăng nhập Windows.
# Dữ liệu (D1 thành SQLite, Durable Object, cache) nằm ở $Data, ngoài thư mục code.
param(
  [string]$App = 'C:\thp\app',
  [string]$Data = 'C:\thp\data',
  [string]$Vars = 'C:\thp\bi-mat\.dev.vars',
  [int]$Port = 8787
)
$ErrorActionPreference = 'Continue'
$log = 'C:\thp\log'
New-Item -ItemType Directory -Force -Path $log, $Data | Out-Null
Set-Location $App
while ($true) {
  $stamp = Get-Date -Format 'yyyy-MM-dd'
  if (-not (Test-Path 'dist\server\wrangler.json')) { pnpm build *>> "$log\build-$stamp.log" }
  node scripts/pc/tao-cau-hinh.mjs *>> "$log\web-$stamp.log"
  if (Test-Path $Vars) { Copy-Item $Vars 'dist\server\.dev.vars' -Force }
  "$(Get-Date -Format s) bắt đầu chạy web" | Out-File -Append -Encoding utf8 "$log\web-$stamp.log"
  pnpm exec wrangler dev --config dist/server/wrangler.pc.json --local --test-scheduled --ip 127.0.0.1 --port $Port --persist-to $Data *>> "$log\web-$stamp.log"
  "$(Get-Date -Format s) web dừng (mã $LASTEXITCODE), chạy lại sau 5 giây" | Out-File -Append -Encoding utf8 "$log\web-$stamp.log"
  Start-Sleep -Seconds 5
}
