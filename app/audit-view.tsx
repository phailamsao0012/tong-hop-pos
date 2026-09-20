'use client';

// Nhật ký hoạt động (chủ hệ thống): ai đăng nhập / làm gì / xuất gì / mở trang nào, lúc nào, từ thiết bị và địa chỉ nào.
import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, FileDown, ScrollText, Search, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { todayVn } from '@/lib/report-time';
import { AUDIT_ACTIONS, AUDIT_GROUPS, auditLabel } from '@/lib/audit-labels';
import { ChartCard, EmptyState, ErrorBox, PageHeader, SkeletonTable, StatusChip, TableWrap, Toolbar, dt, toast, vi } from './ui-kit';

type Item = { id: string; at: string; userId: string | null; email: string | null; name: string | null; action: string; target: string | null; detail: string | null; status: number | null; ip: string | null; device: string | null };
type Data = { items: Item[]; total: number; page: number; size: number; users: { id: string; name: string; email: string }[]; keepDays: number };
const PAGE = 100;
const daysAgo = (n: number) => { const d = new Date(`${todayVn()}T00:00:00+07:00`); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10); };
const statusText = (s: number | null) => s === null ? '—' : s < 300 ? 'OK' : s === 401 ? 'Từ chối' : s === 403 ? 'Bị chặn' : s === 429 ? 'Quá nhiều' : `Lỗi ${s}`;

