import handler from 'vinext/server/fetch-handler';
import { SyncScheduler } from '@/lib/scheduler';
import { runScheduledSync } from '@/lib/sync';

export { SyncScheduler };

const scheduler = (env: Cloudflare.Env) => env.SYNC_SCHEDULER.get(env.SYNC_SCHEDULER.idFromName('main'));

// Worker entry: vinext phục vụ web + API; đồng bộ Pancake chạy nền bằng DO alarm
// (và cả Cron Trigger nếu Cloudflare gọi).
export default {
  async fetch(request: Request, env: Cloudflare.Env, ctx: ExecutionContext) {
    const { pathname } = new URL(request.url);
    if (pathname === '/' || pathname.startsWith('/api/'))
      ctx.waitUntil(scheduler(env).ensure().catch((error) => console.error('scheduler ensure failed', error)));
    return handler.fetch(request, env, ctx);
  },
  async scheduled(controller: ScheduledController, env: Cloudflare.Env, ctx: ExecutionContext) {
    ctx.waitUntil(scheduler(env).ensure().catch(() => undefined));
    ctx.waitUntil(runScheduledSync(env, new Date(controller.scheduledTime)));
  },
} satisfies ExportedHandler<Cloudflare.Env>;
