// Logic giao việc độc lập với HTTP, React và môi trường Worker.
export const STATUS_LABELS = { moi: 'Mới giao', da_nhan: 'Đã nhận', dang_lam: 'Đang triển khai', xong: 'Đã hoàn thành', chua_xong: 'Chưa hoàn thành', huy: 'Đã huỷ' } as const;
export type Status = keyof typeof STATUS_LABELS;
export type Contact = { id: string; name: string; kind: 'boss' | 'leader' | 'staff'; user_id: string | null; team_id: string | null; team_name: string; dept: string; leader_id: string | null; pos_seller_ids: string; chat_id: string | null; active: number };
export type Actor = Contact & { owner?: boolean };
export type Task = { id: string; no: number; title: string; detail: string; assignee_id: string; assigner_id: string; parent_id: string | null; urgent: number; due_date: string | null; status: Status; reason: string; created_at: string; updated_at: string; done_at: string | null };
export type Meeting = { id: string; no: number; title: string; place: string; start_at: string; note: string; created_by: string; cancelled_at: string | null };
const DAY = 86400000;
const iso = (now = Date.now()) => new Date(now).toISOString();
function fail(message = 'Không có quyền thao tác.'): never { throw new Error(message); }
const clean = (s: string) => s.trim().replace(/\s+/g, ' ');
const fold = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/đ/g, 'd');
function validDay(s: string) { return /^\d{4}-\d{2}-\d{2}$/.test(s) && new Date(s + 'T00:00:00Z').toISOString().slice(0, 10) === s; }
function title(s: string) { s = clean(s); if (!s || s.length > 300) fail('Tên việc/họp phải từ 1–300 ký tự.'); return s; }
export function canMove(actor: Actor, task: Task, to: Status) {
  if (!actor.active || !Object.hasOwn(STATUS_LABELS, to)) return false;
  if (actor.owner || actor.id === task.assigner_id) return true;
  if (actor.id !== task.assignee_id) return false;
  const moves: Record<Status, Status[]> = { moi: ['da_nhan', 'dang_lam', 'chua_xong'], da_nhan: ['dang_lam', 'xong', 'chua_xong'], dang_lam: ['xong', 'chua_xong'], chua_xong: ['dang_lam', 'xong'], xong: ['dang_lam'], huy: [] };
  return moves[task.status].includes(to);
}
export function taskState(task: Pick<Task, 'status' | 'due_date'>, today: string) {
  if (task.status === 'xong') return 'done';
  if (task.status === 'huy') return 'cancelled';
  if (!task.due_date) return 'none';
  const n = (Date.parse(task.due_date) - Date.parse(today)) / DAY;
  return n < 0 ? 'overdue' : n === 0 ? 'today' : n <= 2 ? 'soon' : 'later';
}
export function weekOfMonth(date: string) {
  if (!validDay(date)) fail('Ngày không hợp lệ.');
  const month = date.slice(0, 7), first = Date.parse(month + '-01'), at = Date.parse(date);
  const offset = (new Date(first).getUTCDay() + 6) % 7;
  const week = Math.floor(((at - first) / DAY + offset) / 7) + 1;
  const start = first + ((week - 1) * 7 - offset) * DAY;
  return { month, week, from: new Date(start).toISOString().slice(0, 10), to: new Date(start + 6 * DAY).toISOString().slice(0, 10) };
}
export type Command = { cmd: 'pair'; code: string } | { cmd: 'status'; no: number; to: Status; reason?: string } | { cmd: 'note'; no: number; body: string } | { cmd: 'meeting'; no: number; answer: 'co' | 'khong'; reason?: string } | { cmd: 'assign'; who: string; title: string; due?: string } | { cmd: 'list' | 'team' | 'week' | 'help' | 'unknown' };
export function parseCommand(text: string): Command {
  const raw = clean(text), s = fold(raw);
  if (/^\d{6}$/.test(s)) return { cmd: 'pair', code: s };
  const simple: Record<string, 'list' | 'team' | 'week' | 'help'> = { viec: 'list', team: 'team', tuan: 'week', '?': 'help', hd: 'help', 'huong dan': 'help' };
  if (simple[s]) return { cmd: simple[s] };
  let m = s.match(/^v?(\d+)\s+(.+)$/);
  if (m && Number.isSafeInteger(+m[1]) && +m[1] > 0) {
    const body = raw.slice(raw.indexOf(' ') + 1), action = m[2].split(' ')[0];
    const statuses: Record<string, Status> = { nhan: 'da_nhan', dang: 'dang_lam', xong: 'xong', chua: 'chua_xong' };
    if (statuses[action] && (action === 'chua' || m[2] === action)) return { cmd: 'status', no: +m[1], to: statuses[action], ...(action === 'chua' && body.includes(' ') ? { reason: body.slice(body.indexOf(' ') + 1) } : {}) };
    return { cmd: 'note', no: +m[1], body };
  }
  m = s.match(/^h(\d+)\s+(co|khong)(?:\s+(.+))?$/);
  if (m && +m[1] > 0 && Number.isSafeInteger(+m[1]) && (m[2] === 'khong' || !m[3])) return { cmd: 'meeting', no: +m[1], answer: m[2] as 'co' | 'khong', ...(m[3] ? { reason: raw.split(' ').slice(2).join(' ') } : {}) };
  m = s.match(/^giao\s+([^:]+):\s*(.+)$/);
  if (m) {
    const colon = raw.indexOf(':'), who = clean(raw.slice(5, colon));
    let body = clean(raw.slice(colon + 1));
    const due = fold(body).match(/\s+han\s+(\d{2}\/\d{2})$/);
    if (due) body = body.slice(0, due.index).trim();
    if (body && who) return { cmd: 'assign', who, title: body, ...(due ? { due: due[1] } : {}) };
  }
  return { cmd: 'unknown' };
}
const dateLabel = (s: string) => s.slice(8, 10) + '/' + s.slice(5, 7);
const limited = (s: string) => s.length <= 2000 ? s : s.slice(0, 1975) + '… gõ viec để xem đủ';
export const missingReason = (no: number, meeting = false) => meeting ? `Anh/chị ghi thêm lý do, ví dụ: H${no} khong bận việc nhà` : `Anh/chị ghi thêm lý do, ví dụ: V${no} chua khách không nghe máy`;
export function formatTaskMessage(t: Task, assigner = '') { return limited(`📌 V${t.no} · Việc mới từ ${assigner}: ${t.title}\nHạn: ${t.due_date ? dateLabel(t.due_date) : 'Không hạn'}${t.urgent ? ' (Gấp)' : ''}\n${t.detail.slice(0, 300)}\nTrả lời: V${t.no} nhan · V${t.no} dang · V${t.no} xong · V${t.no} chua <lý do>`); }
export function formatMeetingMessage(m: Meeting) { const local = new Date(Date.parse(m.start_at) + 7 * 3600000).toISOString(); return limited(`📅 H${m.no} · Họp: ${m.title}\n${dateLabel(local)} ${local.slice(11, 16)} (giờ Việt Nam), ${m.place}\n${m.note}\nTrả lời: H${m.no} co · H${m.no} khong <lý do>`); }
export function formatHelp(kind: Contact['kind']) { return limited('Gõ viec: danh sách việc · tuan: tuần này\nV12 nhan · V12 dang · V12 xong · V12 chua <lý do>\nV12 <ghi chú>\nH5 co · H5 khong <lý do>' + (kind === 'leader' ? '\nteam: nhân viên · giao 2: tên việc han 30/10\nthem <tên>: thêm nhân viên và tạo mã nối' : '')); }
export function formatList(tasks: Task[]) { return limited(tasks.map(t => `V${t.no} · ${t.title} · ${STATUS_LABELS[t.status]} · Hạn: ${t.due_date ?? 'Không hạn'}${t.reason ? ' · ' + t.reason : ''}`).join('\n') || 'Không có việc.'); }
export function formatWeek(rows: { name: string; open: number; overdue: number; done: number }[]) { return limited('Việc trong tuần\n' + rows.map(r => `${r.name}: ${r.open} mở · ${r.overdue} quá hạn · ${r.done} xong trong tuần`).join('\n')); }
export function formatSlotReport(input: { team: string; slot: string; total: number; cumulative: number; orders: number; top: string[]; noOrders: string[] }) { return limited(`Doanh số team ${input.team} ${input.slot}\nDoanh số khung: ${input.total.toLocaleString('vi-VN')} · Luỹ kế hôm nay: ${input.cumulative.toLocaleString('vi-VN')}\nĐơn chốt: ${input.orders}\nCao nhất: ${input.top.slice(0, 3).join(', ')}\nChưa có đơn trong khung: ${input.noOrders.join(', ')}`); }
export function formatMorning(input: { team: string; yesterday: number; tasks: Task[]; meetings: Meeting[] }) { return limited(`Bản tin đầu ngày · ${input.team}\nDoanh số hôm qua: ${input.yesterday.toLocaleString('vi-VN')}\n${formatList(input.tasks)}\nHọp hôm nay: ${input.meetings.map(m => `H${m.no} ${m.title}`).join(', ') || 'Không có'}`); }
export function formatIdleAlert(name: string, minutes: number, last: string) { return limited(`⚠️ ${name} chưa có số mới ${minutes} phút (lần cuối ${last})`); }
export function formatOverdue(tasks: Task[]) { return limited('⚠️ Việc quá hạn\n' + formatList(tasks)); }
async function contact(db: D1Database, id: string) { return db.prepare('SELECT * FROM zalo_contacts WHERE id=? AND active=1').bind(id).first<Contact>(); }
async function actorNow(db: D1Database, actor: Actor) { const a = await contact(db, actor.id); if (!a) fail(); return { ...a!, owner: actor.owner === true }; }
export async function listContacts(db: D1Database) { return (await db.prepare('SELECT * FROM zalo_contacts ORDER BY name,id').all<Contact>()).results; }
export async function contactByChat(db: D1Database, chatId: string) { return db.prepare('SELECT * FROM zalo_contacts WHERE chat_id=? AND active=1').bind(chatId).first<Contact>(); }
export async function teamStaff(db: D1Database, leaderId: string) { return (await db.prepare("SELECT * FROM zalo_contacts WHERE leader_id=? AND kind='staff' AND active=1 ORDER BY name,id").bind(leaderId).all<Contact>()).results.map((r, i) => ({ ...r, no: i + 1 })); }
export async function saveContact(db: D1Database, input: Partial<Contact> & Pick<Contact, 'name' | 'kind'>, now = Date.now()) {
  const name = clean(input.name); if (!name || name.length > 60 || !['boss', 'leader', 'staff'].includes(input.kind)) fail('Danh bạ không hợp lệ.');
  let team = input.team_id ?? null, dept = input.dept ?? '', teamName = input.team_name ?? '';
  if (input.kind === 'staff') { const leader = input.leader_id ? await contact(db, input.leader_id) : null; if (!leader || leader.kind !== 'leader') fail('Leader không hợp lệ.'); team = leader.team_id; dept = leader.dept; teamName = leader.team_name; }
  if (!['', 'sale', 'cskh'].includes(dept)) fail('Bộ phận không hợp lệ.');
  const sellers: unknown = JSON.parse(input.pos_seller_ids ?? '[]'); if (!Array.isArray(sellers) || sellers.some(x => typeof x !== 'string')) fail('Mã người bán không hợp lệ.');
  const id = input.id ?? crypto.randomUUID();
  await db.prepare(`INSERT INTO zalo_contacts (id,name,kind,user_id,team_id,team_name,dept,leader_id,pos_seller_ids,active,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,kind=excluded.kind,user_id=excluded.user_id,team_id=excluded.team_id,team_name=excluded.team_name,dept=excluded.dept,leader_id=excluded.leader_id,pos_seller_ids=excluded.pos_seller_ids,active=excluded.active,updated_at=excluded.updated_at`).bind(id, name, input.kind, input.user_id ?? null, team, teamName, dept, input.leader_id ?? null, JSON.stringify(sellers), input.active ?? 1, iso(now), iso(now)).run();
  return (await contact(db, id))!;
}
export async function deactivateContact(db: D1Database, id: string, now = Date.now()) { await db.prepare('UPDATE zalo_contacts SET active=0,chat_id=NULL,linked_at=NULL,updated_at=? WHERE id=?').bind(iso(now), id).run(); }
type PairState = { original: string | null; codes: Record<string, { contactId: string; exp: number }>; attempts: Record<string, { count: number; since: number; until: number }> };
async function pairs(db: D1Database, now: number): Promise<PairState> { const row = await db.prepare("SELECT value FROM app_settings WHERE key='zalo_pair_v1'").first<{ value: string }>(); const data = row ? JSON.parse(row.value) : {}; const state: PairState = { original: row?.value ?? null, codes: data.codes ?? {}, attempts: data.attempts ?? {} }; for (const [k, v] of Object.entries(state.codes)) if (v.exp <= now) delete state.codes[k]; for (const [k, v] of Object.entries(state.attempts)) if (Math.max(v.until, v.since + 3600000) <= now) delete state.attempts[k]; return state; }
function pairWrite(db: D1Database, state: PairState, now: number) {
  // So sánh bản đã đọc để hai webhook không thể cùng dùng một mã.
  const encoded = JSON.stringify({ codes: state.codes, attempts: state.attempts, revision: crypto.randomUUID() });
  const statement = db.prepare("INSERT INTO app_settings (key,value,updated_at) VALUES ('zalo_pair_v1',?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at WHERE app_settings.value=?").bind(encoded, iso(now), state.original);
  return { encoded, statement };
}
function changed(result: D1Result) { return Boolean(result.meta.changes || result.meta.rows_written); }

