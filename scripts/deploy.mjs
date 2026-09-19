// Build với vinext rồi deploy lên Cloudflare Workers.
// --keep-vars: giữ các biến/secret đã đặt trên bảng điều khiển Cloudflare (BREVO_API_KEY...).
import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

execSync('pnpm build', { stdio: 'inherit' });
const path = 'dist/server/wrangler.json';
const config = JSON.parse(readFileSync(path, 'utf8'));
delete config.legacy_env; // wrangler mới không còn hỗ trợ trường này
writeFileSync(path, JSON.stringify(config));
execSync(`pnpm exec wrangler deploy --keep-vars --config ${path}`, { stdio: 'inherit' });
