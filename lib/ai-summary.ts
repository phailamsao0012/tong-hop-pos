// Tóm tắt sáng bằng AI (kế hoạch quản trị, giai đoạn 6b · 26/09/2026): Cloudflare Workers AI (gói miễn phí 10.000 neurons/ngày,
// Cloudflare không dùng dữ liệu để huấn luyện). Chỉ gửi số đã tổng hợp (không SĐT, không tên khách); mỗi ngày một lần sau 7h30 giờ VN,
// chạy từ Cron Trigger, lưu ở app_settings (ai_summary:YYYY-MM-DD) để màn Điều hành đọc.
import { env } from 'cloudflare:workers';
import { overviewReport } from '@/lib/overview-report';
import { POS } from '@/lib/report-model';
import { addDays, todayVn, VN_OFFSET_HOURS } from '@/lib/report-time';

export const AI_MODEL = '@cf/meta/llama-3.3-70b-instruct-fp8-fast';
export type AiSummary = { date: string; status: 'running' | 'done' | 'error'; text?: string; facts?: Record<string, unknown>; model?: string; at: string; error?: string };
const key = (date: string) => `ai_summary:${date}`;
const r0 = (n: number | null | undefined) => n === null || n === undefined ? null : Math.round(n);
const pct1 = (n: number | null | undefined) => n === null || n === undefined ? null : Math.round(n * 10) / 10;

async function facts(today: string) {
  const y = addDays(today, -1);
  const month = today.slice(0, 7), mStart = `${month}-01`;
  const prevStart = (() => { const d = new Date(`${mStart}T00:00:00Z`); d.setUTCMonth(d.getUTCMonth() - 1); return d.toISOString().slice(0, 10); })();
  const day = Number(y.slice(8, 10));
  const prevDays = new Date(Date.UTC(Number(prevStart.slice(0, 4)), Number(prevStart.slice(5, 7)), 0)).getUTCDate();
  const prevEnd = addDays(prevStart, Math.min(day, prevDays) - 1); // tháng trước ngắn hơn thì dừng ở ngày cuối tháng trước
  const [yd, mtd, sale, cskh] = await Promise.all([
    overviewReport({ posIds: [], start: y, end: y, compare: 'previous' }),
    y >= mStart ? overviewReport({ posIds: [], start: mStart, end: y, compare: { start: prevStart, end: prevEnd } }) : null,
    y >= mStart ? overviewReport({ posIds: [], start: mStart, end: y, team: 'sale' }) : null,
    y >= mStart ? overviewReport({ posIds: [], start: mStart, end: y, team: 'cskh' }) : null,
  ]);
  const t = yd.current.total, p = yd.compare?.total;
  const pos = yd.current.byPos.map((x) => ({ pos: POS.find((q) => q.id === x.posId)?.name ?? x.posId, doanhThu: r0(x.closedNet), donChot: x.closedOrders, homKia: r0(yd.compare?.byPos.find((q) => q.posId === x.posId)?.closedNet) }));
  return {
    ngay: y,
    homQua: { donLen: t.orders, donChot: t.closedOrders, doanhThu: r0(t.closedNet), gttb: r0(t.averageOrder), tyLeChot: pct1(t.closeRate), hoan: t.groups.returned.orders, huy: t.groups.cancelled.orders,
      homKia: p ? { donChot: p.closedOrders, doanhThu: r0(p.closedNet) } : null },
    theoPos: pos,
    tuDauThang: mtd ? { doanhThu: r0(mtd.current.total.closedNet), donChot: mtd.current.total.closedOrders, cungKyThangTruoc: r0(mtd.compare?.total.closedNet),
      sale: r0(sale?.current.total.closedNet), cskh: r0(cskh?.current.total.closedNet), soNgay: day } : null,
  };
}

