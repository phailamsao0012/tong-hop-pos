// Giao việc dạng chat (29/10): lưu tin hai chiều với leader/nhân viên, đọc cho tab Chat. Không import React.
import type { Contact, Task, Meeting, Actor } from '@/lib/zalo/zalo-work';
export type ChatKind = 'text' | 'task' | 'meeting' | 'status';
export type ChatMessage = { id: string; contact_id: string; dir: 'in' | 'out'; kind: ChatKind; ref_no: number | null; body: string; author_id: string | null; author_name?: string | null; delivered: number; created_at: string; read_at: string | null };
export type Conversation = Pick<Contact, 'id' | 'name' | 'kind' | 'team_name' | 'dept' | 'leader_id'> & { linked: boolean; last: { body: string; dir: 'in' | 'out'; at: string } | null; unread: number; open: number; overdue: number; nextMeeting: string | null; waiting: boolean };
export type ChatMeeting = Meeting & { yes: number; noAnswer: number; pending: number; answer: string | null; reason: string };
const DAY = 86400000, KEEP_DAYS = 180;
const iso = (now: number) => new Date(now).toISOString();
const vnNow = (now: number) => new Date(now + 7 * 3600000).toISOString();
function fail(message: string): never { throw new Error(message); }

/** Ghi 1 tin. Không bao giờ ném lỗi: lỗi ghi log không được làm hỏng gửi Zalo hay lệnh bot. */
export async function logMessage(db: D1Database, m: { contactId: string; dir: 'in' | 'out'; kind?: ChatKind; refNo?: number | null; body: string; authorId?: string | null; delivered?: boolean; now?: number }) {
  try {
    await db.prepare('INSERT INTO zalo_messages (id,contact_id,dir,kind,ref_no,body,author_id,delivered,created_at) VALUES (?,?,?,?,?,?,?,?,?)')
      .bind(crypto.randomUUID(), m.contactId, m.dir, m.kind ?? 'text', m.refNo ?? null, m.body.slice(0, 2000), m.authorId ?? null, m.delivered === false ? 0 : 1, iso(m.now ?? Date.now())).run();
  } catch { console.error('zalo chat log failed'); }
}

/** Danh sách người cho cột trái. Tin chưa đọc đếm qua chỉ mục (dir, read_at) nên chỉ đọc các tin chưa đọc. */
export async function listConversations(db: D1Database, now = Date.now()): Promise<Conversation[]> {
  const local = vnNow(now), today = local.slice(0, 10), time = local.slice(11, 16);
  const rows = (await db.prepare(`SELECT c.id,c.name,c.kind,c.team_name,c.dept,c.leader_id,c.chat_id,
    (SELECT json_object('body',substr(m.body,1,80),'dir',m.dir,'at',m.created_at) FROM zalo_messages m WHERE m.contact_id=c.id ORDER BY m.created_at DESC,m.rowid DESC LIMIT 1) AS last,
    (SELECT COUNT(*) FROM zalo_tasks t WHERE t.assignee_id=c.id AND t.status NOT IN ('xong','huy')) AS open,
    (SELECT COUNT(*) FROM zalo_tasks t WHERE t.assignee_id=c.id AND t.status NOT IN ('xong','huy') AND (t.due_date<? OR t.due_date=? AND t.due_time IS NOT NULL AND t.due_time<?)) AS overdue,
    (SELECT MIN(m.start_at) FROM zalo_meeting_invites i JOIN zalo_meetings m ON m.id=i.meeting_id WHERE i.contact_id=c.id AND m.cancelled_at IS NULL AND m.start_at>? AND m.start_at<=?) AS next_meeting
    FROM zalo_contacts c WHERE c.active=1 AND c.kind IN ('leader','staff') LIMIT 200`)
    .bind(today, today, time, iso(now), iso(now + DAY)).all<Contact & { last: string | null; open: number; overdue: number; next_meeting: string | null }>()).results;
  const unread = new Map((await db.prepare("SELECT contact_id,COUNT(*) AS n FROM zalo_messages WHERE dir='in' AND read_at IS NULL GROUP BY contact_id").all<{ contact_id: string; n: number }>()).results.map(r => [r.contact_id, r.n]));
  return rows.map(r => {
    const last = r.last ? JSON.parse(r.last) as Conversation['last'] : null;
    return { id: r.id, name: r.name, kind: r.kind, team_name: r.team_name, dept: r.dept, leader_id: r.leader_id, linked: !!r.chat_id, last, unread: unread.get(r.id) ?? 0, open: r.open, overdue: r.overdue, nextMeeting: r.next_meeting, waiting: !!last && last.dir === 'out' && now - Date.parse(last.at) > 2 * 3600000 };
  }).sort((a, b) => (b.last?.at ?? '').localeCompare(a.last?.at ?? '') || a.name.localeCompare(b.name, 'vi'));
}

