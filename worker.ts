import handler from 'vinext/server/fetch-handler';
import { runScheduledSync } from '@/lib/sync';

// Worker entry: vinext phục vụ web + API; `scheduled` chạy cron đồng bộ Pancake.
export default {
  fetch: handler.fetch,
  async scheduled(controller: ScheduledController, env: Cloudflare.Env, ctx: ExecutionContext) {
    ctx.waitUntil(runScheduledSync(env, new Date(controller.scheduledTime)));
  },
} satisfies ExportedHandler<Cloudflare.Env>;
