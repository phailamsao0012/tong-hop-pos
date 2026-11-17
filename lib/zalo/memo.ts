// Sổ nhắc việc trong bot Zalo (anh Vũ duyệt plan bản 5, 15/11/2026: https://claude.ai/artifact/DpDxoNxBzqsmcPpYj2Z5gw).
// - Gõ "nhắc việc" (hoặc "ghi việc") mở sổ: mỗi tin / mỗi dòng là một việc, chép đúng lời (không AI viết lại). "hết" đóng ngay; im 15 phút tự đóng.
// - Ngoài lúc mở sổ không lưu gì. Đang mở sổ mà gõ một lệnh (KPI, việc nhớ, xong 5…) thì hỏi lại lưu hay chạy lệnh.
// - 8h15 mỗi ngày gửi việc chưa xong (lâu nhất trên, quá 7 ngày đánh dấu riêng). "xong 5 7", "xong hết", "bỏ 7", "hoãn 7 tới 20/11".
// - Việc có ngày giờ: nhắc trước 1 ngày, 12 tiếng, 1 tiếng, đúng giờ; quá giờ chưa xong nhắc lại sau 2, 4, 6 tiếng.
//   Mốc nhắc trước rơi vào 22h–6h gửi sớm lúc 21h30; nhắc lại rơi vào 22h–6h thì bỏ. Chỉ có ngày thì coi như 8h15 sáng ngày đó.
// - Mỗi người chỉ thấy sổ của mình. Bật cho người nhận báo cáo sếp (kind 'boss'); công tắc app_settings zalo_memo_v1 = {"on":false} để tắt.
// Không dùng cloudflare:workers: hàm nhận db, chạy được trong test.

export type Memo = { id: string; contact_id: string; no: number; body: string; due_at: string | null; due_has_time: number; snooze_day: string | null; status: 'mo' | 'xong' | 'bo'; sent: string; created_at: string; done_at: string | null };
type Owner = { id: string; kind: string; chat_id?: string | null };

export const MEMO_SWITCH_KEY = 'zalo_memo_v1';
export const MEMO_IDLE_MS = 15 * 60000;
const ASK_MS = 10 * 60000;
const OPEN_KEY = (contactId: string) => `zalo_memo_open:${contactId}`;
const ASK_KEY = (contactId: string) => `zalo_memo_ask:${contactId}`;
const DAILY_KEY = 'zalo_memo_daily_v1';
export const MEMO_DAILY_TIME = '08:15';
const VN = 7 * 3600000, HOUR = 3600000, DAY = 24 * HOUR;
const iso = (ms: number) => new Date(ms).toISOString();
const vnDay = (ms: number) => new Date(ms + VN).toISOString().slice(0, 10);
const vnTime = (ms: number) => new Date(ms + VN).toISOString().slice(11, 16);
/** Mốc giờ VN "YYYY-MM-DD", "HH:mm" → ms. */
const vnAt = (day: string, hm: string) => Date.parse(`${day}T${hm}:00+07:00`);
const clean = (s: string) => s.trim().replace(/\s+/g, ' ');
export const fold = (s: string) => clean(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/đ/g, 'd');
const dm = (day: string) => `${day.slice(8, 10)}/${day.slice(5, 7)}`;
/** "15h", "15h30" */
const hLabel = (hm: string) => (hm.endsWith(':00') ? `${Number(hm.slice(0, 2))}h` : `${Number(hm.slice(0, 2))}h${hm.slice(3)}`);
export function dueLabel(m: Pick<Memo, 'due_at' | 'due_has_time'>, now: number) {
  if (!m.due_at) return '';
  const t = Date.parse(m.due_at), d = vnDay(t), today = vnDay(now);
  const day = d === today ? 'hôm nay' : d === vnDay(now + DAY) ? 'ngày mai' : `ngày ${dm(d)}`;
  return m.due_has_time ? `${hLabel(vnTime(t))} ${day}` : day;
}

