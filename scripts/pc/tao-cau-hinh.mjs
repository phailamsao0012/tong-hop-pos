// Tạo cấu hình chạy web tổng trên PC (plan docs/plans/2026-10-31-chuyen-sang-pc).
// Lấy dist/server/wrangler.json do `pnpm build` sinh ra, bỏ phần chỉ có trên Cloudflare:
// tên miền, cron (PC tự gọi mỗi phút), Workers AI, giới hạn tìm kiếm, service binding web nhân sự.
import { readFileSync, writeFileSync } from 'node:fs';

const src = 'dist/server/wrangler.json', out = 'dist/server/wrangler.pc.json';
const config = JSON.parse(readFileSync(src, 'utf8'));
delete config.legacy_env;
config.routes = [];
config.workers_dev = false;
config.triggers = { crons: [] };
delete config.ai;
config.ratelimits = [];
config.services = [];
config.d1_databases = config.d1_databases.map((db) => ({ ...db, migrations_dir: '../../drizzle' }));
writeFileSync(out, JSON.stringify(config, null, 2));
console.log(`Đã tạo ${out}`);
