// Khảo sát (chỉ đọc) mã giao diện công khai của pos.pancake.vn để tìm lệnh API mà trang
// Cấu hình > Đơn hàng tự động > Phân công xử lý đơn dùng khi lưu. Không đăng nhập, không gọi API ghi.
const ORIGIN = 'https://pos.pancake.vn';
const START = [`${ORIGIN}/`, `${ORIGIN}/shop/1/setting/automatic-order`];
const MAX_FILES = 600;
const seen = new Set();
const files = new Map();
const queue = [];
const push = (u) => { try { const url = new URL(u, ORIGIN).toString(); if (!seen.has(url) && /\.(m?js)(\?|$)/.test(url) && /pancake|pages\.fm|^https:\/\/pos\./.test(url)) { seen.add(url); queue.push(url); } } catch {} };

async function get(url) {
  const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh) Chrome/129' } });
  return { status: r.status, text: await r.text() };
}

for (const u of START) {
  const { status, text } = await get(u);
  console.log('PAGE', status, u, text.length);
  for (const m of text.matchAll(/<script[^>]+src=["']([^"']+)["']/g)) push(m[1]);
  for (const m of text.matchAll(/<link[^>]+href=["']([^"']+\.m?js)["']/g)) push(m[1]);
  if (u.endsWith('/')) console.log('HTML-HEAD', text.slice(0, 3000).replace(/\s+/g, ' '));
}

while (queue.length && files.size < MAX_FILES) {
  const url = queue.shift();
  let res;
  try { res = await get(url); } catch (e) { console.log('ERR', url, String(e)); continue; }
  if (res.status !== 200) { console.log('HTTP', res.status, url); continue; }
  files.set(url, res.text);
  const base = url.slice(0, url.lastIndexOf('/') + 1);
  const t = res.text;
  // import("./x.js"), "static/js/123.abc.chunk.js", "assets/x-abc.js"
  for (const m of t.matchAll(/["'`]((?:\.{1,2}\/|\/)?[\w\-./]*?[\w\-]+\.[0-9a-f]{6,}[\w.\-]*\.m?js)["'`]/g)) push(new URL(m[1], base).toString());
  for (const m of t.matchAll(/["'`](\.\/[\w\-./]+\.m?js)["'`]/g)) push(new URL(m[1], base).toString());
  // webpack: {12:"abc123",...}[e]+".chunk.js"  → ghép số chunk với hash
  for (const m of t.matchAll(/"([\w/.-]*?)"\s*\+\s*(?:\(\{[^}]*\}\[\w+\]\|\|\w+\)|\w+)\s*\+\s*"\."\s*\+\s*\{([^}]{20,})\}\[\w+\]\s*\+\s*"([\w.]*\.js)"/g)) {
    const prefix = m[1], suffix = m[3];
    for (const p of m[2].matchAll(/["']?([\w-]+)["']?\s*:\s*"([0-9a-f]{4,})"/g)) push(new URL(`${prefix}${p[1]}.${p[2]}${suffix}`, ORIGIN + '/').toString());
  }
}
console.log('FILES', files.size, 'QUEUE-LEFT', queue.length);
let total = 0; for (const t of files.values()) total += t.length; console.log('BYTES', total);

const PATTERNS = [
  /automatic[-_ ]?order/gi, /auto_?assign/gi, /assign_?config/gi, /order_?assign/gi, /assigning_?(?:seller|care)_?(?:ids|list|users)/gi,
  /assign_by_(?:tag|source|department)/gi, /out_?of_?(?:work|working)_?(?:hours|time)/gi, /working_?hours?/gi, /round_?robin/gi,
  /setting_auto/gi, /auto_?distribut/gi, /(?:users|employees)_?assign/gi, /phân công/gi,
];
const API = /["'`](\/shops\/[^"'`\s]{0,80})["'`]|["'`](https?:\/\/[\w.-]*(?:pages\.fm|pancake\.vn)[^"'`\s]{0,80})["'`]/g;
const out = new Map();
for (const [url, t] of files) {
  for (const re of PATTERNS) {
    for (const m of t.matchAll(re)) {
      const ctx = t.slice(Math.max(0, m.index - 260), m.index + 260).replace(/\s+/g, ' ');
      const key = `${re.source}|${ctx.slice(200, 320)}`;
      if (!out.has(key)) out.set(key, `[${re.source}] ${url.split('/').pop()} @${m.index}\n  ${ctx}`);
    }
  }
}
console.log('MATCHES', out.size);
let printed = 0;
for (const v of out.values()) { if (printed++ > 400) break; console.log(v); }
const apis = new Set();
for (const t of files.values()) for (const m of t.matchAll(API)) apis.add(m[1] ?? m[2]);
console.log('API-STRINGS', apis.size);
for (const a of [...apis].sort()) console.log('  ', a);
