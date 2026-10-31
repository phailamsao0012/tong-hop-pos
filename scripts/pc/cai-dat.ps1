# Cài web tổng lên PC Windows (plan docs/plans/2026-10-31-chuyen-sang-pc, bước B1–B3).
# Chạy lại nhiều lần được: lần sau chỉ kéo code mới, build lại, chạy migration trên SQLite của máy.
# Mặc định chạy bằng số ảo (DEMO_MODE=1). Chép dữ liệu thật về là bước riêng, chờ anh Vũ đồng ý.
param(
  [string]$Branch = 'main',
  [string]$Root = 'C:\thp',
  [switch]$NoTasks
)
$ErrorActionPreference = 'Stop'
$App = "$Root\app"; $Data = "$Root\data"; $Secret = "$Root\bi-mat"
New-Item -ItemType Directory -Force -Path $Root, $Data, $Secret, "$Root\log" | Out-Null

$nodeVer = [version]((node --version).TrimStart('v'))
if ($nodeVer -lt [version]'22.13.0') { throw "Cần Node 22.13 trở lên, máy đang có $nodeVer" }
if (-not (Get-Command pnpm -ErrorAction SilentlyContinue)) { corepack enable pnpm }

if (-not (Test-Path "$App\.git")) { git clone --branch $Branch https://github.com/phailamsao0012/tong-hop-pos.git $App }
Set-Location $App
git fetch origin $Branch
git checkout -B $Branch "origin/$Branch"

# Đang chạy thì tắt hẳn web trước khi build. Tắt task trước (31/10: vòng lặp chay-web.ps1 bật lại web sau 5 giây, giữ thư mục dist,
# build báo EPERM), dừng cả cây tiến trình chay-web.ps1, rồi mới dọn cổng 8787. Cuối script bật lại task.
$hasWeb = [bool](Get-ScheduledTask -TaskName 'THP Web' -ErrorAction SilentlyContinue)
if ($hasWeb) { Disable-ScheduledTask -TaskName 'THP Web' | Out-Null; Stop-ScheduledTask -TaskName 'THP Web' -ErrorAction SilentlyContinue }
Get-CimInstance Win32_Process -Filter "Name='powershell.exe' OR Name='pwsh.exe'" -ErrorAction SilentlyContinue |
  Where-Object { $_.CommandLine -like '*chay-web.ps1*' -and $_.ProcessId -ne $PID } |
  ForEach-Object { taskkill /PID $_.ProcessId /T /F | Out-Null }
Get-NetTCPConnection -LocalPort 8787 -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique |
  ForEach-Object { taskkill /PID $_ /T /F | Out-Null }
Start-Sleep -Seconds 2

try {
pnpm install --frozen-lockfile
pnpm build
if ($LASTEXITCODE -ne 0) { throw "Build lỗi (mã $LASTEXITCODE)." }
node scripts/pc/tao-cau-hinh.mjs

# Bí mật để ngoài repo. Lần đầu tạo bản số ảo; bản thật do anh Vũ điền ở bước chuyển dữ liệu.
$vars = "$Secret\.dev.vars"
if (-not (Test-Path $vars)) {
  $bytes = New-Object byte[] 32; [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
  # PANCAKE_READ_ONLY=1: chạy song song với web thật thì PC không chia số (B5); bỏ dòng này khi chuyển hẳn (B6).
  "DEMO_MODE=1`nPANCAKE_READ_ONLY=1`nAUTH_SECRET=$(-join ($bytes | ForEach-Object { $_.ToString('x2') }))" | Out-File -Encoding ascii $vars
}
Copy-Item $vars 'dist\server\.dev.vars' -Force

pnpm exec wrangler d1 migrations apply DB --local --config dist/server/wrangler.pc.json --persist-to $Data
} finally {
  # Lỗi giữa chừng cũng bật lại task để web cũ chạy tiếp.
  if ($hasWeb) { Enable-ScheduledTask -TaskName 'THP Web' | Out-Null }
}

if (-not $NoTasks) {
  & "$App\scripts\pc\dat-lich.ps1" -App $App
  Start-ScheduledTask -TaskName 'THP Web' -ErrorAction SilentlyContinue  # lịch S4U do quản trị đặt thì task tự lên trong 5 phút
}
Write-Output "Xong. Web: http://127.0.0.1:8787  ·  Dữ liệu: $Data  ·  Log: $Root\log"