// ───────── Đọc ngày giờ trong câu ─────────
/** Tìm ngày giờ hẹn trong câu (giờ VN). Không có thì null. Có giờ mà không có ngày → hôm nay (qua rồi thì mai). */
export function parseDue(text: string, now: number): { at: number; hasTime: boolean } | null {
  const s = ` ${fold(text)} `;
  const today = vnDay(now), year = Number(today.slice(0, 4));
  let day: string | null = null;
  const d = s.match(/[\s(](\d{1,2})[/.-](\d{1,2})(?:[/.-](\d{2,4}))?(?=[\s,.)])/);
  if (d) {
    const dd = Number(d[1]), mm = Number(d[2]);
    let yy = d[3] ? Number(d[3].length === 2 ? `20${d[3]}` : d[3]) : year;
    if (dd >= 1 && dd <= 31 && mm >= 1 && mm <= 12) {
      let cand = `${yy}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`;
      if (!d[3] && Date.parse(cand) < Date.parse(today) - 7 * DAY) { yy += 1; cand = `${yy}-${cand.slice(5)}`; }
      if (!Number.isNaN(Date.parse(cand)) && new Date(`${cand}T00:00:00Z`).getUTCDate() === dd) day = cand;
    }
  }
  if (!day && /\s(ngay\s+)?mai\s/.test(s)) day = vnDay(now + DAY);
  if (!day && /\shom\s+nay\s|\stoi\s+nay\s|\ssang\s+nay\s|\schieu\s+nay\s/.test(s)) day = today;
  let hm: string | null = null;
  const t = s.match(/[\s(](\d{1,2})\s*(?:h|g|gio)\s*(\d{2})?(?=[\s,.)])/) ?? s.match(/[\s(](\d{1,2}):(\d{2})(?=[\s,.)])/);
  if (t) {
    let h = Number(t[1]);
    const mi = Number(t[2] ?? 0);
    if (/\s(chieu|toi)\s/.test(s) && h >= 1 && h < 12) h += 12;
    if (h <= 23 && mi <= 59) hm = `${String(h).padStart(2, '0')}:${String(mi).padStart(2, '0')}`;
  }
  if (!day && !hm) return null;
  if (!day) { day = today; if (vnAt(day, hm!) <= now) day = vnDay(now + DAY); }
  return hm ? { at: vnAt(day, hm), hasTime: true } : { at: vnAt(day, MEMO_DAILY_TIME), hasTime: false };
}

/** Tên việc khi hiện: bỏ phần ngày giờ hẹn (đã ghi riêng "hẹn 15h ngày mai"), dữ liệu vẫn giữ câu gốc (anh Vũ 15/11/2026).
 *  "16/11 15h gọi anh Tùng kho" → "gọi anh Tùng kho". Bỏ hết thành rỗng thì giữ câu gốc. */
export function memoTitle(m: Pick<Memo, 'body' | 'due_at'>) {
  if (!m.due_at) return m.body;
  const B = String.raw`(^|[\s,(])`, E = String.raw`(?=$|[\s,.:;)])`;
  const pats = [
    String.raw`(?:ngày\s+)?\d{1,2}[/.-]\d{1,2}(?:[/.-]\d{2,4})?`,
    String.raw`(?:lúc\s+)?\d{1,2}\s*(?:h|g|giờ)\s*(?:\d{2})?(?:\s+(?:sáng|chiều|tối))?`,
    String.raw`(?:lúc\s+)?\d{1,2}:\d{2}(?:\s+(?:sáng|chiều|tối))?`,
    String.raw`(?:ngày\s+mai|mai|hôm\s+nay|tối\s+nay|sáng\s+nay|chiều\s+nay)`,
  ];
  let s = m.body.normalize('NFC');
  for (const p of pats) s = s.replace(new RegExp(B + p + E, 'giu'), '$1');
  s = s.replace(/\s+/g, ' ').replace(/^[\s,.:;\-–]+|[\s,.:;\-–]+$/g, '').trim();
  return s || m.body;
}

// ───────── B1: lưu, xong, bỏ, hoãn, liệt kê ─────────
async function readKey<T>(db: D1Database, key: string): Promise<T | null> {
  const r = await db.prepare('SELECT value FROM app_settings WHERE key=?').bind(key).first<{ value: string }>();
  try { return r ? JSON.parse(r.value) as T : null; } catch { return null; }
}
async function writeKey(db: D1Database, key: string, value: unknown, now: number) {
  await db.prepare('INSERT INTO app_settings (key,value,updated_at) VALUES (?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at').bind(key, JSON.stringify(value), iso(now)).run();
}
const dropKey = (db: D1Database, key: string) => db.prepare('DELETE FROM app_settings WHERE key=?').bind(key).run();
export async function memoOn(db: D1Database) { return (await readKey<{ on?: boolean }>(db, MEMO_SWITCH_KEY))?.on !== false; }

