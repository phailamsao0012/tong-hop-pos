// Chi phí quảng cáo nhập tay / Excel theo marketer (kế hoạch quản trị, giai đoạn 3c · 26/09/2026).
// Không kéo API quảng cáo (mỗi người một tài khoản): marketer hoặc trưởng team tự nhập chi phí theo ngày, có thể kèm chiến dịch.
// Bảng tự tạo khi cần (một lần mỗi isolate), drizzle/0030_ad_costs.sql ghi lại cùng nội dung.
import { env } from 'cloudflare:workers';
import { NET } from '@/lib/stats';
import { vnRangeUtc } from '@/lib/report-time';

let ready: Promise<void> | null = null;
export function ensureAdCostSchema() {
  ready ??= (async () => {
    await env.DB.prepare(`CREATE TABLE IF NOT EXISTS ad_costs (
      id TEXT PRIMARY KEY, day TEXT NOT NULL, marketer_id TEXT NOT NULL, amount INTEGER NOT NULL, campaign TEXT, note TEXT,
      created_by TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)`).run();
    await env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_ad_costs_day ON ad_costs (day, marketer_id)').run();
  })().catch((e) => { ready = null; throw e; });
  return ready;
}

export type CostInput = { day: string; marketerId: string; amount: number; campaign?: string | null; note?: string | null };
const DAY = /^\d{4}-\d{2}-\d{2}$/;
export function validCost(c: Partial<CostInput>): c is CostInput {
  return !!c && typeof c.day === 'string' && DAY.test(c.day) && typeof c.marketerId === 'string' && !!c.marketerId.trim()
    && typeof c.amount === 'number' && Number.isFinite(c.amount) && c.amount >= 0 && c.amount < 1e12;
}

export async function addCosts(rows: CostInput[], userId: string) {
  await ensureAdCostSchema();
  const now = new Date().toISOString();
  const stmts = rows.map((r) => env.DB.prepare('INSERT INTO ad_costs (id,day,marketer_id,amount,campaign,note,created_by,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)')
    .bind(crypto.randomUUID(), r.day, r.marketerId.trim(), Math.round(r.amount), r.campaign?.trim().slice(0, 120) || null, r.note?.trim().slice(0, 300) || null, userId, now, now));
  for (let i = 0; i < stmts.length; i += 50) await env.DB.batch(stmts.slice(i, i + 50));
  return rows.length;
}

/** Xóa một dòng: người đã nhập dòng đó, chủ hệ thống hoặc giám đốc. Trả false khi không có quyền / không thấy. */
export async function deleteCost(id: string, userId: string, canAll: boolean) {
  await ensureAdCostSchema();
  const r = await env.DB.prepare(`DELETE FROM ad_costs WHERE id=?${canAll ? '' : ' AND created_by=?'}`).bind(...(canAll ? [id] : [id, userId])).run();
  return Number(r.meta.changes ?? 0) > 0;
}

