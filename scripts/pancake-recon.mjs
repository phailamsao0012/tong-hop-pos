// Khảo sát (chỉ đọc) mã giao diện công khai của pos.pancake.vn (Next.js) để tìm lệnh API mà trang
// Cấu hình > Đơn hàng tự động > Phân công xử lý đơn dùng khi đọc/lưu. Không đăng nhập, không gọi API ghi.
import vm from 'node:vm';
const ORIGIN = 'https://pos.pancake.vn';
const UA = { 'User-Agent': 'Mozilla/5.0 (Macintosh) Chrome/129' };
const get = async (u) => { const r = await fetch(u, { headers: UA }); return { status: r.status, text: await r.text() }; };

const html = (await get(`${ORIGIN}/shop/1/setting/automatic-order`)).text;
const buildId = html.match(/"buildId":"([^"]+)"/)?.[1] ?? html.match(/\/_next\/static\/([^/]+)\/_buildManifest\.js/)?.[1];
console.log('BUILD', buildId);
const scripts = [...html.matchAll(/src="(\/_next\/static\/[^"]+\.js)"/g)].map((m) => m[1]);
const manifestUrl = scripts.find((s) => s.includes('_buildManifest')) ?? `/_next/static/${buildId}/_buildManifest.js`;
const manifestSrc = (await get(ORIGIN + manifestUrl)).text;
const sandbox = { self: {} }; vm.runInNewContext(manifestSrc, sandbox);
const BM = sandbox.self.__BUILD_MANIFEST;
const routes = Object.keys(BM).filter((k) => k.startsWith('/'));
console.log('ROUTES', routes.length);
const wanted = routes.filter((r) => /^\/shop\/setting|^\/shop\/order|^\/_app/.test(r));
const files = new Map();
const add = (p) => { const url = p.startsWith('http') ? p : `${ORIGIN}/_next/${p.replace(/^\/?_next\//, '').replace(/^\//, '')}`; if (!files.has(url)) files.set(url, null); };
for (const r of [...wanted, '/_app']) for (const p of BM[r] ?? []) if (p.endsWith('.js')) add(p);
for (const s of scripts) add(s.replace(/^\/_next\//, ''));

// webpack runtime: chunk id -> file (dynamic import chunks)
const wp = scripts.find((s) => /webpack-/.test(s));
if (wp) {
  const src = (await get(ORIGIN + wp)).text;
  const m = src.match(/"static\/chunks\/"\s*\+\s*\(?\s*(\{[^}]*\})?[^+]*\+\s*"\."\s*\+\s*(\{[^}]*\})\s*\[\w+\]\s*\+\s*"\.js"/);
  if (m) {
    const names = m[1] ? Function(`return ${m[1]}`)() : {};
    const hashes = Function(`return ${m[2]}`)();
    for (const [id, h] of Object.entries(hashes)) add(`static/chunks/${names[id] ?? id}.${h}.js`);
    console.log('DYNAMIC-CHUNKS', Object.keys(hashes).length);
  } else console.log('WEBPACK-RUNTIME-NOT-PARSED', src.slice(0, 1500));
}
console.log('FILES-TO-FETCH', files.size);
const urls = [...files.keys()];
let i = 0;
await Promise.all(Array.from({ length: 16 }, async () => {
  while (i < urls.length) { const u = urls[i++]; try { const r = await get(u); files.set(u, r.status === 200 ? r.text : ''); } catch { files.set(u, ''); } }
}));
let bytes = 0; for (const t of files.values()) bytes += t?.length ?? 0;
console.log('FETCHED', [...files.values()].filter(Boolean).length, 'BYTES', bytes);

const short = (u) => u.split('/').slice(-2).join('/');
// 1) Toàn bộ chuỗi trong chunk trang automatic-order
const page = urls.find((u) => /pages\/shop\/setting\/automatic-order-/.test(u));
const strLits = (t) => [...new Set([...t.matchAll(/"((?:[^"\\]|\\.){2,200})"|'((?:[^'\\]|\\.){2,200})'|`((?:[^`\\]|\\.){2,200})`/g)].map((m) => m[1] ?? m[2] ?? m[3]))];
if (page) {
  const t = files.get(page);
  console.log('=== PAGE CHUNK', short(page), t.length);
  const lits = strLits(t).filter((s) => /\/|assign|setting|auto|sale|care|staff|user|department|work|time|tag|source|page|marketer|round|limit|order/i.test(s) && !/^[\s\S]*<|^\.\/|^#/.test(s));
  for (const s of lits) console.log('  LIT', s);
}
// 2) Mọi mẫu đường dẫn API có chữ setting / assign / automatic trong tất cả file
const API_RE = /["'`]((?:\/api)?\/?(?:v1\/)?shops\/[^"'`]{0,120})["'`]|["'`](\/[\w-]*(?:setting|assign|automatic|auto_)[\w\-/]{0,80})["'`]|concat\(([^)]{0,160}(?:setting|assign|automatic)[^)]{0,80})\)/gi;
const apis = new Map();
for (const [u, t] of files) {
  if (!t) continue;
  for (const m of t.matchAll(API_RE)) {
    const s = (m[1] ?? m[2] ?? m[3]).slice(0, 220);
    if (!apis.has(s)) apis.set(s, short(u));
  }
}
console.log('=== API-LIKE', apis.size);
for (const [s, f] of [...apis].sort()) console.log('  ', s, '  <', f);
// 3) Ngữ cảnh quanh các từ khóa phân công
const KW = /auto_?assign|assign_?config|order_?assign|assign_by|assigning_?(?:seller|care)s|assign_?users|assign_?depart|out_?(?:of_?)?working|working_?(?:time|hour)|round_?robin|max_?pending|reassign|re_assign|setting_?auto|auto_?order_?setting/gi;
const ctx = new Map();
for (const [u, t] of files) {
  if (!t) continue;
  for (const m of t.matchAll(KW)) {
    const c = t.slice(Math.max(0, m.index - 220), m.index + 220).replace(/\s+/g, ' ');
    const k = m[0].toLowerCase() + '|' + c.slice(150, 290);
    if (!ctx.has(k)) ctx.set(k, `[${m[0]}] ${short(u)} @${m.index}\n    ${c}`);
  }
}
console.log('=== KEYWORD-CONTEXTS', ctx.size);
let n = 0; for (const v of ctx.values()) { if (n++ >= 250) { console.log('... truncated'); break; } console.log(v); }
