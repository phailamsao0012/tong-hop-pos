#!/usr/bin/env node
// Chạy liền một mạch các bước Codex của plan Vận hành đơn + Lãi thật (15/10/2026). Tổ Ý tưởng viết.
// Chạy được trên Windows (PC) và macOS: chỉ cần Node ≥ 22, git, pnpm, codex trong PATH.
//
// Cách chạy (trong worktree đã `pnpm install --frozen-lockfile`, đứng ở gốc worktree):
//   node docs/plans/2026-10-15-van-hanh-don/chay.mjs --tk1 <CODEX_HOME tài khoản 1> --tk2 <CODEX_HOME tài khoản 2> [--tele "<lệnh gửi Telegram>"] [--codex-args "<thêm cờ cho codex exec>"]
//   --tele: lệnh nhận MỘT đối số là nội dung tin (vd: "node C:\\tele-bot\\gui.mjs"). Không có thì chỉ ghi file tiến độ.
//   --codex-args: cờ riêng của máy (vd sandbox Windows). Mặc định không thêm gì.
//
// Mỗi bước: Codex làm (sandbox workspace-write, không hỏi), máy kiểm, sai thì giao lại tối đa 3 vòng, đạt thì commit.
// Hết lượt tài khoản 1 thì sang 2; cả hai hết thì ngủ tới giờ hồi (đọc từ lời báo lỗi, không đọc được thì 30 phút) rồi làm tiếp. Không hỏi ai.
// Xong (hoặc dừng): gom tóm tắt vào ket-qua.md, đẩy lên codex/van-hanh-don-1510. Không bao giờ đẩy vào nhánh demo hay main.
import { spawn, spawnSync } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const arg = (name, def = '') => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : def; };
const TK = [arg('--tk1', join(homedir(), '.codex')), arg('--tk2', join(homedir(), '.codex-2'))];
const TELE = arg('--tele');
const CODEX_ARGS = arg('--codex-args').split(' ').filter(Boolean);
const WIN = process.platform === 'win32';

const WT = spawnSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).stdout.trim();
if (!WT) { console.error('Không ở trong repo git.'); process.exit(2); }
process.chdir(WT);
const PLAN = 'docs/plans/2026-10-15-van-hanh-don';
const PLAN_L = 'docs/plans/2026-10-15-lai-that';
const DAY = 'codex/van-hanh-don-1510';
const TEN = 'Vận hành đơn + Lãi thật 15/10';
const V = join(homedir(), 'codex-viec', 'van-hanh-don-1510');
mkdirSync(V, { recursive: true });
const HOOKS = join(V, 'hooks-rong'); mkdirSync(HOOKS, { recursive: true });

// Bước, file của bước nằm trong plan nào, phạm vi file được sửa.
const BUOC = [
  { b: 'V1', plan: PLAN, pham: /^(drizzle\/00(4[7-9]|5\d)_[a-z0-9_]+\.sql|migrations\/.*\.sql|db\/schema\.ts|lib\/(pancake|ship-fields|sync|stats|scheduler)\.ts|lib\/demo\/|tests\/)/ },
  { b: 'V2', plan: PLAN, pham: /^(lib\/(return-breakdown|access)\.ts|app\/api\/reports\/hoan-theo-hang\/|app\/(return-breakdown-view|dashboard|users-panel)\.tsx|tests\/)/ },
  { b: 'V3', plan: PLAN, pham: /^(lib\/(failed-delivery|audit|audit-labels|access)\.ts|app\/api\/reports\/giao-that-bai\/|app\/(failed-delivery-view|dashboard|users-panel)\.tsx|tests\/)/ },
  { b: 'V4', plan: PLAN, pham: /^(lib\/(order-speed|access)\.ts|app\/api\/reports\/toc-do\/|app\/(order-speed-view|dashboard|users-panel)\.tsx|tests\/)/ },
  { b: 'L1', plan: PLAN_L, pham: /^(drizzle\/00(4[8-9]|5\d)_[a-z0-9_]+\.sql|migrations\/.*\.sql|db\/schema\.ts|lib\/(pancake|order-cost|sync|stats|scheduler)\.ts|lib\/demo\/|tests\/)/ },
  { b: 'L2', plan: PLAN_L, pham: /^(lib\/profit\.ts|app\/api\/reports\/lai-that\/|tests\/)/ },
  { b: 'L3', plan: PLAN_L, pham: /^(app\/profit-view\.tsx|lib\/access\.ts|app\/dashboard\.tsx|tests\/)/ },
  { b: 'V5', plan: PLAN, pham: /^docs\/plans\/2026-10-15-van-hanh-don\/(anh\/|ket-qua-codex\.md)/ },
];

