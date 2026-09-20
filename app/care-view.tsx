'use client';

// Khách theo nhân viên: danh sách khách được phân công kèm ghi chú trao đổi (như mục Khách hàng của Pancake),
// lọc theo nhân viên, "N ngày chưa note", tìm tên/SĐT (chờ 300 ms hoặc Enter); bấm một khách để xem toàn bộ lịch sử ghi chú; xuất Excel.
// Giao diện v2: bảng .tbl có sắp xếp ở tiêu đề (đồng bộ với ô "Sắp xếp"), dòng bấm được bằng bàn phím, xương khi tải,
// panel ghi chú có trạng thái lỗi + thử lại, huỷ request cũ khi đổi khách / đổi bộ lọc.
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { ChevronLeft, ChevronRight, ExternalLink, FileDown, MessageSquareText, RefreshCw, Search, UserX, Users, Wallet } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { POS } from '@/lib/report-model';
import { PosChips } from './overview-view';
import { useTeam } from './team-store';
import {
  Avatar, BackfillNotice, ChartCard, Definitions, EmptyState, ErrorBox, HoverReveal, KpiCard, PageHeader, SkeletonKpis, SkeletonTable, SortTh, StatusChip, TableWrap, Toolbar,
  dmy, dt, money, pct, posVar, scrollToEl, short, shortMoney, timeOnly, toast, useSort, vi, type SortState,
} from './ui-kit';

