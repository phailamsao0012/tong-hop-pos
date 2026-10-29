'use client';
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, type SyntheticEvent } from 'react';
import { ChevronLeft, Search, Send, Plus, BellRing, CalendarDays, ClipboardList, UsersRound } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Avatar, StatusChip, EmptyState, SkeletonTable, SegmentedControl, ErrorBox, toast, timeOnly, dmy, vi } from './ui-kit';
import { TaskChip, ConfirmWork, workDate } from './giao-viec-ui';
import { workApi, vnToday, dayAfter } from './giao-viec-view';
import { timeLabel, taskState, weekOfMonth, type Task } from '@/lib/zalo-work';
import type { Conversation, ChatMessage, ChatMeeting, ChatGroup } from '@/lib/zalo-chat';

type Thread = { contact: { id: string; name: string; kind: string; team_name: string; dept: string; linked: boolean }; messages: ChatMessage[]; tasks: (Task & { assigner_name: string | null })[]; meetings: ChatMeeting[]; doneWeek: number; members?: { id: string; name: string; kind: string; team_name: string; linked: boolean }[] };
type GroupEdit = { id?: string; name: string; memberIds: string[] };
type Filter = 'all' | 'unread' | 'overdue' | 'leader' | 'staff';
const QUICK = [
  ['Nhắc tiến độ', 'Anh/chị cập nhật giúp tiến độ các việc đang làm nhé.'],
  ['Hỏi lý do', 'Việc này đang vướng ở đâu, anh/chị báo giúp lý do nhé.'],
  ['Cảm ơn, tốt lắm', 'Cảm ơn anh/chị, làm tốt lắm!'],
  ['Báo cáo cuối ngày', 'Cuối ngày anh/chị gửi giúp báo cáo kết quả hôm nay nhé.'],
  ['Gọi lại cho tôi', 'Khi rảnh anh/chị gọi lại cho tôi nhé.'],
] as const;
const STEPS = ['moi', 'da_nhan', 'dang_lam', 'xong'] as const;
const vnDay = (iso: string) => new Date(Date.parse(iso) + 7 * 3600000).toISOString().slice(0, 10);
const vnClock = () => new Date(Date.now() + 7 * 3600000).toISOString().slice(11, 16);
function dayLabel(day: string) { const today = vnToday(); return day === today ? 'Hôm nay' : day === dayAfter(today, -1) ? 'Hôm qua' : dmy(day) + (day.slice(0, 4) !== today.slice(0, 4) ? '/' + day.slice(0, 4) : ''); }
function ago(iso: string) { const day = vnDay(iso); return day === vnToday() ? timeOnly(iso) : dayLabel(day); }
const teamLabel = (c: { kind: string; team_name: string; dept: string }) => `${c.kind === 'leader' ? 'Leader' : 'Nhân viên'}${c.team_name ? ' · ' + c.team_name : ''}${c.dept ? ' · ' + (c.dept === 'sale' ? 'Sale' : c.dept.toUpperCase()) : ''}`;
// Nhóm tổng dùng mã 'group:<id>' trong danh sách; tin nhóm đi qua API riêng.
const threadUrl = (id: string) => id.startsWith('group:') ? `/api/giao-viec/chat-nhom/${encodeURIComponent(id.slice(6))}` : `/api/giao-viec/chat/${encodeURIComponent(id)}`;
const visible = () => typeof document === 'undefined' || document.visibilityState === 'visible';