const TD = join(V, 'tien-do.txt');
const gio = () => new Date().toISOString().slice(5, 16).replace('T', ' ') + 'Z';
const tele = (msg) => {
  if (!TELE) return;
  const r = spawnSync(`${TELE} ${JSON.stringify(`🤖 CODEX | Vận hành đơn + Lãi thật: ${msg}`)}`, { shell: true, encoding: 'utf8', timeout: 30000 });
  if (r.status !== 0) appendFileSync(join(V, 'tele-loi.txt'), `${gio()} gửi lỗi (mã ${r.status})\n`);
};
const ghi = (msg, gui = true) => { const l = `${gio()} ${msg}`; console.log(l); appendFileSync(TD, l + '\n'); if (gui) tele(msg); };
const sh = (cmd, args, opts = {}) => spawnSync(cmd, args, { encoding: 'utf8', shell: WIN, maxBuffer: 64 * 1024 * 1024, ...opts });
// git chạy không qua shell: trên Windows shell làm vỡ lời commit có dấu cách (commit hỏng, bước sau trả file về như cũ).
const git = (...a) => sh('git', ['-c', `core.hooksPath=${HOOKS}`, ...a], { shell: false });

const KHOA = join(V, 'dang-chay');
try { mkdirSync(KHOA); } catch { console.error(`Đang chạy rồi (xoá ${KHOA} nếu chắc là không).`); process.exit(2); }
const thoat = (ma) => { try { rmSync(KHOA, { recursive: true }); } catch {} process.exit(ma); };
for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP', 'SIGBREAK']) process.on(sig, () => { ghi(`⏸ script bị dừng (${sig}), chạy lại lệnh cũ là làm tiếp từ bước dở`); thoat(1); });

// Không để file máy đẩy lên.
const EX = join(sh('git', ['rev-parse', '--git-common-dir']).stdout.trim(), 'info', 'exclude');
for (const p of ['.codex-out/', '.dev.vars', '.wrangler/', 'dist/', '.DS_Store', 'Thumbs.db']) {
  const cur = existsSync(EX) ? readFileSync(EX, 'utf8') : '';
  if (!cur.split(/\r?\n/).includes(p)) appendFileSync(EX, `${p}\n`);
}

