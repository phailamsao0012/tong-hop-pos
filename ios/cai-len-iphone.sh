#!/bin/zsh
# Build bản ký và cài app MEGATECH lên iPhone đang cắm cáp. Chạy: ./ios/cai-len-iphone.sh
set -e
cd "$(dirname "$0")/Megatech"
echo "→ Tìm iPhone…"
DEV=$(xcrun devicectl list devices 2>/dev/null | awk '/iPhone/ && ($4=="available" || $4=="connected") {print $3; exit}')
if [ -z "$DEV" ]; then echo "✗ Không thấy iPhone. Cắm cáp, mở khoá máy, bấm Tin cậy nếu được hỏi, rồi chạy lại."; exit 1; fi
echo "→ Build bản ký (1–3 phút)…"
xcodebuild -project Megatech.xcodeproj -scheme Megatech -configuration Release -destination 'generic/platform=iOS' -derivedDataPath /tmp/mtdev -allowProvisioningUpdates build 2>&1 | grep -E "error:|BUILD" || true
APP=/tmp/mtdev/Build/Products/Release-iphoneos/Megatech.app
[ -d "$APP" ] || { echo "✗ Build lỗi, mở Xcode để xem chi tiết."; exit 1; }
echo "→ Cài lên iPhone…"
xcrun devicectl device install app --device "$DEV" "$APP" 2>&1 | grep -E "installationURL|ERROR" || true
xcrun devicectl device process launch --device "$DEV" vn.megatech.tonghoppos >/dev/null 2>&1 && echo "✓ Đã cài và mở app trên iPhone." || echo "✓ Đã cài. Mở app MEGATECH trên iPhone (nếu báo Untrusted Developer: Cài đặt → Cài đặt chung → VPN & Quản lý thiết bị → Tin cậy)."
