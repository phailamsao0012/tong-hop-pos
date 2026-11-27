// CHỈ CHẠY TRÊN PC, ban đêm. Tính lại bảng tính sẵn stats_daily_segment theo bộ thẻ mới (plan docs/plans/2026-11-27-the-san-pham-moi, bước 3).
// Từng (POS, tháng), nghỉ giữa các tháng, đo trang /login web thật trước mỗi tháng và dừng khi chậm. Từ chối DB thật C:\thp\db\thp.sqlite
// nếu thiếu --db-that (chỉ chạy DB thật khi có lệnh, sau khi đã sao lưu bảng stats_daily_segment). In tổng doanh thu / đơn từng tháng
// trước và sau (phải bằng nhau) — chỉ in số tổng theo tháng, không tên người.
// Chạy: npx tsx --import ./tests/support/register.mjs scripts/pc/tinh-lai-the.ts <db> [--nghi 2] [--do-login http://127.0.0.1:8787/login]
//        [--dung-login-giay 3] [--db-that]
import { openD1 } from '../../pc/d1';
import { recomputeSegments } from '../../lib/reports/segment-recompute';

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith('--') && !/^\d/.test(a) && !/^https?:/.test(a));
const opt = (name: string, def: number) => { const i = args.indexOf(name); return i >= 0 ? Number(args[i + 1]) : def; };
const str = (name: string) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : null; };
if (!file) { console.error('Thiếu đường dẫn DB.'); process.exit(2); }
if (/[\\/]thp[\\/]db[\\/]thp\.sqlite$/i.test(file) && !args.includes('--db-that')) {
  console.error('Đây là DB thật. Sao lưu bảng stats_daily_segment trước, rồi chạy lại với --db-that (chỉ khi có lệnh).');
  process.exit(2);
}
const pauseS = opt('--nghi', 2), loginUrl = str('--do-login'), loginStopS = opt('--dung-login-giay', 3);
const db = await openD1(file, { readers: 1 });
const sums = async () => (await db.prepare("SELECT substr(day,1,7) AS m, SUM(closed_net) AS net, SUM(closed_orders) AS n FROM stats_daily_segment GROUP BY 1 ORDER BY 1").all<{ m: string; net: number; n: number }>()).results;
let before: { m: string; net: number; n: number }[] = [];
try { before = await sums(); } catch { /* chưa có bảng */ }
let why: string | null = null;
const stop = async () => {
  if (!loginUrl) return false;
  const t0 = Date.now();
  try { await fetch(loginUrl, { signal: AbortSignal.timeout(15000) }); } catch { /* lỗi = chậm */ }
  const s = (Date.now() - t0) / 1000;
  if (s > loginStopS) { why = `trang đo chậm ${s.toFixed(1)}s`; return true; }
  return false;
};
const t0 = Date.now();
const r = await recomputeSegments(db, {
  pauseMs: pauseS * 1000, stop,
  onStep: (s, i, total) => console.log(`${new Date().toLocaleTimeString('vi-VN')} ${i + 1}/${total} ${s.key}: ${(s.ms / 1000).toFixed(1)}s, ${s.writes} dòng ghi`),
});
console.log(`Xong ${r.done}/${r.total} tháng trong ${Math.round((Date.now() - t0) / 1000)}s. Mốc sẵn sàng: ${r.ready ? 'ĐÃ BẬT' : 'chưa'}.${r.stopped ? ` Dừng vì ${why ?? 'yêu cầu'}.` : ''}`);
const after = await sums();
const old = new Map(before.map((x) => [x.m, x]));
let diff = 0;
for (const a of after) {
  const b = old.get(a.m);
  const same = b && Number(b.net) === Number(a.net) && Number(b.n) === Number(a.n);
  if (b && !same) diff++;
  console.log(`  ${a.m}: ${b ? (same ? 'tổng KHỚP' : 'tổng LỆCH') : 'tháng mới'}`);
}
console.log(diff ? `CÓ ${diff} tháng lệch tổng — kiểm lại trước khi dùng.` : 'Tổng doanh thu và đơn chốt từng tháng không đổi.');
await db.close();
process.exit(0);
