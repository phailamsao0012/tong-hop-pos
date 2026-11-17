// So số marketer ghi trên sheet CPQC Daily với POS (dùng chung cho bảng Đối chiếu sheet và nút "So với sheet" ở bảng Marketer, anh Vũ 12/11/2026).
// Cùng cách tính với app/mkt-sheet-check.tsx: chỉ cộng tới ngày cuối sheet có số (cutoff); POS theo ngày xác nhận, cột theo nút Tổng / New / CSKH.

export type PosSide = { orders: number; phones: number; closed: number; net: number; sale: number; cskh: number; other: number; saleClosed: number; cskhClosed: number };
export type CheckRow = { sheet: { phones: number; orders: number; revenue: number; cost: number }; confirmed: PosSide; created: PosSide };
export type SheetCheckData = {
  period: { start: string; end: string };
  sheet: { connected: boolean; receivedAt: string | null; hasStats: boolean };
  total: CheckRow;
  marketers: (CheckRow & { id: string; name: string; counted: boolean })[];
  days: (CheckRow & { day: string })[];
  detail: (CheckRow & { marketerId: string; day: string })[];
};
export type Target = 'net' | 'sale' | 'cskh';
export type Tone = 'green' | 'orange' | 'red';

export const zeroPos = (): PosSide => ({ orders: 0, phones: 0, closed: 0, net: 0, sale: 0, cskh: 0, other: 0, saleClosed: 0, cskhClosed: 0 });
export const zeroRow = (): CheckRow => ({ sheet: { phones: 0, orders: 0, revenue: 0, cost: 0 }, confirmed: zeroPos(), created: zeroPos() });
export const addRow = (a: CheckRow, b: CheckRow) => {
  for (const k of ['phones', 'orders', 'revenue', 'cost'] as const) a.sheet[k] += b.sheet[k] ?? 0;
  for (const side of ['confirmed', 'created'] as const) for (const k of Object.keys(a[side]) as (keyof PosSide)[]) a[side][k] += b[side][k] ?? 0;
};
export const pick = (p: PosSide, k: Target) => k === 'sale' ? { net: p.sale, closed: p.saleClosed } : k === 'cskh' ? { net: p.cskh, closed: p.cskhClosed } : { net: p.net, closed: p.closed };
/** Lệch = sheet − POS, % trên số POS. */
export const gapOf = (sheet: number, pos: number) => ({ diff: sheet - pos, pct: pos ? (sheet - pos) / pos * 100 : sheet ? 100 : 0 });
/** ±2% khớp, ±10% lệch nhẹ, hơn nữa lệch nhiều. */
export const verdict = (pct: number): { tone: Tone; text: string } => Math.abs(pct) <= 2 ? { tone: 'green', text: 'Khớp' } : Math.abs(pct) <= 10 ? { tone: 'orange', text: 'Lệch nhẹ' } : { tone: 'red', text: 'Lệch nhiều' };
export const hasSheet = (r: CheckRow) => !!(r.sheet.phones || r.sheet.orders || r.sheet.revenue);

export type SheetCompare = {
  cutoff: string;
  /** Theo marketer (đã cộng tới cutoff). */ byMarketer: Map<string, { sheet: CheckRow['sheet']; posNet: number; posClosed: number; posPhones: number; counted: boolean; noSheet: boolean }>;
  /** Tổng các marketer counted. */ total: { sheet: CheckRow['sheet']; posNet: number; posClosed: number; posPhones: number };
  /** Tên trên sheet chưa ghép với POS. */ unmatched: { id: string; name: string; cost: number; revenue: number }[];
};

export function compareSheet(data: SheetCheckData, target: Target): SheetCompare {
  const fair = new Set(data.marketers.filter((m) => m.counted).map((m) => m.id));
  const cutoff = data.detail.filter(hasSheet).reduce<string | null>((a, d) => (!a || d.day > a ? d.day : a), null) ?? data.period.end;
  const by = new Map<string, CheckRow>();
  const t = zeroRow();
  for (const d of data.detail) {
    if (d.day > cutoff) continue;
    if (fair.has(d.marketerId)) addRow(t, d);
    if (!by.has(d.marketerId)) by.set(d.marketerId, zeroRow());
    addRow(by.get(d.marketerId)!, d);
  }
  const out = new Map<string, SheetCompare['byMarketer'] extends Map<string, infer V> ? V : never>();
  for (const m of data.marketers) {
    const r = by.get(m.id) ?? zeroRow(), q = pick(r.confirmed, target);
    out.set(m.id, { sheet: r.sheet, posNet: q.net, posClosed: q.closed, posPhones: r.created.phones, counted: m.counted, noSheet: !hasSheet(r) });
  }
  const tq = pick(t.confirmed, target);
  const unmatched = data.marketers.filter((m) => m.id.startsWith('sheet:') && (by.get(m.id)?.sheet.cost || by.get(m.id)?.sheet.revenue))
    .map((m) => ({ id: m.id, name: m.name, cost: by.get(m.id)?.sheet.cost ?? 0, revenue: by.get(m.id)?.sheet.revenue ?? 0 }));
  return { cutoff, byMarketer: out, total: { sheet: t.sheet, posNet: tq.net, posClosed: tq.closed, posPhones: t.created.phones }, unmatched };
}