const SYSTEM = 'Bạn là trợ lý phân tích kinh doanh của MEGATECH (bán thuốc thú y / thủy sản qua 6 cửa hàng Pancake POS; bộ phận Sale, CSKH, Marketing). '
  + 'Viết bản tóm tắt buổi sáng cho giám đốc bằng tiếng Việt: đúng 5 gạch đầu dòng, mỗi dòng một câu ngắn, có số cụ thể, tiền ghi dạng "1,2 tỷ" hoặc "350 triệu". '
  + 'Chỉ dùng số trong dữ liệu, không bịa, không đoán nguyên nhân khi dữ liệu không nói. Dòng cuối là một việc nên làm hôm nay. Không viết câu mở đầu hay kết luận ngoài 5 gạch đầu dòng.';

export async function generateSummary(date = todayVn()): Promise<AiSummary> {
  const now = new Date().toISOString();
  if (!env.AI) return { date, status: 'error', at: now, error: 'Chưa gắn Workers AI (binding AI).' };
  let f: Awaited<ReturnType<typeof facts>> | undefined;
  try {
    f = await facts(date);
    const out = await env.AI.run(AI_MODEL as Parameters<Ai['run']>[0], {
      messages: [{ role: 'system', content: SYSTEM }, { role: 'user', content: `Dữ liệu (JSON, tiền tính bằng đồng):\n${JSON.stringify(f)}` }],
      max_tokens: 500, temperature: 0.2,
    } as never) as { response?: string };
    const raw = String(out?.response ?? '').trim();
    // Chỉ giữ các gạch đầu dòng (bỏ câu mở đầu kiểu "Dưới đây là…"), chuẩn hóa về dấu "•".
    const bullets = raw.split('\n').map((l) => l.trim()).filter((l) => /^([*•-]|\d+[.)])\s+/.test(l)).map((l) => `• ${l.replace(/^([*•-]|\d+[.)])\s+/, '').replace(/\*\*/g, '')}`);
    const text = bullets.length >= 3 ? bullets.join('\n') : raw;
    if (!text) throw new Error('AI không trả lời');
    return { date, status: 'done', text, facts: f, model: AI_MODEL, at: now };
  } catch (e) {
    return { date, status: 'error', facts: f, at: now, error: e instanceof Error ? e.message : 'Lỗi gọi AI' };
  }
}

export async function readSummary(date: string) {
  const row = await env.DB.prepare('SELECT value FROM app_settings WHERE key=?').bind(key(date)).first<{ value: string }>();
  try { return row ? JSON.parse(row.value) as AiSummary : null; } catch { return null; }
}
const write = (s: AiSummary) => env.DB.prepare('INSERT INTO app_settings (key,value,updated_at) VALUES (?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at')
  .bind(key(s.date), JSON.stringify(s), new Date().toISOString()).run();

/** Tạo và lưu tóm tắt của một ngày (dùng khi chủ hệ thống bấm "Tạo lại"). */
export async function refreshSummary(date = todayVn()) { const s = await generateSummary(date); await write(s); return s; }

/** Gọi từ Cron mỗi 5 phút: sau 7h30 giờ VN mà hôm nay chưa có tóm tắt thì tạo một lần (khóa bằng dòng 'running' để không chạy chồng). */
export async function maybeDailySummary() {
  if (!env.AI) return;
  const vn = new Date(Date.now() + VN_OFFSET_HOURS * 3600000);
  if (vn.getUTCHours() * 60 + vn.getUTCMinutes() < 7 * 60 + 30) return;
  const date = todayVn();
  const lock = await env.DB.prepare("INSERT OR IGNORE INTO app_settings (key,value,updated_at) VALUES (?,?,?)")
    .bind(key(date), JSON.stringify({ date, status: 'running', at: new Date().toISOString() } satisfies AiSummary), new Date().toISOString()).run();
  if (!lock.meta.changes) {
    // Đã có: xong / lỗi thì thôi (lỗi chờ chủ hệ thống bấm Tạo lại); 'running' quá 10 phút coi như lượt trước chết giữa chừng.
    const cur = await readSummary(date);
    if (!cur || cur.status !== 'running' || Date.now() - Date.parse(cur.at) < 10 * 60000) return;
  }
  await write(await generateSummary(date));
}
