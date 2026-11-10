#!/usr/bin/env bash
# Chỉ dùng trên runner: dữ liệu demo, D1 và mọi binding đều ở máy cục bộ.
set -euo pipefail
umask 077
export WRANGLER_SEND_METRICS=false
export CI=true
: "${RUNNER_TEMP:?}"
: "${GITHUB_ENV:?}"
base=http://127.0.0.1:8788
work="$RUNNER_TEMP/web-ao"
mkdir -p "$work"
ready=0
cleanup() {
  rm -f "$work/cookies"
  if [ "$ready" != 1 ] && [ -f "$RUNNER_TEMP/web-ao.pid" ]; then
    python3 - "$RUNNER_TEMP/web-ao.pid" <<'PY'
from os import killpg
from signal import SIGTERM
from sys import argv
from pathlib import Path
try:
    killpg(int(Path(argv[1]).read_text()), SIGTERM)
except ProcessLookupError:
    pass
PY
  fi
}
trap cleanup EXIT
# Chỉ xuất dòng HTTP an toàn; không đưa log thô (có thể chứa header) ra CI.
safe_tail() {
  tail -60 "$RUNNER_TEMP/web-ao.log" | sed -nE 's/.*(GET|POST|HEAD) (\/[^ ?]*)[^ ]* ([0-9]{3}).*/web-ao: \1 \2 \3/p'
}
pnpm install --frozen-lockfile || { echo '::error::web-ao: cài gói'; exit 1; }
pnpm build
node scripts/deploy-demo.mjs --local
node --input-type=module <<'NODE'
import { readFileSync, writeFileSync } from 'node:fs';
const source = JSON.parse(readFileSync('dist/server/wrangler.demo.json', 'utf8'));
// Danh sách cho phép: không kế thừa binding hay cấu hình remote của bản build.
const config = Object.fromEntries(['name', 'main', 'compatibility_date', 'compatibility_flags', 'assets', 'durable_objects', 'migrations'].filter(k => source[k] !== undefined).map(k => [k, source[k]]));
config.d1_databases = source.d1_databases.map(d => ({ binding: d.binding, database_name: d.database_name, database_id: d.database_id, migrations_dir: d.migrations_dir }));
config.triggers = { crons: [] };
config.vars = { ...source.vars, DEMO_MODE: '1', LOCAL_DEV: '1', PANCAKE_POS_API_KEY: 'web-ao-demo-only' };
writeFileSync('dist/server/wrangler.ci.json', JSON.stringify(config));
writeFileSync('dist/server/wrangler.ci-d1.json', JSON.stringify({ name: config.name, compatibility_date: config.compatibility_date, d1_databases: config.d1_databases }));
NODE
# Wrangler chỉ tạo DB; sqlite3 đọc nguyên file để giữ nguyên trigger CASE…END.
pnpm exec wrangler d1 execute DB --local --command "CREATE TABLE IF NOT EXISTS _web_ao_init(x INTEGER)" --config dist/server/wrangler.ci-d1.json --persist-to "$RUNNER_TEMP/wstate"
find "$RUNNER_TEMP/wstate" -type f | sed 's#.*/wstate/##'
databases=()
while IFS= read -r file; do
  databases+=("$file")
