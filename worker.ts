import handler from 'vinext/server/fetch-handler';
import { SyncScheduler } from '@/lib/scheduler';

export { SyncScheduler };

const scheduler = (env: Cloudflare.Env) => env.SYNC_SCHEDULER.get(env.SYNC_SCHEDULER.idFromName('main'));

// Worker entry: vinext phục vụ web + API; đồng bộ Pancake chạy nền bằng DO alarm
// (và cả Cron Trigger nếu Cloudflare gọi).
export default {
  async fetch(request: Request, env: Cloudflare.Env, ctx: ExecutionContext) {
    const { pathname } = new URL(request.url);
    if (pathname === '/' || pathname.startsWith('/api/'))
      ctx.waitUntil(scheduler(env).ensure().catch((error) => console.error('scheduler ensure failed', error)));
    const started = Date.now();
    try {
      return await handler.fetch(request, env, ctx);
    } finally {
      // Ghi lại request chậm (kèm đường dẫn) để tra trong Workers Logs khi web "treo".
      const ms = Date.now() - started;
      if (ms > 3000) console.warn(`slow ${request.method} ${pathname} ${ms}ms`);
    }
  },
  // Cron Trigger chỉ "đánh thức" bộ hẹn giờ DO; DO là nơi duy nhất chạy đồng bộ (không chạy chồng hai lượt lên D1).
  async scheduled(controller: ScheduledController, env: Cloudflare.Env, ctx: ExecutionContext) {
    ctx.waitUntil(scheduler(env).kick().catch((error) => console.error('scheduler kick failed', error)));
  },
} satisfies ExportedHandler<Cloudflare.Env>;
