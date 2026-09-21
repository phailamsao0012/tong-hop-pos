// Tuyển dụng: nhận ảnh chụp (snapshot) các tab Google Sheets do Apps Script đẩy về, so với bản đã lưu, ghi sự kiện
// (mới / sửa / xoá / có CV) và báo Telegram cho các chat admin sau khi gộp các lần sửa trong ~90 giây.
// Cột được nhận diện bằng biểu thức chính quy trên tiêu đề (mỗi file đặt tên cột hơi khác nhau); toàn bộ dòng vẫn lưu ở data_json.
import { env } from 'cloudflare:workers';
import { adminChatIds } from '@/lib/bot-access';
import { sendDocumentBlob, sendTelegram } from '@/lib/telegram';

/** Chat nhận tin tuyển dụng: các chat admin của bot (trừ chat đã /tuyendung tat) + chat đã /tuyendung bat. */
export async function recruitChatIds() {
  const [admins, rows] = await Promise.all([
    adminChatIds(),
    env.DB.prepare("SELECT key, value FROM app_settings WHERE key LIKE 'recruit_chat:%'").all<{ key: string; value: string }>(),
  ]);
  const set = new Set(admins);
  for (const r of rows.results) { const id = r.key.slice('recruit_chat:'.length); if (r.value === 'on') set.add(id); else set.delete(id); }
  return [...set];
}
export async function recruitSubscribed(chatId: string) {
  const row = await env.DB.prepare('SELECT value FROM app_settings WHERE key=?').bind(`recruit_chat:${chatId}`).first<{ value: string }>();
  if (row) return row.value === 'on';
  return (await adminChatIds()).includes(chatId);
}
export async function setRecruitSubscription(chatId: string, on: boolean) {
  await env.DB.prepare('INSERT INTO app_settings (key,value,updated_at) VALUES (?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at')
    .bind(`recruit_chat:${chatId}`, on ? 'on' : 'off', new Date().toISOString()).run();
}

export type SnapshotPayload = {
  file: { id: string; name?: string };
  tabs: { name: string; gid?: string | number; headers: string[]; rows: { n: number; v: (string | number | null)[]; links?: Record<string, string> }[] }[];
};
export type CandidateRow = {
  id: string; file_id: string; file_name: string; tab: string; row_num: number; name: string; phone: string | null; position: string | null; team: string | null;
  handler: string | null; birth_year: string | null; received_on: string | null; cv_url: string | null; cv_file_id: string | null; status: string; data_json: string;
  first_seen_at: string; updated_at: string; deleted_at: string | null;
};
export type Change = { col: string; from: string; to: string };

export const STATUS_LABELS: Record<string, string> = {
  new: 'Mới nhận CV', review: 'Đang xem xét', booked: 'Đã book lịch PV', rejected: 'Loại', interviewed: 'Đã đến PV', passed: 'Pass PV', trial: 'Thử việc / nhận việc', failed: 'Không pass',
};
const DEBOUNCE_MS = 90000;
// Tab không phải danh sách ứng viên (JD, báo cáo, checklist…): vẫn lưu để xem trên web nhưng không báo Telegram.
export const SILENT_TAB = /\bjd\b|báo cáo|bao cao|checklist|thông tin jd/i;

