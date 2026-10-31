# Việc làm một lần khi anh Vũ ngồi ở PC (plan docs/plans/2026-10-31-chuyen-sang-pc). Khoảng 15 phút, anh chỉ bấm:
#  1. Hộp "Cho phép thay đổi?" của Windows (quyền quản trị) một lần ở đầu.
#  2. Notepad mở file bí mật: dán khoá Pancake và khoá bot Telegram vào dòng có sẵn, lưu, đóng.
#  3. Trang Google mở ra: đăng nhập, bấm Cho phép (rclone chỉ được ghi vào thư mục nó tự tạo trên Drive).
#  4. Cắm USB: script tự chép khoá riêng sao lưu ra USB.
#  5. Trang Chrome Remote Desktop mở ra: đặt tên PC và mã PIN.
# Sau đó web chạy cả khi chưa đăng nhập Windows (bật lại sau mất điện là tự lên).
param([string]$Root = 'C:\thp', [string]$User = $env:USERNAME)
$ErrorActionPreference = 'Stop'
$App = "$Root\app"; $Secret = "$Root\bi-mat"

# Quyền quản trị: tự mở lại chính nó và hỏi anh một lần
$admin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $admin) {
  Start-Process powershell.exe -Verb RunAs -ArgumentList "-NoProfile -ExecutionPolicy Bypass -NoExit -File `"$PSCommandPath`" -Root `"$Root`" -User `"$User`""
  return
}
$step = { param($n, $t) Write-Host "`n=== $n. $t ===" -ForegroundColor Green }

& $step 1 'Khoá Pancake và khoá bot Telegram'
$vars = "$Secret\.dev.vars"
$text = Get-Content $vars -Raw
foreach ($k in 'PANCAKE_POS_API_KEY', 'TELEGRAM_BOT_TOKEN') { if ($text -notmatch "(?m)^$k=") { Add-Content -Path $vars -Value "$k=" -Encoding ascii } }
Write-Host 'Notepad đang mở: dán khoá ngay sau dấu = ở hai dòng cuối, bấm Ctrl+S rồi đóng Notepad.'
Start-Process notepad.exe -ArgumentList "`"$vars`"" -Wait

& $step 2 'Nối Google Drive cho sao lưu'
$rc = "$Root\rclone"
if (-not (Test-Path "$rc\rclone.exe")) {
  $zip = "$env:TEMP\rclone.zip"
  Invoke-WebRequest 'https://downloads.rclone.org/v1.68.2/rclone-v1.68.2-windows-amd64.zip' -OutFile $zip -UseBasicParsing
  Expand-Archive $zip "$env:TEMP\rclone-x" -Force
  New-Item -ItemType Directory -Force -Path $rc | Out-Null
  Copy-Item "$env:TEMP\rclone-x\rclone-v1.68.2-windows-amd64\rclone.exe" "$rc\rclone.exe"
  Remove-Item $zip, "$env:TEMP\rclone-x" -Recurse -Force
}
$conf = "$Secret\rclone.conf"
if (-not (Test-Path $conf)) {
  Write-Host 'Trang Google sắp mở: đăng nhập tài khoản Google của anh rồi bấm Cho phép.'
  & "$rc\rclone.exe" config create thpdrive drive scope=drive.file --config $conf
}
& "$rc\rclone.exe" mkdir 'thpdrive:THP sao luu' --config $conf
Write-Host 'Đã nối Drive. Đêm nay sao lưu sẽ tự đẩy lên thư mục "THP sao luu".'

& $step 3 'Chép khoá riêng sao lưu ra USB'
$usb = Get-Volume | Where-Object { $_.DriveType -eq 'Removable' -and $_.DriveLetter } | Select-Object -First 1
if ($usb) {
  New-Item -ItemType Directory -Force -Path "$($usb.DriveLetter):\THP-khoa" | Out-Null
  Copy-Item "$Secret\khoa-rieng.pem" "$($usb.DriveLetter):\THP-khoa\khoa-rieng.pem" -Force
  Write-Host "Đã chép vào ổ $($usb.DriveLetter): (thư mục THP-khoa). Rút USB ra, cất riêng, không để cạnh PC."
} else {
  Write-Host 'Không thấy USB. Thư mục khoá sẽ mở: anh tự chép file khoa-rieng.pem ra USB sau.'
  Start-Process explorer.exe $Secret
}

& $step 4 'Web chạy cả khi chưa đăng nhập Windows'
& "$App\scripts\pc\dat-lich.ps1" -App $App -User $User -KhongCanDangNhap
# Bật lại web để nhận khoá mới
Stop-ScheduledTask -TaskName 'THP Web' -ErrorAction SilentlyContinue
Get-NetTCPConnection -LocalPort 8787 -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique |
  ForEach-Object { taskkill /PID $_ /T /F | Out-Null }
Start-ScheduledTask -TaskName 'THP Web'

& $step 5 'Chrome Remote Desktop (điều khiển PC từ Mac)'
$msi = "$env:TEMP\crd.msi"
Invoke-WebRequest 'https://dl.google.com/edgedl/chrome-remote-desktop/chromeremotedesktophost.msi' -OutFile $msi -UseBasicParsing
Start-Process msiexec.exe -ArgumentList "/i `"$msi`" /qn" -Wait
Remove-Item $msi -Force
Write-Host 'Trang Chrome Remote Desktop sắp mở: đăng nhập Google, bấm Bật, đặt tên PC và mã PIN 6 số.'
Start-Process 'https://remotedesktop.google.com/access'

Start-Sleep -Seconds 40
$code = & curl.exe -s -o NUL -w '%{http_code}' --max-time 30 'http://127.0.0.1:8787/login'
Write-Host "`nXong. Web trả $code. Nhắn Claude: ""xong việc ở PC""." -ForegroundColor Green