/** ROAS theo marketer: chi phí đã nhập × số (đơn tạo có marketer) và đơn chốt / doanh thu (theo ngày xác nhận lần đầu) cùng kỳ. */
export async function roasReport(opts: { posIds: string[]; start: string; end: string }) {
  await ensureAdCostSchema();
  const db = env.DB;
  const { startUtc, endUtc } = vnRangeUtc(opts.start, opts.end);
  const ph = opts.posIds.map(() => '?').join(',');
  const mk = "NULLIF(TRIM(marketer_id),'')";
  const [costs, entries, leads, closed, names, daily] = await db.batch([
    db.prepare('SELECT marketer_id, SUM(amount) AS amount, COUNT(*) AS n FROM ad_costs WHERE day>=? AND day<=? GROUP BY marketer_id').bind(opts.start, opts.end),
    db.prepare('SELECT id, day, marketer_id, amount, campaign, note, created_at FROM ad_costs WHERE day>=? AND day<=? ORDER BY day DESC, created_at DESC LIMIT 500').bind(opts.start, opts.end),
    db.prepare(`SELECT ${mk} AS marketer_id, COUNT(*) AS orders, COUNT(DISTINCT phone) AS phones, SUM(status_code NOT IN (0,17,6,7)) AS closed_leads FROM raw_pos_orders WHERE pos_id IN (${ph}) AND created_at>=? AND created_at<? AND status_code<>7 AND ${mk} IS NOT NULL GROUP BY 1`).bind(...opts.posIds, startUtc, endUtc),
    db.prepare(`SELECT ${mk} AS marketer_id, COUNT(*) AS closed, COALESCE(SUM(${NET}),0) AS net, SUM(status_code IN (4,5,15)) AS returned FROM raw_pos_orders WHERE pos_id IN (${ph}) AND first_confirmed_at>=? AND first_confirmed_at<? AND status_code NOT IN (0,17,6,7) AND ${mk} IS NOT NULL GROUP BY 1`).bind(...opts.posIds, startUtc, endUtc),
    db.prepare("SELECT user_id, MAX(name) AS name, MAX(department) AS department FROM pos_users WHERE name<>'' GROUP BY user_id"),
    db.prepare('SELECT day, SUM(amount) AS amount FROM ad_costs WHERE day>=? AND day<=? GROUP BY day ORDER BY day').bind(opts.start, opts.end),
  ]);
  const nameRows = names.results as { user_id: string; name: string; department: string | null }[];
  const nameMap = new Map(nameRows.map((r) => [r.user_id, r]));
  const who = (id: string) => nameMap.get(id)?.name ?? `NV ${id.slice(0, 8)}`;
  const m = new Map<string, { marketerId: string; cost: number; entries: number; orders: number; phones: number; closedLeads: number; closed: number; net: number; returned: number }>();
  const get = (id: string) => { let x = m.get(id); if (!x) { x = { marketerId: id, cost: 0, entries: 0, orders: 0, phones: 0, closedLeads: 0, closed: 0, net: 0, returned: 0 }; m.set(id, x); } return x; };
  for (const r of costs.results as { marketer_id: string; amount: number; n: number }[]) { const x = get(r.marketer_id); x.cost = Number(r.amount); x.entries = Number(r.n); }
  for (const r of leads.results as { marketer_id: string; orders: number; phones: number; closed_leads: number }[]) { const x = get(r.marketer_id); x.orders = Number(r.orders); x.phones = Number(r.phones); x.closedLeads = Number(r.closed_leads ?? 0); }
  for (const r of closed.results as { marketer_id: string; closed: number; net: number; returned: number }[]) { const x = get(r.marketer_id); x.closed = Number(r.closed); x.net = Number(r.net); x.returned = Number(r.returned); }
  const rows = [...m.values()].map((x) => ({
    ...x, name: who(x.marketerId), department: nameMap.get(x.marketerId)?.department ?? null,
    roas: x.cost ? x.net / x.cost : null, costPerLead: x.phones && x.cost ? x.cost / x.phones : null, costPerClosed: x.closed && x.cost ? x.cost / x.closed : null,
    // Chốt số = đơn tạo trong kỳ nay đã chốt ÷ đơn tạo trong kỳ (không vượt 100%).
    closeRate: x.orders ? x.closedLeads / x.orders * 100 : null, returnRate: x.closed ? x.returned / x.closed * 100 : null,
  })).sort((a, b) => b.net - a.net);
  const sum = (k: 'cost' | 'orders' | 'phones' | 'closed' | 'net', only = false) => rows.filter((r) => !only || r.cost > 0).reduce((t, r) => t + r[k], 0);
  // ROAS và chi phí / số, / đơn chỉ tính trên marketer đã nhập chi phí, để không chia doanh thu của người chưa nhập cho chi phí của người khác.
  const covered = { net: sum('net', true), phones: sum('phones', true), closed: sum('closed', true), marketers: rows.filter((r) => r.cost > 0).length };
  // Danh sách marketer để chọn khi nhập: ai có đơn trong kỳ + ai thuộc bộ phận / tên có chữ MKT, Marketing.
  const options = new Map<string, string>();
  for (const r of rows) options.set(r.marketerId, r.name);
  for (const r of nameRows) if (/mkt|marketing/i.test(`${r.department ?? ''} ${r.name}`)) options.set(r.user_id, r.name);
  return {
    period: { start: opts.start, end: opts.end },
    total: { cost: sum('cost'), orders: sum('orders'), phones: sum('phones'), closed: sum('closed'), net: sum('net'), covered,
      roas: sum('cost') ? covered.net / sum('cost') : null, costPerLead: sum('cost') && covered.phones ? sum('cost') / covered.phones : null, costPerClosed: sum('cost') && covered.closed ? sum('cost') / covered.closed : null },
    rows,
    daily: (daily.results as { day: string; amount: number }[]).map((r) => ({ day: r.day, amount: Number(r.amount) })),
    entries: (entries.results as { id: string; day: string; marketer_id: string; amount: number; campaign: string | null; note: string | null; created_at: string }[])
      .map((e) => ({ id: e.id, day: e.day, marketerId: e.marketer_id, marketerName: who(e.marketer_id), amount: Number(e.amount), campaign: e.campaign, note: e.note, createdAt: e.created_at })),
    marketers: [...options.entries()].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name, 'vi')),
    definitions: {
      cost: 'Chi phí = số tiền marketer / trưởng team tự nhập theo ngày (nhập tay hoặc tải file Excel theo mẫu). Web không tự lấy từ tài khoản quảng cáo.',
      leads: 'Số = SĐT khác nhau trên đơn tạo trong kỳ có Marketer là người này (trừ đơn xóa).',
      roas: 'ROAS = doanh thu đơn chốt (theo ngày xác nhận lần đầu, sau giảm trừ) ÷ chi phí cùng kỳ. Ô tổng chỉ tính các marketer đã nhập chi phí, để marketer chưa nhập không làm ROAS cao ảo.',
      quality: 'Tỷ lệ chốt số = đơn chốt ÷ đơn tạo; hoàn = đơn chốt đang ở trạng thái hoàn ÷ đơn chốt.',
    },
  };
}
