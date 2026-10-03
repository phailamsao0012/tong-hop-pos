'use client';

// Tiến độ KPI tháng của cả bộ phận, đặt đầu trang Tổng quan CSKH (yêu cầu 03/10/2026: vào CSKH phải thấy ngay doanh thu, KPI tới đâu, tiến độ).
// Cùng cách tính với trang KPI (cskh-kpi-view): KPI đặt theo đầu người, cộng cả đội; đã đạt = doanh thu đơn chốt của những người đó từ đầu tháng.
// Luôn theo tháng hiện tại, không theo bộ lọc ngày của trang. Chỉ chủ hệ thống (API /api/targets chặn người khác).
import { useEffect, useMemo, useState } from 'react';
import { ArrowRight, Target } from 'lucide-react';
import { POS } from '@/lib/report-model';
import type { Team } from '@/lib/team';
import { todayVn } from '@/lib/report-time';
import { useOrderOrigin } from './order-origin-filter';
import { daysInMonth, type TargetItem } from './targets-panel';
import { ChartCard, ErrorBox, SkeletonTable, money, pct, short, vi } from './ui-kit';
import { useApi } from './use-api';

type KpiTeam = Exclude<Team, 'all'>;
type Employee = { id: string; name: string; active: boolean };
type Row = { sellerId: string; closedNet: number; closedOrders: number };
type Report = { current: { byEmployee: Row[]; byEmployeeDay?: { sellerId: string; day: string; closedNet: number }[] } };
const isSystem = (e: Employee) => /api[_ ]?connection|^api\b|webhook|system/i.test(e.name);
const LABEL: Record<KpiTeam, string> = { cskh: 'CSKH', sale: 'Sale' };
const tone = (p: number) => p >= 100 ? 'var(--good)' : p >= 60 ? 'var(--t-lime)' : p >= 30 ? 'var(--warn)' : 'var(--bad)';

