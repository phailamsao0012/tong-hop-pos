// Chạy thử bot đặt KPI trên DB THỬ (C:\thp\db-thu, bản sao để thử) và in đoạn chat ra JSON. Không gửi Zalo, không đụng DB thật.
// Chạy: npx tsx --import ./tests/support/register.mjs tests/support/chat-thu.ts <file ra>
import { DatabaseSync } from 'node:sqlite';
import { writeFileSync } from 'node:fs';
import { env } from 'cloudflare:workers';
import { d1 } from './d1-sqlite';
import { bossKpiCommand } from '../../lib/zalo/kpi-bot';

const raw = new DatabaseSync('C:\\thp\\db-thu\\thp.sqlite');
const db = d1(raw);
Object.assign(env as object, { DB: db });
const out: { from: 'sep' | 'bot'; text: string }[] = [];
const owner = raw.prepare("SELECT id FROM users WHERE role='owner' AND disabled=0 LIMIT 1").get() as { id: string };
let clock = Date.now();
const say = async (text: string) => {
  clock += 1000;
  out.push({ from: 'sep', text });
  const r = (await bossKpiCommand(db, { name: 'Thử', user_id: owner.id }, 'chat-thu', text, clock)) ?? '(bot trả lời như cũ)';
  out.push({ from: 'bot', text: r });
  return r;
};
// 1) Hỏi đáp: Sale → team 1 → từng người → doanh thu → theo tháng → người đầu 300, còn lại "bỏ" → OK.
for (const t of ['set kpi', '2', '1', '1', '1', '2']) await say(t);
let r = await say('350');
while (/· \d+\/\d+:/.test(r)) r = await say('bỏ');
await say('OK');
// 2) Gõ nhầm 3000 thay 300 → bot hỏi lại "anh chắc chưa" → HỦY.
r = await say('kpi doanh thu sale 3000');
if (/⚠️/.test(r)) { await say('OK'); }
await say('HỦY');
// 3) Hoàn tác lần đổi ở bước 1.
await say('hoàn tác kpi');
await say('OK');
writeFileSync(process.argv[2], JSON.stringify(out, null, 1));
console.log('xong', out.length, 'tin');
