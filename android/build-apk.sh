#!/bin/zsh
# Build APK phát hành đã ký. Chạy: ./android/build-apk.sh  → file ở android/apk/Megatech.apk
set -e
cd "$(dirname "$0")"
export JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home"
./gradlew :app:assembleRelease -q
mkdir -p apk && cp app/build/outputs/apk/release/app-release.apk apk/Megatech.apk
echo "✓ $(pwd)/apk/Megatech.apk"
open apk
