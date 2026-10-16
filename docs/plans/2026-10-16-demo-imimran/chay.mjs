#!/usr/bin/env node
// Chạy liền một mạch plan Demo 2 theo kênh @imimran004 (16/10/2026). Claude viết; Codex làm các bước R1, R2, H0, G1–G7.
// Chạy được trên Windows (PC) và macOS: Node ≥ 22, git, pnpm, codex trong PATH.
//
// Cách chạy (worktree tạo từ origin/claude/project-thread-8ugt1v, đứng ở gốc worktree):
//   node docs/plans/2026-10-16-demo-imimran/chay.mjs --tk1 <CODEX_HOME tk1> --tk2 <CODEX_HOME tk2> [--tele "<lệnh gửi Telegram>"] [--codex-args "<cờ thêm cho codex exec>"]
//   Trên PC Windows: --codex-args "-c windows.sandbox=unelevated".
//
// R0 (máy): thu kênh Threads vào .kenh/ (không commit). Sau R1: máy tải phông nếu báo cáo ghi PHONG. Sau R2: máy chụp mẫu tĩnh.
// Mỗi bước Codex: Codex làm (sandbox workspace-write, approval never), máy kiểm, sai thì giao lại tối đa 3 vòng, đạt thì commit.
// Hết lượt tk1 thì sang tk2; cả hai hết thì ngủ tới giờ hồi rồi làm tiếp. Không hỏi ai.
// Xong: gom tóm tắt vào ket-qua.md, đẩy codex/demo-imimran rồi đẩy cùng commit lên demo-2 (GitHub tự deploy demo 2).
// Không bao giờ đẩy main, claude/project-thread-3ujeoc, demo-gop hay nhánh nào khác.
import { spawn, spawnSync } from 'node:child_process';
import { appendFileSync, copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const arg = (name, def = '') => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : def; };
const TK = [arg('--tk1', join(homedir(), '.codex')), arg('--tk2', join(homedir(), '.codex-2'))];
const TELE = arg('--tele');
const CODEX_ARGS = arg('--codex-args').split(' ').filter(Boolean);
const WIN = process.platform === 'win32';

const WT = spawnSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).stdout.trim();
if (!WT) { console.error('Không ở trong repo git.'); process.exit(2); }
process.chdir(WT);
const PLAN = 'docs/plans/2026-10-16-demo-imimran';
const DAY = 'codex/demo-imimran';
const DEMO = 'demo-2';
const TEN = 'Demo 2 (@imimran004) 16/10';
const V = join(homedir(), 'codex-viec', 'demo-imimran');
mkdirSync(V, { recursive: true });
const HOOKS = join(V, 'hooks-rong'); mkdirSync(HOOKS, { recursive: true });
const KENH = join(WT, '.kenh');
const PW = join(V, 'pw');

const GIAO = /^(app\/(?!api\/)\S*\.(tsx|css)|app\/ui\/[^/]+\.tsx?|components\/ui\/\S+|public\/fonts\/\S+|tests\/giao-dien-demo2[^/]*\.test\.ts)$/;
const BUOC = [
  { b: 'R1', pham: /^docs\/plans\/2026-10-16-demo-imimran\/bao-cao-kenh\.md$/, doc: true },
  { b: 'R2', pham: /^docs\/plans\/2026-10-16-demo-imimran\/(thiet-ke\.md|mau\/\S+)$/, doc: true },
  { b: 'H0', pham: /^(scripts\/deploy-demo-2\.mjs|\.github\/workflows\/deploy-demo-2\.yml)$/ },
  { b: 'G1', pham: /^(app\/globals\.css|app\/dashboard\.tsx|app\/layout\.tsx|app\/ui\/[^/]+\.tsx?|components\/ui\/\S+|public\/fonts\/\S+|tests\/giao-dien-demo2[^/]*\.test\.ts)$/ },
  { b: 'G2', pham: GIAO }, { b: 'G3', pham: GIAO }, { b: 'G4', pham: GIAO }, { b: 'G5', pham: GIAO }, { b: 'G6', pham: GIAO },
  { b: 'G7', pham: new RegExp(`${GIAO.source}|^docs\\/plans\\/2026-10-16-demo-imimran\\/ket-qua-codex\\.md$`) },
  { b: 'S1', pham: new RegExp(`${GIAO.source}|^docs\\/plans\\/2026-10-16-demo-imimran\\/ket-qua-codex\\.md$`) },
];