done < <(find "$RUNNER_TEMP/wstate" -type f -path '*/miniflare-D1DatabaseObject/*' -name '*.sqlite' ! -name 'metadata.sqlite')
[ "${#databases[@]}" -gt 0 ] || { echo '::error::web-ao: không tìm được DB'; exit 1; }
db=$(ls -t "${databases[@]}" | head -1)
sqlite3 -bail "$db" 'CREATE TABLE IF NOT EXISTS d1_migrations (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT UNIQUE, applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL);'
for file in drizzle/*.sql; do
  name=${file##*/}
  sql_name=${name//\'/\'\'}
  applied=$(sqlite3 -bail "$db" "SELECT count(*) FROM d1_migrations WHERE name = '$sql_name';")
  [ "$applied" = 0 ] || continue
  if ! sqlite3 -bail "$db" < "$file" > "$work/migration.log" 2>&1; then
    echo "::error::web-ao: $name"
    exit 1
  fi
  if ! sqlite3 -bail "$db" "INSERT INTO d1_migrations (name) VALUES ('$sql_name');"; then
    echo "::error::web-ao: $name"
    exit 1
  fi
done
# Wrapper và con cùng nhóm tiến trình, để bước cuối job dọn được cả workerd.
python3 - "$RUNNER_TEMP" <<'PY'
from subprocess import Popen, STDOUT
from sys import argv
from pathlib import Path
root = Path(argv[1])
with (root / 'web-ao.log').open('w') as log:
    p = Popen(['pnpm', 'exec', 'wrangler', 'dev', '--config', 'dist/server/wrangler.ci.json', '--local', '--ip', '127.0.0.1', '--port', '8788', '--persist-to', str(root / 'wstate')], stdout=log, stderr=STDOUT, start_new_session=True)
(root / 'web-ao.pid').write_text(str(p.pid))
PY
# Không in header, cookie hay toàn bộ thân phản hồi; chỉ trường error của JSON demo.
request() {
  local method=$1 route=$2 output=$3 code status=0
  shift 3
  : > "$output"
  code=$(curl --silent --max-time 180 -X "$method" -b "$work/cookies" \
    -o "$output" -w '%{http_code}' "$@" "$base$route" 2> "$work/curl.log") || status=$?
  http_code=${code:-000}
  if [ "$status" != 0 ] || [ "$code" != 200 ]; then
    node - "$method" "${route%%\?*}" "${code:-000}" "$output" <<'NODE'
const fs = require('fs');
const [method, route, code, file] = process.argv.slice(2);
let error = 'Không có trường error JSON';
try { const body = JSON.parse(fs.readFileSync(file, 'utf8')); if (typeof body.error === 'string') error = body.error; } catch {}
// JSON.stringify giữ thông báo trên một dòng, không cho chèn lệnh workflow.
console.error(`web-ao: ${method} ${route} HTTP ${code} error=${JSON.stringify(error)}`);
NODE
    if [ "$status" != 0 ]; then return "$status"; fi
    return 1
  fi
}
get() { request GET "$1" "$2"; }
deadline=$((SECONDS + 180))
while :; do
  # 401 nghĩa là máy chủ đã trả lời; đây là phép dò trước đăng nhập.
  if request GET /api/auth/me "$work/probe.json" --max-time 5; then break; fi
  if [[ "$http_code" =~ ^[1-5][0-9][0-9]$ ]]; then break; fi
  if [ "$SECONDS" -ge "$deadline" ]; then
    safe_tail
    echo '::error::web-ao: hết giờ chờ'
    exit 1
  fi
  sleep 2
done
# Trang đăng nhập mới gọi ensureDemoSeed; API đăng nhập không tự tạo tài khoản.
get /login "$work/login.html"
request POST /api/auth/login "$work/login.json" -c "$work/cookies" -H 'content-type: application/json' \
  -d '{"email":"chu@demo.megatech.vn","password":"demo@2026","remember":true}'
grep -q thp_session "$work/cookies" || { echo '::error::web-ao: không có phiên demo'; exit 1; }
# ensureDemoSeed không tạo pos_shops. Connection ghép Shop ID số từ Pancake giả;
# chuỗi cấu hình demo ở trên chỉ để qua kiểm tra thiếu key, không phải bí mật.
get /api/connection "$work/connection.json"
node - "$work/connection.json" <<'NODE'
const fs = require('fs');
const r = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
if (r.status !== 'verified' || r.unmatched?.length) {
  console.error('::error::web-ao: connection chưa ghép đủ shop demo');
  process.exit(1);
}
NODE
get /api/sync/pos "$work/pos.json"
# Đối chiếu id với POS của chính mã đang build, không suy đoán dạng phản hồi.
node - "$work/pos.json" > "$work/pos.txt" <<'NODE'
const fs = require('fs');
const source = fs.readFileSync('lib/shared/report-model.ts', 'utf8').split('] as const;')[0];
const ids = [...source.matchAll(/\bid:\s*'([^']+)'/g)].map(m => m[1]);
const rows = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
if (!ids.length || !Array.isArray(rows) || rows.length !== ids.length ||
    new Set(rows.map(p => p.posId)).size !== ids.length || rows.some(p => !ids.includes(p.posId))) {
  console.error('::error::web-ao: sync/pos không trả đủ id POS hợp lệ');
  process.exit(1);
}
for (const id of ids) console.log(id);
NODE
while IFS= read -r pos; do
  for action in users products recent; do
    request POST /api/sync/pos "$work/sync.json" -H 'content-type: application/json' \
      -d "{\"posId\":\"$pos\",\"action\":\"$action\"}"
  done
  # Nạp tháng này và tháng trước bằng route đồng bộ sẵn có.
  complete=0
  for ((attempt=0; attempt<60; attempt++)); do
    request POST /api/sync/pos "$work/sync.json" -H 'content-type: application/json' \
      -d "{\"posId\":\"$pos\",\"action\":\"backfill\"}"
    if node -e 'const fs=require("fs");const r=JSON.parse(fs.readFileSync(process.argv[1]));const d=new Date();d.setUTCDate(1);d.setUTCMonth(d.getUTCMonth()-1);process.exit(r.completed||r.cursor?.completed||(r.cursor?.month && r.cursor.month<d.toISOString().slice(0,7))?0:1)' "$work/sync.json"; then
      complete=1
      break
    fi
  done
  [ "$complete" = 1 ] || { echo '::error::web-ao: đồng bộ chưa xong'; exit 1; }
done < "$work/pos.txt"
# Tổng quan yêu cầu khoảng ngày; cùng lịch Việt Nam với báo cáo.
period=$(node -e 'const d=new Date(Date.now()+7*3600000).toISOString().slice(0,10);console.log(`start=${d.slice(0,7)}-01&end=${d}`)')
get "/api/reports/overview?$period" "$work/overview.json"
node - "$work/overview.json" <<'NODE'
const fs = require('fs');
const total = JSON.parse(fs.readFileSync(process.argv[2], 'utf8')).current?.total;
if (!total || !(total.orders > 0)) {
  console.error('::error::web-ao: overview chưa có đơn ảo trong kỳ');
  process.exit(1);
}
NODE
get '/api/reports/staff-profile?list=1' "$work/people.json"
id=$(node -e 'const fs=require("fs"); const p=JSON.parse(fs.readFileSync(process.argv[1])).people[0]; if(!p)process.exit(1); process.stdout.write(encodeURIComponent(p.id))' "$work/people.json")
get "/api/reports/staff-profile?id=$id" "$work/profile.json"
echo "web-ao: staff-profile HTTP 200"
echo "BASE=$base" >> "$GITHUB_ENV"
echo "BASE=$base"
echo 'web-ao: sẵn sàng'
ready=1