/** Các mốc nhắc của một việc có hẹn (ms). */
export function memoPoints(dueMs: number) {
  return { d1: dueMs - DAY, h12: dueMs - 12 * HOUR, h1: dueMs - HOUR, h0: dueMs, r1: dueMs + 2 * HOUR, r2: dueMs + 4 * HOUR, r3: dueMs + 6 * HOUR } as const;
}
type PointKey = keyof ReturnType<typeof memoPoints>;
const PRE: PointKey[] = ['d1', 'h12', 'h1', 'h0'];
const AFTER: PointKey[] = ['r1', 'r2', 'r3'];

export async function addMemo(db: D1Database, contactId: string, body: string, now: number) {
  const text = clean(body).slice(0, 500);
  const due = parseDue(text, now);
  const sent: Record<string, string> = {};
  // Ghi sát giờ: các mốc đã qua lúc ghi thì bỏ, chỉ nhắc các mốc còn lại.
  if (due) for (const [k, at] of Object.entries(memoPoints(due.at))) if (at < now && PRE.includes(k as PointKey)) sent[k] = 'bo';
  for (let i = 0; i < 3; i++) {
    const next = Number((await db.prepare('SELECT COALESCE(MAX(no),0)+1 AS n FROM zalo_memos WHERE contact_id=?').bind(contactId).first<{ n: number }>())?.n ?? 1);
    const id = crypto.randomUUID();
    const r = await db.prepare("INSERT INTO zalo_memos (id,contact_id,no,body,due_at,due_has_time,status,sent,created_at) VALUES (?,?,?,?,?,?,'mo',?,?) ON CONFLICT DO NOTHING")
      .bind(id, contactId, next, text, due ? iso(due.at) : null, due?.hasTime ? 1 : 0, JSON.stringify(sent), iso(now)).run();
    if (Number(r.meta?.changes ?? 0) > 0) return (await db.prepare('SELECT * FROM zalo_memos WHERE id=?').bind(id).first<Memo>())!;
  }
  throw new Error('memo no');
}
export async function openMemos(db: D1Database, contactId: string) {
  return (await db.prepare("SELECT * FROM zalo_memos WHERE contact_id=? AND status='mo' ORDER BY created_at, no").bind(contactId).all<Memo>()).results;
}
/** Đổi trạng thái theo số, chỉ trong sổ của người đó. Trả các việc đã đổi. */
export async function setMemoStatus(db: D1Database, contactId: string, nos: number[] | 'all', to: 'xong' | 'bo', now: number) {
  const list = (await openMemos(db, contactId)).filter((m) => nos === 'all' || nos.includes(m.no));
  for (const m of list) await db.prepare("UPDATE zalo_memos SET status=?, done_at=? WHERE id=? AND status='mo'").bind(to, iso(now), m.id).run();
  return list;
}
export async function snoozeMemo(db: D1Database, contactId: string, no: number, day: string) {
  const r = await db.prepare("UPDATE zalo_memos SET snooze_day=? WHERE contact_id=? AND no=? AND status='mo'").bind(day, contactId, no).run();
  return Number(r.meta?.changes ?? 0) > 0;
}
export async function doneThisWeek(db: D1Database, contactId: string, now: number) {
  const t = new Date(vnDay(now) + 'T00:00:00Z'), dow = (t.getUTCDay() + 6) % 7;
  const monday = new Date(t.getTime() - dow * DAY).toISOString().slice(0, 10);
  return (await db.prepare("SELECT * FROM zalo_memos WHERE contact_id=? AND status='xong' AND done_at>=? ORDER BY done_at").bind(contactId, iso(vnAt(monday, '00:00'))).all<Memo>()).results;
}