export async function createPairCode(db: D1Database, contactId: string, now = Date.now()) {
  if (!await contact(db, contactId)) fail(); const state = await pairs(db, now);
  for (const [k, v] of Object.entries(state.codes)) if (v.contactId === contactId) delete state.codes[k];
  if (Object.keys(state.codes).length >= 50) fail('Đã đủ 50 mã nối.');
  let code: string; do { const n = crypto.getRandomValues(new Uint32Array(1))[0]; if (n >= 4294000000) continue; code = String(n % 1000000).padStart(6, '0'); } while (!code! || state.codes[code]);
  state.codes[code] = { contactId, exp: now + DAY }; const result = await pairWrite(db, state, now).statement.run(); if (!changed(result)) fail('Mã nối vừa thay đổi, vui lòng thử lại.'); return code;
}
export async function redeemPairCode(db: D1Database, code: string, chatId: string, now = Date.now()) {
  const state = await pairs(db, now), attempt = Object.hasOwn(state.attempts, chatId) ? state.attempts[chatId] : undefined;
  if (attempt && attempt.until > now) return { ok: false as const, silent: true };
  const entry = /^\d{6}$/.test(code) && Object.hasOwn(state.codes, code) ? state.codes[code] : undefined, target = entry && await contact(db, entry.contactId);
  if (!target) { const a = attempt ?? { count: 0, since: now, until: 0 }; a.count++; if (a.count >= 5) a.until = now + 3600000; Object.defineProperty(state.attempts, chatId, { value: a, enumerable: true, configurable: true, writable: true }); const result = await pairWrite(db, state, now).statement.run(); return { ok: false as const, silent: !changed(result) || a.count >= 5 }; }
  delete state.codes[code]; delete state.attempts[chatId];
  const write = pairWrite(db, state, now);
  const result = await db.batch([
    write.statement,
    db.prepare("UPDATE zalo_contacts SET chat_id=NULL,linked_at=NULL,updated_at=? WHERE chat_id=? AND EXISTS (SELECT 1 FROM app_settings WHERE key='zalo_pair_v1' AND value=?)").bind(iso(now), chatId, write.encoded),
    db.prepare("UPDATE zalo_contacts SET chat_id=?,linked_at=?,updated_at=? WHERE id=? AND active=1 AND EXISTS (SELECT 1 FROM app_settings WHERE key='zalo_pair_v1' AND value=?)").bind(chatId, iso(now), iso(now), target.id, write.encoded),
  ]);
  if (!changed(result[0])) return { ok: false as const, silent: false };
  return { ok: true as const, contact: (await contact(db, target.id))! };
}
async function numbered(db: D1Database, table: 'zalo_tasks' | 'zalo_meetings', insert: (id: string) => D1PreparedStatement, extra: (id: string) => D1PreparedStatement[] = () => []) {
  for (let i = 0; i < 3; i++) { const id = crypto.randomUUID(); try { await db.batch([insert(id), ...extra(id)]); return (await db.prepare(`SELECT * FROM ${table} WHERE id=?`).bind(id).first())!; } catch (e) { if (!/UNIQUE constraint failed.*\.no/.test(String(e)) || i === 2) throw e; } }
  return fail();
}
function event(db: D1Database, taskId: string, actorId: string, kind: string, body: string, now: number) { return db.prepare('INSERT INTO zalo_task_events (id,task_id,author_id,kind,body,created_at) VALUES (?,?,?,?,?,?)').bind(crypto.randomUUID(), taskId, actorId, kind, body, iso(now)); }
export async function createTask(db: D1Database, actor: Actor, input: { title: string; detail?: string; assigneeId: string; parentId?: string; urgent?: boolean; dueDate?: string | null }, now = Date.now(), send?: ZaloSend) {
  const a = await actorNow(db, actor), recipient = await contact(db, input.assigneeId);
  if (!recipient || !(a.kind === 'boss' && recipient.kind === 'leader' || a.kind === 'leader' && recipient.kind === 'staff' && recipient.leader_id === a.id)) fail();
  if (input.dueDate && !validDay(input.dueDate)) fail('Hạn không hợp lệ.');
  if (input.parentId) { const parent = await db.prepare('SELECT * FROM zalo_tasks WHERE id=?').bind(input.parentId).first<Task>(); if (!parent || parent.assignee_id !== a.id) fail(); }
  const created = await numbered(db, 'zalo_tasks', id => db.prepare(`INSERT INTO zalo_tasks (id,no,title,detail,assignee_id,assigner_id,parent_id,urgent,due_date,created_at,updated_at) SELECT ?,COALESCE(MAX(no),0)+1,?,?,?,?,?,?,?,?,? FROM zalo_tasks`).bind(id, title(input.title), input.detail ?? '', recipient.id, a.id, input.parentId ?? null, input.urgent ? 1 : 0, input.dueDate ?? null, iso(now), iso(now))) as Task;
  await notifyContact(db, created.assignee_id, formatTaskMessage(created, a.name), send);
  return created;
}
async function taskNo(db: D1Database, no: number) { const t = await db.prepare('SELECT * FROM zalo_tasks WHERE no=?').bind(no).first<Task>(); if (!t) fail('Không tìm thấy việc.'); return t!; }
export async function moveTask(db: D1Database, actor: Actor, no: number, to: Status, reason = '', now = Date.now(), send?: ZaloSend) {
  const a = await actorNow(db, actor), t = await taskNo(db, no); if (!canMove(a, t, to)) fail(); if (to === 'chua_xong' && !reason.trim()) fail(missingReason(no));
  // changes() là kết quả UPDATE ngay trước đó trong cùng batch/transaction.
  const out = await db.batch([db.prepare('UPDATE zalo_tasks SET status=?,reason=?,done_at=?,updated_at=? WHERE id=? AND status=?').bind(to, to === 'chua_xong' ? reason.trim() : '', to === 'xong' ? iso(now) : null, iso(now), t.id, t.status), db.prepare("INSERT INTO zalo_task_events (id,task_id,author_id,kind,body,created_at) SELECT ?,?,?,'status',?,? WHERE changes()=1").bind(crypto.randomUUID(), t.id, a.id, STATUS_LABELS[to] + (reason ? ': ' + reason : ''), iso(now))]);
  if (!out[0].meta.changes && !out[0].meta.rows_written) fail('Trạng thái đã thay đổi, vui lòng thử lại.'); const updated = await taskNo(db, no);
  await notifyContact(db, t.assigner_id === a.id ? t.assignee_id : t.assigner_id, `${a.name}: V${no} ${STATUS_LABELS[to]}${reason ? ': ' + reason : ''}`, send);
  return updated;
}
export async function addTaskNote(db: D1Database, actor: Actor, no: number, body: string, now = Date.now(), send?: ZaloSend) { const a = await actorNow(db, actor), t = await taskNo(db, no); if (a.id !== t.assigner_id && a.id !== t.assignee_id && !a.owner) fail(); if (!body.trim()) fail('Ghi chú trống.'); await event(db, t.id, a.id, 'note', body.trim(), now).run(); await notifyContact(db, t.assigner_id === a.id ? t.assignee_id : t.assigner_id, `${a.name} ghi chú V${no}: ${body.trim()}`, send); }
export async function editTask(db: D1Database, actor: Actor, no: number, input: { title?: string; detail?: string; dueDate?: string | null; urgent?: boolean; assigneeId?: string }, now = Date.now(), send?: ZaloSend) {
  const a = await actorNow(db, actor), t = await taskNo(db, no); if (a.id !== t.assigner_id && !a.owner) fail();
  if (input.dueDate && !validDay(input.dueDate)) fail('Hạn không hợp lệ.');
  if (input.assigneeId) { const recipient = await contact(db, input.assigneeId), assigner = await contact(db, t.assigner_id); if (!recipient || !assigner || !(assigner.kind === 'boss' && recipient.kind === 'leader' || assigner.kind === 'leader' && recipient.kind === 'staff' && recipient.leader_id === assigner.id)) fail(); }
  await db.batch([db.prepare('UPDATE zalo_tasks SET title=?,detail=?,due_date=?,urgent=?,assignee_id=?,updated_at=? WHERE id=?').bind(input.title === undefined ? t.title : title(input.title), input.detail ?? t.detail, input.dueDate === undefined ? t.due_date : input.dueDate, input.urgent === undefined ? t.urgent : Number(input.urgent), input.assigneeId ?? t.assignee_id, iso(now), t.id), event(db, t.id, a.id, 'edit', 'Đã sửa việc.', now)]); const updated = await taskNo(db, no);
  await notifyContact(db, t.assignee_id, `V${no} đã sửa: ${updated.title} · Hạn: ${updated.due_date ?? 'Không hạn'}${updated.assignee_id !== t.assignee_id ? ' · Đã đổi người nhận' : ''}`, send);
  if (updated.assignee_id !== t.assignee_id) await notifyContact(db, updated.assignee_id, formatTaskMessage(updated, a.name), send);
  return updated;
}
export type TaskFilter = { assigneeId?: string; assignerId?: string; teamId?: string; month?: string; week?: number; status: 'open' | 'closed' | 'all'; actor: Actor };
export async function listTasks(db: D1Database, filter: TaskFilter, now = Date.now()) {
  const a = await actorNow(db, filter.actor), where: string[] = [], args: (string | number)[] = [];
  if (!a.owner && a.kind !== 'boss') { where.push("(t.assignee_id=? OR t.assigner_id=? OR EXISTS (SELECT 1 FROM zalo_contacts c WHERE c.id=t.assignee_id AND c.leader_id=? AND c.active=1))"); args.push(a.id, a.id, a.kind === 'leader' ? a.id : ''); }
  for (const [key, column] of [['assigneeId', 'assignee_id'], ['assignerId', 'assigner_id']] as const) if (filter[key]) { where.push(`t.${column}=?`); args.push(filter[key]!); }
  if (filter.teamId) { where.push('EXISTS (SELECT 1 FROM zalo_contacts c WHERE c.id=t.assignee_id AND c.team_id=?)'); args.push(filter.teamId); }
  if (filter.month) { if (!/^\d{4}-\d{2}$/.test(filter.month) || !validDay(filter.month + '-01')) fail('Tháng không hợp lệ.'); where.push('substr(t.due_date,1,7)=?'); args.push(filter.month); if (filter.week !== undefined) { if (!Number.isInteger(filter.week) || filter.week < 1 || filter.week > 6) fail('Tuần không hợp lệ.'); const first = weekOfMonth(filter.month + '-01'); const from = new Date(Date.parse(first.from) + (filter.week - 1) * 7 * DAY).toISOString().slice(0, 10), to = new Date(Date.parse(from) + 6 * DAY).toISOString().slice(0, 10); where.push('t.due_date BETWEEN ? AND ?'); args.push(from, to); } }
  if (filter.status === 'open') where.push("t.status NOT IN ('xong','huy')"); else if (filter.status === 'closed') where.push("t.status IN ('xong','huy')");
  where.push("(t.status NOT IN ('xong','huy') OR t.updated_at>=?)"); args.push(iso(now - 45 * DAY));
  return (await db.prepare('SELECT t.* FROM zalo_tasks t WHERE ' + where.join(' AND ') + ' ORDER BY t.due_date,t.no LIMIT 500').bind(...args).all<Task>()).results;
}
export async function createMeeting(db: D1Database, actor: Actor, input: { title: string; place: string; startAt: string; note: string; inviteeIds: string[] }, now = Date.now(), send?: ZaloSend) {
  const a = await actorNow(db, actor); if (a.kind !== 'boss') fail(); if (!Number.isFinite(Date.parse(input.startAt))) fail('Giờ họp không hợp lệ.');
  const ids = [...new Set(input.inviteeIds)]; for (const id of ids) { const c = await contact(db, id); if (!c || c.kind !== 'leader') fail('Người được mời không hợp lệ.'); }
  const created = await numbered(db, 'zalo_meetings', id => db.prepare('INSERT INTO zalo_meetings (id,no,title,place,start_at,note,created_by,created_at,updated_at) SELECT ?,COALESCE(MAX(no),0)+1,?,?,?,?,?,?,? FROM zalo_meetings').bind(id, title(input.title), input.place, iso(Date.parse(input.startAt)), input.note, a.id, iso(now), iso(now)), id => ids.map(c => db.prepare('INSERT INTO zalo_meeting_invites (meeting_id,contact_id) VALUES (?,?)').bind(id, c))) as Meeting;
  for (const id of ids) await notifyContact(db, id, formatMeetingMessage(created), send);
  return created;
}
export async function answerMeeting(db: D1Database, contactId: string, no: number, answer: 'co' | 'khong', reason = '', now = Date.now(), send?: ZaloSend) {
  if (!await contact(db, contactId) || !['co', 'khong'].includes(answer)) fail(); if (answer === 'khong' && !reason.trim()) fail(missingReason(no, true));
  const out = await db.prepare('UPDATE zalo_meeting_invites SET answer=?,reason=?,answered_at=? WHERE contact_id=? AND meeting_id IN (SELECT id FROM zalo_meetings WHERE no=? AND cancelled_at IS NULL)').bind(answer, answer === 'khong' ? reason.trim() : '', iso(now), contactId, no).run(); if (!out.meta.changes && !out.meta.rows_written) fail();
  const meeting = await db.prepare('SELECT * FROM zalo_meetings WHERE no=?').bind(no).first<Meeting>();
  const c = await contact(db, contactId);
  await notifyContact(db, meeting!.created_by, `${c!.name} ${answer === 'co' ? 'tham gia' : 'không tham gia'} H${no}${answer === 'khong' ? ': ' + reason.trim() : ''}`, send);
}
export async function cancelMeeting(db: D1Database, actor: Actor, no: number, now = Date.now(), send?: ZaloSend) { const a = await actorNow(db, actor); const m = await db.prepare('SELECT * FROM zalo_meetings WHERE no=?').bind(no).first<Meeting>(); if (!m || a.kind !== 'boss' || a.id !== m.created_by && !a.owner) fail(); await db.prepare('UPDATE zalo_meetings SET cancelled_at=?,updated_at=? WHERE no=?').bind(iso(now), iso(now), no).run(); const invites = (await db.prepare('SELECT contact_id FROM zalo_meeting_invites WHERE meeting_id=?').bind(m.id).all<{ contact_id: string }>()).results; for (const i of invites) await notifyContact(db, i.contact_id, `Đã huỷ H${no}: ${m.title}`, send); }
export async function listMeetings(db: D1Database, range: { from: string; to: string }) { return (await db.prepare(`SELECT m.*,SUM(CASE WHEN i.answer='co' THEN 1 ELSE 0 END) AS yes,SUM(CASE WHEN i.answer='khong' THEN 1 ELSE 0 END) AS noAnswer,SUM(CASE WHEN i.contact_id IS NOT NULL AND i.answer IS NULL THEN 1 ELSE 0 END) AS pending FROM zalo_meetings m LEFT JOIN zalo_meeting_invites i ON i.meeting_id=m.id WHERE m.start_at>=? AND m.start_at<=? GROUP BY m.id ORDER BY m.start_at`).bind(range.from, range.to).all<Meeting & { yes: number; noAnswer: number; pending: number }>()).results; }
export async function weekSummary(db: D1Database, leaderId: string, today: string) { const week = weekOfMonth(today); return (await db.prepare(`SELECT c.id,c.name,SUM(CASE WHEN t.status NOT IN ('xong','huy') THEN 1 ELSE 0 END) AS open,SUM(CASE WHEN t.status NOT IN ('xong','huy') AND t.due_date<? THEN 1 ELSE 0 END) AS overdue,SUM(CASE WHEN t.status='xong' AND date(t.done_at,'+7 hours') BETWEEN ? AND ? THEN 1 ELSE 0 END) AS done FROM zalo_contacts c LEFT JOIN zalo_tasks t ON t.assignee_id=c.id WHERE c.leader_id=? AND c.kind='staff' AND c.active=1 GROUP BY c.id ORDER BY c.name,c.id`).bind(today, week.from, week.to, leaderId).all<{ id: string; name: string; open: number; overdue: number; done: number }>()).results; }

