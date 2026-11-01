// Chạy trong tiến trình con (tests/pc-d1.test.ts): gọi các API trong scripts/dev/so-api.mjs trên một file SQLite,
// bằng D1 giả của test (fake) hoặc bằng D1 của PC (pc/d1.ts), in JSON kết quả. Tiến trình riêng để cache trong module không lẫn hai lượt.
import { readFileSync } from 'node:fs';
import { mock } from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { env } from 'cloudflare:workers';
import { d1 } from './d1-sqlite';
import { openD1 } from '../../pc/d1';

const [file, mode, token, nowIso, varsJson] = process.argv.slice(2);
mock.timers.enable({ apis: ['Date'], now: Date.parse(nowIso) });
const vars = JSON.parse(varsJson) as Record<string, string>;
const fill = (u: string) => u.replace(/\{(\w+)\}/g, (_, k: string) => vars[k] ?? '');
const src = readFileSync(new URL('../../scripts/dev/so-api.mjs', import.meta.url), 'utf8');
const apis = [...src.matchAll(/^\s*'([\w-]+)': '(\/api[^']+)'/gm)].map((m) => ({ name: m[1], url: fill(m[2]) }));

const pc = mode === 'pc' ? await openD1(file, { readers: 3 }) : null;
Object.assign(env as object, { DB: pc ?? d1(new DatabaseSync(file)) });
(globalThis as { __testCookie?: string }).__testCookie = `thp_session=${token}`;
const out: Record<string, { status: number; body: string }> = {};
for (const a of apis) {
  const path = a.url.split('?')[0];
  try {
    const mod = (await import(`../../app${path}/route.ts`)) as { GET?: (r: Request) => Promise<Response> };
    if (!mod.GET) continue;
    const r = await mod.GET(new Request(`https://test.invalid${a.url}`));
    out[a.name] = { status: r.status, body: await r.text() };
  } catch (e) {
    out[a.name] = { status: -1, body: String(e) };
  }
}
const stats = pc?.stats();
await pc?.close();
process.stdout.write(JSON.stringify({ out, stats }));