async function chatContact(db: D1Database, id: string) {
  const c = await db.prepare("SELECT * FROM zalo_contacts WHERE id=? AND active=1 AND kind IN ('leader','staff')").bind(id).first<Contact>();
  if (!c) fail('Không tìm thấy người này trong danh bạ Zalo.');
  return c;
}

/** Tin của một người theo thời gian. after: chỉ tin mới (>=, trình duyệt bỏ tin trùng id); before: tải thêm tin cũ.
 *  Kèm việc/họp mà thẻ trong chat nhắc tới và việc đang mở, họp sắp tới của người đó, luôn ở trạng thái mới nhất. */
export async function listMessages(db: D1Database, contactId: string, opts: { before?: string | null; after?: string | null; limit?: number } = {}, now = Date.now()) {
  const contact = await chatContact(db, contactId), limit = Math.min(Math.max(opts.limit ?? 60, 1), 200);
  const cols = 'm.*,a.name AS author_name';
  const messages = opts.after
    ? (await db.prepare(`SELECT ${cols} FROM zalo_messages m LEFT JOIN zalo_contacts a ON a.id=m.author_id WHERE m.contact_id=? AND m.created_at>=? ORDER BY m.created_at,m.rowid LIMIT ?`).bind(contactId, opts.after, limit).all<ChatMessage>()).results
    : (await db.prepare(`SELECT ${cols} FROM zalo_messages m LEFT JOIN zalo_contacts a ON a.id=m.author_id WHERE m.contact_id=? AND m.created_at<? ORDER BY m.created_at DESC,m.rowid DESC LIMIT ?`).bind(contactId, opts.before || '9999', limit).all<ChatMessage>()).results.reverse();
  const refs = (kind: ChatKind) => JSON.stringify([...new Set(messages.filter(m => m.kind === kind && m.ref_no).map(m => m.ref_no))]);
  const tasks = (await db.prepare(`SELECT t.*,a.name AS assigner_name FROM zalo_tasks t LEFT JOIN zalo_contacts a ON a.id=t.assigner_id WHERE t.no IN (SELECT value FROM json_each(?)) OR t.assignee_id=? AND (t.status NOT IN ('xong','huy') OR t.updated_at>=?) ORDER BY t.no LIMIT 300`)
    .bind(refs('task'), contactId, iso(now - 7 * DAY)).all<Task & { assigner_name: string | null }>()).results;
  const meetings = (await db.prepare(`SELECT m.*,
    (SELECT COUNT(*) FROM zalo_meeting_invites x WHERE x.meeting_id=m.id AND x.answer='co') AS yes,
    (SELECT COUNT(*) FROM zalo_meeting_invites x WHERE x.meeting_id=m.id AND x.answer='khong') AS noAnswer,
    (SELECT COUNT(*) FROM zalo_meeting_invites x WHERE x.meeting_id=m.id AND x.answer IS NULL) AS pending,
    i.answer,COALESCE(i.reason,'') AS reason
    FROM zalo_meetings m LEFT JOIN zalo_meeting_invites i ON i.meeting_id=m.id AND i.contact_id=?
    WHERE m.no IN (SELECT value FROM json_each(?)) OR i.contact_id IS NOT NULL AND m.cancelled_at IS NULL AND m.start_at>=? ORDER BY m.start_at LIMIT 100`)
    .bind(contactId, refs('meeting'), iso(now - 2 * 3600000)).all<ChatMeeting>()).results;
  const doneWeek = (await db.prepare("SELECT COUNT(*) AS n FROM zalo_tasks WHERE assignee_id=? AND status='xong' AND done_at>=?").bind(contactId, iso(now - 7 * DAY)).first<{ n: number }>())?.n ?? 0;
  return { contact: { id: contact.id, name: contact.name, kind: contact.kind, team_name: contact.team_name, dept: contact.dept, linked: !!contact.chat_id }, messages, tasks, meetings, doneWeek };
}

