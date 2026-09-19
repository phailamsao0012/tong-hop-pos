'use client';

// Khách theo nhân viên: danh sách khách được phân công kèm ghi chú trao đổi (như mục Khách hàng của Pancake),
// lọc theo nhân viên, "N ngày chưa note", tìm tên/SĐT; bấm một khách để xem toàn bộ lịch sử ghi chú; xuất Excel.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, FileDown, MessageSquareText, RefreshCw, Search, UserX, Users, Wallet } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { POS } from '@/lib/report-model';
import { PosChips } from './overview-view';
import { useTeam } from './team-store';
import { Avatar, BackfillNotice, ChartCard, Definitions, EmptyState, ErrorBox, KpiCard, PageHeader, SortTh, StatusChip, dmy, dt, money, posColor, short, timeOnly, useSort, vi } from './ui-kit';

type Note = { id: string; author: string; message: string; createdAt: string };
type Row = { id: string; posId: string; posName: string; shopId: string | null; customerId: string; name: string; phone: string | null; assignedId: string | null; assignedName: string | null; level: string | null; orderCount: number; succeedOrders: number; purchased: number; lastOrderAt: string | null; insertedAt: string | null; tags: string[]; noteCount: number; lastNoteAt: string | null; daysSinceNote: number | null; notes: Note[] };
type Staff = { id: string; name: string; department: string | null; assigned: number; neverNoted: number; over7: number; over20: number; notedToday: number };
type Report = { page: number; size: number; total: number; backfill?: { posId: string; completed: boolean; page: number; done: number; total: number | null; percent: number | null }[]; summary: { total: number; neverNoted: number; over20: number; buyers: number; purchased: number; closedOrders: number | null; closedNet: number | null }; staff: Staff[]; rows: Row[]; definitions: Record<string, string> };
type Employee = { id: string; name: string; department: string | null };
type FullNote = Note & { orderId: string | null; source: string };
const PAGE_SIZE = 50;
const DAY_OPTIONS = ['0', '3', '7', '14', '20', '30', '60', '90'];
const SORT_LABELS: Record<string, string> = { note_old: 'Lâu chưa note nhất', note_new: 'Mới note nhất', purchased: 'Đã chi nhiều nhất', last_order: 'Mua gần nhất', name: 'Tên A→Z' };
const noteDay = (iso: string) => { const d = new Date(`${iso}Z`); const v = new Date(d.getTime() + 7 * 3600000).toISOString(); return `${v.slice(8, 10)}/${v.slice(5, 7)}`; };
// Nhân viên thường tự ghi ngày ở đầu ghi chú ("18/9: …"); khi đó không lặp lại ngày.
const startsWithDate = (m: string) => /^\s*\d{1,2}\s*[\/.-]\s*\d{1,2}/.test(m);