const TD = join(V, 'tien-do.txt');
const gio = () => new Date().toISOString().slice(5, 16).replace('T', ' ') + 'Z';
const tele = (msg) => {
  if (!TELE) return;
  const r = spawnSync(`${TELE} ${JSON.stringify(`🤖 CODEX | Demo 2: ${msg}`)}`, { shell: true, encoding: 'utf8', timeout: 30000 });
  if (r.status !== 0) appendFileSync(join(V, 'tele-loi.txt'), `${gio()} gửi lỗi (mã ${r.status})\n`);
};
const ghi = (msg, gui = true) => { const l = `${gio()} ${msg}`; console.log(l); appendFileSync(TD, l + '\n'); if (gui) tele(msg); };
const sh = (cmd, args, opts = {}) => spawnSync(cmd, args, { encoding: 'utf8', shell: WIN, maxBuffer: 64 * 1024 * 1024, ...opts });
// git chạy không qua shell: trên Windows shell làm vỡ lời commit có dấu cách (commit hỏng, bước sau trả file về như cũ).
const git = (...a) => sh('git', ['-c', `core.hooksPath=${HOOKS}`, ...a], { shell: false });
const ngu = (ms) => new Promise((r) => setTimeout(r, ms));

const KHOA = join(V, 'dang-chay');
try { mkdirSync(KHOA); } catch { console.error(`Đang chạy rồi (xoá ${KHOA} nếu chắc là không).`); process.exit(2); }
const thoat = (ma) => { try { rmSync(KHOA, { recursive: true }); } catch {} process.exit(ma); };
for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP', 'SIGBREAK']) process.on(sig, () => { ghi(`⏸ script bị dừng (${sig}), chạy lại lệnh cũ là làm tiếp từ bước dở`); thoat(1); });

const EX = join(sh('git', ['rev-parse', '--git-common-dir']).stdout.trim(), 'info', 'exclude');
for (const p of ['.codex-out/', '.kenh/', '.dev.vars', '.wrangler/', 'dist/', '.DS_Store', 'Thumbs.db', 'wrangler.demo2-migrate.json']) {
  const cur = existsSync(EX) ? readFileSync(EX, 'utf8') : '';
  if (!cur.split(/\r?\n/).includes(p)) appendFileSync(EX, `${p}\n`);
}

