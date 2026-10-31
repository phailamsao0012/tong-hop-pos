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

# Đang chạy thì tắt hẳn web trước khi build (Stop-ScheduledTask chỉ dừng powershell, wrangler/workerd còn giữ cổng 8787).
if (Get-ScheduledTask -TaskName 'THP Web' -ErrorAction SilentlyContinue) { Stop-ScheduledTask -TaskName 'THP Web' -ErrorAction SilentlyContinue }
Get-NetTCPConnection -LocalPort 8787 -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique |
  ForEach-Object { taskkill /PID $_ /T /F | Out-Null }

pnpm install --frozen-lockfile
pnpm build
node scripts/pc/tao-cau-hinh.mjs

# Bí mật để ngoài repo. Lần đầu tạo bản số ảo; bản thật do anh Vũ điền ở bước chuyển dữ liệu.
$vars = "$Secret\.dev.vars"
if (-not (Test-Path $vars)) {
  $bytes = New-Object byte[] 32; [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
  "DEMO_MODE=1`nAUTH_SECRET=$(-join ($bytes | ForEach-Object { $_.ToString('x2') }))" | Out-File -Encoding ascii $vars
}
Copy-Item $vars 'dist\server\.dev.vars' -Force

pnpm exec wrangler d1 migrations apply DB --local --config dist/server/wrangler.pc.json --persist-to $Data

if (-not $NoTasks) {
  & "$App\scripts\pc\dat-lich.ps1" -App $App
  Start-ScheduledTask -TaskName 'THP Web' -ErrorAction SilentlyContinue  # lịch S4U do quản trị đặt thì task tự lên trong 5 phút
}
Write-Output "Xong. Web: http://127.0.0.1:8787  ·  Dữ liệu: $Data  ·  Log: $Root\log"
