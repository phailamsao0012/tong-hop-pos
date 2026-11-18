#!/usr/bin/env bash
# Chỉ chủ repo chạy trên Mac, ngoài phiên trợ lý.
set -euo pipefail
umask 077
die() { printf '%s\n' "$*" >&2; exit 1; }
keytool_bin=$(command -v keytool || true)
if [[ -z "$keytool_bin" ]]; then
  keytool_bin="/Applications/Android Studio.app/Contents/jbr/Contents/Home/bin/keytool"
fi
[[ -x "$keytool_bin" ]] || die "Thiếu keytool"
for tool in gh openssl security git base64; do
  command -v "$tool" >/dev/null || die "Thiếu $tool"
done
gh auth status >/dev/null 2>&1 || die "gh chưa đăng nhập"
origin=$(git remote get-url origin) || die "Không phải thư mục repo"
[[ "$origin" =~ [:/]phailamsao0012/tong-hop-pos(\.git)?$ ]] || die "Sai repo origin"
admin=$(gh api repos/phailamsao0012/tong-hop-pos --jq .permissions.admin)
[[ "$admin" == true ]] || die "Cần quyền admin repo"

keydir="$HOME/.megatech"
keyfile="$keydir/android-release-2026.jks"
[[ ! -e "$keyfile" && ! -L "$keyfile" ]] || die "File khóa đã có, không ghi đè"
mkdir -p "$keydir"
chmod 700 "$keydir"
kspw=$(openssl rand -base64 33)
trap 'unset kspw' EXIT
kspw="$kspw" "$keytool_bin" -genkeypair -keystore "$keyfile" -storetype PKCS12 -alias megatech -keyalg RSA -keysize 4096 -validity 10000 -dname "CN=MEGATECH" -storepass:env kspw -keypass:env kspw
security add-generic-password -U -s megatech-android-release -a megatech -w "$kspw"

uid=$(gh api user --jq .id)
[[ "$uid" =~ ^[0-9]+$ ]] || die "Không đọc được tài khoản GitHub"
gh api -X PUT repos/phailamsao0012/tong-hop-pos/environments/android-release --input - >/dev/null <<EOF
{"prevent_self_review":false,"reviewers":[{"type":"User","id":$uid}],"deployment_branch_policy":{"protected_branches":false,"custom_branch_policies":true}}
EOF
policies=$(gh api --paginate repos/phailamsao0012/tong-hop-pos/environments/android-release/deployment-branch-policies --jq '.branch_policies[] | select(.name == "main" and .type == "branch") | .id')
if [[ -z "$policies" ]]; then
  gh api -X POST repos/phailamsao0012/tong-hop-pos/environments/android-release/deployment-branch-policies -f name=main -f type=branch >/dev/null
fi
# Xóa các chính sách khác nếu Environment đã tồn tại.
other_policies=$(gh api --paginate repos/phailamsao0012/tong-hop-pos/environments/android-release/deployment-branch-policies --jq '.branch_policies[] | select(.name != "main" or .type != "branch") | .id')
while IFS= read -r policy; do
  [[ -n "$policy" ]] || continue
  [[ "$policy" =~ ^[0-9]+$ ]] || die "Mã chính sách không hợp lệ"
  gh api -X DELETE "repos/phailamsao0012/tong-hop-pos/environments/android-release/deployment-branch-policies/$policy" >/dev/null
done <<< "$other_policies"

base64 < "$keyfile" | gh secret set ANDROID_KEYSTORE_B64 --env android-release --repo phailamsao0012/tong-hop-pos
printf %s "$kspw" | gh secret set ANDROID_STORE_PASSWORD --env android-release --repo phailamsao0012/tong-hop-pos
printf %s "$kspw" | gh secret set ANDROID_KEY_PASSWORD --env android-release --repo phailamsao0012/tong-hop-pos
printf %s megatech | gh secret set ANDROID_KEY_ALIAS --env android-release --repo phailamsao0012/tong-hop-pos

cert=$(LC_ALL=C kspw="$kspw" "$keytool_bin" -J-Duser.language=en -list -v -keystore "$keyfile" -alias megatech -storepass:env kspw)
fingerprint=$(printf '%s\n' "$cert" | sed -n 's/^[[:space:]]*SHA256:[[:space:]]*//p' | tr -d ':[:space:]' | tr '[:upper:]' '[:lower:]')
[[ "$fingerprint" =~ ^[0-9a-f]{64}$ ]] || die "Dấu vân tay không hợp lệ"
mkdir -p "$HOME/codex-viec"
printf '%s\n' "$fingerprint" > "$HOME/codex-viec/android-signing-cert.sha256"
unset kspw
printf '%s\n' "$fingerprint"
gh api user --jq .login
printf '%s\n' "Chép file khóa ~/.megatech/android-release-2026.jks ra USB hoặc ổ ngoài làm bản sao"
