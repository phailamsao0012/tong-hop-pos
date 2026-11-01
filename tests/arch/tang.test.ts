// Test kiến trúc (plan cải tổ 31/10/2026, mục 4): code mới không được lẫn tầng. Chỗ cũ còn lẫn ghi ở cho-phep-tam.json,
// dọn bước nào rút bước đó; có vi phạm mới ngoài danh sách thì fail, dòng trong danh sách đã sạch cũng fail (danh sách không thừa).
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { test } from 'node:test';

const ROOT = join(import.meta.dirname, '..', '..');
const allow = JSON.parse(readFileSync(join(ROOT, 'tests/arch/cho-phep-tam.json'), 'utf8')) as { route_co_sql: string[]; app_goi_fetch_thang: string[] };

function* walk(dir: string): Generator<string> {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) { if (name !== 'node_modules') yield* walk(p); }
    else if (/\.(ts|tsx)$/.test(name) && !name.endsWith('.d.ts')) yield p;
  }
}
const rel = (p: string) => relative(ROOT, p).replaceAll('\\', '/');
const files = (dir: string, pick: (p: string) => boolean = () => true) => [...walk(join(ROOT, dir))].filter(pick).map((p) => ({ path: rel(p), text: readFileSync(p, 'utf8') }));

/** So vi phạm thật với danh sách tạm: mới → fail; đã sạch mà còn trong danh sách → fail. */
function check(name: string, found: string[], allowed: string[]) {
  const moi = found.filter((f) => !allowed.includes(f));
  const thua = allowed.filter((a) => !found.includes(a));
  assert.deepEqual(moi, [], `${name}: vi phạm MỚI ngoài tests/arch/cho-phep-tam.json (sửa code, không thêm vào danh sách):\n  ${moi.join('\n  ')}`);
  assert.deepEqual(thua, [], `${name}: các dòng này đã sạch, rút khỏi tests/arch/cho-phep-tam.json:\n  ${thua.join('\n  ')}`);
}

void test('luật 1: lib/** không import React, không import app/', () => {
  const bad = files('lib').filter((f) => /from\s+['"](react|react-dom|react\/|@\/app|\.\.?\/(\.\.\/)*app\/)/.test(f.text)).map((f) => f.path);
  assert.deepEqual(bad, [], `lib/ nhập React hoặc app/: ${bad.join(', ')}`);
});

void test('luật 2: app/api/**/route.ts không có câu SQL (db.prepare, SELECT, INSERT, UPDATE, DELETE)', () => {
  const SQL = /\.prepare\(|\bSELECT\b|\bINSERT INTO\b|\bUPDATE \w+ SET\b|\bDELETE FROM\b/;
  const found = files('app/api', (p) => p.endsWith('route.ts')).filter((f) => SQL.test(f.text)).map((f) => f.path).sort();
  check('route có SQL', found, allow.route_co_sql);
});

void test('luật 3: trang (app/, components/, hooks/) không fetch("/api") thẳng, đi qua app/api-fetch.ts', () => {
  const RAW = /fetch\(\s*['"`]\/api/;
  const found = ['app', 'components', 'hooks']
    .flatMap((d) => files(d, (p) => !rel(p).startsWith('app/api/') && rel(p) !== 'app/api-fetch.ts'))
    .filter((f) => RAW.test(f.text)).map((f) => f.path).sort();
  check('trang gọi fetch thẳng', found, allow.app_goi_fetch_thang);
});

void test('danh sách tạm chỉ được bớt, không được thêm (so với lúc lập 31/10/2026)', () => {
  assert.ok(allow.route_co_sql.length <= 70, `route có SQL: ${allow.route_co_sql.length} > 70`);
  assert.ok(allow.app_goi_fetch_thang.length <= 43, `trang gọi fetch thẳng: ${allow.app_goi_fetch_thang.length} > 43`);
});
