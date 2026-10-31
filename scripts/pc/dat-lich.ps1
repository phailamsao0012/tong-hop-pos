# Đặt lịch Task Scheduler cho web tổng trên PC (plan docs/plans/2026-10-31-chuyen-sang-pc).
# cai-dat.ps1 gọi bản thường (chạy khi đăng nhập Windows). o-pc.ps1 gọi với -KhongCanDangNhap (cần quyền quản trị):
# các task chạy bằng tài khoản của anh ở chế độ S4U, tự lên khi PC bật lại sau mất điện mà không cần ai đăng nhập.
param(
  [string]$App = 'C:\thp\app',
  [string]$User = $env:USERNAME,
  [switch]$KhongCanDangNhap
)
$ErrorActionPreference = 'Stop'
$names = 'THP Web', 'THP Cron', 'THP Sao luu', 'THP Canh may'
# Đã đặt chế độ không cần đăng nhập rồi thì bản thường không đè lên (bản thường không có quyền sửa).
if (-not $KhongCanDangNhap) {
  $s4u = Get-ScheduledTask -TaskName 'THP Web' -ErrorAction SilentlyContinue | Where-Object { $_.Principal.LogonType -eq 'S4U' }
  if ($s4u) { Write-Output 'Lịch đang ở chế độ không cần đăng nhập, giữ nguyên.'; return }
}
$ps = (Get-Command powershell.exe).Source
$node = (Get-Command node.exe).Source
$psArg = { param($f) "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$App\scripts\pc\$f`"" }
$web = New-ScheduledTaskAction -Execute $ps -Argument (& $psArg 'chay-web.ps1')
$cron = New-ScheduledTaskAction -Execute $ps -Argument (& $psArg 'goi-cron.ps1')
$backup = New-ScheduledTaskAction -Execute $node -Argument "--no-warnings `"$App\scripts\pc\sao-luu.mjs`"" -WorkingDirectory $App
$watch = New-ScheduledTaskAction -Execute $node -Argument "--no-warnings `"$App\scripts\pc\canh-may.mjs`"" -WorkingDirectory $App
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit ([TimeSpan]::Zero) -MultipleInstances IgnoreNew -StartWhenAvailable
$every = { param($m) New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) -RepetitionInterval (New-TimeSpan -Minutes $m) }
# Vòng lặp trong chay-web.ps1 có lúc chết theo wrangler (31/10, mã 0xC000013A): lượt gọi lại mỗi 5 phút;
# MultipleInstances IgnoreNew nên khi web đang chạy thì lượt này bỏ qua.
$webTriggers = @((& $every 5))
if ($KhongCanDangNhap) {
  $webTriggers += New-ScheduledTaskTrigger -AtStartup
  $principal = New-ScheduledTaskPrincipal -UserId $User -LogonType S4U -RunLevel Limited
} else {
  $webTriggers += New-ScheduledTaskTrigger -AtLogOn -User $User
  $principal = New-ScheduledTaskPrincipal -UserId $User -LogonType Interactive -RunLevel Limited
}
$reg = { param($name, $action, $triggers) Register-ScheduledTask -TaskName $name -Action $action -Trigger $triggers -Settings $settings -Principal $principal -Force | Out-Null }
& $reg 'THP Web' $web $webTriggers
& $reg 'THP Cron' $cron (& $every 1)
& $reg 'THP Sao luu' $backup (New-ScheduledTaskTrigger -Daily -At '02:30')
& $reg 'THP Canh may' $watch (& $every 5)
Write-Output "Đã đặt lịch: $($names -join ', ')$(if ($KhongCanDangNhap) { ' (chạy cả khi chưa đăng nhập Windows)' })."
