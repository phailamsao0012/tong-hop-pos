# Thay Cron Cloudflare (`* * * * *`): Task Scheduler gọi script này mỗi phút.
# Ghi giờ chạy được gần nhất vào C:\thp\log\cron-cuoi.txt để canh-may.ps1 biết lịch có bị trễ không.
param([int]$Port = 8787)
$code = & curl.exe -s -o NUL -w '%{http_code}' --max-time 50 "http://127.0.0.1:$Port/cdn-cgi/handler/scheduled?cron=*+*+*+*+*"
if ($code -eq '200') { Get-Date -Format s | Out-File -Encoding ascii 'C:\thp\log\cron-cuoi.txt' }
else { "$(Get-Date -Format s) cron trả $code" | Out-File -Append -Encoding utf8 "C:\thp\log\cron-$(Get-Date -Format 'yyyy-MM-dd').log" }
