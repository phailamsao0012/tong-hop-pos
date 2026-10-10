// Bản demo (chế độ demo, 04/10/2026): cùng mã với web thật, deploy thành Worker riêng tong-hop-pos-demo với D1 riêng tong-hop-pos-demo,
// tên miền demo.tonghopposmegatech.io.vn. DEMO_MODE=1 thay Pancake POS và web nhân sự bằng bản giả (lib/demo/), nên bản demo
// không có khóa Pancake, không nối web nhân sự, không chạm dữ liệu thật.
// Chạy sau `pnpm build` (dùng lại dist/). --local: chỉ ghi cấu hình để chạy thử bằng wrangler dev, không gọi Cloudflare.
import { execSync } from 'node:child_process';
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';

const NAME = 'tong-hop-pos-demo';
const DOMAIN = 'demo.tonghopposmegatech.io.vn';
const local = process.argv.includes('--local');
const sh = (cmd, opts = {}) => execSync(cmd, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'], ...opts });

if (!existsSync('dist/server/wrangler.json')) execSync('pnpm build', { stdio: 'inherit' });

/** Mã D1 của bản demo; chưa có thì tạo. */
function databaseId() {
  if (local) return '00000000-0000-0000-0000-000000000000';
  const find = () => JSON.parse(sh('pnpm exec wrangler d1 list --json')).find((d) => d.name === NAME)?.uuid;
  let id = find();
  if (!id) { execSync(`pnpm exec wrangler d1 create ${NAME}`, { stdio: 'inherit' }); id = find(); }
  if (!id) throw new Error('Không tạo được D1 cho bản demo.');
  return id;
}

const id = databaseId();
const config = JSON.parse(readFileSync('dist/server/wrangler.json', 'utf8'));
delete config.legacy_env;
config.name = NAME;
config.topLevelName = NAME;
config.routes = [{ pattern: DOMAIN, custom_domain: true }];
config.workers_dev = true;
config.d1_databases = [{ binding: 'DB', database_name: NAME, database_id: id, migrations_dir: '../../drizzle' }];
// Không nối web nhân sự thật.
config.services = [];
// Biến công khai: bản demo không có bí mật nào (mật khẩu demo ghi ngay trên trang đăng nhập).
config.vars = { REPORT_TIMEZONE: 'Asia/Ho_Chi_Minh', DEMO_MODE: '1', PANCAKE_POS_API_KEY: 'demo', AUTH_SECRET: 'megatech-demo-public', THP_SWR: '1' };
writeFileSync('dist/server/wrangler.demo.json', JSON.stringify(config));
console.log(`Đã ghi dist/server/wrangler.demo.json (${NAME}, D1 ${id}).`);
if (local) process.exit(0);

// Migration D1 của bản demo: cùng thư mục drizzle/ với web thật.
const migrate = 'wrangler.demo-migrate.json';
writeFileSync(migrate, JSON.stringify({ name: NAME, compatibility_date: config.compatibility_date, d1_databases: [{ binding: 'DB', database_name: NAME, database_id: id, migrations_dir: 'drizzle' }] }));
try { execSync(`pnpm exec wrangler d1 migrations apply DB --remote --config ${migrate}`, { stdio: 'inherit' }); }
finally { rmSync(migrate, { force: true }); }
execSync('pnpm exec wrangler deploy --config dist/server/wrangler.demo.json', { stdio: 'inherit' });
