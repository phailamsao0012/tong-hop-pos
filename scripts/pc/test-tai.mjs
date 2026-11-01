// Thử tải web tổng trên PC (anh Vũ 31/10/2026: "test thử trên pc xem chịu tải được như thế nào").
// Mô hình MỞ: request đến theo nhịp cố định từng nấc, không chờ nhau (tránh coordinated omission làm số đẹp giả).
// Chỉ GET các API báo cáo người dùng thật hay mở; không gọi API ghi, đồng bộ, Pancake, sao lưu. Node 22, không cài thêm gói.
//
//   node scripts/pc/test-tai.mjs [--url http://localhost:8787] [--nac 1,2,5,10,20,40] [--giay 60] [--p95 2000] [--loi 5]
//                                [--pos a,b,c] [--log C:\thp\log\test-tai-<ngày>.json] [--nghi 24]
//   Tài khoản đọc từ biến môi trường THP_TEST_EMAIL và THP_TEST_MATKHAU (không ghi vào file nào); không đặt thì
//   kịch bản tự tạo tài khoản tạm trong D1 trên máy (--data C:\thp\data, --bi-mat C:\thp\bi-mat\.dev.vars) và xoá khi xong.
//
// Mỗi nấc chạy --giay giây rồi tính p50/p95/p99, tỉ lệ lỗi, timeout; p95 vượt --p95 ms hoặc lỗi vượt --loi % thì coi là gãy và dừng.
// Số người dùng cùng lúc tương đương ≈ nhịp (request/giây) × thời gian nghỉ giữa hai lần bấm (--nghi, mặc định 24 giây) / số API mỗi trang.
// Log chỉ ghi thời gian và mã trạng thái, không ghi nội dung trả về (repo công khai).
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import os from 'node:os';

const arg = (name, def) => { const i = process.argv.indexOf(`--${name}`); return i > 0 && process.argv[i + 1] !== undefined ? process.argv[i + 1] : def; };
const URL_ = arg('url', 'http://localhost:8787').replace(/\/$/, '');
const NAC = arg('nac', '1,2,5,10,20,40').split(',').map(Number).filter((n) => n > 0);
const GIAY = Number(arg('giay', 60));
const P95_MAX = Number(arg('p95', 2000));
const LOI_MAX = Number(arg('loi', 5));
const NGHI = Number(arg('nghi', 24));
const TIMEOUT = Number(arg('timeout', 10000));
const POS = arg('pos', 'sieu-vo-gao,mgt-apex,thuy-san,bio-nano,megaroot,oxytetra');
const today = new Date();
const stamp = today.toISOString().slice(0, 10);
const LOG = arg('log', process.platform === 'win32' ? `C:\\thp\\log\\test-tai-${stamp}.json` : `./test-tai-${stamp}.json`);
let EMAIL = process.env.THP_TEST_EMAIL, MATKHAU = process.env.THP_TEST_MATKHAU;
// Không có tài khoản thử thì tự tạo một tài khoản tạm (chủ hệ thống) thẳng vào D1 trên máy, băm mật khẩu y như lib/auth.ts
// (HMAC AUTH_SECRET rồi PBKDF2 30.000 vòng), chạy xong xoá tài khoản và phiên của nó. Chỉ dùng cho bản web chạy trên máy này.
const DATA = arg('data', 'C:\\thp\\data'), BI_MAT = arg('bi-mat', 'C:\\thp\\bi-mat\\.dev.vars');
let taiKhoanTam = null;
async function taoTaiKhoanTam() {
  const { DatabaseSync } = await import('node:sqlite');
  const { readFileSync, readdirSync } = await import('node:fs');
  const secret = (readFileSync(BI_MAT, 'utf8').match(/^AUTH_SECRET\s*=\s*"?([^"\r\n]+)"?/m) ?? [])[1]?.trim();
  if (!secret) throw new Error(`Không thấy AUTH_SECRET trong ${BI_MAT}`);
  const dir = `${DATA}/v3/d1/miniflare-D1DatabaseObject`;
  const files = readdirSync(dir).filter((f) => f.endsWith('.sqlite') && f !== 'metadata.sqlite');
  if (files.length !== 1) throw new Error(`Cần đúng một file D1 trong ${dir}, thấy ${files.length}`);
  const db = new DatabaseSync(`${dir}/${files[0]}`);
  db.exec('PRAGMA busy_timeout=5000');
  const enc = new TextEncoder(), b64 = (b) => Buffer.from(b).toString('base64');
  const rand = (n) => b64(crypto.getRandomValues(new Uint8Array(n))).replace(/[+/=]/g, '').slice(0, n);
  const email = `thu-tai-${rand(8).toLowerCase()}@test.local`, matKhau = rand(24), id = crypto.randomUUID();
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const pepper = await crypto.subtle.sign('HMAC', key, enc.encode(matKhau));
  const material = await crypto.subtle.importKey('raw', pepper, 'PBKDF2', false, ['deriveBits']);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: 30000 }, material, 256);
  const hash = `pbkdf2$30000$${b64(salt)}$${b64(bits)}`;
  const now = new Date().toISOString();
  db.prepare('INSERT INTO users (id,email,name,password_hash,role,disabled,created_at,updated_at) VALUES (?,?,?,?,?,0,?,?)').run(id, email, 'Thử tải (tạm)', hash, 'owner', now, now);
  taiKhoanTam = { db, id, email };
  EMAIL = email; MATKHAU = matKhau;
  console.log(`Tạo tài khoản tạm ${email} (chủ hệ thống), xoá khi chạy xong.`);
}
function xoaTaiKhoanTam() {
  if (!taiKhoanTam) return;
  const { db, id, email } = taiKhoanTam; taiKhoanTam = null;
  try {
    db.prepare('DELETE FROM sessions WHERE user_id=?').run(id);
    db.prepare('DELETE FROM users WHERE id=?').run(id);
    db.close();
    console.log(`Đã xoá tài khoản tạm ${email}.`);
  } catch (e) { console.error(`Không xoá được tài khoản tạm ${email}: ${e?.message ?? e}. Xoá tay trong Cài đặt › Tài khoản.`); }
}
if (!EMAIL || !MATKHAU) {
  try { await taoTaiKhoanTam(); }
  catch (e) { console.error(`Thiếu THP_TEST_EMAIL / THP_TEST_MATKHAU và không tạo được tài khoản tạm: ${e?.message ?? e}`); process.exit(2); }
}
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { xoaTaiKhoanTam(); process.exit(130); });
process.on('exit', xoaTaiKhoanTam);