export function AuditView() {
  const [from, setFrom] = useState(daysAgo(6));
  const [to, setTo] = useState(todayVn());
  const [userId, setUserId] = useState('all');
  const [group, setGroup] = useState('all');
  const [action, setAction] = useState('all');
  const [qDraft, setQDraft] = useState('');
  const [q, setQ] = useState(''); // giá trị dùng để tìm: chờ 300 ms sau phím cuối (không bắn request mỗi phím gõ)
  const [page, setPage] = useState(1);
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const reqRef = useRef<AbortController | null>(null);

  useEffect(() => { const t = window.setTimeout(() => setQ(qDraft.trim()), 300); return () => clearTimeout(t); }, [qDraft]);
  const params = useCallback((size: number, p: number) => new URLSearchParams({ from, to, size: String(size), page: String(p), ...(userId !== 'all' ? { userId } : {}), ...(action !== 'all' ? { action } : group !== 'all' ? { group } : {}), ...(q ? { q } : {}) }), [from, to, userId, group, action, q]);
  const load = useCallback(async () => {
    reqRef.current?.abort();
    const ctrl = new AbortController();
    reqRef.current = ctrl;
    setLoading(true); setError(null);
    try {
      const r = await fetch(`/api/audit?${params(PAGE, page)}`, { cache: 'no-store', signal: ctrl.signal });
      const body = await r.json() as Data & { error?: string };
      if (ctrl.signal.aborted) return;
      if (!r.ok) throw new Error(body.error ?? 'Không tải được nhật ký.');
      setData(body);
    } catch (e) {
      if (ctrl.signal.aborted) return;
      setError(e instanceof Error ? e.message : 'Không tải được nhật ký.');
    } finally { if (!ctrl.signal.aborted) setLoading(false); }
  }, [params, page]);
  useEffect(() => { void load(); return () => reqRef.current?.abort(); }, [load]);
  useEffect(() => { setPage(1); }, [from, to, userId, group, action, q]);

  const exportExcel = async () => {
    setExporting(true);
    try {
      const r = await fetch(`/api/audit?${params(20000, 1)}`, { cache: 'no-store' });
      if (!r.ok) { toast('Không xuất được nhật ký.', { kind: 'error' }); return; }
      const body = await r.json() as Data;
      const XLSX = await import('xlsx');
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
        ['Thời gian', 'Người dùng', 'Email', 'Hành động', 'Đối tượng', 'Chi tiết', 'Kết quả', 'Thiết bị', 'IP'],
        ...body.items.map((i) => [dt(i.at, true), i.name ?? '', i.email ?? '', auditLabel(i.action), i.target ?? '', i.detail ?? '', i.status ?? '', i.device ?? '', i.ip ?? '']),
      ]), 'Nhật ký');
      XLSX.writeFile(wb, `nhat-ky_${from}_${to}.xlsx`);
      toast(`Đã xuất ${vi.format(body.items.length)} dòng nhật ký`);
    } catch { toast('Không xuất được nhật ký.', { kind: 'error' }); }
    finally { setExporting(false); }
  };
  const actionsOf = group === 'all' ? Object.keys(AUDIT_ACTIONS) : (AUDIT_GROUPS.find((g) => g.id === group)?.actions ?? []);
  const pages = data ? Math.max(1, Math.ceil(data.total / PAGE)) : 1;
  const tone = (s: number | null) => s === null ? 'gray' : s < 300 ? 'green' : s === 401 || s === 403 || s === 429 ? 'red' : 'orange';
  const pager = data && pages > 1 ? (
    <div className="flex items-center gap-1.5">
      <Button variant="outline" size="icon-sm" aria-label="Trang trước" disabled={page <= 1 || loading} onClick={() => setPage((p) => p - 1)}><ChevronLeft size={14} /></Button>
      <span className="num text-xs text-ink-2">Trang {page}/{pages}</span>
      <Button variant="outline" size="icon-sm" aria-label="Trang sau" disabled={page >= pages || loading} onClick={() => setPage((p) => p + 1)}><ChevronRight size={14} /></Button>
    </div>
  ) : null;

  return (
    <div className="space-y-4">
      <PageHeader eyebrow="Hệ thống" title="Nhật ký hoạt động" subtitle={`Đăng nhập · thao tác thay đổi · xuất dữ liệu · trang đã mở. Giữ ${data?.keepDays ?? 400} ngày gần nhất.`}
        actions={<Button variant="outline" onClick={exportExcel} disabled={!data?.total || exporting}><FileDown className={`size-4 ${exporting ? 'animate-pulse' : ''}`} />{exporting ? 'Đang xuất…' : 'Xuất Excel'}</Button>} />
      <Toolbar>
        <div className="flex min-w-0 items-center gap-2">
          <Input aria-label="Từ ngày" type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} className="w-auto" />
          <span className="text-xs text-ink-3">→</span>
          <Input aria-label="Đến ngày" type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} className="w-auto" />
        </div>
        <Select value={userId} onValueChange={(v) => setUserId(v ?? 'all')}>
          <SelectTrigger className="min-w-44" aria-label="Người dùng"><SelectValue placeholder="Người dùng" /></SelectTrigger>
          <SelectContent><SelectItem value="all">Mọi người dùng</SelectItem>{(data?.users ?? []).map((u) => <SelectItem key={u.id} value={u.id}>{u.name} · {u.email}</SelectItem>)}</SelectContent>
        </Select>
        <Select value={group} onValueChange={(v) => { setGroup(v ?? 'all'); setAction('all'); }}>
          <SelectTrigger className="min-w-36" aria-label="Nhóm hành động"><SelectValue placeholder="Nhóm" /></SelectTrigger>
          <SelectContent><SelectItem value="all">Mọi nhóm</SelectItem>{AUDIT_GROUPS.map((g) => <SelectItem key={g.id} value={g.id}>{g.label}</SelectItem>)}</SelectContent>
        </Select>
        <Select value={action} onValueChange={(v) => setAction(v ?? 'all')}>
          <SelectTrigger className="min-w-44" aria-label="Hành động"><SelectValue placeholder="Hành động" /></SelectTrigger>
          <SelectContent><SelectItem value="all">Mọi hành động</SelectItem>{actionsOf.map((a) => <SelectItem key={a} value={a}>{auditLabel(a)}</SelectItem>)}</SelectContent>
        </Select>
        <div className="relative min-w-0 flex-1 basis-56">
          <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-3" />
          <Input aria-label="Tìm trong nhật ký" placeholder="Tìm email, tên, chi tiết, IP…" value={qDraft} onChange={(e) => setQDraft(e.target.value)} className="pl-8 pr-8" />
          {qDraft && <button type="button" aria-label="Xóa ô tìm" className="absolute right-2 top-1/2 grid size-5 -translate-y-1/2 place-items-center rounded-full text-ink-3 transition-colors duration-[var(--dur)] hover:bg-surface-3 hover:text-ink" onClick={() => setQDraft('')}><X size={12} /></button>}
        </div>
        <span className="num ml-auto text-xs text-ink-3" aria-live="polite">{data ? `${vi.format(data.total)} dòng` : ''}{loading ? ' · đang tải…' : ''}</span>
      </Toolbar>
      {error && <ErrorBox error={error} onRetry={() => void load()} />}
      <ChartCard icon={ScrollText} title="Hoạt động" subtitle={data ? `${vi.format(data.total)} dòng · ${dt(`${from}T00:00:00+07:00`)} – ${dt(`${to}T00:00:00+07:00`)}` : undefined} action={pager}>
        {!data && loading && <SkeletonTable rows={8} cols={7} />}
        {data && !data.items.length && !loading && <EmptyState text="Không có hoạt động nào trong khoảng đã chọn." />}
        {data && data.items.length > 0 && (
          <TableWrap minWidth={880} className={loading ? 'opacity-70 transition-opacity duration-[var(--dur)]' : 'transition-opacity duration-[var(--dur)]'}>
            <table className="tbl" aria-busy={loading || undefined}>
              <thead>
                <tr><th>Thời gian</th><th>Người dùng</th><th>Hành động</th><th>Chi tiết</th><th>Kết quả</th><th>Thiết bị</th><th>IP</th></tr>
              </thead>
              <tbody>
                {data.items.map((i) => (
                  <tr key={i.id} className="align-top">
                    <td className="num text-ink-2">{dt(i.at, true)}</td>
                    <td><div className="max-w-[180px] truncate font-medium" title={i.email ?? ''}>{i.name ?? i.email ?? '—'}</div>{i.name && <div className="max-w-[180px] truncate text-xs text-ink-3">{i.email}</div>}</td>
                    <td><div className="flex items-center gap-1.5"><ScrollText className="size-3.5 shrink-0 text-ink-3" aria-hidden="true" />{auditLabel(i.action)}</div>{i.action === 'api' && i.target && <div className="max-w-[240px] truncate text-xs text-ink-3" title={i.target}>{i.target}</div>}</td>
                    <td className="max-w-[420px]"><div className="line-clamp-2 whitespace-normal break-words text-xs text-ink-2" title={[i.target, i.detail].filter(Boolean).join(' · ')}>{i.action === 'view' ? i.detail : [i.action !== 'api' && i.target && !['login', 'login.fail', 'logout'].includes(i.action) ? i.target : null, i.detail].filter(Boolean).join(' · ') || '—'}</div></td>
                    <td><StatusChip tone={tone(i.status)}>{statusText(i.status)}</StatusChip></td>
                    <td className="mut text-xs">{i.device ?? '—'}</td>
                    <td className="num mut text-xs">{i.ip ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        )}
        {pager && <div className="mt-3 flex justify-end">{pager}</div>}
      </ChartCard>
    </div>
  );
}
