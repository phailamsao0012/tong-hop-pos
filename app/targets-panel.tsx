'use client';

// Cấu hình mục tiêu tháng: doanh thu đơn chốt và số đơn chốt cho từng POS và từng nhân viên.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Copy, RotateCcw, RotateCw, Save, Target, X } from 'lucide-react';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { POS } from '@/lib/report-model';
import { todayVn } from '@/lib/report-time';
import { ChartCard, ErrorBox, InfoTip, SkeletonTable, TableWrap, Tooltip, money, posVar, toast, vi } from './ui-kit';

export type TargetItem = { scope: 'pos' | 'employee'; refId: string; revenue: number; closedOrders: number; workingDays?: number | null };
type Shift = { shiftStart: number | null; shiftEnd: number | null };
/** Số ngày trong tháng YYYY-MM (mặc định cho KPI ngày khi chưa nhập ngày làm việc). */
export const daysInMonth = (m: string) => new Date(Date.UTC(Number(m.slice(0, 4)), Number(m.slice(5, 7)), 0)).getUTCDate();
type Resp = { month: string; items: TargetItem[]; previous: { month: string; items: TargetItem[] } };
type Employee = { id: string; name: string; department: string | null; active: boolean };
const key = (scope: string, refId: string) => `${scope}:${refId}`;
const mmyyyy = (m: string) => `${m.slice(5)}/${m.slice(0, 4)}`;
const NUM_INPUT = 'num h-8 text-right';

/** Ô nhập tiền: gõ số thường (vd 2000000) hoặc "2tr", "1.5 tỷ". */
export function parseMoney(v: string) {
  const s = v.trim().toLowerCase().replace(/\s+/g, '').replace(/,/g, '.');
  const m = s.match(/^([\d.]+)(tr|triệu|trieu|m|tỷ|ty|b)$/);
  if (!m) return Math.round(Number(v.replace(/\D/g, '')) || 0); // số thường, chấp nhận dấu chấm ngăn hàng nghìn
  const n = Number(m[1]) || 0;
  return Math.round(n * (m[2] === 'tr' || m[2] === 'triệu' || m[2] === 'trieu' || m[2] === 'm' ? 1e6 : 1e9));
}

