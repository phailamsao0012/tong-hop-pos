import { mkdir, readFile, writeFile, copyFile, appendFile } from 'node:fs/promises';
import { randomBytes, createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const arg = (name) => args.includes(name) ? args[args.indexOf(name) + 1] : undefined;
const date = new Date(Date.now() + 7 * 3600000).toISOString().slice(0,10);
const root = 'C:\thp-ai', work = join(root, 'work');
function validate(value, schema) {
  if (schema.enum && !schema.enum.includes(value)) throw Error('Sai enum');
  if (Array.isArray(schema.type)) { if (value === null && schema.type.includes('null')) return; if (typeof value !== 'number' || !Number.isFinite(value)) throw Error('Sai số'); return; }
  if (schema.type === 'object') {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('Sai object');
    if (schema.required.some((k) => !Object.hasOwn(value,k)) || Object.keys(value).some((k) => !Object.hasOwn(schema.properties,k))) throw Error('Sai trường');
    for (const [key, child] of Object.entries(schema.properties)) validate(value[key],child);
  } else if (schema.type === 'array') {
    if (!Array.isArray(value) || value.length > schema.maxItems || value.length < (schema.minItems ?? 0)) throw Error('Sai mảng');
    value.forEach((v) => validate(v,schema.items));
  } else if (schema.type === 'string') {
    if (typeof value !== 'string' || !value.trim() || value.length > (schema.maxLength ?? 600) || (schema.pattern && !new RegExp(schema.pattern,'i').test(value))) throw Error('Sai chuỗi');
  } else if (schema.type === 'number' || schema.type === 'integer') {
    if (typeof value !== 'number' || !Number.isFinite(value) || (schema.type === 'integer' && !Number.isInteger(value)) || value < (schema.minimum ?? -Infinity)) throw Error('Sai số');
  }
}
const schema = JSON.parse(await readFile(join(here,'insight.schema.json'),'utf8'));
if (args.includes('--dry-run')) {
  const pack = JSON.parse(await readFile(resolve(arg('--pack')),'utf8'));
  if (pack.version !== 1 || !Array.isArray(pack.rows) || JSON.stringify(pack).length > 1000000) throw Error('Gói không hợp lệ');
  const fixture = args.includes('--insight') ? JSON.parse(await readFile(resolve(arg('--insight')),'utf8')) : { date:pack.date, model:'dry-run', summary:'Chưa đủ số để khuyến nghị.', items:[], hiring:{ sale:{have:0,need:0,why:'Chưa đủ số'}, cskh:{have:0,need:0,why:'Chưa đủ số'} } };
  validate(fixture,schema);
  console.log('Dry-run: gói và schema hợp lệ; không gọi mạng hay Codex.');
} else {
  const base = new URL(arg('--url'));
  if (base.protocol !== 'https:' || base.username || base.password) throw Error('Cần URL HTTPS');
  await Promise.all(['data','work','log'].map((p) => mkdir(join(root,p),{recursive:true})));
  const log = async (s) => appendFile(join(root,'log',`${date}.txt`),`${new Date().toISOString()} ${s}\n`);
  let token;
  try { token = (await readFile(join(root,'token'),'utf8')).trim(); }
  catch (e) { if (e.code !== 'ENOENT') throw e; token = randomBytes(32).toString('hex'); await writeFile(join(root,'token'),token,{flag:'wx',mode:0o600}); }
  if (!/^[a-f0-9]{64}$/.test(token)) throw Error('Khóa máy sai định dạng');
  const call = async (path, init={}) => fetch(new URL(path,base), { ...init, signal:AbortSignal.timeout(60000), headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`, ...init.headers} });
  if (args.includes('--pair')) {
    const r = await call('/api/ai/pair',{method:'POST',body:JSON.stringify({device:'PC',tokenHash:createHash('sha256').update(token).digest('hex')})});
    if (!r.ok) throw Error(`Ghép máy HTTP ${r.status}`);
    const p=await r.json(); console.log(`Mã đối chiếu: ${p.code}. Chủ hệ thống duyệt trong Cài đặt.`);
  } else {
    const r=await call(`/api/ai/pack?date=${date}`);
    if (!r.ok) throw Error(`Tải gói HTTP ${r.status}`);
    const raw=await r.text(); if (Buffer.byteLength(raw)>1000000) throw Error('Gói quá lớn');
    const pack=JSON.parse(raw); if (pack.date!==date || pack.version!==1) throw Error('Gói sai ngày hoặc version');
    await writeFile(join(root,'data',`${date}.json`),raw);
    await writeFile(join(work,'pack.json'),raw);
    await copyFile(join(here,'insight.schema.json'),join(work,'insight.schema.json'));
    const prompt=await readFile(join(here,'prompt.md'),'utf8');
    let done=false;
    // Hai runner phải do thread PC cung cấp. Không dò hay sửa hồ sơ đăng nhập.
    for (const runner of [arg('--tk1'),arg('--tk2')].filter((v) => v && !v.startsWith('--'))) {
      const result=spawnSync(runner,['exec','--skip-git-repo-check','--sandbox','workspace-write','--ephemeral','-c','sandbox_workspace_write.network_access=false','--output-schema',join(work,'insight.schema.json'),'-o',join(work,'insight.json'),'-'],{cwd:work,input:prompt,encoding:'utf8',timeout:30*60000,stdio:['pipe','pipe','pipe'],shell:false});
      if (result.status!==0) { await log('Runner không hoàn tất; thử tài khoản tiếp theo.'); continue; }
      const value=JSON.parse(await readFile(join(work,'insight.json'),'utf8')); validate(value,schema);
      if (value.date!==date) throw Error('Kết quả sai ngày');
      const uploaded=await call('/api/ai/insights',{method:'POST',body:JSON.stringify(value)});
      if (!uploaded.ok) throw Error(`Gửi kết quả HTTP ${uploaded.status}`);
      await log('Đã gửi phân tích.'); done=true; break;
    }
    if (!done) { await log('Chưa có phân tích; Task Scheduler thử lại sau 2 giờ, dừng lúc 12h.'); process.exitCode=2; }
  }
}
