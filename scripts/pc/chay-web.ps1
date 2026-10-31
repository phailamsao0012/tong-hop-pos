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
$env:WRANGLER_LOG = 'warn'  # bỏ bảng module in ra mỗi lần khởi động, log không phình
$log = 'C:\thp\log'
New-Item -ItemType Directory -Force -Path $log, $Data | Out-Null
Set-Location $App
while ($true) {
  $stamp = Get-Date -Format 'yyyy-MM-dd'
  if (-not (Test-Path 'dist\server\wrangler.json')) { pnpm build 2>&1 | Out-File -Append -Encoding utf8 "$log\build-$stamp.log" }
  node scripts/pc/tao-cau-hinh.mjs 2>&1 | Out-File -Append -Encoding utf8 "$log\web-$stamp.log"
  if (Test-Path $Vars) { Copy-Item $Vars 'dist\server\.dev.vars' -Force }
  "$(Get-Date -Format s) bắt đầu chạy web" | Out-File -Append -Encoding utf8 "$log\web-$stamp.log"
  # Ghi log qua cmd để dòng nào ra là ghi ngay (Out-File chờ tới khi wrangler thoát mới ghi).
  cmd /c "pnpm exec wrangler dev --config dist/server/wrangler.pc.json --local --test-scheduled --ip 127.0.0.1 --port $Port --persist-to `"$Data`" >> `"$log\web-$stamp.log`" 2>&1"
  "$(Get-Date -Format s) web dừng (mã $LASTEXITCODE), chạy lại sau 5 giây" | Out-File -Append -Encoding utf8 "$log\web-$stamp.log"
  Start-Sleep -Seconds 5
}