/** Truyền cùng sender cho thao tác web, webhook và ô thử demo. Lỗi gửi không làm hỏng ghi D1. */
export type ZaloSend = (chatId: string, text: string) => Promise<unknown>;
async function safeSend(send: ZaloSend, chatId: string, text: string) {
  try { await send(chatId, limited(text)); } catch { console.error('zalo notification failed'); }
}
async function notifyContact(db: D1Database, id: string, text: string, send?: ZaloSend) {
  if (!send) return;
  try {
    const c = await contact(db, id);
    if (c?.chat_id) await safeSend(send, c.chat_id, text);
  } catch { console.error('zalo notification failed'); }
}

export async function handleZaloUpdate(db: D1Database, update: unknown, send: ZaloSend, now = Date.now()) {
  if (!update || typeof update !== 'object' || !('message' in update)) return;
  const message = update.message as { chat?: { id?: unknown; type?: unknown }; text?: unknown } | null;
  const id = message?.chat?.id;
  if ((typeof id !== 'string' && typeof id !== 'number') || !String(id) || typeof message?.text !== 'string') return;
  if (message.chat?.type && message.chat.type !== 'private') return;
  const chatId = String(id), text = message.text.trim();
  if (!text) return;
  const reply = (body: string) => safeSend(send, chatId, body);
  const actor = await contactByChat(db, chatId), command = parseCommand(text);
  if (command.cmd === 'pair') {
    const result = await redeemPairCode(db, command.code, chatId, now);
    if (result.ok) await reply('Đã nối Zalo với hệ thống giao việc.\n' + formatHelp(result.contact.kind));
    else if (!result.silent) await reply('Mã nối sai hoặc đã hết hạn.');
    return;
  }
  if (!actor) { await reply('Chào anh/chị. Gửi mã 6 số được cấp để nối với hệ thống giao việc.'); return; }
  try {
    if (command.cmd === 'status') {
      if (command.to === 'chua_xong' && !command.reason) { await reply(missingReason(command.no)); return; }
      await moveTask(db, actor, command.no, command.to, command.reason, now, send);
      await reply(`Đã ghi: V${command.no} ${STATUS_LABELS[command.to]}`);
    } else if (command.cmd === 'note') {
      await addTaskNote(db, actor, command.no, command.body, now, send);
      await reply(`Đã ghi chú V${command.no}.`);
    } else if (command.cmd === 'meeting') {
      if (command.answer === 'khong' && !command.reason) { await reply(missingReason(command.no, true)); return; }
      await answerMeeting(db, actor.id, command.no, command.answer, command.reason, now, send);
      await reply(`Đã ghi: H${command.no} ${command.answer === 'co' ? 'Tham gia' : 'Không tham gia'}`);
    } else if (command.cmd === 'assign' && actor.kind === 'leader') {
      const staff = await teamStaff(db, actor.id);
      const matches = staff.filter(c => /^\d+$/.test(command.who) ? c.no === Number(command.who) : fold(c.name) === fold(command.who));
      if (matches.length !== 1) { await reply('Không xác định được nhân viên. Gõ team để xem số thứ tự.'); return; }
      const today = new Date(now + 7 * 3600000).toISOString().slice(0, 10);
      const dueDate = command.due ? `${today.slice(0, 4)}-${command.due.slice(3)}-${command.due.slice(0, 2)}` : null;
      if (dueDate && !validDay(dueDate)) { await reply('Hạn không hợp lệ. Dùng han dd/mm.'); return; }
      const t = await createTask(db, actor, { title: command.title, assigneeId: matches[0].id, dueDate }, now, send);
      await reply(`Đã giao V${t.no} cho ${matches[0].name}.`);
    } else if (command.cmd === 'team' && actor.kind === 'leader') {
      await reply((await teamStaff(db, actor.id)).map(c => `${c.no}. ${c.name}`).join('\n') || 'Chưa có nhân viên.');
    } else if (command.cmd === 'week' && actor.kind === 'leader') {
      await reply(formatWeek(await weekSummary(db, actor.id, new Date(now + 7 * 3600000).toISOString().slice(0, 10))));
    } else if (command.cmd === 'list' || command.cmd === 'week') {
      const today = new Date(now + 7 * 3600000).toISOString().slice(0, 10), week = weekOfMonth(today);
      await reply(formatList(await listTasks(db, { actor, assigneeId: actor.id, status: 'open', ...(command.cmd === 'week' ? { month: week.month, week: week.week } : {}) }, now)));
    } else if (actor.kind === 'leader' && /^them\s+/.test(fold(text))) {
      const c = await saveContact(db, { name: clean(text).slice(5), kind: 'staff', leader_id: actor.id }, now);
      const code = await createPairCode(db, c.id, now);
      await reply(`Đã thêm ${c.name}. Mở Zalo, tìm bot và nhắn mã ${code} để nối.`);
    } else await reply(formatHelp(actor.kind));
  } catch { await reply('Không thể thực hiện lệnh. Kiểm tra quyền, mã việc/họp và trạng thái hiện tại. Gõ hd để xem hướng dẫn.'); }
}