const NHAY = /\+84 ?\d|(^|[^\dA-Za-z])0\d{9}([^\dA-Za-z]|$)|[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)*\.[a-z]{2,}|eyJ[A-Za-z0-9_-]{10,}|PRIVATE KEY/;
const NHAY_DUOC = /0900\d{6}|090000000\d|[a-z0-9.]+@demo\.megatech\.vn|noreply@|@imimran004|@ikramsakib|threads\.(com|net)\/@|@(media|import|theme|custom-variant|font-face|keyframes|supports|layer|apply|container)\b/;
// Lệnh remote / migrate chỉ tính khi thật sự chạy (rg tìm chữ "db:migrate" trong package.json không tính).
const CAM = /\.codex(-2)?([\\/ "']|$)|\.ssh|\.config[\\/]gh|tele-bot|wrangler\b[^;|&\n]*--remote|wrangler deploy|(pnpm|npm|yarn)( run)? db:migrate(?!:local)|printenv|(^|[ ;&|(])gh /i;
const LA = /git (push|commit)|curl |wget |Invoke-WebRequest|npm install|pnpm (add|install)(?! --frozen)|pnpm format|oxfmt/i;

if (!existsSync(join(WT, 'node_modules'))) { ghi('cài gói (pnpm install --frozen-lockfile)', false); sh('pnpm', ['install', '--frozen-lockfile'], { stdio: 'inherit' }); }
const soLoiLint = () => {
  const r = sh('pnpm', ['lint']);
  const out = `${r.stdout}\n${r.stderr}`;
  const m = out.match(/Found (\d+) warnings? and (\d+) errors?/i);
  return m ? Number(m[2]) : (out.match(/: error /g) ?? []).length;
};
ghi(`bắt đầu ở ${WT}, nhánh ${sh('git', ['rev-parse', '--abbrev-ref', 'HEAD']).stdout.trim()}, R0 + ${BUOC.length} bước Codex (bước đã có commit thì bỏ qua)`);
const LINT_GOC = soLoiLint();
ghi(`lỗi lint ở gốc: ${LINT_GOC}`, false);

// ---- Máy: Playwright riêng của việc này (không đụng package.json repo) ----
function caiPlaywright() {
  if (existsSync(join(PW, 'node_modules', 'playwright'))) return true;
  mkdirSync(PW, { recursive: true });
  const a = sh('npm', ['i', '--no-save', '--no-package-lock', '--prefix', PW, 'playwright@1.56.1'], { stdio: 'inherit' });
  const b = sh(join(PW, 'node_modules', '.bin', WIN ? 'playwright.cmd' : 'playwright'), ['install', 'chromium'], { stdio: 'inherit' });
  return a.status === 0 && b.status === 0;
}
const chayPw = (file, args) => sh('node', [file, ...args], { env: { ...process.env, NODE_PATH: join(PW, 'node_modules') }, stdio: 'inherit', timeout: 60 * 60000 });

// ---- R0: thu kênh ----
function r0() {
  if (existsSync(join(KENH, 'bai.json'))) { ghi('R0 đã thu kênh từ trước, bỏ qua', false); return; }
  ghi('R0: máy thu kênh @imimran004');
  if (!caiPlaywright()) { ghi('⚠️ R0: cài Playwright lỗi, Codex làm báo cáo với phần ít ỏi', false); mkdirSync(KENH, { recursive: true }); writeFileSync(join(KENH, 'bai.json'), '[]'); }
  else {
    const r = chayPw(join(WT, PLAN, 'thu-kenh.cjs'), [KENH, 'imimran004']);
    if (r.status !== 0) ghi(`⚠️ R0: thu kênh thoát mã ${r.status}, vẫn làm tiếp với phần thu được`, false);
    if (!existsSync(join(KENH, 'bai.json'))) writeFileSync(join(KENH, 'bai.json'), '[]');
  }
  const TK_DIR = join(KENH, 'tham-khao'); mkdirSync(TK_DIR, { recursive: true });
  sh('git', ['fetch', '-q', 'origin', 'demo-gop', 'codex/hoc-tu-odoo']);
  for (const [nhanh, f, ten] of [
    ['origin/demo-gop', 'docs/giao-dien-moi/plan.md', 'ikramsakib-plan.md'],
    ['origin/demo-gop', 'docs/giao-dien-moi/mau-threads-ikramsakib.md', 'ikramsakib-mau-threads.md'],
    ['origin/demo-gop', 'docs/giao-dien-moi/mau/tokens.css', 'ikramsakib-tokens.css'],
    ['origin/demo-gop', 'docs/giao-dien-moi/mau/index.html', 'ikramsakib-mau.html'],
    ['origin/codex/hoc-tu-odoo', 'docs/plans/2026-10-15-hoc-tu-odoo/plan.md', 'odoo-plan.md'],
  ]) { const r = sh('git', ['show', `${nhanh}:${f}`]); if (r.status === 0) writeFileSync(join(TK_DIR, ten), r.stdout); }
  const ts = existsSync(join(KENH, 'tieu-su.json')) ? JSON.parse(readFileSync(join(KENH, 'tieu-su.json'), 'utf8')) : {};
  ghi(`R0 xong: ${ts.soBai ?? 0} bài, ${ts.soAnh ?? 0} ảnh`);
}

// ---- Sau R1: tải phông Google Fonts (máy, không Codex) ----
async function taiPhong() {
  const bc = join(WT, PLAN, 'bao-cao-kenh.md');
  const m = existsSync(bc) && readFileSync(bc, 'utf8').match(/^PHONG:\s*(.+)$/m);
  if (!m || /^giữ\s*$/i.test(m[1].trim())) return;
  const dir = join(KENH, 'phong'); mkdirSync(dir, { recursive: true });
  for (const ten of m[1].split(',').map((x) => x.trim()).filter((x) => x && !/^giữ$/i.test(x))) {
    try {
      const css = await (await fetch(`https://fonts.googleapis.com/css2?family=${encodeURIComponent(ten).replace(/%20/g, '+')}:wght@400;500;600;700&display=swap`, { headers: { 'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36' } })).text();
      let n = 0;
      for (const [, subset, body] of css.matchAll(/\/\*\s*([a-z-]+)\s*\*\/\s*@font-face\s*{([^}]*)}/g)) {
        if (!['latin', 'latin-ext', 'vietnamese'].includes(subset)) continue;
        const w = body.match(/font-weight:\s*(\d+)/)?.[1]; const url = body.match(/url\((https:[^)]+\.woff2)\)/)?.[1];
        if (!w || !url) continue;
        writeFileSync(join(dir, `${ten.toLowerCase().replace(/\s+/g, '-')}-${w}-${subset}.woff2`), Buffer.from(await (await fetch(url)).arrayBuffer())); n++;
      }
      ghi(`tải phông ${ten}: ${n} tệp vào .kenh/phong/`, false);
    } catch (e) { ghi(`tải phông ${ten} lỗi: ${e.message}`, false); }
  }
}

