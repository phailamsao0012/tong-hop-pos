// Đặt / xem KPI bằng tin nhắn Zalo cho bot (anh Vũ 14/11/2026; plan sửa của Đầu não anh duyệt 14/11 10h12,
// https://claude.ai/artifact/H8FKUifX4TbA7uBXzGoU1g).
// - Chỉ Zalo nối tài khoản chủ hệ thống. Bot KHÔNG ghi ngay: gửi bản xem trước (số cũ → số mới, có đơn vị, tên tháng), "OK" mới lưu.
// - Đơn vị cố định: doanh thu triệu, TB đơn nghìn, tỉ lệ chốt %, số đưa về (MKT) số. CSKH không có KPI tỉ lệ chốt.
// - KPI luôn ghi cho TỪNG NGƯỜI (không ghi KPI cấp team). Một người có nhiều tài khoản POS (cùng mã nhân sự ở web nhân sự) là MỘT dòng:
//   doanh thu / số đưa về chia cho các tài khoản theo tỉ lệ KPI đang có; chưa có tỉ lệ thì bot hỏi từng POS. Tỉ lệ chốt / TB đơn là tỉ số
//   nên mỗi tài khoản nhận cùng số.
// - Số mới gấp hơn 3 lần hoặc nhỏ hơn 1/3 số cũ thì bot hỏi lại "anh chắc chưa". Lệnh "hoàn tác kpi" trả lần đổi gần nhất về số cũ.
// - Lưu: kiểm số cũ còn đúng như lúc xem trước, khác thì báo "vừa được người khác đổi" và không lưu; sao lưu trước khi ghi
//   (kpi_bot_backup:<lúc>, 50 bản); nhật ký kpi_bot_log_v1 (ai, lúc nào, số cũ → số mới).
// - Từ ngày 25 bot hỏi thêm tháng này hay tháng sau.
import { daysInMonthOf } from '@/lib/kpi/kpi-day';
import { KPI2_KEY, parseKpi2, type Kpi2 } from '@/lib/kpi/kpi2';
import { POS } from '@/lib/shared/report-model';
import { mktTeams } from '@/lib/teams/mkt-teams-source';
import { WEB_TEAMS_KEY, parseWebTeams } from '@/lib/teams/web-teams';
import { loadPersonSplits, splitAmount } from '@/lib/zalo/team-pos-split';

const clean = (s: string) => s.trim().replace(/\s+/g, ' ');
export const foldText = (s: string) => clean(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/đ/g, 'd');
/** Trạng thái theo từng Zalo (một khoá app_settings mỗi người, để hai sếp làm cùng lúc không đè nhau). */
export const PENDING_KEY = (chatId: string) => `zalo_kpi_pending:${chatId}`;
export const FLOW_KEY = (chatId: string) => `zalo_kpi_flow:${chatId}`;
export const LOG_KEY = 'kpi_bot_log_v1';
const PENDING_MS = 10 * 60000, FLOW_MS = 10 * 60000;

export type KpiMetric = 'leads' | 'revenue' | 'rate' | 'aov';
export type KpiTarget = { kind: 'dept'; dept: 'sale' | 'cskh' | 'mkt' } | { kind: 'dept-mkt' } | { kind: 'team'; name: string; each: boolean } | { kind: 'person'; name: string };
const METRIC_RE = String.raw`(so|doanh\s*thu|ds|ti\s*le\s*chot|tl\s*chot|tlc|aov|tb\s*don|trung\s*binh\s*don|gia\s*tri\s*don)`;
const metricOf = (w: string): KpiMetric => (w === 'so' ? 'leads' : /^(doanh|ds)/.test(w) ? 'revenue' : /^(ti|tl)/.test(w) ? 'rate' : 'aov');
export const METRIC_LABEL: Record<KpiMetric, string> = { leads: 'KPI số đưa về', revenue: 'KPI doanh thu', rate: 'KPI tỉ lệ chốt', aov: 'KPI TB đơn' };
export const UNIT: Record<KpiMetric, string> = { revenue: 'triệu', leads: 'số', rate: '%', aov: 'nghìn' };
const METRIC_NAME: Record<KpiMetric, string> = { revenue: 'Doanh thu', rate: 'Tỉ lệ chốt', aov: 'TB đơn', leads: 'Số đưa về' };
type Dept = 'cskh' | 'sale' | 'mkt';
const DEPTS: Dept[] = ['cskh', 'sale', 'mkt'];
const DEPT_LABEL: Record<Dept, string> = { cskh: 'CSKH', sale: 'Sale', mkt: 'MKT' };
/** Loại KPI từng bộ phận (CSKH bỏ tỉ lệ chốt — anh Vũ 14/11/2026). */
export const METRICS: Record<Dept, KpiMetric[]> = { cskh: ['revenue', 'aov'], sale: ['revenue', 'aov', 'rate'], mkt: ['revenue', 'leads'] };
const additive = (m: KpiMetric) => m === 'revenue' || m === 'leads';
const hasPer = additive;
export type KpiCommand =
  | { cmd: 'set'; metric: KpiMetric; target: KpiTarget; value: number; per: 'day' | 'month' }
  | { cmd: 'view'; metric: KpiMetric }
  | { cmd: 'undo' }
  | { cmd: 'confirm' } | { cmd: 'cancel' };

const vi = (n: number) => n.toLocaleString('vi-VN');
/** Hiện số theo đơn vị cố định. */
export const unitText = (metric: KpiMetric, n: number) =>
  metric === 'revenue' ? `${vi(Math.round(n / 1e5) / 10)} triệu` : metric === 'aov' ? `${vi(Math.round(n / 1e3))} nghìn` : metric === 'rate' ? `${String(n).replace('.', ',')}%` : `${vi(n)} số`;
