// Canh gác 24/7 (plan 11/10/2026 mục 3, QA 11/10 điểm 7–9): logic thuần, không gọi D1 hay mạng, test ở tests/watch-core.test.ts.
// Mỗi lượt canh (5 phút, lib/watch.ts) đưa vào danh sách "vấn đề đang thấy" theo mã sự cố; ở đây quyết định mở / nâng mức / đóng
// (lỗi N lượt liên tiếp mới mở, ổn 2 lượt liên tiếp mới đóng) rồi soạn tin: 🔴 gửi ngay kể cả ban đêm; 🟠 🟡 trong giờ yên lặng
// (22:00–07:00 giờ VN) thì chờ, gom một bản tóm tắt ở lượt đầu sau giờ yên lặng. Đã báo thì hết sẽ có "✅ Đã ổn lại"; 🔴 còn mở
// sau 4 giờ nhắc lại một lần. Trạng thái nằm ở bộ nhớ DO, không ở D1 (D1 hỏng chính là thứ cần canh). Tin không chứa SĐT khách.
import { VN_OFFSET_HOURS } from '@/lib/report-time';
import { isGroupChat } from '@/lib/bot-guard-core';

export type Severity = 'high' | 'medium' | 'low';
export const ICON: Record<Severity, string> = { high: '🔴', medium: '🟠', low: '🟡' };
const RANK: Record<Severity, number> = { low: 1, medium: 2, high: 3 };

/** Một sự cố. Thời điểm là ISO UTC. id = key@openedAt (một key mở lại sau khi đóng là sự cố mới). */
export type Incident = {
  key: string; severity: Severity; title: string; detail: string | null;
  openedAt: string; lastSeenAt: string;
  /** null = chưa báo (đang chờ qua giờ yên lặng, chưa đặt chat nhận, hoặc gửi lỗi). */
  notifiedAt: string | null;
  /** null = đang mở. */
  resolvedAt: string | null;
  resolvedNotifiedAt: string | null;
  notifyCount: number;
  /** Kênh của lần báo gần nhất: telegram | demo-log. */
  channel: string | null;
};
export const incidentId = (i: Pick<Incident, 'key' | 'openedAt'>) => `${i.key}@${i.openedAt}`;
/** Vấn đề thấy ở lượt này. need: số lượt lỗi liên tiếp mới mở sự cố (mặc định 1). */
export type Problem = { key: string; severity: Severity; title: string; detail?: string | null; need?: number };
export type Streak = { fail: number; ok: number };

export type WatchConfig = {
  quietStart: string; quietEnd: string;
  /** Ngưỡng dung lượng D1 (MB thập phân) và mức tăng mỗi ngày (QA điểm 9: 7 GB 🟠, 8,5 GB 🔴, tăng > 150 MB/ngày 🟠). */
  d1WarnMb: number; d1HighMb: number; d1GrowthMb: number;
};
export const DEFAULT_CONFIG: WatchConfig = { quietStart: '22:00', quietEnd: '07:00', d1WarnMb: 7000, d1HighMb: 8500, d1GrowthMb: 150 };

/** Trạng thái canh gác lưu ở bộ nhớ DO (khoá 'watch'). */
export type WatchState = {
  incidents: Incident[];
  streaks: Record<string, Streak>;
  /** Bản sao watch_chats / watch_config đọc được gần nhất: D1 lỗi vẫn biết gửi cho ai. */
  chats: string[] | null;
  config: WatchConfig | null;
  /** Mẫu dung lượng D1 (mỗi giờ một mẫu, giữ ~30 giờ) để tính mức tăng mỗi ngày. */
  sizes: { at: number; bytes: number }[];
  lastAt: number | null;
};
export const emptyState = (): WatchState => ({ incidents: [], streaks: {}, chats: null, config: null, sizes: [], lastAt: null });

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
const obj = (raw: string | null | undefined): Record<string, unknown> => {
  try { const p: unknown = raw ? JSON.parse(raw) : {}; return p && typeof p === 'object' && !Array.isArray(p) ? p as Record<string, unknown> : {}; } catch { return {}; }
};
/** Đọc khoá watch_config (JSON); thiếu hoặc sai thì dùng mặc định. */
export function parseConfig(raw: string | null | undefined): WatchConfig {
  const v = obj(raw);
  const time = (x: unknown, d: string) => typeof x === 'string' && HHMM.test(x) ? x : d;
  const num = (x: unknown, d: number) => { const n = Number(x); return x !== undefined && x !== null && Number.isFinite(n) && n > 0 ? n : d; };
  return {
    quietStart: time(v.quietStart, DEFAULT_CONFIG.quietStart), quietEnd: time(v.quietEnd, DEFAULT_CONFIG.quietEnd),
    d1WarnMb: num(v.d1WarnMb, DEFAULT_CONFIG.d1WarnMb), d1HighMb: num(v.d1HighMb, DEFAULT_CONFIG.d1HighMb), d1GrowthMb: num(v.d1GrowthMb, DEFAULT_CONFIG.d1GrowthMb),
  };
}