const NHAY = /\+84 ?\d|(^|[^\dA-Za-z])0\d{9}([^\dA-Za-z]|$)|[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)*\.[a-z]{2,}|eyJ[A-Za-z0-9_-]{10,}|PRIVATE KEY/;
const NHAY_DUOC = /0900\d{6}|090000000\d|chu@demo\.megatech\.vn|noreply@/;
// Lệnh remote / migrate chỉ tính khi thật sự chạy (rg tìm chữ "db:migrate" trong package.json không tính).
const CAM = /\.codex(-2)?([\\/ "']|$)|\.ssh|\.config[\\/]gh|tele-bot|wrangler\b[^;|&\n]*--remote|wrangler deploy|(pnpm|npm|yarn)( run)? db:migrate(?!:local)|printenv|(^|[ ;&|(])gh /i;
const LA = /git (push|commit)|curl |wget |Invoke-WebRequest|npm install|pnpm (add|install)(?! --frozen)|pnpm format|oxfmt/i;

const soLoiLint = () => {
  const r = sh('pnpm', ['lint']);
  const out = `${r.stdout}\n${r.stderr}`;
  const m = out.match(/Found (\d+) warnings? and (\d+) errors?/i);
  return m ? Number(m[2]) : (out.match(/: error /g) ?? []).length;
};
ghi(`bắt đầu ở ${WT}, nhánh ${sh('git', ['rev-parse', '--abbrev-ref', 'HEAD']).stdout.trim()}, ${BUOC.length} bước (bước đã có commit thì bỏ qua)`);
const LINT_GOC = soLoiLint();
ghi(`lỗi lint ở gốc: ${LINT_GOC}`, false);

// ---- Chạy Codex, đổi tài khoản, chờ hồi lượt ----
let tk = 0;
const conHan = [0, 0]; // giờ (ms) tài khoản dùng lại được
const hetLuot = (s) => /usage limit|rate limit|quota|too many requests|\b429\b|hit your limit/i.test(s);
/** Đọc giờ hồi từ lời báo: "try again in 2 hours 13 minutes", "in 45 minutes", "at 6:30 PM", "at 18:30". Không đọc được: 30 phút. */
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
const ngu = (ms) => new Promise((r) => setTimeout(r, ms));
let LAN = '';
async function chayCodex(fileGiao, tomtat, nhan) {
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
    const args = ['exec', '-C', WT, '-s', 'workspace-write', '-c', 'approval_policy=never', ...CODEX_ARGS, '--json', '-o', tomtat, '-'];
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
      // File đã có trong nhánh: trả về bản đã commit; file mới tạo: xoá.
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
  return loi;
}

function loiGiao(st, them = '') {
  return [
    `Repo phailamsao0012/tong-hop-pos. Em đang ở worktree ${WT}, nhánh ${DAY}.`,
    `Đọc ${PLAN}/CODEX.md, rồi ${st.plan}/plan.md${st.plan !== PLAN ? ` (luật chung ở ${PLAN}/plan.md mục 2)` : ''}. Chỉ làm bước **${st.b}** ở mục 5 của plan, không làm bước khác.`,
    'Chạy liền một mạch: các bước trước đã commit trong nhánh này; không ai trả lời câu hỏi giữa chừng.',
    `Tin nhắn cuối là tóm tắt theo mẫu CODEX.md mục 8, tiêu đề '# Tóm tắt ${st.b}'.`,
    existsSync(join(V, 'ghi-them.md')) ? `\nGhi thêm của Tổ Ý tưởng:\n${readFileSync(join(V, 'ghi-them.md'), 'utf8')}` : '',
    them ? `\n${them}` : '',
  ].join('\n');
}

let khongDay = false;
function ketThuc() {
  const kq = `${PLAN}/ket-qua.md`;
  const parts = [`# Kết quả chạy liền một mạch: ${TEN}`, '', 'Codex làm từng bước, máy kiểm sau mỗi bước. Tổ Ý tưởng kiểm một lần sau khi đọc file này và diff.', '', '## Tiến độ', '```',
    readFileSync(TD, 'utf8').replaceAll(homedir(), '~'), '```'];
  for (const st of BUOC) {
    const f = join(V, `${st.b}-tomtat.md`);
    if (existsSync(f)) parts.push('', '---', '', readFileSync(f, 'utf8').replace(/^#/gm, '##').replaceAll(homedir(), '~'));
  }
  const body = parts.join('\n');
  if (body.split(/\r?\n/).some((l) => NHAY.test(l) && !NHAY_DUOC.test(l))) ghi('ket-qua.md có dòng dạng SĐT / email / token: không commit, để ở máy', false);
  else { writeFileSync(kq, body); git('add', '--', kq); git('commit', '-q', '-m', `${TEN}: tóm tắt của Codex các bước (Tổ Ý tưởng kiểm cuối)`, '--', kq); }
  if (khongDay) { ghi('không đẩy (Codex đụng thư mục khoá / bí mật / web thật)'); return; }
  for (const t of [2, 4, 8, 16, 0]) {
    if (git('push', '-q', 'origin', `HEAD:refs/heads/${DAY}`).status === 0) { ghi(`📤 đã đẩy lên ${DAY} (${git('rev-parse', '--short', 'HEAD').stdout.trim()}), Claude kiểm một lần`); return; }
    if (t) spawnSync(WIN ? 'timeout' : 'sleep', WIN ? ['/t', String(t), '/nobreak'] : [String(t)], { shell: WIN, stdio: 'ignore' });
  }
  ghi(`⚠️ đẩy lên ${DAY} lỗi, commit vẫn ở máy (nhánh hiện tại của worktree)`);
}
function dung(st, ly) { ghi(`⛔ DỪNG ở ${st.b}: ${ly}`); writeFileSync(join(V, 'DUNG.md'), `# Dừng ở bước ${st.b}\n\n${ly}\n`); ketThuc(); thoat(1); }

// Nhịp 20 phút (anh Vũ 15/10: còn làm thì 20 phút một tin).
let dangLam = 'chuẩn bị', xong = 0;
setInterval(() => tele(`⏱ 20 phút: đã xong ${xong}/${BUOC.length} bước, đang ${dangLam}, tài khoản ${tk + 1}`), 20 * 60000).unref();

for (const st of BUOC) {
  const daCo = git('log', '--format=%s', '-n', '60').stdout.split(/\r?\n/).some((s) => s.startsWith(`${TEN} ${st.b}: `));
  if (daCo) { xong++; ghi(`${st.b} đã xong từ trước, bỏ qua`, false); continue; }
  const tieuDe = (readFileSync(`${st.plan}/plan.md`, 'utf8').match(new RegExp(`^\\*\\*${st.b}\\. (.*)\\*\\*$`, 'm')) ?? [])[1];
  if (!tieuDe) dung(st, `không thấy bước ${st.b} trong ${st.plan}/plan.md`);
  dangLam = `${st.b} (${tieuDe})`;
  ghi(`bước ${xong + 1}/${BUOC.length} ${st.b} bắt đầu: ${tieuDe}`);
  const tt = join(V, `${st.b}-tomtat.md`);
  rmSync(tt, { force: true });
  writeFileSync(join(V, `${st.b}-giao.md`), loiGiao(st));
  if (!(await chayCodex(join(V, `${st.b}-giao.md`), tt, `${st.b}-lan0`))) dung(st, `Codex không chạy được (xem ${LAN}.err)`);
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
    if (!(await chayCodex(join(V, `${st.b}-giao-vong${vong}.md`), tt, `${st.b}-vong${vong}`))) dung(st, `Codex không chạy được ở vòng sửa ${vong}`);
  }
  git('commit', '-q', '-m', `${TEN} ${st.b}: ${tieuDe} (Codex viết, chạy liền một mạch; Tổ Ý tưởng kiểm cuối)`);
  xong++;
  ghi(`✅ bước ${xong}/${BUOC.length} ${st.b} xong (${git('rev-parse', '--short', 'HEAD').stdout.trim()})`);
}
ghi(`🏁 xong cả ${BUOC.length} bước`);
ketThuc();
thoat(0);