// ───────── Câu trả lời ─────────
const ageDays = (m: Memo, now: number) => Math.max(0, Math.round((Date.parse(vnDay(now)) - Date.parse(vnDay(Date.parse(m.created_at)))) / DAY));
/** Một dòng việc trong danh sách: "5. Duyệt bảng lương · 4 ngày" / "· hẹn 15h hôm nay" / "· quá hẹn". */
export function memoLine(m: Memo, now: number) {
  const due = m.due_at ? (Date.parse(m.due_at) < now ? ` · quá hẹn (${dueLabel(m, now)})` : ` · hẹn ${dueLabel(m, now)}`) : '';
  const age = ageDays(m, now);
  return `${m.no}. ${memoTitle(m)}${due}${age ? ` · ${age} ngày` : ''}`;
}
/** Danh sách việc chưa xong: quá 7 ngày lên đầu, rồi lâu nhất trước. Việc đang hoãn (chưa tới ngày) không hiện. */
export function memoList(list: Memo[], now: number) {
  const today = vnDay(now);
  const show = list.filter((m) => !m.snooze_day || m.snooze_day <= today).sort((a, b) => a.created_at.localeCompare(b.created_at) || a.no - b.no);
  const old = show.filter((m) => ageDays(m, now) > 7), rest = show.filter((m) => ageDays(m, now) <= 7);
  return { show, lines: [...(old.length ? ['⚠️ Để quá 7 ngày, sếp quyết làm hay bỏ:', ...old.map((m) => memoLine(m, now)), ...(rest.length ? [''] : [])] : []), ...rest.map((m) => memoLine(m, now))] };
}
/** Gom dòng thành nhiều tin ≤ 1.800 ký tự, ngăn bởi '\n\f\n' (zalo-work gửi từng tin). */
export function splitLong(lines: string[], max = 1800) {
  const out: string[] = []; let cur = '';
  for (const line of lines) { if (cur && cur.length + 1 + line.length > max) { out.push(cur); cur = `(tiếp) ${line}`; } else cur = cur ? `${cur}\n${line}` : line; }
  if (cur) out.push(cur);
  return out.join('\n\f\n');
}
export const MEMO_HELP = 'Sổ nhắc việc:\n• nhắc việc: mở sổ, mỗi tin một việc · hết: đóng sổ\n• việc nhớ: xem việc chưa xong\n• xong 5 7 · xong hết · bỏ 7 · hoãn 7 tới 20/11\n• đã xong tuần này';

// ───────── B2: xử lý tin của người có sổ ─────────
type Session = { at: number; last: number; nos: number[] };
type Ask = { at: number; kind: 'lenh'; text: string } | { at: number; kind: 'xong'; no: number };
const OPEN_RE = /^(nhac viec|ghi viec|so viec|so nhac viec)$/;
const NOS = String.raw`((?:\d+[\s,]*)+)`;
type MemoCmd = { cmd: 'open' } | { cmd: 'close' } | { cmd: 'list' } | { cmd: 'week' } | { cmd: 'done'; nos: number[] | 'all' } | { cmd: 'drop'; nos: number[] } | { cmd: 'snooze'; no: number; day: string } | { cmd: 'help' };
const nums = (s: string) => [...new Set(s.split(/[\s,]+/).filter(Boolean).map(Number).filter((n) => Number.isSafeInteger(n) && n > 0))];
export function parseMemoCommand(text: string, now: number): MemoCmd | null {
  const s = fold(text);
  if (OPEN_RE.test(s)) return { cmd: 'open' };
  if (/^(het|xong roi het|dong so)$/.test(s)) return { cmd: 'close' };
  if (/^(viec nho|xem viec nho|so viec nho|danh sach viec nho)$/.test(s)) return { cmd: 'list' };
  if (/^(da xong tuan nay|xong tuan nay|viec xong tuan nay)$/.test(s)) return { cmd: 'week' };
  if (/^(xong het|da xong het|xong tat ca)$/.test(s)) return { cmd: 'done', nos: 'all' };
  let m = s.match(new RegExp(String.raw`^(?:da\s+)?xong\s+(?:so\s+)?${NOS}$`));
  if (m) return { cmd: 'done', nos: nums(m[1]) };
  m = s.match(new RegExp(String.raw`^(?:bo|xoa|huy)\s+(?:so\s+)?${NOS}$`));
  if (m) return { cmd: 'drop', nos: nums(m[1]) };
  m = s.match(/^hoan\s+(?:so\s+)?(\d+)\s+(?:toi|den|sang|qua)?\s*(?:ngay\s+)?(.+)$/);
  if (m) { const due = parseDue(` ${m[2]} `, now); if (due) return { cmd: 'snooze', no: Number(m[1]), day: vnDay(due.at) }; }
  if (/^(huong dan nhac viec|nhac viec \?)$/.test(s)) return { cmd: 'help' };
  return null;
}
/** Tin trông như một lệnh (để hỏi lại khi đang mở sổ). */
export function looksLikeCommand(text: string, now: number, other?: (t: string) => boolean) {
  const s = fold(text);
  if (parseMemoCommand(text, now)) return true;
  if (/^(set|dat|cai)\s+kpi$|^(xem\s+)?kpi\b|^hoan\s*tac(\s+kpi)?$|^(ok|huy)$/.test(s)) return true;
  return other ? other(text) : false;
}