const clean = (v: unknown) => String(v ?? '').replace(/\s+/g, ' ').trim();
const norm = (v: string) => v.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase();
const find = (headers: string[], re: RegExp, exclude?: RegExp) => headers.findIndex((h) => re.test(h) && !(exclude && exclude.test(h)));
const COLS = {
  name: /họ.*tên|tên ứng viên|họ và tên/i,
  phone: /số điện thoại|sđt|điện thoại/i,
  received: /ngày.*cv|ngày tháng|ngày cv về/i,
  handler: /nhân sự.*phụ trách|người tuyển|phụ trách/i,
  birth: /năm sinh/i,
  position: /vị trí/i,
  team: /^team|thuộc team|\bteam\b/i,
  cv: /link cv|cv ứng viên|^cv\b|^cv$/i,
  evalCv: /sếp đánh giá|đánh giá cv|duyệt cv|cv được duyệt|duyệt phỏng vấn|^duyệt/i,
  attended: /đến pv|đén pv|có đến pv/i,
  pass: /pass/i,
  trial: /thử việc|nhận việc|đến tv|bắt đầu làm/i,
  reject: /lý do loại/i,
};
export const driveFileId = (url: string | null | undefined) => {
  if (!url) return null;
  const m = url.match(/\/d\/([A-Za-z0-9_-]{20,})/) ?? url.match(/[?&]id=([A-Za-z0-9_-]{20,})/) ?? url.match(/\/file\/d\/([A-Za-z0-9_-]{20,})/);
  return m ? m[1] : null;
};
const yes = (v: string) => /^(có|co|x|yes|đạt|dat|pass|ok|✓|v)\b/i.test(norm(v)) && !/không|khong|ko\b/i.test(norm(v));
const no = (v: string) => /không|khong|^ko\b|loại|loai|fail|rớt|rot|trượt|truot/i.test(norm(v));
/** Suy ra trạng thái từ các cột đánh giá / đến PV / pass / thử việc (ưu tiên bước sau cùng). */
export function deriveStatus(data: Record<string, string>, headers: string[]): string {
  const at = (re: RegExp) => { const i = find(headers, re); return i >= 0 ? clean(data[headers[i]]) : ''; };
  const trial = at(COLS.trial), pass = at(COLS.pass), attended = at(COLS.attended), ev = at(COLS.evalCv);
  if (trial && !no(trial)) return 'trial';
  if (pass) { if (yes(pass)) return 'passed'; if (no(pass)) return 'failed'; }
  if (attended && yes(attended)) return 'interviewed';
  if (ev) {
    const e = norm(ev);
    if (/loai|khong phu hop|khong dat|tu choi/.test(e)) return 'rejected';
    if (/book|dat|co\b|duyet|ok|pass/.test(e)) return 'booked';
    if (/xem xet|cho|can nhac/.test(e)) return 'review';
  }
  return 'new';
}
const normPhone = (v: string) => { const d = v.replace(/\D/g, ''); return d.length >= 9 ? (d.startsWith('84') && d.length === 11 ? `0${d.slice(2)}` : d) : ''; };
const keyOf = (fileId: string, tab: string, name: string, phone: string, n: number) => {
  const nm = norm(name).replace(/[^a-z0-9]+/g, ' ').trim();
  return nm ? `${fileId}:${tab}:${nm}|${phone}` : `${fileId}:${tab}:row:${n}`;
};

