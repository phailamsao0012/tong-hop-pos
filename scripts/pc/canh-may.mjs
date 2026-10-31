// Canh web tổng trên PC (plan docs/plans/2026-10-31-chuyen-sang-pc, mục 4.6). Task Scheduler gọi 5 phút một lần.
// Kiểm: web trả lời, cron chạy đều, sao lưu đêm qua xong, ổ còn chỗ. Có sự cố mới hoặc đã hết sự cố thì nhắn Telegram;
// sự cố kéo dài thì nhắc lại 6 giờ một lần. Gửi tới watch_chats (đặt trên web), chưa đặt thì tới chat admin trong telegram_chats.
// Khoá bot đọc từ .dev.vars (TELEGRAM_BOT_TOKEN), không in ra. Chưa có khoá thì chỉ ghi log.
import { existsSync, readFileSync, readdirSync, statfsSync, statSync, writeFileSync, appendFileSync, mkdirSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

const args = process.argv.slice(2);
const flag = (name, def) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : def; };
const root = flag('root', 'C:\\thp');
const port = flag('port', '8787');
const dryRun = args.includes('--thu');
const logDir = `${root}/log`;
mkdirSync(logDir, { recursive: true });
const now = Date.now();
const day = new Date().toISOString().slice(0, 10);
const log = (line) => appendFileSync(`${logDir}/canh-may-${day}.log`, `${new Date().toISOString()} ${line}\n`);

const vars = Object.fromEntries((existsSync(`${root}/bi-mat/.dev.vars`) ? readFileSync(`${root}/bi-mat/.dev.vars`, 'utf8') : '')
  .split(/\r?\n/).map((l) => /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(l)).filter(Boolean).map((m) => [m[1], m[2].replace(/^"(.*)"$/, '$1')]));
const ageMin = (file) => (existsSync(file) ? (now - statSync(file).mtimeMs) / 60000 : Infinity);

const problems = {};
// 1. Web trả lời
try {
  const r = await fetch(`http://127.0.0.1:${port}/login`, { signal: AbortSignal.timeout(20000), redirect: 'manual' });
  if (r.status >= 500) problems.web = `Web tổng trên PC trả lỗi ${r.status}.`;
} catch { problems.web = 'Web tổng trên PC không trả lời.'; }
// 2. Cron mỗi phút
const cronAge = ageMin(`${logDir}/cron-cuoi.txt`);
if (cronAge > 10) problems.cron = `Lịch chạy mỗi phút đã dừng ${Number.isFinite(cronAge) ? `${Math.round(cronAge)} phút` : 'từ lâu'}.`;
// 3. Sao lưu đêm (chỉ kiểm khi đã từng sao lưu)
const backupDone = `${logDir}/sao-luu-cuoi.txt`;
if (existsSync(backupDone) && ageMin(backupDone) > 26 * 60) problems.backup = 'Sao lưu đêm qua chưa xong. Xem C:\\thp\\log\\sao-luu-*.log.';
if (existsSync(`${logDir}/sao-luu-loi.txt`) && statSync(`${logDir}/sao-luu-loi.txt`).mtimeMs > (existsSync(backupDone) ? statSync(backupDone).mtimeMs : 0))
  problems.backup = `Sao lưu lỗi: ${readFileSync(`${logDir}/sao-luu-loi.txt`, 'utf8').trim().slice(0, 200)}`;
// 4. Ổ đĩa
try {
  const s = statfsSync(root);
  const freeGb = (s.bavail * s.bsize) / 1e9;
  if (freeGb < 20) problems.disk = `Ổ chứa ${root} chỉ còn ${freeGb.toFixed(0)} GB trống.`;
} catch { /* statfs không có thì bỏ qua */ }

// Trạng thái lần trước: chỉ nhắn khi có thay đổi, hoặc nhắc lại sau 6 giờ
const stateFile = `${logDir}/canh-may-trang-thai.json`;
let prev = {};
try { prev = JSON.parse(readFileSync(stateFile, 'utf8')); } catch { prev = {}; }
const lines = [];
const next = {};
for (const [k, msg] of Object.entries(problems)) {
  const since = prev[k]?.since ?? now, sent = prev[k]?.sent ?? 0;
  if (!prev[k] || now - sent > 6 * 3600000) { lines.push(`⚠️ ${msg}`); next[k] = { since, sent: now }; }
  else next[k] = prev[k];
}
for (const k of Object.keys(prev)) if (!problems[k]) lines.push(`✅ Hết sự cố: ${{ web: 'web', cron: 'lịch chạy', backup: 'sao lưu', disk: 'ổ đĩa' }[k] ?? k} đã bình thường.`);
writeFileSync(stateFile, JSON.stringify(next));
if (!lines.length) process.exit(0);

const text = `PC web tổng\n${lines.join('\n')}`;
log(lines.join(' | '));

// Người nhận
let chats = [];
try {
  const d1Dir = `${root}/data/v3/d1/miniflare-D1DatabaseObject`;
  const f = readdirSync(d1Dir).find((x) => x.endsWith('.sqlite') && x !== 'metadata.sqlite');
  const db = new DatabaseSync(`${d1Dir}/${f}`, { readOnly: true });
  try { chats = JSON.parse(db.prepare("SELECT value FROM app_settings WHERE key='watch_chats'").get()?.value ?? '[]'); } catch { chats = []; }
  if (!chats.length) try { chats = db.prepare("SELECT chat_id FROM telegram_chats WHERE role='admin'").all().map((r) => r.chat_id); } catch { chats = []; }
  db.close();
} catch { chats = []; }
chats = [...new Set(chats.map(String))].filter((id) => /^\d{4,20}$/.test(id)).slice(0, 5);

const token = vars.TELEGRAM_BOT_TOKEN;
if (dryRun || !token || !chats.length) { log(`không gửi Telegram (${dryRun ? 'chạy thử' : !token ? 'thiếu khoá bot' : 'chưa có chat nhận'})`); console.log(text); process.exit(0); }
for (const chat of chats) {
  try {
    const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chat_id: chat, text }), signal: AbortSignal.timeout(20000),
    });
    log(`gửi Telegram: ${r.status}`);
  } catch { log('gửi Telegram lỗi mạng'); }
}
