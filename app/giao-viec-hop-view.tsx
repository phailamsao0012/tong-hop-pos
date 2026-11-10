'use client';
import { useEffect, useState, type SyntheticEvent } from 'react';
import { CalendarDays, UserRound, UserX } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { NativeSelect } from '@/components/ui/native-select';
import { Checkbox } from '@/components/ui/checkbox';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import type { Contact, Meeting } from '@/lib/zalo/zalo-work';
import { workApi, WorkMessage } from './giao-viec-view';
import { ConfirmWork, Field, hours, workDate } from './giao-viec-ui';
import { PageHeader, MiniStat, ChartCard, TableWrap, Avatar, StatusChip, EmptyState, SkeletonTable, toast, ErrorBox } from './ui-kit';
type MeetingsData = { contacts: Contact[]; meetings: (Meeting & { invites: { contact_id: string; name: string; answer: string | null; reason: string; answered_at?: string | null }[] })[] };
export function GiaoViecHopView() {
  const [data, setData] = useState<MeetingsData>({ contacts: [], meetings: [] }), [message, setMessage] = useState(''), [show, setShow] = useState(false), [busy, setBusy] = useState(false), [loading, setLoading] = useState(true), [cancelId, setCancelId] = useState(''), [loadError, setLoadError] = useState('');
  const [title, setTitle] = useState(''), [day, setDay] = useState(''), [time, setTime] = useState('14:00'), [place, setPlace] = useState(''), [note, setNote] = useState(''), [ids, setIds] = useState<string[]>([]);
  const load = async () => setData(await workApi<MeetingsData>('/api/giao-viec/hop'));
  useEffect(() => { void workApi<MeetingsData>('/api/giao-viec/hop').then(setData).catch(e => setLoadError(e.message)).finally(() => setLoading(false)); }, []);
  const leaders = data.contacts.filter(c => c.kind === 'leader' && c.active);
  const [now] = useState(() => Date.now());
  const upcoming = data.meetings.filter(m => Date.parse(m.start_at) >= now);
  const active = upcoming.filter(m => !m.cancelled_at);
  const submit = async (e: SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault(); if (busy) return; setBusy(true);
    try { await workApi('/api/giao-viec/hop', 'POST', { title, startAt: new Date(`${day}T${time}:00+07:00`).toISOString(), place, note, inviteeIds: ids }); setShow(false); toast('Đã tạo họp và ghi thông báo Zalo.'); await load(); } catch (error) { setMessage((error as Error).message); } finally { setBusy(false); }
  };
  const cancel = async () => { if (busy) return; setBusy(true); try { await workApi(`/api/giao-viec/hop/${cancelId}`, 'PATCH', {}); setCancelId(''); await load(); } catch (e) { setMessage((e as Error).message); } finally { setBusy(false); } };
  return <section className="min-w-0 space-y-4">
    <PageHeader title="Họp" eyebrow="Sắp tới và 14 ngày qua · giờ Việt Nam" actions={<button className="btn primary" onClick={() => { setIds(leaders.map(c => c.id)); setTitle(''); setDay(''); setPlace(''); setNote(''); setShow(true); }}>+ Tạo họp</button>} />
    <WorkMessage text={message} />{loadError && <ErrorBox error={loadError} />}
    <div className="grid gap-3 sm:grid-cols-3"><MiniStat icon={CalendarDays} label="Họp sắp tới" value={String(active.length)} /><MiniStat icon={UserRound} label="Leader chưa trả lời" note="Trong các cuộc sắp tới" value={String(active.reduce((n, m) => n + m.invites.filter(i => !i.answer).length, 0))} /><MiniStat icon={UserX} tone="red" label="Leader báo không tham gia" note="Trong các cuộc sắp tới" value={String(active.reduce((n, m) => n + m.invites.filter(i => i.answer === 'khong').length, 0))} /></div>
    {loading ? <SkeletonTable /> : [true, false].map(future => <div key={String(future)} className="space-y-3"><h2 className="text-sm font-semibold">{future ? 'Sắp tới' : 'Đã qua'}</h2>{!(future ? upcoming : data.meetings.filter(m => Date.parse(m.start_at) < now)).length && <EmptyState text="Không có cuộc họp trong kỳ này" />}{(future ? upcoming : data.meetings.filter(m => Date.parse(m.start_at) < now)).map(m => <ChartCard key={m.id} className={m.cancelled_at ? 'opacity-60' : ''} title={`H${m.no} · ${m.title}`} subtitle={`${new Intl.DateTimeFormat('vi-VN', { weekday: 'long', timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date(m.start_at))} ${workDate(m.start_at).replace(' ', ' · ')}${m.place ? ` · ${m.place}` : ''}`} action={<div className="flex flex-wrap items-center gap-2">{m.cancelled_at && <StatusChip tone="gray">Đã huỷ</StatusChip>}<StatusChip tone="green">Tham gia {m.invites.filter(i => i.answer === 'co').length}</StatusChip><StatusChip tone="red">Không {m.invites.filter(i => i.answer === 'khong').length}</StatusChip><StatusChip tone="gray">Chưa trả lời {m.invites.filter(i => !i.answer).length}</StatusChip>{future && !m.cancelled_at && <button className="btn sm" disabled={busy} onClick={() => setCancelId(m.id)}>Huỷ họp</button>}</div>}>
      {m.note && <p className="mb-3 text-sm text-ink-3 break-words">{m.note}</p>}<TableWrap><table className="tbl"><thead><tr><th>Leader</th><th>Trả lời</th><th>Lý do</th><th>Trả lời lúc</th></tr></thead><tbody>{m.invites.map(i => <tr key={i.contact_id}><td><div className="flex items-center gap-2"><Avatar name={i.name} /><span>{i.name}<small className="block text-ink-3">{data.contacts.find(c => c.id === i.contact_id)?.team_name}</small></span></div></td><td><StatusChip tone={i.answer === 'co' ? 'green' : i.answer === 'khong' ? 'red' : 'gray'}>{i.answer === 'co' ? 'Tham gia' : i.answer === 'khong' ? 'Không tham gia' : 'Chưa trả lời'}</StatusChip></td><td>{i.reason || '—'}</td><td>{workDate(i.answered_at)}</td></tr>)}</tbody></table></TableWrap>
    </ChartCard>)}</div>)}
    <Sheet open={show} onOpenChange={setShow}><SheetContent className="overflow-y-auto p-4 sm:max-w-lg"><SheetHeader><SheetTitle>Tạo họp</SheetTitle></SheetHeader><form className="space-y-3" onSubmit={submit}><Field label="Tên họp"><Input required value={title} onChange={e => setTitle(e.target.value)} /></Field><Field label="Ngày"><Input type="date" required value={day} onChange={e => setDay(e.target.value)} /></Field><Field label="Giờ Việt Nam"><NativeSelect value={time} onChange={e => setTime(e.target.value)}>{hours(6, 22, 15).map(h => <option key={h}>{h}</option>)}</NativeSelect></Field><Field label="Địa điểm"><Input value={place} onChange={e => setPlace(e.target.value)} /></Field><Field label="Ghi chú"><Textarea value={note} onChange={e => setNote(e.target.value)} /></Field><div className="flex flex-wrap items-center gap-2"><h3 className="text-sm font-semibold">Mời leader</h3><button type="button" className="btn sm" onClick={() => setIds(leaders.map(c => c.id))}>Chọn tất cả</button><button type="button" className="btn sm" onClick={() => setIds([])}>Bỏ chọn</button></div>{leaders.map(c => <label key={c.id} className="flex items-center gap-2"><Checkbox checked={ids.includes(c.id)} onCheckedChange={checked => setIds(checked ? [...ids, c.id] : ids.filter(id => id !== c.id))} />{c.name} · {c.team_name}</label>)}<button className="btn primary" type="submit" disabled={busy || !ids.length}>Tạo họp và gửi Zalo</button></form></SheetContent></Sheet>
    <ConfirmWork title="Huỷ cuộc họp?" open={!!cancelId} onClose={() => setCancelId('')} busy={busy} onConfirm={() => void cancel()} />
  </section>;
}