export async function markRead(db: D1Database, contactId: string, now = Date.now()) {
  await db.prepare("UPDATE zalo_messages SET read_at=? WHERE contact_id=? AND dir='in' AND read_at IS NULL").bind(iso(now), contactId).run();
}

type Send = (chatId: string, text: string) => Promise<unknown>;
async function deliver(c: Contact, text: string, send: Send) {
  if (!c.chat_id) return false;
  try { await send(c.chat_id, text); return true; } catch { console.error('zalo chat send failed'); return false; }
}
/** Sếp nhắn trên web: bot gửi Zalo cho người đó và ghi vào chat (chưa nối thì vẫn ghi, đánh dấu chưa tới). */
export async function sendChat(db: D1Database, actor: Actor, contactId: string, text: unknown, now = Date.now(), send: Send) {
  if (actor.kind !== 'boss') fail('Không có quyền nhắn.');
  const body = typeof text === 'string' ? text.trim() : '';
  if (!body || body.length > 1000) fail('Tin nhắn phải từ 1 đến 1000 ký tự.');
  const c = await chatContact(db, contactId), delivered = await deliver(c, body, send);
  await logMessage(db, { contactId, dir: 'out', body, authorId: actor.id, delivered, now });
  return { delivered };
}
/** Nút "Nhắc tiến độ" / "Nhắc trả lời" trên thẻ việc, thẻ họp. */
export async function remindInChat(db: D1Database, actor: Actor, contactId: string, input: { kind?: unknown; no?: unknown }, now = Date.now(), send: Send) {
  if (actor.kind !== 'boss') fail('Không có quyền nhắn.');
  const no = Number(input.no), c = await chatContact(db, contactId);
  if (!Number.isSafeInteger(no) || no < 1) fail('Số việc/họp không hợp lệ.');
  let body: string;
  if (input.kind === 'task') {
    const t = await db.prepare('SELECT title FROM zalo_tasks WHERE no=?').bind(no).first<{ title: string }>();
    if (!t) fail('Không tìm thấy việc.');
    body = `Anh/chị cập nhật giúp việc số ${no}: ${t.title}\nTrả lời: nhận việc ${no} · đang làm việc ${no} · xong việc ${no} · chưa xong việc ${no}: lý do`;
  } else if (input.kind === 'meeting') {
    const m = await db.prepare('SELECT title FROM zalo_meetings WHERE no=?').bind(no).first<{ title: string }>();
    if (!m) fail('Không tìm thấy họp.');
    body = `Anh/chị trả lời giúp họp số ${no}: ${m.title}\nTrả lời: đi họp ${no} · không đi họp ${no}: lý do`;
  } else fail('Loại nhắc không hợp lệ.');
  const delivered = await deliver(c, body, send);
  await logMessage(db, { contactId, dir: 'out', body, authorId: actor.id, delivered, now });
  return { delivered };
}
/** Xoá tin cũ hơn 180 ngày, tối đa 500 dòng mỗi lần (cron gọi mỗi ngày một lần). */
export async function pruneMessages(db: D1Database, now = Date.now()) {
  const r = await db.prepare('DELETE FROM zalo_messages WHERE id IN (SELECT id FROM zalo_messages WHERE created_at<? LIMIT 500)').bind(iso(now - KEEP_DAYS * DAY)).run();
  return r.meta.changes || r.meta.rows_written || 0;
}

