// Sao lưu dữ liệu web tổng trên PC mỗi đêm (plan docs/plans/2026-10-31-chuyen-sang-pc, bước B4).
// 1. Chụp file SQLite của D1 bằng VACUUM INTO (đọc trong lúc web vẫn chạy), kiểm nhanh bản chụp.
// 2. Nén gzip + mã hoá AES-256-GCM, khoá AES bọc bằng khoá công khai suy từ C:\thp\bi-mat\khoa-rieng.pem.
//    Cùng định dạng .bin/.key với ma-hoa.mjs, nên bản sao lưu đẩy thẳng lên Google Drive được.
// 3. Giữ 7 bản ngày gần nhất + 4 bản Chủ nhật gần nhất, xoá phần còn lại.
// 4. Chủ nhật (hoặc khi gọi kèm --thu): giải mã bản vừa tạo ra file tạm, đếm lại số dòng, so với lúc chụp.
// 5. Có rclone (C:\thp\rclone\rclone.exe + C:\thp\bi-mat\rclone.conf, do o-pc.ps1 cài) thì đồng bộ thư mục sao lưu lên
//    Google Drive, thư mục "THP sao luu": bản nào xoá ở PC cũng xoá trên Drive. Lỗi thì ghi sao-luu-loi.txt để canh-may.mjs báo.
// Chỉ in số đếm và kích thước, không in dữ liệu.
import { createCipheriv, createDecipheriv, createPublicKey, privateDecrypt, publicEncrypt, randomBytes, constants } from 'node:crypto';
import { createReadStream, createWriteStream, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync, appendFileSync, existsSync } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { createGunzip, createGzip } from 'node:zlib';
import { DatabaseSync } from 'node:sqlite';
import { spawnSync } from 'node:child_process';

const args = process.argv.slice(2);
const flag = (name, def) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : def; };
const dataDir = flag('data', 'C:\\thp\\data');
const outDir = flag('ra', 'C:\\thp\\sao-luu');
const privPath = flag('khoa', 'C:\\thp\\bi-mat\\khoa-rieng.pem');
const logDir = flag('log', 'C:\\thp\\log');
const now = new Date(flag('ngay', new Date().toISOString()));
const test = args.includes('--thu') || now.getDay() === 0;

const day = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const stamp = day(now);
mkdirSync(outDir, { recursive: true }); mkdirSync(logDir, { recursive: true });
const log = (line) => { console.log(line); appendFileSync(`${logDir}/sao-luu-${stamp}.log`, `${new Date().toISOString()} ${line}\n`); };
const fail = (e) => { const msg = e instanceof Error ? e.message : String(e); log(`LỖI: ${msg}`); writeFileSync(`${logDir}/sao-luu-loi.txt`, `${new Date().toISOString()} ${msg}\n`); process.exit(1); };
process.on('uncaughtException', fail);
process.on('unhandledRejection', fail);

const d1Dir = `${dataDir}/v3/d1/miniflare-D1DatabaseObject`;
const files = readdirSync(d1Dir).filter((f) => f.endsWith('.sqlite') && f !== 'metadata.sqlite');
if (files.length !== 1) throw new Error(`Cần đúng 1 file D1 trong ${d1Dir}, đang có ${files.length}`);

// Đếm mọi bảng: dùng để kiểm bản chụp và bản khôi phục thử.
const counts = (db) => Object.fromEntries(db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all()
  .map(({ name }) => [name, db.prepare(`SELECT COUNT(*) AS n FROM "${name.replaceAll('"', '""')}"`).get().n]));
const check = (db) => { const r = db.prepare('PRAGMA quick_check').get(); return Object.values(r)[0]; };

// 1. Chụp
const snap = `${outDir}/dang-chup.sqlite`;
rmSync(snap, { force: true });
const t0 = Date.now();
const src = new DatabaseSync(`${d1Dir}/${files[0]}`);
src.exec('PRAGMA busy_timeout=60000');
src.exec(`VACUUM INTO '${snap.replaceAll("'", "''")}'`);
src.close();
const snapDb = new DatabaseSync(snap, { readOnly: true });
const ok = check(snapDb);
if (ok !== 'ok') { snapDb.close(); throw new Error(`Bản chụp hỏng: ${ok}`); }
const before = counts(snapDb);
snapDb.close();
const total = Object.values(before).reduce((a, b) => a + b, 0);
log(`chụp xong ${(statSync(snap).size / 1e6).toFixed(0)} MB, ${Object.keys(before).length} bảng, ${total} dòng, ${((Date.now() - t0) / 1000).toFixed(0)} giây`);