const valText = (metric: KpiMetric, n: number | null) => (n ? unitText(metric, n) : 'chưa đặt');
const monthLabel = (month: string) => `${month.slice(5)}/${month.slice(0, 4)}`;
const vnMonth = (now: number) => new Date(now + 7 * 3600000).toISOString().slice(0, 7);
const nextMonth = (month: string) => { const [y, m] = month.split('-').map(Number); return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`; };

/** Số tiền "1,2 tỷ", "300tr", "650k", "1.500.000"; số đếm "50", "1.500". */
export function parseAmount(text: string, money: boolean): number | null {
  const m = foldText(text).match(/^([\d.,]+)\s*(ty|tr|trieu|k|nghin|ngan)?$/);
  if (!m) return null;
  const unit = m[2];
  let raw = m[1];
  if (unit && /^\d+[.,]\d+$/.test(raw)) raw = raw.replace(',', '.'); else raw = raw.replace(/[.,]/g, '');
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return null;
  const mul = unit === 'ty' ? 1e9 : unit === 'tr' || unit === 'trieu' ? 1e6 : unit === 'k' || unit === 'nghin' || unit === 'ngan' ? 1e3 : 1;
  if (!money && mul !== 1) return null;
  const v = Math.round(n * mul);
  return v > 0 && v <= (money ? 1e12 : 1e6) ? v : null;
}

/** Số theo đơn vị cố định của KPI; vẫn nhận "1,2 tỷ", "850k" nếu ghi rõ. "0" không phải số (là lệnh quay lại). */
export function parseUnitValue(text: string, metric: KpiMetric): { value: number; per: 'day' | 'month' } | null {
  const m = foldText(text).match(/^([\d.,]+)\s*(ty|tr|trieu|k|nghin|ngan|%|so)?\s*(?:\/|moi|1|mot|theo)?\s*(ngay|thang)?$/);
  if (!m) return null;
  const unit = m[2];
  const per: 'day' | 'month' = hasPer(metric) && m[3] === 'ngay' ? 'day' : 'month';
  const raw = /^\d+[.,]\d{1,2}$/.test(m[1]) ? Number(m[1].replace(',', '.')) : Number(m[1].replace(/[.,]/g, ''));
  if (!Number.isFinite(raw) || raw <= 0) return null;
  if (metric === 'rate') return raw <= 100 ? { value: Math.round(raw * 10) / 10, per } : null;
  if (metric === 'leads') return Number.isInteger(raw) && raw <= 1e6 ? { value: raw, per } : null;
  const mul = unit === 'ty' ? 1e9 : unit === 'tr' || unit === 'trieu' ? 1e6 : unit === 'k' || unit === 'nghin' || unit === 'ngan' ? 1e3
    : metric === 'revenue' ? 1e6 : 1e3;
  const v = Math.round(raw * mul);
  return v > 0 && v <= 1e12 ? { value: v, per } : null;
}

/** Đọc lệnh KPI 1 dòng (có dấu hay không dấu). Không phải lệnh KPI thì null để bot xử lý như cũ. */
export function parseKpiCommand(text: string): KpiCommand | null {
  const s = foldText(text);
  if (/^(ok|oke|okay|dong y|luu|xac nhan)$/.test(s)) return { cmd: 'confirm' };
  if (/^(huy|khong|thoi)$/.test(s)) return { cmd: 'cancel' };
  if (/^(hoan\s*tac|undo)(\s+kpi)?$/.test(s)) return { cmd: 'undo' };
  let m = s.match(new RegExp(String.raw`^(?:xem\s+)?kpi\s+${METRIC_RE}(?:\s+(?:mkt|sale|cskh))?$`));
  if (m) return { cmd: 'view', metric: metricOf(m[1]) };
  m = s.match(new RegExp(String.raw`^kpi\s+${METRIC_RE}\s+(.+?)\s+(?:la\s+)?([\d.,]+\s*(?:ty|tr|trieu|k|nghin|ngan)?)\s*%?(?:\s*(?:so|d|dong|vnd))?(?:\s*(?:\/|moi|1|mot)?\s*(nguoi))?(?:\s*(?:\/|moi|1|mot|theo)?\s*(ngay|thang))?$`));
  if (!m) return null;
  const metric = metricOf(m[1]);
  const value = parseUnitValue(m[3], metric)?.value ?? null;
  if (!value) return null;
  const per = !hasPer(metric) ? 'month' : m[5] === 'ngay' ? 'day' : m[5] === 'thang' ? 'month' : metric === 'leads' ? 'day' : 'month';
  const who = m[2].replace(/^(cho|cua)\s+/, '');
  const original = clean(text);
  const dept = who.match(/^(?:toan\s+|tat\s+ca\s+)?(?:team\s+|bo\s+phan\s+)?(sale|cskh|mkt|marketer|marketing)$/);
  const target: KpiTarget = metric === 'leads' && /^(ca\s+|toan\s+)?bo\s+phan\s+(mkt|marketing)$/.test(who) ? { kind: 'dept-mkt' }
    : dept ? { kind: 'dept', dept: dept[1] === 'sale' ? 'sale' : dept[1] === 'cskh' ? 'cskh' : 'mkt' }
    : who.startsWith('ca team ') ? { kind: 'team', name: originalPart(original, who.slice(8)), each: false }
    : who.startsWith('team ') ? { kind: 'team', name: originalPart(original, who.slice(5)), each: true }
    : { kind: 'person', name: originalPart(original, who) };
  return { cmd: 'set', metric, target, value, per };
}
function originalPart(original: string, folded: string) {
  const f = foldText(original), at = f.indexOf(folded);
  return at >= 0 ? clean(original).slice(at, at + folded.length) : folded;
}

// ───────── Dữ liệu ─────────
async function readRaw(db: D1Database, key: string) { return (await db.prepare('SELECT value FROM app_settings WHERE key=?').bind(key).first<{ value: string }>())?.value ?? null; }
async function readJson<T>(db: D1Database, key: string, fallback: T): Promise<T> {
  const raw = await readRaw(db, key);
  try { return raw ? JSON.parse(raw) as T : fallback; } catch { return fallback; }
}
async function writeJson(db: D1Database, key: string, value: unknown, now: number) {
  await db.prepare('INSERT INTO app_settings (key,value,updated_at) VALUES (?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at')
    .bind(key, JSON.stringify(value), new Date(now).toISOString()).run();
}
async function dropKey(db: D1Database, key: string) { await db.prepare('DELETE FROM app_settings WHERE key=?').bind(key).run(); }
/** Ghi có điều kiện: chỉ khi giá trị trong DB vẫn đúng như lúc đọc (chống hai người lưu đè nhau). */
async function writeIfSame(db: D1Database, key: string, before: string | null, value: unknown, now: number) {
  const next = JSON.stringify(value), at = new Date(now).toISOString();
  const r = before === null
    ? await db.prepare('INSERT INTO app_settings (key,value,updated_at) VALUES (?,?,?) ON CONFLICT(key) DO NOTHING').bind(key, next, at).run()
    : await db.prepare('UPDATE app_settings SET value=?, updated_at=? WHERE key=? AND value=?').bind(next, at, key, before).run();
  return Number(r.meta?.changes ?? 0) > 0;
}

type Account = { id: string; pos: string };
/** Một người = một mã nhân sự (web nhân sự); người chưa có mã thì mỗi tài khoản POS là một người. */
export type Person = { key: string; name: string; accounts: Account[]; dept: Dept };
type Team = { id: string; name: string; dept: Dept; people: Person[] };
const posName = (id: string) => POS.find((p) => p.id === id)?.name ?? id;

async function directory(db: D1Database) {
  const [mkt, webRow, names, hr] = await Promise.all([
    mktTeams(db),
    db.prepare('SELECT value FROM app_settings WHERE key=?').bind(WEB_TEAMS_KEY).first<{ value: string }>(),
    db.prepare("SELECT user_id AS id, MAX(name) AS name, GROUP_CONCAT(DISTINCT pos_id) AS pos FROM pos_users WHERE name<>'' GROUP BY user_id").all<{ id: string; name: string; pos: string | null }>(),
    db.prepare("SELECT pos_user_id AS id, employee_id AS emp, employee_name AS name FROM hr_pos_team WHERE status<>'da_nghi' AND employee_id IS NOT NULL AND employee_id<>''").all<{ id: string; emp: string; name: string | null }>(),
  ]);
  const acc = new Map(names.results.map((r) => [String(r.id), { name: String(r.name), pos: (r.pos ?? '').split(',').filter(Boolean).map(posName).join(', ') }]));
  const empOf = new Map(hr.results.map((r) => [String(r.id), { emp: String(r.emp), name: r.name ? String(r.name) : null }]));
  const raw = [
    ...mkt.teams.map((t) => ({ id: t.id, name: t.name, dept: 'mkt' as Dept, memberIds: t.memberIds })),
    ...parseWebTeams(webRow?.value).map((t) => ({ id: t.id, name: t.name, dept: t.dept as Dept, memberIds: t.memberIds })),
  ];
  const teams: Team[] = raw.map((t) => {
    const byKey = new Map<string, Person>();
    for (const id of t.memberIds) {
      const e = empOf.get(id), key = e ? `emp:${e.emp}` : `acc:${id}`;
      const p = byKey.get(key) ?? { key, name: e?.name || acc.get(id)?.name || id, accounts: [], dept: t.dept };
      p.accounts.push({ id, pos: acc.get(id)?.pos ?? '' });
      byKey.set(key, p);
    }
    return { id: t.id, name: t.name, dept: t.dept, people: [...byKey.values()].sort((a, b) => a.name.localeCompare(b.name, 'vi')) };
  });
  const people = new Map<string, Person>();
  for (const t of teams) for (const p of t.people) if (!people.has(p.key)) people.set(p.key, p);
  return { teams, people: [...people.values()] };
}
function find<T extends { name: string }>(list: T[], q: string): T[] {
  const f = foldText(q), exact = list.filter((x) => foldText(x.name) === f);
  return exact.length ? exact : list.filter((x) => foldText(x.name).includes(f));
}

/** KPI hiện tại (cả tháng) theo khoá lưu "employee:<tài khoản>". */
async function currentValues(db: D1Database, metric: KpiMetric, month: string, keys: string[]) {
  const out = new Map<string, number>();
  if (metric === 'leads') {
    const map = parseKpi2(await readRaw(db, KPI2_KEY(month)));
    for (const k of keys) if (map[k]?.leads) out.set(k, map[k].leads!);
  } else if (metric === 'rate' || metric === 'aov') {
    const map = await readJson<Record<string, number>>(db, `target_${metric}:${month}`, {});
    for (const k of keys) if (map[k] != null) out.set(k, Number(map[k]));
  } else {
    const rows = (await db.prepare("SELECT ref_id, revenue FROM targets WHERE month=? AND scope='employee'").bind(month).all<{ ref_id: string; revenue: number }>()).results;
    const set = new Set(keys);
    for (const r of rows) if (set.has(`employee:${r.ref_id}`) && Number(r.revenue)) out.set(`employee:${r.ref_id}`, Number(r.revenue));
  }
  return out;
}

export type Change = { key: string; label: string; old: number | null; next: number | null; /** Dòng phụ: phần mỗi team theo tỉ lệ POS (người nhiều team). */ note?: string };
/** Đổi số của MỘT người thành số từng tài khoản. null = cần hỏi từng POS (người nhiều tài khoản chưa có tỉ lệ). */
export function splitPerson(p: Person, metric: KpiMetric, value: number, cur: Map<string, number>): Change[] | null {
  const keys = p.accounts.map((a) => `employee:${a.id}`);
  const label = (a: Account) => (p.accounts.length > 1 ? `${p.name} · ${a.pos || a.id.slice(0, 6)}` : p.name);
  if (p.accounts.length === 1 || !additive(metric)) return p.accounts.map((a, i) => ({ key: keys[i], label: label(a), old: cur.get(keys[i]) ?? null, next: value }));
  const olds = keys.map((k) => cur.get(k) ?? 0), total = olds.reduce((a, v) => a + v, 0);
  if (!total) return null;
  // Chia theo tỉ lệ đang có; phần lẻ dồn vào tài khoản cuối để tổng đúng bằng số anh nhập.
  let left = value;
  return p.accounts.map((a, i) => {
    const next = i === p.accounts.length - 1 ? left : Math.round(value * olds[i] / total);
    left -= next;
    return { key: keys[i], label: label(a), old: cur.get(keys[i]) ?? null, next };
  });
}

type Pending = { at: number; metric: KpiMetric; month: string; changes: Change[]; summary: string; warn?: number; warned?: boolean; undoOf?: string };
/** Dòng số mới gấp hơn 3 lần hoặc nhỏ hơn 1/3 số cũ (chống gõ nhầm 3000 thay 300). */
export const suspicious = (c: Change) => !!c.old && c.next != null && (c.next > c.old * 3 || c.next < c.old / 3);

/** KPI doanh thu của người ở nhiều team: vẫn 1 dòng (số tổng), ghi kèm phần mỗi team theo tỉ lệ POS — đúng cách ảnh sếp tách (lib/zalo/team-pos-split.ts). */
export async function withTeamSplit(db: D1Database, month: string, changes: Change[], now: number): Promise<Change[]> {
  const sp = await loadPersonSplits(db, month, POS.map((p) => p.id), new Date(now).toISOString().slice(0, 19));
  return changes.map((c) => {
    const id = c.key.startsWith('employee:') ? c.key.slice(9) : '', x = sp.get('sale')?.get(id) ?? sp.get('cskh')?.get(id);
    if (!x || !c.next) return c;
    const parts = splitAmount(c.next, x.share);
    const text = x.teams.filter((t) => parts[t.id]).map((t) => `${t.name}${x.pos[t.id]?.length ? ` (${x.pos[t.id].map(posName).join(', ')})` : ''} ${unitText('revenue', parts[t.id])}`).join(' · ');
    return { ...c, note: `chia theo POS: ${text}` };
  });
}
async function savePending(db: D1Database, chatId: string, p: Omit<Pending, 'warn'>, now: number) {
  if (p.metric === 'revenue' && !p.undoOf) p = { ...p, changes: await withTeamSplit(db, p.month, p.changes, now) };
  const warn = p.changes.filter(suspicious).length;
  await writeJson(db, PENDING_KEY(chatId), { ...p, warn, at: now }, now);
  // Hiện ĐỦ mọi người, không cắt "… và N dòng khác" (Đầu não 14/11/2026): dài quá một tin Zalo thì tách nhiều tin.
  const lines = p.changes.map((x) => `• ${x.label}: ${valText(p.metric, x.old)} → ${valText(p.metric, x.next)}${suspicious(x) ? ' ⚠️' : ''}${x.note ? `\n   ↳ ${x.note}` : ''}`);
  const all = [`Sẽ ${p.undoOf ? '' : 'đặt '}${p.summary} (${p.changes.length} dòng)`, ...lines, ...(warn ? [`⚠️ ${warn} dòng có số mới gấp hơn 3 lần hoặc nhỏ hơn 1/3 số cũ.`] : []), 'Nhắn OK để lưu, HỦY để bỏ (10 phút).'];
  return splitMessages(all);
}
/** Ngắt giữa các tin Zalo trong một câu trả lời (zalo-work gửi từng phần thành tin riêng). */
export const MSG_BREAK = '\n\f\n';
/** Gom dòng thành các tin ≤ 1.800 ký tự (giới hạn tin Zalo 2.000), tin sau ghi "(tiếp)". */
export function splitMessages(lines: string[], max = 1800): string {
  const out: string[] = [];
  let cur = '';
  for (const line of lines) {
    if (cur && cur.length + 1 + line.length > max) { out.push(cur); cur = `(tiếp) ${line}`; } else cur = cur ? `${cur}\n${line}` : line;
  }
  if (cur) out.push(cur);
  return out.join(MSG_BREAK);
}

// ───────── Lệnh 1 dòng ─────────
export async function prepareKpi(db: D1Database, chatId: string, c: Extract<KpiCommand, { cmd: 'set' }>, now = Date.now()): Promise<string> {
  const month = vnMonth(now), days = daysInMonthOf(month);
  const monthly = c.per === 'day' ? c.value * days : c.value;
  const dir = await directory(db);
  let people: Person[] = [], scope = '', dept: Dept | null = null;
  const t = c.target;
  if (t.kind === 'dept-mkt') {
    // KPI số cả bộ phận MKT là một khoá riêng (không chia người).
    const cur = (parseKpi2(await readRaw(db, KPI2_KEY(month)))['dept:mkt']?.leads) ?? null;
    return savePending(db, chatId, { at: now, metric: 'leads', month, changes: [{ key: 'dept:mkt', label: 'Cả bộ phận MKT', old: cur, next: monthly }], summary: `${METRIC_LABEL.leads} tháng ${monthLabel(month)} cho cả bộ phận MKT` }, now);
  }
  if (t.kind === 'dept') { dept = t.dept; people = dir.people.filter((p) => p.dept === t.dept); scope = `${people.length} người ${DEPT_LABEL[t.dept]}, mỗi người`; }
  else if (t.kind === 'team') {
    const hit = find(dir.teams, t.name);
    if (hit.length !== 1) return hit.length ? `Có ${hit.length} team khớp "${t.name}": ${hit.slice(0, 6).map((x) => x.name).join(', ')}. Nhắn rõ tên hơn.` : `Không thấy team "${t.name}".`;
    dept = hit[0].dept; people = hit[0].people; scope = `${people.length} người team ${hit[0].name}, mỗi người`;
  } else {
    const hit = find(dir.people, t.name);
    if (hit.length !== 1) return hit.length ? `Có ${hit.length} người khớp "${t.name}": ${hit.slice(0, 6).map((x) => x.name).join(', ')}. Nhắn rõ tên hơn.` : `Không thấy người "${t.name}" trong các team.`;
    dept = hit[0].dept; people = hit; scope = hit[0].name;
  }
  if (!people.length) return 'Không có ai trong phạm vi này.';
  if (dept && !METRICS[dept].includes(c.metric)) return `${DEPT_LABEL[dept]} không có ${METRIC_LABEL[c.metric]}. ${DEPT_LABEL[dept]} đặt được: ${METRICS[dept].map((m) => METRIC_NAME[m]).join(', ')}.`;
  const cur = await currentValues(db, c.metric, month, people.flatMap((p) => p.accounts.map((a) => `employee:${a.id}`)));
  const changes: Change[] = [], manual: string[] = [];
  for (const p of people) { const ch = splitPerson(p, c.metric, monthly, cur); if (ch) changes.push(...ch); else manual.push(p.name); }
  if (manual.length) return `${manual.join(', ')} có nhiều tài khoản POS mà chưa có tỉ lệ để chia. Nhắn "set kpi" để nhập riêng từng POS cho người này.`;
  return savePending(db, chatId, { at: now, metric: c.metric, month, changes, summary: `${METRIC_LABEL[c.metric]} tháng ${monthLabel(month)} cho ${scope}${c.per === 'day' ? ` (nhập ${unitText(c.metric, c.value)}/ngày × ${days} ngày)` : ''}` }, now);
}

// ───────── Lưu, hoàn tác ─────────
/** Ghi các thay đổi, kiểm số cũ còn đúng. Trả false nếu có người vừa đổi (không ghi gì). */
async function apply(db: D1Database, p: Pending, who: string, now: number): Promise<boolean> {
  const at = new Date(now).toISOString();
  if (p.metric === 'revenue') {
    // Kiểm trước cả lô (số cũ còn đúng), rồi mới ghi; mỗi câu ghi vẫn có điều kiện để chặn lần ghi chen giữa.
    const now0 = await currentValues(db, 'revenue', p.month, p.changes.map((c) => c.key));
    if (p.changes.some((c) => (now0.get(c.key) ?? null) !== c.old)) return false;
    const stmts = p.changes.map((ch) => {
      const ref = ch.key.slice(9), id = `${p.month}:employee:${ref}`, by = `Zalo: ${who}`.slice(0, 80);
      return ch.old == null
        ? db.prepare("INSERT INTO targets (id,month,scope,ref_id,revenue,closed_orders,updated_by,updated_at) VALUES (?,?,'employee',?,?,0,?,?) ON CONFLICT(id) DO UPDATE SET revenue=excluded.revenue, updated_by=excluded.updated_by, updated_at=excluded.updated_at WHERE COALESCE(targets.revenue,0)=0")
          .bind(id, p.month, ref, ch.next ?? 0, by, at)
        : db.prepare('UPDATE targets SET revenue=?, updated_by=?, updated_at=? WHERE id=? AND revenue=?').bind(ch.next ?? 0, by, at, id, ch.old);
    });
    const res = await db.batch(stmts);
    if (res.some((r) => Number((r as D1Result).meta?.changes ?? 0) === 0)) return false;
    // KPI người × POS (target_emp_pos) chia lại theo tỉ lệ cũ để KPI ở Tổng quan khớp số mới.
    const empKey = `target_emp_pos:${p.month}`, before = await readRaw(db, empKey);
    const emp = before ? JSON.parse(before) as Record<string, Record<string, number>> : {};
    let touched = false;
    for (const ch of p.changes) {
      const m = emp[ch.key.slice(9)], total = m ? Object.values(m).reduce((a, v) => a + (Number(v) || 0), 0) : 0;
      if (!m || !total) continue;
      emp[ch.key.slice(9)] = Object.fromEntries(Object.entries(m).map(([pos, v]) => [pos, Math.round((Number(v) || 0) / total * (ch.next ?? 0))]));
      touched = true;
    }
    if (touched) await writeJson(db, empKey, emp, now);
    return true;
  }
  const key = p.metric === 'leads' ? KPI2_KEY(p.month) : `target_${p.metric}:${p.month}`;
  const before = await readRaw(db, key);
  if (p.metric === 'leads') {
    const map = parseKpi2(before);
    for (const ch of p.changes) if ((map[ch.key]?.leads ?? null) !== ch.old) return false;
    for (const ch of p.changes) {
      const v: Kpi2 = { ...map[ch.key] };
      if (ch.next) v.leads = ch.next; else delete v.leads;
      if (Object.keys(v).length) map[ch.key] = v; else delete map[ch.key];
    }
    return writeIfSame(db, key, before, map, now);
  }
  const map = before ? JSON.parse(before) as Record<string, number> : {};
  for (const ch of p.changes) if ((map[ch.key] ?? null) !== ch.old) return false;
  for (const ch of p.changes) { if (ch.next) map[ch.key] = ch.next; else delete map[ch.key]; }
  return writeIfSame(db, key, before, map, now);
}

/** "OK" → lưu (lần đầu có số lạ thì hỏi lại). "HỦY" → bỏ. Không có gì chờ thì null. */
export async function settleKpi(db: D1Database, chatId: string, confirm: boolean, who: string, now = Date.now()): Promise<string | null> {
  const p = await readJson<Pending | null>(db, PENDING_KEY(chatId), null);
  if (!p) return null;
  if (!confirm) { await dropKey(db, PENDING_KEY(chatId)); return 'Đã bỏ, không đổi KPI.'; }
  if (now - p.at > PENDING_MS) { await dropKey(db, PENDING_KEY(chatId)); return 'Bản xem trước đã quá 10 phút, chưa lưu. Nhắn lại lệnh KPI.'; }
  if (p.warn && !p.warned) {
    await writeJson(db, PENDING_KEY(chatId), { ...p, warned: true }, now);
    return `Anh chắc chưa? Có ${p.warn} dòng số mới gấp hơn 3 lần hoặc nhỏ hơn 1/3 số cũ (dòng có ⚠️). Nhắn OK lần nữa để lưu, HỦY để bỏ.`;
  }
  await dropKey(db, PENDING_KEY(chatId));
  const at = new Date(now).toISOString();
  // Sao lưu trước khi ghi: chụp nguyên chỗ sắp đổi, giữ 50 bản gần nhất.
  const snap = p.metric === 'revenue'
    ? { targets: (await db.prepare("SELECT * FROM targets WHERE month=? AND scope='employee'").bind(p.month).all()).results, [`target_emp_pos:${p.month}`]: await readJson<unknown>(db, `target_emp_pos:${p.month}`, null) }
    : { [p.metric === 'leads' ? KPI2_KEY(p.month) : `target_${p.metric}:${p.month}`]: await readJson<unknown>(db, p.metric === 'leads' ? KPI2_KEY(p.month) : `target_${p.metric}:${p.month}`, null) };
  const backupKey = `kpi_bot_backup:${at}`;
  await writeJson(db, backupKey, { at, who, summary: p.summary, snap }, now);
  for (const b of (await db.prepare("SELECT key FROM app_settings WHERE key LIKE 'kpi_bot_backup:%' ORDER BY key DESC").all<{ key: string }>()).results.slice(50)) await dropKey(db, b.key);
  if (!await apply(db, p, who, now)) { await dropKey(db, backupKey); return 'KPI vừa được người khác đổi sau lúc anh xem trước, nên tôi CHƯA lưu. Anh làm lại để xem số mới nhất.'; }
  const log = await readJson<{ at: string; undone?: string }[]>(db, LOG_KEY, []);
  if (p.undoOf) { const e = log.find((x) => x.at === p.undoOf); if (e) e.undone = at; }
  log.unshift({ at, who, metric: p.metric, month: p.month, summary: p.summary, changes: p.changes, backup: backupKey, ...(p.undoOf ? { undoOf: p.undoOf } : {}) } as never);
  await writeJson(db, LOG_KEY, log.slice(0, 200), now);
  return `Đã lưu ${p.summary}. Xem trên web: Giao việc → KPI.${p.undoOf ? '' : ' Nhắn "hoàn tác kpi" nếu muốn trả về số cũ.'}`;
}

/** "hoàn tác kpi": lần đổi gần nhất chưa hoàn tác → bản xem trước trả về số cũ. */
export async function undoKpi(db: D1Database, chatId: string, now = Date.now()): Promise<string> {
  type Entry = { at: string; who: string; metric: KpiMetric; month: string; summary: string; changes: Change[]; undone?: string; undoOf?: string };
  const log = await readJson<Entry[]>(db, LOG_KEY, []);
  const e = log.find((x) => !x.undone && !x.undoOf);
  if (!e) return 'Không có lần đổi KPI nào để hoàn tác.';
  const changes = e.changes.map((c) => ({ key: c.key, label: c.label, old: c.next, next: c.old }));
  return savePending(db, chatId, { at: now, metric: e.metric, month: e.month, changes, summary: `hoàn tác lần đổi lúc ${new Date(Date.parse(e.at) + 7 * 3600000).toISOString().slice(11, 16)} ${e.at.slice(8, 10)}/${e.at.slice(5, 7)} của ${e.who}: ${e.summary}`, undoOf: e.at }, now);
}

/** "xem kpi số": KPI số tháng này theo team MKT. */
export async function viewKpi(db: D1Database, metric: KpiMetric, now = Date.now()): Promise<string> {
  const month = vnMonth(now), days = daysInMonthOf(month);
  if (metric !== 'leads') return 'Xem KPI doanh thu, tỉ lệ chốt, TB đơn trên web: Giao việc → KPI.\n' + KPI_HELP;
  const dir = await directory(db), map = parseKpi2(await readRaw(db, KPI2_KEY(month)));
  const line = (label: string, v: number | undefined) => `• ${label}: ${v ? `${vi(v)} số/tháng (${vi(Math.round(v / days))}/ngày)` : 'chưa đặt'}`;
  const out = [`KPI số đưa về tháng ${monthLabel(month)}`, line('Cả bộ phận MKT', map['dept:mkt']?.leads)];
  for (const t of dir.teams.filter((x) => x.dept === 'mkt')) out.push(line(t.name, t.people.flatMap((p) => p.accounts).reduce((a, x) => a + (map[`employee:${x.id}`]?.leads ?? 0), 0) || undefined));
  return out.join('\n').slice(0, 2000);
}

// ───────── Hỏi đáp chọn số (set kpi) ─────────
type Step = 'month' | 'dept' | 'team' | 'each' | 'metric' | 'per' | 'ask';
/** Một câu hỏi số: cả team (all), một người (person), một tài khoản POS của người nhiều tài khoản chưa có tỉ lệ (account). */
type Ask = { kind: 'all' | 'person' | 'account'; label: string; personKey?: string; account?: string };
type Flow = { at: number; step: Step; month: string; dept?: Dept; teamId?: string; each?: boolean; metric?: KpiMetric; per?: 'day' | 'month';
  asks?: Ask[]; idx?: number; picked?: Record<string, number> };

async function flowPrompt(db: D1Database, f: Flow): Promise<string> {
  const mm = monthLabel(f.month);
  if (f.step === 'month') return `Đặt KPI cho tháng nào?\n1. Tháng này (${monthLabel(vnMonth(f.at))})\n2. Tháng sau (${monthLabel(nextMonth(vnMonth(f.at)))})\n(nhắn HỦY để thoát)`;
  if (f.step === 'dept') return `Đặt KPI tháng ${mm} cho bộ phận nào?\n${DEPTS.map((d, i) => `${i + 1}. ${DEPT_LABEL[d]}`).join('\n')}\n(nhắn HỦY để thoát)`;
  const dir = await directory(db), teams = dir.teams.filter((t) => t.dept === f.dept);
  if (f.step === 'team') {
    const cur = await currentValues(db, 'revenue', f.month, teams.flatMap((t) => t.people.flatMap((p) => p.accounts.map((a) => `employee:${a.id}`))));
    const goal = (t: Team) => t.people.flatMap((p) => p.accounts).reduce((a, x) => a + (cur.get(`employee:${x.id}`) ?? 0), 0);
    return [`${DEPT_LABEL[f.dept!]} có ${teams.length} team (KPI doanh thu tháng ${mm} đang đặt, cộng từng người):`, ...teams.map((t, i) => `${i + 1}. ${t.name} (${valText('revenue', goal(t))})`), 'Nhắn số thứ tự team · 0 quay lại'].join('\n');
  }
  const team = teams.find((t) => t.id === f.teamId)!;
  if (f.step === 'each') return `Team ${team.name} (${team.people.length} người). Có đặt KPI cho từng người không?\n1. Có (nhập riêng từng người)\n2. Không (cùng một số cho từng người)\n0 quay lại`;
  if (f.step === 'metric') return [`Đặt KPI gì cho từng người team ${team.name}${f.each ? '' : ' (cùng một số)'}?`, ...METRICS[f.dept!].map((m, i) => `${i + 1}. ${METRIC_NAME[m]} (${UNIT[m]})`), '0 quay lại'].join('\n');
  if (f.step === 'per') return `${METRIC_NAME[f.metric!]} đặt theo ngày hay theo tháng?\n1. Theo ngày (tự nhân ${daysInMonthOf(f.month)} ngày của tháng ${mm})\n2. Theo tháng\n0 quay lại`;
  const unit = `${UNIT[f.metric!]}${hasPer(f.metric!) ? `/${f.per === 'day' ? 'ngày' : 'tháng'}` : ''}`;
  const asks = f.asks ?? [], i = f.idx ?? 0, a = asks[i];
  if (a.kind === 'all') return `Nhắn KPI ${METRIC_NAME[f.metric!].toLowerCase()} cho MỖI người team ${team.name} (${team.people.length} người, cùng một số), đơn vị ${unit}.\n0 quay lại`;
  const keys = a.kind === 'account' ? [`employee:${a.account}`] : (team.people.find((p) => p.key === a.personKey)?.accounts ?? []).map((x) => `employee:${x.id}`);
  const cur = await currentValues(db, f.metric!, f.month, keys);
  const now = keys.reduce((s, k) => s + (cur.get(k) ?? 0), 0) / (additive(f.metric!) ? 1 : Math.max(1, keys.length));
  return `${METRIC_NAME[f.metric!]} (${unit}) · ${i + 1}/${asks.length}: ${a.label} · ${now ? `đang đặt ${unitText(f.metric!, now)}${hasPer(f.metric!) ? '/tháng' : ''}` : 'chưa đặt'}\nNhắn số, hoặc "bỏ" để giữ nguyên · 0 quay lại`;
}

/** Một bước của luồng. null = không có luồng đang mở và không phải lệnh mở luồng. */
export async function kpiFlow(db: D1Database, chatId: string, text: string, now: number): Promise<string | null> {
  const s = foldText(text), key = FLOW_KEY(chatId);
  const save = async (g: Flow | null) => { if (g) await writeJson(db, key, { ...g, at: now }, now); else await dropKey(db, key); };
  const show = async (g: Flow) => { await save(g); return flowPrompt(db, { ...g, at: now }); };
  if (/^(set|dat|cai)\s+kpi$/.test(s)) {
    const day = Number(new Date(now + 7 * 3600000).toISOString().slice(8, 10));
    return show({ at: now, step: day >= 25 ? 'month' : 'dept', month: vnMonth(now) });
  }
  const f = await readJson<Flow | null>(db, key, null);
  if (!f) return null;
  if (now - f.at > FLOW_MS) { await save(null); return /^\d+$|^bo$/.test(s) ? 'Đã quá 10 phút nên luồng đặt KPI tự huỷ. Nhắn "set kpi" để làm lại.' : null; }
  if (/^(huy|thoat|thoi)$/.test(s)) { await save(null); return 'Đã thoát, không đổi KPI.'; }
  if (s === '0') {
    if (f.step === 'ask' && (f.idx ?? 0) > 0) {
      const asks = f.asks ?? [], i = (f.idx ?? 0) - 1, picked = { ...f.picked };
      for (const k of Object.keys(picked)) if (asks[i].kind === 'account' ? k === `employee:${asks[i].account}` : false) delete picked[k];
      return show({ ...f, idx: i, picked });
    }
    const prev: Record<Step, Step> = { month: 'month', dept: 'month', team: 'dept', each: 'team', metric: 'each', per: 'metric', ask: hasPer(f.metric ?? 'rate') ? 'per' : 'metric' };
    const to = f.step === 'dept' && Number(new Date(f.at + 7 * 3600000).toISOString().slice(8, 10)) < 25 ? 'dept' : prev[f.step];
    return show({ ...f, step: to, asks: undefined, idx: 0, picked: {} });
  }
  const n = /^\d+$/.test(s) ? Number(s) : NaN;
  const again = async (msg: string) => `${msg}\n${await flowPrompt(db, f)}`;
  if (f.step === 'month') return n === 1 || n === 2 ? show({ ...f, step: 'dept', month: n === 1 ? vnMonth(now) : nextMonth(vnMonth(now)) }) : again('Nhắn 1 (tháng này) hoặc 2 (tháng sau).');
  if (f.step === 'dept') return n >= 1 && n <= 3 ? show({ ...f, step: 'team', dept: DEPTS[n - 1] }) : again('Chưa hiểu, nhắn 1, 2 hoặc 3.');
  const dir = await directory(db), teams = dir.teams.filter((t) => t.dept === f.dept);
  if (f.step === 'team') return n >= 1 && n <= teams.length ? show({ ...f, step: 'each', teamId: teams[n - 1].id }) : again(`Chưa hiểu, nhắn số từ 1 tới ${teams.length}.`);
  const team = teams.find((t) => t.id === f.teamId);
  if (!team) { await save(null); return 'Team không còn. Nhắn "set kpi" để làm lại.'; }
  const startAsks = (g: Flow): Flow => ({ ...g, step: 'ask', idx: 0, picked: {},
    asks: g.each ? team.people.map((p) => ({ kind: 'person' as const, label: p.accounts.length > 1 ? `${p.name} (${p.accounts.length} tài khoản POS, nhập số tổng)` : p.name, personKey: p.key })) : [{ kind: 'all' as const, label: 'cả team' }] });
  if (f.step === 'each') return n === 1 || n === 2 ? show({ ...f, step: 'metric', each: n === 1 }) : again('Nhắn 1 (có) hoặc 2 (không).');
  if (f.step === 'metric') {
    const list = METRICS[f.dept!];
    if (!(n >= 1 && n <= list.length)) return again(`Chưa hiểu, nhắn số từ 1 tới ${list.length}.`);
    const g: Flow = { ...f, metric: list[n - 1] };
    return show(hasPer(g.metric!) ? { ...g, step: 'per' } : startAsks(g));
  }
  if (f.step === 'per') return n === 1 || n === 2 ? show(startAsks({ ...f, per: n === 1 ? 'day' : 'month' })) : again('Nhắn 1 (theo ngày) hoặc 2 (theo tháng).');

  // step 'ask'
  const metric = f.metric!, days = daysInMonthOf(f.month), perDay = hasPer(metric) && f.per === 'day';
  const monthly = (v: number) => (perDay ? v * days : v);
  const asks = [...(f.asks ?? [])], i = f.idx ?? 0, a = asks[i], picked = { ...f.picked };
  const allKeys = team.people.flatMap((p) => p.accounts.map((x) => `employee:${x.id}`));
  const cur = await currentValues(db, metric, f.month, allKeys);
  // Người nhiều tài khoản chưa có tỉ lệ: chèn câu hỏi từng POS ngay sau câu hiện tại.
  const assign = (p: Person, value: number) => {
    const ch = splitPerson(p, metric, value, cur);
    if (ch) { for (const c of ch) picked[c.key] = c.next!; return; }
    asks.splice(i + 1, 0, ...p.accounts.map((x) => ({ kind: 'account' as const, label: `${p.name} · tài khoản ${x.pos || x.id.slice(0, 6)} (chưa có tỉ lệ để chia ${unitText(metric, value)})`, account: x.id })));
  };
  if (s === 'bo') { if (a.kind === 'all') return again('Câu này cần một số.'); }
  else {
    const v = parseUnitValue(text, metric);
    if (!v) return again(`Chưa đọc được số. Nhắn số theo đơn vị ${UNIT[metric]}${a.kind === 'all' ? '' : ', hoặc "bỏ"'}.`);
    if (a.kind === 'all') for (const p of team.people) assign(p, monthly(v.value));
    else if (a.kind === 'person') assign(team.people.find((p) => p.key === a.personKey)!, monthly(v.value));
    else picked[`employee:${a.account}`] = monthly(v.value);
  }
  if (i + 1 < asks.length) return show({ ...f, asks, idx: i + 1, picked });
  await save(null);
  const keys = Object.keys(picked);
  if (!keys.length) return 'Không đổi KPI của ai.';
  const label = new Map<string, string>(team.people.flatMap((p) => p.accounts.map((x) => [`employee:${x.id}`, p.accounts.length > 1 ? `${p.name} · ${x.pos || x.id.slice(0, 6)}` : p.name] as const)));
  const changes: Change[] = keys.map((k) => ({ key: k, label: label.get(k) ?? k, old: cur.get(k) ?? null, next: picked[k] }));
  const persons = new Set(team.people.filter((p) => p.accounts.some((x) => picked[`employee:${x.id}`] != null)).map((p) => p.key)).size;
  return savePending(db, chatId, { at: now, metric, month: f.month, changes,
    summary: `${METRIC_LABEL[metric]} tháng ${monthLabel(f.month)} cho ${persons} người team ${team.name}${f.each ? '' : ' (cùng một số)'}${perDay ? ` (nhập theo ngày × ${days} ngày)` : ''}` }, now);
}

/** Lệnh của sếp cho bot (truyền vào handleZaloUpdate ở các route máy chủ). null = không phải lệnh KPI, bot trả lời như cũ.
 *  Chỉ nhận từ Zalo nối với tài khoản chủ hệ thống. */
export async function bossKpiCommand(db: D1Database, actor: { name: string; user_id?: string | null }, chatId: string, text: string, now: number): Promise<string | null> {
  const s = foldText(text);
  const kpiLike = /^(set|dat|cai)\s+kpi$|^(xem\s+)?kpi\b|^hoan\s*tac(\s+kpi)?$/.test(s);
  const owner = actor.user_id ? await db.prepare("SELECT 1 AS ok FROM users WHERE id=? AND role='owner' AND disabled=0").bind(actor.user_id).first<{ ok: number }>() : null;
  if (!owner) return kpiLike ? 'Chỉ Zalo của chủ hệ thống được đặt KPI qua bot.' : null;
  const kc = parseKpiCommand(text);
  // Luồng hỏi đáp đang mở (hoặc "set kpi") đi trước; "OK" / "HỦY" của bản xem trước qua settleKpi.
  if (kc?.cmd !== 'confirm') { const r = await kpiFlow(db, chatId, text, now); if (r) return r; }
  if (kc?.cmd === 'set') return prepareKpi(db, chatId, kc, now);
  if (kc?.cmd === 'view') return viewKpi(db, kc.metric, now);
  if (kc?.cmd === 'undo') return undoKpi(db, chatId, now);
  if (kc?.cmd === 'confirm' || kc?.cmd === 'cancel') return settleKpi(db, chatId, kc.cmd === 'confirm', actor.name, now);
  return /^kpi\b/.test(s) ? KPI_HELP : null;
}

export const KPI_HELP = 'Sếp đặt KPI qua Zalo:\n• set kpi: hỏi đáp chọn số (bộ phận → team → từng người → loại KPI → ngày/tháng → số)\n• kpi doanh thu sale 300: mỗi người Sale 300 triệu/tháng (thêm "ngày" để đặt theo ngày)\n• kpi doanh thu cả team CSKH Nấm 300 · kpi doanh thu Kim Ngân 350\n• kpi tỉ lệ chốt sale 45 (CSKH không có tỉ lệ chốt)\n• kpi aov cskh 900: mỗi người CSKH 900 nghìn\n• kpi số mkt 50: mỗi marketer 50 số/ngày · kpi số bộ phận mkt 1200\n• hoàn tác kpi: trả lần đổi gần nhất về số cũ\n• xem kpi số\nĐơn vị: doanh thu triệu, TB đơn nghìn, tỉ lệ chốt %, số đưa về số. Bot gửi bản xem trước, nhắn OK để lưu.';
