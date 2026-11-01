// Một thư viện định dạng cho mọi tin Telegram / Zalo (quy chuẩn 31/10/2026, bước 1).
// Mọi file gửi tin đi qua buildMessage; muốn đổi khuôn thì sửa một chỗ. Thuần TypeScript, không React, không cloudflare:workers.
//
// Khuôn một tin (tối đa 7 dòng):
//   <icon mức> <b>Chuyện gì</b> · phạm vi · kỳ
//   Số 1: <b>giá trị</b> (so cùng giờ kỳ trước)       ← tối đa 3 số, tên đúng như web
//   → Cần làm: một câu                                  ← không có việc thì "Chỉ để biết"
//   Số tính cho: ai · cập nhật 14:05
//   [Mở web]  [nút phụ]                                 ← nút inline, link mang sẵn bộ lọc
import { millions, signedShort } from '@/lib/kpi-pace';
import { returnTone } from '@/lib/return-tone';
import { rateLevel } from '@/lib/metrics';
import { VN_OFFSET_HOURS } from '@/lib/report-time';

/** Ba màu như web (bỏ 🟠 và 🛑): đỏ làm ngay, vàng xem trong giờ, xanh đã ổn; thông tin cho báo cáo, việc, bảo mật. */
export type Level = 'red' | 'yellow' | 'green' | 'info' | 'task' | 'security' | 'morning';
export const LEVEL_ICON: Record<Level, string> = { red: '🔴', yellow: '🟡', green: '🟢', info: '📊', task: '📌', security: '🔐', morning: '🌅' };

