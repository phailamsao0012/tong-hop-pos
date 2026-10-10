// Nạp bằng `tsx --import ./tests/support/register.mjs`: chỉ đổi đường dẫn 'cloudflare:workers', mọi module khác giữ nguyên.
import { register } from 'node:module';
register('./hooks.mjs', import.meta.url);