// 2. Nén + mã hoá
const base = `${outDir}/thp-${stamp}`;
const key = randomBytes(32), iv = randomBytes(12);
const cipher = createCipheriv('aes-256-gcm', key, iv);
await pipeline(createReadStream(snap), createGzip({ level: 6 }), cipher, createWriteStream(`${base}.bin.tmp`));
const pub = createPublicKey(readFileSync(privPath));
writeFileSync(`${base}.key`, publicEncrypt({ key: pub, padding: constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256' }, Buffer.concat([key, iv, cipher.getAuthTag()])));
rmSync(`${base}.bin`, { force: true });
// Đổi tên sau cùng: bản .bin chỉ xuất hiện khi đã ghi đủ.
writeFileSync(`${base}.dem.json`, JSON.stringify(before));
await import('node:fs/promises').then((fs) => fs.rename(`${base}.bin.tmp`, `${base}.bin`));
rmSync(snap, { force: true });
log(`mã hoá xong ${(statSync(`${base}.bin`).size / 1e6).toFixed(0)} MB → ${base}.bin`);

// 3. Xoay vòng: 7 ngày gần nhất + 4 Chủ nhật gần nhất
const dates = [...new Set(readdirSync(outDir).map((f) => /^thp-(\d{4}-\d{2}-\d{2})\.bin$/.exec(f)?.[1]).filter(Boolean))].sort().reverse();
const keep = new Set(dates.slice(0, 7));
for (const d of dates.filter((d) => new Date(`${d}T12:00:00`).getDay() === 0).slice(0, 4)) keep.add(d);
for (const d of dates) if (!keep.has(d)) {
  for (const ext of ['bin', 'key', 'dem.json']) rmSync(`${outDir}/thp-${d}.${ext}`, { force: true });
  log(`xoá bản cũ ${d}`);
}

// 4. Khôi phục thử
if (test) {
  const back = `${outDir}/khoi-phuc-thu.sqlite`;
  rmSync(back, { force: true });
  const secret = privateDecrypt({ key: readFileSync(privPath), padding: constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256' }, readFileSync(`${base}.key`));
  const decipher = createDecipheriv('aes-256-gcm', secret.subarray(0, 32), secret.subarray(32, 44));
  decipher.setAuthTag(secret.subarray(44, 60));
  await pipeline(createReadStream(`${base}.bin`), decipher, createGunzip(), createWriteStream(back));
  const db = new DatabaseSync(back, { readOnly: true });
  const res = check(db), after = counts(db);
  db.close();
  rmSync(back, { force: true });
  const diff = Object.keys(before).filter((t) => before[t] !== after[t]);
  if (res !== 'ok' || diff.length) throw new Error(`Khôi phục thử SAI: kiểm=${res}, ${diff.length} bảng lệch`);
  log(`khôi phục thử đúng: ${Object.keys(after).length} bảng khớp số dòng`);
}

// 5. Đẩy lên Google Drive
const rclone = flag('rclone', 'C:\\thp\\rclone\\rclone.exe'), rcConf = flag('rclone-conf', 'C:\\thp\\bi-mat\\rclone.conf');
if (existsSync(rclone) && existsSync(rcConf)) {
  const r = spawnSync(rclone, ['sync', outDir, 'thpdrive:THP sao luu', '--config', rcConf, '--include', 'thp-*.{bin,key,dem.json}', '--retries', '5', '--stats-one-line', '-q'], { encoding: 'utf8', timeout: 3 * 3600000 });
  if (r.status !== 0) throw new Error(`đẩy Drive lỗi (mã ${r.status ?? r.signal}): ${(r.stderr || '').trim().split('\n').pop()?.slice(0, 150) ?? ''}`);
  log('đã đồng bộ lên Google Drive');
} else log('chưa nối Google Drive, chỉ lưu trên PC');

writeFileSync(`${logDir}/sao-luu-cuoi.txt`, `${new Date().toISOString()} ${stamp} ${total} dòng${test ? ' (đã khôi phục thử)' : ''}\n`);
if (existsSync(`${base}.bin`)) log(`xong, đang giữ ${keep.size} bản`);