async function closeSession(db: D1Database, contactId: string, ses: Session, now: number, auto: boolean) {
  await dropKey(db, OPEN_KEY(contactId));
  const saved = ses.nos.length ? (await db.prepare(`SELECT * FROM zalo_memos WHERE contact_id=? AND no IN (${ses.nos.map(() => '?').join(',')}) AND status='mo' ORDER BY no`).bind(contactId, ...ses.nos).all<Memo>()).results : [];
  if (!saved.length) return auto ? null : 'Em đóng sổ, chưa lưu việc nào.';
  return splitLong([`Em đóng sổ. Vừa lưu ${saved.length} việc:`, ...saved.map((m) => `${m.no}. ${memoTitle(m)}${m.due_at ? ` · hẹn ${dueLabel(m, now)}` : ''}`), `Ghi nhầm thì gõ: bỏ ${saved[0].no}`]);
}

async function runCommand(db: D1Database, owner: Owner, c: MemoCmd, now: number): Promise<string> {
  if (c.cmd === 'list') {
    const all = await openMemos(db, owner.id), { lines, show } = memoList(all, now), today = vnDay(now);
    // Việc đang hoãn (chưa tới ngày) ghi một dòng cuối để sếp biết vẫn còn trong sổ (anh Vũ 15/11/2026).
    const held = all.filter((m) => m.snooze_day && m.snooze_day > today);
    const heldLine = held.length ? [`Đang hoãn: ${held.map((m) => `${m.no}. ${memoTitle(m)} (tới ${dm(m.snooze_day!)})`).join('; ')}`] : [];
    if (!show.length) return held.length ? heldLine.join('\n') : 'Sổ đang trống, không còn việc nào.';
    return splitLong([`Việc sếp đang nhớ (${show.length} việc):`, ...lines, ...heldLine]);
  }
  if (c.cmd === 'week') {
    const list = await doneThisWeek(db, owner.id, now);
    return list.length ? splitLong([`Đã xong tuần này (${list.length} việc):`, ...list.map((m) => `${m.no}. ${memoTitle(m)}`)]) : 'Tuần này chưa có việc nào xong.';
  }
  if (c.cmd === 'done' || c.cmd === 'drop') {
    const list = await setMemoStatus(db, owner.id, c.nos, c.cmd === 'done' ? 'xong' : 'bo', now);
    const left = (await openMemos(db, owner.id)).length;
    if (!list.length) return c.nos === 'all' ? 'Sổ đang trống.' : `Không thấy việc số ${(c.nos as number[]).join(', ')} trong sổ (hoặc đã xong). Gõ "việc nhớ" để xem.`;
    return `${c.cmd === 'done' ? 'Đã xong' : 'Đã bỏ'} ${list.map((m) => `số ${m.no}: ${memoTitle(m)}`).join('; ')}. Còn ${left} việc.`;
  }
  if (c.cmd === 'snooze') {
    return await snoozeMemo(db, owner.id, c.no, c.day) ? `Đã hoãn số ${c.no}, tới ${dm(c.day)} em mới nhắc lại.` : `Không thấy việc số ${c.no} trong sổ.`;
  }
  if (c.cmd === 'help') return MEMO_HELP;
  return '';
}

/** Từ ngữ báo xong kiểu tự nhiên ("vụ phí hoàn xử lý rồi nhé"). */
const DONE_WORDS = /\b(xong|xu ly roi|lam roi|da lam|giai quyet roi|ok roi|da goi|goi roi|hop roi|da hop|duyet roi|da duyet)\b/;
const STOP = new Set(['vu', 'viec', 'nhe', 'roi', 'xong', 'da', 'xu', 'ly', 'lam', 'cai', 'nay', 'do', 'voi', 've', 'cho', 'cua', 'va', 'la', 'thi', 'ok', 'anh', 'chi', 'em', 'sep', 'nha', 'giai', 'quyet', 'goi', 'hop', 'duyet']);
const words = (s: string) => new Set(fold(s).split(/[^a-z0-9]+/).filter((w) => w.length >= 2 && !STOP.has(w)));
/** Việc khớp nhất với câu báo xong kiểu tự nhiên (ít nhất 2 từ chung, hoặc 1 từ nếu sổ chỉ có 1 việc khớp). */
export function guessDone(text: string, list: Memo[]) {
  if (!DONE_WORDS.test(fold(text))) return null;
  const w = words(text);
  const scored = list.map((m) => ({ m, n: [...words(m.body)].filter((x) => w.has(x)).length })).filter((x) => x.n > 0).sort((a, b) => b.n - a.n);
  if (!scored.length || (scored[1] && scored[1].n === scored[0].n)) return null;
  return scored[0].n >= 2 || scored.length === 1 ? scored[0].m : null;
}

