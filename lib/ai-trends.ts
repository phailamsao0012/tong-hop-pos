// Nhận xét xu hướng mỗi sáng cho từng bộ phận (anh Vũ 08/10/2026: "áp dụng AI để theo dõi xu hướng của công ty về từng bộ phận").
// Cùng cách với tóm tắt sáng (lib/ai-summary.ts): Workers AI, chỉ gửi số đã tổng hợp theo bộ phận / team / sản phẩm (không tên khách, không SĐT),
// mỗi ngày một lần sau 7h30 giờ VN, lưu ở app_settings (ai_trend:YYYY-MM-DD). AI lỗi hoặc chưa gắn thì dùng nhận xét tự tính từ số.
import { env } from 'cloudflare:workers';
import { AI_MODEL } from '@/lib/ai-summary';
import { POS } from '@/lib/report-model';
import { addDays, todayVn, VN_OFFSET_HOURS } from '@/lib/report-time';
import { deptCharts, parseNotes, ruleNotes, trendFacts, type TrendNotes } from '@/lib/trends';
import { trendsReport } from '@/lib/trends-report';

export type TrendNoteSet = {
  date: string; status: 'running' | 'done';
  /** 'ai' = Workers AI viết; 'rule' = tự tính từ số (AI chưa gắn hoặc lỗi). */ source?: 'ai' | 'rule';
  notes?: TrendNotes; weekEnd?: string; model?: string; at: string; error?: string;
  /** Tuần gần nhất so với trung bình 4 tuần trước, theo bộ phận (để tô nhãn tăng / giảm). */ changes?: Record<string, { pct: number | null; dir: 'up' | 'down' | 'flat' }>;
};
const changesOf = (f: ReturnType<typeof trendFacts>) => Object.fromEntries(DEPTS.map((d) => [d, { pct: f.depts[d].c.pct, dir: f.depts[d].c.dir }]));
const key = (date: string) => `ai_trend:${date}`;
const DEPTS = ['sale', 'cskh', 'mkt', 'vandon'] as const;

// Số đã nằm trên biểu đồ (anh Vũ 08/10: "chữ ít ai đọc"), nên AI chỉ viết một câu ngắn nêu điều đáng chú ý.
const SYSTEM = 'Bạn là trợ lý phân tích kinh doanh của MEGATECH (bán thuốc thú y / thủy sản qua 6 cửa hàng Pancake POS). '
  + 'Dữ liệu là số theo tuần (10 tuần, tuần cuối là tuần gần nhất) của 4 bộ phận, kèm team và sản phẩm. Sale, CSKH, MKT tính bằng doanh thu (triệu đồng). '
  + 'Vận đơn KHÔNG có doanh thu vì không bán hàng, chỉ xác nhận và gửi đơn: số của Vận đơn là số đơn gửi đi và % đơn hoàn. '
  + 'Với mỗi bộ phận viết đúng 1 câu tiếng Việt, tối đa 20 chữ, nêu team hoặc sản phẩm đáng chú ý nhất (Vận đơn: nói về đơn hoàn). '
  + 'Không nhắc lại % tăng giảm của cả bộ phận (đã có trên biểu đồ). Chỉ khuyên "nên xem lại" khi số đang giảm (hoặc % hoàn đang tăng); đang tăng thì không khuyên. '
  + 'Chỉ dùng số trong dữ liệu, không bịa, không đoán nguyên nhân. '
  + 'Trả lời đúng một đối tượng JSON, không thêm chữ nào khác: {"sale":["…"],"cskh":["…"],"mkt":["…"],"vandon":["…"]}';