// Ngày: kỳ đang xem = 7 ngày gần nhất, {T} hôm nay, {E29} 29 ngày trước, {M} tháng này.
const d = (n) => new Date(today.getTime() - n * 86400000).toISOString().slice(0, 10);
const VARS = { S: d(6), E: d(0), T: d(0), E29: d(29), M: d(0).slice(0, 7), P: encodeURIComponent(POS) };
const fill = (u) => u.replace(/\{(\w+)\}/g, (_, k) => VARS[k] ?? '');

// Trang và API từng trang (chép từ loadtest/k6-web.js, ghi lại từ trình duyệt). Chỉ GET, chỉ báo cáo.
const VIEWS = {
  center: ['/api/reports/pancake-ref?start={S}&end={E}&posIds={P}', '/api/reports/overview?posIds={P}&team=all&start={S}&end={E}&groupBy=day&compare=previous', '/api/reports/shift?posIds={P}&team=all&date={T}&shift=auto', '/api/reports/pipeline?posIds={P}&team=all&start={S}&end={E}&basis=confirmed', '/api/reports/repurchase?posIds={P}&team=all&start={S}&end={E}', '/api/targets?month={M}'],
  overview: ['/api/reports/sections?start={S}&end={E}&posIds={P}&productSegment=all', '/api/reports/overview?start={S}&end={E}&posIds={P}&groupBy=day&compare=previous&team=all&productSegment=all&orderOrigin=all&marketerId=', '/api/reports/trends?start={S}&end={E}&posIds={P}&productSegment=all', '/api/reports/pancake-ref?start={S}&end={E}&posIds={P}'],
  shift: ['/api/reports/shift?date={T}&shift=auto&posIds={P}&team=all'],
  'sale-overview': ['/api/reports/overview?start={S}&end={E}&posIds={P}&team=sale&groupBy=day&compare=previous', '/api/reports/product-groups?start={S}&end={E}&posIds={P}&team=sale&dim=tag&basis=both&by=seller', '/api/reports/pancake-ref?start={S}&end={E}&posIds={P}'],
  'cskh-overview': ['/api/employees?team=cskh', '/api/targets?month={M}', '/api/reports/overview?start={S}&end={E}&posIds={P}&team=cskh&groupBy=day&compare=previous', '/api/reports/product-groups?start={S}&end={E}&posIds={P}&team=cskh&dim=tag&basis=both&by=care', '/api/reports/calls?start={S}&end={E}&posIds={P}&team=cskh', '/api/reports/cskh-origin?start={S}&end={E}&posIds={P}&dim=main&basis=both'],
  compare: ['/api/reports/overview?start={S}&end={E}&posIds={P}&groupBy=day&compare=previous&team=all&orderOrigin=all&marketerId=', '/api/targets?month={M}'],
  pipeline: ['/api/reports/pipeline?start={S}&end={E}&posIds={P}&basis=confirmed&team=all&orderOrigin=all&marketerId=', '/api/reports/shipping-lines?start={S}&end={E}&posIds={P}&basis=confirmed&team=all&dim=line'],
  'van-don': ['/api/reports/van-don?start={S}&end={E}&posIds={P}'],
  customers: ['/api/employees?team=all', '/api/reports/customers?posIds={P}&q=&page=1&size=50&sort=spend&sellerId=&team=all&group=all'],
  calls: ['/api/employees?team=cskh', '/api/reports/calls?start={S}&end={E}&posIds={P}&team=all'],
  care: ['/api/employees?team=cskh', '/api/reports/care?posIds={P}&assigned=all&q=&minDays=0&sort=note_old&size=50&page=1&team=cskh'],
  products: ['/api/reports/delivered-products?start={S}&end={E}&posIds={P}', '/api/reports/product-groups?start={S}&end={E}&posIds={P}&team=all&dim=tag&basis=both&by=seller'],
  shell: ['/api/prefs/metrics', '/api/reports/cskh-badge', '/api/sync/pos'],
};
// Cơ cấu người dùng thật (như k6-web.js): 8 phần nhân viên, 4 leader Sale, 4 leader CSKH, 2 trưởng phòng, 1 giám đốc, 1 chủ. Mỗi phần = danh sách trang hay mở.
const SALE = ['center', 'overview', 'shift', 'sale-overview', 'compare', 'products'];
const CSKH = ['center', 'cskh-overview', 'calls', 'care', 'customers'];
const ALL = Object.keys(VIEWS).filter((v) => v !== 'shell');
const POOL = [
  ...Array(8).fill(['shift', 'sale-overview', 'compare']),
  ...Array(4).fill(SALE), ...Array(4).fill(CSKH),
  ...Array(2).fill([...SALE, ...CSKH]), ALL, ALL,
];
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const nextUrl = () => { const view = Math.random() < 0.1 ? 'shell' : pick(pick(POOL)); return { view, url: fill(pick(VIEWS[view])) }; };
const apiPerPage = Object.values(VIEWS).reduce((s, v) => s + v.length, 0) / Object.keys(VIEWS).length;

