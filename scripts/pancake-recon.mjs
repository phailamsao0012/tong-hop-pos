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
  for (const m of src.matchAll(/"(static\/chunks\/[\w\-./]+\.js)"/g)) add(m[1]);
  let dyn = 0;
  for (const obj of src.matchAll(/\{(\d+:"[0-9a-f]{16}"(?:,\d+:"[0-9a-f]{16}")+)\}/g))
    for (const p of obj[1].matchAll(/(\d+):"([0-9a-f]{16})"/g)) { add(`static/chunks/${p[1]}-${p[2]}.js`); dyn++; }
  console.log('DYNAMIC-CHUNKS', dyn);
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
const MARKS = [
  ['automatic-order-', /sendToBackEnd=/g, 2600], ['automatic-order-', /"\/settings"/g, 1800], ['automatic-order-', /getAssignedUserContent=/g, 2200],
  ['automatic-order-', /assign_online_user/g, 900], ['automatic-order-', /is_assigned/g, 700], ['automatic-order-', /onChangeAssignedDepartment=/g, 1500],
  ['automatic-order-', /handleChangeSwitch=/g, 1500], ['automatic-order-', /assigned_user/g, 600],
  ['', /update_active/g, 900], ['', /"\/v1\/shops\/"/g, 900], ['', /access_token/g, 300], ['', /\/update_assigned/g, 900],
  ['setting/employee-', /concat\([^)]{0,80}"\/users/g, 900], ['setting/employee-', /work_time/g, 900], ['setting/department-', /work_time/g, 900],
  ['', /assign_online_user/g, 700], ['', /assignOnlineUser/g, 400],
];
for (const [scope, re, w] of MARKS) {
  let shown = 0;
  for (const [u, t] of files) {
    if (!t || (scope && !u.includes(scope))) continue;
    for (const m of t.matchAll(re)) {
      if (shown >= (scope ? 4 : 3)) break;
      shown++;
      console.log(`### ${re.source} in ${short(u)} @${m.index}`);
      console.log(t.slice(Math.max(0, m.index - Math.floor(w / 3)), m.index + w).replace(/\s+/g, ' '));
    }
  }
}
