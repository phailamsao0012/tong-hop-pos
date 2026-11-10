// Offline fallback when the sandbox blocks esbuild's child process.
import { registerHooks } from 'node:module';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const root = new URL('../../', import.meta.url);
registerHooks({
  resolve(specifier, context, nextResolve) {
    const shims: Record<string, string> = { 'cloudflare:workers': './cf-workers.mjs', 'next/headers': './next-headers.mjs' };
    if (specifier in shims) return { url: new URL(shims[specifier], import.meta.url).href, shortCircuit: true };
    if (specifier.startsWith('@/') || specifier.startsWith('.')) {
      const url = specifier.startsWith('@/') ? new URL(specifier.slice(2), root) : new URL(specifier, context.parentURL);
      if (!/\.(?:ts|tsx|js|mjs|json)$/.test(url.pathname)) {
        const ts = new URL(`${url.href}.ts`);
        if (existsSync(fileURLToPath(ts))) return { url: ts.href, shortCircuit: true };
      }
    }
    return nextResolve(specifier, context);
  },
});
