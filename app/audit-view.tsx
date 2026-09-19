'use client';

// Nhật ký hoạt động (chủ hệ thống): ai đăng nhập / làm gì / xuất gì / mở trang nào, lúc nào, từ thiết bị và địa chỉ nào.
import { useCallback, useEffect, useState } from 'react';
import { FileDown, ScrollText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { todayVn } from '@/lib/report-time';
import { AUDIT_ACTIONS, AUDIT_GROUPS, auditLabel } from '@/lib/audit-labels';
import { EmptyState, ErrorBox, PageHeader, StatusChip, Toolbar, dt, vi } from './ui-kit';

type Item = { id: string; at: string; userId: string | null; email: string | null; name: string | null; action: string; target: string | null; detail: string | null; status: number | null; ip: string | null; device: string | null };
type Data = { items: Item[]; total: number; page: number; size: number; users: { id: string; name: string; email: string }[]; keepDays: number };
const PAGE = 100;
const daysAgo = (n: number) => { const d = new Date(`${todayVn()}T00:00:00+07:00`); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10); };

export function AuditView() {
  const [from, setFrom] = useState(daysAgo(6));
  const [to, setTo] = useState(todayVn());
  const [userId, setUserId] = useState('all');
  const [group, setGroup] = useState('all');
  const [action, setAction] = useState('all');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const params = useCallback((size: number, p: number) => new URLSearchParams({ from, to, size: String(size), page: String(p), ...(userId !== 'all' ? { userId } : {}), ...(action !== 'all' ? { action } : group !== 'all' ? { group } : {}), ...(q.trim() ? { q: q.trim() } : {}) }), [from, to, userId, group, action, q]);
  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const r = await fetch(`/api/audit?${params(PAGE, page)}`, { cache: 'no-store' });
      const body = await r.json() as Data & { error?: string };
      if (!r.ok) throw new Error(body.error ?? 'Không tải được nhật ký.');
      setData(body);
    } catch (e) { setError(e instanceof Error ? e.message : 'Không tải được nhật ký.'); }
    finally { setLoading(false); }
  }, [params, page]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => { setPage(1); }, [from, to, userId, group, action, q]);

  const exportExcel = async () => {
    const r = await fetch(`/api/audit?${params(20000, 1)}`, { cache: 'no-store' });
    if (!r.ok) return;
    const body = await r.json() as Data;
    const XLSX = await import('xlsx');
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
      ['Thời gian', 'Người dùng', 'Email', 'Hành động', 'Đối tượng', 'Chi tiết', 'Kết quả', 'Thiết bị', 'IP'],
      ...body.items.map((i) => [dt(i.at, true), i.name ?? '', i.email ?? '', auditLabel(i.action), i.target ?? '', i.detail ?? '', i.status ?? '', i.device ?? '', i.ip ?? '']),
    ]), 'Nhật ký');
    XLSX.writeFile(wb, `nhat-ky_${from}_${to}.xlsx`);
  };
  const actionsOf = group === 'all' ? Object.keys(AUDIT_ACTIONS) : (AUDIT_GROUPS.find((g) => g.id === group)?.actions ?? []);
  const pages = data ? Math.max(1, Math.ceil(data.total / PAGE)) : 1;
  const tone = (s: number | null) => s === null ? 'gray' : s < 300 ? 'green' : s === 401 || s === 403 || s === 429 ? 'red' : 'orange';

  return (
    <div className="space-y-4">
      <PageHeader eyebrow="Hệ thống" title="Nhật ký hoạt động" subtitle={`Đăng nhập · thao tác thay đổi · xuất dữ liệu · trang đã mở. Giữ ${data?.keepDays ?? 400} ngày gần nhất.`}
        actions={<Button variant="outline" size="sm" onClick={exportExcel} disabled={!data?.total}><FileDown className="size-4" />Xuất Excel</Button>} />
      <Toolbar>
        <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-8 w-[140px]" />
        <span className="text-xs text-muted-foreground">→</span>
        <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-8 w-[140px]" />
        <Select value={userId} onValueChange={(v) => setUserId(v ?? 'all')}>
          <SelectTrigger className="h-8 w-[200px]"><SelectValue placeholder="Người dùng" /></SelectTrigger>
          <SelectContent><SelectItem value="all">Mọi người dùng</SelectItem>{(data?.users ?? []).map((u) => <SelectItem key={u.id} value={u.id}>{u.name} · {u.email}</SelectItem>)}</SelectContent>
        </Select>
        <Select value={group} onValueChange={(v) => { setGroup(v ?? 'all'); setAction('all'); }}>
          <SelectTrigger className="h-8 w-[180px]"><SelectValue placeholder="Nhóm" /></SelectTrigger>
          <SelectContent><SelectItem value="all">Mọi nhóm</SelectItem>{AUDIT_GROUPS.map((g) => <SelectItem key={g.id} value={g.id}>{g.label}</SelectItem>)}</SelectContent>
        </Select>
        <Select value={action} onValueChange={(v) => setAction(v ?? 'all')}>
          <SelectTrigger className="h-8 w-[220px]"><SelectValue placeholder="Hành động" /></SelectTrigger>
          <SelectContent><SelectItem value="all">Mọi hành động</SelectItem>{actionsOf.map((a) => <SelectItem key={a} value={a}>{auditLabel(a)}</SelectItem>)}</SelectContent>
        </Select>
        <Input placeholder="Tìm email, tên, chi tiết, IP…" value={q} onChange={(e) => setQ(e.target.value)} className="h-8 w-[220px]" />
        <span className="ml-auto text-xs text-muted-foreground">{data ? `${vi.format(data.total)} dòng` : ''}{loading ? ' · đang tải…' : ''}</span>
      </Toolbar>
      {error && <ErrorBox error={error} onRetry={load} />}
      {data && !data.items.length && !loading && <EmptyState text="Không có hoạt động nào trong khoảng đã chọn." />}
      {data && data.items.length > 0 && (
        <div className="overflow-x-auto rounded-xl border bg-background">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left text-xs text-muted-foreground">
              <tr><th className="px-3 py-2">Thời gian</th><th className="px-3 py-2">Người dùng</th><th className="px-3 py-2">Hành động</th><th className="px-3 py-2">Chi tiết</th><th className="px-3 py-2">Kết quả</th><th className="px-3 py-2">Thiết bị</th><th className="px-3 py-2">IP</th></tr>
            </thead>
            <tbody>
              {data.items.map((i) => (
                <tr key={i.id} className="border-t align-top">
                  <td className="px-3 py-2 tabular-nums">{dt(i.at, true)}</td>
                  <td className="px-3 py-2"><div className="max-w-[180px] truncate font-medium" title={i.email ?? ''}>{i.name ?? i.email ?? '—'}</div>{i.name && <div className="max-w-[180px] truncate text-xs text-muted-foreground">{i.email}</div>}</td>
                  <td className="px-3 py-2"><div className="flex items-center gap-1.5"><ScrollText className="size-3.5 text-muted-foreground" />{auditLabel(i.action)}</div>{i.action === 'api' && i.target && <div className="text-xs text-muted-foreground">{i.target}</div>}</td>
                  <td className="max-w-[420px] px-3 py-2"><div className="line-clamp-2 whitespace-normal break-words text-xs" title={[i.target, i.detail].filter(Boolean).join(' · ')}>{i.action === 'view' ? i.detail : [i.action !== 'api' && i.target && !['login', 'login.fail', 'logout'].includes(i.action) ? i.target : null, i.detail].filter(Boolean).join(' · ') || '—'}</div></td>
                  <td className="px-3 py-2"><StatusChip tone={tone(i.status)}>{i.status === null ? '—' : i.status < 300 ? 'OK' : i.status === 401 ? 'Từ chối' : i.status === 403 ? 'Bị chặn' : i.status === 429 ? 'Quá nhiều' : `Lỗi ${i.status}`}</StatusChip></td>
                  <td className="px-3 py-2 text-xs">{i.device ?? '—'}</td>
                  <td className="px-3 py-2 text-xs tabular-nums">{i.ip ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {data && pages > 1 && (
        <div className="flex items-center justify-end gap-2 text-xs">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Trước</Button>
          <span>Trang {page}/{pages}</span>
          <Button variant="outline" size="sm" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>Sau</Button>
        </div>
      )}
    </div>
  );
}