/** Nhận snapshot một file (mọi tab): upsert ứng viên, ghi sự kiện; trả về danh sách CV cần Apps Script tải lên. */
export async function ingestSnapshot(p: SnapshotPayload) {
  const db = env.DB;
  const now = new Date().toISOString();
  const fileId = String(p.file.id), fileName = clean(p.file.name);
  const existing = new Map<string, CandidateRow>();
  const rows = await db.prepare('SELECT * FROM recruit_candidates WHERE file_id=?').bind(fileId).all<CandidateRow>();
  for (const r of rows.results) existing.set(r.id, r);
  const seen = new Set<string>();
  const statements: D1PreparedStatement[] = [];
  const needCv: { id: string; url: string; fileId: string }[] = [];
  const tabsMeta: { name: string; headers: string[]; rows: number }[] = [];
  let changed = 0, created = 0, deleted = 0;
  const cvRows = await db.prepare('SELECT candidate_id, drive_file_id FROM recruit_cv WHERE candidate_id IN (SELECT id FROM recruit_candidates WHERE file_id=?)').bind(fileId).all<{ candidate_id: string; drive_file_id: string }>();
  const cvHave = new Map(cvRows.results.map((r) => [r.candidate_id, r.drive_file_id]));

  for (const tab of p.tabs ?? []) {
    const headers = (tab.headers ?? []).map(clean);
    const tabName = clean(tab.name);
    if (!headers.some(Boolean)) continue;
    const iName = find(headers, COLS.name), iPhone = find(headers, COLS.phone), iRecv = find(headers, COLS.received), iHandler = find(headers, COLS.handler, /ứng viên/i);
    const iBirth = find(headers, COLS.birth), iPos = find(headers, COLS.position), iTeam = find(headers, COLS.team), iCv = find(headers, COLS.cv, /duyệt|đánh giá|được/i);
    let count = 0;
    for (const row of tab.rows ?? []) {
      const vals = (row.v ?? []).map(clean);
      const data: Record<string, string> = {};
      headers.forEach((h, i) => { if (h && vals[i]) data[h] = vals[i]; });
      const name = iName >= 0 ? vals[iName] ?? '' : '';
      if (!name) continue; // dòng trống / dòng ghi chú
      count++;
      const phone = iPhone >= 0 ? normPhone(vals[iPhone] ?? '') : '';
      const links = row.links ?? {};
      const cvUrl = (iCv >= 0 ? links[String(iCv)] : undefined) ?? Object.values(links)[0] ?? null;
      const id = keyOf(fileId, tabName, name, phone, row.n);
      if (seen.has(id)) continue;
      seen.add(id);
      const status = deriveStatus(data, headers);
      const next = {
        name, phone: phone || null, position: iPos >= 0 ? vals[iPos] || null : null, team: iTeam >= 0 ? vals[iTeam] || null : null,
        handler: iHandler >= 0 ? vals[iHandler] || null : null, birth_year: iBirth >= 0 ? vals[iBirth] || null : null, received_on: iRecv >= 0 ? vals[iRecv] || null : null,
        cv_url: cvUrl, cv_file_id: driveFileId(cvUrl), status, data_json: JSON.stringify(data), row_num: row.n,
      };
      const prev = existing.get(id);
      if (!prev) {
        created++;
        statements.push(db.prepare(`INSERT INTO recruit_candidates (id,file_id,file_name,tab,row_num,name,phone,position,team,handler,birth_year,received_on,cv_url,cv_file_id,status,data_json,first_seen_at,updated_at,deleted_at)
          VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,NULL)`).bind(id, fileId, fileName, tabName, next.row_num, next.name, next.phone, next.position, next.team, next.handler, next.birth_year, next.received_on, next.cv_url, next.cv_file_id, next.status, next.data_json, now, now));
        statements.push(db.prepare('INSERT INTO recruit_events (candidate_id,kind,changes_json,created_at) VALUES (?,?,?,?)').bind(id, 'new', '[]', now));
      } else {
        const before = JSON.parse(prev.data_json || '{}') as Record<string, string>;
        const changes: Change[] = [];
        for (const col of new Set([...Object.keys(before), ...Object.keys(data)])) {
          if ((before[col] ?? '') !== (data[col] ?? '')) changes.push({ col, from: before[col] ?? '', to: data[col] ?? '' });
        }
        const cvChanged = (prev.cv_file_id ?? '') !== (next.cv_file_id ?? '') || (prev.cv_url ?? '') !== (next.cv_url ?? '');
        if (changes.length || cvChanged || prev.deleted_at || prev.status !== status) {
          changed++;
          statements.push(db.prepare(`UPDATE recruit_candidates SET file_name=?, row_num=?, name=?, phone=?, position=?, team=?, handler=?, birth_year=?, received_on=?, cv_url=?, cv_file_id=?, status=?, data_json=?, updated_at=?, deleted_at=NULL WHERE id=?`)
            .bind(fileName, next.row_num, next.name, next.phone, next.position, next.team, next.handler, next.birth_year, next.received_on, next.cv_url, next.cv_file_id, status, next.data_json, now, id));
          if (changes.length || cvChanged) {
            if (cvChanged && next.cv_url) changes.push({ col: 'CV', from: prev.cv_url ? 'file cũ' : '', to: 'file mới' });
            statements.push(db.prepare('INSERT INTO recruit_events (candidate_id,kind,changes_json,created_at) VALUES (?,?,?,?)').bind(id, prev.deleted_at ? 'new' : 'update', JSON.stringify(changes), now));
          }
        } else if (prev.row_num !== next.row_num) {
          statements.push(db.prepare('UPDATE recruit_candidates SET row_num=? WHERE id=?').bind(next.row_num, id));
        }
      }
      if (next.cv_file_id && cvHave.get(id) !== next.cv_file_id) needCv.push({ id, url: next.cv_url!, fileId: next.cv_file_id });
    }
    tabsMeta.push({ name: tabName, headers, rows: count });
  }
  // Dòng không còn trong file (đã xoá) → đánh dấu xoá + sự kiện.
  const tabNames = new Set(tabsMeta.map((t) => t.name));
  for (const [id, prev] of existing) {
    if (seen.has(id) || prev.deleted_at || !tabNames.has(prev.tab)) continue;
    deleted++;
    statements.push(db.prepare('UPDATE recruit_candidates SET deleted_at=?, updated_at=? WHERE id=?').bind(now, now, id));
    statements.push(db.prepare('INSERT INTO recruit_events (candidate_id,kind,changes_json,created_at) VALUES (?,?,?,?)').bind(id, 'delete', '[]', now));
  }
  // Nạp hàng loạt (lần đầu cài script, thêm file/tab mới): không báo từng người mà gửi một tin tóm tắt; các sự kiện "new" coi như đã báo.
  const bulk = created > BULK_THRESHOLD;
  if (bulk) {
    const newIds = statements.length ? [...seen].filter((id) => !existing.has(id)) : [];
    for (let i = 0; i < newIds.length; i += 90) {
      const chunk = newIds.slice(i, i + 90);
      statements.push(db.prepare(`UPDATE recruit_events SET notified_at=? WHERE kind='new' AND notified_at IS NULL AND candidate_id IN (${chunk.map(() => '?').join(',')})`).bind(now, ...chunk));
    }
  }
  statements.push(db.prepare(`INSERT INTO recruit_sources (file_id,file_name,tabs_json,last_snapshot_at,last_change_at) VALUES (?,?,?,?,?)
    ON CONFLICT(file_id) DO UPDATE SET file_name=excluded.file_name, tabs_json=excluded.tabs_json, last_snapshot_at=excluded.last_snapshot_at, last_change_at=COALESCE(excluded.last_change_at, recruit_sources.last_change_at)`)
    .bind(fileId, fileName, JSON.stringify(tabsMeta), now, created || changed || deleted ? now : null));
  // Sự kiện "new" được chèn TRƯỚC câu UPDATE đánh dấu ở trên trong cùng lô nên thứ tự đúng.
  for (let i = 0; i < statements.length; i += 100) await db.batch(statements.slice(i, i + 100));
  if (bulk) {
    const token = env.TELEGRAM_BOT_TOKEN?.trim();
    const chats = token ? await recruitChatIds() : [];
    const text = [`📥 <b>Đã nạp ${vi(created)} ứng viên từ "${esc(fileName)}"</b>`, ...tabsMeta.filter((t) => t.rows).map((t) => `• ${esc(t.name)}: ${vi(t.rows)} ứng viên`), 'Xem đầy đủ ở web › Nhân sự › Tuyển dụng. Từ giờ chỉ báo khi có ứng viên mới hoặc sửa.'].join('\n');
    for (const chat of chats) { try { await sendTelegram(token!, chat, text); } catch (error) { console.error('recruit bulk notify failed', error); } }
  }
  return { created, changed, deleted, needCv: needCv.slice(0, 20), candidates: seen.size, bulk };
}
const vi = (n: number) => new Intl.NumberFormat('vi-VN').format(n);
const BULK_THRESHOLD = 15;

