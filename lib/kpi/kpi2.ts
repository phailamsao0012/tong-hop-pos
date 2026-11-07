// Chỉ tiêu KPI mới (anh Vũ 07/11/2026): KPI giao tổng cho cả team, Leader / Mentor tự chia cho từng người.
// Sale: số nhận, số chốt, số đơn, số lượng theo sản phẩm. CSKH: tỷ lệ tự upsell, số lượng theo sản phẩm. Doanh số vẫn ở bảng targets.
// Lưu theo tháng ở app_settings `target_kpi2:<YYYY-MM>`, khoá "team:<mã>" / "employee:<tài khoản POS>". Không thêm migration.
// Logic thuần (không đụng cloudflare:workers) để test được.
import { PRODUCT_LINES, type LineKey } from '@/lib/reports/mkt-product-split';

export const KPI2_KEY = (month: string) => `target_kpi2:${month}`;
export type ProductGoal = Partial<Record<LineKey, number>>;
export type Kpi2 = { assigned?: number; closed?: number; orders?: number; upsellRate?: number; products?: ProductGoal };
export type Kpi2Map = Record<string, Kpi2>;
/** Chỉ tiêu cộng dồn được (chia cho người thì tổng người ≤ tổng team). Tỷ lệ upsell là tỉ số nên không cộng. */
export const SUM_FIELDS = ['assigned', 'closed', 'orders'] as const;
export const KPI2_LINES: LineKey[] = PRODUCT_LINES.map((l) => l.key);
const KEY_RE = /^(team|employee):[^\s]{1,100}$/;

const count = (v: unknown) => { const n = Number(v); return Number.isFinite(n) && n > 0 ? Math.min(1_000_000, Math.round(n)) : undefined; };
const rate = (v: unknown) => { const n = Number(v); return Number.isFinite(n) && n > 0 ? Math.min(100, Math.round(n * 10) / 10) : undefined; };

/** Làm sạch một chỉ tiêu: bỏ số âm, số 0, trường lạ; null nếu không còn gì. */
export function cleanKpi2(raw: unknown): Kpi2 | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>, out: Kpi2 = {};
  for (const f of SUM_FIELDS) { const v = count(r[f]); if (v) out[f] = v; }
  const u = rate(r.upsellRate); if (u) out.upsellRate = u;
  if (r.products && typeof r.products === 'object' && !Array.isArray(r.products)) {
    const p: ProductGoal = {};
    for (const k of KPI2_LINES) { const v = count((r.products as Record<string, unknown>)[k]); if (v) p[k] = v; }
    if (Object.keys(p).length) out.products = p;
  }
  return Object.keys(out).length ? out : null;
}

export function parseKpi2(value?: string | null): Kpi2Map {
  try {
    const parsed: unknown = JSON.parse(value ?? '{}');
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const out: Kpi2Map = {};
    for (const [k, v] of Object.entries(parsed)) { const c = KEY_RE.test(k) ? cleanKpi2(v) : null; if (c) out[k] = c; }
    return out;
  } catch { return {}; }
}

/** Thay chỉ tiêu của đúng các khoá gửi lên (giá trị rỗng = xoá khoá đó), giữ nguyên khoá khác. */
export function mergeKpi2(stored: Kpi2Map, items: { key: string; value: unknown }[]): Kpi2Map {
  const next = { ...stored };
  for (const it of items) {
    if (!KEY_RE.test(it.key)) continue;
    const c = cleanKpi2(it.value);
    if (c) next[it.key] = c; else delete next[it.key];
  }
  return next;
}

/** Khoá người xem được thấy: chủ hệ thống thấy hết; người khác thấy team mình cầm và người mình được chia. */
export function visibleKpi2(map: Kpi2Map, teams: string[] | null, staff: string[] | null): Kpi2Map {
  if (teams === null && staff === null) return map;
  return Object.fromEntries(Object.entries(map).filter(([k]) => {
    const at = k.indexOf(':'), scope = k.slice(0, at), id = k.slice(at + 1);
    return scope === 'team' ? !!teams?.includes(id) : !!staff?.includes(id);
  }));
}

/** Ghi được khoá này không: KPI team chỉ chủ hệ thống; KPI người theo danh sách người được chia (targetStaff). */
export function canWriteKpi2(owner: boolean, staff: string[] | null, key: string) {
  if (owner) return true;
  return key.startsWith('employee:') && !!staff?.includes(key.slice(9));
}

export type SplitLine = { field: string; team: number | null; split: number; over: boolean };
/** "Đã chia X / tổng Y" từng chỉ tiêu cộng dồn của một team; over = chia vượt KPI team. */
export function splitStatus(team: Kpi2 | undefined, members: (Kpi2 | undefined)[]): SplitLine[] {
  const fields: { field: string; get: (k?: Kpi2) => number | undefined }[] = [
    ...SUM_FIELDS.map((f) => ({ field: f, get: (k?: Kpi2) => k?.[f] })),
    ...KPI2_LINES.map((l) => ({ field: `products.${l}`, get: (k?: Kpi2) => k?.products?.[l] })),
  ];
  return fields.map(({ field, get }) => {
    const t = get(team) ?? null, split = members.reduce((a, m) => a + (get(m) ?? 0), 0);
    return { field, team: t, split, over: t !== null && split > t };
  }).filter((l) => l.team !== null || l.split > 0);
}

/** Đọc một chỉ tiêu: "assigned", "upsellRate" hay "products.<dòng>". */
export function kpi2Value(k: Kpi2 | undefined, field: string): number | undefined {
  if (!k) return undefined;
  if (field.startsWith('products.')) return k.products?.[field.slice(9) as LineKey];
  return (k as Record<string, number | undefined>)[field];
}

/** Chỉ tiêu của kỳ từ chỉ tiêu tháng (giống KPI doanh thu ở lib/kpi/team-kpi.ts): số cộng dồn = KPI tháng × ngày của tháng trong kỳ ÷ ngày
 *  của tháng; tỷ lệ = trung bình theo số ngày. Có tháng chưa đặt thì null, không đoán. */
export function periodGoal(byMonth: { month: string; value: number | undefined; overlap: number; days: number }[], ratio: boolean): number | null {
  let sum = 0, days = 0;
  for (const m of byMonth) {
    if (!m.value) return null;
    sum += ratio ? m.value * m.overlap : m.value * m.overlap / m.days;
    days += m.overlap;
  }
  if (!days) return null;
  return ratio ? sum / days : sum;
}