type Note = { id: string; author: string; message: string; createdAt: string };
type Row = { id: string; posId: string; posName: string; shopId: string | null; customerId: string; name: string; phone: string | null; assignedId: string | null; assignedName: string | null; level: string | null; orderCount: number; succeedOrders: number; purchased: number; lastOrderAt: string | null; insertedAt: string | null; tags: string[]; noteCount: number; lastNoteAt: string | null; daysSinceNote: number | null; notes: Note[] };
type Staff = { id: string; name: string; department: string | null; assigned: number; neverNoted: number; over7: number; over20: number; notedToday: number };
type Report = { page: number; size: number; total: number; backfill?: { posId: string; completed: boolean; page: number; done: number; total: number | null; percent: number | null }[]; summary: { total: number; neverNoted: number; over20: number; buyers: number; purchased: number; closedOrders: number | null; closedNet: number | null }; staff: Staff[]; rows: Row[]; definitions: Record<string, string> };
type Employee = { id: string; name: string; department: string | null };
type FullNote = Note & { orderId: string | null; source: string };
const PAGE_SIZE = 50;
const DAY_OPTIONS = ['0', '3', '7', '14', '20', '30', '60', '90'];
const SORT_LABELS: Record<string, string> = { note_old: 'Lâu chưa note nhất', note_new: 'Mới note nhất', purchased: 'Đã chi nhiều nhất', last_order: 'Mua gần nhất', name: 'Tên A→Z' };
// Cột sắp xếp trên bảng ↔ tham số sort của API (cùng một trạng thái với ô "Sắp xếp").
const SORT_COLS: Record<string, { key: string; desc: boolean }> = { note_old: { key: 'note', desc: true }, note_new: { key: 'note', desc: false }, purchased: { key: 'purchased', desc: true }, last_order: { key: 'last_order', desc: true }, name: { key: 'name', desc: false } };
const noteDay = (iso: string) => { const d = new Date(`${iso}Z`); const v = new Date(d.getTime() + 7 * 3600000).toISOString(); return `${v.slice(8, 10)}/${v.slice(5, 7)}`; };
// Nhân viên thường tự ghi ngày ở đầu ghi chú ("18/9: …"); khi đó không lặp lại ngày.
const startsWithDate = (m: string) => /^\s*\d{1,2}\s*[/.-]\s*\d{1,2}/.test(m);
/** Tooltip KPI dạng "nhãn · giá trị" cho số liệu chụp tại thời điểm đồng bộ (không theo kỳ nên không dùng nhãn "Kỳ này"). */
const tip = (title: string, rows: [string, string][], how?: string) => (
  <><b>{title}</b>{rows.map(([l, v]) => <span key={l} className="r"><span>{l}</span><span className="num">{v}</span></span>)}{how ? <span className="how block">Cách tính: {how}</span> : null}</>
);
/** Dòng bảng bấm được: Tab tới được, Enter / Space mở; phím bấm trên nút con bên trong không kích hoạt dòng. */
const rowKeys = (fn: () => void) => (e: KeyboardEvent<HTMLElement>) => {
  if (e.target !== e.currentTarget) return;
  if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fn(); }
};

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
  const [notesState, setNotesState] = useState<'idle' | 'loading' | 'error'>('idle');
  const [notesError, setNotesError] = useState<string | null>(null);
  const ctrl = useRef<AbortController | null>(null);
  const noteCtrl = useRef<AbortController | null>(null);

  useEffect(() => { void fetch(`/api/employees?team=${team}`).then((r) => r.ok ? r.json() as Promise<Employee[]> : []).then(setEmployees).catch(() => undefined); }, [team]);
  // Ô tìm: chờ 300 ms sau phím cuối rồi mới tìm (Enter tìm ngay).
  useEffect(() => { const t = window.setTimeout(() => setQuery(q.trim()), 300); return () => clearTimeout(t); }, [q]);
  useEffect(() => { setPage(1); }, [posIds, assigned, query, minDays, sort, team]);
  const params = useCallback((size: number, pg: number) => new URLSearchParams({ posIds: posIds.join(','), assigned, q: query, minDays: String(minDays), sort, size: String(size), page: String(pg), team }), [posIds, assigned, query, minDays, sort, team]);
  // Mỗi lần tải huỷ request trước đó: đổi bộ lọc / gõ tìm liên tiếp thì chỉ kết quả mới nhất được hiện.
  const load = useCallback(async () => {
    ctrl.current?.abort();
    const ac = new AbortController(); ctrl.current = ac;
    setLoading(true); setError(null);
    try {
      const r = await fetch(`/api/reports/care?${params(viewAll ? 5000 : PAGE_SIZE, viewAll ? 1 : page)}`, { cache: 'no-store', signal: ac.signal });
      const body = await r.json() as Report & { error?: string };
      if (!r.ok) throw new Error(body.error ?? 'Không tải được danh sách.');
      if (ac.signal.aborted) return false;
      setReport(body);
      return true;
    } catch (e) {
      if (ac.signal.aborted) return false;
      setError(e instanceof Error ? e.message : 'Không tải được danh sách.');
      return false;
    } finally { if (!ac.signal.aborted) setLoading(false); }
  }, [params, page, viewAll]);
  useEffect(() => { void load(); return () => ctrl.current?.abort(); }, [load]);
  const reload = async () => { if (await load()) toast('Đã cập nhật danh sách khách'); };

  // Mở panel ghi chú: xoá nội dung cũ ngay, huỷ request của khách trước, lỗi thì hiện hộp "Thử lại".
  const open = async (row: Row, scroll = true) => {
    noteCtrl.current?.abort();
    const ac = new AbortController(); noteCtrl.current = ac;
    setSelected(row); setNotes(null); setNotesError(null); setNotesState('loading');
    if (scroll && window.innerWidth < 1280) setTimeout(() => scrollToEl(document.getElementById('care-detail')), 50);
    try {
      const r = await fetch(`/api/reports/care/notes?${new URLSearchParams({ posId: row.posId, customerId: row.customerId })}`, { cache: 'no-store', signal: ac.signal });
      const body = await r.json().catch(() => ({})) as { notes?: FullNote[]; error?: string };
      if (ac.signal.aborted) return;
      if (!r.ok) throw new Error(body.error ?? `Máy chủ trả lỗi ${r.status}.`);
      setNotes(body.notes ?? []); setNotesState('idle');
    } catch (e) {
      if (ac.signal.aborted) return;
      setNotesError(e instanceof Error ? e.message : 'Không tải được ghi chú.'); setNotesState('error');
    }
  };
  const close = () => { noteCtrl.current?.abort(); setSelected(null); setNotes(null); setNotesState('idle'); setNotesError(null); };
  useEffect(() => () => noteCtrl.current?.abort(), []);

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
  const listSort: SortState = {
    key: SORT_COLS[sort]?.key ?? '', desc: SORT_COLS[sort]?.desc,
    toggle: (k: string) => setSort(k === 'note' ? (sort === 'note_old' ? 'note_new' : 'note_old') : k),
    mark: () => '',
  };
  const assignedLabel = assigned === 'all' ? 'Tất cả nhân viên' : assigned === '__none' ? 'Chưa phân công' : employees.find((e) => e.id === assigned)?.name ?? report?.staff.find((s) => s.id === assigned)?.name ?? 'Nhân viên';
  const staffOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const e of employees) map.set(e.id, e.name);
    for (const s of report?.staff ?? []) if (!map.has(s.id)) map.set(s.id, s.name);
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1], 'vi'));
  }, [employees, report]);
  const searching = loading && q.trim() !== '' && q.trim() === query;

  return (
    <div className="space-y-5">
      <PageHeader eyebrow="CSKH" title="Khách theo nhân viên" subtitle="Khách được phân công và ghi chú trao đổi, như mục Khách hàng Pancake"
        actions={<Button variant="outline" onClick={() => void exportExcel()} disabled={!report || exporting}><FileDown size={14} />{exporting ? 'Đang xuất…' : 'Xuất Excel danh sách'}</Button>} />
      <Toolbar>
        <span className="px-1 text-sm font-semibold text-ink-2">Phân công</span>
        <Select value={assigned} items={{ all: 'Tất cả nhân viên', ...Object.fromEntries(staffOptions), __none: 'Chưa phân công' }} onValueChange={(v) => setAssigned(String(v))}>
          <SelectTrigger className="min-w-44" aria-label="Nhân viên phân công"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="all">Tất cả nhân viên</SelectItem>{staffOptions.map(([id, name]) => <SelectItem key={id} value={id}>{name}</SelectItem>)}<SelectItem value="__none">Chưa phân công</SelectItem></SelectContent>
        </Select>
        <span className="px-1 text-sm font-semibold text-ink-2">Chưa note từ</span>
        <Select value={DAY_OPTIONS.includes(String(minDays)) ? String(minDays) : 'custom'} items={{ ...Object.fromEntries(DAY_OPTIONS.map((d) => [d, d === '0' ? 'Tất cả' : `${d} ngày`])), custom: `${minDays} ngày` }} onValueChange={(v) => { if (v !== 'custom') setMinDays(Number(v)); }}>
          <SelectTrigger className="min-w-28" aria-label="Số ngày chưa note"><SelectValue /></SelectTrigger>
          <SelectContent>{DAY_OPTIONS.map((d) => <SelectItem key={d} value={d}>{d === '0' ? 'Tất cả' : `${d} ngày`}</SelectItem>)}</SelectContent>
        </Select>
        <Input type="number" min={0} className="w-24" placeholder="Số ngày" aria-label="Số ngày khác" value={minDays || ''} onChange={(e) => setMinDays(Math.max(0, Number(e.target.value) || 0))} />
        <span className="px-1 text-sm font-semibold text-ink-2">Sắp xếp</span>
        <Select value={sort} items={SORT_LABELS} onValueChange={(v) => setSort(String(v))}>
          <SelectTrigger className="min-w-40" aria-label="Sắp xếp"><SelectValue /></SelectTrigger>
          <SelectContent>{Object.entries(SORT_LABELS).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}</SelectContent>
        </Select>
        <form className="relative min-w-52 flex-1" onSubmit={(e) => { e.preventDefault(); setQuery(q.trim()); }}>
          <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-3" aria-hidden="true" />
          <Input className="pl-8 pr-20" placeholder="Tìm tên hoặc SĐT" aria-label="Tìm tên hoặc SĐT" value={q} onChange={(e) => setQ(e.target.value)} />
          {searching && <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[11px] text-ink-3">Đang tìm…</span>}
        </form>
        <Button variant="ghost" size="sm" onClick={() => void reload()} disabled={loading}><RefreshCw size={14} className={loading ? 'animate-spin motion-reduce:animate-none' : ''} />Tải lại</Button>
      </Toolbar>
      <PosChips posIds={posIds} onChange={setPosIds} />
      {error && <ErrorBox error={error} onRetry={() => void load()} />}
      {!report && !error && (
        <>
          <SkeletonKpis count={5} className="xl:grid-cols-5" />
          <ChartCard icon={MessageSquareText} title="Danh sách khách" subtitle="Đang tải…"><SkeletonTable rows={8} cols={7} /></ChartCard>
        </>
      )}
      {report && (
        <>
          <BackfillNotice backfill={report.backfill} />
          <div className={`grid grid-cols-2 gap-3 transition-opacity duration-[var(--dur)] sm:gap-4 xl:grid-cols-5 ${loading ? 'opacity-70' : ''}`} aria-busy={loading}>
            <KpiCard icon={Users} tone="green" label="Khách theo bộ lọc" value={vi.format(report.summary.total)} countUp rawValue={report.summary.total} note={assignedLabel}
              tooltip={tip('Khách theo bộ lọc', [['Số khách', `${vi.format(report.summary.total)} khách`], ['Phân công', assignedLabel]], 'Số khách được phân công khớp bộ lọc hiện tại (nhân viên, ngày chưa note, POS, từ khoá).')} />
            <KpiCard icon={UserX} tone="red" label="Chưa note lần nào" value={vi.format(report.summary.neverNoted)} countUp rawValue={report.summary.neverNoted} note={report.summary.total ? `${Math.round(report.summary.neverNoted / report.summary.total * 100)}% khách` : '—'} onClick={() => setSort('note_old')}
              tooltip={tip('Chưa note lần nào', [['Số khách', `${vi.format(report.summary.neverNoted)} khách`], ['Tỷ lệ', pct(report.summary.total ? report.summary.neverNoted / report.summary.total * 100 : null)]], `${report.definitions.days} Bấm để xếp khách lâu chưa note lên đầu.`)} />
            <KpiCard icon={MessageSquareText} tone="orange" label="Quá 20 ngày chưa note" value={vi.format(report.summary.over20)} countUp rawValue={report.summary.over20} note="Đã note, nay quá hạn" onClick={() => setMinDays(minDays === 20 ? 0 : 20)} active={minDays === 20}
              tooltip={tip('Quá 20 ngày chưa note', [['Số khách', `${vi.format(report.summary.over20)} khách`], ['Tỷ lệ', pct(report.summary.total ? report.summary.over20 / report.summary.total * 100 : null)]], 'Khách đã có ghi chú nhưng ghi chú mới nhất cách đây hơn 20 ngày. Bấm để lọc.')} />
            <KpiCard icon={Wallet} tone="teal" label="Khách đã mua" value={vi.format(report.summary.buyers)} countUp rawValue={report.summary.buyers} note={report.summary.total ? `${Math.round(report.summary.buyers / report.summary.total * 100)}% khách` : '—'}
              tooltip={tip('Khách đã mua', [['Số khách', `${vi.format(report.summary.buyers)} khách`], ['Doanh số theo hồ sơ', money(report.summary.purchased)]], report.definitions.source)} />
            <KpiCard icon={Wallet} tone="blue" label="Doanh thu đơn chốt" value={report.summary.closedNet === null ? '—' : shortMoney(report.summary.closedNet)} note={report.summary.closedNet === null ? 'Bộ lọc quá rộng để tính' : `${vi.format(report.summary.closedOrders ?? 0)} đơn chốt · sau giảm giá · doanh số ${shortMoney(report.summary.purchased)} theo hồ sơ`}
              tooltip={tip('Doanh thu đơn chốt', [['Đơn chốt', report.summary.closedNet === null ? '—' : money(report.summary.closedNet)], ['Số đơn', vi.format(report.summary.closedOrders ?? 0)], ['Doanh số theo hồ sơ', money(report.summary.purchased)]], 'Tổng tiền đơn chốt (sau giảm giá và quà) của các khách trong bộ lọc, theo định nghĩa "Phân công cho NV" của Pancake. Doanh số theo hồ sơ = số tiền đã chi Pancake ghi trên hồ sơ khách.')} />
          </div>
          {staffRows.length > 0 && (
            <ChartCard icon={Users} title={`Theo nhân viên · ${staffRows.length} người`} subtitle="Bấm một dòng để lọc danh sách theo nhân viên đó · bấm tiêu đề cột để sắp xếp">
              <TableWrap maxHeight="18rem" minWidth={720} stickyFirst>
                <table className="tbl">
                  <thead><tr><SortTh k="name" label="Nhân viên" sort={staffSort} align="left" /><th>Bộ phận</th><SortTh k="assigned" label="Data đang cầm" sort={staffSort} /><SortTh k="notedToday" label="Note hôm nay" sort={staffSort} /><SortTh k="neverNoted" label="Chưa note lần nào" sort={staffSort} /><SortTh k="over7" label="Quá 7 ngày" sort={staffSort} /><SortTh k="over20" label="Quá 20 ngày" sort={staffSort} /><SortTh k="ok" label="Còn trong hạn" sort={staffSort} /></tr></thead>
                  <tbody>
                    {staffRows.map((s) => {
                      const on = assigned === s.id; const pick = () => setAssigned(on ? 'all' : s.id);
                      return (
                        <tr key={s.id} tabIndex={0} aria-selected={on} onClick={pick} onKeyDown={rowKeys(pick)} className={`cursor-pointer focus-visible:-outline-offset-2 ${on ? '[&>td]:bg-tint-2' : ''}`}>
                          <td className="font-medium text-ink"><span className="inline-flex items-center gap-2">{s.name}<HoverReveal><span className="btn sm">{on ? 'Bỏ lọc' : 'Lọc'}<ChevronRight size={12} /></span></HoverReveal></span></td>
                          <td className="mut text-xs">{s.department ?? '—'}</td>
                          <td className="n">{vi.format(s.assigned)}</td>
                          <td className="n">{vi.format(s.notedToday)}</td>
                          <td className={`n ${s.neverNoted ? 'text-bad' : ''}`}>{vi.format(s.neverNoted)}</td>
                          <td className="n">{vi.format(s.over7)}</td>
                          <td className={`n ${s.over20 ? 'text-bad' : ''}`}>{vi.format(s.over20)}</td>
                          <td className="n text-primary">{vi.format(Math.max(0, s.assigned - s.neverNoted - s.over20))}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </TableWrap>
            </ChartCard>
          )}
          <div className={`grid gap-4 ${selected ? 'xl:grid-cols-[minmax(0,1fr)_minmax(0,24rem)]' : ''}`}>
            <ChartCard icon={MessageSquareText} title={`Danh sách khách · ${vi.format(report.total)}`} subtitle={`${assignedLabel}${minDays ? ` · từ ${minDays} ngày chưa note` : ''}${query ? ` · "${query}"` : ''} · bấm một dòng để xem toàn bộ ghi chú`}
              action={<span className="num text-xs text-ink-3">{viewAll ? 'Toàn bộ' : `Trang ${report.page}/${pages}`}</span>} bodyClassName={loading ? 'opacity-70 transition-opacity duration-[var(--dur)]' : 'transition-opacity duration-[var(--dur)]'}>
              {report.rows.length ? (
                <TableWrap maxHeight="42rem" minWidth={980} stickyFirst>
                  <table className="tbl">
                    <thead><tr><SortTh k="name" label="Tên khách hàng" sort={listSort} align="left" /><th>SĐT</th><th>Phân công cho</th><th className="min-w-56">Ghi chú trao đổi</th><th>Thẻ khách hàng</th><th className="n">Đã nhận</th><SortTh k="purchased" label="Đã chi" sort={listSort} /><SortTh k="last_order" label="Lần mua cuối" sort={listSort} /><SortTh k="note" label="Chưa note" sort={listSort} /></tr></thead>
                    <tbody>
                      {report.rows.map((r) => {
                        const on = selected?.id === r.id;
                        return (
                          <tr key={r.id} tabIndex={0} aria-selected={on} onClick={() => void open(r)} onKeyDown={rowKeys(() => void open(r))} className={`cursor-pointer [&>td]:align-top focus-visible:-outline-offset-2 ${on ? '[&>td]:bg-tint-2' : ''}`}>
                            <td>
                              <div className="flex items-center gap-2">
                                <Avatar name={r.name || r.phone || '?'} size="sm" />
                                <div className="min-w-0"><div className="max-w-[13rem] truncate font-medium text-ink" title={r.name}>{r.name || <span className="text-ink-3">Không tên</span>}</div><div className="text-[11px]" style={{ color: posVar(r.posId) }}>{r.posName}</div></div>
                                <HoverReveal><span className="btn sm">Ghi chú<ChevronRight size={12} /></span></HoverReveal>
                              </div>
                            </td>
                            <td className="num">{r.phone ?? <span className="font-normal text-ink-4">—</span>}</td>
                            <td>{r.assignedName ?? <span className="text-ink-3">Chưa phân công</span>}</td>
                            <td className="whitespace-normal">
                              {r.notes.length ? (
                                <div className="space-y-1">
                                  {r.notes.slice(0, 2).map((n) => (
                                    <div key={n.id} className="flex items-start gap-1.5 text-xs" title={`${n.author} · ${dt(n.createdAt, true)}\n${n.message}`}>
                                      <Avatar name={n.author || '?'} size="sm" />
                                      <span className="line-clamp-2">{!startsWithDate(n.message) && <span className="num text-primary">{noteDay(n.createdAt)}: </span>}{n.message}</span>
                                    </div>
                                  ))}
                                  {r.noteCount > 2 && <div className="pl-8 text-[11px] text-ink-3">… <span className="num">{vi.format(r.noteCount)}</span> ghi chú, bấm để xem hết</div>}
                                </div>
                              ) : <StatusChip tone="red">Chưa note</StatusChip>}
                            </td>
                            <td><div className="flex max-w-32 flex-wrap gap-1">{r.tags.slice(0, 3).map((t) => <span key={t} className="rounded-[4px] border border-line-2 bg-surface-2 px-1.5 py-0.5 text-[10px] uppercase text-ink-2" title={t}>{t.length > 22 ? `${t.slice(0, 22)}…` : t}</span>)}{r.tags.length > 3 && <span className="num text-[10px] text-ink-3">+{r.tags.length - 3}</span>}</div></td>
                            <td className="n">{vi.format(r.succeedOrders)}</td>
                            <td className="n">{r.purchased ? money(r.purchased) : '—'}</td>
                            <td className="n text-xs">{r.lastOrderAt ? `${timeOnly(r.lastOrderAt)} ${dmy(r.lastOrderAt)}` : '—'}</td>
                            <td className={`n ${r.daysSinceNote === null || r.daysSinceNote >= 20 ? 'text-bad' : r.daysSinceNote >= 7 ? 'text-warn' : 'text-primary'}`}>{r.daysSinceNote === null ? 'Chưa note' : r.daysSinceNote === 0 ? 'Hôm nay' : `${r.daysSinceNote} ngày`}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </TableWrap>
              ) : <EmptyState text={query ? `Không có khách nào khớp "${query}".` : 'Không có khách nào khớp bộ lọc.'} />}
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-ink-3">
                <span>{viewAll
                  ? <>Hiển thị <span className="num">{vi.format(report.rows.length)}</span> / <span className="num">{vi.format(report.total)}</span>{report.total > 5000 ? ' (tối đa 5.000 một lượt, xuất Excel để lấy đủ)' : ''}</>
                  : <>Hiển thị <span className="num">{vi.format((report.page - 1) * PAGE_SIZE + 1)}–{vi.format(Math.min(report.total, report.page * PAGE_SIZE))}</span> / <span className="num">{vi.format(report.total)}</span></>}</span>
                <div className="flex gap-1">
                  {!viewAll && <><Button size="sm" variant="outline" aria-label="Trang trước" disabled={page <= 1 || loading} onClick={() => setPage((p) => p - 1)}><ChevronLeft size={14} />Trước</Button>
                  <Button size="sm" variant="outline" aria-label="Trang sau" disabled={page >= pages || loading} onClick={() => setPage((p) => p + 1)}>Sau<ChevronRight size={14} /></Button></>}
                  <Button size="sm" variant={viewAll ? 'default' : 'outline'} aria-pressed={viewAll} onClick={() => { setViewAll(!viewAll); setPage(1); }}>{viewAll ? 'Theo trang' : 'Xem toàn bộ'}</Button>
                </div>
              </div>
            </ChartCard>
            {selected && (
              <div id="care-detail" className="scroll-mt-16">
                <ChartCard icon={MessageSquareText} title={selected.name || selected.phone || 'Khách hàng'} subtitle={`${selected.posName} · ${selected.phone ?? 'không có SĐT'} · ${selected.assignedName ? `phân công: ${selected.assignedName}` : 'chưa phân công'}`}
                  action={<Button size="sm" variant="ghost" onClick={close}>Đóng</Button>}>
                  <div className="mb-3 grid grid-cols-2 gap-2 text-xs">
                    <div className="rounded-[10px] bg-surface-2 px-3 py-2"><div className="text-ink-3">Đã nhận · đã chi</div><div className="text-ink"><span className="num text-[13px]">{vi.format(selected.succeedOrders)}</span> đơn · <span className="num text-[13px]">{money(selected.purchased)}</span></div></div>
                    <div className="rounded-[10px] bg-surface-2 px-3 py-2"><div className="text-ink-3">Lần mua cuối</div><div className="num text-[13px] text-ink">{selected.lastOrderAt ? dt(selected.lastOrderAt, true) : '—'}</div></div>
                    <div className="rounded-[10px] bg-surface-2 px-3 py-2"><div className="text-ink-3">Lần note cuối</div><div className="num text-[13px] text-ink">{selected.lastNoteAt ? dt(selected.lastNoteAt, true) : 'Chưa note'}</div></div>
                    <div className="rounded-[10px] bg-surface-2 px-3 py-2"><div className="text-ink-3">Thẻ</div><div className="font-semibold text-ink">{selected.tags.join(', ') || '—'}</div></div>
                  </div>
                  {selected.shopId && <a className="link mb-3 inline-flex items-center gap-1 text-xs" href={`https://pos.pancake.vn/shop/${selected.shopId}/customer?search=${encodeURIComponent(selected.phone ?? selected.name)}`} target="_blank" rel="noreferrer">Mở trên Pancake<ExternalLink size={11} aria-hidden="true" /></a>}
                  {notesState === 'loading' && <div className="space-y-3" aria-busy="true" aria-label="Đang tải ghi chú">{[0, 1, 2].map((i) => <div key={i} className="flex gap-2"><Avatar name="?" size="sm" className="opacity-30" /><div className="min-w-0 flex-1 space-y-1.5"><span className="skel h-3 w-32" /><span className="skel h-3.5 w-full" /><span className="skel h-3.5 w-2/3" /></div></div>)}</div>}
                  {notesState === 'error' && <ErrorBox error={notesError ?? 'Không tải được ghi chú.'} onRetry={() => void open(selected, false)} />}
                  {notes && !notes.length && <EmptyState text="Khách này chưa có ghi chú nào." />}
                  {notes && notes.length > 0 && (
                    <ol className="max-h-[32rem] space-y-3 overflow-auto pr-1">
                      {notes.map((n) => (
                        <li key={n.id} className="flex gap-2">
                          <Avatar name={n.author || '?'} size="sm" />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-baseline justify-between gap-2 text-xs"><span className="font-semibold text-ink">{n.author || 'Không rõ'}</span><span className="num whitespace-nowrap text-[11px] text-ink-3">{timeOnly(n.createdAt)} {dt(n.createdAt)}</span></div>
                            <div className="whitespace-pre-wrap text-[13px] text-ink">{n.message}</div>
                            {n.orderId && <div className="text-[11px] text-ink-3">Gắn với đơn <span className="num">#{n.orderId}</span></div>}
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
