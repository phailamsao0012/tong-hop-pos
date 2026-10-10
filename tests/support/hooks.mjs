const SHIMS = { 'cloudflare:workers': './cf-workers.mjs', 'next/headers': './next-headers.mjs' };
export async function resolve(specifier, context, next) {
  if (specifier in SHIMS) return { url: new URL(SHIMS[specifier], import.meta.url).href, shortCircuit: true };
  return next(specifier, context);
}