export function TeamKpiProgress({ team, focusId, onOpen }: { team: KpiTeam; focusId?: string | null; onOpen: () => void }) {
  const today = todayVn(), month = today.slice(0, 7), dim = daysInMonth(month), day = Number(today.slice(8, 10));
  const { orderOrigin, marketerId } = useOrderOrigin(team);
  const [employees, setEmployees] = useState<Employee[] | null>(null);
  useEffect(() => { void fetch(`/api/employees?team=${team}`, { cache: 'no-store' }).then((r) => r.ok ? r.json() as Promise<Employee[]> : []).then(setEmployees).catch(() => setEmployees([])); }, [team]);
  const targets = useApi<{ items: TargetItem[] }>(`/api/targets?month=${month}`);
  const report = useApi<Report>(useMemo(() => `/api/reports/overview?${new URLSearchParams({ start: `${month}-01`, end: today, posIds: POS.map((p) => p.id).join(','), groupBy: 'day', compare: 'none', team, orderOrigin, marketerId })}`, [month, today, team, orderOrigin, marketerId]));

  const goals = useMemo(() => new Map((targets.data?.items ?? []).filter((i) => i.scope === 'employee').map((i) => [i.refId, i])), [targets.data]);
  const staff = (employees ?? []).filter((e) => !isSystem(e) && (e.active || goals.has(e.id)) && (!focusId || e.id === focusId));
  const byId = new Map((report.data?.current.byEmployee ?? []).map((r) => [r.sellerId, r]));
  const goal = staff.reduce((a, e) => a + (goals.get(e.id)?.revenue ?? 0), 0);
  const goalOrders = staff.reduce((a, e) => a + (goals.get(e.id)?.closedOrders ?? 0), 0);
  const done = staff.reduce((a, e) => a + (byId.get(e.id)?.closedNet ?? 0), 0);
  const doneOrders = staff.reduce((a, e) => a + (byId.get(e.id)?.closedOrders ?? 0), 0);
  const ids = new Set(staff.map((e) => e.id));
  const todayNet = (report.data?.current.byEmployeeDay ?? []).filter((d) => d.day === today && ids.has(d.sellerId)).reduce((a, d) => a + d.closedNet, 0);
  const daily = staff.reduce((a, e) => { const g = goals.get(e.id); return a + (g?.revenue ? g.revenue / (g.workingDays || dim) : 0); }, 0);
  const withGoal = staff.filter((e) => goals.get(e.id)?.revenue);
  const onTrack = withGoal.filter((e) => (byId.get(e.id)?.closedNet ?? 0) / goals.get(e.id)!.revenue >= day / dim).length;
  const p = goal ? done / goal * 100 : 0, expected = day / dim * 100, should = goal * day / dim, gap = done - should;
  const daysLeft = dim - day + 1, need = Math.max(0, goal - done) / daysLeft;
  const loading = !employees || (!targets.data && targets.loading) || (!report.data && report.loading);
  const label = LABEL[team], monthLabel = `${month.slice(5)}/${month.slice(0, 4)}`;

  return (
    <ChartCard icon={Target} title={`KPI ${label} tháng ${monthLabel}`} subtitle={`Doanh thu đơn chốt từ đầu tháng so với KPI cả đội · ngày ${day}/${dim}${focusId ? ' · đang xem riêng một người' : ''}`}
      action={<button type="button" className="btn sm" onClick={onOpen}>KPI từng người<ArrowRight size={13} /></button>}>
      {targets.error && !targets.data ? <ErrorBox error={targets.error} onRetry={targets.reload} />
        : loading ? <SkeletonTable rows={2} cols={4} />
        : !goal ? (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-dashed border-line p-4">
            <div><div className="text-sm font-semibold text-ink">Tháng {monthLabel} chưa đặt KPI {label}</div><div className="text-xs text-ink-3">Đã chốt {money(done)} · {vi.format(doneOrders)} đơn từ đầu tháng. Đặt KPI để theo dõi tiến độ ở đây.</div></div>
            <button type="button" className="btn sm" onClick={onOpen}>Đặt KPI<ArrowRight size={13} /></button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-1">
              <div>
                <div className="text-xs font-semibold text-ink-2">Đã đạt</div>
                <div className="num text-3xl font-bold text-ink">{short(done)} ₫ <span className="text-base font-semibold text-ink-3">/ {short(goal)} ₫</span></div>
              </div>
              <div className="num text-3xl font-bold" style={{ color: tone(p / expected * 100) }}>{pct(p, 0)}</div>
            </div>
            <div className="relative" title={`Đúng tiến độ hôm nay: ${pct(expected, 0)} KPI`}>
              <div className="h-3 overflow-hidden rounded-full bg-surface-2"><i className="block h-full rounded-full transition-[width]" style={{ width: `${Math.min(100, p)}%`, background: tone(p / expected * 100) }} /></div>
              <span className="absolute -top-1 h-5 w-0.5 rounded bg-ink" style={{ left: `calc(${Math.min(100, expected)}% - 1px)` }} aria-hidden="true" />
              <div className="mt-1 flex justify-between text-[11px] text-ink-3"><span>0</span><span>Vạch đen = mức cần đạt tới hôm nay ({pct(expected, 0)})</span><span>{short(goal)} ₫</span></div>
            </div>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <Stat label="So với tiến độ" value={`${gap >= 0 ? 'Vượt' : 'Thiếu'} ${short(Math.abs(gap))} ₫`} tone={gap >= 0 ? 'text-good' : 'text-bad'} note={`Cần có ${short(should)} ₫ tới hôm nay`} />
              <Stat label="Cần mỗi ngày còn lại" value={goal > done ? `${short(need)} ₫` : 'Đã đạt KPI'} tone={goal > done ? 'text-ink' : 'text-good'} note={goal > done ? `Còn ${short(goal - done)} ₫ · ${daysLeft} ngày (tính cả hôm nay)` : `Vượt ${short(done - goal)} ₫`} />
              <Stat label="Hôm nay" value={`${short(todayNet)} ₫`} tone={daily && todayNet >= daily ? 'text-good' : 'text-ink'} note={daily ? `${pct(todayNet / daily * 100, 0)} KPI ngày (${short(daily)} ₫)` : '—'} />
              <Stat label="Đúng tiến độ" value={`${onTrack} / ${withGoal.length} người`} tone={withGoal.length && onTrack / withGoal.length >= 0.5 ? 'text-good' : 'text-warn'}
                note={goalOrders ? `Đơn chốt ${vi.format(doneOrders)} / ${vi.format(goalOrders)} KPI` : `${vi.format(doneOrders)} đơn chốt`} />
            </div>
          </div>
        )}
    </ChartCard>
  );
}

function Stat({ label, value, note, tone: t }: { label: string; value: string; note: string; tone: string }) {
  return (
    <div className="rounded-xl border border-line p-3">
      <div className="text-xs font-semibold text-ink-2">{label}</div>
      <div className={`num mt-1 text-lg font-bold ${t}`}>{value}</div>
      <div className="text-[11px] text-ink-3">{note}</div>
    </div>
  );
}
