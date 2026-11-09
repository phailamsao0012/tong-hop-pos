// Thử bản PC chế độ đầy đủ (C:\thp\db-thu, cổng 8788): đặt mật khẩu tạm cho 1 tài khoản trưởng nhóm TRÊN BẢN THỬ (khoá riêng bản thử),
// đăng nhập, mở các báo cáo nặng, đo thời gian và mã trả về, rồi thử tải N lượt song song. Không đụng web thật, không đụng bản PC đang chạy.
// Chạy: node scripts/pc/thu-ban-thu.mjs [số người song song=30] [số giây=60]
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { webcrypto as crypto } from 'node:crypto';

const BASE = 'http://127.0.0.1:8788';
const DBF = 'C:\\thp\\db-thu\\thp.sqlite';
const USERS = Number(process.argv[2] ?? 30);
const SECS = Number(process.argv[3] ?? 60);
const secret = /^AUTH_SECRET=(.*)$/m.exec(readFileSync('C:\\thp\\db-thu\\.dev.vars', 'utf8'))[1].trim();
const enc = new TextEncoder();
const b64 = (u) => Buffer.from(u).toString('base64');

async function hash(password) {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const material = await crypto.subtle.importKey('raw', await crypto.subtle.sign('HMAC', key, enc.encode(password)), 'PBKDF2', false, ['deriveBits']);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: 30000 }, material, 256);
  return `pbkdf2$30000$${b64(salt)}$${b64(new Uint8Array(bits))}`;
}

const db = new DatabaseSync(DBF);
db.exec('PRAGMA busy_timeout=10000');
const user = db.prepare("SELECT id, email FROM users WHERE role='lead' AND disabled=0 ORDER BY email LIMIT 1").get();
const password = 'Thu-' + b64(crypto.getRandomValues(new Uint8Array(12))).replace(/[^A-Za-z0-9]/g, '');
db.prepare('UPDATE users SET password_hash=? WHERE id=?').run(await hash(password), user.id);
db.close();

const login = await fetch(`${BASE}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json', origin: BASE }, body: JSON.stringify({ email: user.email, password }) });
const cookie = (login.headers.getSetCookie().find((c) => c.startsWith('thp_session=')) ?? '').split(';')[0];
console.log('đăng nhập', login.status, await login.text(), cookie ? 'có phiên' : 'KHÔNG có phiên');
const get = async (path) => {
  const t = Date.now();
  try { const r = await fetch(BASE + path, { headers: { cookie } }); await r.arrayBuffer(); return { status: r.status, ms: Date.now() - t }; }
  catch (e) { return { status: 0, ms: Date.now() - t, err: String(e) }; }
};
const PAGES = [
  '/api/reports/overview?start=2026-11-01&end=2026-11-08',
  '/api/reports/overview?start=2026-11-01&end=2026-11-08&productSegment=gentadox',
  '/api/reports/overview?start=2026-11-01&end=2026-11-08&productSegment=skgk',
  '/api/reports/calls?start=2026-11-01&end=2026-11-08',
  '/api/reports/trends?start=2026-10-01&end=2026-11-08',
  '/api/reports/care?start=2026-11-01&end=2026-11-08',
  '/api/employees',
  '/api/sync/pos',
];
console.log('— lần đầu (chưa có cache) —');
for (const p of PAGES) { const r = await get(p); console.log(`${r.status} ${r.ms} ms ${p}`); }

console.log(`— tải: ${USERS} người song song trong ${SECS} giây, mỗi người mở lần lượt các trang trên, ngày đổi ngẫu nhiên để tránh cache —`);
const stats = { n: 0, err: 0, codes: {}, ms: [] };
const end = Date.now() + SECS * 1000;
await Promise.all(Array.from({ length: USERS }, async () => {
  while (Date.now() < end) {
    const d = 1 + Math.floor(Math.random() * 8);
    const p = PAGES[Math.floor(Math.random() * PAGES.length)].replace('2026-11-08', `2026-11-0${d}`);
    const r = await get(p);
    stats.n++; stats.ms.push(r.ms); stats.codes[r.status] = (stats.codes[r.status] ?? 0) + 1;
    if (r.status === 0 || r.status >= 500) stats.err++;
  }
}));
stats.ms.sort((a, b) => a - b);
const q = (x) => stats.ms[Math.min(stats.ms.length - 1, Math.floor(stats.ms.length * x))];
console.log(`lượt: ${stats.n}, lỗi 5xx/mất kết nối: ${stats.err}, mã: ${JSON.stringify(stats.codes)}, thời gian p50 ${q(0.5)} ms, p95 ${q(0.95)} ms, chậm nhất ${stats.ms.at(-1)} ms`);
