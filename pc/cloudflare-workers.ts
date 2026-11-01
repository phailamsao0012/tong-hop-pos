// Bản thay module 'cloudflare:workers' khi web tổng chạy bằng Node trên PC (plan 2026-11-01-chay-web-pc-node, N2).
// Bản build Cloudflare (dist/server) import { env, DurableObject } từ module này; pc/register.mjs trỏ import đó về đây.
// env là MỘT object dùng chung (globalThis), máy chủ pc/server.ts điền DB, SYNC_SCHEDULER và biến môi trường vào trước khi nạp web.
type Env = Record<string, unknown>;
const g = globalThis as { __THP_ENV__?: Env };
export const env: Env = g.__THP_ENV__ ?? (g.__THP_ENV__ = {});

/** Lớp nền Durable Object: chỉ giữ ctx và env như Cloudflare. */
export class DurableObject<E = Env> {
  ctx: unknown;
  env: E;
  constructor(ctx: unknown, env: E) {
    this.ctx = ctx;
    this.env = env;
  }
}