/**
 * Tin của người có sổ (người nhận báo cáo sếp). Trả câu trả lời, hoặc null nếu không phải việc của sổ (bot xử lý như cũ).
 * stage 'before': gọi trước các lệnh cũ — chỉ xử lý khi đang mở sổ / đang hỏi lại, hoặc lệnh của sổ.
 * stage 'after': gọi khi các lệnh cũ không nhận — đoán "xong" kiểu tự nhiên.
 * runOther: chạy câu như một lệnh khác (sếp chọn "chạy lệnh" khi đang mở sổ).
 */
export async function memoCommand(db: D1Database, owner: Owner, text: string, now: number, stage: 'before' | 'after', opts: { isOtherCommand?: (t: string) => boolean; runOther?: (t: string) => Promise<string | null> } = {}): Promise<string | null> {
  if (owner.kind !== 'boss' || !await memoOn(db)) return null;
  const s = fold(text);
  let ses = await readKey<Session>(db, OPEN_KEY(owner.id));
  const pre: string[] = [];
  // Sổ đã im quá 15 phút (web vừa khởi động lại, tick chưa kịp đóng): đóng trước rồi mới xử lý tin này.
  if (ses && now - ses.last >= MEMO_IDLE_MS) { const r = await closeSession(db, owner.id, ses, now, true); if (r) pre.push(r); ses = null; }
  const out = (r: string | null) => (r == null ? (pre.length ? pre.join('\n\f\n') : null) : [...pre, r].join('\n\f\n'));
  const ask = await readKey<Ask>(db, ASK_KEY(owner.id));
  if (ask && now - ask.at < ASK_MS) {
    if (ask.kind === 'lenh' && /^(1|luu|luu viec|luu thanh viec)$/.test(s)) {
      await dropKey(db, ASK_KEY(owner.id));
      return out(await saveLines(db, owner, ses, ask.text, now));
    }
    if (ask.kind === 'lenh' && /^(2|chay|chay lenh|lenh)$/.test(s)) {
      await dropKey(db, ASK_KEY(owner.id));
      const c = parseMemoCommand(ask.text, now);
      if (c && c.cmd !== 'open') return out(c.cmd === 'close' && ses ? await closeSession(db, owner.id, ses, now, false) : await runCommand(db, owner, c, now));
      return out((await opts.runOther?.(ask.text)) ?? 'Em chưa chạy được lệnh này.');
    }
    if (ask.kind === 'xong' && /^(co|dung|uh|u|ok|vang|da|dung roi)$/.test(s)) {
      await dropKey(db, ASK_KEY(owner.id));
      return out(await runCommand(db, owner, { cmd: 'done', nos: [ask.no] }, now));
    }
    if (ask.kind === 'xong' && /^(khong|ko|k|sai|chua)$/.test(s)) { await dropKey(db, ASK_KEY(owner.id)); return out('Dạ, em giữ nguyên việc đó.'); }
    await dropKey(db, ASK_KEY(owner.id));
  }
  const c = parseMemoCommand(text, now);
  if (ses) {
    if (c?.cmd === 'close') return out(await closeSession(db, owner.id, ses, now, false));
    if (c?.cmd === 'open') { await writeKey(db, OPEN_KEY(owner.id), { ...ses, last: now }, now); return out('Sổ đang mở, sếp cứ nhắn tiếp. Xong thì gõ: hết.'); }
    if (looksLikeCommand(text, now, opts.isOtherCommand)) {
      await writeKey(db, ASK_KEY(owner.id), { at: now, kind: 'lenh', text }, now);
      await writeKey(db, OPEN_KEY(owner.id), { ...ses, last: now }, now);
      return out(`Sếp muốn lưu câu "${clean(text).slice(0, 80)}" thành việc hay chạy lệnh?\nGõ 1: lưu thành việc · 2: chạy lệnh`);
    }
    return out(await saveLines(db, owner, ses, text, now));
  }
  if (stage === 'before') {
    if (!c) return out(null);
    if (c.cmd === 'open') {
      await writeKey(db, OPEN_KEY(owner.id), { at: now, last: now, nos: [] }, now);
      return out('Em đang ghi. Sếp nhắn từng việc, mỗi tin một việc.\nXong thì gõ: hết. Im 15 phút em tự đóng.');
    }
    if (c.cmd === 'close') return out(null);
    return out(await runCommand(db, owner, c, now));
  }
  // stage 'after': đoán báo xong kiểu tự nhiên
  const hit = guessDone(text, await openMemos(db, owner.id));
  if (hit) {
    await writeKey(db, ASK_KEY(owner.id), { at: now, kind: 'xong', no: hit.no }, now);
    return out(`Sếp muốn đánh dấu xong số ${hit.no} “${hit.body}” đúng không? Gõ: có hoặc không`);
  }
  return out(null);
}

