#!/bin/zsh
# Đóng gói IPA chưa ký để ký bằng công cụ thứ ba (Sideloadly, AltStore, ESign, Feather…). Chạy: ./ios/dong-goi-ipa.sh
set -e
HERE="$(cd "$(dirname "$0")" && pwd)"
cd "$HERE/Megatech"
echo "→ Build bản Release chưa ký…"
xcodebuild -project Megatech.xcodeproj -scheme Megatech -configuration Release -destination 'generic/platform=iOS' -derivedDataPath /tmp/mtipa CODE_SIGNING_ALLOWED=NO CODE_SIGNING_REQUIRED=NO build 2>&1 | grep -E "error:|BUILD" || true
OUT="$HERE/ipa"
rm -rf "$OUT"; mkdir -p "$OUT/Payload"
cp -R /tmp/mtipa/Build/Products/Release-iphoneos/Megatech.app "$OUT/Payload/"
# Bỏ widget (PlugIns) như bản CI: widget còn đang thử, ký bằng Apple ID miễn phí tốn thêm App ID cho mỗi extension.
rm -rf "$OUT/Payload/Megatech.app/PlugIns"
(cd "$OUT" && zip -qr Megatech-unsigned.ipa Payload && rm -rf Payload)
echo "✓ File: $OUT/Megatech-unsigned.ipa"
open "$OUT"
