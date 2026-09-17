// Phân tích tham số lệnh bot (không phụ thuộc runtime Cloudflare để test được bằng Node).
import { POS } from '@/lib/report-model';
import { addDays, todayVn } from '@/lib/report-time';
import { normalizeName } from '@/lib/shop-map';

const norm = (s: string) => normalizeName(s);
const monthStart = (d: string) => `${d.slice(0, 7)}-01`;
const dmy = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;

export const KEYBOARD = {
  keyboard: [
    [{ text: '/baocao' }, { text: '/baocao homqua' }, { text: '/baocao thang' }],
    [{ text: '/chotnong' }, { text: '/top' }, { text: '/pos' }],
    [{ text: '/nhanvien' }, { text: '/sanpham' }, { text: '/mualai' }],
    [{ text: '/dongbo' }, { text: '/help' }],
  ],
  resize_keyboard: true,
};

export type Period = { start: string; end: string; label: string; compare?: 'previous' };
export function parsePeriod(tokens: string[]): { period: Period; rest: string[] } {
  const today = todayVn();
  const rest: string[] = [];
  let period: Period | null = null;
  const yearOf = today.slice(0, 4);
  const toIso = (dm: string) => {
    const m = dm.match(/^(\d{1,2})[\/.-](\d{1,2})(?:[\/.-](\d{2,4}))?$/);
    if (!m) return null;
    const y = m[3] ? (m[3].length === 2 ? `20${m[3]}` : m[3]) : yearOf;
    return `${y}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  };
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i], k = norm(t);
    const next = tokens[i + 1] ? norm(tokens[i + 1]) : '';
    if (['homnay', 'today', 'nay'].includes(k)) period = { start: today, end: today, label: 'hôm nay', compare: 'previous' };
    else if (['homqua', 'qua', 'yesterday'].includes(k)) period = { start: addDays(today, -1), end: addDays(today, -1), label: 'hôm qua', compare: 'previous' };
    else if ((k === 'tuan' && next !== 'truoc') || k === 'tuannay') {
      const d = new Date(`${today}T00:00:00Z`); const dow = (d.getUTCDay() + 6) % 7;
      period = { start: addDays(today, -dow), end: today, label: 'tuần này', compare: 'previous' };
      if (next === 'nay') i++;
    } else if (k === 'tuantruoc' || (k === 'tuan' && next === 'truoc')) {
      const d = new Date(`${today}T00:00:00Z`); const dow = (d.getUTCDay() + 6) % 7;
      const s = addDays(today, -dow - 7); period = { start: s, end: addDays(s, 6), label: 'tuần trước', compare: 'previous' }; if (next === 'truoc') i++;
    } else if ((k === 'thang' && next !== 'truoc') || k === 'thangnay') { period = { start: monthStart(today), end: today, label: 'tháng này', compare: 'previous' }; if (next === 'nay') i++; }
    else if (k === 'thangtruoc' || (k === 'thang' && next === 'truoc')) { const e = addDays(monthStart(today), -1); period = { start: monthStart(e), end: e, label: 'tháng trước', compare: 'previous' }; if (next === 'truoc') i++; }
    else if (/^(\d+)ngay$/.test(k)) { const n = Number(k.match(/^(\d+)/)![1]); period = { start: addDays(today, -(n - 1)), end: today, label: `${n} ngày qua`, compare: 'previous' }; }
    else if (/^\d{1,2}[\/.-]\d{1,2}(?:[\/.-]\d{2,4})?-\d{1,2}[\/.-]\d{1,2}(?:[\/.-]\d{2,4})?$/.test(t)) {
      const [a, b] = t.split(/-(?=\d{1,2}[\/.-]\d{1,2})/); const s = toIso(a), e = toIso(b);
      if (s && e) period = { start: s <= e ? s : e, end: s <= e ? e : s, label: `${dmy(s)}–${dmy(e)}` };
    } else if (/^\d{1,2}[\/.-]\d{1,2}(?:[\/.-]\d{2,4})?$/.test(t)) {
      const s = toIso(t); if (s) period = { start: s, end: s, label: dmy(s), compare: 'previous' };
    } else if (/^\d{4}-\d{2}-\d{2}$/.test(t)) period = { start: t, end: t, label: dmy(t), compare: 'previous' };
    else if (/^(t|thang)(\d{1,2})$/.test(k)) { const m = k.match(/(\d{1,2})$/)![1].padStart(2, '0'); const s = `${yearOf}-${m}-01`; const e = addDays(monthStart(addDays(s, 32)), -1); period = { start: s, end: e > today ? today : e, label: `tháng ${Number(m)}` }; }
    else rest.push(t);
  }
  return { period: period ?? { start: today, end: today, label: 'hôm nay', compare: 'previous' }, rest };
}

export function parsePos(tokens: string[]): { posIds: string[]; rest: string[] } {
  const posIds: string[] = [], rest: string[] = [];
  const aliases: Record<string, string> = { svg: 'sieu-vo-gao', gao: 'sieu-vo-gao', apex: 'mgt-apex', mgt: 'mgt-apex', thuysan: 'thuy-san', ts: 'thuy-san', bio: 'bio-nano', bionano: 'bio-nano', megaroot: 'megaroot', root: 'megaroot', oxy: 'oxytetra', oxytetra: 'oxytetra' };
  for (const t of tokens) {
    const k = norm(t);
    const hit = aliases[k] ?? POS.find((p) => norm(p.name) === k || (k.length >= 4 && norm(p.name).includes(k)))?.id;
    if (hit) posIds.push(hit); else rest.push(t);
  }
  return { posIds: [...new Set(posIds)], rest };
}


export function splitMessage(text: string, max = 3800) {
  if (text.length <= max) return [text];
  const parts: string[] = [];
  let buf = '';
  for (const line of text.split('\n')) {
    if ((buf + '\n' + line).length > max) { parts.push(buf); buf = line; } else buf = buf ? `${buf}\n${line}` : line;
  }
  if (buf) parts.push(buf);
  return parts;
}