async function login() {
  const r = await fetch(`${URL_}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: EMAIL, password: MATKHAU }) });
  const cookie = (r.headers.getSetCookie?.() ?? []).map((c) => c.split(';')[0]).join('; ');
  if (!r.ok || !cookie) throw new Error(`Đăng nhập thất bại: HTTP ${r.status}`);
  return cookie;
}

const pct = (arr, p) => { if (!arr.length) return 0; const s = [...arr].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.ceil(s.length * p) - 1)]; };
const ms = (n) => `${Math.round(n).toLocaleString('vi-VN')} ms`;

async function runLevel(rate, cookie, giay = GIAY) {
  const ms_ = [], byView = {}; let sent = 0, ok = 0, err = 0, timeout = 0, inflight = 0, maxInflight = 0;
  const codes = {};
  const cpu0 = process.cpuUsage(), t0 = Date.now();
  const fire = async () => {
    const { view, url } = nextUrl(); sent++; inflight++; maxInflight = Math.max(maxInflight, inflight);
    const start = performance.now(); const ac = new AbortController(); const tm = setTimeout(() => ac.abort(), TIMEOUT);
    try {
      const r = await fetch(URL_ + url, { headers: { cookie }, signal: ac.signal });
      await r.arrayBuffer();
      const dt = performance.now() - start; ms_.push(dt); (byView[view] ??= []).push(dt);
      codes[r.status] = (codes[r.status] ?? 0) + 1;
      if (r.ok || r.status === 403) ok++; else err++;
    } catch (e) { const dt = performance.now() - start; ms_.push(dt); (byView[view] ??= []).push(dt); if (e?.name === 'AbortError') { timeout++; codes.timeout = (codes.timeout ?? 0) + 1; } else { err++; codes.loi = (codes.loi ?? 0) + 1; } }
    finally { clearTimeout(tm); inflight--; }
  };
  // Mô hình mở: khoảng cách giữa hai request theo phân phối mũ quanh 1/rate giây, không chờ request trước trả về.
  const pending = []; const end = t0 + giay * 1000;
  await new Promise((resolve) => {
    const tick = () => { if (Date.now() >= end) return resolve(); pending.push(fire()); setTimeout(tick, -Math.log(1 - Math.random()) * 1000 / rate); };
    tick();
  });
  await Promise.allSettled(pending);
  const cpu = process.cpuUsage(cpu0); const wall = Date.now() - t0;
  const cpuPct = (cpu.user + cpu.system) / 1000 / wall * 100;
  const errRate = (err + timeout) / Math.max(1, sent) * 100;
  const views = Object.fromEntries(Object.entries(byView).map(([v, a]) => [v, { n: a.length, p95: Math.round(pct(a, 0.95)) }]));
  return { rate, sent, ok, err, timeout, errRate, p50: pct(ms_, 0.5), p95: pct(ms_, 0.95), p99: pct(ms_, 0.99), max: Math.max(0, ...ms_), maxInflight, codes, views, firerCpuPct: cpuPct, firerRssMb: process.memoryUsage().rss / 1048576 };
}

const log = { url: URL_, at: today.toISOString(), giayMoiNac: GIAY, p95Max: P95_MAX, loiMax: LOI_MAX, may: { cpu: os.cpus().length, ramGb: Math.round(os.totalmem() / 1073741824), platform: process.platform, node: process.version }, nac: [], gay: null };
console.log(`Thử tải ${URL_} · nấc ${NAC.join(', ')} request/giây · mỗi nấc ${GIAY} giây · gãy khi p95 > ${P95_MAX} ms hoặc lỗi > ${LOI_MAX}%`);
const cookie = await login();
console.log('Đăng nhập xong. Làm nóng 5 giây ở 1 request/giây…');
await runLevel(1, cookie, 5).catch(() => null);
for (const rate of NAC) {
  process.stdout.write(`Nấc ${rate} req/giây (~${Math.round(rate * NGHI / apiPerPage)} người cùng lúc)… `);
  const r = await runLevel(rate, cookie);
  log.nac.push(r);
  const gay = r.p95 > P95_MAX || r.errRate > LOI_MAX;
  console.log(`${r.sent} request · p50 ${ms(r.p50)} · p95 ${ms(r.p95)} · p99 ${ms(r.p99)} · lỗi ${r.errRate.toFixed(1)}% (timeout ${r.timeout}) · đang chờ tối đa ${r.maxInflight} · máy bắn CPU ${r.firerCpuPct.toFixed(0)}%${gay ? '  ← GÃY' : ''}`);
  if (r.firerCpuPct > 70) console.log('  ! Tiến trình bắn tải dùng quá 70% một lõi: số đo nấc này có thể lệch vì máy bắn tự nghẽn.');
  if (gay) { log.gay = { rate, p95: r.p95, errRate: r.errRate }; break; }
}
try { mkdirSync(dirname(LOG), { recursive: true }); writeFileSync(LOG, JSON.stringify(log, null, 1)); } catch (e) { console.log(`Không ghi được log ${LOG}: ${e?.message}`); }

const last = log.nac.at(-1); const okLevels = log.nac.filter((n) => n.p95 <= P95_MAX && n.errRate <= LOI_MAX);
const best = okLevels.at(-1);
console.log('\n=== Tóm tắt ===');
if (best) console.log(`Chịu tốt tới ${best.rate} request/giây ≈ ${Math.round(best.rate * NGHI / apiPerPage)} người dùng cùng lúc (mỗi người ${NGHI} giây bấm một trang): p95 ${ms(best.p95)}, lỗi ${best.errRate.toFixed(1)}%.`);
else console.log(`Ngay nấc đầu (${last?.rate} request/giây) đã vượt ngưỡng: p95 ${ms(last?.p95 ?? 0)}, lỗi ${(last?.errRate ?? 0).toFixed(1)}%.`);
if (log.gay) {
  console.log(`Gãy ở nấc ${log.gay.rate} request/giây ≈ ${Math.round(log.gay.rate * NGHI / apiPerPage)} người: p95 ${ms(log.gay.p95)}, lỗi ${log.gay.errRate.toFixed(1)}%.`);
  const slow = Object.entries(last.views).sort((a, b) => b[1].p95 - a[1].p95).slice(0, 3).map(([v, x]) => `${v} (p95 ${ms(x.p95)})`);
  console.log(`Trang chậm nhất lúc gãy: ${slow.join(', ')}.`);
} else console.log(`Chạy hết các nấc mà chưa gãy: thử lại với nấc cao hơn (--nac ${NAC.at(-1) * 2},${NAC.at(-1) * 4}).`);
console.log(`Log: ${LOG}`);
