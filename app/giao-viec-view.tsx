'use client';
import { useEffect, useState, type SyntheticEvent } from 'react';
import { toast } from './ui-kit';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { STATUS_LABELS, weekOfMonth, taskState, type Contact, type Task, type Status } from '@/lib/zalo-work';

// fetch được cài qua app/api-fetch.ts tại dashboard.
export async function workApi<T = unknown>(url: string, method = 'GET', body?: unknown): Promise<T> {
  const init: RequestInit = { method, headers: { 'Content-Type': 'application/json' }, cache: 'no-store' };
  if (method !== 'GET' && body !== undefined) init.body = JSON.stringify(body);
  const res = await fetch(url, init);
  const data = await res.json() as T & { error?: string };
  if (!res.ok) throw new Error(data.error || 'Không tải được dữ liệu.');
  return data as T;
}
export const vnToday = () => new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 10);
export const dayAfter = (day: string, n: number) => new Date(Date.parse(day) + n * 86400000).toISOString().slice(0, 10);
export function WorkMessage({ text }: { text: string }) { return text ? <output className="rounded-lg border p-3 break-words">{text}</output> : null; }
export type WorkData = { tasks: Task[]; contacts: Contact[]; summaries: { leaderId: string; staff: { id: string; name: string; open: number; overdue: number; done: number }[] }[] };
export function GiaoViecView() {
  const today = vnToday(), current = weekOfMonth(today);
  const [month, setMonth] = useState(current.month), [week, setWeek] = useState<number | undefined>(current.week);
  const [data, setData] = useState<WorkData>({ tasks: [], contacts: [], summaries: [] });
  const [message, setMessage] = useState(''), [leader, setLeader] = useState(''), [person, setPerson] = useState(''), [filter, setFilter] = useState('all');
  const [create, setCreate] = useState(false), [selected, setSelected] = useState<Task | null>(null);
  const [events, setEvents] = useState<{ id: string; body: string; created_at: string; name: string }[]>([]);
  const [assignee, setAssignee] = useState(''), [title, setTitle] = useState(''), [detail, setDetail] = useState(''), [due, setDue] = useState(today), [urgent, setUrgent] = useState(false);
  const [status, setStatus] = useState<Status>('moi'), [reason, setReason] = useState(''), [note, setNote] = useState(''), [busy, setBusy] = useState(false);
  const load = async () => setData(await workApi<WorkData>(`/api/giao-viec?month=${month}${week ? `&week=${week}` : ''}`));
  useEffect(() => { let live = true; workApi<WorkData>(`/api/giao-viec?month=${month}${week ? `&week=${week}` : ''}`).then(d => { if (live) setData(d); }).catch(e => { if (live) setMessage(e.message); }); return () => { live = false; }; }, [month, week]);
  const leaders = data.contacts.filter(c => c.kind === 'leader' && c.active);
  const name = (id: string) => data.contacts.find(c => c.id === id)?.name ?? 'Người nhận';
  const open = (t: Task) => !['xong', 'huy'].includes(t.status);
  const matches = (t: Task) => filter === 'all' || filter === 'open' && open(t) || filter === 'overdue' && taskState(t, today) === 'overdue' || filter === 'chua_xong' && t.status === 'chua_xong' || filter === 'xong' && t.status === 'xong';
  const base = data.tasks.filter(t => (!leader || t.assignee_id === leader || data.contacts.find(c => c.id === t.assignee_id)?.leader_id === leader) && (!person || t.assignee_id === person));
  const show = async (t: Task) => {
    try { const d = await workApi<{ task: Task; events: typeof events }>(`/api/giao-viec/${t.id}`); setSelected(d.task); setEvents(d.events); setTitle(d.task.title); setDetail(d.task.detail); setDue(d.task.due_date ?? ''); setUrgent(!!d.task.urgent); setAssignee(d.task.assignee_id); setStatus(d.task.status); setReason(d.task.reason); setNote(''); } catch (e) { setMessage((e as Error).message); }
  };
  const run = async (action: () => Promise<void>) => { if (busy) return; setBusy(true); try { await action(); await load(); } catch (e) { setMessage((e as Error).message); } finally { setBusy(false); } };
  const submit = (e: SyntheticEvent<HTMLFormElement>) => { e.preventDefault(); void run(async () => { const result = await workApi<{ message: string }>('/api/giao-viec', 'POST', { title, detail, dueDate: due || null, urgent, assigneeId: assignee }); setMessage(result.message); toast(result.message); setCreate(false); }); };
  const patch = (body: unknown) => run(async () => { await workApi(`/api/giao-viec/${selected!.id}`, 'PATCH', body); setSelected(null); setMessage('Đã cập nhật việc.'); });
  const fields = <div className="space-y-3">
    <label className="block">Người nhận<div className="mt-2 flex flex-wrap gap-2">{(selected && data.contacts.find(c => c.id === selected.assignee_id)?.kind === 'staff' ? data.contacts.filter(c => c.kind === 'staff' && c.leader_id === selected.assigner_id && c.active) : leaders).map(c => <Button type="button" key={c.id} variant={assignee === c.id ? 'default' : 'outline'} onClick={() => setAssignee(c.id)}>{c.name}</Button>)}</div></label>
    <label htmlFor="giao-viec-view-1" className="block">Tên việc<Input id="giao-viec-view-1" required maxLength={200} value={title} onChange={e => setTitle(e.target.value)} /></label>
    <label htmlFor="giao-viec-view-2" className="block">Nội dung<Textarea id="giao-viec-view-2" value={detail} onChange={e => setDetail(e.target.value)} /></label>
    <div className="flex flex-wrap gap-2">{[['Hôm nay', today], ['Mai', dayAfter(today, 1)], ['Cuối tuần', weekOfMonth(today).to], ['Không hạn', '']].map(([label, day]) => <Button type="button" variant="outline" key={label} onClick={() => setDue(day)}>{label}</Button>)}</div>
    <label htmlFor="giao-viec-view-3" className="block">Chọn ngày<Input id="giao-viec-view-3" type="date" value={due} onChange={e => setDue(e.target.value)} /></label>
    <label className="flex items-center gap-2"><input type="checkbox" checked={urgent} onChange={e => setUrgent(e.target.checked)} />Gấp</label>
  </div>;
  const card = (t: Task) => <button key={t.id} className="w-full rounded-xl border p-3 text-left break-words hover:bg-muted" onClick={() => void show(t)}><span className={taskState(t, today) === 'overdue' ? 'text-red-600' : 'text-green-700'}>●</span> <strong>V{t.no} · {t.title}</strong>{!!t.urgent && <span className="ml-2 text-red-600">Gấp</span>}<p>{name(t.assignee_id)} · {STATUS_LABELS[t.status]} · Hạn: {t.due_date ?? 'Không hạn'}</p>{t.latest_note && <p>Ghi chú mới nhất: {t.latest_note}</p>}{t.reason && <p className="text-amber-700">Lý do: {t.reason}</p>}</button>;
  return <section className="min-w-0 space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-3"><h1 className="text-xl font-semibold">Giao việc</h1><Button onClick={() => { setSelected(null); setTitle(''); setDetail(''); setDue(today); setUrgent(false); setAssignee(leaders[0]?.id ?? ''); setCreate(true); }}>+ Giao việc</Button></div>
    <WorkMessage text={message} />
    <div className="flex flex-wrap items-center gap-2"><label>Tháng <input aria-label="Tháng" className="max-w-full rounded border p-2" type="month" value={month} onChange={e => { if (e.target.value) { setMonth(e.target.value); setWeek(undefined); } }} /></label>{Array.from({ length: weekOfMonth(`${month}-${new Date(Number(month.slice(0, 4)), Number(month.slice(5)), 0).getDate()}`).week }, (_, i) => i + 1).map(w => <Button key={w} variant={week === w ? 'default' : 'outline'} onClick={() => setWeek(w)}>Tuần {w}</Button>)}<Button variant={!week ? 'default' : 'outline'} onClick={() => setWeek(undefined)}>Cả tháng</Button></div>
    <p className="text-sm text-muted-foreground">Việc theo hạn trong {week ? `tuần ${week}` : 'cả tháng'} {month}; tối đa 500 việc, việc đóng trong 45 ngày gần nhất.</p>
    <div className="grid grid-cols-2 gap-2 md:grid-cols-4">{[['open', 'Đang mở', base.filter(open).length, ''], ['overdue', 'Quá hạn', base.filter(t => taskState(t, today) === 'overdue').length, 'text-red-600'], ['chua_xong', 'Chưa hoàn thành', base.filter(t => t.status === 'chua_xong').length, 'text-amber-700'], ['xong', 'Đã hoàn thành trong kỳ hạn', base.filter(t => t.status === 'xong').length, 'text-green-700']].map(([key, label, count, tone]) => <button key={key} className={`rounded-xl border p-3 text-left ${tone} ${filter === key ? 'ring-2 ring-primary' : ''}`} onClick={() => setFilter(filter === key ? 'all' : String(key))}><span className="block text-2xl font-semibold">{count}</span>{label}</button>)}</div>
    <div className="flex flex-wrap gap-2"><Button variant={!leader ? 'default' : 'outline'} onClick={() => { setLeader(''); setPerson(''); }}>Tất cả</Button>{leaders.map(l => <Button key={l.id} variant={leader === l.id ? 'default' : 'outline'} onClick={() => { setLeader(l.id); setPerson(''); }}>{data.tasks.some(t => (t.assignee_id === l.id || data.contacts.find(c => c.id === t.assignee_id)?.leader_id === l.id) && taskState(t, today) === 'overdue') && <span className="text-red-500">●</span>}{l.name} · {data.tasks.filter(t => (t.assignee_id === l.id || data.contacts.find(c => c.id === t.assignee_id)?.leader_id === l.id) && open(t)).length} mở</Button>)}</div>
    {person && <Button variant="outline" onClick={() => setPerson('')}>Bỏ lọc nhân viên: {name(person)}</Button>}
    {leaders.filter(l => !leader || l.id === leader).map(l => <article key={l.id} className="space-y-3 rounded-xl border p-3"><h2 className="font-semibold">{l.name} · {l.team_name}</h2>{base.filter(t => t.assignee_id === l.id && matches(t)).map(card)}<h3>Nhân viên · số việc hiện tại và hoàn thành tuần này</h3><div className="space-y-2">{data.summaries.find(s => s.leaderId === l.id)?.staff.map(s => <Button key={s.id} variant="outline" className="h-auto max-w-full whitespace-normal text-left" onClick={() => { setPerson(s.id); setLeader(l.id); }}>{s.name}: {s.open} mở · {s.overdue} quá hạn · {s.done} xong tuần này</Button>)}</div>{base.filter(t => data.contacts.find(c => c.id === t.assignee_id)?.leader_id === l.id && matches(t)).map(card)}</article>)}
    <p className="text-sm text-muted-foreground">Quá hạn: qua ngày hạn mà chưa Đã hoàn thành. Tuần tính từ thứ Hai.</p>
    <Sheet open={create || !!selected} onOpenChange={v => { if (!v) { setCreate(false); setSelected(null); } }}><SheetContent className="overflow-y-auto p-4"><SheetHeader><SheetTitle>{selected ? `V${selected.no} · Chi tiết việc` : 'Giao việc cho leader'}</SheetTitle></SheetHeader>{selected ? <div className="space-y-4">{fields}<Button disabled={busy} onClick={() => void patch({ title, detail, dueDate: due || null, urgent, assigneeId: assignee })}>Lưu sửa việc</Button><label className="block">Trạng thái<select className="w-full rounded border p-2" value={status} onChange={e => setStatus(e.target.value as Status)}>{Object.entries(STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label><label htmlFor="giao-viec-view-4" className="block">Lý do chưa hoàn thành<Input id="giao-viec-view-4" value={reason} onChange={e => setReason(e.target.value)} /></label><Button disabled={busy} onClick={() => void patch({ status, reason })}>Đổi trạng thái</Button><Button disabled={busy} variant="outline" onClick={() => void patch({ status: 'huy' })}>Huỷ việc</Button><label htmlFor="giao-viec-view-5" className="block">Ghi chú<Textarea id="giao-viec-view-5" value={note} onChange={e => setNote(e.target.value)} /></label><Button disabled={busy || !note.trim()} onClick={() => void patch({ note })}>Thêm ghi chú</Button><h3 className="font-semibold">Dòng thời gian</h3>{events.map(e => <p key={e.id} className="border-l-2 pl-3 break-words">{new Date(e.created_at).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })} · {e.name}<br />{e.body}</p>)}</div> : <form className="space-y-4" onSubmit={submit}>{fields}<Button type="submit" disabled={busy || !assignee}>Giao việc</Button></form>}</SheetContent></Sheet>
  </section>;
}