export function CareView() {
  const team = useTeam();
  const [posIds, setPosIds] = useState<string[]>(POS.map((p) => p.id));
  const [assigned, setAssigned] = useState('all');
  const [q, setQ] = useState('');
  const [query, setQuery] = useState('');
  const [minDays, setMinDays] = useState(0);
  const [sort, setSort] = useState('note_old');
  const [page, setPage] = useState(1);
  const [viewAll, setViewAll] = useState(false);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Row | null>(null);
  const [notes, setNotes] = useState<FullNote[] | null>(null);

  useEffect(() => { void fetch(`/api/employees?team=${team}`).then((r) => r.ok ? r.json() as Promise<Employee[]> : []).then(setEmployees).catch(() => undefined); }, [team]);
  useEffect(() => { setPage(1); }, [posIds, assigned, query, minDays, sort, team]);
  const params = useCallback((size: number, pg: number) => new URLSearchParams({ posIds: posIds.join(','), assigned, q: query, minDays: String(minDays), sort, size: String(size), page: String(pg), team }), [posIds, assigned, query, minDays, sort, team]);
  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const r = await fetch(`/api/reports/care?${params(viewAll ? 5000 : PAGE_SIZE, viewAll ? 1 : page)}`, { cache: 'no-store' });
      const body = await r.json() as Report & { error?: string };
      if (!r.ok) throw new Error(body.error ?? 'Không tải được danh sách.');
      setReport(body);
    } catch (e) { setError(e instanceof Error ? e.message : 'Không tải được danh sách.'); }
    finally { setLoading(false); }
  }, [params, page, viewAll]);
  useEffect(() => { void load(); }, [load]);

  const open = async (row: Row) => {
    setSelected(row); setNotes(null);
    try {
      const r = await fetch(`/api/reports/care/notes?${new URLSearchParams({ posId: row.posId, customerId: row.customerId })}`, { cache: 'no-store' });
      if (r.ok) setNotes(((await r.json()) as { notes: FullNote[] }).notes);
    } catch { setNotes([]); }
    if (window.innerWidth < 1280) setTimeout(() => document.getElementById('care-detail')?.scrollIntoView({ behavior: 'smooth' }), 50);
  };

  const exportExcel = async () => {
    setExporting(true);
    try {
      const r = await fetch(`/api/reports/care?${params(20000, 1)}`, { cache: 'no-store' });
      if (!r.ok) throw new Error('Không tải được dữ liệu để xuất.');
      const body = await r.json() as Report;
      const XLSX = await import('xlsx');
      const wb = XLSX.utils.book_new();
      const staffName = assigned === 'all' ? 'Tất cả nhân viên' : assigned === '__none' ? 'Chưa phân công' : employees.find((e) => e.id === assigned)?.name ?? assigned;
      const noteCell = (n?: Note) => n ? `${dt(n.createdAt, true)} · ${n.author}: ${n.message}` : '';
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
        [`Khách theo nhân viên · ${staffName}${minDays ? ` · từ ${minDays} ngày chưa note` : ''} · xuất ${dt(new Date().toISOString().slice(0, 19), true)}`],
        [`${vi.format(body.total)} khách${body.total > 20000 ? ' (chỉ xuất 20.000 dòng đầu theo thứ tự đang chọn)' : ''}`], [],
        ['Tên khách hàng', 'SĐT', 'POS', 'Phân công cho', 'Lần note cuối', 'Số ngày chưa note', 'Số ghi chú', 'Ghi chú mới nhất', 'Ghi chú trước đó', 'Ghi chú trước nữa', 'Thẻ khách hàng', 'Đã nhận (đơn)', 'Số tiền đã chi', 'Lần mua cuối', 'Tổng đơn', 'Tạo hồ sơ'],
        ...body.rows.map((r) => [r.name, r.phone ?? '', r.posName, r.assignedName ?? '', r.lastNoteAt ? dt(r.lastNoteAt, true) : 'Chưa note', r.daysSinceNote ?? 'Chưa note', r.noteCount, noteCell(r.notes[0]), noteCell(r.notes[1]), noteCell(r.notes[2]), r.tags.join(', '), r.succeedOrders, r.purchased, r.lastOrderAt ? dt(r.lastOrderAt, true) : '', r.orderCount, r.insertedAt ? dt(r.insertedAt) : '']),
      ]), 'Khách hàng');
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['Nhân viên', 'Bộ phận', 'Data đang cầm', 'Note hôm nay', 'Chưa note lần nào', 'Quá 7 ngày', 'Quá 20 ngày'], ...body.staff.map((s) => [s.name, s.department ?? '', s.assigned, s.notedToday, s.neverNoted, s.over7, s.over20])]), 'Theo nhân viên');
      XLSX.writeFile(wb, `khach-theo-nv_${staffName.replace(/\s+/g, '-')}${minDays ? `_${minDays}ngay` : ''}.xlsx`);
    } catch (e) { setError(e instanceof Error ? e.message : 'Không xuất được Excel.'); }
    finally { setExporting(false); }
  };

  const pages = report ? Math.max(1, Math.ceil(report.total / PAGE_SIZE)) : 1;
  const staffSort = useSort<'assigned' | 'notedToday' | 'neverNoted' | 'over7' | 'over20' | 'ok' | 'name'>('over20');
  const staffRows = useMemo(() => staffSort.apply(report?.staff ?? [], (s, k) => k === 'name' ? s.name : k === 'ok' ? Math.max(0, s.assigned - s.neverNoted - s.over20) : s[k]), [report, staffSort.key, staffSort.desc]); // eslint-disable-line react-hooks/exhaustive-deps
  const assignedLabel = assigned === 'all' ? 'Tất cả nhân viên' : assigned === '__none' ? 'Chưa phân công' : employees.find((e) => e.id === assigned)?.name ?? report?.staff.find((s) => s.id === assigned)?.name ?? 'Nhân viên';
  const staffOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const e of employees) map.set(e.id, e.name);
    for (const s of report?.staff ?? []) if (!map.has(s.id)) map.set(s.id, s.name);
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1], 'vi'));
  }, [employees, report]);

  return (
    <div className="space-y-5">
      <PageHeader eyebrow="CSKH" title="Khách theo nhân viên" subtitle="Khách được phân công và ghi chú trao đổi, như mục Khách hàng Pancake"
        actions={<Button variant="outline" onClick={() => void exportExcel()} disabled={!report || exporting}><FileDown size={14} />{exporting ? 'Đang xuất…' : 'Xuất Excel danh sách'}</Button>} />
      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-[#e3e8e4] bg-white px-3 py-2.5">
        <span className="px-1 text-sm font-semibold text-[#62796d]">Phân công</span>
        <Select value={assigned} items={{ all: 'Tất cả nhân viên', ...Object.fromEntries(staffOptions), __none: 'Chưa phân công' }} onValueChange={(v) => setAssigned(String(v))}>
          <SelectTrigger className="min-w-44"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="all">Tất cả nhân viên</SelectItem>{staffOptions.map(([id, name]) => <SelectItem key={id} value={id}>{name}</SelectItem>)}<SelectItem value="__none">Chưa phân công</SelectItem></SelectContent>
        </Select>
        <span className="px-1 text-sm font-semibold text-[#62796d]">Chưa note từ</span>
        <Select value={DAY_OPTIONS.includes(String(minDays)) ? String(minDays) : 'custom'} items={{ ...Object.fromEntries(DAY_OPTIONS.map((d) => [d, d === '0' ? 'Tất cả' : `${d} ngày`])), custom: `${minDays} ngày` }} onValueChange={(v) => { if (v !== 'custom') setMinDays(Number(v)); }}>
          <SelectTrigger className="min-w-28"><SelectValue /></SelectTrigger>
          <SelectContent>{DAY_OPTIONS.map((d) => <SelectItem key={d} value={d}>{d === '0' ? 'Tất cả' : `${d} ngày`}</SelectItem>)}</SelectContent>
        </Select>
        <Input type="number" min={0} className="w-20" placeholder="khác…" value={minDays || ''} onChange={(e) => setMinDays(Math.max(0, Number(e.target.value) || 0))} />
        <span className="px-1 text-sm font-semibold text-[#62796d]">Sắp xếp</span>
        <Select value={sort} items={SORT_LABELS} onValueChange={(v) => setSort(String(v))}>
          <SelectTrigger className="min-w-40"><SelectValue /></SelectTrigger>
          <SelectContent>{Object.entries(SORT_LABELS).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}</SelectContent>
        </Select>
        <form className="relative min-w-52 flex-1" onSubmit={(e) => { e.preventDefault(); setQuery(q.trim()); }}>
          <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[#7d9184]" />
          <Input className="pl-8" placeholder="Tìm tên hoặc SĐT, Enter để tìm" value={q} onChange={(e) => setQ(e.target.value)} />
        </form>
        <Button variant="ghost" size="sm" onClick={() => void load()} disabled={loading}><RefreshCw size={14} className={loading ? 'animate-spin' : ''} />Tải lại</Button>
      </div>
      <PosChips posIds={posIds} onChange={setPosIds} />
      {error && <ErrorBox error={error} onRetry={() => void load()} />}
      {!report && !error && <p className="text-sm text-[#7d9184]">Đang tải…</p>}
      {report && (
        <>
          <BackfillNotice backfill={report.backfill} />
          <div className="grid grid-cols-2 gap-2.5 sm:gap-4 xl:grid-cols-5">
            <KpiCard icon={Users} tone="green" label="Khách theo bộ lọc" value={vi.format(report.summary.total)} note={assignedLabel} />
            <KpiCard icon={UserX} tone="red" label="Chưa note lần nào" value={vi.format(report.summary.neverNoted)} note={report.summary.total ? `${Math.round(report.summary.neverNoted / report.summary.total * 100)}% khách` : '—'} onClick={() => setSort('note_old')} />
            <KpiCard icon={MessageSquareText} tone="orange" label="Quá 20 ngày chưa note" value={vi.format(report.summary.over20)} note="Đã note, nay quá hạn" onClick={() => setMinDays(20)} active={minDays === 20} />
            <KpiCard icon={Wallet} tone="teal" label="Khách đã mua" value={vi.format(report.summary.buyers)} note={report.summary.total ? `${Math.round(report.summary.buyers / report.summary.total * 100)}% khách` : '—'} />
            <KpiCard icon={Wallet} tone="blue" label="Doanh thu đơn chốt" value={report.summary.closedNet === null ? '—' : `${short(report.summary.closedNet)} ₫`} note={report.summary.closedNet === null ? 'Bộ lọc quá rộng để tính' : `${vi.format(report.summary.closedOrders ?? 0)} đơn chốt · sau giảm giá · doanh số ${short(report.summary.purchased)} ₫ theo hồ sơ`} />
          </div>
          {staffRows.length > 0 && (
            <ChartCard icon={Users} title={`Theo nhân viên · ${staffRows.length} người`} subtitle="Bấm một dòng để lọc danh sách theo nhân viên đó">
              <div className="max-h-72 overflow-auto">
                <table className="w-full text-sm [&_td]:px-2 [&_th]:px-2">
                  <thead className="sticky top-0 bg-white text-left text-xs text-[#7d9184]"><tr><SortTh k="name" label="Nhân viên" sort={staffSort} align="left" className="py-2" /><th>Bộ phận</th><SortTh k="assigned" label="Data đang cầm" sort={staffSort} /><SortTh k="notedToday" label="Note hôm nay" sort={staffSort} /><SortTh k="neverNoted" label="Chưa note lần nào" sort={staffSort} /><SortTh k="over7" label="Quá 7 ngày" sort={staffSort} /><SortTh k="over20" label="Quá 20 ngày" sort={staffSort} /><SortTh k="ok" label="Còn trong hạn" sort={staffSort} /></tr></thead>
                  <tbody>
                    {staffRows.map((s) => (
                      <tr key={s.id} className={`cursor-pointer border-t hover:bg-[#f5faf5] ${assigned === s.id ? 'bg-[#eef7f1]' : ''}`} onClick={() => setAssigned(assigned === s.id ? 'all' : s.id)}>
                        <td className="whitespace-nowrap py-2 font-medium">{s.name}</td>
                        <td className="whitespace-nowrap text-xs text-[#7d9184]">{s.department ?? '—'}</td>
                        <td className="text-right">{vi.format(s.assigned)}</td>
                        <td className="text-right">{vi.format(s.notedToday)}</td>
                        <td className={`text-right ${s.neverNoted ? 'text-[#c8403f]' : ''}`}>{vi.format(s.neverNoted)}</td>
                        <td className="text-right">{vi.format(s.over7)}</td>
                        <td className={`text-right font-semibold ${s.over20 ? 'text-[#c8403f]' : ''}`}>{vi.format(s.over20)}</td>
                        <td className="text-right text-[#17684b]">{vi.format(Math.max(0, s.assigned - s.neverNoted - s.over20))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </ChartCard>
          )}
          <div className={`grid gap-4 ${selected ? 'xl:grid-cols-[minmax(0,1fr)_minmax(0,24rem)]' : ''}`}>
            <ChartCard icon={MessageSquareText} title={`Danh sách khách · ${vi.format(report.total)}`} subtitle={`${assignedLabel}${minDays ? ` · từ ${minDays} ngày chưa note` : ''}${query ? ` · "${query}"` : ''} · bấm một dòng để xem toàn bộ ghi chú`}
              action={<span className="text-xs text-[#7d9184]">{viewAll ? 'Toàn bộ' : `Trang ${report.page}/${pages}`}</span>}>
              {report.rows.length ? (
                <div className="max-h-[42rem] overflow-auto">
                  <table className="w-full text-sm [&_td]:px-2 [&_th]:px-2">
                    <thead className="sticky top-0 z-10 bg-white text-left text-xs text-[#7d9184]"><tr><th className="py-2">Tên khách hàng</th><th>SĐT</th><th>Phân công cho</th><th className="min-w-56">Ghi chú trao đổi</th><th>Thẻ khách hàng</th><th className="text-right">Đã nhận</th><th className="text-right">Đã chi</th><th className="text-right">Lần mua cuối</th><th className="text-right">Chưa note</th></tr></thead>
                    <tbody>
                      {report.rows.map((r) => (
                        <tr key={r.id} className={`cursor-pointer border-t align-top hover:bg-[#f5faf5] ${selected?.id === r.id ? 'bg-[#eef7f1]' : ''}`} onClick={() => void open(r)}>
                          <td className="whitespace-nowrap py-2"><div className="flex items-center gap-2"><Avatar name={r.name || r.phone || '?'} size="sm" /><div className="min-w-0"><div className="max-w-[13rem] truncate font-medium" title={r.name}>{r.name || <span className="text-[#7d9184]">Không tên</span>}</div><div className="text-[11px]" style={{ color: posColor(r.posId) }}>{r.posName}</div></div></div></td>
                          <td className="whitespace-nowrap py-2 tabular-nums">{r.phone ?? '—'}</td>
                          <td className="whitespace-nowrap py-2">{r.assignedName ?? <span className="text-[#7d9184]">Chưa phân công</span>}</td>
                          <td className="py-2">
                            {r.notes.length ? (
                              <div className="space-y-1">
                                {r.notes.slice(0, 2).map((n) => (
                                  <div key={n.id} className="flex items-start gap-1.5 text-xs" title={`${n.author} · ${dt(n.createdAt, true)}\n${n.message}`}>
                                    <Avatar name={n.author || '?'} size="sm" />
                                    <span className="line-clamp-2">{!startsWithDate(n.message) && <span className="font-semibold text-[#17684b]">{noteDay(n.createdAt)}: </span>}{n.message}</span>
                                  </div>
                                ))}
                                {r.noteCount > 2 && <div className="pl-8 text-[11px] text-[#7d9184]">… {vi.format(r.noteCount)} ghi chú, bấm để xem hết</div>}
                              </div>
                            ) : <StatusChip tone="red">Chưa note</StatusChip>}
                          </td>
                          <td className="py-2"><div className="flex max-w-32 flex-wrap gap-1">{r.tags.slice(0, 3).map((t) => <span key={t} className="rounded-md border border-[#e3e8e4] bg-[#f6f8f6] px-1.5 py-0.5 text-[10px] uppercase text-[#4c5f55]" title={t}>{t.length > 22 ? `${t.slice(0, 22)}…` : t}</span>)}{r.tags.length > 3 && <span className="text-[10px] text-[#7d9184]">+{r.tags.length - 3}</span>}</div></td>
                          <td className="whitespace-nowrap py-2 text-right">{vi.format(r.succeedOrders)}</td>
                          <td className="whitespace-nowrap py-2 text-right">{r.purchased ? money(r.purchased) : '—'}</td>
                          <td className="whitespace-nowrap py-2 text-right text-xs">{r.lastOrderAt ? `${timeOnly(r.lastOrderAt)} ${dmy(r.lastOrderAt)}` : '—'}</td>
                          <td className={`whitespace-nowrap py-2 text-right font-semibold ${r.daysSinceNote === null || r.daysSinceNote >= 20 ? 'text-[#c8403f]' : r.daysSinceNote >= 7 ? 'text-[#b4690e]' : 'text-[#17684b]'}`}>{r.daysSinceNote === null ? 'Chưa note' : r.daysSinceNote === 0 ? 'Hôm nay' : `${r.daysSinceNote} ngày`}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : <EmptyState text="Không có khách nào khớp bộ lọc." />}
              <div className="mt-3 flex items-center justify-between text-xs text-[#7d9184]">
                <span>{viewAll ? `Hiển thị ${vi.format(report.rows.length)} / ${vi.format(report.total)}${report.total > 5000 ? ' (tối đa 5.000 một lượt, xuất Excel để lấy đủ)' : ''}` : `Hiển thị ${vi.format((report.page - 1) * PAGE_SIZE + 1)}–${vi.format(Math.min(report.total, report.page * PAGE_SIZE))} / ${vi.format(report.total)}`}</span>
                <div className="flex gap-1">
                  {!viewAll && <><Button size="sm" variant="outline" disabled={page <= 1 || loading} onClick={() => setPage((p) => p - 1)}><ChevronLeft size={14} />Trước</Button>
                  <Button size="sm" variant="outline" disabled={page >= pages || loading} onClick={() => setPage((p) => p + 1)}>Sau<ChevronRight size={14} /></Button></>}
                  <Button size="sm" variant={viewAll ? 'default' : 'outline'} onClick={() => { setViewAll(!viewAll); setPage(1); }}>{viewAll ? 'Theo trang' : 'Xem toàn bộ'}</Button>
                </div>
              </div>
            </ChartCard>
            {selected && (
              <div id="care-detail" className="scroll-mt-16">
                <ChartCard icon={MessageSquareText} title={selected.name || selected.phone || 'Khách hàng'} subtitle={`${selected.posName} · ${selected.phone ?? 'không có SĐT'} · ${selected.assignedName ? `phân công: ${selected.assignedName}` : 'chưa phân công'}`}
                  action={<Button size="sm" variant="ghost" onClick={() => { setSelected(null); setNotes(null); }}>Đóng</Button>}>
                  <div className="mb-3 grid grid-cols-2 gap-2 text-xs">
                    <div className="rounded-xl border px-3 py-2"><div className="text-[#7d9184]">Đã nhận · đã chi</div><div className="font-semibold">{vi.format(selected.succeedOrders)} đơn · {money(selected.purchased)}</div></div>
                    <div className="rounded-xl border px-3 py-2"><div className="text-[#7d9184]">Lần mua cuối</div><div className="font-semibold">{selected.lastOrderAt ? dt(selected.lastOrderAt, true) : '—'}</div></div>
                    <div className="rounded-xl border px-3 py-2"><div className="text-[#7d9184]">Lần note cuối</div><div className="font-semibold">{selected.lastNoteAt ? dt(selected.lastNoteAt, true) : 'Chưa note'}</div></div>
                    <div className="rounded-xl border px-3 py-2"><div className="text-[#7d9184]">Thẻ</div><div className="font-semibold">{selected.tags.join(', ') || '—'}</div></div>
                  </div>
                  {selected.shopId && <a className="mb-3 inline-block text-xs text-[#2a78d6] underline" href={`https://pos.pancake.vn/shop/${selected.shopId}/customer?search=${encodeURIComponent(selected.phone ?? selected.name)}`} target="_blank" rel="noreferrer">Mở trên Pancake</a>}
                  {notes === null && <p className="text-sm text-[#7d9184]">Đang tải ghi chú…</p>}
                  {notes && !notes.length && <EmptyState text="Khách này chưa có ghi chú nào." />}
                  {notes && notes.length > 0 && (
                    <ol className="max-h-[32rem] space-y-3 overflow-auto pr-1">
                      {notes.map((n) => (
                        <li key={n.id} className="flex gap-2">
                          <Avatar name={n.author || '?'} size="sm" />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-baseline justify-between gap-2 text-xs"><span className="font-semibold">{n.author || 'Không rõ'}</span><span className="whitespace-nowrap text-[#7d9184]">{timeOnly(n.createdAt)} {dt(n.createdAt)}</span></div>
                            <div className="whitespace-pre-wrap text-sm">{n.message}</div>
                            {n.orderId && <div className="text-[11px] text-[#7d9184]">Gắn với đơn #{n.orderId}</div>}
                          </div>
                        </li>
                      ))}
                    </ol>
                  )}
                </ChartCard>
              </div>
            )}
          </div>
          <Definitions items={report.definitions} />
        </>
      )}
    </div>
  );
}
