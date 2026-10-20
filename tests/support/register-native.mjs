// Chạy test trong Windows sandbox không cho esbuild tạo tiến trình:
// node --import ./tests/support/register-native.mjs --test --experimental-test-isolation=none tests/ai-ask.test.ts
import { registerHooks } from 'node:module';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
const root = new URL('../../', import.meta.url);
const shims = { 'cloudflare:workers': './cf-workers.mjs', 'next/headers': './next-headers.mjs' };
registerHooks({
  resolve(specifier, context, next) {
    if (Object.hasOwn(shims, specifier)) return { url: new URL(shims[specifier], import.meta.url).href, shortCircuit: true };
    if (specifier.startsWith('@/') || specifier.startsWith('.')) {
      const url = specifier.startsWith('@/') ? new URL(specifier.slice(2), root) : new URL(specifier, context.parentURL);
      for (const suffix of ['', '.ts', '.tsx', '.js', '/index.ts']) {
        const candidate = new URL(url.href + suffix);
        if (existsSync(candidate) && /\.(?:ts|tsx|js|mjs)$/.test(candidate.pathname)) return { url: candidate.href, shortCircuit: true };
      }
    }
    return next(specifier, context);
  },
  load(url, context, next) {
    if (/\.(?:ts|tsx)$/.test(url) && url.startsWith(root.href)) {
      const source = ts.transpileModule(readFileSync(new URL(url), 'utf8'), { fileName: fileURLToPath(url), compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, jsx: ts.JsxEmit.ReactJSX } }).outputText;
      return { format: 'module', source, shortCircuit: true };
    }
    return next(url, context);
  },
});
