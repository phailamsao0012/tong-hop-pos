// Chi phí MKT từ Google Sheet riêng tư (anh Vũ 09/10/2026, cách 2): file không share thêm được, nên người giữ file gắn
// Apps Script (mẫu ở lib/sheet-cost-script.ts) vào chính file đó; script gửi nguyên các tab (tiêu đề + giá trị đang hiện) về
// /api/marketing/sheet-webhook mỗi giờ và khi sửa. Máy chủ tự nhận cột (ngày, số tiền, người, chiến dịch) theo tên tiêu đề,
// nên đổi cách đọc cột chỉ cần sửa ở đây, không phải dán lại script.
// Mỗi lần nhận thay toàn bộ dòng cũ của file đó trong ad_costs (một giao dịch): gửi trùng hay sửa / xóa dòng trên sheet đều ra đúng số.
// Lần gửi không đọc được dòng nào thì giữ số cũ.
// Khóa: chủ hệ thống bấm tạo trên trang Chi phí & ROAS, web chỉ lưu SHA-256 của khóa (repo công khai, không có khóa trong mã).
import { env } from 'cloudflare:workers';
import { ensureAdCostSchema } from '@/lib/ad-costs';
import { LEFT_STAFF_SQL } from '@/lib/team';

let ready = false;
export async function ensureSheetCostSchema() {
  if (ready) return;
  await ensureAdCostSchema();
  await env.DB.batch([
    env.DB.prepare('CREATE TABLE IF NOT EXISTS sheet_cost_keys (id TEXT PRIMARY KEY, hash TEXT NOT NULL, created_by TEXT, created_at TEXT NOT NULL)'),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS sheet_cost_sources (file_id TEXT PRIMARY KEY, file_name TEXT, received_at TEXT NOT NULL,
      rows INTEGER NOT NULL, amount INTEGER NOT NULL, first_day TEXT, last_day TEXT, unmatched TEXT, problems TEXT, columns TEXT)`),
    // Tên trên sheet chủ hệ thống tự ghép với nhân viên POS (tên tắt, trùng nhiều người…); khóa là tên đã bỏ dấu.
    env.DB.prepare('CREATE TABLE IF NOT EXISTS sheet_cost_aliases (name_key TEXT PRIMARY KEY, name TEXT NOT NULL, user_id TEXT NOT NULL, created_by TEXT, created_at TEXT NOT NULL)'),
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
  ['campaign', /chien dich|campaign|tai khoan|\bpage\b|nhom qc|^san pham\b|^sp$/],
  ['day', /^(ngay|date|thoi gian)\b|\bngay\b/],
  // "Trang" ở tab CPQC Daily của BC MKT Agri là tên MKT (anh Vũ 09/10); chỉ khớp cả ô, "Tình trạng" không tính.
  ['marketer', /marketer|\bmkt\b|nhan vien|ho ten|ho va ten|\bten\b|nguoi chay|nguoi|^trang$/],
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
/** Dòng tổng / cộng: nhãn Tổng / Cộng nằm ở ô đầu dòng hoặc ở các cột khóa (ngày, người). Không xét cột khác, vì chiến dịch
 *  "Công ty …", "Tổng kho …" là dòng thật (QA 09/10). */
const TOTAL_RE = /^(tong|total|cong|sum)\b/;
const isTotalRow = (r: string[], keys: (number | undefined)[]) => {
  const first = r.find((c) => String(c ?? '').trim());
  return [first, ...keys.map((i) => (i === undefined ? undefined : r[i]))].some((c) => c !== undefined && TOTAL_RE.test(fold(String(c ?? ''))));
};
/** Năm hiện tại giờ VN; tháng lớn hơn tháng hiện tại hơn 1 thì là năm trước (tab "T12" xem vào tháng 1). */
const yearFor = (m: number) => { const now = new Date(Date.now() + 7 * 3600e3); return m > now.getUTCMonth() + 2 ? now.getUTCFullYear() - 1 : now.getUTCFullYear(); };
/** Tháng / năm đọc từ tên tab ("T10", "Tháng 10", "10/2026", "T10-2026") cho ô chỉ ghi số ngày. */
function monthOfTab(name: string): { y: number; m: number } | null {
  const f = fold(name);
  const mm = f.match(/(?:^|\b)(?:t|thang)\s*(\d{1,2})(?:\s*[/.-]\s*(\d{4}))?\b/) ?? f.match(/\b(\d{1,2})\s*[/.-]\s*(\d{4})\b/);
  if (!mm) return null;
  const m = +mm[1]; if (m < 1 || m > 12) return null;
  return { y: mm[2] ? +mm[2] : yearFor(m), m };
}

/** Ngày kiểu Việt Nam: 09/10/2026, 9/10, 2026-10-09, 09-10-2026 10:00. Thiếu năm thì lấy năm nay (giờ VN), tháng quá xa thì năm trước. */
export function parseDay(raw: string, year?: number): string | null {
  const s = raw.trim();
  // Sau ngày chỉ được là hết chuỗi, khoảng trắng / giờ: "31.10%", "12.3tr" là số, không phải ngày 31/10, 12/3.
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?=$|[\sT])/);
  let y: number, mo: number, d: number;
  if (m) { y = +m[1]; mo = +m[2]; d = +m[3]; }
  else if ((m = s.match(/^(\d{1,2})[/.-](\d{1,2})(?:[/.-](\d{2,4}))?(?=$|\s)/))) { d = +m[1]; mo = +m[2]; y = m[3] ? (m[3].length === 2 ? 2000 + +m[3] : +m[3]) : year ?? yearFor(mo); }
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

const MKT_RE = /\b(mkt|mtk|marketing)\b/;
const isMkt = (name: string) => MKT_RE.test(fold(name));
/** Khớp tên trên sheet với nhân viên POS: tên đã ghép tay trước, rồi trong nhân viên hậu tố MKT, rồi mọi nhân viên (anh Vũ 09/10:
 *  "Thương" trên sheet là Hà Thương MKT, không phải một bạn Thương bên Sale). Mỗi nhóm: đúng tên, bỏ hậu tố MKT, hoặc tên gọi nếu chỉ một người. */
export function nameMatcher(people: { id: string; name: string; gone?: boolean }[], aliases = new Map<string, string>()) {
  // Nhóm MKT bỏ người đã nghỉ theo web nhân sự: "Dương" là Nguyễn Dương MKT đang làm, không phải bạn Dương đã nghỉ.
  const mkt = matcherOf(people.filter((p) => isMkt(p.name) && !p.gone)), all = matcherOf(people);
  return (raw: string) => aliases.get(fold(raw)) ?? mkt(raw) ?? all(raw);
}
function matcherOf(people: { id: string; name: string }[]) {
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
    return unmatchedKey(k);
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
        if (isTotalRow(r, [whoCol])) continue;
        const who = whoCol === undefined ? '' : (r[whoCol] ?? '').replace(/\s+/g, ' ').trim();
        for (const { col, day } of head.dates) {
          const raw = r[col]?.trim(); if (!raw) continue;
          const amount = parseAmount(raw);
          if (amount === null) { if (/\d/.test(raw)) bad++; continue; }
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
        const rawDay = (r[cols.day] ?? '').trim(), rawAmount = (r[cols.amount] ?? '').trim();
        const day = parseDay(rawDay) ?? (tabMonth && /^\d{1,2}$/.test(rawDay) ? parseDay(`${rawDay}/${tabMonth.m}/${tabMonth.y}`) : null);
        const amount = parseAmount(rawAmount);
        // Dòng có ngày đọc được luôn là dòng thật; chỉ dòng không có ngày mới xét là dòng tổng / đơn vị ("(VNĐ)") để khỏi báo lỗi.
        if (!day || amount === null) { if (/\d/.test(rawAmount) && !(!day && isTotalRow(r, [cols.day, cols.marketer]))) bad++; continue; }
        if (!amount) continue;
        const who = cols.marketer === undefined ? '' : (r[cols.marketer] ?? '').replace(/\s+/g, ' ').trim();
        const cell = (i: number | undefined) => i === undefined ? null : (r[i] ?? '').trim().slice(0, 120) || null;
        rows.push({ day, marketerId: personOf(who, amount), amount, campaign: cell(cols.campaign), note: cell(cols.note) });
      }
    }
    if (bad) problems.push(`Tab "${tab.name}": ${bad} ô số tiền không đọc được.`);
    out.rows = rows.length - before; out.amount = rows.slice(before).reduce((t, r) => t + r.amount, 0);
    layouts.push(out);
  }
  return { rows, unmatched: [...unmatched.entries()].map(([name, amount]) => ({ name, amount })).sort((a, b) => b.amount - a.amount), problems, layouts };
}

async function staffNames() {
  const q = (gone: string) => env.DB.prepare(`SELECT user_id, MAX(name) AS name, ${gone} AS gone FROM pos_users WHERE name<>'' GROUP BY user_id`).all<{ user_id: string; name: string; gone: number }>();
  // Chưa có bảng nhân sự (mới cài, chưa đồng bộ web nhân sự) thì coi như ai cũng đang làm.
  const r = await q(`user_id IN (${LEFT_STAFF_SQL})`).catch(() => q('0'));
  return r.results.map((x) => ({ id: x.user_id, name: x.name, gone: !!x.gone }));
}
const aliasMap = async () => new Map((await env.DB.prepare('SELECT name_key, user_id FROM sheet_cost_aliases').all<{ name_key: string; user_id: string }>()).results.map((r) => [r.name_key, r.user_id]));
const unmatchedKey = (name: string) => `sheet:${name.slice(0, 80)}`;

/** Người đoán cho một tên chưa khớp: nhiều chữ chung nhất (bỏ hậu tố MKT), bằng nhau thì ưu tiên nhân viên MKT. Chỉ là gợi ý để chọn sẵn. */
function guessFor(raw: string, staff: { id: string; name: string; mkt: boolean }[]) {
  const words = fold(raw).replace(/\s+(mkt|mtk|marketing|ads)\b.*$/, '').split(' ').filter(Boolean);
  let best: { id: string; score: number } | null = null;
  for (const p of staff) {
    const w = fold(p.name).split(/[\s-]+/);
    const score = words.filter((x) => w.includes(x)).length * 2 + (p.mkt ? 1 : 0);
    if (score >= 2 && (!best || score > best.score)) best = { id: p.id, score };
  }
  return best?.id ?? null;
}

/** Chủ hệ thống ghép một tên trên sheet với nhân viên POS: lưu lại cho các lần gửi sau và chuyển ngay chi phí đang ghi "sheet:Tên".
 *  Đổi người cho tên đã ghép trước thì số cũ đổi theo ở lần gửi kế tiếp của file (mỗi giờ). */
export async function setSheetAlias(name: string, userId: string, by: string) {
  await ensureSheetCostSchema();
  const db = env.DB;
  const who = name.replace(/\s+/g, ' ').trim();
  if (!who || who === 'Chưa ghi người') return { ok: false as const, error: 'Tên không hợp lệ.' };
  const user = await db.prepare('SELECT user_id FROM pos_users WHERE user_id=? LIMIT 1').bind(userId).first();
  if (!user) return { ok: false as const, error: 'Không thấy nhân viên này trên POS.' };
  const src = await db.prepare('SELECT file_id, unmatched FROM sheet_cost_sources').all<{ file_id: string; unmatched: string | null }>();
  const stmts = [
    db.prepare(`INSERT INTO sheet_cost_aliases (name_key,name,user_id,created_by,created_at) VALUES (?,?,?,?,?)
      ON CONFLICT(name_key) DO UPDATE SET name=excluded.name, user_id=excluded.user_id, created_by=excluded.created_by, created_at=excluded.created_at`)
      .bind(fold(who), who, userId, by, new Date().toISOString()),
    db.prepare("UPDATE ad_costs SET marketer_id=? WHERE marketer_id=? AND source LIKE 'sheet:%'").bind(userId, unmatchedKey(who)),
  ];
  for (const r of src.results) {
    let list: { name: string; amount: number }[] = [];
    try { list = JSON.parse(r.unmatched ?? '[]') as typeof list; } catch { /* để nguyên */ }
    if (list.some((u) => fold(u.name) === fold(who))) stmts.push(db.prepare('UPDATE sheet_cost_sources SET unmatched=? WHERE file_id=?').bind(JSON.stringify(list.filter((u) => fold(u.name) !== fold(who))), r.file_id));
  }
  await db.batch(stmts);
  return { ok: true as const };
}

/** Nhận một lần gửi: thay toàn bộ dòng của file này (một giao dịch D1), ghi lại tình trạng để trang Chi phí & ROAS hiện. */
export async function ingestSheet(p: SheetPayload) {
  await ensureSheetCostSchema();
  const db = env.DB;
  const [people, aliases] = await Promise.all([staffNames(), aliasMap()]);
  const parsed = parseSheet(p, nameMatcher(people, aliases));
  const rows = parsed.rows.slice(0, 20000);
  const source = `sheet:${p.file.id}`;
  const now = new Date().toISOString();
  // Không đọc được dòng nào (IMPORTRANGE đang tải, tab đổi tên…) thì giữ nguyên số cũ, không xóa mất chi phí đã nhận.
  const stmts = rows.length ? [db.prepare('DELETE FROM ad_costs WHERE source=?').bind(source)] : [];
  // D1 giới hạn 100 tham số mỗi câu: 10 cột × 10 dòng.
  for (let i = 0; i < rows.length; i += 10) {
    const part = rows.slice(i, i + 10);
    stmts.push(db.prepare(`INSERT INTO ad_costs (id,day,marketer_id,amount,campaign,note,created_by,created_at,updated_at,source) VALUES ${part.map(() => '(?,?,?,?,?,?,?,?,?,?)').join(',')}`)
      .bind(...part.flatMap((r) => [crypto.randomUUID(), r.day, r.marketerId, r.amount, r.campaign, r.note, 'google-sheet', now, now, source])));
  }
  const amount = rows.reduce((t, r) => t + r.amount, 0);
  // Số dòng / tiền / khoảng ngày là những gì web đang giữ của file (lần gửi không đọc được gì thì vẫn là số cũ).
  stmts.push(db.prepare(`INSERT INTO sheet_cost_sources (file_id,file_name,received_at,rows,amount,first_day,last_day,unmatched,problems,columns)
    SELECT ?,?,?,COUNT(*),COALESCE(SUM(amount),0),MIN(day),MAX(day),?,?,? FROM ad_costs WHERE source=?
    ON CONFLICT(file_id) DO UPDATE SET file_name=excluded.file_name, received_at=excluded.received_at, rows=excluded.rows, amount=excluded.amount,
    first_day=excluded.first_day, last_day=excluded.last_day, unmatched=excluded.unmatched, problems=excluded.problems, columns=excluded.columns`)
    .bind(p.file.id, (p.file.name ?? '').slice(0, 200), now,
      JSON.stringify(parsed.unmatched.slice(0, 50)), JSON.stringify(parsed.problems.slice(0, 40)), JSON.stringify(parsed.layouts).slice(0, 400_000), source));
  await db.batch(stmts);
  return { rows: rows.length, amount, unmatched: parsed.unmatched.length, problems: parsed.problems };
}

export type SheetSource = { fileId: string; fileName: string | null; receivedAt: string; rows: number; amount: number; firstDay: string | null; lastDay: string | null;
  unmatched: { name: string; amount: number; guess?: string | null }[]; problems: string[]; layouts: TabLayout[] };
/** `staff`: nhân viên POS (MKT trước) để chọn khi ghép tay tên chưa khớp. */
export async function sheetStatus(): Promise<{ hasKey: boolean; keyCreatedAt: string | null; sources: SheetSource[]; staff: { id: string; name: string; mkt: boolean }[] }> {
  await ensureSheetCostSchema();
  const [key, src] = await env.DB.batch([
    env.DB.prepare("SELECT created_at FROM sheet_cost_keys WHERE id='main'"),
    env.DB.prepare('SELECT * FROM sheet_cost_sources ORDER BY received_at DESC LIMIT 10'),
  ]);
  const k = key.results[0] as { created_at: string } | undefined;
  const json = <T,>(s: unknown, d: T): T => { try { return typeof s === 'string' && s ? JSON.parse(s) as T : d; } catch { return d; } };
  const staff = (await staffNames()).map((p) => ({ id: p.id, name: p.name.replace(/\s+/g, ' ').trim() + (p.gone ? ' (đã nghỉ)' : ''), mkt: isMkt(p.name) }))
    .sort((a, b) => Number(b.mkt) - Number(a.mkt) || a.name.localeCompare(b.name, 'vi'));
  return {
    hasKey: !!k, keyCreatedAt: k?.created_at ?? null, staff,
    sources: (src.results as Record<string, unknown>[]).map((r) => ({
      fileId: String(r.file_id), fileName: (r.file_name as string | null) || null, receivedAt: String(r.received_at), rows: Number(r.rows), amount: Number(r.amount),
      firstDay: (r.first_day as string | null) ?? null, lastDay: (r.last_day as string | null) ?? null,
      unmatched: json<{ name: string; amount: number }[]>(r.unmatched, []).map((u) => ({ ...u, guess: guessFor(u.name, staff) })), problems: json(r.problems, []), layouts: (() => { const v = json<unknown>(r.columns, []); return Array.isArray(v) ? v as TabLayout[] : []; })(),
    })),
  };
}
