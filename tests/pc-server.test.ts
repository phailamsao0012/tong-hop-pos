// Máy chủ Node cho PC (pc/, plan 2026-11-01-chay-web-pc-node, N2–N3): đọc .dev.vars, _headers, tệp tĩnh không thoát
// thư mục, cache theo max-age, Durable Object lưu trạng thái và chạy alarm như Cloudflare.
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { MemoryCache } from '../pc/cache';
import { durableNamespace } from '../pc/durable';
import { parseHeadersFile, parseVars, staticFile } from '../pc/http';

const dir = mkdtempSync(join(tmpdir(), 'pc-server-'));
process.on('exit', () => rmSync(dir, { recursive: true, force: true }));

void test('.dev.vars: KHOÁ=giá trị, bỏ chú thích, bỏ ngoặc kép', () => {
  assert.deepEqual(parseVars('# chú thích\nA=1\n B = "x y" \nC=\'z\'\nsai dòng\nD=a=b\r\n'), { A: '1', B: 'x y', C: 'z', D: 'a=b' });
});

void test('_headers kiểu Cloudflare: đường dẫn có * và đường dẫn đúng', () => {
  const rules = parseHeadersFile('# vinext\n/_next/static/*\n  Cache-Control: public, max-age=31536000, immutable\n/logo.svg\n  X-A: 1\n');
  assert.deepEqual(rules('/_next/static/a.js'), [['Cache-Control', 'public, max-age=31536000, immutable']]);
  assert.deepEqual(rules('/logo.svg'), [['X-A', '1']]);
  assert.deepEqual(rules('/logo.svg.map'), []);
});

void test('tệp tĩnh: có tệp thì trả, thư mục hay đường dẫn thoát ra ngoài thì không', () => {
  const root = join(dir, 'client');
  mkdirSync(join(root, '_next'), { recursive: true });
  writeFileSync(join(root, 'favicon.svg'), '<svg/>');
  writeFileSync(join(root, '_headers'), '');
  writeFileSync(join(dir, 'bi-mat.txt'), 'x');
  assert.equal(staticFile(root, '/favicon.svg'), join(root, 'favicon.svg'));
  assert.equal(staticFile(root, '/_next'), null);
  assert.equal(staticFile(root, '/_headers'), null);
  assert.equal(staticFile(root, '/../bi-mat.txt'), null);
  assert.equal(staticFile(root, '/%2e%2e/bi-mat.txt'), null);
  assert.equal(staticFile(root, '/%E0%A4%A'), null);
  assert.equal(staticFile(root, '/api/reports/trends'), null);
});

void test('cache: giữ theo max-age, không giữ khi không có max-age, bỏ mục cũ khi đầy', async () => {
  const c = new MemoryCache(1000);
  await c.put('https://x/a', new Response('aaa', { headers: { 'cache-control': 'max-age=60', 'x-thp-meta': 'm' } }));
  await c.put('https://x/b', new Response('bbb'));
  const hit = await c.match('https://x/a');
  assert.equal(await hit?.text(), 'aaa');
  assert.equal(hit?.headers.get('x-thp-meta'), 'm');
  assert.equal(await c.match('https://x/b'), undefined);
  await c.put('https://x/z', new Response('z', { headers: { 'cache-control': 'max-age=0' } }));
  assert.equal(await c.match('https://x/z'), undefined);
  for (let i = 0; i < 5; i++) await c.put(`https://x/big${i}`, new Response('x'.repeat(240), { headers: { 'cache-control': 'max-age=60' } }));
  assert.equal(await c.match('https://x/a'), undefined, 'mục cũ nhất bị bỏ khi quá dung lượng');
  assert.ok(await c.match('https://x/big4'));
  assert.equal(await c.delete('https://x/big4'), true);
  assert.equal(await c.match('https://x/big4'), undefined);
});

void test('Durable Object: storage lưu qua lần mở lại; alarm chạy, tự đặt lần sau, lỗi thì thử lại', async () => {
  const file = join(dir, 'do.sqlite');
  const runs: number[] = [];
  let fail = 1;
  class Sched {
    constructor(public ctx: { storage: { get(k: string): Promise<unknown>; put(k: string, v: unknown): Promise<void>; setAlarm(t: number): Promise<void>; getAlarm(): Promise<number | null> } }) {}
    async alarm() {
      runs.push(Date.now());
      if (fail-- > 0) throw new Error('lỗi thử');
      if (runs.length < 3) await this.ctx.storage.setAlarm(Date.now() + 20);
    }
  }
  const ns = durableNamespace(file, 'Sched', Sched as never, {});
  const obj = ns.get(ns.idFromName('main')) as unknown as Sched;
  assert.equal(ns.get(ns.idFromName('main')), obj, 'cùng tên là cùng một bản');
  await obj.ctx.storage.put('state', { a: 1, d: new Date(0), m: new Map([['k', 2]]) });
  assert.equal(await obj.ctx.storage.getAlarm(), null);
  await obj.ctx.storage.setAlarm(Date.now() + 10);
  // lần 1 lỗi → thử lại sau 2 giây; lần 2 tự đặt alarm 20 ms; lần 3 dừng.
  const until = Date.now() + 6000;
  while (runs.length < 3 && Date.now() < until) await new Promise((r) => setTimeout(r, 50));
  assert.equal(runs.length, 3);
  assert.ok(runs[1] - runs[0] >= 1900, 'thử lại sau khoảng 2 giây');
  assert.equal(await obj.ctx.storage.getAlarm(), null);
  ns.close();
  const again = durableNamespace(file, 'Sched', Sched as never, {});
  const o2 = again.get(again.idFromName('main')) as unknown as Sched;
  assert.deepEqual(await o2.ctx.storage.get('state'), { a: 1, d: new Date(0), m: new Map([['k', 2]]) });
  again.close();
});