async function saveLines(db: D1Database, owner: Owner, ses: Session | null, text: string, now: number) {
  const lines = text.split(/\r?\n/).map(clean).filter(Boolean);
  const saved: Memo[] = [];
  for (const line of lines) saved.push(await addMemo(db, owner.id, line, now));
  const next: Session = ses ? { ...ses, last: now, nos: [...ses.nos, ...saved.map((m) => m.no)] } : { at: now, last: now, nos: saved.map((m) => m.no) };
  await writeKey(db, OPEN_KEY(owner.id), next, now);
  // Luôn có câu "Đã ghi số …" (Zalo đôi khi làm rơi tin: không thấy câu này là bot chưa nhận).
  return saved.map((m) => `Đã ghi số ${m.no}${m.due_at ? `, hẹn ${dueLabel(m, now)}` : ''}.`).join('\n');
}

// ───────── B3: nhắc theo giờ (gọi mỗi phút) ─────────
const quiet = (ms: number) => { const h = Number(vnTime(ms).slice(0, 2)); return h >= 22 || h < 6; };
/** Mốc nhắc trước rơi vào 22h–6h gửi sớm lúc 21h30 tối hôm trước / cùng tối. */
const earlier = (ms: number) => { const h = Number(vnTime(ms).slice(0, 2)), day = vnDay(ms); return vnAt(h >= 22 ? day : vnDay(ms - DAY), '21:30'); };
/** "1 ngày" / "12 tiếng" / "1 tiếng 30 phút" / "20 phút" — thời gian còn lại thật (mốc đêm gửi sớm lúc 21h30 nên có thể lẻ). */
function leftText(ms: number) {
  const min = Math.round(ms / 60000);
  if (min >= 20 * 60) return `${Math.round(min / 1440) || 1} ngày`;
  const h = Math.floor(min / 60), mi = min % 60;
  return h ? `${h} tiếng${mi ? ` ${mi} phút` : ''}` : `${mi} phút`;
}
export function reminderText(m: Memo, key: PointKey, now: number) {
  const when = dueLabel(m, now), left = Date.parse(m.due_at!) - now;
  const title = memoTitle(m);
  if (PRE.includes(key) && left > 0) return `Nhắc sếp: còn ${leftText(left)} nữa, ${when}: ${title} (việc số ${m.no}).`;
  if (key === 'h0' || PRE.includes(key)) return `Tới giờ (${when}): ${title} (việc số ${m.no}). Xong thì gõ: xong ${m.no}`;
  const late = { r1: 2, r2: 4, r3: 6 }[key as 'r1' | 'r2' | 'r3'];
  return `Việc số ${m.no} đã quá hẹn ${late} tiếng (hẹn ${when}): ${title}. Sếp xong chưa? Gõ: xong ${m.no} hoặc hoãn ${m.no} tới ngày khác.`;
}
/** Mốc nhắc đã quá hơn 15 phút (web tắt / khởi động lại) thì bỏ, không gửi dồn (anh Vũ 15/11/2026). */
export const MEMO_STALE_MS = 15 * 60000;
/** Việc cần nhắc lúc now: chỉ gửi mốc gần nhất còn đúng (tới hạn chưa quá 15 phút); mốc quá hơn thì bỏ. Mỗi việc tối đa một tin. */
export function dueReminders(m: Memo, now: number): { send: PointKey | null; mark: Record<string, string> } {
  if (m.status !== 'mo' || !m.due_at) return { send: null, mark: {} };
  const sent = JSON.parse(m.sent || '{}') as Record<string, string>;
  const pts = memoPoints(Date.parse(m.due_at)), mark: Record<string, string> = {};
  let send: PointKey | null = null;
  for (const k of [...PRE, ...AFTER]) {
    if (sent[k]) continue;
    const at = PRE.includes(k) && quiet(pts[k]) ? earlier(pts[k]) : pts[k];
    if (at > now) continue;
    if (AFTER.includes(k) && quiet(pts[k])) { mark[k] = 'dem'; continue; }
    if (m.snooze_day && m.snooze_day > vnDay(now)) { mark[k] = 'hoan'; continue; }
    if (now - at > MEMO_STALE_MS) { mark[k] = 'tre'; continue; }
    if (send) mark[send] = 'qua';
    send = k;
  }
  if (send) mark[send] = iso(now);
  return { send, mark };
}