export function TargetsPanel({ canEdit }: { canEdit: boolean }) {
  const today = todayVn();
  const [month, setMonth] = useState(today.slice(0, 7));
  const [pendingMonth, setPendingMonth] = useState<string | null>(null);
  const [items, setItems] = useState<Record<string, TargetItem>>({});
  const [previous, setPrevious] = useState<Resp['previous'] | null>(null);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [department, setDepartment] = useState('all');
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [shifts, setShifts] = useState<Record<string, Shift>>({});
  const [shiftsDirty, setShiftsDirty] = useState(false);
  const loadShifts = useCallback(async () => {
    try {
      const r = await fetch('/api/staff-settings', { cache: 'no-store' });
      const b = r.ok ? await r.json() as { items: (Shift & { userId: string })[] } : { items: [] };
      setShifts(Object.fromEntries(b.items.map((i) => [i.userId, { shiftStart: i.shiftStart, shiftEnd: i.shiftEnd }])));
      setShiftsDirty(false);
    } catch { /* giữ ca hiện có */ }
  }, []);
  useEffect(() => { void loadShifts(); }, [loadShifts]);
  const setShift = (userId: string, field: keyof Shift, raw: string) => {
    const v = raw === '' ? null : Math.max(0, Math.min(field === 'shiftEnd' ? 24 : 23, Math.round(Number(raw) || 0)));
    setShifts((s) => ({ ...s, [userId]: { shiftStart: s[userId]?.shiftStart ?? null, shiftEnd: s[userId]?.shiftEnd ?? null, [field]: v } }));
    setShiftsDirty(true); setDirty(true);
  };

  useEffect(() => { void fetch('/api/employees').then((r) => r.ok ? r.json() as Promise<Employee[]> : []).then(setEmployees).catch(() => undefined); }, []);
  const load = useCallback(async () => {
    setError(null); setMessage(null);
    try {
      const r = await fetch(`/api/targets?month=${month}`, { cache: 'no-store' });
      const body = await r.json() as Resp & { error?: string };
      if (!r.ok) throw new Error(body.error ?? 'Không tải được mục tiêu.');
      setItems(Object.fromEntries(body.items.map((i) => [key(i.scope, i.refId), i])));
      setPrevious(body.previous); setDirty(false); setDraft({});
    } catch (e) { setError(e instanceof Error ? e.message : 'Không tải được mục tiêu.'); }
    finally { setLoaded(true); }
  }, [month]);
  useEffect(() => { void load(); }, [load]);
  // Rời trang / tải lại khi còn thay đổi chưa lưu: trình duyệt hỏi trước.
  useEffect(() => {
    if (!dirty) return;
    const onLeave = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener('beforeunload', onLeave);
    return () => window.removeEventListener('beforeunload', onLeave);
  }, [dirty]);

  const set = (scope: 'pos' | 'employee', refId: string, field: 'revenue' | 'closedOrders' | 'workingDays', value: number | null) => {
    setItems((s) => ({ ...s, [key(scope, refId)]: { scope, refId, revenue: s[key(scope, refId)]?.revenue ?? 0, closedOrders: s[key(scope, refId)]?.closedOrders ?? 0, workingDays: s[key(scope, refId)]?.workingDays ?? null, [field]: value } }));
    setDirty(true);
  };
  const save = async () => {
    setSaving(true); setError(null);
    try {
      const r = await fetch('/api/targets', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ month, items: Object.values(items) }) });
      const body = await r.json() as { error?: string };
      if (!r.ok) throw new Error(body.error ?? 'Không lưu được.');
      if (shiftsDirty) {
        const rs = await fetch('/api/staff-settings', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ items: Object.entries(shifts).map(([userId, s]) => ({ userId, ...s })) }) });
        if (!rs.ok) throw new Error(((await rs.json().catch(() => ({}))) as { error?: string }).error ?? 'Không lưu được ca làm việc.');
        setShiftsDirty(false);
      }
      setDirty(false); setMessage(null); toast(`Đã lưu mục tiêu tháng ${mmyyyy(month)}`);
    } catch (e) { setError(e instanceof Error ? e.message : 'Không lưu được.'); }
    finally { setSaving(false); }
  };
  const copyPrevious = () => {
    if (!previous?.items.length) return;
    setItems(Object.fromEntries(previous.items.map((i) => [key(i.scope, i.refId), { ...i }])));
    setDraft({}); setDirty(true); setMessage(`Đã sao chép từ tháng ${mmyyyy(previous.month)}, bấm Lưu để áp dụng.`);
  };
  const discard = () => { void load(); if (shiftsDirty) void loadShifts(); };
  // Đổi tháng khi còn thay đổi chưa lưu → hỏi trước (hộp thoại), không âm thầm xoá.
  const requestMonth = (v: string) => { if (!v || v === month) return; if (dirty) setPendingMonth(v); else setMonth(v); };
  const departments = useMemo(() => [...new Set(employees.map((e) => e.department).filter((d) => d && !/cskh|chăm sóc/i.test(d)))].sort() as string[], [employees]);
  useEffect(() => { const sale = departments.find((d) => /^sale$/i.test(d)) ?? departments.find((d) => /sale/i.test(d)); if (sale) setDepartment(sale); }, [departments]);
  // Bỏ tài khoản hệ thống của Pancake (API_CONNECTION…); mặc định hiện bộ phận Sale nếu có.
  const isSystem = (e: Employee) => /api[_ ]?connection|^api\b|webhook|system/i.test(e.name);
  // Nhân viên CSKH đặt KPI ở mục CSKH → KPI CSKH (theo đầu người), không hiện ở đây.
  const isCskh = (d: string | null) => /cskh|chăm sóc/i.test(d ?? '');
  const visibleEmployees = employees.filter((e) => !isSystem(e) && !isCskh(e.department) && (e.active || items[key('employee', e.id)])).filter((e) => department === 'all' || e.department === department)
    .sort((a, b) => a.name.localeCompare(b.name, 'vi'));
  const posTotal = POS.reduce((a, p) => a + (items[key('pos', p.id)]?.revenue ?? 0), 0);
  const posOrders = POS.reduce((a, p) => a + (items[key('pos', p.id)]?.closedOrders ?? 0), 0);
  const empTotal = employees.reduce((a, e) => a + (items[key('employee', e.id)]?.revenue ?? 0), 0);
  const visTotal = visibleEmployees.reduce((a, e) => a + (items[key('employee', e.id)]?.revenue ?? 0), 0);
  const visOrders = visibleEmployees.reduce((a, e) => a + (items[key('employee', e.id)]?.closedOrders ?? 0), 0);
  const dim = daysInMonth(month);
  const monthLabel = mmyyyy(month);

  const moneyInput = (scope: 'pos' | 'employee', refId: string, name: string) => {
    const k = key(scope, refId);
    const shown = draft[k] ?? (items[k]?.revenue ? vi.format(items[k].revenue) : '');
    return (
      <Input inputMode="numeric" className={`${NUM_INPUT} w-36`} placeholder="0" disabled={!canEdit} value={shown} aria-label={`Doanh thu mục tiêu ${name}`}
        onChange={(e) => setDraft((d) => ({ ...d, [k]: e.target.value }))}
        onBlur={(e) => { const v = parseMoney(e.target.value); set(scope, refId, 'revenue', v); setDraft((d) => { const n = { ...d }; delete n[k]; return n; }); }} />
    );
  };
  const ordersInput = (scope: 'pos' | 'employee', refId: string, name: string) => (
    <Input type="number" min={0} className={`${NUM_INPUT} w-24`} placeholder="0" disabled={!canEdit} value={items[key(scope, refId)]?.closedOrders || ''} aria-label={`Đơn chốt mục tiêu ${name}`}
      onChange={(e) => set(scope, refId, 'closedOrders', Math.max(0, Math.round(Number(e.target.value) || 0)))} />
  );

  return (
    <ChartCard icon={Target} title="Mục tiêu tháng" subtitle="KPI tháng cho từng POS và nhân viên. KPI ngày = mục tiêu ÷ số ngày làm việc (mặc định = số ngày của tháng). Ca làm việc theo giờ, đổi được bất kỳ lúc nào."
      action={
        <div className="flex flex-wrap items-center gap-2">
          <Input type="month" className="w-auto" aria-label="Tháng mục tiêu" value={month} onChange={(e) => requestMonth(e.target.value)} />
          {canEdit && (
            <Tooltip content={previous?.items.length ? `Chép mục tiêu của tháng ${mmyyyy(previous.month)} sang tháng này` : 'Tháng trước chưa có mục tiêu'}>
              <span className="inline-flex" tabIndex={previous?.items.length ? -1 : 0}><Button variant="outline" size="sm" onClick={copyPrevious} disabled={!previous?.items.length}><Copy size={14} />Sao chép tháng trước</Button></span>
            </Tooltip>
          )}
          {canEdit && dirty && <Button variant="ghost" size="sm" onClick={discard} disabled={saving}><RotateCcw size={14} />Hủy thay đổi</Button>}
          {canEdit && <Button size="sm" onClick={save} disabled={!dirty || saving}>{saving ? <RotateCw size={14} className="animate-spin" /> : <Save size={14} />}{saving ? 'Đang lưu…' : 'Lưu mục tiêu'}</Button>}
        </div>
      }>
      {error && <ErrorBox error={error} onRetry={() => void load()} className="mb-3" />}
      {message && <p className="notice info mb-3" role="status">{message}<button type="button" className="x" aria-label="Đóng" onClick={() => setMessage(null)}><X size={14} /></button></p>}
      {!canEdit && <p className="notice warn mb-3">Chỉ quản trị viên mới sửa được mục tiêu.</p>}
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        <div className="min-w-0">
          <h4 className="mb-2 text-[13.5px] font-semibold text-ink">Theo POS <span className="text-xs font-normal text-ink-3">· tổng <span className="num">{money(posTotal)}</span></span></h4>
          {!loaded ? <SkeletonTable rows={6} cols={3} /> : (
            <TableWrap minWidth={360}>
              <table className="tbl">
                <thead><tr><th>POS</th><th className="n">Doanh thu (₫)</th><th className="n">Đơn chốt</th></tr></thead>
                <tbody>
                  {POS.map((p) => (
                    <tr key={p.id}>
                      <td className="font-medium"><span className="mr-2 inline-block size-2.5 rounded-full align-middle" style={{ background: posVar(p.id) }} />{p.name}</td>
                      <td className="n">{moneyInput('pos', p.id, p.name)}</td>
                      <td className="n">{ordersInput('pos', p.id, p.name)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot><tr><td>Tổng · <span className="num">{POS.length}</span> POS</td><td className="n">{money(posTotal)}</td><td className="n">{vi.format(posOrders)}</td></tr></tfoot>
              </table>
            </TableWrap>
          )}
          <p className="mt-2 text-[11.5px] text-ink-3">Nhập số thường (2000000) hoặc viết tắt: <code className="num rounded-[4px] bg-surface-2 px-1">2tr</code>, <code className="num rounded-[4px] bg-surface-2 px-1">1.5 tỷ</code>.</p>
        </div>
        <div className="min-w-0">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <h4 className="text-[13.5px] font-semibold text-ink">Theo nhân viên <span className="text-xs font-normal text-ink-3">· tổng <span className="num">{money(empTotal)}</span> · <span className="num">{vi.format(visibleEmployees.length)}</span> người đang hiện</span></h4>
            <Select value={department} items={{ all: 'Tất cả bộ phận', ...Object.fromEntries(departments.map((d) => [d, d])) }} onValueChange={(v) => setDepartment(String(v))}>
              <SelectTrigger className="min-w-40 text-xs" aria-label="Lọc bộ phận"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="all">Tất cả bộ phận</SelectItem>{departments.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          {!loaded ? <SkeletonTable rows={6} cols={6} /> : (
            <TableWrap maxHeight="28rem" sticky minWidth={640}>
              <table className="tbl sticky-first">
                <thead><tr>
                  <th>Nhân viên</th><th>Bộ phận</th><th className="n">Doanh thu (₫)</th><th className="n">Đơn chốt</th>
                  <th className="n"><span className="inline-flex items-center gap-0.5">Ngày làm<InfoTip text="Số ngày làm việc trong tháng, để chia KPI ngày. Bỏ trống = số ngày của tháng." /></span></th>
                  <th><span className="inline-flex items-center gap-0.5">Ca (giờ)<InfoTip text="Ca làm việc: giờ bắt đầu – giờ kết thúc (0–24). Dùng ở Điều hành trong ca, chế độ Ca cá nhân." /></span></th>
                </tr></thead>
                <tbody>
                  {visibleEmployees.map((e) => (
                    <tr key={e.id}>
                      <td className="font-medium">{e.name}{!e.active && <span className="ml-1.5 rounded-[4px] bg-t-gray-bg px-1 py-px text-[10px] font-semibold text-t-gray">nghỉ</span>}</td>
                      <td className="mut text-xs">{e.department ?? '—'}</td>
                      <td className="n">{moneyInput('employee', e.id, e.name)}</td>
                      <td className="n">{ordersInput('employee', e.id, e.name)}</td>
                      <td className="n"><Input type="number" min={1} max={31} className={`${NUM_INPUT} w-16`} placeholder={String(dim)} disabled={!canEdit} aria-label={`Ngày làm việc ${e.name}`} value={items[key('employee', e.id)]?.workingDays ?? ''}
                        onChange={(ev) => set('employee', e.id, 'workingDays', ev.target.value === '' ? null : Math.max(1, Math.min(31, Math.round(Number(ev.target.value) || 0))))} /></td>
                      <td><span className="inline-flex items-center gap-1"><Input type="number" min={0} max={23} className={`${NUM_INPUT} w-14`} placeholder="8" disabled={!canEdit} aria-label={`Giờ bắt đầu ca ${e.name}`} value={shifts[e.id]?.shiftStart ?? ''} onChange={(ev) => setShift(e.id, 'shiftStart', ev.target.value)} /><span className="text-xs text-ink-3">–</span><Input type="number" min={1} max={24} className={`${NUM_INPUT} w-14`} placeholder="17" disabled={!canEdit} aria-label={`Giờ kết thúc ca ${e.name}`} value={shifts[e.id]?.shiftEnd ?? ''} onChange={(ev) => setShift(e.id, 'shiftEnd', ev.target.value)} /></span></td>
                    </tr>
                  ))}
                  {!visibleEmployees.length && <tr><td colSpan={6} className="py-6 text-center text-xs text-ink-3">Chưa có nhân viên (danh sách lấy từ Pancake sau khi đồng bộ).</td></tr>}
                </tbody>
                {visibleEmployees.length > 0 && <tfoot><tr><td className="bg-surface-2">Tổng · <span className="num">{vi.format(visibleEmployees.length)}</span> người</td><td /><td className="n">{money(visTotal)}</td><td className="n">{vi.format(visOrders)}</td><td /><td /></tr></tfoot>}
              </table>
            </TableWrap>
          )}
          <p className="mt-2 text-[11.5px] leading-relaxed text-ink-3">KPI của bộ phận CSKH đặt theo đầu người ở mục CSKH → KPI CSKH. Đối chiếu bằng doanh thu đơn chốt (đã bàn giao ĐVVC) của nhân viên trong tháng. KPI ngày hôm nay = doanh thu chốt trong ngày ÷ (mục tiêu ÷ ngày làm việc); ngày vượt 300% hay ngày 0% đều bình thường, KPI chấm theo tháng. Ca làm việc dùng ở trang Điều hành trong ca (chọn "Ca cá nhân").</p>
        </div>
      </div>

      <AlertDialog open={pendingMonth !== null} onOpenChange={(o) => { if (!o) setPendingMonth(null); }}>
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle>Bỏ thay đổi chưa lưu?</AlertDialogTitle>
            <AlertDialogDescription>Bạn đang sửa mục tiêu tháng {monthLabel} nhưng chưa bấm Lưu. Đổi sang tháng {pendingMonth ? mmyyyy(pendingMonth) : ''} sẽ mất các thay đổi này.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Ở lại</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={() => { if (pendingMonth) setMonth(pendingMonth); setPendingMonth(null); }}>Bỏ và đổi tháng</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </ChartCard>
  );
}

/** Tải mục tiêu một tháng thành bản đồ { 'pos:id' | 'employee:id' → mục tiêu } (dùng cho các trang báo cáo). */
export async function fetchTargets(month: string): Promise<Record<string, TargetItem>> {
  try {
    const r = await fetch(`/api/targets?month=${month}`, { cache: 'no-store' });
    if (!r.ok) return {};
    const body = await r.json() as Resp;
    return Object.fromEntries(body.items.map((i) => [key(i.scope, i.refId), i]));
  } catch { return {}; }
}
