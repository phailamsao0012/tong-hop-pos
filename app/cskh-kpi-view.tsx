'use client';

// KPI CSKH: mục tiêu tháng theo ĐẦU NGƯỜI cho bộ phận CSKH (không theo POS), kèm tiến độ tháng và KPI ngày.
// Chỉ chủ hệ thống xem và đặt được (menu, API GET/PUT đều chặn tài khoản khác).
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Copy, Save, Target, Users, Wand2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { POS } from '@/lib/report-model';
import { todayVn } from '@/lib/report-time';
import { ChartCard, ErrorBox, KpiCard, PageHeader, money, pct, short, vi } from './ui-kit';
import { daysInMonth, parseMoney, type TargetItem } from './targets-panel';
import type { OverviewReport } from './overview-view';
type Report = OverviewReport & { current: OverviewReport['current'] & { byEmployeeDay: { sellerId: string; day: string; closedNet: number }[] } };

type Employee = { id: string; name: string; department: string | null; active: boolean };
type Shift = { shiftStart: number | null; shiftEnd: number | null };
type Resp = { month: string; items: TargetItem[]; previous: { month: string; items: TargetItem[] } };
const isSystem = (e: Employee) => /api[_ ]?connection|^api\b|webhook|system/i.test(e.name);
const lastDay = (m: string) => `${m}-${String(daysInMonth(m)).padStart(2, '0')}`;