/** Mỗi phút: đóng sổ im 15 phút, nhắc việc có hẹn, tin 8h15. send(chatId, text). */
export async function memoTick(db: D1Database, now: number, send: (chatId: string, text: string) => Promise<unknown>) {
  if (!await memoOn(db)) return;
  const owners = (await db.prepare("SELECT id, kind, chat_id FROM zalo_contacts WHERE kind='boss' AND active=1 AND chat_id IS NOT NULL").all<Owner>()).results;
  if (!owners.length) return;
  const post = async (o: Owner, body: string) => { for (const part of body.split('\n\f\n')) { try { await send(o.chat_id!, part); } catch { console.error('zalo memo send failed'); } } };
  for (const o of owners) {
    const ses = await readKey<Session>(db, OPEN_KEY(o.id));
    if (ses && now - ses.last >= MEMO_IDLE_MS) { const r = await closeSession(db, o.id, ses, now, true); if (r) await post(o, r); }
  }
  const ids = owners.map((o) => o.id);
  const withDue = (await db.prepare(`SELECT * FROM zalo_memos WHERE status='mo' AND due_at IS NOT NULL AND due_at<=? AND contact_id IN (${ids.map(() => '?').join(',')})`)
    .bind(iso(now + DAY + HOUR), ...ids).all<Memo>()).results;
  for (const m of withDue) {
    const { send: key, mark } = dueReminders(m, now);
    if (!Object.keys(mark).length) continue;
    // Ghi mốc trước (có điều kiện theo bản cũ) rồi mới gửi: web khởi động lại giữa chừng cũng không gửi 2 lần.
    const next = JSON.stringify({ ...JSON.parse(m.sent || '{}'), ...mark });
    const r = await db.prepare('UPDATE zalo_memos SET sent=? WHERE id=? AND sent=?').bind(next, m.id, m.sent).run();
    if (!Number(r.meta?.changes ?? 0) || !key) continue;
    const o = owners.find((x) => x.id === m.contact_id);
    if (o) await post(o, reminderText(m, key, now));
  }
  // 8h15 mỗi ngày (cả Chủ nhật): danh sách việc chưa xong; mỗi ngày một lần dù web khởi động lại.
  const day = vnDay(now);
  // Chỉ gửi 8h15–9h (web tắt lúc đó thì thôi, không gửi muộn giữa ngày).
  if (vnTime(now) < MEMO_DAILY_TIME || vnTime(now) >= '09:00') return;
  const st = await readKey<{ day: string; done: string[] }>(db, DAILY_KEY);
  const done = st?.day === day ? st.done : [];
  for (const o of owners) {
    if (done.includes(o.id)) continue;
    done.push(o.id);
    await writeKey(db, DAILY_KEY, { day, done }, now);
    const { lines, show } = memoList(await openMemos(db, o.id), now);
    if (!show.length) continue;
    await post(o, splitLong([`Việc sếp đang nhớ (${show.length} việc):`, ...lines, '', `Việc nào xong rồi sếp gõ: xong ${show.slice(0, 2).map((m) => m.no).join(' ')}`, 'Chưa xong thì không cần trả lời, mai em nhắc tiếp.']));
  }
}