// ---- Sau R2: chụp mẫu tĩnh ----
function chupMau() {
  const html = join(WT, PLAN, 'mau', 'index.html');
  if (!existsSync(html) || !caiPlaywright()) return;
  const js = join(V, 'chup-mau.cjs');
  writeFileSync(js, `const { chromium } = require('playwright');
(async () => { const b = await chromium.launch(); const out = process.argv[2]; const url = process.argv[3];
  for (const s of ['home','sale','vandon','login']) for (const t of ['light','dark']) for (const [w,h] of [[1440,900],[390,844]]) {
    const p = await b.newPage({ viewport: { width: w, height: h } }); await p.goto(url + '?s=' + s + '&t=' + t); await p.waitForTimeout(800);
    await p.screenshot({ path: out + '/' + s + '-' + t + '-' + w + '.png', fullPage: true }); await p.close(); }
  await b.close(); })().catch((e) => { console.error(e.message); process.exit(1); });`);
  const out = join(WT, PLAN, 'mau', 'anh'); mkdirSync(out, { recursive: true });
  const r = chayPw(js, [out, pathToFileURL(html).href]);
  git('add', '--', `${PLAN}/mau/anh`);
  if (r.status === 0) git('commit', '-q', '-m', `${TEN}: ảnh chụp mẫu tĩnh (máy chụp)`, '--', `${PLAN}/mau/anh`);
  ghi(r.status === 0 ? '📸 đã chụp mẫu tĩnh' : `chụp mẫu lỗi (mã ${r.status})`, false);
}

// ---- Chạy Codex, đổi tài khoản, chờ hồi lượt ----
let tk = 0;
const conHan = [0, 0];
const hetLuot = (s) => /usage limit|rate limit|quota|too many requests|\b429\b|hit your limit/i.test(s);
function gioHoi(s, now = Date.now()) {
  const m = s.match(/try again in\s+((?:\d+\s*(?:days?|d|hours?|hrs?|h|minutes?|mins?|m|seconds?|secs?|s)[\s,and]*)+)/i);
  if (m) {
    let ms = 0;
    for (const [, n, u] of m[1].matchAll(/(\d+)\s*(days?|d|hours?|hrs?|h|minutes?|mins?|m|seconds?|secs?|s)\b/gi)) {
      const k = u[0].toLowerCase(); ms += Number(n) * (k === 'd' ? 864e5 : k === 'h' ? 36e5 : k === 'm' ? 6e4 : 1e3);
    }
    if (ms > 0) return now + ms + 120000;
  }
  const a = s.match(/try again at\s+(\d{1,2}):(\d{2})\s*([AP]M)?/i);
  if (a) {
    let h = Number(a[1]) % 12; if (!a[3]) h = Number(a[1]); else if (a[3].toUpperCase() === 'PM') h += 12;
    const d = new Date(now); d.setHours(h, Number(a[2]), 0, 0);
    if (d.getTime() <= now) d.setDate(d.getDate() + 1);
    return d.getTime() + 120000;
  }
  return now + 30 * 60000;
}
/** Ảnh đính kèm cho R1 (tối đa 40): ảnh đại diện, ảnh bài mới nhất, vài ảnh chụp trang. Còn lại Codex tự mở bằng công cụ xem ảnh. */
function anhR1() {
  const ds = [];
  const anh = join(KENH, 'anh');
  if (existsSync(anh)) ds.push(...readdirSync(anh).sort().map((f) => join(anh, f)));
  if (existsSync(KENH)) ds.push(...readdirSync(KENH).filter((f) => /^trang-1440.*\.png$/.test(f)).slice(0, 6).map((f) => join(KENH, f)));
  return ds.slice(0, 40);
}
let LAN = '';
async function chayCodex(fileGiao, tomtat, nhan, anh = []) {
  for (let thu = 0; thu < 400; thu++) {
    const now = Date.now();
    if (conHan[tk] > now) {
      const khac = 1 - tk;
      if (conHan[khac] <= now) { tk = khac; ghi(`🔄 đổi sang tài khoản ${tk + 1}`); }
      else {
        const cho = Math.min(conHan[0], conHan[1]) - now;
        tk = conHan[0] <= conHan[1] ? 0 : 1;
        ghi(`⏸ cả hai tài khoản hết lượt, chờ tới ${new Date(now + cho).toISOString().slice(11, 16)}Z (${Math.round(cho / 60000)} phút) rồi làm tiếp`);
        await ngu(cho);
        continue;
      }
    }
    LAN = join(V, `${nhan}-tk${tk + 1}-${thu}`);
    const args = ['exec', '-C', WT, '-s', 'workspace-write', '-c', 'approval_policy=never', ...CODEX_ARGS, ...anh.map((f) => `--image=${f}`), '--json', '-o', tomtat, '-'];
    const ma = await new Promise((resolve) => {
      const p = spawn('codex', args, { env: { ...process.env, CODEX_HOME: TK[tk] }, shell: WIN, stdio: ['pipe', 'pipe', 'pipe'] });
      const out = [], err = [];
      p.stdout.on('data', (d) => out.push(d)); p.stderr.on('data', (d) => err.push(d));
      p.on('close', (code) => { writeFileSync(`${LAN}.jsonl`, Buffer.concat(out)); writeFileSync(`${LAN}.err`, Buffer.concat(err)); resolve(code ?? 1); });
      p.on('error', () => resolve(127));
      p.stdin.end(readFileSync(fileGiao));
    });
    const text = `${readFileSync(`${LAN}.err`, 'utf8')}\n${readFileSync(`${LAN}.jsonl`, 'utf8').slice(-20000)}`;
    if (ma === 0 && !(hetLuot(text) && !existsSync(tomtat))) return true;
    if (hetLuot(text)) { conHan[tk] = gioHoi(text); ghi(`tài khoản ${tk + 1} hết lượt, dùng lại được lúc ${new Date(conHan[tk]).toISOString().slice(11, 16)}Z`, false); continue; }
    ghi(`codex thoát mã ${ma} (xem ${LAN}.err)`, false);
    if (thu >= 2) return false;
    await ngu(60000);
  }
  return false;
}
function lenhDaChay() {
  if (!existsSync(`${LAN}.jsonl`)) return [];
  const res = [];
  for (const line of readFileSync(`${LAN}.jsonl`, 'utf8').split(/\r?\n/)) {
    try { const it = JSON.parse(line)?.item; if (it?.type === 'command_execution') res.push(Array.isArray(it.command) ? it.command.join(' ') : String(it.command)); } catch {}
  }
  return res;
}