export const MAX_CHATS = 5;
/** Chat riêng (id dương), cùng luật với trustedChatIds ở lib/bot-access.ts: nhóm không nhận tin canh gác. */
const privateChat = (id: string) => /^\d{4,20}$/.test(id) && !isGroupChat(id);
/** Đọc khoá watch_chats (JSON mảng chat id, chủ hệ thống đặt trên web). Bỏ nhóm, bỏ id sai, bỏ trùng. */
export function parseChats(raw: string | null | undefined): string[] {
  try {
    const v: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(v) ? [...new Set(v.map((x) => String(x).trim()).filter(privateChat))].slice(0, MAX_CHATS) : [];
  } catch { return []; }
}
/** Kiểm danh sách chat chủ hệ thống nhập trên web: chỉ chat riêng, tối đa 5. */
export function validateChats(input: unknown): { chats: string[] } | { error: string } {
  if (!Array.isArray(input)) return { error: 'Danh sách chat không hợp lệ.' };
  const list = [...new Set(input.map((x) => String(x).trim()).filter(Boolean))];
  if (list.length > MAX_CHATS) return { error: `Tối đa ${MAX_CHATS} chat.` };
  const bad = list.find((x) => !privateChat(x));
  if (bad !== undefined) return { error: isGroupChat(bad) ? 'Chỉ nhận chat riêng (id dương), không nhận nhóm.' : 'Chat ID là dãy số, không phải token bot.' };
  return { chats: list };
}

/** Họ của mã sự cố: 'pos_stale:p3' → 'pos_stale'; 'dispatch_off:p1@2026-…' → 'dispatch_off'. */
export const familyOf = (key: string) => key.split('@')[0].split(':')[0];

const vnShift = (t: Date | string | number) => new Date(new Date(t).getTime() + VN_OFFSET_HOURS * 3600000).toISOString();
/** Giờ:phút VN của một thời điểm. */
export const vnClock = (t: Date | string | number) => vnShift(t).slice(11, 16);
const vnDay = (t: Date | string | number) => vnShift(t).slice(0, 10);
/** hh:mm nằm trong [start, end); khung qua nửa đêm (22:00–07:00) cũng đúng. */
export function inWindow(hhmm: string, start: string, end: string) {
  return start <= end ? hhmm >= start && hhmm < end : hhmm >= start || hhmm < end;
}
export const isQuiet = (now: Date, c: WatchConfig) => inWindow(vnClock(now), c.quietStart, c.quietEnd);