export function CskhKpiView() {
  const today = todayVn();
  const [month, setMonth] = useState(today.slice(0, 7));
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [items, setItems] = useState<Record<string, TargetItem>>({});
  const [previous, setPrevious] = useState<Resp['previous'] | null>(null);
  const [shifts, setShifts] = useState<Record<string, Shift>>({});
  const [report, setReport] = useState<Report | null>(null);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [bulk, setBulk] = useState({ revenue: '', orders: '', days: '' });
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { void fetch('/api/employees?team=cskh', { cache: 'no-store' }).then((r) => r.ok ? r.json() as Promise<Employee[]> : []).then(setEmployees).catch(() => undefined); }, []);
  useEffect(() => { void fetch('/api/staff-settings', { cache: 'no-store' }).then((r) => r.ok ? r.json() as Promise<{ items: (Shift & { userId: string })[] }> : { items: [] }).then((b) => setShifts(Object.fromEntries(b.items.map((i) => [i.userId, { shiftStart: i.shiftStart, shiftEnd: i.shiftEnd }])))).catch(() => undefined); }, []);
  const load = useCallback(async () => {
    setError(null); setMessage(null);
    try {
      const r = await fetch(`/api/targets?month=${month}`, { cache: 'no-store' });
      const body = await r.json() as Resp & { error?: string };
      if (!r.ok) throw new Error(body.error ?? 'Không tải được KPI.');
      setItems(Object.fromEntries(body.items.filter((i) => i.scope === 'employee').map((i) => [i.refId, i])));
      setPrevious(body.previous); setDirty(false); setDraft({});
    } catch (e) { setError(e instanceof Error ? e.message : 'Không tải được KPI.'); }
  }, [month]);
  useEffect(() => { void load(); }, [load]);
  // Tiến độ: doanh thu / đơn chốt của từng nhân viên CSKH trong tháng (tới hôm nay hoặc hết tháng).
  useEffect(() => {
    const end = month === today.slice(0, 7) ? today : lastDay(month);
    if (`${month}-01` > today) { setReport(null); return; }
    const c = new AbortController();
    void fetch(`/api/reports/overview?${new URLSearchParams({ start: `${month}-01`, end, posIds: POS.map((p) => p.id).join(','), groupBy: 'day', compare: 'none', team: 'cskh' })}`, { cache: 'no-store', signal: c.signal })
      .then((r) => r.ok ? r.json() as Promise<Report> : null).then((b) => { if (b) setReport(b); }).catch(() => undefined);
    return () => c.abort();
  }, [month, today]);

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
    setDraft({}); setDirty(true); setMessage(`Đã sao chép từ tháng ${previous.month.slice(5)}/${previous.month.slice(0, 4)}, bấm Lưu để áp dụng.`);
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
      setDirty(false); setMessage(`Đã lưu KPI CSKH tháng ${month.slice(5)}/${month.slice(0, 4)}.`);
    } catch (e) { setError(e instanceof Error ? e.message : 'Không lưu được.'); }
    finally { setSaving(false); }
  };

  const dim = daysInMonth(month);
  const done = (id: string) => report?.current.byEmployee.find((r) => r.sellerId === id);
  const todayNet = (id: string) => (report?.current.byEmployeeDay ?? []).filter((d) => d.sellerId === id && d.day === today).reduce((a, d) => a + d.closedNet, 0);
  const totalGoal = staff.reduce((a, e) => a + (items[e.id]?.revenue ?? 0), 0);
  const totalDone = staff.reduce((a, e) => a + (done(e.id)?.closedNet ?? 0), 0);
  const withGoal = staff.filter((e) => items[e.id]?.revenue);
  const onTrack = withGoal.filter((e) => { const g = items[e.id].revenue; const d = done(e.id)?.closedNet ?? 0; const elapsed = month === today.slice(0, 7) ? Number(today.slice(8, 10)) : dim; return d / g >= elapsed / dim; }).length;
  const daysElapsed = month === today.slice(0, 7) ? Number(today.slice(8, 10)) : `${month}-01` > today ? 0 : dim;

  const moneyInput = (id: string) => {
    const shown = draft[id] ?? (items[id]?.revenue ? vi.format(items[id].revenue) : '');
    return <Input inputMode="numeric" className="h-8 w-28 text-right" placeholder="0" value={shown} aria-label="Doanh thu mục tiêu"
      onChange={(e) => setDraft((d) => ({ ...d, [id]: e.target.value }))}
      onBlur={(e) => { set(id, 'revenue', parseMoney(e.target.value)); setDraft((d) => { const n = { ...d }; delete n[id]; return n; }); }} />;
  };

  return (
    <div className="space-y-5">
      <PageHeader eyebrow="CSKH · chỉ chủ hệ thống" title="KPI CSKH" subtitle="Mục tiêu tháng theo đầu người cho bộ phận CSKH · KPI ngày = mục tiêu ÷ số ngày làm việc"
        actions={<div className="flex flex-wrap items-center gap-2">
          <Input id="cskh-kpi-month" type="month" className="w-auto" value={month} onChange={(e) => e.target.value && setMonth(e.target.value)} />
          <Button variant="outline" size="sm" onClick={copyPrevious} disabled={!previous?.items.length} title={previous ? `Tháng ${previous.month}` : ''}><Copy size={14} />Sao chép tháng trước</Button>
          <Button size="sm" onClick={save} disabled={!dirty || saving}><Save size={14} />{saving ? 'Đang lưu…' : 'Lưu KPI'}</Button>
        </div>} />
      {error && <ErrorBox error={error} onRetry={() => void load()} />}
      {message && <p className="rounded-xl border border-[#b6e2bd] bg-[#e5f7e8] px-3 py-2 text-sm text-[#195b35]">{message}</p>}

      <div className="grid grid-cols-2 gap-2.5 sm:gap-4 xl:grid-cols-4">
        <KpiCard icon={Users} tone="green" label="Nhân viên CSKH" value={vi.format(staff.length)} note={`${withGoal.length} người đã có KPI`} />
        <KpiCard icon={Target} tone="purple" label="Tổng KPI tháng" value={money(totalGoal)} note={`Trung bình ${withGoal.length ? money(totalGoal / withGoal.length) : '—'} / người`} />
        <KpiCard icon={Target} tone="teal" label="Đã đạt (doanh thu chốt)" value={money(totalDone)} note={totalGoal ? `${pct(totalDone / totalGoal * 100, 0)} KPI · ngày ${daysElapsed}/${dim}` : 'Chưa đặt KPI'} />
        <KpiCard icon={Target} tone={withGoal.length && onTrack / withGoal.length >= 0.5 ? 'green' : 'orange'} label="Đang đúng tiến độ" value={withGoal.length ? `${onTrack} / ${withGoal.length}` : '—'} note="Đạt ≥ phần KPI tương ứng số ngày đã qua" />
      </div>

      <ChartCard icon={Target} title={`KPI theo đầu người · ${month.slice(5)}/${month.slice(0, 4)}`} subtitle="Doanh thu đơn chốt (đã bàn giao ĐVVC) của từng nhân viên CSKH · nhập số thường (3000000) hoặc 3tr, 1.5 tỷ"
        action={<div className="flex flex-wrap items-center gap-1.5 rounded-xl border bg-[#f8faf8] px-2 py-1.5">
          <Wand2 size={14} className="text-[#17684b]" /><span className="text-xs font-medium text-[#547467]">Áp cho tất cả:</span>
          <Input id="cskh-bulk-revenue" inputMode="numeric" className="h-7 w-24 text-right text-xs" placeholder="Doanh thu" value={bulk.revenue} onChange={(e) => setBulk((b) => ({ ...b, revenue: e.target.value }))} />
          <Input id="cskh-bulk-orders" type="number" min={0} className="h-7 w-20 text-right text-xs" placeholder="Đơn" value={bulk.orders} onChange={(e) => setBulk((b) => ({ ...b, orders: e.target.value }))} />
          <Input id="cskh-bulk-days" type="number" min={1} max={31} className="h-7 w-20 text-right text-xs" placeholder={`Ngày (${dim})`} value={bulk.days} onChange={(e) => setBulk((b) => ({ ...b, days: e.target.value }))} />
          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={applyBulk}>Áp dụng</Button>
        </div>}>
        <div className="max-h-[36rem] overflow-auto rounded-xl border">
          <table className="w-full text-sm [&_td]:px-2 [&_th]:px-2">
            <thead className="sticky top-0 bg-white text-left text-xs text-[#7d9184]"><tr>
              <th className="py-2">Nhân viên</th><th className="text-right">KPI doanh thu</th><th className="text-right">KPI đơn</th><th className="text-right" title="Số ngày làm việc trong tháng">Ngày làm</th><th title="Ca làm việc (giờ bắt đầu – kết thúc)">Ca (giờ)</th>
              <th className="text-right">Đã đạt</th><th>% tháng</th><th className="text-right">KPI ngày</th><th className="text-right">Hôm nay</th>
            </tr></thead>
            <tbody>
              {staff.map((e) => {
                const t = items[e.id]; const d = done(e.id); const net = d?.closedNet ?? 0;
                const days = t?.workingDays || dim; const daily = t?.revenue ? t.revenue / days : 0;
                const p = t?.revenue ? net / t.revenue * 100 : null; const tn = todayNet(e.id); const dp = daily ? tn / daily * 100 : null;
                return (
                  <tr key={e.id} className="border-t">
                    <td className="whitespace-nowrap py-1.5 font-medium">{e.name}<span className="ml-1.5 text-[10px] font-normal text-[#7d9184]">{e.active ? '' : 'nghỉ'}</span></td>
                    <td className="text-right">{moneyInput(e.id)}</td>
                    <td className="text-right"><Input type="number" min={0} className="h-8 w-20 text-right" placeholder="0" aria-label="KPI đơn chốt" value={t?.closedOrders || ''} onChange={(ev) => set(e.id, 'closedOrders', Math.max(0, Math.round(Number(ev.target.value) || 0)))} /></td>
                    <td className="text-right"><Input type="number" min={1} max={31} className="h-8 w-16 text-right" placeholder={String(dim)} aria-label="Ngày làm việc" value={t?.workingDays ?? ''} onChange={(ev) => set(e.id, 'workingDays', ev.target.value === '' ? null : Math.max(1, Math.min(31, Math.round(Number(ev.target.value) || 0))))} /></td>
                    <td className="whitespace-nowrap"><Input type="number" min={0} max={23} className="inline-block h-8 w-14 text-right" placeholder="8" aria-label="Giờ bắt đầu ca" value={shifts[e.id]?.shiftStart ?? ''} onChange={(ev) => setShift(e.id, 'shiftStart', ev.target.value)} /><span className="px-1 text-xs text-[#7d9184]">–</span><Input type="number" min={1} max={24} className="inline-block h-8 w-14 text-right" placeholder="17" aria-label="Giờ kết thúc ca" value={shifts[e.id]?.shiftEnd ?? ''} onChange={(ev) => setShift(e.id, 'shiftEnd', ev.target.value)} /></td>
                    <td className="whitespace-nowrap text-right font-medium">{report ? money(net) : '—'}<span className="ml-1 text-[11px] font-normal text-[#7d9184]">{d ? `${vi.format(d.closedOrders)} đơn` : ''}</span></td>
                    <td className="whitespace-nowrap">{p === null ? <span className="text-xs text-[#9db3a5]">—</span> : <><span className="mr-2 inline-block h-2 w-20 overflow-hidden rounded-full bg-[#eef1ee] align-middle"><span className="block h-2 rounded-full" style={{ width: `${Math.min(100, p)}%`, background: p >= 100 ? '#1a9c5b' : p >= 60 ? '#9bcf5a' : p >= 30 ? '#eda100' : '#d24b4b' }} /></span><span className="text-xs font-semibold">{pct(p, 0)}</span></>}</td>
                    <td className="whitespace-nowrap text-right text-xs text-[#547467]">{daily ? `${short(daily)} đ` : '—'}</td>
                    <td className="whitespace-nowrap text-right">{dp === null || month !== today.slice(0, 7) ? <span className="text-xs text-[#9db3a5]">—</span> : <span className={`text-xs font-semibold ${dp >= 100 ? 'text-[#1a7a48]' : dp >= 50 ? 'text-[#a36b00]' : 'text-[#c23a3a]'}`} title={`${money(tn)} / ${money(daily)}`}>{pct(dp, 0)}</span>}</td>
                  </tr>
                );
              })}
              {!staff.length && <tr><td colSpan={9} className="py-4 text-center text-xs text-[#7d9184]">Chưa có nhân viên CSKH (danh sách lấy từ bộ phận trên Pancake sau khi đồng bộ).</td></tr>}
              {staff.length > 0 && <tr className="border-t bg-[#f8faf8] font-semibold">
                <td className="py-2">Tổng · {vi.format(staff.length)} người</td><td className="whitespace-nowrap text-right">{money(totalGoal)}</td><td className="text-right">{vi.format(staff.reduce((a, e) => a + (items[e.id]?.closedOrders ?? 0), 0))}</td><td /><td />
                <td className="whitespace-nowrap text-right">{report ? money(totalDone) : '—'}</td><td className="text-xs">{totalGoal ? pct(totalDone / totalGoal * 100, 0) : '—'}</td><td className="whitespace-nowrap text-right text-xs">{totalGoal ? `${short(staff.reduce((a, e) => a + ((items[e.id]?.revenue ?? 0) / ((items[e.id]?.workingDays || dim))), 0))} đ` : '—'}</td><td className="whitespace-nowrap text-right text-xs">{month === today.slice(0, 7) && totalGoal ? pct(staff.reduce((a, e) => a + todayNet(e.id), 0) / staff.reduce((a, e) => a + ((items[e.id]?.revenue ?? 0) / ((items[e.id]?.workingDays || dim))), 0) * 100, 0) : '—'}</td>
              </tr>}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-xs text-[#7d9184]">KPI đặt riêng cho từng người, không phụ thuộc POS. Đã đạt = doanh thu đơn chốt của nhân viên trong tháng (đơn đã bàn giao ĐVVC). Hôm nay = doanh thu chốt hôm nay ÷ KPI ngày; ngày 300% hay 0% đều bình thường, chấm theo % tháng. Ca làm việc dùng ở Điều hành trong ca (chọn "Ca cá nhân").</p>
      </ChartCard>
    </div>
  );
}
