// Bộ nạp module cho bản build Cloudflare chạy trên Node (N2): trỏ 'cloudflare:workers' về pc/cloudflare-workers.
// pc/server.ts gọi module.register() với file này trước khi nạp dist/server/index.js.
type Resolve = (specifier: string, context: unknown, next: (s: string, c: unknown) => Promise<unknown>) => Promise<unknown>;

const shim = new URL(import.meta.url.endsWith('.ts') ? './cloudflare-workers.ts' : './cloudflare-workers.js', import.meta.url).href;

export const resolve: Resolve = async (specifier, context, next) => {
  if (specifier === 'cloudflare:workers') return { url: shim, shortCircuit: true };
  return next(specifier, context);
};
