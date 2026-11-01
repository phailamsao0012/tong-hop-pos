// So API trước/sau mỗi PR cải tổ (plan 31/10/2026, mục 4 "không đổi số"): đăng nhập web số ảo đang chạy trên máy,
// gọi các API báo cáo với cùng bộ lọc, lưu JSON đã bỏ trường thời gian; lần sau so lại phải trùng từng byte.
//
//   node scripts/dev/so-api.mjs goc   [--url http://localhost:8799]   → ghi bản gốc: JSON đầy đủ vào tests/snapshots/api/local/ (không commit,
//                                                                       vài MB) và tests/snapshots/api/tong.json (mã băm từng API, commit)
//   node scripts/dev/so-api.mjs so    [--url ...]                       → gọi lại, so với bản gốc, in chỗ lệch đầu tiên, exit 1 nếu lệch
//
// Web số ảo: build rồi `wrangler dev --local` với DEMO_MODE=1 (xem AGENTS.md). Tài khoản demo chu@demo.megatech.vn / demo@2026.
// Số ảo sinh theo ngày hôm nay nên "gốc" và "so" phải chạy trong cùng một ngày. Chỉ chạy trên máy với số ảo, không gọi web thật.
import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';

const [mode = 'so'] = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const arg = (name, def) => { const i = process.argv.indexOf(`--${name}`); return i > 0 && process.argv[i + 1] !== undefined ? process.argv[i + 1] : def; };
const URL_ = arg('url', 'http://localhost:8799').replace(/\/$/, '');
const DIR = join(import.meta.dirname, '..', '..', 'tests', 'snapshots', 'api');
const LOCAL = join(DIR, 'local');
const EMAIL = process.env.THP_DEMO_EMAIL ?? 'chu@demo.megatech.vn', MATKHAU = process.env.THP_DEMO_MATKHAU ?? 'demo@2026';

const today = new Date();
const d = (n) => new Date(today.getTime() - n * 86400000).toISOString().slice(0, 10);
const POS = 'sieu-vo-gao,mgt-apex,thuy-san,bio-nano,megaroot,oxytetra';
const V = { S: d(6), E: d(0), T: d(0), E29: d(29), M: d(0).slice(0, 7), P: encodeURIComponent(POS) };
const fill = (u) => u.replace(/\{(\w+)\}/g, (_, k) => V[k] ?? '');

