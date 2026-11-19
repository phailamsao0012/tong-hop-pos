// Chọn ngày vào làm (anh Vũ 19/11/2026 "ok làm"): một chỗ dùng chung cho nhãn thâm niên T (lib/teams/tenure.ts) và trang Tăng trưởng.
// 1. Sửa tay (people_meta.joinedAt) giữ nguyên.
// 2. Web nhân sự: tên Pancake có mã NV ("NV901 - …") thì lấy đúng hồ sơ cùng mã; không có hồ sơ mã đó thì bỏ qua web nhân sự
//    (17/11: vài tài khoản đang gắn nhầm hồ sơ của người khác hoặc hồ sơ mã MT cũ). Tên chưa có mã thì theo hồ sơ đang gắn như cũ.
// 3. Ngày tạo tài khoản Pancake. 4. Ngày có đơn đầu tiên.
// Chặn cuối: ngày tự động muộn hơn ngày hoạt động đầu tiên (đơn bán, đơn Marketer, ghi chú khách) quá ACTIVITY_SLACK_DAYS ngày
// thì lấy ngày hoạt động đầu tiên (19/11: một hồ sơ web nhân sự ghi sai năm vào làm, người làm hơn 1 năm hiện T1).
import { plausibleJoin, type JoinSource } from '@/lib/reports/growth-calc';

const DAY = /^\d{4}-\d{2}-\d{2}/;
export const ACTIVITY_SLACK_DAYS = 30;

/** Số trong mã NV đầu tên Pancake ("NV905 - …", "NV 906 - …", "NV907- …" → 905, 906, 907); không có mã thì null. */
export const nameNvCode = (name: string | null | undefined): number | null => {
  const m = (name ?? '').trim().match(/^NV\s*0*(\d{1,5})(?!\d)/i);
  return m ? Number(m[1]) : null;
};
/** Số trong mã hồ sơ nhân sự "NV0905" → 905; mã khác (MT0123…) → null. */
export const employeeNvCode = (code: string | null | undefined): number | null => {
  const m = (code ?? '').trim().match(/^NV0*(\d{1,5})$/i);
  return m ? Number(m[1]) : null;
};

/** Mã NV → ngày vào của hồ sơ. Mã trùng nhiều hồ sơ thì bỏ (không đoán). */
export function hrJoinByCode(rows: { code: string | null; joined_on: string | null }[]): Map<number, string | null> {
  const out = new Map<number, string | null>(), dup = new Set<number>();
  for (const r of rows) { const c = employeeNvCode(r.code); if (c === null) continue; if (out.has(c)) dup.add(c); out.set(c, r.joined_on); }
  for (const c of dup) out.delete(c);
  return out;
}

export type JoinInput = {
  manual?: string | null;
  /** Mọi tên của tài khoản ở các POS: tên nào có mã NV thì dùng mã đó (một POS có thể chưa đổi tên). */
  names?: (string | null | undefined)[];
  /** Ngày vào của hồ sơ đang gắn với tài khoản (hr_pos_team). */
  hrLinked?: string | null;
  hrByCode: Map<number, string | null>;
  created?: string | null;
  firstOrder?: string | null;
  /** Ngày hoạt động đầu tiên của chính tài khoản: đơn bán, đơn Marketer hoặc ghi chú khách (giờ VN, YYYY-MM-DD). */
  firstActive?: string | null;
};

const daysAfter = (a: string, b: string) => Math.round((Date.parse(a.slice(0, 10)) - Date.parse(b.slice(0, 10))) / 86400000);

/** Ngày vào và nguồn; không có nguồn nào thì null. */
export function resolveJoin(x: JoinInput): { joined: string; source: JoinSource } | null {
  if (x.manual && DAY.test(x.manual)) return { joined: x.manual.slice(0, 10), source: 'tay' };
  const code = (x.names ?? []).map(nameNvCode).find((c) => c !== null) ?? null;
  const hr = code !== null ? (x.hrByCode.has(code) ? x.hrByCode.get(code) : null) : x.hrLinked;
  const sources: [string | null | undefined, JoinSource][] = [[hr, 'nhan-su'], [x.created, 'pancake'], [x.firstOrder, 'don-dau']];
  let pick: { joined: string; source: JoinSource } | null = null;
  for (const [d, source] of sources) { const ok = plausibleJoin(d); if (ok) { pick = { joined: ok, source }; break; } }
  const active = plausibleJoin(x.firstActive);
  if (active && (!pick || daysAfter(pick.joined, active) > ACTIVITY_SLACK_DAYS)) return { joined: active, source: 'hoat-dong' };
  return pick;
}

/** Ngày hoạt động đầu tiên của từng tài khoản: đơn bán, đơn Marketer, ghi chú khách (giờ VN). Ba câu GROUP BY dùng chỉ mục sẵn có. */
export async function firstActivity(db: D1Database): Promise<Map<string, string>> {
  // Bảng nào lỗi (chưa có) thì coi như không có dữ liệu, không làm hỏng nhãn thâm niên.
  const rows = <T,>(sql: string) => db.prepare(sql).all<T>().then((r) => r.results).catch(() => [] as T[]);
  const [sell, mkt, notes] = await Promise.all([
    rows<{ id: string; d: string }>("SELECT seller_id AS id, MIN(day) AS d FROM stats_daily_seller_product WHERE orders>0 AND seller_id<>'' GROUP BY 1"),
    rows<{ id: string; d: string }>("SELECT marketer_id AS id, MIN(day) AS d FROM stats_daily_mkt WHERE orders>0 AND marketer_id<>'' GROUP BY 1"),
    rows<{ id: string; t: string }>("SELECT author_id AS id, MIN(created_at) AS t FROM customer_notes WHERE author_id IS NOT NULL AND author_id<>'' GROUP BY 1"),
  ]);
  const out = new Map<string, string>();
  const add = (id: string, d: string | null) => { if (!id || !d || !DAY.test(d)) return; const day = d.slice(0, 10); const cur = out.get(id); if (!cur || day < cur) out.set(id, day); };
  for (const r of sell) add(r.id, r.d);
  for (const r of mkt) add(r.id, r.d);
  // Ghi chú lưu giờ UTC không hậu tố: đổi sang ngày giờ VN.
  for (const r of notes) { const t = Date.parse(/[zZ]|[+-]\d\d:?\d\d$/.test(r.t) ? r.t : `${r.t}Z`); if (!Number.isNaN(t)) add(r.id, new Date(t + 7 * 3600000).toISOString().slice(0, 10)); }
  return out;
}