/** Apps Script tải CV lên (multipart). Gửi ngay lên Telegram nếu ứng viên đã được báo trước đó; nếu chưa, chờ tin "ứng viên mới" gửi kèm. */
export async function attachCv(candidateId: string, driveFileId: string, file: File) {
  const db = env.DB;
  const now = new Date().toISOString();
  const cand = await db.prepare('SELECT * FROM recruit_candidates WHERE id=?').bind(candidateId).first<CandidateRow>();
  if (!cand) return { ok: false, error: 'Không có ứng viên này.' };
  const token = env.TELEGRAM_BOT_TOKEN?.trim();
  const chats = token ? await recruitChatIds() : [];
  const pendingNew = await db.prepare("SELECT id FROM recruit_events WHERE candidate_id=? AND kind='new' AND notified_at IS NULL").bind(candidateId).all<{ id: number }>();
  let telegramFileId: string | null = null, sentAt: string | null = null;
  // Gửi lên Telegram ngay để có file_id (web xem lại qua /api/recruit/cv). Nếu tin "ứng viên mới" chưa gửi thì gửi luôn tin đó
  // kèm file (không chờ 90 giây) rồi đánh dấu các sự kiện đang chờ là đã báo; sửa thêm sau đó sẽ báo thành "cập nhật".
  if (token && chats.length && !SILENT_TAB.test(cand.tab)) {
    const isNew = pendingNew.results.length > 0;
    const full = candidateText(cand, '🆕 <b>Ứng viên mới</b>');
    const short = `📎 CV của <b>${esc(cand.name)}</b>${cand.position ? ` · ${esc(cand.position)}` : ''}${cand.handler ? ` · ${esc(cand.handler)}` : ''}\n${esc(cand.file_name)} › ${esc(cand.tab)}`;
    for (const chat of chats) {
      try {
        let fid: string | null;
        if (isNew && full.length <= 1000) fid = await sendDocumentBlob(token, chat, file, file.name || 'cv.pdf', full);
        else { if (isNew) await sendTelegram(token, chat, full); fid = await sendDocumentBlob(token, chat, file, file.name || 'cv.pdf', short); }
        telegramFileId ??= fid; sentAt = now;
      } catch (error) { console.error('recruit cv send failed', error); }
    }
    if (isNew && sentAt) await db.prepare("UPDATE recruit_events SET notified_at=? WHERE candidate_id=? AND notified_at IS NULL").bind(now, candidateId).run();
  }
  await db.prepare(`INSERT INTO recruit_cv (candidate_id,drive_file_id,name,mime,size,telegram_file_id,sent_at,updated_at) VALUES (?,?,?,?,?,?,?,?)
    ON CONFLICT(candidate_id) DO UPDATE SET drive_file_id=excluded.drive_file_id, name=excluded.name, mime=excluded.mime, size=excluded.size, telegram_file_id=COALESCE(excluded.telegram_file_id, recruit_cv.telegram_file_id), sent_at=COALESCE(excluded.sent_at, recruit_cv.sent_at), updated_at=excluded.updated_at`)
    .bind(candidateId, driveFileId, file.name || '', file.type || '', file.size, telegramFileId, sentAt, now).run();
  return { ok: true, sent: !!sentAt };
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const FIELD_ORDER: [RegExp, string][] = [
  [COLS.received, 'Ngày CV về'], [COLS.handler, 'Phụ trách'], [COLS.birth, 'Năm sinh'], [COLS.position, 'Vị trí'], [COLS.team, 'Team'], [COLS.phone, 'SĐT'],
  [COLS.evalCv, 'Đánh giá'], [/lịch phỏng vấn|thời gian pv|ngày phỏng vấn|ngày pv|giờ pv|giờ phỏng vấn/i, 'Lịch PV'], [COLS.attended, 'Đến PV'], [COLS.pass, 'Pass PV'],
  [/note|ghi chú|kết quả|kn làm việc/i, 'Ghi chú'], [COLS.trial, 'Thử việc'], [/nguồn/i, 'Nguồn'], [/email/i, 'Email'],
];
/** Nội dung đầy đủ một ứng viên cho Telegram: cột nhận diện được đi trước, cột khác liệt kê sau. */
export function candidateText(c: CandidateRow, title: string) {
  const data = JSON.parse(c.data_json || '{}') as Record<string, string>;
  const lines = [`${title}`, `👤 <b>${esc(c.name)}</b>${c.birth_year ? ` (${esc(c.birth_year)})` : ''} — ${esc(c.position || 'chưa ghi vị trí')}`, `📄 ${esc(c.file_name)} › ${esc(c.tab)} · dòng ${c.row_num} · ${esc(STATUS_LABELS[c.status] ?? c.status)}`];
  const used = new Set<string>();
  for (const [re, label] of FIELD_ORDER) {
    for (const [col, val] of Object.entries(data)) {
      if (used.has(col) || !re.test(col) || COLS.name.test(col) || COLS.cv.test(col) && !/đánh giá|duyệt/i.test(col)) continue;
      if (/stt|^tt$/i.test(col)) continue;
      used.add(col); lines.push(`• ${label}${label !== col ? ` (${esc(col)})` : ''}: ${esc(val)}`);
    }
  }
  for (const [col, val] of Object.entries(data)) {
    if (used.has(col) || COLS.name.test(col) || /^(stt|tt)$/i.test(col) || /^link$/i.test(val)) continue;
    lines.push(`• ${esc(col)}: ${esc(val)}`);
  }
  if (c.cv_url) lines.push(`🔗 CV: ${esc(c.cv_url)}`);
  const text = lines.join('\n');
  return text.length > 3900 ? `${text.slice(0, 3880)}…` : text; // Telegram tối đa 4096 ký tự
}

/** Mốc sớm nhất mà sự kiện đang chờ đủ 90 giây "lắng" (để bộ hẹn giờ quay lại đúng lúc), null = không còn gì chờ. */
export async function nextRecruitFlushAt(): Promise<number | null> {
  const r = await env.DB.prepare('SELECT MIN(created_at) AS t FROM recruit_events WHERE notified_at IS NULL').first<{ t: string | null }>();
  return r?.t ? Date.parse(r.t) + DEBOUNCE_MS + 5000 : null;
}

/** Gửi Telegram các sự kiện đã "lắng" ≥ 90 giây, gộp theo ứng viên. Gọi từ bộ hẹn giờ. */
export async function flushRecruitNotifications() {
  const db = env.DB;
  const token = env.TELEGRAM_BOT_TOKEN?.trim();
  const cutoff = new Date(Date.now() - DEBOUNCE_MS).toISOString();
  const pending = await db.prepare('SELECT id, candidate_id, kind, changes_json, created_at FROM recruit_events WHERE notified_at IS NULL AND created_at<=? ORDER BY created_at LIMIT 200')
    .bind(cutoff).all<{ id: number; candidate_id: string; kind: string; changes_json: string; created_at: string }>();
  if (!pending.results.length) return 0;
  // Nếu ứng viên còn sự kiện mới hơn mốc lắng → để lượt sau (đang gõ dở).
  const fresh = await db.prepare('SELECT DISTINCT candidate_id FROM recruit_events WHERE notified_at IS NULL AND created_at>?').bind(cutoff).all<{ candidate_id: string }>();
  const hot = new Set(fresh.results.map((r) => r.candidate_id));
  const groups = new Map<string, typeof pending.results>();
  for (const e of pending.results) { if (hot.has(e.candidate_id)) continue; if (!groups.has(e.candidate_id)) groups.set(e.candidate_id, []); groups.get(e.candidate_id)!.push(e); }
  if (!groups.size) return 0;
  const chats = token ? await recruitChatIds() : [];
  const now = new Date().toISOString();
  let sent = 0;
  for (const [candidateId, events] of groups) {
    const c = await db.prepare('SELECT * FROM recruit_candidates WHERE id=?').bind(candidateId).first<CandidateRow>();
    const ids = events.map((e) => e.id);
    const markDone = () => db.prepare(`UPDATE recruit_events SET notified_at=? WHERE id IN (${ids.map(() => '?').join(',')})`).bind(now, ...ids).run();
    if (!c || !token || !chats.length || SILENT_TAB.test(c.tab)) { await markDone(); continue; }
    const kinds = new Set(events.map((e) => e.kind));
    let text: string;
    if (kinds.has('new')) text = candidateText(c, '🆕 <b>Ứng viên mới</b>');
    else if (kinds.has('delete') && !kinds.has('update')) text = `🗑 <b>Đã xoá khỏi bảng</b>\n👤 <b>${esc(c.name)}</b> — ${esc(c.position || '')}\n📄 ${esc(c.file_name)} › ${esc(c.tab)}`;
    else {
      const changes = events.flatMap((e) => { try { return JSON.parse(e.changes_json) as Change[]; } catch { return []; } });
      const merged = new Map<string, Change>();
      for (const ch of changes) { const m = merged.get(ch.col); merged.set(ch.col, m ? { col: ch.col, from: m.from, to: ch.to } : ch); }
      const lines = [`✏️ <b>Cập nhật ứng viên</b>`, `👤 <b>${esc(c.name)}</b>${c.birth_year ? ` (${esc(c.birth_year)})` : ''} — ${esc(c.position || '')}${c.handler ? ` · ${esc(c.handler)}` : ''}`, `📄 ${esc(c.file_name)} › ${esc(c.tab)} · dòng ${c.row_num} · ${esc(STATUS_LABELS[c.status] ?? c.status)}`];
      for (const ch of merged.values()) if (ch.from !== ch.to) lines.push(`• ${esc(ch.col)}: ${ch.from ? `<s>${esc(ch.from)}</s> → ` : ''}<b>${esc(ch.to || '(xoá)')}</b>`);
      text = lines.join('\n');
    }
    let ok = 0, throttled = false;
    for (const chat of chats) {
      try { await sendTelegram(token, chat, text); ok++; sent++; }
      catch (error) { const msg = error instanceof Error ? error.message : String(error); if (/429|Too Many Requests|retry after/i.test(msg)) throttled = true; console.error('recruit notify failed', msg); }
    }
    // Telegram giới hạn tốc độ (429): để lại lượt sau; lỗi khác (nội dung, chat bị chặn…) thì bỏ qua để không kẹt hàng đợi.
    if (ok || !throttled) await markDone();
    else break;
  }
  return sent;
}
