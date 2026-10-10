// Thay module 'cloudflare:workers' khi chạy test trên Node: env do bài test gán (env.DB là D1 giả trên node:sqlite, xem d1-sqlite.ts).
export const env = globalThis.__THP_ENV__ ?? (globalThis.__THP_ENV__ = {});
export class DurableObject { constructor(ctx, env) { this.ctx = ctx; this.env = env; } }