export const TELEGRAM_MAX = 4000;
export const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
/** Che SĐT (VN, có thể +84) và bí mật lọt trong chữ (api_key=…, token bot). */
export const scrub = (s: string) => s
  .replace(/bot\d+:[\w-]+/g, 'bot***')
  .replace(/\b(api_key|apikey|access_token|token|secret|key)=([^&\s"']+)/gi, '$1=***')
  .replace(/(?<!\d)(?:\+?84|0)(?:[\s.-]?\d){8,10}(?!\d)/g, '***');
/** Cắt chữ cho vừa một tin Telegram, giữ nguyên dòng đầu. */
export const clip = (s: string, max = TELEGRAM_MAX) => s.length <= max ? s : `${s.slice(0, max - 2).trimEnd()}…`;

const vnShift = (t: Date | string | number) => new Date(new Date(t).getTime() + VN_OFFSET_HOURS * 3600000).toISOString();
/** 14:05 giờ VN. */
export const vnClock = (t: Date | string | number) => vnShift(t).slice(11, 16);
/** 31/10 giờ VN (có --nam thì 31/10/2026). */
export const vnDay = (t: Date | string | number, nam = false) => { const d = vnShift(t).slice(0, 10); return nam ? `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}` : `${d.slice(8, 10)}/${d.slice(5, 7)}`; };

/** Tiền ngắn: "12,4 tr", "1,24 tỷ" (millions của web). */
export const tr = (n: number) => millions(n);
/** Chênh lệch có dấu: "+8%" / "−3%" / "0", dấu trừ là dấu trừ thật; không mũi tên để đọc được khi thu nhỏ. */
export const signedPct = (n: number) => signedShort(n, (x) => `${x}%`);
/** "+1,2 tr" / "−300 k"... chênh lệch tiền. */
export const signedTr = (n: number) => signedShort(n, millions);
/** Phần trăm một chữ số thập phân, dấu phẩy: "5,2%". */
export const pct = (n: number | null | undefined, digits = 1) => n === null || n === undefined ? '–' : `${n.toFixed(digits).replace('.', ',')}%`;
/** Số nguyên có chấm ngăn nghìn: "1.234". */
export const num = (n: number) => Math.round(n).toLocaleString('vi-VN');

/** Mức màu cùng ngưỡng với web: hoàn/hủy ≥7% đỏ, ≥5% vàng; tỷ lệ chốt dưới 25% đỏ, dưới 40% vàng. */
export function levelOf(metric: 'return' | 'cancel' | 'closeRate', value: number | null | undefined): Exclude<Level, 'info' | 'task' | 'security' | 'morning'> {
  if (metric === 'closeRate') { const l = rateLevel(value); return l === 'bad' ? 'red' : l === 'warn' ? 'yellow' : 'green'; }
  const t = returnTone(value ?? null);
  return t === 'red' ? 'red' : t === 'amber' ? 'yellow' : 'green';
}
/** Icon màu kèm số khi vượt ngưỡng: "🟡 5,2%", dưới ngưỡng chỉ "3,1%". */
export const pctFlag = (metric: 'return' | 'cancel', value: number | null | undefined) => {
  const l = levelOf(metric, value);
  return `${l === 'green' ? '' : `${LEVEL_ICON[l]} `}${pct(value)}`;
};

export type Button = { text: string; url?: string; data?: string };
export type Metric = { name: string; value: string; note?: string };
export type MessageInput = {
  level: Level;
  title: string;
  /** Phạm vi: "Team Sale HN", "tất cả POS". */
  scope?: string;
  /** Kỳ: "hôm nay tới 14:00", "ca 08–17h, tới 14:00". */
  period?: string;
  /** Tối đa 3 số chính; thừa thì đưa xuống phần phụ. */
  metrics?: Metric[];
  /** Dòng "→ Cần làm". Bỏ trống thì "Chỉ để biết". */
  action?: string | null;
  /** Dòng cuối: "Số tính cho Sale HN · cập nhật 14:05". */
  footer?: string;
  /** Phần phụ sau ───: dòng nào không quan trọng. */
  extra?: string[];
  /** Nút hàng 1, hàng 2... Mỗi hàng tối đa 3 nút. */
  buttons?: Button[][];
};
export type Built = { text: string; replyMarkup?: { inline_keyboard: { text: string; url?: string; callback_data?: string }[][] } };

/** Dựng một tin theo khuôn. Chữ người dùng (tên, lỗi) đã được esc + scrub, không cần làm lại trước khi gọi. */
export function buildMessage(m: MessageInput): Built {
  const head = [`${LEVEL_ICON[m.level]} <b>${esc(scrub(m.title))}</b>`, m.scope && esc(scrub(m.scope)), m.period && esc(m.period)].filter(Boolean).join(' · ');
  const main = (m.metrics ?? []).slice(0, 3).map((x) => `${esc(scrub(x.name))}: <b>${esc(scrub(x.value))}</b>${x.note ? ` (${esc(scrub(x.note))})` : ''}`);
  const rest = (m.metrics ?? []).slice(3).map((x) => `${esc(scrub(x.name))} ${esc(scrub(x.value))}${x.note ? ` (${esc(scrub(x.note))})` : ''}`);
  const action = m.action === null ? [] : [`→ ${m.action ? `Cần làm: ${esc(scrub(m.action))}` : 'Chỉ để biết.'}`];
  const extra = [...rest, ...(m.extra ?? []).map((s) => esc(scrub(s)))];
  const lines = [head, ...main, ...action, ...(m.footer ? [esc(m.footer)] : []), ...(extra.length ? ['───', ...extra] : [])];
  const text = clip(lines.join('\n'));
  const rows = (m.buttons ?? []).map((r) => r.slice(0, 3).map((b) => b.url ? { text: b.text, url: b.url } : { text: b.text, callback_data: (b.data ?? b.text).slice(0, 64) })).filter((r) => r.length);
  return rows.length ? { text, replyMarkup: { inline_keyboard: rows } } : { text };
}

/** Gom danh sách người: tối đa `max` dòng, còn lại "… và N người khác". */
export function batch(items: string[], max = 5, noun = 'người'): string[] {
  if (items.length <= max) return items;
  return [...items.slice(0, max), `… và ${items.length - max} ${noun} khác`];
}

/** Link mở web mang sẵn bộ lọc, giống luật "bấm vào số thì mở trang tính ra số đó". */
export function webLink(base: string, view: string, filters: Record<string, string | number | null | undefined> = {}) {
  const q = new URLSearchParams({ view });
  for (const [k, v] of Object.entries(filters)) if (v !== null && v !== undefined && v !== '') q.set(k, String(v));
  return `${base.replace(/\/$/, '')}/?${q.toString()}`;
}