export function GiaoViecChatView() {
  const [list, setList] = useState<Conversation[] | null>(null), [groups, setGroups] = useState<ChatGroup[]>([]), [listError, setListError] = useState(''), [groupEdit, setGroupEdit] = useState<GroupEdit | null>(null), [dropGroup, setDropGroup] = useState(false);
  const [selected, setSelected] = useState(''), [thread, setThread] = useState<Thread | null>(null), [threadError, setThreadError] = useState('');
  const [filter, setFilter] = useState<Filter>('all'), [q, setQ] = useState(''), [text, setText] = useState(''), [busy, setBusy] = useState(false), [older, setOlder] = useState(true);
  const [assign, setAssign] = useState(false), [cancelNo, setCancelNo] = useState<Task | null>(null);
  const [title, setTitle] = useState(''), [detail, setDetail] = useState(''), [due, setDue] = useState(vnToday()), [urgent, setUrgent] = useState(false);
  const scroller = useRef<HTMLDivElement>(null), stick = useRef(true);
  const loadList = useCallback(() => workApi<{ conversations: Conversation[]; groups: ChatGroup[] }>('/api/giao-viec/chat').then(d => { setList(d.conversations); setGroups(d.groups ?? []); setListError(''); }).catch(e => setListError((e as Error).message)), []);
  useEffect(() => { void loadList(); const id = setInterval(() => { if (visible()) void loadList(); }, 60000); return () => clearInterval(id); }, [loadList]);
  // Mở người mới: tải 60 tin gần nhất, cuộn xuống cuối.
  useEffect(() => {
    if (!selected) return;
    let live = true; stick.current = true;
    workApi<Thread>(threadUrl(selected)).then(d => { if (!live) return; setThread(d); setOlder(d.messages.length >= 60); setThreadError(''); setList(l => l?.map(c => c.id === selected ? { ...c, unread: 0 } : c) ?? l); }).catch(e => { if (live) setThreadError((e as Error).message); });
    return () => { live = false; };
  }, [selected]);
  // Tin mới: hỏi lại mỗi 20 giây khi tab trình duyệt đang hiện, chỉ lấy từ tin cuối trở đi.
  const poll = useCallback(async () => {
    if (!thread || !visible()) return;
    const last = thread.messages.at(-1)?.created_at;
    const d = await workApi<Thread>(`${threadUrl(thread.contact.id)}${last ? `?after=${encodeURIComponent(last)}` : ''}`);
    setThread(t => {
      if (!t || t.contact.id !== d.contact.id) return t;
      const seen = new Set(t.messages.map(m => m.id)), fresh = d.messages.filter(m => !seen.has(m.id));
      return { ...d, messages: fresh.length || !last ? (last ? [...t.messages, ...fresh] : d.messages) : t.messages };
    });
  }, [thread]);
  useEffect(() => { const id = setInterval(() => { poll().catch(() => undefined); }, 20000); return () => clearInterval(id); }, [poll]);
  useEffect(() => { const el = scroller.current; if (el && stick.current) el.scrollTop = el.scrollHeight; }, [thread?.messages]);
  const loadOlder = async () => {
    if (!thread?.messages.length) return;
    const el = scroller.current, height = el?.scrollHeight ?? 0;
    const d = await workApi<Thread>(`${threadUrl(thread.contact.id)}?before=${encodeURIComponent(thread.messages[0].created_at)}`);
    stick.current = false; setOlder(d.messages.length >= 60);
    setThread(t => t && { ...t, messages: [...d.messages.filter(m => !t.messages.some(x => x.id === m.id)), ...t.messages] });
    requestAnimationFrame(() => { if (el) el.scrollTop = el.scrollHeight - height; });
  };
  const run = async (action: () => Promise<unknown>, ok?: string) => {
    if (busy) return; setBusy(true);
    try { await action(); if (ok) toast(ok); stick.current = true; await poll(); void loadList(); }
    catch (e) { toast((e as Error).message); }
    finally { setBusy(false); }
  };
  const send = () => {
    const body = text.trim(); if (!body || !thread) return;
    void run(async () => {
      const r = await workApi<{ delivered?: boolean; reached?: number; total?: number; missed?: string[] }>(threadUrl(thread.contact.id), 'POST', { text: body }); setText('');
      if (r.total !== undefined) toast(`Đã gửi tới ${r.reached}/${r.total} người${r.missed?.length ? `. Chưa nối Zalo: ${r.missed.join(', ')}` : ''}`);
      else if (!r.delivered) toast('Đã lưu tin, nhưng người này chưa nối Zalo nên chưa nhận được.');
    });
  };
  const saveGroupEdit = (e: SyntheticEvent<HTMLFormElement>) => { e.preventDefault(); const g = groupEdit; if (!g) return; void run(async () => { const r = await workApi<{ id: string }>('/api/giao-viec/chat-nhom', 'POST', g); setGroupEdit(null); await loadList(); setSelected('group:' + r.id); setThread(null); }, g.id ? 'Đã lưu nhóm' : 'Đã tạo nhóm'); };
  const removeGroup = () => { const g = groupEdit; if (!g?.id) return; setDropGroup(false); void run(async () => { await workApi(`/api/giao-viec/chat-nhom?id=${encodeURIComponent(g.id!)}`, 'DELETE'); setGroupEdit(null); setSelected(''); setThread(null); }, 'Đã xoá nhóm'); };
  const editGroup = (id?: string) => { const g = groups.find(x => x.id === id); setGroupEdit(g ? { id: g.id, name: g.name, memberIds: g.memberIds } : { name: 'Nhóm tổng leader', memberIds: (list ?? []).filter(c => c.kind === 'leader').map(c => c.id) }); };
  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); send(); } };
  const remind = (kind: 'task' | 'meeting', no: number) => thread && run(() => workApi(`/api/giao-viec/chat/${encodeURIComponent(thread.contact.id)}/nhac`, 'POST', { kind, no }), 'Đã gửi nhắc qua Zalo');
  const submitTask = (e: SyntheticEvent<HTMLFormElement>) => { e.preventDefault(); if (!thread) return; void run(async () => { await workApi('/api/giao-viec', 'POST', { title, detail, dueDate: due || null, startDate: vnToday(), urgent, assigneeId: thread.contact.id }); setAssign(false); }, 'Đã giao việc và gửi Zalo'); };

  const today = vnToday(), now = vnClock();
  const shown = useMemo(() => (list ?? []).filter(c => (filter === 'all' || filter === 'unread' && c.unread > 0 || filter === 'overdue' && c.overdue > 0 || filter === c.kind) && (!q.trim() || c.name.toLowerCase().includes(q.trim().toLowerCase()) || c.team_name.toLowerCase().includes(q.trim().toLowerCase()))), [list, filter, q]);
  const task = (no: number | null) => thread?.tasks.find(t => t.no === no);
  const meeting = (no: number | null) => thread?.meetings.find(m => m.no === no);
  const openTasks = thread?.tasks.filter(t => t.assignee_id === thread.contact.id && !['xong', 'huy'].includes(t.status)) ?? [];
  const isGroup = thread?.contact.kind === 'group';
  const upcoming = thread?.meetings.filter(m => !m.cancelled_at && m.answer !== undefined && vnDay(m.start_at) >= today) ?? [];

  const taskCard = (t: Task & { assigner_name?: string | null }) => {
    const step = STEPS.indexOf(t.status as typeof STEPS[number]), late = taskState(t, today, now) === 'overdue';
    return <div className="w-full max-w-[420px] rounded-xl border border-line bg-surface p-3 text-left shadow-card">
      <div className="flex flex-wrap items-center gap-1.5 text-xs text-ink-3"><ClipboardList className="size-3.5" aria-hidden />Việc số {t.no}{!!t.urgent && <StatusChip tone="red">Gấp</StatusChip>}{late && <StatusChip tone="red">Quá hạn</StatusChip>}<span className="ml-auto"><TaskChip status={t.status} /></span></div>
      <p className="mt-1 font-semibold break-words">{t.title}</p>
      <p className={`text-xs ${late ? 'text-bad' : 'text-ink-3'}`}>{timeLabel(t)}{t.assigner_name ? ` · Giao bởi ${t.assigner_name}` : ''}</p>
      {t.status === 'chua_xong' && t.reason && <p className="mt-1 text-xs text-warn">Lý do: {t.reason}</p>}
      <div className="mt-2 grid grid-cols-4 gap-1" aria-label="Tiến độ">{STEPS.map((s, i) => <span key={s} className={`h-1.5 rounded-full ${t.status === 'huy' ? 'bg-line' : t.status === 'chua_xong' ? (i <= 2 ? 'bg-t-orange' : 'bg-line') : i <= step ? 'bg-primary' : 'bg-line'}`} />)}</div>
      <div className="mt-1 grid grid-cols-4 text-[10px] text-ink-3">{['Mới giao', 'Đã nhận', 'Đang làm', 'Xong'].map(s => <span key={s}>{s}</span>)}</div>
      {!['xong', 'huy'].includes(t.status) && <div className="mt-2 flex flex-wrap gap-2"><button className="btn sm" disabled={busy} onClick={() => void remind('task', t.no)}><BellRing className="size-3.5" aria-hidden />Nhắc tiến độ</button><button className="btn sm text-bad" disabled={busy} onClick={() => setCancelNo(t)}>Huỷ việc</button></div>}
    </div>;
  };
  const meetingCard = (m: ChatMeeting) => <div className="w-full max-w-[420px] rounded-xl border border-line bg-surface p-3 text-left shadow-card">
    <div className="flex items-center gap-1.5 text-xs text-ink-3"><CalendarDays className="size-3.5" aria-hidden />Họp số {m.no}{m.cancelled_at && <StatusChip tone="gray">Đã huỷ</StatusChip>}<span className="ml-auto">{m.answer === 'co' ? <StatusChip tone="green">Đi họp</StatusChip> : m.answer === 'khong' ? <StatusChip tone="orange">Không đi</StatusChip> : <StatusChip tone="gray">Chưa trả lời</StatusChip>}</span></div>
    <p className="mt-1 font-semibold break-words">{m.title}</p>
    <p className="text-xs text-ink-3">{workDate(m.start_at)} · {m.place}</p>
    <p className="mt-1 text-xs text-ink-3"><span className="num">{vi.format(m.yes)}</span> đi · <span className="num">{vi.format(m.noAnswer)}</span> không · <span className="num">{vi.format(m.pending)}</span> chưa trả lời</p>
    {m.answer === 'khong' && m.reason && <p className="text-xs text-warn">Lý do: {m.reason}</p>}
    {!m.cancelled_at && !m.answer && <button className="btn sm mt-2" disabled={busy} onClick={() => void remind('meeting', m.no)}><BellRing className="size-3.5" aria-hidden />Nhắc trả lời</button>}
  </div>;
  const bubble = (m: ChatMessage) => {
    const out = m.dir === 'out';
    if (m.kind === 'status' && out) return <div className="mx-auto max-w-[90%] rounded-full border border-dashed border-line-3 px-3 py-1 text-center text-xs text-ink-3 break-words">{m.body.split('\n')[0]} · {timeOnly(m.created_at)}</div>;
    const card = m.kind === 'task' ? task(m.ref_no) : null, meet = m.kind === 'meeting' ? meeting(m.ref_no) : null;
    return <div className={`flex flex-col gap-1 ${out ? 'items-end' : 'items-start'}`}>
      {isGroup && !out && <span className="text-[11px] font-semibold text-ink-2">{m.author_name}</span>}
      {card ? taskCard(card) : meet ? meetingCard(meet) : <div className={`max-w-[80%] whitespace-pre-wrap rounded-2xl px-3 py-2 text-sm break-words shadow-card ${out ? 'rounded-br-md bg-primary text-primary-ink' : 'rounded-bl-md border border-line bg-surface'}`}>{m.body}</div>}
      <span className="text-[11px] text-ink-3">{out ? `${m.author_name ?? 'Bot'} · ` : 'Zalo · '}{timeOnly(m.created_at)}{out ? (isGroup ? ` · đã tới ${m.delivered}/${m.ref_no ?? 0} người` : m.delivered ? ' · đã gửi Zalo ✓' : ' · chưa nối Zalo') : ''}</span>
    </div>;
  };

  const people = <aside className={`min-h-0 flex-col border-line min-[700px]:flex min-[700px]:border-r ${selected ? 'hidden' : 'flex'}`}>
    <div className="space-y-2 border-b border-line p-3">
      <label htmlFor="chat-search" className="relative block"><Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-ink-3" aria-hidden /><Input id="chat-search" aria-label="Tìm người" placeholder="Tìm tên, team" className="pl-8" value={q} onChange={e => setQ(e.target.value)} /></label>
      <fieldset className="flex flex-wrap gap-1.5" aria-label="Lọc người">{([['all', 'Tất cả'], ['unread', 'Chưa đọc'], ['overdue', 'Quá hạn'], ['leader', 'Leader'], ['staff', 'Nhân viên']] as const).map(([value, label]) => <button key={value} aria-pressed={filter === value} onClick={() => setFilter(value)} className={`rounded-full px-2.5 py-1 text-xs font-semibold transition-colors ${filter === value ? 'bg-primary text-primary-ink' : 'bg-surface-2 text-ink-2 hover:bg-surface-3'}`}>{label}</button>)}</fieldset>
    </div>
    <div className="min-h-0 flex-1 overflow-y-auto [scrollbar-color:var(--line-3)_transparent] [scrollbar-width:thin] [scrollbar-gutter:stable]">
      {list && <div className="border-b border-line">
        <div className="flex items-center px-3 pt-2.5 pb-1"><h3 className="text-xs font-semibold tracking-wide text-ink-3 uppercase">Nhóm</h3><button className="btn sm ml-auto" onClick={() => editGroup()}><Plus className="size-3.5" aria-hidden />Tạo nhóm</button></div>
        {!groups.length && <p className="px-3 pb-2.5 text-xs text-ink-3">Tạo nhóm để nhắn một lần cho nhiều leader.</p>}
        {groups.map(g => <button key={g.id} onClick={() => setSelected('group:' + g.id)} className={`flex w-full items-center gap-2.5 px-3 py-2 text-left hover:bg-surface-2 ${selected === 'group:' + g.id ? 'bg-tint' : ''}`}>
          <span className="grid size-[26px] shrink-0 place-items-center rounded-full bg-t-purple-bg text-t-purple"><UsersRound className="size-3.5" aria-hidden /></span>
          <span className="min-w-0 flex-1"><span className="flex items-center gap-2"><strong className="truncate">{g.name}</strong><span className="ml-auto shrink-0 text-[11px] text-ink-3">{g.last ? ago(g.last.at) : ''}</span></span><span className="block truncate text-xs text-ink-3">{g.memberIds.length} người{g.last ? ' · Bạn: ' + g.last.body.split('\n')[0] : ''}</span></span>
        </button>)}
      </div>}
      {listError ? <ErrorBox error={listError} onRetry={() => void loadList()} className="m-3" /> : !list ? <SkeletonTable rows={6} cols={1} className="m-3" /> : !shown.length ? <EmptyState text="Không có ai" /> : shown.map(c => <button key={c.id} onClick={() => setSelected(c.id)} className={`flex w-full items-start gap-2.5 border-b border-line px-3 py-2.5 text-left hover:bg-surface-2 ${selected === c.id ? 'bg-tint' : ''}`}>
        <Avatar name={c.name} />
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2"><strong className="truncate">{c.name}</strong><span className="ml-auto shrink-0 text-[11px] text-ink-3">{c.last ? ago(c.last.at) : ''}</span></span>
          <span className="flex items-center gap-2"><span className={`truncate text-xs ${c.unread ? 'font-semibold text-ink' : 'text-ink-3'}`}>{c.last ? (c.last.dir === 'out' ? 'Bạn: ' : '') + c.last.body.split('\n')[0] : teamLabel(c)}</span>{c.unread > 0 && <span className="ml-auto grid min-w-5 shrink-0 place-items-center rounded-full bg-primary px-1.5 text-[11px] font-semibold text-primary-ink num">{c.unread}</span>}</span>
          <span className="mt-1 flex flex-wrap gap-1">{c.open > 0 && <StatusChip tone="blue">{c.open} việc mở</StatusChip>}{c.overdue > 0 && <StatusChip tone="red">{c.overdue} quá hạn</StatusChip>}{c.nextMeeting && <StatusChip tone="purple">Họp {timeOnly(c.nextMeeting)}</StatusChip>}{c.waiting && <StatusChip tone="orange">Chờ trả lời</StatusChip>}{!c.linked && <StatusChip tone="gray">Chưa nối Zalo</StatusChip>}</span>
        </span>
      </button>)}
    </div>
  </aside>;

  const chat = <div className={`min-h-0 min-w-0 flex-col ${selected ? 'flex' : 'hidden min-[700px]:flex'}`}>
    {!selected ? <div className="grid flex-1 place-items-center p-6"><EmptyState text="Chọn một người bên trái để xem chat" /></div> : threadError ? <ErrorBox error={threadError} className="m-3" /> : !thread || thread.contact.id !== selected ? <SkeletonTable rows={6} cols={1} className="m-3" /> : <>
      <header className="flex items-center gap-2.5 border-b border-line px-3 py-2.5">
        <button className="btn sm min-[700px]:hidden" aria-label="Quay lại danh sách" onClick={() => setSelected('')}><ChevronLeft className="size-4" aria-hidden /></button>
        {isGroup ? <span className="grid size-[26px] shrink-0 place-items-center rounded-full bg-t-purple-bg text-t-purple"><UsersRound className="size-3.5" aria-hidden /></span> : <Avatar name={thread.contact.name} />}
        <span className="min-w-0 flex-1"><strong className="block truncate">{thread.contact.name}</strong><small className="block truncate text-ink-3">{isGroup ? `${thread.members?.length ?? 0} người · bot gửi riêng cho từng người` : `${teamLabel(thread.contact)} · ${thread.contact.linked ? 'đã nối Zalo' : 'chưa nối Zalo'}`}</small></span>
        {isGroup && <button className="btn sm" onClick={() => editGroup(thread.contact.id.slice(6))}>Sửa nhóm</button>}
      </header>
      <div ref={scroller} onScroll={e => { const el = e.currentTarget; stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80; }} className="min-h-0 flex-1 space-y-3 overflow-y-auto [scrollbar-color:var(--line-3)_transparent] [scrollbar-width:thin] [scrollbar-gutter:stable] bg-canvas bg-[radial-gradient(var(--line-2)_1px,transparent_1px)] [background-size:16px_16px] p-3">
        {older && thread.messages.length > 0 && <div className="text-center"><button className="btn sm" onClick={() => void loadOlder()}>Tải tin cũ hơn</button></div>}
        {!thread.messages.length && <EmptyState text={isGroup ? 'Chưa có tin nhóm. Nhắn ở dưới, bot gửi riêng cho từng người trong nhóm.' : 'Chưa có tin nào. Tin bot gửi và tin người này nhắn trên Zalo sẽ hiện ở đây.'} />}
        {thread.messages.map((m, i) => { const day = vnDay(m.created_at), divider = !i || day !== vnDay(thread.messages[i - 1].created_at); return <div key={m.id} className="space-y-3">{divider && <div className="flex items-center gap-2 text-[11px] text-ink-3"><span className="h-px flex-1 bg-line" />{dayLabel(day)}<span className="h-px flex-1 bg-line" /></div>}{bubble(m)}</div>; })}
      </div>
      <footer className="space-y-2 border-t border-line p-3">
        <div className="flex gap-1.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {thread.contact.kind === 'leader' && <button className="btn sm shrink-0" onClick={() => { setTitle(''); setDetail(''); setDue(vnToday()); setUrgent(false); setAssign(true); }}><Plus className="size-3.5" aria-hidden />Giao việc</button>}
          {QUICK.map(([label, body]) => <button key={label} className="btn sm shrink-0" onClick={() => setText(body)}>{label}</button>)}
        </div>
        <div className="flex items-end gap-2">
          <Textarea aria-label="Nhắn tin" rows={1} maxLength={1000} placeholder="Nhắn qua Zalo… (Enter để gửi)" className="max-h-32 min-h-9 flex-1 resize-none" value={text} onChange={e => setText(e.target.value)} onKeyDown={onKey} />
          <button className="btn primary sm shrink-0" aria-label="Gửi" disabled={busy || !text.trim()} onClick={send}><Send className="size-4" aria-hidden /></button>
        </div>
      </footer>
    </>}
  </div>;

  const side = thread && selected && thread.contact.id === selected && <aside className="hidden min-h-0 space-y-4 overflow-y-auto [scrollbar-color:var(--line-3)_transparent] [scrollbar-width:thin] [scrollbar-gutter:stable] border-l border-line p-3 min-[1040px]:block">
    {isGroup ? <section><h3 className="mb-2 text-xs font-semibold tracking-wide text-ink-3 uppercase">Thành viên</h3><ul className="space-y-1.5">{thread.members?.map(p => <li key={p.id} className="flex items-center gap-2 text-sm"><Avatar size="sm" name={p.name} /><span className="min-w-0 flex-1 truncate">{p.name}<small className="block truncate text-ink-3">{p.kind === 'leader' ? 'Leader' : 'Nhân viên'} · {p.team_name}</small></span>{!p.linked && <StatusChip tone="gray">Chưa nối</StatusChip>}</li>)}</ul><p className="mt-3 text-xs text-ink-3">Tin trả lời của thành viên trong 24 giờ sau tin nhóm hiện ở đây và trong chat riêng của họ.</p></section> : <>
    <div className="grid grid-cols-3 gap-2 text-center">{[['Đang mở', openTasks.length, ''], ['Quá hạn', openTasks.filter(t => taskState(t, today, now) === 'overdue').length, 'text-bad'], ['Xong 7 ngày', thread.doneWeek, 'text-good']].map(([label, n, tone]) => <div key={label as string} className="rounded-lg bg-surface-2 p-2"><b className={`block text-lg num ${tone as string}`}>{vi.format(n as number)}</b><small className="text-ink-3">{label as string}</small></div>)}</div>
    <section><h3 className="mb-2 text-xs font-semibold tracking-wide text-ink-3 uppercase">Việc đang mở</h3>{!openTasks.length ? <p className="text-sm text-ink-3">Không có việc mở.</p> : <ul className="space-y-2">{openTasks.map(t => <li key={t.id} className="rounded-lg border border-line p-2 text-sm"><span className="flex items-center gap-1.5"><b className="num">#{t.no}</b><span className="truncate">{t.title}</span></span><span className="mt-1 flex flex-wrap items-center gap-1"><TaskChip status={t.status} />{taskState(t, today, now) === 'overdue' && <StatusChip tone="red">Quá hạn</StatusChip>}<small className="text-ink-3">{timeLabel(t).replace(/^(Hạn|Thời gian): /, '')}</small></span></li>)}</ul>}</section>
    <section><h3 className="mb-2 text-xs font-semibold tracking-wide text-ink-3 uppercase">Họp sắp tới</h3>{!upcoming.length ? <p className="text-sm text-ink-3">Không có họp.</p> : <ul className="space-y-2">{upcoming.map(m => <li key={m.id} className="rounded-lg border border-line p-2 text-sm"><b>Họp số {m.no}</b> · {m.title}<small className="block text-ink-3">{workDate(m.start_at)} · {m.answer === 'co' ? 'Đi họp' : m.answer === 'khong' ? 'Không đi' : 'Chưa trả lời'}</small></li>)}</ul>}</section></>}
  </aside>;

  return <section className="min-w-0 space-y-2">
    <div className="grid h-[calc(100dvh-170px)] min-h-[520px] overflow-hidden rounded-[var(--radius-card)] border border-line bg-surface shadow-card min-[700px]:grid-cols-[300px_minmax(0,1fr)] min-[1040px]:grid-cols-[300px_minmax(0,1fr)_280px]">
      {people}{chat}{side}
    </div>
    <p className="text-xs text-ink-3">Tin Zalo về web chậm khoảng 1 phút. Chỉ lưu 180 ngày.</p>
    <Sheet open={assign} onOpenChange={setAssign}><SheetContent className="overflow-y-auto p-4 sm:max-w-lg"><SheetHeader><SheetTitle>Giao việc cho {thread?.contact.name}</SheetTitle></SheetHeader>
      <form className="space-y-3" onSubmit={submitTask}>
        <label htmlFor="chat-task-title" className="block">Tên việc<Input id="chat-task-title" required maxLength={200} value={title} onChange={e => setTitle(e.target.value)} /></label>
        <label htmlFor="chat-task-detail" className="block">Nội dung<Textarea id="chat-task-detail" value={detail} onChange={e => setDetail(e.target.value)} /></label>
        <label htmlFor="chat-task-due" className="block">Đến ngày<Input id="chat-task-due" type="date" min={today} value={due} onChange={e => setDue(e.target.value)} /></label>
        <div className="max-w-full overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"><SegmentedControl size="sm" className="!max-w-none" ariaLabel="Đến ngày nhanh" value={due} onChange={setDue} options={[{ label: 'Hôm nay', value: today }, { label: 'Mai', value: dayAfter(today, 1) }, { label: 'Cuối tuần', value: weekOfMonth(today).to }, { label: 'Không hạn', value: '' }]} /></div>
        <label htmlFor="chat-task-urgent" className="flex items-center gap-2"><Switch id="chat-task-urgent" checked={urgent} onCheckedChange={setUrgent} />Gấp</label>
        <p className="text-xs text-ink-3">Cần chọn giờ hay khoảng ngày thì giao ở tab Giao việc.</p>
        <button className="btn primary" type="submit" disabled={busy || !title.trim()}>Giao việc và gửi Zalo</button>
      </form>
    </SheetContent></Sheet>
    <Sheet open={!!groupEdit} onOpenChange={v => { if (!v) setGroupEdit(null); }}><SheetContent className="overflow-y-auto p-4 sm:max-w-lg"><SheetHeader><SheetTitle>{groupEdit?.id ? 'Sửa nhóm' : 'Tạo nhóm'}</SheetTitle></SheetHeader>
      {groupEdit && <form className="space-y-3" onSubmit={saveGroupEdit}>
        <label htmlFor="chat-group-name" className="block">Tên nhóm<Input id="chat-group-name" required maxLength={60} value={groupEdit.name} onChange={e => setGroupEdit({ ...groupEdit, name: e.target.value })} /></label>
        <p className="text-xs text-ink-3">Nhắn trong nhóm thì bot gửi riêng cho từng người, đầu tin ghi [{groupEdit.name || 'Tên nhóm'}].</p>
        {(['leader', 'staff'] as const).map(kind => { const people = (list ?? []).filter(c => c.kind === kind); if (!people.length) return null; const all = people.every(c => groupEdit.memberIds.includes(c.id)); return <fieldset key={kind} className="space-y-1.5">
          <div className="flex items-center"><legend className="text-xs font-semibold tracking-wide text-ink-3 uppercase">{kind === 'leader' ? 'Leader' : 'Nhân viên'}</legend><button type="button" className="btn sm ml-auto" onClick={() => setGroupEdit({ ...groupEdit, memberIds: all ? groupEdit.memberIds.filter(id => !people.some(c => c.id === id)) : [...new Set([...groupEdit.memberIds, ...people.map(c => c.id)])] })}>{all ? 'Bỏ chọn hết' : 'Chọn hết'}</button></div>
          {people.map(c => <label key={c.id} htmlFor={`chat-group-${c.id}`} className="flex items-center gap-2 text-sm"><Checkbox id={`chat-group-${c.id}`} checked={groupEdit.memberIds.includes(c.id)} onCheckedChange={v => setGroupEdit({ ...groupEdit, memberIds: v ? [...groupEdit.memberIds, c.id] : groupEdit.memberIds.filter(id => id !== c.id) })} /><span className="min-w-0 flex-1 truncate">{c.name} <small className="text-ink-3">· {c.team_name}</small></span>{!c.linked && <StatusChip tone="gray">Chưa nối</StatusChip>}</label>)}
        </fieldset>; })}
        <div className="flex flex-wrap gap-2"><button className="btn primary" type="submit" disabled={busy || !groupEdit.name.trim() || !groupEdit.memberIds.length}>{groupEdit.id ? 'Lưu nhóm' : 'Tạo nhóm'} ({groupEdit.memberIds.length} người)</button>{groupEdit.id && <button type="button" className="btn text-bad" disabled={busy} onClick={() => setDropGroup(true)}>Xoá nhóm</button>}</div>
      </form>}
    </SheetContent></Sheet>
    <ConfirmWork title="Xoá nhóm này?" open={dropGroup} busy={busy} onClose={() => setDropGroup(false)} onConfirm={removeGroup} />
    <ConfirmWork title={`Huỷ việc số ${cancelNo?.no ?? ''}?`} open={!!cancelNo} busy={busy} onClose={() => setCancelNo(null)} onConfirm={() => { const t = cancelNo!; setCancelNo(null); void run(() => workApi(`/api/giao-viec/${t.id}`, 'PATCH', { status: 'huy' }), 'Đã huỷ việc'); }} />
  </section>;
}
