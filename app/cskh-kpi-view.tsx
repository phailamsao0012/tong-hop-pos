'use client';

// KPI CSKH: mục tiêu tháng theo ĐẦU NGƯỜI cho bộ phận CSKH (không theo POS), kèm tiến độ tháng và KPI ngày.
// Chỉ chủ hệ thống xem và đặt được (menu, API GET/PUT đều chặn tài khoản khác).
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Copy, RotateCcw, RotateCw, Save, Target, TrendingUp, Users, Wallet, Wand2, X } from 'lucide-react';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { OrderOriginFilter, useOrderOrigin } from './order-origin-filter';
import { POS } from '@/lib/report-model';
import { todayVn } from '@/lib/report-time';
import { ChartCard, ErrorBox, InfoTip, KpiCard, PageHeader, ProgressBar, SkeletonTable, TableWrap, Tooltip, money, pct, short, toast, vi } from './ui-kit';
import { daysInMonth, parseMoney, type TargetItem } from './targets-panel';
import { useApi } from './use-api';
import { StaleChip } from './stale-chip';
import type { OverviewReport } from './overview-view';
type Report = OverviewReport & { current: OverviewReport['current'] & { byEmployeeDay: { sellerId: string; day: string; closedNet: number }[] } };

type Employee = { id: string; name: string; department: string | null; active: boolean };
type Shift = { shiftStart: number | null; shiftEnd: number | null };
type Resp = { month: string; items: TargetItem[]; previous: { month: string; items: TargetItem[] } };
const isSystem = (e: Employee) => /api[_ ]?connection|^api\b|webhook|system/i.test(e.name);
const lastDay = (m: string) => `${m}-${String(daysInMonth(m)).padStart(2, '0')}`;
const mmyyyy = (m: string) => `${m.slice(5)}/${m.slice(0, 4)}`;
const progressColor = (p: number) => p >= 100 ? 'var(--good)' : p >= 60 ? 'var(--t-lime)' : p >= 30 ? 'var(--warn)' : 'var(--bad)';
const dayTone = (p: number) => p >= 100 ? 'text-good' : p >= 50 ? 'text-warn' : 'text-bad';
const NUM_INPUT = 'num h-8 text-right';