async function build(date: string): Promise<TrendNoteSet> {
  const now = new Date().toISOString();
  const end = addDays(date, -1);
  const report = await trendsReport({ posIds: POS.map((p) => p.id), productSegment: 'all', start: end, end });
  const f = trendFacts(report);
  const rules = ruleNotes(f);
  const changes = changesOf(f);
  if (!env.AI) return { date, status: 'done', source: 'rule', notes: rules, changes, weekEnd: f.weekEnd, at: now, error: 'Chưa gắn Workers AI (binding AI).' };
  // Gửi AI số tròn triệu cho gọn.
  const mil = (v: number) => Math.round(v / 1e5) / 10;
  const slim = (x: { ten: string; w: number[]; thayDoi: number | null; tuanGiamLienTiep: number }) => ({ ten: x.ten, trieuMoiTuan: x.w.map(mil), thayDoiPhanTram: x.thayDoi, tuanGiamLienTiep: x.tuanGiamLienTiep });
  const slimQty = (x: { ten: string; w: number[]; thayDoi: number | null }) => ({ ten: x.ten, soLuongMoiTuan: x.w, thayDoiPhanTram: x.thayDoi });
  const vd = f.depts.vandon;
  const data = {
    tuanCuoiKetThuc: f.weekEnd,
    boPhan: {
      ...Object.fromEntries((['sale', 'cskh', 'mkt'] as const).map((d) => [d, slim(f.depts[d])])),
      vandon: { donDiMoiTuan: vd.w, thayDoiPhanTram: vd.thayDoi, phanTramHoanTuanNay: f.returns.now === null ? null : Math.round(f.returns.now * 10) / 10,
        phanTramHoan4TuanTruoc: f.returns.before === null ? null : Math.round(f.returns.before * 10) / 10, donHoanTuanNay: f.returns.returnedNow },
    },
    sanPhamTheoSoLuong: f.productsQty.map(slimQty),
    team: { sale: f.teams.sale.map(slim), cskh: f.teams.cskh.map(slim), mkt: f.teams.mkt.map(slim) },
    sanPham: f.products.map(slim),
  };
  try {
    const out = await env.AI.run(AI_MODEL as Parameters<Ai['run']>[0], {
      messages: [{ role: 'system', content: SYSTEM }, { role: 'user', content: `Dữ liệu (JSON, tiền tính bằng triệu đồng):\n${JSON.stringify(data)}` }],
      max_tokens: 700, temperature: 0.2,
    } as never) as { response?: string | object };
    const raw = typeof out?.response === 'object' ? JSON.stringify(out.response) : String(out?.response ?? '');
    const { notes, complete } = parseNotes(raw, rules);
    return { date, status: 'done', source: complete ? 'ai' : 'rule', notes, changes, weekEnd: f.weekEnd, model: AI_MODEL, at: now, error: complete ? undefined : 'AI trả lời thiếu, dùng nhận xét tự tính cho phần thiếu.' };
  } catch (e) {
    return { date, status: 'done', source: 'rule', notes: rules, changes, weekEnd: f.weekEnd, at: now, error: e instanceof Error ? e.message : 'Lỗi gọi AI' };
  }
}

export async function readTrendNotes(date: string) {
  const row = await env.DB.prepare('SELECT value FROM app_settings WHERE key=?').bind(key(date)).first<{ value: string }>();
  try { return row ? JSON.parse(row.value) as TrendNoteSet : null; } catch { return null; }
}
const write = (s: TrendNoteSet) => env.DB.prepare('INSERT INTO app_settings (key,value,updated_at) VALUES (?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at')
  .bind(key(s.date), JSON.stringify(s), new Date().toISOString()).run();

/** Nhận xét đang dùng: của hôm nay, chưa có thì hôm qua, chưa có nữa thì tự tính ngay (không lưu). */
/** Nhận xét đang dùng (hôm nay, chưa có thì hôm qua, chưa có nữa thì tự tính) kèm số cho ô biểu đồ từng bộ phận (luôn tính mới). */
export async function currentTrendNotes(): Promise<TrendNoteSet & { charts: ReturnType<typeof deptCharts> }> {
  const today = todayVn();
  const end = addDays(today, -1);
  const f = trendFacts(await trendsReport({ posIds: POS.map((p) => p.id), productSegment: 'all', start: end, end }));
  const charts = deptCharts(f);
  for (const d of [today, addDays(today, -1)]) {
    const s = await readTrendNotes(d);
    if (s?.status === 'done' && s.notes) return { ...s, charts };
  }
  return { date: today, status: 'done', source: 'rule', notes: ruleNotes(f), changes: changesOf(f), weekEnd: f.weekEnd, at: new Date().toISOString(), charts };
}

/** Chủ hệ thống bấm "Viết lại". */
export async function refreshTrendNotes(date = todayVn()) { const s = await build(date); await write(s); return s; }

/** Gọi từ Cron mỗi 5 phút: sau 7h30 giờ VN mà hôm nay chưa có thì viết một lần (khóa bằng dòng 'running'). */
export async function maybeDailyTrendNotes() {
  const vn = new Date(Date.now() + VN_OFFSET_HOURS * 3600000);
  if (vn.getUTCHours() * 60 + vn.getUTCMinutes() < 7 * 60 + 30) return;
  const date = todayVn();
  const lock = await env.DB.prepare('INSERT OR IGNORE INTO app_settings (key,value,updated_at) VALUES (?,?,?)')
    .bind(key(date), JSON.stringify({ date, status: 'running', at: new Date().toISOString() } satisfies TrendNoteSet), new Date().toISOString()).run();
  if (!lock.meta.changes) {
    const cur = await readTrendNotes(date);
    if (!cur || cur.status !== 'running' || Date.now() - Date.parse(cur.at) < 10 * 60000) return;
  }
  await write(await build(date));
}