/** Che SĐT (VN, có thể +84) và bí mật lọt trong chữ lỗi (api_key=…, token bot) trước khi đưa vào tin hay nhật ký. */
export const scrub = (s: string) => s
  .replace(/bot\d+:[\w-]+/g, 'bot***')
  .replace(/\b(api_key|apikey|access_token|token|secret|key)=([^&\s"']+)/gi, '$1=***')
  .replace(/(?<!\d)(?:\+?84|0)(?:[\s.-]?\d){8,10}(?!\d)/g, '***');
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const short = (s: string | null | undefined, n = 200) => s ? scrub(s).replace(/\s+/g, ' ').trim().slice(0, n) : '';

/** Giờ Pancake / mốc nước: chuỗi không có múi giờ hiểu là UTC (giống timeVn ở bot.ts); số là giây hoặc mili giây. */
export function parseUtc(v: unknown): number | null {
  if (typeof v !== 'string' && typeof v !== 'number') return null;
  if (typeof v === 'number' || /^\d+$/.test(v)) { const n = Number(v); return Number.isFinite(n) && n > 0 ? (n > 1e12 ? n : n * 1000) : null; }
  const s = v.trim();
  if (!s) return null;
  const t = Date.parse(/(z|[+-]\d\d:?\d\d)$/i.test(s) ? s : `${s.replace(' ', 'T')}Z`);
  return Number.isNaN(t) ? null : t;
}

export const OK_TO_CLOSE = 2;
export const REMIND_AFTER_MS = 4 * 3600000;
const KEEP_RESOLVED_MS = 2 * 86400000;
const MAX_INCIDENTS = 100;
const MAX_STREAK = 99;

/**
 * Một lượt canh: cập nhật bộ đếm lỗi / ổn liên tiếp, mở sự cố mới, nâng mức, đóng sự cố đã ổn đủ 2 lượt.
 * `families`: họ kiểm tra đã thực sự chạy ở lượt này. Sự cố của họ không chạy (D1 không đọc được, đo dung lượng mỗi giờ, sao lưu
 * chưa có) giữ nguyên. Trong họ đã chạy, mã không có trong `problems` là "ổn".
 * Trả về danh sách sau lượt, id vừa đổi (để ghi nhật ký), id vừa mở hoặc nâng mức (báo ngay nếu ngoài giờ yên lặng).
 */
export function advance(input: { now: Date; incidents: Incident[]; streaks: Record<string, Streak>; problems: Problem[]; families: string[] }) {
  const at = input.now.toISOString();
  const fams = new Set(input.families);
  const streaks: Record<string, Streak> = {};
  for (const [k, s] of Object.entries(input.streaks)) streaks[k] = { ...s };
  const list = input.incidents.map((i) => ({ ...i }));
  const openOf = (key: string) => list.find((i) => i.key === key && !i.resolvedAt);
  const changed = new Set<string>(), fresh = new Set<string>();
  const bad = new Set<string>();
  for (const p of input.problems) {
    if (bad.has(p.key)) continue;
    bad.add(p.key);
    const s = streaks[p.key] ?? { fail: 0, ok: 0 };
    s.fail = Math.min(s.fail + 1, MAX_STREAK); s.ok = 0;
    streaks[p.key] = s;
    const open = openOf(p.key);
    if (open) {
      open.lastSeenAt = at;
      if (p.detail !== undefined) open.detail = p.detail;
      // Nâng mức (vd đồng bộ cũ 20 phút 🟠 → 60 phút 🔴): báo lại như sự cố mới. Hạ mức thì giữ mức cũ.
      if (RANK[p.severity] > RANK[open.severity]) {
        Object.assign(open, { severity: p.severity, title: p.title, notifiedAt: null, notifyCount: 0 });
        changed.add(incidentId(open)); fresh.add(incidentId(open));
      }
    } else if (s.fail >= Math.max(1, p.need ?? 1)) {
      const i: Incident = { key: p.key, severity: p.severity, title: p.title, detail: p.detail ?? null, openedAt: at, lastSeenAt: at, notifiedAt: null, resolvedAt: null, resolvedNotifiedAt: null, notifyCount: 0, channel: null };
      list.push(i);
      changed.add(incidentId(i)); fresh.add(incidentId(i));
    }
  }
  const okKeys = new Set([...Object.keys(streaks), ...list.filter((i) => !i.resolvedAt).map((i) => i.key)].filter((k) => fams.has(familyOf(k)) && !bad.has(k)));
  for (const key of okKeys) {
    const open = openOf(key);
    if (!open) { delete streaks[key]; continue; }
    const s = streaks[key] ?? { fail: 0, ok: 0 };
    s.ok = Math.min(s.ok + 1, MAX_STREAK); s.fail = 0;
    if (s.ok >= OK_TO_CLOSE) {
      open.resolvedAt = at;
      changed.add(incidentId(open));
      delete streaks[key];
    } else streaks[key] = s;
  }
  return { incidents: list, streaks, changed: [...changed], fresh: [...fresh] };
}

export type MessageKind = 'alert' | 'remind' | 'resolved' | 'digest';
export type Outgoing = { kind: MessageKind; ids: string[]; text: string };

const fmtTime = (iso: string, now: Date) => vnDay(iso) === vnDay(now) ? vnClock(iso) : `${vnClock(iso)} ${vnDay(iso).slice(8, 10)}/${vnDay(iso).slice(5, 7)}`;
/** "35 phút", "2 giờ 5 phút". */
export function duration(ms: number) {
  const m = Math.max(1, Math.round(ms / 60000));
  if (m < 60) return `${m} phút`;
  const h = Math.floor(m / 60), r = m % 60;
  return r ? `${h} giờ ${r} phút` : `${h} giờ`;
}
const detailOf = (i: Incident) => i.detail ? esc(scrub(i.detail)) : '';

export function alertText(i: Incident, now: Date) {
  return [`${ICON[i.severity]} <b>${esc(i.title)}</b>`, detailOf(i), `Từ ${fmtTime(i.openedAt, now)}`].filter(Boolean).join('\n');
}
export function remindText(i: Incident, now: Date) {
  return [`🔁 <b>Nhắc lại</b> · ${ICON[i.severity]} <b>${esc(i.title)}</b>`, detailOf(i),
    `Vẫn chưa ổn từ ${fmtTime(i.openedAt, now)} (đã ${duration(now.getTime() - Date.parse(i.openedAt))}).`].filter(Boolean).join('\n');
}
export function resolvedText(i: Incident) {
  return `✅ <b>Đã ổn lại</b> · ${esc(i.title)} (kéo dài ${duration(Date.parse(i.resolvedAt ?? i.lastSeenAt) - Date.parse(i.openedAt))})`;
}
export function digestText(items: Incident[], now: Date) {
  const lines = items.map((i) => i.resolvedAt
    ? `✅ ${esc(i.title)}: ${fmtTime(i.openedAt, now)}–${fmtTime(i.resolvedAt, now)} (${duration(Date.parse(i.resolvedAt) - Date.parse(i.openedAt))}), ${i.notifiedAt ? 'đã ổn lại' : 'đã tự hết'}`
    : `${ICON[i.severity]} ${esc(i.title)}: từ ${fmtTime(i.openedAt, now)}, vẫn chưa ổn${i.detail ? `\n   ${detailOf(i).split('\n').join('\n   ')}` : ''}`);
  return ['🌅 <b>Canh gác · tóm tắt sự cố chờ báo</b>', ...lines].join('\n');
}
export const TEST_TEXT = '✅ <b>Canh gác · tin thử</b>\nChat này sẽ nhận cảnh báo khi web tổng có chỗ hỏng: đồng bộ đơn, chia số, D1, bộ hẹn giờ, sao lưu.';
/** Telegram nhận tối đa 4096 ký tự mỗi tin. */
export const clip = (text: string) => text.length > 4000 ? `${text.slice(0, 3990)}\n…` : text;

/**
 * Soạn tin cần gửi ở lượt này (không đổi gì; gửi được thì gọi markSent cho từng id).
 * - 🔴 chưa báo: gửi ngay (kể cả ban đêm). 🟠 🟡 vừa mở / vừa nâng mức: gửi ngay nếu ngoài giờ yên lặng.
 * - 🟠 🟡 chờ từ trước (mở trong giờ yên lặng, hoặc lúc chưa gửi được) và sự cố tự hết khi chưa ai được báo: gom một bản tóm tắt
 *   ở lượt đầu ngoài giờ yên lặng.
 * - Hết mà đã từng báo: "✅ Đã ổn lại" (🔴 gửi ngay; 🟠 🟡 trong giờ yên lặng thì vào bản tóm tắt).
 * - 🔴 còn mở 4 giờ sau lần báo: nhắc lại một lần (notifyCount < 2).
 * Các tin cùng loại trong một lượt gộp thành một tin (vd cả 6 POS cùng đồng bộ chậm).
 */
export function outbox(input: { now: Date; config: WatchConfig; incidents: Incident[]; fresh: string[] }): Outgoing[] {
  const { now, config } = input;
  const quiet = isQuiet(now, config);
  const at = now.toISOString();
  const fresh = new Set(input.fresh);
  const alerts: Incident[] = [], reminds: Incident[] = [], resolved: Incident[] = [], digest: Incident[] = [];
  for (const i of input.incidents) {
    const high = i.severity === 'high';
    if (!i.resolvedAt) {
      if (!i.notifiedAt) {
        if (high || (fresh.has(incidentId(i)) && !quiet)) alerts.push(i);
        else if (!quiet) digest.push(i);
      } else if (high && i.notifyCount < 2 && now.getTime() - Date.parse(i.notifiedAt) >= REMIND_AFTER_MS) reminds.push(i);
    } else if (!i.resolvedNotifiedAt) {
      if (i.notifiedAt && (high || (i.resolvedAt === at && !quiet))) resolved.push(i);
      else if (!quiet) digest.push(i);
    }
  }
  const ids = (l: Incident[]) => l.map(incidentId);
  const join = (parts: string[]) => parts.join('\n\n');
  const out: Outgoing[] = [];
  if (alerts.length) out.push({ kind: 'alert', ids: ids(alerts), text: join(alerts.map((i) => alertText(i, now))) });
  if (reminds.length) out.push({ kind: 'remind', ids: ids(reminds), text: join(reminds.map((i) => remindText(i, now))) });
  if (resolved.length) out.push({ kind: 'resolved', ids: ids(resolved), text: resolved.map(resolvedText).join('\n') });
  if (digest.length) out.push({ kind: 'digest', ids: ids(digest), text: digestText(digest, now) });
  return out;
}

/** Đánh dấu đã báo sau khi gửi được (hoặc đã ghi log ở demo). */
export function markSent(i: Incident, kind: MessageKind, now: Date, channel: string): Incident {
  const at = now.toISOString();
  const n = { ...i, channel };
  if (kind === 'alert') { n.notifiedAt = at; n.notifyCount = i.notifyCount + 1; }
  else if (kind === 'remind') n.notifyCount = i.notifyCount + 1;
  else if (kind === 'resolved') n.resolvedNotifiedAt = at;
  else if (i.resolvedAt) { n.notifiedAt = i.notifiedAt ?? at; n.resolvedNotifiedAt = at; }
  else { n.notifiedAt = at; n.notifyCount = Math.max(1, i.notifyCount); }
  return n;
}

/** Bỏ sự cố đã đóng và đã báo xong, hoặc đã đóng quá 2 ngày; giữ tối đa 100 dòng. */
export function prune(list: Incident[], now: Date) {
  const kept = list.filter((i) => !i.resolvedAt || (!i.resolvedNotifiedAt && now.getTime() - Date.parse(i.resolvedAt) < KEEP_RESOLVED_MS));
  return kept.slice(-MAX_INCIDENTS);
}

// ---------------- Các kiểm tra (đầu vào đã đọc sẵn, đầu ra là vấn đề) ----------------

/** Kết quả lượt đồng bộ vừa chạy (bộ hẹn giờ DO đưa vào). */
export type RunInfo = { ok: boolean; error?: string | null; blocked: boolean; writesUsed: number; writeLimit: number; skipped?: string | null };
export const SCHED_FAMILIES = ['sched_error', 'd1_write_block', 'd1_write_80', 'pancake_key'];
export const SCHED_ERROR_NEED = 3;
export function schedulerProblems(run: RunInfo): Problem[] {
  const out: Problem[] = [];
  if (!run.ok) out.push({ key: 'sched_error', severity: 'medium', need: SCHED_ERROR_NEED, title: 'Bộ hẹn giờ đồng bộ lỗi liên tiếp', detail: run.error ? `Lỗi: ${short(run.error)}` : null });
  if (run.blocked) out.push({ key: 'd1_write_block', severity: 'high', title: 'Hết hạn mức ghi D1 trong ngày', detail: 'Web khoá ghi lịch sử và dựng số liệu tới 07:00 sáng (giờ VN); đơn mới vẫn lấy.' });
  else if (run.writeLimit > 0 && run.writesUsed >= run.writeLimit * 0.8)
    out.push({ key: 'd1_write_80', severity: 'medium', title: 'Sắp hết hạn mức ghi D1 trong ngày', detail: `Đã dùng ${Math.round(run.writesUsed / run.writeLimit * 100)}% (tự mở lại lúc 07:00 giờ VN).` });
  if (run.skipped === 'missing_key') out.push({ key: 'pancake_key', severity: 'high', title: 'Thiếu khoá Pancake: đồng bộ đơn đã dừng', detail: 'Đặt lại PANCAKE_POS_API_KEY cho Worker.' });
  return out;
}

export const STALE_MIN = 20, STALE_HIGH_MIN = 60, LAG_MIN = 20;
/** POS đang bật, đã ghép Shop ID. lastSyncAt = giờ lượt đọc đơn mới chạy xong; watermark = mốc nước "đã theo kịp tới" (cột recent_watermark, nếu có). */
export type PosSignal = { id: string; name: string; lastSyncAt: string | null; watermark?: string | null; lastError?: string | null };
/**
 * Tách hai tín hiệu (QA điểm 8):
 * - pos_stale: "đồng bộ không chạy", theo giờ chạy xong (last_sync_at) cũ hơn 20 phút (🟠), hơn 60 phút (🔴).
 * - pos_lag: "đơn về trễ", theo mốc nước trễ hơn 20 phút trong khi lượt chạy vẫn mới (đang dồn việc). Chỉ xét khi có mốc nước;
 *   chưa có cột recent_watermark thì bỏ qua. Ban đêm không có đơn thì mốc nước = giờ chạy, không báo.
 */
export function syncProblems(shops: PosSignal[], now: Date): Problem[] {
  const out: Problem[] = [];
  for (const s of shops) {
    const last = parseUtc(s.lastSyncAt);
    if (last === null) continue; // chưa từng chạy xong (vừa ghép Shop ID): chưa đo được
    const age = (now.getTime() - last) / 60000;
    if (age > STALE_MIN) {
      out.push({ key: `pos_stale:${s.id}`, severity: age > STALE_HIGH_MIN ? 'high' : 'medium', title: `Đồng bộ đơn POS ${s.name} không chạy`,
        detail: [`Lần chạy xong gần nhất ${vnClock(last)} (cách đây ${duration(now.getTime() - last)}).`, s.lastError ? `Lỗi gần nhất: ${short(s.lastError)}` : ''].filter(Boolean).join('\n') });
      continue;
    }
    const wm = parseUtc(s.watermark);
    if (wm !== null && (now.getTime() - wm) / 60000 > LAG_MIN)
      out.push({ key: `pos_lag:${s.id}`, severity: 'medium', title: `Đơn POS ${s.name} về trễ (đang dồn việc)`,
        detail: `Đồng bộ vẫn chạy nhưng mới theo kịp tới ${vnClock(wm)} (trễ ${duration(now.getTime() - wm)}).` });
  }
  return out;
}

export type DispatchOff = { posId: string; name: string; updatedAt: string; reason: string | null; waiting: number };
/** Chia số tự tắt một POS (mode='off', updated_by='Tự tắt'): 🔴. Mã kèm updated_at: bật lại rồi tự tắt lần nữa là sự cố mới (QA). */
export function dispatchProblems(rows: DispatchOff[]): Problem[] {
  return rows.map((r) => ({
    key: `dispatch_off:${r.posId}@${r.updatedAt}`, severity: 'high' as const, title: `Chia số đã TỰ TẮT · POS ${r.name}`,
    detail: [r.reason ? `Lý do: ${short(r.reason)}` : '', `Đơn chờ chia: ${r.waiting}`, 'Việc cần làm: kiểm tra trên Pancake rồi bật lại ở web › Chia số.'].filter(Boolean).join('\n'),
  }));
}

const MB = 1e6;
const HOUR = 3600000;
/** Đo dung lượng mỗi giờ một lần (meta.size_after đi kèm câu đọc nên không tốn thêm câu nào, nhưng tính tăng cần mẫu theo giờ). */
export const shouldMeasure = (sizes: { at: number }[], now: Date) => !sizes.length || now.getTime() - sizes[sizes.length - 1].at >= 55 * 60000;
/** Dung lượng D1: ≥ 7 GB 🟠, ≥ 8,5 GB 🔴 (cùng mã để nâng mức); tăng > 150 MB/ngày 🟠 (so với mẫu cách 20–28 giờ). */
export function sizeProblems(bytes: number, sizes: { at: number; bytes: number }[], now: Date, c: WatchConfig) {
  const t = now.getTime();
  const problems: Problem[] = [];
  const gb = (b: number) => `${(b / 1e9).toFixed(2).replace('.', ',')} GB`;
  if (bytes >= c.d1HighMb * MB || bytes >= c.d1WarnMb * MB)
    problems.push({ key: 'd1_size', severity: bytes >= c.d1HighMb * MB ? 'high' : 'medium', title: 'D1 sắp đầy',
      detail: `Đang dùng ${gb(bytes)} (ngưỡng ${gb(c.d1WarnMb * MB)} / ${gb(c.d1HighMb * MB)}, trần 10 GB).` });
  const base = sizes.filter((s) => t - s.at >= 20 * HOUR && t - s.at <= 28 * HOUR)
    .sort((a, b) => Math.abs(t - a.at - 24 * HOUR) - Math.abs(t - b.at - 24 * HOUR))[0];
  if (base) {
    const perDay = (bytes - base.bytes) * 24 * HOUR / (t - base.at);
    if (perDay > c.d1GrowthMb * MB)
      problems.push({ key: 'd1_growth', severity: 'medium', title: 'D1 tăng nhanh bất thường', detail: `Tăng khoảng ${Math.round(perDay / MB)} MB/ngày (ngưỡng ${c.d1GrowthMb} MB).` });
  }
  const next = [...sizes.filter((s) => t - s.at <= 30 * HOUR), { at: t, bytes }];
  return { problems, sizes: next };
}

export const BACKUP_MAX_AGE_MS = 26 * HOUR;
/** Sao lưu lỗi thì tự thử lại tối đa 3 lần (lib/backup.ts nhánh sao lưu đêm): chỉ báo lỗi sau lần cuối. */
const BACKUP_MAX_ATTEMPTS = 3;
/**
 * Khoá app_settings `backup:last` do sao lưu đêm ra R2 ghi (nhánh claude/sao-luu-dem-r2): { status: ok|fail|off|running, startedAt, finishedAt,
 * attempts, error, lastOkAt }. Chưa có khoá, hoặc status=off (chưa gắn kho R2), thì không kiểm. Lỗi sau lần thử cuối, hoặc lần xong gần nhất
 * quá 26 giờ, thì 🟠. Cũng nhận chuỗi ISO trần (= xong lúc đó).
 */
export function backupProblems(value: string | null | undefined, now: Date): { ran: boolean; problems: Problem[] } {
  const none = { ran: false, problems: [] };
  if (!value?.trim()) return none;
  let lastOk: number | null, failed = false, error: string | null = null;
  if (!value.trim().startsWith('{')) lastOk = parseUtc(value);
  else {
    const v = obj(value);
    const status = typeof v.status === 'string' ? v.status : v.ok === false ? 'fail' : 'ok';
    if (status === 'off') return none;
    lastOk = parseUtc(v.lastOkAt) ?? (status === 'ok' ? parseUtc(v.finishedAt ?? v.at) : null);
    failed = status === 'fail' && !(Number(v.attempts) < BACKUP_MAX_ATTEMPTS);
    error = typeof v.error === 'string' ? v.error : null;
  }
  const since = lastOk === null ? '' : `Lần xong gần nhất cách đây ${duration(now.getTime() - lastOk)}.`;
  if (failed) return { ran: true, problems: [{ key: 'backup', severity: 'medium', title: 'Sao lưu đêm bị lỗi', detail: [error ? `Lỗi: ${short(error)}` : '', since].filter(Boolean).join('\n') }] };
  if (lastOk === null) return none; // lượt đầu đang chạy hoặc đang thử lại: chưa đo được
  if (now.getTime() - lastOk > BACKUP_MAX_AGE_MS) return { ran: true, problems: [{ key: 'backup', severity: 'medium', title: 'Sao lưu đêm quá 26 giờ chưa xong', detail: since }] };
  return { ran: true, problems: [] };
}

/** D1 không đọc được (quá tải, treo, lỗi): 2 lượt liên tiếp thì 🔴. */
export const d1ReadProblem = (error: string): Problem => ({ key: 'd1_read', severity: 'high', need: 2, title: 'D1 không đọc được', detail: `Lỗi: ${short(error)}` });

// ---------------- Lớp 2: Cron canh bộ hẹn giờ ----------------

export const SCHED_DEAD_MS = 15 * 60000;
/** Bộ hẹn giờ im quá 15 phút (lượt chạy xong gần nhất). Chưa từng chạy thì chưa đo được. */
export const schedDead = (lastRunAt: number | null | undefined, now: Date) => !!lastRunAt && now.getTime() - lastRunAt > SCHED_DEAD_MS;
/** Trạng thái lớp 2 trong app_settings `watch_sched_alert` (chỉ để báo một lần và báo "đã ổn"; trần 1 tin/giờ nằm ở Cache API). */
export type SchedAlert = { openedAt: string; notifiedAt: string | null; resolvedAt: string | null };
export function parseSchedAlert(raw: string | null | undefined): SchedAlert | null {
  const v = obj(raw);
  return typeof v.openedAt === 'string' ? { openedAt: v.openedAt, notifiedAt: typeof v.notifiedAt === 'string' ? v.notifiedAt : null, resolvedAt: typeof v.resolvedAt === 'string' ? v.resolvedAt : null } : null;
}
/** Một lượt lớp 2: trạng thái kế tiếp và tin cần gửi. prev undefined = không đọc được D1 (chỉ còn trần Cache API chặn trùng). */
export function schedStep(prev: SchedAlert | null | undefined, dead: boolean, now: Date): { next: SchedAlert | null; send: 'alert' | 'resolved' | null } {
  const at = now.toISOString();
  const open = prev && !prev.resolvedAt ? prev : null;
  if (dead) {
    const cur = open ?? { openedAt: at, notifiedAt: null, resolvedAt: null };
    return { next: cur, send: cur.notifiedAt ? null : 'alert' };
  }
  if (open) return { next: { ...open, resolvedAt: at }, send: open.notifiedAt ? 'resolved' : null };
  return { next: prev ?? null, send: null };
}
export function schedDeadText(lastRunAt: number | null, rpcError: string | null, now: Date) {
  return [`🔴 <b>Bộ hẹn giờ đồng bộ không chạy</b>`,
    rpcError ? `Không gọi được bộ hẹn giờ (Durable Object): ${esc(short(rpcError, 150))}` : lastRunAt ? `Lượt chạy xong gần nhất ${vnClock(lastRunAt)} (cách đây ${duration(now.getTime() - lastRunAt)}).` : '',
    'Đơn mới, chia số và cảnh báo khác có thể đã dừng. Kiểm tra Workers Logs và bản deploy gần nhất.'].filter(Boolean).join('\n');
}
export const schedResolvedText = (s: SchedAlert) => `✅ <b>Đã ổn lại</b> · Bộ hẹn giờ đồng bộ chạy lại (kéo dài ${duration(Date.parse(s.resolvedAt ?? s.openedAt) - Date.parse(s.openedAt))})`;

/** Khoá watch_sim: chỉ có tác dụng ở bản demo, để QA tạo sự cố giả không làm được bằng dữ liệu. */
export type WatchSim = { posStale?: string; schedError?: boolean; writeBlock?: boolean; d1Mb?: number; schedDead?: boolean };
export function parseSim(raw: string | null | undefined): WatchSim {
  const v = obj(raw);
  return {
    posStale: typeof v.posStale === 'string' ? v.posStale : undefined, schedError: v.schedError === true, writeBlock: v.writeBlock === true,
    d1Mb: Number.isFinite(Number(v.d1Mb)) && Number(v.d1Mb) > 0 ? Number(v.d1Mb) : undefined, schedDead: v.schedDead === true,
  };
}
