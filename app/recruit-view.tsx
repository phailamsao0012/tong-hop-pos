'use client';

// Tuyển dụng: ứng viên gộp từ các file Google Sheets (Apps Script đẩy về), lọc theo file / tab / người phụ trách / vị trí /
// team / trạng thái / ngày CV về, xem CV ngay trên web, lịch sử thay đổi từng ứng viên. Chỉ chủ hệ thống và giám đốc.
import { useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts';
import { AlertTriangle, BriefcaseBusiness, CalendarDays, CheckCircle2, ChevronRight, ExternalLink, FileText, Search, UserCheck, UserPlus, UserX, Users, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { todayVn } from '@/lib/report-time';
import { useApi } from './use-api';
import { StaleChip } from './stale-chip';
import { Avatar, ChartCard, Definitions, Donut, EmptyState, ErrorBox, HoverReveal, KpiCard, PageHeader, SegmentedControl, SkeletonKpis, SkeletonTable, SortTh, StatusChip, TableWrap, Toolbar, Tooltip, dmy, dt, toast, useMotionOK, useSort, vi, type Tone } from './ui-kit';

type Candidate = {
  id: string; fileId: string; fileName: string; tab: string; rowNum: number; name: string; phone: string | null; position: string | null; team: string | null; handler: string | null;
  birthYear: string | null; receivedOn: string | null; cvUrl: string | null; status: string; data: Record<string, string>; firstSeenAt: string; updatedAt: string; deletedAt: string | null; cvViewable?: boolean;
};
type Source = { fileId: string; fileName: string; tabs: { name: string; headers: string[]; rows: number }[]; lastSnapshotAt: string; lastChangeAt: string | null };
type Resp = { candidates: Candidate[]; sources: Source[]; statusLabels: Record<string, string> };
type DetailResp = { candidate: Candidate; events: { id: number; kind: string; changes: { col: string; from: string; to: string }[]; createdAt: string; notifiedAt: string | null }[]; cv: { name: string; mime: string; size: number; viewable: boolean; updatedAt: string } | null };

const STATUS_ORDER = ['new', 'review', 'booked', 'interviewed', 'passed', 'trial', 'failed', 'rejected'];
const STATUS_TONE: Record<string, Tone> = { new: 'blue', review: 'gray', booked: 'teal', interviewed: 'purple', passed: 'green', trial: 'lime', failed: 'orange', rejected: 'red' };
const STATUS_COLOR: Record<string, string> = { new: '#2a78d6', review: '#8a9a90', booked: '#0f8f74', interviewed: '#5b48b8', passed: '#1a9c5b', trial: '#5a7a12', failed: '#eb6834', rejected: '#d24b4b' };
const PERIODS: Record<string, string> = { '7': '7 ngày qua', '30': '30 ngày qua', month: 'Tháng này', all: 'Toàn bộ' };
type SortKey = 'received' | 'name' | 'handler' | 'status' | 'updated';

/** "16/09/2026", "13/8", "2026-09-16" → YYYY-MM-DD (thiếu năm thì lấy năm hiện tại). */
function parseVnDate(v: string | null | undefined, today: string): string | null {
  if (!v) return null;
  const s = v.trim();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  m = s.match(/^(\d{1,2})[\/.-](\d{1,2})(?:[\/.-](\d{2,4}))?/);
  if (!m) return null;
  const y = m[3] ? (m[3].length === 2 ? `20${m[3]}` : m[3]) : today.slice(0, 4);
  const mo = Number(m[2]), d = Number(m[1]);
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}
const addDaysIso = (iso: string, n: number) => { const d = new Date(`${iso}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const findVal = (data: Record<string, string>, re: RegExp) => Object.entries(data).find(([k]) => re.test(k))?.[1] ?? '';
const minutesAgo = (iso: string | null) => iso ? Math.round((Date.now() - Date.parse(iso)) / 60000) : null;

async function exportRows(name: string, rows: (string | number | null)[][]) {
  const XLSX = await import('xlsx');
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), 'Ứng viên');
  XLSX.writeFile(wb, `${name}.xlsx`);
}

export function RecruitView() {
  const today = todayVn();
  const motionOn = useMotionOK();
  const { data, at, stale, loading, error, reload } = useApi<Resp>('/api/recruit/candidates', { refreshMs: 2 * 60000 });
  const [q, setQ] = useState('');
  const [file, setFile] = useState('all');
  const [tab, setTab] = useState('all');
  const [handler, setHandler] = useState('all');
  const [position, setPosition] = useState('all');
  const [team, setTeam] = useState('all');
  const [status, setStatus] = useState('all');
  const [period, setPeriod] = useState('30');
  const [onlyCv, setOnlyCv] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const sort = useSort<SortKey>('received');
  const labels = data?.statusLabels ?? {};
  const all = useMemo(() => (data?.candidates ?? []).map((c) => ({ ...c, receivedIso: parseVnDate(c.receivedOn, today) ?? c.firstSeenAt.slice(0, 10) })), [data, today]);
  const options = (pick: (c: Candidate) => string | null | undefined, scope = all) => [...new Set(scope.map(pick).map((v) => (v ?? '').trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'vi'));
  const files = data?.sources ?? [];
  const inFile = file === 'all' ? all : all.filter((c) => c.fileId === file);
  const periodStart = period === 'all' ? null : period === 'month' ? `${today.slice(0, 7)}-01` : addDaysIso(today, -Number(period) + 1);
  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const list = all.filter((c) =>
      (file === 'all' || c.fileId === file) && (tab === 'all' || c.tab === tab) && (handler === 'all' || (c.handler ?? '') === handler)
      && (position === 'all' || (c.position ?? '') === position) && (team === 'all' || (c.team ?? '') === team) && (status === 'all' || c.status === status)
      && (!periodStart || c.receivedIso >= periodStart) && (!onlyCv || !!c.cvUrl)
      && (!needle || c.name.toLowerCase().includes(needle) || (c.phone ?? '').includes(needle) || (c.position ?? '').toLowerCase().includes(needle)));
    return sort.apply(list, (c, k) => k === 'received' ? c.receivedIso : k === 'name' ? c.name : k === 'handler' ? c.handler ?? '' : k === 'status' ? STATUS_ORDER.indexOf(c.status) : c.updatedAt);
  }, [all, q, file, tab, handler, position, team, status, periodStart, onlyCv, sort.key, sort.desc]); // eslint-disable-line react-hooks/exhaustive-deps
  // Thẻ số: theo bộ lọc file/tab/kỳ nhưng KHÔNG theo trạng thái (để bấm thẻ đổi trạng thái).
  const base = useMemo(() => all.filter((c) => (file === 'all' || c.fileId === file) && (tab === 'all' || c.tab === tab) && (!periodStart || c.receivedIso >= periodStart) && (handler === 'all' || (c.handler ?? '') === handler)), [all, file, tab, periodStart, handler]);
  const count = (s: string) => base.filter((c) => c.status === s).length;
  const week = all.filter((c) => c.receivedIso >= addDaysIso(today, -6)).length;
  const daily = useMemo(() => {
    const m = new Map<string, number>();
    for (let i = 29; i >= 0; i--) m.set(addDaysIso(today, -i), 0);
    for (const c of base) if (m.has(c.receivedIso)) m.set(c.receivedIso, (m.get(c.receivedIso) ?? 0) + 1);
    return [...m.entries()].map(([day, n]) => ({ day, n }));
  }, [base, today]);
  const byHandler = useMemo(() => {
    const m = new Map<string, { name: string; total: number; booked: number; interviewed: number; passed: number; trial: number; rejected: number }>();
    for (const c of base) {
      const k = c.handler || 'Chưa ghi';
      if (!m.has(k)) m.set(k, { name: k, total: 0, booked: 0, interviewed: 0, passed: 0, trial: 0, rejected: 0 });
      const h = m.get(k)!; h.total++;
      if (['booked', 'interviewed', 'passed', 'trial'].includes(c.status)) h.booked++;
      if (['interviewed', 'passed', 'trial'].includes(c.status)) h.interviewed++;
      if (['passed', 'trial'].includes(c.status)) h.passed++;
      if (c.status === 'trial') h.trial++;
      if (c.status === 'rejected' || c.status === 'failed') h.rejected++;
    }
    return [...m.values()].sort((a, b) => b.total - a.total);
  }, [base]);
  const staleSources = files.filter((s) => (minutesAgo(s.lastSnapshotAt) ?? 0) > 120);
  const clearFilters = () => { setQ(''); setFile('all'); setTab('all'); setHandler('all'); setPosition('all'); setTeam('all'); setStatus('all'); setPeriod('30'); setOnlyCv(false); };
  const filtersOn = q || file !== 'all' || tab !== 'all' || handler !== 'all' || position !== 'all' || team !== 'all' || status !== 'all' || period !== '30' || onlyCv;
  const selected = selectedId ? all.find((c) => c.id === selectedId) ?? null : null;

  return (
    <div className="space-y-5">
      <PageHeader eyebrow="Nhân sự" title="Tuyển dụng" subtitle="Ứng viên gộp từ các file Google Sheets tuyển dụng · tự cập nhật khi file đổi · mọi thay đổi báo về Telegram"
        actions={<>
          <StaleChip stale={stale} at={at} loading={loading} error={data ? error : null} onRetry={reload} />
          <Button variant="outline" disabled={!rows.length} onClick={() => { void exportRows(`tuyen-dung_${today}`, [
            ['File', 'Tab', 'Dòng', 'Họ tên', 'Năm sinh', 'SĐT', 'Vị trí', 'Team', 'Phụ trách', 'Ngày CV về', 'Trạng thái', 'Lịch PV', 'Ghi chú', 'Link CV', 'Cập nhật'],
            ...rows.map((c) => [c.fileName, c.tab, c.rowNum, c.name, c.birthYear, c.phone, c.position, c.team, c.handler, c.receivedOn, labels[c.status] ?? c.status, findVal(c.data, /lịch phỏng vấn|thời gian pv|ngày phỏng vấn|ngày pv|giờ pv/i), findVal(c.data, /note|ghi chú|kết quả/i), c.cvUrl, dt(c.updatedAt, true)]),
          ]); toast('Đã xuất Excel'); }}>Xuất Excel</Button>
        </>} />
      {error && !data && <ErrorBox error={error} onRetry={reload} />}
      {loading && !data && <><SkeletonKpis count={6} className="xl:grid-cols-6" /><ChartCard icon={Users} title="Ứng viên" subtitle="Đang tải…"><SkeletonTable rows={8} cols={8} /></ChartCard></>}
      {data && !files.length && (
        <ChartCard icon={AlertTriangle} title="Chưa nhận được dữ liệu từ Google Sheets" subtitle="Cần cài Apps Script theo dõi các file tuyển dụng (hướng dẫn đã gửi). Sau khi script chạy lần đầu, ứng viên sẽ hiện ở đây.">
          <EmptyState text="Chưa có ứng viên nào." />
        </ChartCard>
      )}
      {data && files.length > 0 && (
        <>
          {staleSources.length > 0 && <p className="notice warn"><AlertTriangle size={15} className="mt-0.5 shrink-0" /><span>Script chưa gửi dữ liệu trong hơn 2 giờ cho: <b>{staleSources.map((s) => s.fileName || s.fileId).join(', ')}</b>. Kiểm tra Apps Script (trigger có thể đã bị tắt).</span></p>}
          <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3 xl:grid-cols-6">
            <KpiCard icon={UserPlus} tone="blue" label="CV về 7 ngày qua" value={vi.format(week)} countUp rawValue={week} note="Theo ngày CV về, mọi file" tooltip={{ title: 'CV về 7 ngày qua', current: `${vi.format(week)} ứng viên`, definition: 'Ứng viên có "Ngày CV về" trong 7 ngày gần nhất, tính trên toàn bộ file (không theo bộ lọc).' }} />
            <KpiCard icon={Users} tone="gray" label="Đang theo dõi" value={vi.format(base.length)} countUp rawValue={base.length} note={PERIODS[period]} onClick={() => setStatus('all')} active={status === 'all'} tooltip={{ title: 'Ứng viên đang theo dõi', current: `${vi.format(base.length)} người`, definition: 'Ứng viên còn trong file (không tính dòng đã xoá) theo bộ lọc file / tab / kỳ / phụ trách. Bấm để bỏ lọc trạng thái.' }} />
            <KpiCard icon={CalendarDays} tone="teal" label="Đã book lịch PV" value={vi.format(count('booked'))} countUp rawValue={count('booked')} note="Sếp duyệt, chờ phỏng vấn" onClick={() => setStatus('booked')} active={status === 'booked'} tooltip={{ title: 'Đã book lịch', current: `${vi.format(count('booked'))} người`, definition: 'Cột đánh giá ghi "Đạt book lịch" / "Có" / "Duyệt" và chưa ghi kết quả phỏng vấn.' }} />
            <KpiCard icon={UserCheck} tone="green" label="Pass phỏng vấn" value={vi.format(count('passed') + count('trial'))} countUp rawValue={count('passed') + count('trial')} note={`${vi.format(count('interviewed'))} đã đến PV chờ kết quả`} onClick={() => setStatus('passed')} active={status === 'passed'} tooltip={{ title: 'Pass phỏng vấn', current: `${vi.format(count('passed') + count('trial'))} người`, rows: [['Đang thử việc / nhận việc', vi.format(count('trial'))], ['Đã đến PV, chờ kết quả', vi.format(count('interviewed'))]], definition: 'Cột Pass PV ghi Pass / Có, hoặc đã có ngày thử việc.' }} />
            <KpiCard icon={BriefcaseBusiness} tone="lime" label="Thử việc / nhận việc" value={vi.format(count('trial'))} countUp rawValue={count('trial')} note="Đã có ngày thử việc" onClick={() => setStatus('trial')} active={status === 'trial'} tooltip={{ title: 'Thử việc', current: `${vi.format(count('trial'))} người`, definition: 'Cột Thử việc / Ngày nhận việc / Ngày đến TV có giá trị.' }} />
            <KpiCard icon={UserX} tone="red" label="Loại / không pass" value={vi.format(count('rejected') + count('failed'))} countUp rawValue={count('rejected') + count('failed')} note={`${vi.format(count('rejected'))} loại CV · ${vi.format(count('failed'))} rớt PV`} onClick={() => setStatus('rejected')} active={status === 'rejected'} tooltip={{ title: 'Loại', current: `${vi.format(count('rejected') + count('failed'))} người`, definition: 'Đánh giá CV ghi "Loại" / "không phù hợp", hoặc Pass PV ghi Không.' }} />
          </div>
          <Toolbar>
            <div className="relative">
              <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-3" aria-hidden="true" />
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Tìm tên, SĐT, vị trí" aria-label="Tìm ứng viên" className="w-56 pl-8" />
            </div>
            <span className="pl-1 text-sm font-semibold text-ink-2">Kỳ</span>
            <SegmentedControl ariaLabel="Kỳ ngày CV về" size="sm" value={period} onChange={setPeriod} options={Object.entries(PERIODS).map(([value, label]) => ({ value, label }))} />
            <span className="pl-1 text-sm font-semibold text-ink-2">File</span>
            <Select value={file} items={{ all: 'Mọi file', ...Object.fromEntries(files.map((s) => [s.fileId, s.fileName || s.fileId])) }} onValueChange={(v) => { setFile(String(v)); setTab('all'); }}>
              <SelectTrigger className="min-w-44" aria-label="File"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="all">Mọi file</SelectItem>{files.map((s) => <SelectItem key={s.fileId} value={s.fileId}>{s.fileName || s.fileId}</SelectItem>)}</SelectContent>
            </Select>
            <Select value={tab} items={{ all: 'Mọi tab', ...Object.fromEntries(options((c) => c.tab, inFile).map((t) => [t, t])) }} onValueChange={(v) => setTab(String(v))}>
              <SelectTrigger className="min-w-36" aria-label="Tab"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="all">Mọi tab</SelectItem>{options((c) => c.tab, inFile).map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
            </Select>
            <Select value={handler} items={{ all: 'Mọi người phụ trách', ...Object.fromEntries(options((c) => c.handler).map((t) => [t, t])) }} onValueChange={(v) => setHandler(String(v))}>
              <SelectTrigger className="min-w-40" aria-label="Người phụ trách"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="all">Mọi người phụ trách</SelectItem>{options((c) => c.handler).map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
            </Select>
            <Select value={position} items={{ all: 'Mọi vị trí', ...Object.fromEntries(options((c) => c.position).map((t) => [t, t])) }} onValueChange={(v) => setPosition(String(v))}>
              <SelectTrigger className="min-w-36" aria-label="Vị trí"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="all">Mọi vị trí</SelectItem>{options((c) => c.position).map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
            </Select>
            {options((c) => c.team).length > 0 && (
              <Select value={team} items={{ all: 'Mọi team', ...Object.fromEntries(options((c) => c.team).map((t) => [t, t])) }} onValueChange={(v) => setTeam(String(v))}>
                <SelectTrigger className="min-w-32" aria-label="Team"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="all">Mọi team</SelectItem>{options((c) => c.team).map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
              </Select>
            )}
            <Select value={status} items={{ all: 'Mọi trạng thái', ...Object.fromEntries(STATUS_ORDER.map((s) => [s, labels[s] ?? s])) }} onValueChange={(v) => setStatus(String(v))}>
              <SelectTrigger className="min-w-40" aria-label="Trạng thái"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="all">Mọi trạng thái</SelectItem>{STATUS_ORDER.map((s) => <SelectItem key={s} value={s}>{labels[s] ?? s}</SelectItem>)}</SelectContent>
            </Select>
            <label className="flex cursor-pointer items-center gap-1.5 text-sm text-ink-2"><input type="checkbox" className="accent-[var(--primary)]" checked={onlyCv} onChange={(e) => setOnlyCv(e.target.checked)} />Có CV</label>
            {filtersOn && <Button size="sm" variant="ghost" onClick={clearFilters}><X size={13} />Bỏ lọc</Button>}
            <Button className="ml-auto" variant="outline" onClick={reload} disabled={loading}>{loading ? 'Đang tải…' : 'Tải lại'}</Button>
          </Toolbar>
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
            <ChartCard icon={CalendarDays} title="CV về theo ngày" subtitle="30 ngày gần nhất theo cột Ngày CV về · theo bộ lọc file / tab / phụ trách">
              <ChartContainer className="h-52 w-full aspect-auto" config={{ n: { label: 'CV về', color: 'var(--primary)' } }}>
                <BarChart data={daily}>
                  <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
                  <XAxis dataKey="day" tickLine={false} axisLine={false} tickFormatter={(v: string) => dmy(v)} minTickGap={24} />
                  <YAxis tickLine={false} axisLine={false} width={30} allowDecimals={false} />
                  <ChartTooltip cursor={{ fill: 'var(--surface-2)' }} content={<ChartTooltipContent labelFormatter={(v) => dmy(String(v))} />} />
                  <Bar dataKey="n" fill="var(--color-n)" radius={[4, 4, 0, 0]} isAnimationActive={motionOn} />
                </BarChart>
              </ChartContainer>
            </ChartCard>
            <ChartCard icon={Users} title="Trạng thái ứng viên" subtitle="Bấm một cung để lọc danh sách">
              <Donut centerValue={vi.format(base.length)} centerRaw={base.length} centerLabel="ứng viên" onSelect={(s) => setStatus(status === s.key ? 'all' : s.key)}
                slices={STATUS_ORDER.map((s) => ({ key: s, label: labels[s] ?? s, value: count(s), color: STATUS_COLOR[s] })).filter((s) => s.value > 0)} />
            </ChartCard>
          </div>
          <ChartCard icon={UserCheck} title={`Theo người phụ trách · ${byHandler.length}`} subtitle="Số CV về và tiến độ theo từng người tuyển, trong bộ lọc file / tab / kỳ">
            <TableWrap maxHeight="20rem" minWidth={560}>
              <table className="tbl">
                <thead><tr><th>Người phụ trách</th><th className="n">CV về</th><th className="n">Book lịch</th><th className="n">Đến PV</th><th className="n">Pass</th><th className="n">Thử việc</th><th className="n">Loại</th><th className="n">Tỷ lệ pass / CV</th></tr></thead>
                <tbody>{byHandler.map((h) => (
                  <tr key={h.name} tabIndex={0} onClick={() => setHandler(handler === h.name ? 'all' : h.name === 'Chưa ghi' ? 'all' : h.name)} className={`cursor-pointer focus-visible:-outline-offset-2 ${handler === h.name ? '[&>td]:bg-tint-2' : ''}`}>
                    <td className="font-medium text-ink"><span className="inline-flex items-center gap-2">{h.name}<HoverReveal><span className="btn sm">{handler === h.name ? 'Bỏ lọc' : 'Lọc'}<ChevronRight size={12} /></span></HoverReveal></span></td>
                    <td className="n">{vi.format(h.total)}</td><td className="n">{vi.format(h.booked)}</td><td className="n">{vi.format(h.interviewed)}</td><td className="n text-primary">{vi.format(h.passed)}</td><td className="n">{vi.format(h.trial)}</td><td className={`n ${h.rejected ? 'text-bad' : ''}`}>{vi.format(h.rejected)}</td>
                    <td className="n">{h.total ? `${Math.round(h.passed / h.total * 100)}%` : '—'}</td>
                  </tr>
                ))}</tbody>
                <tfoot><tr className="font-semibold [&>td]:bg-surface-2"><td>Tổng</td><td className="n">{vi.format(base.length)}</td><td className="n">{vi.format(byHandler.reduce((a, h) => a + h.booked, 0))}</td><td className="n">{vi.format(byHandler.reduce((a, h) => a + h.interviewed, 0))}</td><td className="n">{vi.format(byHandler.reduce((a, h) => a + h.passed, 0))}</td><td className="n">{vi.format(byHandler.reduce((a, h) => a + h.trial, 0))}</td><td className="n">{vi.format(byHandler.reduce((a, h) => a + h.rejected, 0))}</td><td className="n">{base.length ? `${Math.round(byHandler.reduce((a, h) => a + h.passed, 0) / base.length * 100)}%` : '—'}</td></tr></tfoot>
              </table>
            </TableWrap>
          </ChartCard>
          <div className={`grid gap-4 ${selected ? '2xl:grid-cols-[minmax(0,1fr)_minmax(0,28rem)]' : ''}`}>
            <ChartCard icon={Users} title={`Ứng viên · ${vi.format(rows.length)}`} subtitle="Bấm một dòng để xem đủ thông tin, CV và lịch sử thay đổi · bấm tiêu đề cột để sắp xếp">
              {rows.length ? (
                <TableWrap maxHeight="44rem" minWidth={720}>
                  <table className="tbl table-fixed">
                    <colgroup><col className="w-[24%]" /><col className="w-[16%]" /><col className="w-[12%]" /><col className="w-[11%]" /><col className="w-[13%]" /><col /><col className="w-[8%]" /></colgroup>
                    <thead><tr><SortTh k="name" label="Ứng viên" sort={sort} align="left" /><th>Vị trí · Team</th><SortTh k="handler" label="Phụ trách" sort={sort} align="left" /><SortTh k="received" label="CV về" sort={sort} align="left" /><SortTh k="status" label="Trạng thái" sort={sort} align="left" /><th>Lịch PV · ghi chú</th><th className="n">CV</th></tr></thead>
                    <tbody>{rows.map((c) => {
                      const on = selectedId === c.id;
                      const schedule = findVal(c.data, /lịch phỏng vấn|thời gian pv|ngày phỏng vấn|ngày pv|giờ pv|giờ phỏng vấn/i);
                      const note = findVal(c.data, /note kết quả|note|ghi chú|kn làm việc|kết quả/i);
                      return (
                        <tr key={c.id} tabIndex={0} aria-selected={on} onClick={() => setSelectedId(on ? null : c.id)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelectedId(on ? null : c.id); } }} className={`cursor-pointer [&>td]:align-top focus-visible:-outline-offset-2 ${on ? '[&>td]:bg-tint-2' : ''}`}>
                          <td className="whitespace-normal"><div className="flex items-start gap-2"><Avatar name={c.name} size="sm" /><div className="min-w-0"><div className="truncate font-medium text-ink" title={c.name}>{c.name}{c.birthYear ? <span className="num ml-1 text-xs font-normal text-ink-3">{c.birthYear}</span> : null}</div><div className="num text-[11px] text-ink-2">{c.phone ?? '—'}</div><div className="truncate text-[11px] text-ink-3" title={`${c.fileName} › ${c.tab}`}>{c.fileName} › {c.tab}</div></div></div></td>
                          <td className="whitespace-normal text-xs"><div className="text-ink">{c.position ?? '—'}</div>{c.team && <div className="text-ink-3">{c.team}</div>}</td>
                          <td className="whitespace-normal text-xs">{c.handler ?? <span className="text-ink-4">—</span>}</td>
                          <td className="num text-xs">{c.receivedOn ?? '—'}</td>
                          <td><StatusChip tone={STATUS_TONE[c.status] ?? 'gray'}>{labels[c.status] ?? c.status}</StatusChip></td>
                          <td className="whitespace-normal text-xs">{schedule && <div className="num text-ink">{schedule}</div>}{note && <div className="line-clamp-2 text-ink-2" title={note}>{note}</div>}{!schedule && !note && <span className="text-ink-4">—</span>}</td>
                          <td className="n">{c.cvViewable ? <a className="btn sm" href={`/api/recruit/cv?id=${encodeURIComponent(c.id)}`} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}><FileText size={12} />Xem</a> : c.cvUrl ? <a className="btn sm" href={c.cvUrl} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}><ExternalLink size={12} />Drive</a> : <span className="text-ink-4">—</span>}</td>
                        </tr>
                      );
                    })}</tbody>
                  </table>
                </TableWrap>
              ) : <EmptyState text={filtersOn ? 'Không có ứng viên khớp bộ lọc.' : 'Chưa có ứng viên.'} />}
            </ChartCard>
            {selected && <CandidateDetail candidate={selected} labels={labels} onClose={() => setSelectedId(null)} />}
          </div>
          <ChartCard icon={CheckCircle2} title="Nguồn dữ liệu" subtitle="Các file Google Sheets đang theo dõi và lần gửi gần nhất của Apps Script">
            <TableWrap minWidth={520}>
              <table className="tbl"><thead><tr><th>File</th><th>Tab</th><th className="n">Ứng viên</th><th>Nhận lần cuối</th><th>Đổi lần cuối</th></tr></thead>
                <tbody>{files.map((s) => { const ago = minutesAgo(s.lastSnapshotAt) ?? 0; return (
                  <tr key={s.fileId}><td className="font-medium text-ink">{s.fileName || s.fileId}</td><td className="whitespace-normal text-xs text-ink-2">{s.tabs.map((t) => `${t.name} (${t.rows})`).join(' · ')}</td><td className="n">{vi.format(all.filter((c) => c.fileId === s.fileId).length)}</td><td className={`num text-xs ${ago > 120 ? 'text-bad' : 'text-ink-2'}`}>{dt(s.lastSnapshotAt, true)}</td><td className="num text-xs text-ink-2">{s.lastChangeAt ? dt(s.lastChangeAt, true) : '—'}</td></tr>
                ); })}</tbody></table>
            </TableWrap>
          </ChartCard>
          <Definitions items={{
            source: 'Apps Script chạy bằng tài khoản Google của chủ web: mỗi khi một file tuyển dụng được sửa (và định kỳ 10 phút), script gửi toàn bộ các tab về máy chủ; máy chủ so với bản đã lưu để tìm dòng mới / sửa / xoá.',
            status: 'Trạng thái suy ra từ các cột: Thử việc (có ngày thử việc / nhận việc) → Pass PV (cột Pass ghi Pass / Có) → Đã đến PV → Đã book lịch (đánh giá "Đạt book lịch" / "Có") → Loại ("Loại", "không phù hợp") → Đang xem xét → Mới nhận CV.',
            telegram: 'Ứng viên mới: gửi đủ thông tin kèm file CV. Sửa ô: gộp các lần sửa trong 90 giây rồi báo cột nào đổi từ gì sang gì. Tab JD / Báo cáo / Checklist chỉ lưu, không báo.',
            cv: 'Nút "Xem" mở bản CV đã lưu qua Telegram; "Drive" mở link gốc trên Google Drive (cần tài khoản có quyền).',
          }} />
        </>
      )}
    </div>
  );
}

function CandidateDetail({ candidate: c, labels, onClose }: { candidate: Candidate; labels: Record<string, string>; onClose: () => void }) {
  const { data, loading, error } = useApi<DetailResp>(`/api/recruit/candidates?id=${encodeURIComponent(c.id)}`);
  const [showCv, setShowCv] = useState(false);
  const entries = Object.entries(c.data).filter(([k, v]) => v && !/^(stt|tt)$/i.test(k));
  const KIND: Record<string, string> = { new: 'Ứng viên mới', update: 'Cập nhật', delete: 'Xoá khỏi bảng', cv: 'Có CV' };
  return (
    <div id="recruit-detail" className="scroll-mt-16">
      <ChartCard icon={Users} title={c.name} subtitle={`${c.fileName} › ${c.tab} · dòng ${c.rowNum}${c.deletedAt ? ' · đã xoá khỏi bảng' : ''}`} action={<Button size="sm" variant="ghost" onClick={onClose}>Đóng</Button>}>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <StatusChip tone={STATUS_TONE[c.status] ?? 'gray'}>{labels[c.status] ?? c.status}</StatusChip>
          {c.cvViewable && <Button size="sm" variant={showCv ? 'default' : 'outline'} onClick={() => setShowCv(!showCv)}><FileText size={13} />{showCv ? 'Ẩn CV' : 'Xem CV tại đây'}</Button>}
          {c.cvViewable && <a className="btn sm" href={`/api/recruit/cv?id=${encodeURIComponent(c.id)}`} target="_blank" rel="noreferrer"><ExternalLink size={12} />Mở tab mới</a>}
          {c.cvUrl && <a className="btn sm" href={c.cvUrl} target="_blank" rel="noreferrer"><ExternalLink size={12} />Drive</a>}
        </div>
        {showCv && c.cvViewable && <iframe title={`CV ${c.name}`} src={`/api/recruit/cv?id=${encodeURIComponent(c.id)}`} className="mb-3 h-[32rem] w-full rounded-xl border border-line bg-surface-2" />}
        <dl className="grid grid-cols-[minmax(0,10rem)_minmax(0,1fr)] gap-x-3 gap-y-1.5 text-xs">
          {entries.map(([k, v]) => <div key={k} className="contents"><dt className="truncate text-ink-3" title={k}>{k}</dt><dd className="whitespace-pre-wrap break-words text-ink">{/^https?:\/\//.test(v) ? <a className="link" href={v} target="_blank" rel="noreferrer">{v}</a> : v}</dd></div>)}
          {c.cvUrl && <div className="contents"><dt className="text-ink-3">Link CV</dt><dd className="break-all"><a className="link" href={c.cvUrl} target="_blank" rel="noreferrer">{c.cvUrl}</a></dd></div>}
          <div className="contents"><dt className="text-ink-3">Lần đầu thấy</dt><dd className="num">{dt(c.firstSeenAt, true)}</dd></div>
          <div className="contents"><dt className="text-ink-3">Cập nhật</dt><dd className="num">{dt(c.updatedAt, true)}</dd></div>
        </dl>
        <h4 className="mb-1.5 mt-4 text-xs font-semibold uppercase tracking-[.06em] text-ink-2">Lịch sử thay đổi</h4>
        {loading && !data && <SkeletonTable rows={3} cols={2} />}
        {error && !data && <p className="text-xs text-bad">{error}</p>}
        {data && (data.events.length ? (
          <ol className="space-y-1.5">
            {data.events.map((e) => (
              <li key={e.id} className="rounded-lg border border-line bg-surface p-2 text-xs">
                <div className="flex items-center justify-between gap-2"><span className="font-semibold text-ink">{KIND[e.kind] ?? e.kind}</span><span className="num text-ink-3">{dt(e.createdAt, true)}{e.notifiedAt ? ' · đã báo Telegram' : ' · chờ báo'}</span></div>
                {e.changes.length > 0 && <ul className="mt-1 space-y-0.5 text-ink-2">{e.changes.map((ch, i) => <li key={i}><span className="text-ink-3">{ch.col}:</span> {ch.from ? <><s className="text-ink-4">{ch.from}</s> → </> : null}<b className="text-ink">{ch.to || '(xoá)'}</b></li>)}</ul>}
              </li>
            ))}
          </ol>
        ) : <p className="text-xs text-ink-3">Chưa có thay đổi nào được ghi.</p>)}
        {data?.cv && <p className="mt-3 text-[11px] text-ink-3">CV: {data.cv.name} · {Math.round(data.cv.size / 1024)} KB · {data.cv.viewable ? 'đã lưu qua Telegram' : 'chưa gửi được qua Telegram'}</p>}
      </ChartCard>
    </div>
  );
}