export function CskhKpiView() {
  const today = todayVn();
  const { orderOrigin, marketerId } = useOrderOrigin('cskh');
  const [month, setMonth] = useState(today.slice(0, 7));
  const [pendingMonth, setPendingMonth] = useState<string | null>(null);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [items, setItems] = useState<Record<string, TargetItem>>({});
  const [previous, setPrevious] = useState<Resp['previous'] | null>(null);
  const [shifts, setShifts] = useState<Record<string, Shift>>({});
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [bulk, setBulk] = useState({ revenue: '', orders: '', days: '' });
  const [dirty, setDirty] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { void fetch('/api/employees?team=cskh', { cache: 'no-store' }).then((r) => r.ok ? r.json() as Promise<Employee[]> : []).then(setEmployees).catch(() => undefined); }, []);
  const loadShifts = useCallback(async () => {
    try {
      const r = await fetch('/api/staff-settings', { cache: 'no-store' });
      const b = r.ok ? await r.json() as { items: (Shift & { userId: string })[] } : { items: [] };
      setShifts(Object.fromEntries(b.items.map((i) => [i.userId, { shiftStart: i.shiftStart, shiftEnd: i.shiftEnd }])));
    } catch { /* giữ ca hiện có */ }
  }, []);
  useEffect(() => { void loadShifts(); }, [loadShifts]);
  const load = useCallback(async () => {
    setError(null); setMessage(null);
    try {
      const r = await fetch(`/api/targets?month=${month}`, { cache: 'no-store' });
      const body = await r.json() as Resp & { error?: string };
      if (!r.ok) throw new Error(body.error ?? 'Không tải được KPI.');
      setItems(Object.fromEntries(body.items.filter((i) => i.scope === 'employee').map((i) => [i.refId, i])));
      setPrevious(body.previous); setDirty(false); setDraft({});
    } catch (e) { setError(e instanceof Error ? e.message : 'Không tải được KPI.'); }
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
  // Tiến độ: doanh thu / đơn chốt của từng nhân viên CSKH trong tháng (tới hôm nay hoặc hết tháng); số lần trước hiện ngay (bản lưu trong trình duyệt).
  // Tháng tương lai: không tải (url null) và không hiện tiến độ. KPI đang sửa (items) vẫn tải riêng ở trên, không lấy từ bản lưu.
  const futureMonth = `${month}-01` > today;
  const progressUrl = useMemo(() => {
    if (futureMonth) return null;
    const end = month === today.slice(0, 7) ? today : lastDay(month);
    return `/api/reports/overview?${new URLSearchParams({ start: `${month}-01`, end, posIds: POS.map((p) => p.id).join(','), groupBy: 'day', compare: 'none', team: 'cskh', orderOrigin, marketerId })}`;
  }, [month, today, futureMonth, orderOrigin, marketerId]);
  const progress = useApi<Report>(progressUrl, { keep: false });
  const report = futureMonth ? null : progress.data;

  const staff = useMemo(() => employees.filter((e) => !isSystem(e) && (e.active || items[e.id])).sort((a, b) => a.name.localeCompare(b.name, 'vi')), [employees, items]);
  const set = (id: string, field: 'revenue' | 'closedOrders' | 'workingDays', value: number | null) => {
    setItems((s) => ({ ...s, [id]: { scope: 'employee', refId: id, revenue: s[id]?.revenue ?? 0, closedOrders: s[id]?.closedOrders ?? 0, workingDays: s[id]?.workingDays ?? null, [field]: value } }));
    setDirty(true);
  };
  const setShift = (id: string, field: keyof Shift, raw: string) => {
    const v = raw === '' ? null : Math.max(0, Math.min(field === 'shiftEnd' ? 24 : 23, Math.round(Number(raw) || 0)));
    setShifts((s) => ({ ...s, [id]: { shiftStart: s[id]?.shiftStart ?? null, shiftEnd: s[id]?.shiftEnd ?? null, [field]: v } }));
    setDirty(true);
  };
  const applyBulk = () => {
    const rev = bulk.revenue ? parseMoney(bulk.revenue) : null, ord = bulk.orders ? Math.max(0, Math.round(Number(bulk.orders) || 0)) : null, days = bulk.days ? Math.max(1, Math.min(31, Math.round(Number(bulk.days) || 0))) : null;
    if (rev === null && ord === null && days === null) return;
    setItems((s) => { const n = { ...s }; for (const e of staff) n[e.id] = { scope: 'employee', refId: e.id, revenue: rev ?? s[e.id]?.revenue ?? 0, closedOrders: ord ?? s[e.id]?.closedOrders ?? 0, workingDays: days ?? s[e.id]?.workingDays ?? null }; return n; });
    setDraft({}); setDirty(true); setMessage(`Đã áp cho ${staff.length} người, bấm Lưu để có hiệu lực.`);
  };
  const copyPrevious = () => {
    if (!previous?.items.length) return;
    const ids = new Set(staff.map((e) => e.id));
    setItems(Object.fromEntries(previous.items.filter((i) => i.scope === 'employee' && ids.has(i.refId)).map((i) => [i.refId, { ...i }])));
    setDraft({}); setDirty(true); setMessage(`Đã sao chép từ tháng ${mmyyyy(previous.month)}, bấm Lưu để áp dụng.`);
  };
  const save = async () => {
    setSaving(true); setError(null);
    try {
      const only = staff.map((e) => `employee:${e.id}`);
      const r = await fetch('/api/targets', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ month, only, items: staff.map((e) => items[e.id]).filter(Boolean) }) });
      const body = await r.json() as { error?: string };
      if (!r.ok) throw new Error(body.error ?? 'Không lưu được.');
      const rs = await fetch('/api/staff-settings', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ items: staff.map((e) => ({ userId: e.id, ...(shifts[e.id] ?? { shiftStart: null, shiftEnd: null }) })) }) });
      if (!rs.ok) throw new Error(((await rs.json().catch(() => ({}))) as { error?: string }).error ?? 'Không lưu được ca làm việc.');
      setDirty(false); setMessage(null); toast(`Đã lưu KPI CSKH tháng ${mmyyyy(month)}`);
    } catch (e) { setError(e instanceof Error ? e.message : 'Không lưu được.'); }
    finally { setSaving(false); }
  };
  const discard = () => { void load(); void loadShifts(); setBulk({ revenue: '', orders: '', days: '' }); };
  // Đổi tháng khi còn thay đổi chưa lưu → hỏi trước (hộp thoại), không âm thầm xoá.
  const requestMonth = (v: string) => { if (!v || v === month) return; if (dirty) setPendingMonth(v); else setMonth(v); };

  const dim = daysInMonth(month);
  const done = (id: string) => report?.current.byEmployee.find((r) => r.sellerId === id);
  const todayNet = (id: string) => (report?.current.byEmployeeDay ?? []).filter((d) => d.sellerId === id && d.day === today).reduce((a, d) => a + d.closedNet, 0);
  const totalGoal = staff.reduce((a, e) => a + (items[e.id]?.revenue ?? 0), 0);
  const totalDone = staff.reduce((a, e) => a + (done(e.id)?.closedNet ?? 0), 0);
  const withGoal = staff.filter((e) => items[e.id]?.revenue);
  const isCurrent = month === today.slice(0, 7);
  const daysElapsed = isCurrent ? Number(today.slice(8, 10)) : `${month}-01` > today ? 0 : dim;
  const onTrack = withGoal.filter((e) => { const g = items[e.id].revenue; const d = done(e.id)?.closedNet ?? 0; const elapsed = isCurrent ? Number(today.slice(8, 10)) : dim; return d / g >= elapsed / dim; }).length;
  const totalDaily = staff.reduce((a, e) => a + ((items[e.id]?.revenue ?? 0) / ((items[e.id]?.workingDays || dim))), 0);
  const totalTodayNet = staff.reduce((a, e) => a + todayNet(e.id), 0);
  const monthLabel = mmyyyy(month);

  const moneyInput = (id: string, name: string) => {
    const shown = draft[id] ?? (items[id]?.revenue ? vi.format(items[id].revenue) : '');
    return <Input inputMode="numeric" className={`${NUM_INPUT} w-28`} placeholder="0" value={shown} aria-label={`KPI doanh thu ${name}`}
      onChange={(e) => setDraft((d) => ({ ...d, [id]: e.target.value }))}
      onBlur={(e) => { set(id, 'revenue', parseMoney(e.target.value)); setDraft((d) => { const n = { ...d }; delete n[id]; return n; }); }} />;
  };

  return (
    <div className="space-y-5">
      <OrderOriginFilter team="cskh" marketers={report?.origins} />
      <PageHeader eyebrow="CSKH · chỉ chủ hệ thống" title="KPI CSKH" subtitle="Mục tiêu tháng theo đầu người cho bộ phận CSKH · KPI ngày = mục tiêu ÷ số ngày làm việc"
        badge={!futureMonth ? <StaleChip stale={progress.stale} at={progress.at} loading={progress.loading} error={report ? progress.error : null} onRetry={progress.reload} /> : null}
        actions={
<div className="flex flex-wrap items-center gap-2">
          <Input id="cskh-kpi-month" type="month" className="w-auto" aria-label="Tháng KPI" value={month} onChange={(e) => requestMonth(e.target.value)} />
          <Tooltip content={previous?.items.length ? `Chép KPI của tháng ${mmyyyy(previous.month)} sang tháng này` : 'Tháng trước chưa có KPI'}>
            <span className="inline-flex" tabIndex={previous?.items.length ? -1 : 0}><Button variant="outline" size="sm" onClick={copyPrevious} disabled={!previous?.items.length}><Copy size={14} />Sao chép tháng trước</Button></span>
          </Tooltip>
          {dirty && <Button variant="ghost" size="sm" onClick={discard} disabled={saving}><RotateCcw size={14} />Hủy thay đổi</Button>}
          <Button size="sm" onClick={save} disabled={!dirty || saving}>{saving ? <RotateCw size={14} className="animate-spin" /> : <Save size={14} />}{saving ? 'Đang lưu…' : 'Lưu KPI'}</Button>
        </div>} />
      {error && <ErrorBox error={error} onRetry={() => void load()} />}
      {message && <p className="notice info" role="status">{message}<button type="button" className="x" aria-label="Đóng" onClick={() => setMessage(null)}><X size={14} /></button></p>}

      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <KpiCard icon={Users} tone="green" label="Nhân viên CSKH" value={vi.format(staff.length)} countUp rawValue={staff.length} format={(n) => vi.format(Math.round(n))} note={`${withGoal.length} người đã có KPI`}
          tooltip={{ period: monthLabel, current: `${vi.format(staff.length)} người`, definition: 'Nhân viên bộ phận CSKH trên Pancake (đang làm việc, hoặc đã nghỉ nhưng còn KPI tháng này).' }} />
        <KpiCard icon={Target} tone="purple" label="Tổng KPI tháng" value={short(totalGoal)} unit="₫" countUp rawValue={totalGoal} format={short} note={`Trung bình ${withGoal.length ? `${short(totalGoal / withGoal.length)} ₫` : '—'} / người`}
          tooltip={{ period: monthLabel, current: money(totalGoal), definition: 'Tổng KPI doanh thu của mọi nhân viên CSKH trong tháng; trung bình tính trên người đã có KPI.' }} />
        <KpiCard icon={Wallet} tone="teal" label="Đã đạt (doanh thu chốt)" value={short(totalDone)} unit="₫" countUp rawValue={totalDone} format={short} note={totalGoal ? `${pct(totalDone / totalGoal * 100, 0)} KPI · ngày ${daysElapsed}/${dim}` : 'Chưa đặt KPI'} progress={totalGoal ? { value: totalDone, max: totalGoal } : undefined}
          tooltip={{ period: monthLabel, current: money(totalDone), previous: totalGoal ? money(totalGoal) : undefined, previousLabel: 'KPI tháng', definition: `Doanh thu đơn chốt (đơn đã xác nhận, sau giảm giá) của nhân viên CSKH từ đầu tháng tới hôm nay${totalGoal ? `, đạt ${pct(totalDone / totalGoal * 100, 1)} KPI` : ''}.` }} />
        <KpiCard icon={TrendingUp} tone={withGoal.length && onTrack / withGoal.length >= 0.5 ? 'green' : 'orange'} label="Đang đúng tiến độ" value={withGoal.length ? `${onTrack} / ${withGoal.length}` : '—'} note="Đạt ≥ phần KPI tương ứng số ngày đã qua"
          tooltip={{ period: monthLabel, current: withGoal.length ? `${onTrack} / ${withGoal.length} người` : '—', definition: `Người đã đạt ít nhất ${daysElapsed}/${dim} KPI tháng (tỷ lệ số ngày đã qua). Thẻ xanh khi từ nửa đội trở lên đúng tiến độ.` }} />
      </div>

      <ChartCard icon={Target} title={`KPI theo đầu người · ${monthLabel}`} subtitle="Doanh thu đơn chốt (đơn đã xác nhận, như Pancake) của từng nhân viên CSKH · nhập số thường (3000000) hoặc 3tr, 1.5 tỷ" loading={!loaded}
        action={<div className="flex flex-wrap items-center gap-1.5 rounded-xl border border-line bg-surface-2 px-2 py-1.5">
          <Wand2 size={14} className="text-primary" aria-hidden="true" /><span className="text-xs font-medium text-ink-2">Áp cho tất cả:</span>
          <Input id="cskh-bulk-revenue" inputMode="numeric" className={`${NUM_INPUT} h-7 w-24 text-xs`} placeholder="Doanh thu" aria-label="KPI doanh thu áp cho tất cả" value={bulk.revenue} onChange={(e) => setBulk((b) => ({ ...b, revenue: e.target.value }))} />
          <Input id="cskh-bulk-orders" type="number" min={0} className={`${NUM_INPUT} h-7 w-20 text-xs`} placeholder="Đơn" aria-label="KPI đơn chốt áp cho tất cả" value={bulk.orders} onChange={(e) => setBulk((b) => ({ ...b, orders: e.target.value }))} />
          <Input id="cskh-bulk-days" type="number" min={1} max={31} className={`${NUM_INPUT} h-7 w-24 text-xs`} placeholder={`Ngày · ${dim}`} aria-label="Số ngày làm việc áp cho tất cả" value={bulk.days} onChange={(e) => setBulk((b) => ({ ...b, days: e.target.value }))} />
          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={applyBulk} disabled={!bulk.revenue && !bulk.orders && !bulk.days}>Áp dụng</Button>
        </div>}>
        {!loaded ? <SkeletonTable rows={6} cols={9} /> : (
          <TableWrap maxHeight="36rem" sticky minWidth={760}>
            <table className="tbl sticky-first">
              <thead><tr>
                <th>Nhân viên</th><th className="n">KPI doanh thu</th><th className="n">KPI đơn</th>
                <th className="n"><span className="inline-flex items-center gap-0.5">Ngày làm<InfoTip text="Số ngày làm việc trong tháng, dùng để chia KPI ngày. Bỏ trống = số ngày của tháng." /></span></th>
                <th><span className="inline-flex items-center gap-0.5">Ca (giờ)<InfoTip text="Ca làm việc: giờ bắt đầu – giờ kết thúc (0–24). Dùng ở Điều hành trong ca, chế độ Ca cá nhân." /></span></th>
                <th className="n">Đã đạt</th><th>% tháng</th><th className="n">KPI ngày</th><th className="n">Hôm nay</th>
              </tr></thead>
              <tbody>
                {staff.map((e) => {
                  const t = items[e.id]; const d = done(e.id); const net = d?.closedNet ?? 0;
                  const days = t?.workingDays || dim; const daily = t?.revenue ? t.revenue / days : 0;
                  const p = t?.revenue ? net / t.revenue * 100 : null; const tn = todayNet(e.id); const dp = daily ? tn / daily * 100 : null;
                  return (
                    <tr key={e.id}>
                      <td className="font-medium">{e.name}{!e.active && <span className="ml-1.5 rounded-[4px] bg-t-gray-bg px-1 py-px text-[10px] font-semibold text-t-gray">nghỉ</span>}</td>
                      <td className="n">{moneyInput(e.id, e.name)}</td>
                      <td className="n"><Input type="number" min={0} className={`${NUM_INPUT} w-20`} placeholder="0" aria-label={`KPI đơn chốt ${e.name}`} value={t?.closedOrders || ''} onChange={(ev) => set(e.id, 'closedOrders', Math.max(0, Math.round(Number(ev.target.value) || 0)))} /></td>
                      <td className="n"><Input type="number" min={1} max={31} className={`${NUM_INPUT} w-16`} placeholder={String(dim)} aria-label={`Ngày làm việc ${e.name}`} value={t?.workingDays ?? ''} onChange={(ev) => set(e.id, 'workingDays', ev.target.value === '' ? null : Math.max(1, Math.min(31, Math.round(Number(ev.target.value) || 0))))} /></td>
                      <td><span className="inline-flex items-center gap-1"><Input type="number" min={0} max={23} className={`${NUM_INPUT} w-14`} placeholder="8" aria-label={`Giờ bắt đầu ca ${e.name}`} value={shifts[e.id]?.shiftStart ?? ''} onChange={(ev) => setShift(e.id, 'shiftStart', ev.target.value)} /><span className="text-xs text-ink-3">–</span><Input type="number" min={1} max={24} className={`${NUM_INPUT} w-14`} placeholder="17" aria-label={`Giờ kết thúc ca ${e.name}`} value={shifts[e.id]?.shiftEnd ?? ''} onChange={(ev) => setShift(e.id, 'shiftEnd', ev.target.value)} /></span></td>
                      <td className="n">{report ? money(net) : '—'}{d ? <span className="ml-1 text-[11px] font-normal text-ink-3">{vi.format(d.closedOrders)} đơn</span> : null}</td>
                      <td>{p === null ? <span className="text-xs text-ink-4">—</span> : <span className="inline-flex items-center gap-2"><ProgressBar value={Math.min(100, p)} max={100} width={80} color={progressColor(p)} /><span className="num text-xs">{pct(p, 0)}</span></span>}</td>
                      <td className="n mut text-xs">{daily ? `${short(daily)} ₫` : '—'}</td>
                      <td className="n">{dp === null || !isCurrent ? <span className="text-xs text-ink-4">—</span> : (
                        <Tooltip content={<><b>Hôm nay · {e.name}</b><span className="r"><span>Doanh thu chốt</span><span className="num">{money(tn)}</span></span><span className="r"><span>KPI ngày</span><span className="num">{money(daily)}</span></span><span className="how block">KPI ngày = {money(t.revenue)} ÷ {days} ngày</span></>}>
                          <span className={`num cursor-help text-xs ${dayTone(dp)}`} tabIndex={0}>{pct(dp, 0)}</span>
                        </Tooltip>
                      )}</td>
                    </tr>
                  );
                })}
                {!staff.length && <tr><td colSpan={9} className="py-6 text-center text-xs text-ink-3">Chưa có nhân viên CSKH (danh sách lấy từ bộ phận trên Pancake sau khi đồng bộ).</td></tr>}
              </tbody>
              {staff.length > 0 && <tfoot><tr>
                <td className="bg-surface-2">Tổng · <span className="num">{vi.format(staff.length)}</span> người</td><td className="n">{money(totalGoal)}</td><td className="n">{vi.format(staff.reduce((a, e) => a + (items[e.id]?.closedOrders ?? 0), 0))}</td><td /><td />
                <td className="n">{report ? money(totalDone) : '—'}</td><td className="num text-xs">{totalGoal ? pct(totalDone / totalGoal * 100, 0) : '—'}</td><td className="n text-xs">{totalGoal ? `${short(totalDaily)} ₫` : '—'}</td><td className="n text-xs">{isCurrent && totalGoal ? pct(totalTodayNet / totalDaily * 100, 0) : '—'}</td>
              </tr></tfoot>}
            </table>
          </TableWrap>
        )}
        <p className="mt-3 text-[11.5px] leading-relaxed text-ink-3">KPI đặt riêng cho từng người, không phụ thuộc POS. Đã đạt = doanh thu đơn chốt của nhân viên trong tháng (đơn đã xác nhận, không tính hủy). Hôm nay = doanh thu chốt hôm nay ÷ KPI ngày; ngày 300% hay 0% đều bình thường, chấm theo % tháng. Ca làm việc dùng ở Điều hành trong ca (chọn "Ca cá nhân").</p>
      </ChartCard>

      <AlertDialog open={pendingMonth !== null} onOpenChange={(o) => { if (!o) setPendingMonth(null); }}>
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle>Bỏ thay đổi chưa lưu?</AlertDialogTitle>
            <AlertDialogDescription>Bạn đang sửa KPI tháng {monthLabel} nhưng chưa bấm Lưu. Đổi sang tháng {pendingMonth ? mmyyyy(pendingMonth) : ''} sẽ mất các thay đổi này.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Ở lại</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={() => { if (pendingMonth) setMonth(pendingMonth); setPendingMonth(null); }}>Bỏ và đổi tháng</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