// ---- Máy kiểm sau mỗi lượt Codex ----
function kiemRieng(st) {
  const loi = [];
  if (st.b === 'R1') {
    const t = readFileSync(join(WT, PLAN, 'bao-cao-kenh.md'), 'utf8');
    if (!/^PHONG:/m.test(t)) loi.push('bao-cao-kenh.md thiếu dòng "PHONG: …" (plan R1 mục 9).');
    if ((t.match(/#[0-9a-fA-F]{6}\b/g) ?? []).length < 6) loi.push('Mục 4 cần ít nhất 6 mã màu hex đo từ ảnh.');
    if ((t.match(/^##\s/gm) ?? []).length < 9) loi.push('Báo cáo cần đủ 9 mục (tiêu đề ##).');
  }
  if (st.b === 'R2') {
    const t = existsSync(join(WT, PLAN, 'thiet-ke.md')) ? readFileSync(join(WT, PLAN, 'thiet-ke.md'), 'utf8') : '';
    if (!t) loi.push('Thiếu thiet-ke.md.');
    if (!existsSync(join(WT, PLAN, 'mau', 'index.html'))) loi.push('Thiếu mau/index.html.');
    const bang = t.split(/\r?\n/).filter((l) => /^\|/.test(l) && /ikram|odoo/i.test(t)).length;
    if (bang < 12) loi.push('Bảng "Khác hai bản cũ" cần ≥ 10 dòng (plan 4.2).');
    const mau = join(WT, PLAN, 'mau', 'index.html');
    if (existsSync(mau) && /https?:\/\/(?!localhost)/.test(readFileSync(mau, 'utf8').replace(/xmlns(:\w+)?="[^"]+"/g, ''))) loi.push('mau/index.html gọi mạng ngoài: phải chạy không mạng.');
  }
  if (st.b === 'H0') {
    const r = sh('node', ['scripts/deploy-demo-2.mjs', '--local'], { env: { ...process.env, CI: '1', CLOUDFLARE_API_TOKEN: 'khong-co', CLOUDFLARE_ACCOUNT_ID: 'khong-co' }, timeout: 180000 });
    const f = join(WT, 'dist', 'server', 'wrangler.demo2.json');
    if (r.status !== 0 || !existsSync(f)) loi.push(`node scripts/deploy-demo-2.mjs --local lỗi (mã ${r.status}): ${(r.stderr || '').slice(0, 400)}`);
    else {
      const c = JSON.parse(readFileSync(f, 'utf8'));
      if (c.name !== 'tong-hop-pos-demo2') loi.push('wrangler.demo2.json: name phải là tong-hop-pos-demo2.');
      if (!JSON.stringify(c.routes ?? []).includes('demo2.tonghopposmegatech.io.vn')) loi.push('wrangler.demo2.json: route phải là demo2.tonghopposmegatech.io.vn.');
      if ((c.r2_buckets ?? []).length) loi.push('wrangler.demo2.json: r2_buckets phải rỗng.');
      if (c.vars?.DEMO_MODE !== '1') loi.push('wrangler.demo2.json: vars.DEMO_MODE phải là "1".');
      // Demo 2 chỉ dùng số ảo: D1 riêng, không nối web nhân sự, không khóa Pancake thật (Claude thêm 16/10).
      const d1 = c.d1_databases ?? [];
      if (!d1.length || d1.some((d) => d.database_name !== 'tong-hop-pos-demo2')) loi.push('wrangler.demo2.json: d1_databases chỉ được có D1 riêng tên tong-hop-pos-demo2 (không dùng D1 của web thật hay demo cũ).');
      if ((c.services ?? []).length) loi.push('wrangler.demo2.json: services phải rỗng (không nối web nhân sự).');
      if (c.vars && 'PANCAKE_POS_API_KEY' in c.vars && c.vars.PANCAKE_POS_API_KEY !== 'demo') loi.push('wrangler.demo2.json: PANCAKE_POS_API_KEY chỉ được là "demo".');
    }
    const ds2 = existsSync(join(WT, 'scripts/deploy-demo-2.mjs')) ? readFileSync(join(WT, 'scripts/deploy-demo-2.mjs'), 'utf8') : '';
    if (/d1\s+(export|backup|execute)/i.test(ds2)) loi.push('scripts/deploy-demo-2.mjs không được export / backup / execute D1 (không chép dữ liệu).');
    if (/['"`]tong-hop-pos(-demo)?['"`]/.test(ds2)) loi.push('scripts/deploy-demo-2.mjs không được nhắc tới Worker / D1 tong-hop-pos hay tong-hop-pos-demo (chỉ tong-hop-pos-demo2).');
    if (/--keep-vars|secret\s+put/i.test(ds2)) loi.push('scripts/deploy-demo-2.mjs không dùng --keep-vars hay secret put: demo 2 không có bí mật.');
    const y = existsSync(join(WT, '.github/workflows/deploy-demo-2.yml')) ? readFileSync(join(WT, '.github/workflows/deploy-demo-2.yml'), 'utf8') : '';
    const nhanh = y.split(/\r?\n/).filter((l) => /^\s*branches:/.test(l)).join(' ');
    if (!/branches:\s*\[\s*demo-2\s*\]/.test(nhanh) || /project-thread-3ujeoc|\bmain\b/.test(nhanh)) loi.push('deploy-demo-2.yml phải chỉ chạy khi đẩy nhánh demo-2 (không main, không nhánh demo cũ).');
  }
  return loi;
}
function kiem(st) {
  const loi = [];
  git('add', '-A');
  const ds = git('diff', '--cached', '--name-only').stdout.split(/\r?\n/).filter(Boolean);
  if (!ds.length) return [`Chưa có file nào thay đổi cho bước ${st.b}.`];
  const ngoai = ds.filter((f) => !st.pham.test(f));
  if (ngoai.length) {
    loi.push(`File ngoài danh sách của bước ${st.b} (đã trả về như cũ): ${ngoai.join(', ')}. Không sửa các file này.`);
    for (const f of ngoai) {
      git('reset', '-q', 'HEAD', '--', f);
      if (git('cat-file', '-e', `HEAD:${f}`).status === 0) git('checkout', '-q', 'HEAD', '--', f);
      else rmSync(f, { force: true, recursive: true });
    }
    git('add', '-A');
  }
  let file = '';
  const nhay = new Set();
  for (const l of git('diff', '--cached', '-U0').stdout.split(/\r?\n/)) {
    if (l.startsWith('+++ ')) { file = l.slice(6); continue; }
    if (l.startsWith('+') && NHAY.test(l) && !NHAY_DUOC.test(l)) nhay.add(file);
  }
  if (nhay.size) loi.push(`Dòng thêm mới có dạng SĐT / email / token (repo công khai), ở: ${[...nhay].join(', ')}. Dùng SĐT giả dạng 0900000001.`);
  const tt = join(V, `${st.b}-tomtat.md`);
  if (!existsSync(tt) || !readFileSync(tt, 'utf8').includes('# Tóm tắt')) loi.push('Thiếu tóm tắt theo mẫu CODEX.md mục 8.');
  if (!st.doc) {
    for (const c of ['typecheck', 'test', 'build']) {
      const r = sh('pnpm', [c]);
      writeFileSync(join(V, `${st.b}-${c}.log`), `${r.stdout}\n${r.stderr}`);
      if (r.status !== 0) {
        const dong = `${r.stdout}\n${r.stderr}`.split(/\r?\n/).filter((x) => /error TS|^not ok|# fail|Error|✖|failed/i.test(x)).slice(0, 20);
        loi.push(`pnpm ${c} lỗi (mã ${r.status}):\n${dong.join('\n')}`);
      }
    }
    const n = soLoiLint();
    if (n > LINT_GOC) loi.push(`pnpm lint có ${n} lỗi, gốc có ${LINT_GOC}: sửa lỗi mới (chạy pnpm lint để xem).`);
  }
  if (!loi.length) loi.push(...kiemRieng(st));
  return loi;
}

function loiGiao(st, them = '') {
  return [
    `Repo phailamsao0012/tong-hop-pos. Em đang ở worktree ${WT}, nhánh làm việc ${DAY}.`,
    `Đọc ${PLAN}/CODEX.md, rồi ${PLAN}/plan.md. Chỉ làm bước **${st.b}** ở mục 5 của plan, không làm bước khác.`,
    st.b === 'R1' ? `Tài liệu kênh ở ${KENH} (tieu-su.json, bai.json, anh/, trang-*.png, tham-khao/). Một số ảnh đã đính kèm; mở và xem hết các ảnh còn lại trong ${join(KENH, 'anh')} bằng công cụ xem ảnh.` : '',
    st.b === 'R2' && existsSync(join(KENH, 'phong')) ? `Phông đã tải sẵn ở ${join(KENH, 'phong')}: chép sang ${PLAN}/mau/fonts/ nếu dùng.` : '',
    st.b === 'G1' && existsSync(join(KENH, 'phong')) ? `Phông đã tải sẵn ở ${join(KENH, 'phong')}: chép sang public/fonts/ nếu thiết kế dùng.` : '',
    /^[GS]/.test(st.b) ? `Bám theo ${PLAN}/thiet-ke.md và ảnh mẫu ${PLAN}/mau/anh/. Không đổi số, API, quyền. Giữ điểm bám của scripts/kiem-trinh-duyet.cjs.` : '',
    'Chạy liền một mạch: các bước trước đã commit trong nhánh này; không ai trả lời câu hỏi giữa chừng.',
    `Tin nhắn cuối là tóm tắt theo mẫu CODEX.md mục 8, tiêu đề '# Tóm tắt ${st.b}'.`,
    existsSync(join(V, 'ghi-them.md')) ? `\nGhi thêm của Claude:\n${readFileSync(join(V, 'ghi-them.md'), 'utf8')}` : '',
    them ? `\n${them}` : '',
  ].filter(Boolean).join('\n');
}

let khongDay = false;
function day(nhanh) {
  for (const t of [2, 4, 8, 16, 0]) {
    if (git('push', '-q', 'origin', `HEAD:refs/heads/${nhanh}`).status === 0) return true;
    if (t) spawnSync(WIN ? 'timeout' : 'sleep', WIN ? ['/t', String(t), '/nobreak'] : [String(t)], { shell: WIN, stdio: 'ignore' });
  }
  return false;
}
function ketThuc(xongHet) {
  const kq = `${PLAN}/ket-qua.md`;
  const parts = [`# Kết quả chạy liền một mạch: ${TEN}`, '', 'Codex làm từng bước, máy kiểm sau mỗi bước. Claude kiểm một lần sau khi đọc file này và diff.', '', '## Tiến độ', '```',
    readFileSync(TD, 'utf8').replaceAll(homedir(), '~'), '```'];
  for (const st of BUOC) {
    const f = join(V, `${st.b}-tomtat.md`);
    if (existsSync(f)) parts.push('', '---', '', readFileSync(f, 'utf8').replace(/^#/gm, '##').replaceAll(homedir(), '~'));
  }
  const body = parts.join('\n');
  if (body.split(/\r?\n/).some((l) => NHAY.test(l) && !NHAY_DUOC.test(l))) ghi('ket-qua.md có dòng dạng SĐT / email / token: không commit, để ở máy', false);
  else { writeFileSync(kq, body); git('add', '--', kq); git('commit', '-q', '-m', `${TEN}: tóm tắt của Codex các bước (Claude kiểm cuối)`, '--', kq); }
  if (khongDay) { ghi('không đẩy (Codex đụng thư mục khoá / bí mật / web thật)'); return; }
  const sha = git('rev-parse', '--short', 'HEAD').stdout.trim();
  if (!day(DAY)) { ghi(`⚠️ đẩy lên ${DAY} lỗi, commit vẫn ở máy`); return; }
  ghi(`📤 đã đẩy lên ${DAY} (${sha})`);
  if (!xongHet) return;
  if (day(DEMO)) ghi(`🚀 đã đẩy ${sha} lên ${DEMO}: GitHub tự deploy demo2.tonghopposmegatech.io.vn. Claude kiểm một lần.`);
  else ghi(`⚠️ đẩy lên ${DEMO} lỗi, commit đã ở ${DAY}`);
}
function dung(st, ly) { ghi(`⛔ DỪNG ở ${st.b}: ${ly}`); writeFileSync(join(V, 'DUNG.md'), `# Dừng ở bước ${st.b}\n\n${ly}\n`); ketThuc(false); thoat(1); }

let dangLam = 'R0', xong = 0;
setInterval(() => tele(`⏱ 20 phút: đã xong ${xong}/${BUOC.length} bước, đang ${dangLam}, tài khoản ${tk + 1}`), 20 * 60000).unref();

r0();
for (const st of BUOC) {
  const daCo = git('log', '--format=%s', '-n', '80').stdout.split(/\r?\n/).some((s) => s.startsWith(`${TEN} ${st.b}: `));
  if (daCo) { xong++; ghi(`${st.b} đã xong từ trước, bỏ qua`, false); continue; }
  const tieuDe = (readFileSync(`${PLAN}/plan.md`, 'utf8').match(new RegExp(`^\\*\\*${st.b}\\. (.*)\\*\\*$`, 'm')) ?? [])[1];
  if (!tieuDe) dung(st, `không thấy bước ${st.b} trong ${PLAN}/plan.md`);
  dangLam = `${st.b} (${tieuDe})`;
  ghi(`bước ${xong + 1}/${BUOC.length} ${st.b} bắt đầu: ${tieuDe}`);
  const tt = join(V, `${st.b}-tomtat.md`);
  rmSync(tt, { force: true });
  writeFileSync(join(V, `${st.b}-giao.md`), loiGiao(st));
  const anh = st.b === 'R1' ? anhR1() : [];
  if (!(await chayCodex(join(V, `${st.b}-giao.md`), tt, `${st.b}-lan0`, anh))) dung(st, `Codex không chạy được (xem ${LAN}.err)`);
  for (let vong = 1; ; vong++) {
    if (lenhDaChay().some((c) => CAM.test(c))) { khongDay = true; dung(st, `Codex chạy lệnh đụng thư mục khoá / bí mật / web thật (xem ${LAN}.jsonl). Không đẩy gì.`); }
    const la = lenhDaChay().filter((c) => LA.test(c));
    if (la.length) appendFileSync(join(V, 'canh-bao.txt'), la.map((c) => `${st.b}: lệnh lạ: ${c.slice(0, 160)}`).join('\n') + '\n');
    const loi = kiem(st);
    if (!loi.length) break;
    writeFileSync(join(V, `${st.b}-loi-vong${vong}.txt`), loi.join('\n'));
    if (vong > 3) dung(st, `hết 3 vòng sửa mà máy kiểm vẫn báo lỗi (xem ${V}/${st.b}-loi-vong${vong}.txt)`);
    ghi(`🔁 ${st.b}: máy kiểm báo lỗi, Codex sửa lần ${vong}/3`);
    writeFileSync(join(V, `${st.b}-giao-vong${vong}.md`), loiGiao(st, `Đây là vòng sửa ${vong}/3 của bước ${st.b}. Worktree đang có phần em làm ở lần trước (chưa commit: xem git status, git diff). Máy kiểm báo:\n${loi.join('\n')}\nChỉ sửa đúng các lỗi này trong phạm vi bước ${st.b}, rồi viết lại tóm tắt đủ mẫu.`));
    if (!(await chayCodex(join(V, `${st.b}-giao-vong${vong}.md`), tt, `${st.b}-vong${vong}`, anh))) dung(st, `Codex không chạy được ở vòng sửa ${vong}`);
  }
  git('commit', '-q', '-m', `${TEN} ${st.b}: ${tieuDe} (Codex viết, chạy liền một mạch; Claude kiểm cuối)`);
  xong++;
  ghi(`✅ bước ${xong}/${BUOC.length} ${st.b} xong (${git('rev-parse', '--short', 'HEAD').stdout.trim()})`);
  if (st.b === 'R1') { await taiPhong(); day(DAY); }
  if (st.b === 'R2') { chupMau(); day(DAY); }
}
ghi(`🏁 xong cả ${BUOC.length} bước`);
ketThuc(true);
thoat(0);