// ---------- Nhóm tổng (29/10): sếp nhắn một lần, bot gửi riêng "[Tên nhóm] nội dung" cho từng thành viên. ----------
export type ChatGroup = { id: string; name: string; memberIds: string[]; last: { body: string; at: string } | null };
type GroupRow = { id: string; name: string; member_ids: string; active: number };
const members = (r: Pick<GroupRow, 'member_ids'>) => { try { const v: unknown = JSON.parse(r.member_ids); return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []; } catch { return []; } };
async function groupRow(db: D1Database, id: string) {
  const g = await db.prepare('SELECT * FROM zalo_groups WHERE id=? AND active=1').bind(id).first<GroupRow>();
  if (!g) fail('Không tìm thấy nhóm.');
  return g;
}
export async function listGroups(db: D1Database): Promise<ChatGroup[]> {
  const rows = (await db.prepare(`SELECT g.*,(SELECT json_object('body',substr(m.body,1,80),'at',m.created_at) FROM zalo_messages m WHERE m.contact_id='group:'||g.id ORDER BY m.created_at DESC,m.rowid DESC LIMIT 1) AS last FROM zalo_groups g WHERE g.active=1 ORDER BY g.name LIMIT 50`).all<GroupRow & { last: string | null }>()).results;
  return rows.map(r => ({ id: r.id, name: r.name, memberIds: members(r), last: r.last ? JSON.parse(r.last) as ChatGroup['last'] : null }));
}
export async function saveGroup(db: D1Database, actor: Actor, input: { id?: unknown; name?: unknown; memberIds?: unknown }, now = Date.now()) {
  if (actor.kind !== 'boss') fail('Không có quyền tạo nhóm.');
  const name = typeof input.name === 'string' ? input.name.trim().replace(/\s+/g, ' ') : '';
  if (!name || name.length > 60) fail('Tên nhóm phải từ 1 đến 60 ký tự.');
  const ids = Array.isArray(input.memberIds) ? [...new Set(input.memberIds.filter((x): x is string => typeof x === 'string'))] : [];
  if (!ids.length || ids.length > 100) fail('Chọn từ 1 đến 100 người trong nhóm.');
  const valid = (await db.prepare("SELECT id FROM zalo_contacts WHERE active=1 AND kind IN ('leader','staff') AND id IN (SELECT value FROM json_each(?))").bind(JSON.stringify(ids)).all<{ id: string }>()).results;
  if (valid.length !== ids.length) fail('Có người không còn trong danh bạ Zalo.');
  const id = typeof input.id === 'string' && input.id ? (await groupRow(db, input.id)).id : crypto.randomUUID();
  await db.prepare('INSERT INTO zalo_groups (id,name,member_ids,active,created_by,created_at,updated_at) VALUES (?,?,?,1,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,member_ids=excluded.member_ids,updated_at=excluded.updated_at').bind(id, name, JSON.stringify(ids), actor.id, iso(now), iso(now)).run();
  return { id, name, memberIds: ids };
}
export async function deleteGroup(db: D1Database, actor: Actor, id: string, now = Date.now()) {
  if (actor.kind !== 'boss') fail('Không có quyền xoá nhóm.');
  await db.prepare('UPDATE zalo_groups SET active=0,updated_at=? WHERE id=?').bind(iso(now), id).run();
}
/** Gửi tin nhóm: mỗi thành viên nhận riêng, tin cũng hiện trong chat riêng của họ; dòng nhóm ghi đã tới bao nhiêu người. */
export async function sendGroup(db: D1Database, actor: Actor, groupId: string, text: unknown, now = Date.now(), send: Send) {
  if (actor.kind !== 'boss') fail('Không có quyền nhắn.');
  const body = typeof text === 'string' ? text.trim() : '';
  if (!body || body.length > 1000) fail('Tin nhắn phải từ 1 đến 1000 ký tự.');
  const g = await groupRow(db, groupId), ids = members(g);
  const people = (await db.prepare("SELECT * FROM zalo_contacts WHERE active=1 AND kind IN ('leader','staff') AND id IN (SELECT value FROM json_each(?))").bind(JSON.stringify(ids)).all<Contact>()).results;
  const missed: string[] = []; let reached = 0;
  for (const c of people) {
    const text = `[${g.name}] ${body}`, ok = await deliver(c, text, send);
    if (ok) reached++; else missed.push(c.name);
    await logMessage(db, { contactId: c.id, dir: 'out', body: text, authorId: actor.id, delivered: ok, now });
  }
  await db.prepare('INSERT INTO zalo_messages (id,contact_id,dir,kind,ref_no,body,author_id,delivered,created_at) VALUES (?,?,?,?,?,?,?,?,?)').bind(crypto.randomUUID(), 'group:' + g.id, 'out', 'text', people.length, body, actor.id, reached, iso(now)).run();
  return { reached, total: people.length, missed };
}
/** Khung nhóm: tin nhóm đã gửi và tin thành viên nhắn bot trong 24 giờ sau một tin nhóm (có tên người trả lời). */
export async function groupMessages(db: D1Database, groupId: string, opts: { before?: string | null; after?: string | null; limit?: number } = {}) {
  const g = await groupRow(db, groupId), ids = members(g), key = 'group:' + g.id, limit = Math.min(Math.max(opts.limit ?? 60, 1), 200);
  const cols = 'm.*,a.name AS author_name';
  const sent = opts.after
    ? (await db.prepare(`SELECT ${cols} FROM zalo_messages m LEFT JOIN zalo_contacts a ON a.id=m.author_id WHERE m.contact_id=? AND m.created_at>=? ORDER BY m.created_at,m.rowid LIMIT ?`).bind(key, opts.after, limit).all<ChatMessage>()).results
    : (await db.prepare(`SELECT ${cols} FROM zalo_messages m LEFT JOIN zalo_contacts a ON a.id=m.author_id WHERE m.contact_id=? AND m.created_at<? ORDER BY m.created_at DESC,m.rowid DESC LIMIT ?`).bind(key, opts.before || '9999', limit).all<ChatMessage>()).results.reverse();
  // Mốc tin nhóm để biết tin trả lời thuộc tin nào; khi hỏi tin mới thì lấy cả tin nhóm cuối trước đó.
  const anchor = opts.after ? (await db.prepare('SELECT created_at FROM zalo_messages WHERE contact_id=? AND created_at<? ORDER BY created_at DESC LIMIT 1').bind(key, opts.after).first<{ created_at: string }>())?.created_at : undefined;
  const marks = [...(anchor ? [anchor] : []), ...sent.map(m => m.created_at)];
  let replies: ChatMessage[] = [];
  if (marks.length && ids.length) {
    const from = opts.after ?? marks[0], to = opts.before && !opts.after ? opts.before : '9999';
    const rows = (await db.prepare(`SELECT m.*,c.name AS author_name FROM zalo_messages m JOIN zalo_contacts c ON c.id=m.contact_id WHERE m.contact_id IN (SELECT value FROM json_each(?)) AND m.dir='in' AND m.created_at>=? AND m.created_at<? ORDER BY m.created_at,m.rowid LIMIT 300`).bind(JSON.stringify(ids), from, to).all<ChatMessage>()).results;
    replies = rows.filter(r => { const prev = marks.filter(t => t <= r.created_at).at(-1); return !!prev && Date.parse(r.created_at) - Date.parse(prev) <= DAY; });
  }
  const messages = [...sent, ...replies].sort((a, b) => a.created_at.localeCompare(b.created_at));
  const people = (await db.prepare("SELECT id,name,kind,team_name,chat_id FROM zalo_contacts WHERE active=1 AND id IN (SELECT value FROM json_each(?)) ORDER BY name").bind(JSON.stringify(ids)).all<{ id: string; name: string; kind: string; team_name: string; chat_id: string | null }>()).results;
  return { contact: { id: key, name: g.name, kind: 'group', team_name: `${people.length} người`, dept: '', linked: true }, messages, tasks: [], meetings: [], doneWeek: 0, members: people.map(p => ({ id: p.id, name: p.name, kind: p.kind, team_name: p.team_name, linked: !!p.chat_id })) };
}
