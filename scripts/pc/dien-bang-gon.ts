// CHỈ CHẠY TRÊN PC. Điền lịch sử bảng gọn Marketing (lib/reports/mkt-slim-fill.ts, plan Marketing kỳ dài nhanh bước 2) trên một file DB.
// Mặc định từ chối DB thật C:\thp\db\thp.sqlite: thử trên BẢN CHÉP trước; DB thật phải thêm --db-that (chỉ khi Đầu não ra lệnh).
// In tiến độ từng (POS, tháng): khớp / lệch, số giây, tên chỉ số lệch. KHÔNG in số liệu kinh doanh hay tên người.
// Chạy:
//   npx tsx --import ./tests/support/register.mjs scripts/pc/dien-bang-gon.ts <db> [--phut 60] [--thang 999] [--nghi 2]
//       [--dung-thang-giay 120] [--do-login http://127.0.0.1:8787/login] [--dung-login-giay 3] [--doi-chieu-het] [--db-that]
//   --phut: dừng sau số phút này. --thang: tối đa số tháng điền lượt này. --nghi: nghỉ (giây) giữa các tháng.
//   --dung-thang-giay: một tháng lâu hơn mức này thì dừng (máy đang nặng). --do-login: đo trang này trước mỗi tháng, chậm hơn
//   --dung-login-giay thì dừng. --doi-chieu-het: sau khi đủ, đối chiếu lại mọi tháng một vòng.
import { openD1 } from '../../pc/d1';
import { ensureSlimSchema } from '../../lib/reports/mkt-slim';
import { readFillState, runSlimFill, slimReady, resetSlimReadyMemo } from '../../lib/reports/mkt-slim-fill';

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith('--') && !/^\d/.test(a) && !/^https?:/.test(a));
const opt = (name: string, def: number) => { const i = args.indexOf(name); return i >= 0 ? Number(args[i + 1]) : def; };
const str = (name: string) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : null; };
if (!file) { console.error('Thiếu đường dẫn DB.'); process.exit(2); }
if (/[\\/]thp[\\/]db[\\/]thp\.sqlite$/i.test(file) && !args.includes('--db-that')) {
  console.error('Đây là DB thật. Thử trên bản chép trước; muốn chạy DB thật thì thêm --db-that (chỉ khi có lệnh).');
  process.exit(2);
}
const minutes = opt('--phut', 60), maxMonths = opt('--thang', 999), pauseS = opt('--nghi', 2), monthStopS = opt('--dung-thang-giay', 120);
const loginUrl = str('--do-login'), loginStopS = opt('--dung-login-giay', 3);
const deadline = Date.now() + minutes * 60000;

const db = await openD1(file, { readers: 1 });
await ensureSlimSchema(db);
let stopReason: string | null = null;
const loginSlow = async () => {
  if (!loginUrl) return false;
  const t0 = Date.now();
  try { await fetch(loginUrl, { signal: AbortSignal.timeout(15000) }); } catch { /* lỗi mạng = chậm */ }
  const s = (Date.now() - t0) / 1000;
  if (s > loginStopS) { stopReason = `trang đo chậm ${s.toFixed(1)}s`; return true; }
  return false;
};

const t0 = Date.now();
let months = 0, bad = 0;
while (!stopReason && Date.now() < deadline && months < maxMonths) {
  // Mỗi vòng một tháng để đo máy giữa các tháng.
  const r = await runSlimFill(db, { deadline, maxMonths: 1, stop: loginSlow });
  for (const st of r.steps) {
    months++;
    if (st.result === 'bad') bad++;
    console.log(`${new Date().toLocaleTimeString('vi-VN')} ${st.kind === 'fill' ? 'điền' : 'đối chiếu'} ${st.key}: ${st.result === 'ok' ? 'khớp' : `LỆCH (${st.diff.join(',')})`} ${(st.ms / 1000).toFixed(1)}s`);
    if (st.ms / 1000 > monthStopS) stopReason = `một tháng mất ${(st.ms / 1000).toFixed(0)}s > ${monthStopS}s`;
  }
  if (!r.steps.length || !r.pending) break;
  if (pauseS > 0) await new Promise((res) => setTimeout(res, pauseS * 1000));
}
if (!stopReason && args.includes('--doi-chieu-het')) {
  const s = await readFillState(db);
  const r = await runSlimFill(db, { deadline, verifyMonths: s.list.length, pauseMs: pauseS * 1000, stop: loginSlow });
  for (const st of r.steps) console.log(`${st.kind === 'fill' ? 'điền' : 'đối chiếu'} ${st.key}: ${st.result === 'ok' ? 'khớp' : `LỆCH (${st.diff.join(',')})`} ${(st.ms / 1000).toFixed(1)}s`);
}
const s = await readFillState(db);
resetSlimReadyMemo();
const pending = s.list.filter((k) => s.months[k] !== 'ok').length;
console.log(`Xong lượt: ${months} tháng trong ${Math.round((Date.now() - t0) / 1000)}s, lệch ${bad}. Còn ${pending}/${s.list.length} tháng chưa khớp. Mốc đã điền đủ: ${await slimReady(db) ? 'CÓ' : 'chưa'}.${stopReason ? ` Dừng vì ${stopReason}.` : ''}`);
process.exit(0);
