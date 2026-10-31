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
  $ps = (Get-Command powershell.exe).Source
  $web = New-ScheduledTaskAction -Execute $ps -Argument "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$App\scripts\pc\chay-web.ps1`""
  $cron = New-ScheduledTaskAction -Execute $ps -Argument "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$App\scripts\pc\goi-cron.ps1`""
  $settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit ([TimeSpan]::Zero) -MultipleInstances IgnoreNew -StartWhenAvailable
  $everyMinute = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) -RepetitionInterval (New-TimeSpan -Minutes 1)
  Register-ScheduledTask -TaskName 'THP Web' -Action $web -Trigger (New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME) -Settings $settings -Force | Out-Null
  Register-ScheduledTask -TaskName 'THP Cron' -Action $cron -Trigger $everyMinute -Settings $settings -Force | Out-Null
  Start-ScheduledTask -TaskName 'THP Web'
  Write-Output 'Đã đặt lịch: THP Web (khi đăng nhập, tự chạy lại), THP Cron (mỗi phút).'
}
Write-Output "Xong. Web: http://127.0.0.1:8787  ·  Dữ liệu: $Data  ·  Log: $Root\log"