// Tên file → URL. Cùng bộ lọc với scripts/pc/test-tai.mjs (ghi lại từ trình duyệt).
const APIS = {
  'pancake-ref': '/api/reports/pancake-ref?start={S}&end={E}&posIds={P}',
  'overview-all': '/api/reports/overview?posIds={P}&team=all&start={S}&end={E}&groupBy=day&compare=previous',
  'overview-sale': '/api/reports/overview?start={S}&end={E}&posIds={P}&team=sale&groupBy=day&compare=previous',
  'overview-cskh': '/api/reports/overview?start={S}&end={E}&posIds={P}&team=cskh&groupBy=day&compare=previous',
  'overview-30': '/api/reports/overview?posIds={P}&team=all&start={E29}&end={E}&groupBy=day&compare=previous',
  'sections': '/api/reports/sections?start={S}&end={E}&posIds={P}&productSegment=all',
  'trends': '/api/reports/trends?start={S}&end={E}&posIds={P}&productSegment=all',
  'shift-today': '/api/reports/shift?posIds={P}&team=all&date={T}&shift=auto',
  'shift-sale': '/api/reports/shift?posIds={P}&team=sale&date={T}&shift=auto',
  'pipeline': '/api/reports/pipeline?posIds={P}&team=all&start={S}&end={E}&basis=confirmed',
  'shipping-lines': '/api/reports/shipping-lines?start={S}&end={E}&posIds={P}&basis=confirmed&team=all&dim=line',
  'repurchase': '/api/reports/repurchase?posIds={P}&team=all&start={S}&end={E}',
  'targets': '/api/targets?month={M}',
  'product-groups-sale': '/api/reports/product-groups?start={S}&end={E}&posIds={P}&team=sale&dim=tag&basis=both&by=seller',
  'product-groups-cskh': '/api/reports/product-groups?start={S}&end={E}&posIds={P}&team=cskh&dim=tag&basis=both&by=care',
  'product-groups-all': '/api/reports/product-groups?start={S}&end={E}&posIds={P}&team=all&dim=tag&basis=both&by=seller',
  'delivered-products': '/api/reports/delivered-products?start={S}&end={E}&posIds={P}',
  'calls-cskh': '/api/reports/calls?start={S}&end={E}&posIds={P}&team=cskh',
  'calls-all': '/api/reports/calls?start={S}&end={E}&posIds={P}&team=all',
  'cskh-origin': '/api/reports/cskh-origin?start={S}&end={E}&posIds={P}&dim=main&basis=both',
  'cskh-badge': '/api/reports/cskh-badge',
  'van-don': '/api/reports/van-don?start={S}&end={E}&posIds={P}',
  'customers': '/api/reports/customers?posIds={P}&q=&page=1&size=50&sort=spend&sellerId=&team=all&group=all',
  'care': '/api/reports/care?posIds={P}&assigned=all&q=&minDays=0&sort=note_old&size=50&page=1&team=cskh',
  'employees-all': '/api/employees?team=all',
  'employees-cskh': '/api/employees?team=cskh',
  'employees-sale': '/api/employees?team=sale',
  'web-teams': '/api/web-teams',
  'sync-pos': '/api/sync/pos',
  'prefs-metrics': '/api/prefs/metrics',
  'me': '/api/auth/me',
  'users': '/api/users',
  'marketing-teams': '/api/marketing-teams',
  'growth': '/api/reports/growth?dept=sale&posIds={P}&start={S}&end={E}',
  'sale-analytics': '/api/reports/sale-analytics?start={S}&end={E}&posIds={P}',
  'cskh-analytics': '/api/reports/cskh-analytics?start={S}&end={E}&posIds={P}',
  'returns': '/api/reports/returns?start={S}&end={E}&posIds={P}',
  'exec': '/api/reports/exec?posIds={P}&start={S}&end={E}',
  'products': '/api/reports/products?start={S}&end={E}&posIds={P}',
  'sale-ladder': '/api/reports/sale-ladder?posIds={P}&start={S}&end={E}',
};

// Bỏ trường thời gian: mọi chuỗi ISO ngày-giờ và các khoá đo lúc chạy (requestId, tookMs, generatedAt...).
const VOLATILE_KEY = /^(requestId|took|tookMs|elapsed|elapsedMs|durationMs|generatedAt|fetchedAt|syncedAt|updatedAt|updated_at|lastSync|last_sync|now|serverTime|cachedAt|expires|expiresAt)$/;
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;
function scrub(v) {
  if (Array.isArray(v)) return v.map(scrub);
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).filter(([k]) => !VOLATILE_KEY.test(k)).map(([k, x]) => [k, scrub(x)]));
  if (typeof v === 'string' && ISO.test(v)) return '<thời gian>';
  return v;
}

