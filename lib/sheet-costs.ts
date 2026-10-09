// Chi phí MKT từ Google Sheet riêng tư (anh Vũ 09/10/2026, cách 2): file không share thêm được, nên người giữ file gắn
// Apps Script (scripts/chi-phi-mkt-sheet.gs) vào chính file đó; script gửi nguyên các tab (tiêu đề + giá trị đang hiện) về
// /api/marketing/sheet-webhook mỗi giờ và khi sửa. Máy chủ tự nhận cột (ngày, số tiền, người, chiến dịch) theo tên tiêu đề,
// nên đổi cách đọc cột chỉ cần sửa ở đây, không phải dán lại script.
// Mỗi lần nhận thay toàn bộ dòng cũ của file đó trong ad_costs (một giao dịch): gửi trùng hay sửa / xóa dòng trên sheet đều ra đúng số.
// Khóa: chủ hệ thống bấm tạo trên trang Chi phí & ROAS, web chỉ lưu SHA-256 của khóa (repo công khai, không có khóa trong mã).
import { env } from 'cloudflare:workers';
import { ensureAdCostSchema } from '@/lib/ad-costs';

let ready = false;
export async function ensureSheetCostSchema() {
  if (ready) return;
  await ensureAdCostSchema();
  await env.DB.batch([
    env.DB.prepare('CREATE TABLE IF NOT EXISTS sheet_cost_keys (id TEXT PRIMARY KEY, hash TEXT NOT NULL, created_by TEXT, created_at TEXT NOT NULL)'),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS sheet_cost_sources (file_id TEXT PRIMARY KEY, file_name TEXT, received_at TEXT NOT NULL,
      rows INTEGER NOT NULL, amount INTEGER NOT NULL, first_day TEXT, last_day TEXT, unmatched TEXT, problems TEXT, columns TEXT)`),
  ]);
  ready = true;
}

const hex = (buf: ArrayBuffer) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
const sha256 = async (s: string) => hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)));

/** Tạo khóa mới (khóa cũ hết dùng ngay). Trả khóa đúng một lần; web chỉ giữ SHA-256. */
export async function newSheetKey(userId: string) {
  await ensureSheetCostSchema();
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  const key = `thp_${btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')}`;
  await env.DB.prepare('INSERT INTO sheet_cost_keys (id,hash,created_by,created_at) VALUES (\'main\',?,?,?) ON CONFLICT(id) DO UPDATE SET hash=excluded.hash, created_by=excluded.created_by, created_at=excluded.created_at')
    .bind(await sha256(key), userId, new Date().toISOString()).run();
  return key;
}

export async function checkSheetKey(given: string) {
  if (!/^thp_[\w-]{20,64}$/.test(given)) return false;
  await ensureSheetCostSchema();
  const row = await env.DB.prepare("SELECT hash FROM sheet_cost_keys WHERE id='main'").first<{ hash: string }>();
  if (!row) return false;
  const a = await sha256(given), b = row.hash;
  let r = a.length ^ b.length;
  for (let i = 0; i < Math.min(a.length, b.length); i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

// ---- đọc các tab ----
// Script gửi nguyên lưới giá trị của mỗi tab (`values`); bản cũ gửi sẵn `headers` + `rows`. Máy chủ tự tìm hàng tiêu đề và cách xếp:
// dọc (mỗi dòng một ngày) hoặc ngang (mỗi cột một ngày, mỗi dòng một người), nên không cần ai mô tả file (anh Vũ 09/10: "nghiên cứu file").
export type SheetTab = { name: string; values?: string[][]; headers?: string[]; rows?: string[][] };
export type SheetPayload = { file: { id: string; name?: string }; tz?: string; tabs: SheetTab[] };
type Role = 'day' | 'amount' | 'marketer' | 'campaign' | 'note';

const fold = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'd').toLowerCase().replace(/\s+/g, ' ').trim();
// Thứ tự quan trọng ("Chi phí ngày" là tiền, "Tên chiến dịch" là chiến dịch): tiền, chiến dịch, ngày, người. Mỗi vai trò lấy cột đầu tiên khớp.
const ROLE_RE: [Role, RegExp][] = [
  ['amount', /chi phi|so tien|tien ads|tien qc|tien quang cao|spend|amount|cost|ngan sach|thanh tien|tong tien|^tien\b/],
  ['campaign', /chien dich|campaign|tai khoan|\bpage\b|nhom qc/],
  ['day', /^(ngay|date|thoi gian)\b|\bngay\b/],
  ['marketer', /marketer|\bmkt\b|nhan vien|ho ten|ho va ten|\bten\b|nguoi chay|nguoi/],
  ['note', /ghi chu|note/],
];
function columnsOf(headers: string[]) {
  const cols: Partial<Record<Role, number>> = {};
  headers.forEach((h, i) => {
    const f = fold(h); if (!f) return;
    const role = ROLE_RE.find(([r, re]) => cols[r] === undefined && re.test(f))?.[0];
    if (role) cols[role] = i;
  });
  return cols;
}
/** Dòng tổng / cộng: bỏ để không cộng trùng. */
const isTotalRow = (r: string[]) => r.some((c) => /^(tong|total|cong|sum)\b/.test(fold(String(c ?? ''))));
/** Tháng / năm đọc từ tên tab ("T10", "Tháng 10", "10/2026", "T10-2026") cho ô chỉ ghi số ngày. */
function monthOfTab(name: string): { y: number; m: number } | null {
  const f = fold(name);
  const mm = f.match(/(?:^|\b)(?:t|thang)\s*(\d{1,2})(?:\s*[/.-]\s*(\d{4}))?\b/) ?? f.match(/\b(\d{1,2})\s*[/.-]\s*(\d{4})\b/);
  if (!mm) return null;
  const m = +mm[1]; if (m < 1 || m > 12) return null;
  return { y: mm[2] ? +mm[2] : new Date(Date.now() + 7 * 3600e3).getUTCFullYear(), m };
}

/** Ngày kiểu Việt Nam: 09/10/2026, 9/10, 2026-10-09, 09-10-2026 10:00. Thiếu năm thì lấy năm nay (giờ VN). */
export function parseDay(raw: string, year = new Date(Date.now() + 7 * 3600e3).getUTCFullYear()): string | null {
  const s = raw.trim();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  let y: number, mo: number, d: number;
  if (m) { y = +m[1]; mo = +m[2]; d = +m[3]; }
  else if ((m = s.match(/^(\d{1,2})[/.-](\d{1,2})(?:[/.-](\d{2,4}))?/))) { d = +m[1]; mo = +m[2]; y = m[3] ? (m[3].length === 2 ? 2000 + +m[3] : +m[3]) : year; }
  else return null;
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || y < 2020 || y > 2100) return null;
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCMonth() !== mo - 1) return null;
  return dt.toISOString().slice(0, 10);
}

/** Số tiền: 1.200.000 ₫ · 1,200,000 · 1200000 · 1,2tr · 500k. Không đọc được hoặc âm thì null. */
export function parseAmount(raw: string): number | null {
  const s = fold(raw).replace(/\s+/g, '').replace(/vnd|d$/g, '').replace(/₫/g, '');
  if (!s) return null;
  const m = s.match(/^(\d[\d.,]*)(tr|trieu|k|nghin|ngan)?$/);
  if (!m) return null;
  let num = m[1];
  if (/^\d{1,3}([.,]\d{3})+$/.test(num)) num = num.replace(/[.,]/g, '');
  else num = num.replace(',', '.');
  const v = Number(num) * (m[2]?.startsWith('tr') ? 1e6 : m[2] ? 1e3 : 1);
  return Number.isFinite(v) && v >= 0 && v < 1e12 ? Math.round(v) : null;
}

export type SheetCostRow = { day: string; marketerId: string; amount: number; campaign: string | null; note: string | null };
/** Cách đã đọc một tab, để trang Chi phí & ROAS cho xem lại (kèm vài dòng đầu). */
export type TabLayout = { tab: string; layout: 'doc' | 'ngang' | 'bo-qua'; headerRow: number | null; columns: Partial<Record<Role, string>>; rows: number; amount: number; reason?: string; sample: string[][] };

/** Khớp tên trên sheet với nhân viên POS: đúng tên, hoặc bỏ hậu tố MKT, hoặc tên gọi (chữ cuối) nếu chỉ một người. */
export function nameMatcher(people: { id: string; name: string }[]) {
  const strip = (n: string) => fold(n).replace(/\s+(mkt|mtk|marketing|ads)\b.*$/, '').trim();
  const exact = new Map<string, string>(), byStrip = new Map<string, string[]>(), byLast = new Map<string, string[]>();
  for (const p of people) {
    exact.set(fold(p.name), p.id); exact.set(fold(p.id), p.id);
    const st = strip(p.name); byStrip.set(st, [...(byStrip.get(st) ?? []), p.id]);
    const last = st.split(' ').slice(-2).join(' '); byLast.set(last, [...(byLast.get(last) ?? []), p.id]);
    const one = st.split(' ').at(-1)!; byLast.set(one, [...(byLast.get(one) ?? []), p.id]);
  }
  return (raw: string) => {
    const f = fold(raw); if (!f) return undefined;
    const uniq = (a?: string[]) => a && new Set(a).size === 1 ? a[0] : undefined;
    return exact.get(f) ?? uniq(byStrip.get(strip(raw))) ?? uniq(byLast.get(strip(raw)));
  };
}

/** Tìm hàng tiêu đề trong 15 hàng đầu: hàng khớp nhiều tên cột nhất (dọc) hoặc có ≥ 5 ô là ngày (ngang). */
function findHeader(values: string[][], tabMonth: { y: number; m: number } | null) {
  let best = { row: -1, score: 0, dates: [] as { col: number; day: string }[] };
  for (let i = 0; i < Math.min(15, values.length); i++) {
    const r = values[i] ?? [];
    const dates: { col: number; day: string }[] = [];
    r.forEach((c, col) => {
      const s = String(c ?? '').trim();
      const d = parseDay(s) ?? (tabMonth && /^\d{1,2}$/.test(s) ? parseDay(`${s}/${tabMonth.m}/${tabMonth.y}`) : null);
      if (d) dates.push({ col, day: d });
    });
    if (dates.length >= 5) return { row: i, layout: 'ngang' as const, dates };
    const score = Object.keys(columnsOf(r.map((c) => String(c ?? '')))).length;
    if (score > best.score) best = { row: i, score, dates };
  }
  return best.score >= 2 ? { row: best.row, layout: 'doc' as const, dates: [] } : null;
}

/** Không có tiêu đề rõ: đoán cột theo nội dung (cột phần lớn là ngày, cột phần lớn là số tiền lớn, cột chữ khớp tên người). */
function guessColumns(rows: string[][], isPerson: (s: string) => boolean) {
  const n = Math.max(0, ...rows.map((r) => r.length));
  const share = (col: number, ok: (s: string) => boolean) => { const v = rows.map((r) => String(r[col] ?? '').trim()).filter(Boolean); return v.length >= 3 ? v.filter(ok).length / v.length : 0; };
  const cols: Partial<Record<Role, number>> = {};
  let bestDay = 0, bestAmt = 0, bestWho = 0;
  for (let c = 0; c < n; c++) {
    const d = share(c, (s) => !!parseDay(s));
    if (d >= 0.6 && d > bestDay) { bestDay = d; cols.day = c; }
  }
  for (let c = 0; c < n; c++) {
    if (c === cols.day) continue;
    const a = share(c, (s) => (parseAmount(s) ?? 0) >= 1000);
    if (a >= 0.6 && a > bestAmt) { bestAmt = a; cols.amount = c; }
    const w = share(c, isPerson);
    if (w >= 0.3 && w > bestWho) { bestWho = w; cols.marketer = c; }
  }
  return cols;
}

/** Đọc mọi tab. `match`: tên trên sheet → mã nhân viên POS. Người không khớp ghi là "sheet:Tên" (vẫn cộng vào tổng). */
export function parseSheet(p: SheetPayload, match: (name: string) => string | undefined) {
  const rows: SheetCostRow[] = [];
  const unmatched = new Map<string, number>();
  const problems: string[] = [];
  const layouts: TabLayout[] = [];
  const personOf = (who: string, amount: number) => {
    const id = who ? match(who) : undefined;
    if (id) return id;
    const k = who || 'Chưa ghi người';
    unmatched.set(k, (unmatched.get(k) ?? 0) + amount);
    return `sheet:${k.slice(0, 80)}`;
  };
  for (const tab of p.tabs.slice(0, 40)) {
    const values = (tab.values ?? (tab.headers ? [tab.headers, ...(tab.rows ?? [])] : [])).slice(0, 20000).map((r) => (r ?? []).map((c) => String(c ?? '')));
    const sample = values.slice(0, 25).map((r) => r.slice(0, 40).map((c) => c.slice(0, 60)));
    const tabMonth = monthOfTab(tab.name);
    const head = findHeader(values, tabMonth);
    const before = rows.length;
    const out: TabLayout = { tab: tab.name, layout: 'bo-qua', headerRow: head?.row ?? null, columns: {}, rows: 0, amount: 0, sample };
    let bad = 0;
    if (head?.layout === 'ngang') {
      // Mỗi cột một ngày: cột người = cột chữ đầu tiên bên trái cột ngày đầu.
      const firstDate = head.dates[0].col;
      const header = values[head.row];
      const whoCol = [...Array(firstDate).keys()].reverse().find((c) => /ten|nguoi|marketer|mkt|nhan vien/.test(fold(header[c] ?? ''))) ?? (firstDate > 0 ? 0 : undefined);
      out.layout = 'ngang'; out.columns = { marketer: whoCol === undefined ? undefined : header[whoCol] || `cột ${whoCol + 1}`, day: `${head.dates.length} cột ngày (${head.dates[0].day.slice(5).split('-').reverse().join('/')} …)` };
      for (const r of values.slice(head.row + 1)) {
        if (isTotalRow(r)) continue;
        const who = whoCol === undefined ? '' : r[whoCol].replace(/\s+/g, ' ').trim();
        for (const { col, day } of head.dates) {
          const raw = r[col]?.trim(); if (!raw) continue;
          const amount = parseAmount(raw);
          if (amount === null) { bad++; continue; }
          if (amount) rows.push({ day, marketerId: personOf(who, amount), amount, campaign: null, note: null });
        }
      }
    } else {
      const dataFrom = head ? head.row + 1 : 0;
      const header = head ? values[head.row] : [];
      const data = values.slice(dataFrom);
      const cols = { ...guessColumns(data.slice(0, 200), (s) => !!match(s)), ...columnsOf(header) };
      if (cols.day === undefined || cols.amount === undefined) {
        out.reason = `không thấy cột ${cols.day === undefined ? 'ngày' : 'số tiền'}`;
        problems.push(`Tab "${tab.name}": ${out.reason}, bỏ qua.`);
        layouts.push(out); continue;
      }
      out.layout = 'doc';
      out.columns = Object.fromEntries(Object.entries(cols).map(([k, i]) => [k, header[i as number] || `cột ${(i as number) + 1}`]));
      for (const r of data) {
        if (isTotalRow(r)) continue;
        const rawDay = r[cols.day].trim();
        const day = parseDay(rawDay) ?? (tabMonth && /^\d{1,2}$/.test(rawDay) ? parseDay(`${rawDay}/${tabMonth.m}/${tabMonth.y}`) : null);
        const amount = parseAmount(r[cols.amount]);
        if (!day || amount === null) { if (r[cols.amount].trim()) bad++; continue; }
        if (!amount) continue;
        const who = cols.marketer === undefined ? '' : r[cols.marketer].replace(/\s+/g, ' ').trim();
        const cell = (i: number | undefined) => i === undefined ? null : r[i].trim().slice(0, 120) || null;
        rows.push({ day, marketerId: personOf(who, amount), amount, campaign: cell(cols.campaign), note: cell(cols.note) });
      }
    }
    if (bad) problems.push(`Tab "${tab.name}": ${bad} ô số tiền không đọc được.`);
    out.rows = rows.length - before; out.amount = rows.slice(before).reduce((t, r) => t + r.amount, 0);
    layouts.push(out);
  }
  return { rows, unmatched: [...unmatched.entries()].map(([name, amount]) => ({ name, amount })).sort((a, b) => b.amount - a.amount), problems, layouts };
}

/** Nhận một lần gửi: thay toàn bộ dòng của file này (một giao dịch D1), ghi lại tình trạng để trang Chi phí & ROAS hiện. */
export async function ingestSheet(p: SheetPayload) {
  await ensureSheetCostSchema();
  const db = env.DB;
  const names = await db.prepare("SELECT user_id, MAX(name) AS name FROM pos_users WHERE name<>'' GROUP BY user_id").all<{ user_id: string; name: string }>();
  const parsed = parseSheet(p, nameMatcher(names.results.map((r) => ({ id: r.user_id, name: r.name }))));
  const rows = parsed.rows.slice(0, 20000);
  const source = `sheet:${p.file.id}`;
  const now = new Date().toISOString();
  const stmts = [db.prepare('DELETE FROM ad_costs WHERE source=?').bind(source)];
  // D1 giới hạn 100 tham số mỗi câu: 10 cột × 10 dòng.
  for (let i = 0; i < rows.length; i += 10) {
    const part = rows.slice(i, i + 10);
    stmts.push(db.prepare(`INSERT INTO ad_costs (id,day,marketer_id,amount,campaign,note,created_by,created_at,updated_at,source) VALUES ${part.map(() => '(?,?,?,?,?,?,?,?,?,?)').join(',')}`)
      .bind(...part.flatMap((r) => [crypto.randomUUID(), r.day, r.marketerId, r.amount, r.campaign, r.note, 'google-sheet', now, now, source])));
  }
  const days = rows.map((r) => r.day).sort();
  const amount = rows.reduce((t, r) => t + r.amount, 0);
  stmts.push(db.prepare(`INSERT INTO sheet_cost_sources (file_id,file_name,received_at,rows,amount,first_day,last_day,unmatched,problems,columns) VALUES (?,?,?,?,?,?,?,?,?,?)
    ON CONFLICT(file_id) DO UPDATE SET file_name=excluded.file_name, received_at=excluded.received_at, rows=excluded.rows, amount=excluded.amount,
    first_day=excluded.first_day, last_day=excluded.last_day, unmatched=excluded.unmatched, problems=excluded.problems, columns=excluded.columns`)
    .bind(p.file.id, (p.file.name ?? '').slice(0, 200), now, rows.length, amount, days[0] ?? null, days.at(-1) ?? null,
      JSON.stringify(parsed.unmatched.slice(0, 50)), JSON.stringify(parsed.problems.slice(0, 40)), JSON.stringify(parsed.layouts).slice(0, 400_000)));
  await db.batch(stmts);
  return { rows: rows.length, amount, unmatched: parsed.unmatched.length, problems: parsed.problems };
}

export type SheetSource = { fileId: string; fileName: string | null; receivedAt: string; rows: number; amount: number; firstDay: string | null; lastDay: string | null;
  unmatched: { name: string; amount: number }[]; problems: string[]; layouts: TabLayout[] };
export async function sheetStatus(): Promise<{ hasKey: boolean; keyCreatedAt: string | null; sources: SheetSource[] }> {
  await ensureSheetCostSchema();
  const [key, src] = await env.DB.batch([
    env.DB.prepare("SELECT created_at FROM sheet_cost_keys WHERE id='main'"),
    env.DB.prepare('SELECT * FROM sheet_cost_sources ORDER BY received_at DESC LIMIT 10'),
  ]);
  const k = key.results[0] as { created_at: string } | undefined;
  const json = <T,>(s: unknown, d: T): T => { try { return typeof s === 'string' && s ? JSON.parse(s) as T : d; } catch { return d; } };
  return {
    hasKey: !!k, keyCreatedAt: k?.created_at ?? null,
    sources: (src.results as Record<string, unknown>[]).map((r) => ({
      fileId: String(r.file_id), fileName: (r.file_name as string | null) || null, receivedAt: String(r.received_at), rows: Number(r.rows), amount: Number(r.amount),
      firstDay: (r.first_day as string | null) ?? null, lastDay: (r.last_day as string | null) ?? null,
      unmatched: json(r.unmatched, []), problems: json(r.problems, []), layouts: (() => { const v = json<unknown>(r.columns, []); return Array.isArray(v) ? v as TabLayout[] : []; })(),
    })),
  };
}