async function login() {
  const r = await fetch(`${URL_}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: EMAIL, password: MATKHAU }) });
  const cookie = (r.headers.getSetCookie?.() ?? []).map((c) => c.split(';')[0]).join('; ');
  if (!r.ok || !cookie) throw new Error(`Đăng nhập thất bại: HTTP ${r.status} (web số ảo có chạy ở ${URL_}?)`);
  return cookie;
}

async function snapshot(cookie) {
  const out = {};
  for (const [name, tpl] of Object.entries(APIS)) {
    const url = fill(tpl);
    const r = await fetch(URL_ + url, { headers: { cookie } });
    const text = await r.text();
    let body; try { body = scrub(JSON.parse(text)); } catch { body = { '<không phải JSON>': text.slice(0, 200) }; }
    out[name] = { url: tpl, status: r.status, body };
  }
  return out;
}

const file = (name) => join(LOCAL, `${name}.json`);
const render = (x) => JSON.stringify(x, null, 1) + '\n';
const sha = (x) => createHash('sha256').update(render(x)).digest('hex').slice(0, 16);

/** Tìm đường dẫn đầu tiên khác nhau giữa hai JSON để in cho dễ nhìn. */
function firstDiff(a, b, path = '') {
  if (a === b) return null;
  if (typeof a !== typeof b || a === null || b === null || typeof a !== 'object') return `${path || '/'}: ${JSON.stringify(a)?.slice(0, 80)} → ${JSON.stringify(b)?.slice(0, 80)}`;
  const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])];
  for (const k of keys) { const r = firstDiff(a[k], b[k], `${path}/${k}`); if (r) return r; }
  return null;
}

const cookie = await login();
const now = await snapshot(cookie);
if (mode === 'goc') {
  mkdirSync(LOCAL, { recursive: true });
  for (const f of readdirSync(LOCAL)) if (f.endsWith('.json')) rmSync(join(LOCAL, f));
  const tong = {};
  for (const [name, x] of Object.entries(now)) { writeFileSync(file(name), render(x)); tong[name] = { url: x.url, status: x.status, sha256: sha(x), bytes: render(x).length }; }
  writeFileSync(join(DIR, 'tong.json'), render({ ngay: d(0), api: tong }));
  writeFileSync(join(DIR, 'GOC.md'), `# Bản gốc so API\n\nGhi ngày ${d(0)} bằng \`node scripts/dev/so-api.mjs goc\` trên web số ảo (${Object.keys(now).length} API). \`tong.json\` giữ mã băm từng API (commit); JSON đầy đủ nằm ở \`local/\` (không commit, để in chỗ lệch). Số ảo sinh theo ngày nên chỉ so trong cùng ngày: sang ngày khác thì ghi lại gốc trên nhánh \`main\` trước rồi mới so nhánh đang làm.\n`);
  const loi = Object.entries(now).filter(([, x]) => x.status !== 200).map(([n, x]) => `${n} HTTP ${x.status}`);
  console.log(`Đã ghi ${Object.keys(now).length} API: mã băm vào ${join(DIR, 'tong.json')}, JSON đầy đủ vào ${LOCAL}${loi.length ? `\nKhông phải 200: ${loi.join(', ')}` : ''}`);
} else {
  let tong; try { tong = JSON.parse(readFileSync(join(DIR, 'tong.json'), 'utf8')); } catch { console.error('Chưa có tests/snapshots/api/tong.json: chạy `goc` trước.'); process.exit(2); }
  if (tong.ngay !== d(0)) console.log(`! Bản gốc ghi ngày ${tong.ngay}, hôm nay ${d(0)}: số ảo đã trượt ngày, chênh lệch có thể không phải do code. Ghi lại gốc trên main rồi so lại.`);
  let lech = 0;
  for (const [name, x] of Object.entries(now)) {
    const g = tong.api[name];
    if (!g) { console.log(`? ${name}: chưa có trong bản gốc`); lech++; continue; }
    if (g.sha256 === sha(x)) { console.log(`✓ ${name}`); continue; }
    lech++;
    let goc = null; try { goc = JSON.parse(readFileSync(file(name), 'utf8')); } catch { /* không có JSON đầy đủ trên máy này */ }
    console.log(`✗ ${name}: ${goc ? firstDiff(goc, x) : `mã băm khác (${g.sha256} → ${sha(x)}), không có JSON gốc trên máy để chỉ chỗ`}`);
  }
  console.log(lech ? `\n${lech} API lệch so với bản gốc.` : `\nTrùng từng byte: ${Object.keys(now).length} API.`);
  process.exit(lech ? 1 : 0);
}
