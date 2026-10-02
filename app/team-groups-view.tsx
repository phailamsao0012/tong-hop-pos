'use client';

// Sale / CSKH theo team (01/10/2026): team, Leader, Trưởng phòng lấy từ web nhân sự; số liệu cộng từ cùng báo cáo Tổng quan bộ phận
// (doanh thu, đơn chốt, GTTB, tỷ lệ chốt theo từng nhân viên) nên khớp các trang khác. KPI tháng theo team chỉ chủ hệ thống xem và đặt.
import { Fragment, useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Crown, Save, Target, Trophy, Users, UsersRound, Wallet } from 'lucide-react';
import { closeRateOf, type RateBase } from '@/lib/metrics';
import { POS } from '@/lib/report-model';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { todayVn } from '@/lib/report-time';
import type { HrTeamGroup } from '@/lib/hr-teams';
import { usePeriod } from './period-store';
import { usePosIds } from './pos-store';
import { useMetricSettings } from './metric-settings';
import { PeriodToolbar, PosChips, type OverviewReport } from './overview-view';
import { GlobalStatusFilter } from './status-filter';
import { useApi } from './use-api';
import { StaleChip } from './stale-chip';
import { daysInMonth, parseMoney, type TargetItem } from './targets-panel';
import {
  ChartCard, EmptyState, ErrorBox, KpiCard, PageHeader, ProgressBar, SkeletonKpis, SkeletonTable, SortTh, TableWrap, delta, dmy, pct, shortMoney, toast, useSort, vi,
} from './ui-kit';

type Dept = 'sale' | 'cskh';
type Emp = OverviewReport['current']['byEmployee'][number];
type Sum = { revenue: number; closed: number; orders: number; assigned: number; assignedClosed: number; createdClosed: number; assignedHidden: boolean };
type Row = HrTeamGroup & { cur: Sum; prev: Sum | null; people: { id: string; name: string; isLeader: boolean; active: boolean; level: string | null; joinedOn: string | null; cur: Sum }[]; selling: number };
const LABEL: Record<Dept, string> = { sale: 'Sale', cskh: 'CSKH' };
const UNLINKED = 'unlinked';

const empty = (): Sum => ({ revenue: 0, closed: 0, orders: 0, assigned: 0, assignedClosed: 0, createdClosed: 0, assignedHidden: false });
const add = (s: Sum, e: Emp | undefined) => {
  if (!e) return s;
  s.revenue += e.closedNet; s.closed += e.closedOrders; s.orders += e.orders; s.assigned += e.assignedOrders ?? 0;
  const x = e as Emp & { assignedClosedOrders?: number; createdClosedOrders?: number };
  s.assignedClosed += x.assignedClosedOrders ?? e.closedOrders; s.createdClosed += x.createdClosedOrders ?? e.closedOrders; s.assignedHidden ||= !!e.assignedHidden;
  return s;
};
const rate = (s: Sum, base: RateBase) => closeRateOf({ orders: s.orders, closedOrders: s.closed, assignedOrders: s.assigned, assignedClosedOrders: s.assignedClosed, createdClosedOrders: s.createdClosed, assignedHidden: s.assignedHidden }, base);
const aov = (s: Sum) => s.closed ? s.revenue / s.closed : null;
/** Thâm niên từ ngày vào làm (hồ sơ nhân sự): "8 tháng", "1 năm 3 tháng". */
const tenure = (day: string | null) => {
  if (!day) return '—';
  const [y, m] = todayVn().split('-').map(Number), [y0, m0] = day.split('-').map(Number);
  const months = Math.max(0, (y - y0) * 12 + (m - m0));
  return months < 1 ? 'mới vào' : months < 12 ? `${months} tháng` : `${Math.floor(months / 12)} năm${months % 12 ? ` ${months % 12} tháng` : ''}`;
};

/** Gắn số liệu từng nhân viên vào team; ai có đơn mà chưa gắn hồ sơ nhân sự gom vào "Chưa gắn hồ sơ nhân sự". */
function buildRows(teams: HrTeamGroup[], cur: Emp[], prev: Emp[] | null): Row[] {
  const byId = new Map(cur.filter((e) => e.sellerId).map((e) => [e.sellerId, e]));
  const prevById = prev ? new Map(prev.filter((e) => e.sellerId).map((e) => [e.sellerId, e])) : null;
  const known = new Set(teams.flatMap((t) => t.members.map((m) => m.posUserId)));
  const unlinked = cur.filter((e) => e.sellerId && !known.has(e.sellerId) && (e.closedOrders || e.orders));
  const groups: HrTeamGroup[] = [...teams, ...(unlinked.length ? [{
    id: UNLINKED, name: 'Chưa gắn hồ sơ nhân sự', parent: null, office: null, leader: null, head: null,
    members: unlinked.map((e) => ({ posUserId: e.sellerId, name: e.name, level: null, title: null, isLeader: false, active: true, joinedOn: null })),
  }] : [])];
  return groups.map((t) => {
    const people = t.members.map((m) => ({ id: m.posUserId, name: m.name, isLeader: m.isLeader, active: m.active, level: m.level, joinedOn: m.joinedOn, cur: add(empty(), byId.get(m.posUserId)) }));
    return {
      ...t, people,
      cur: t.members.reduce((s, m) => add(s, byId.get(m.posUserId)), empty()),
      prev: prevById ? t.members.reduce((s, m) => add(s, prevById.get(m.posUserId)), empty()) : null,
      selling: people.filter((p) => p.cur.closed || p.cur.orders).length,
    };
  }).filter((r) => r.people.some((p) => p.active) || r.cur.closed || r.cur.orders);
}

export function TeamGroupsView({ team, owner }: { team: Dept; owner: boolean }) {
  const ms = useMetricSettings();
  const { preset, start, end, setPreset, setStart, setEnd } = usePeriod();
  const [posIds, setPosIds] = usePosIds();
  const q = useMemo(() => new URLSearchParams({ start, end, posIds: posIds.join(','), team }), [start, end, posIds, team]);
  // Cùng lời gọi với trang Tổng quan bộ phận (dùng chung bộ nhớ đệm, số khớp nhau).
  const api = useApi<OverviewReport>(useMemo(() => `/api/reports/overview?${q}&groupBy=day&compare=previous`, [q]));
  const teamsApi = useApi<{ teams: HrTeamGroup[]; linked: boolean }>(`/api/teams?team=${team}`);
  const report = api.data;
  const rows = useMemo(() => teamsApi.data && report ? buildRows(teamsApi.data.teams, report.current.byEmployee, report.compare?.byEmployee ?? null) : null, [teamsApi.data, report]);
  const total = rows?.reduce((s, r) => s + r.cur.revenue, 0) ?? 0;
  const sort = useSort<'name' | 'revenue' | 'share' | 'closed' | 'aov' | 'rate' | 'perHead' | 'people'>('revenue');
  const shown = useMemo(() => rows ? sort.apply(rows, (r, k) => k === 'name' ? r.name : k === 'revenue' || k === 'share' ? r.cur.revenue : k === 'closed' ? r.cur.closed
    : k === 'aov' ? aov(r.cur) : k === 'rate' ? rate(r.cur, ms.rateBase) : k === 'people' ? r.selling : r.selling ? r.cur.revenue / r.selling : null) : [], [rows, sort, ms.rateBase]);
  const [open, setOpen] = useState<string | null>(null);
  const teamsOnly = rows?.filter((r) => r.id !== 'none' && r.id !== UNLINKED) ?? [];
  const best = [...teamsOnly].sort((a, b) => b.cur.revenue - a.cur.revenue)[0];
  const loose = rows?.filter((r) => r.id === 'none' || r.id === UNLINKED).reduce((n, r) => n + r.people.filter((p) => p.active).length, 0) ?? 0;
  const error = api.error ?? teamsApi.error;

  return (
    <div className="space-y-5">
      <PageHeader eyebrow={`${dmy(start)}/${start.slice(0, 4)} – ${dmy(end)}/${end.slice(0, 4)}`} title={`${LABEL[team]} theo team`}
        subtitle={`So sánh các team ${LABEL[team]}: doanh thu, đơn chốt, tỷ lệ chốt, doanh thu mỗi người. Team, Leader, Trưởng phòng lấy từ web nhân sự.`}
        actions={<StaleChip stale={api.stale} at={api.at} loading={api.loading} error={report ? api.error : null} onRetry={api.reload} />} />
      <PeriodToolbar preset={preset} start={start} end={end} onPreset={setPreset} onStart={setStart} onEnd={setEnd} loading={api.loading} onReload={api.reload} extra={<GlobalStatusFilter size="md" />} />
      <PosChips posIds={posIds} onChange={setPosIds} info={report?.pos} />
      {error && !rows && <ErrorBox error={error} onRetry={() => { api.reload(); teamsApi.reload(); }} />}
      {teamsApi.data && !teamsApi.data.linked && <ErrorBox error="Chưa có dữ liệu team từ web nhân sự. Kiểm tra Cấu hình → Liên kết web nhân sự." />}
      {!rows && !error && <><SkeletonKpis count={4} /><ChartCard title="Các team" subtitle="Đang tải…"><SkeletonTable rows={5} cols={7} /></ChartCard></>}
      {rows && (
        <>
          <div className={`grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4 ${api.loading ? 'opacity-70' : ''}`}>
            <KpiCard icon={UsersRound} tone="blue" label="Số team" value={vi.format(teamsOnly.length)} note={`${vi.format(teamsOnly.reduce((n, r) => n + r.people.filter((p) => p.active).length, 0))} người đang làm trong team`} />
            <KpiCard icon={Wallet} tone="green" label={`Doanh thu ${LABEL[team]}`} value={shortMoney(total)} note="Cộng các team trong kỳ"
              delta={rows.every((r) => r.prev) ? delta(total, rows.reduce((s, r) => s + (r.prev?.revenue ?? 0), 0)) ?? undefined : undefined} />
            <KpiCard icon={Trophy} tone="orange" label="Team dẫn đầu" value={best ? best.name : '—'} note={best ? `${shortMoney(best.cur.revenue)}${total ? ` · ${pct(best.cur.revenue / total * 100, 0)} bộ phận` : ''}` : 'Chưa có số liệu'} />
            <KpiCard icon={Users} tone={loose ? 'red' : 'gray'} label="Chưa vào team" value={vi.format(loose)} note={loose ? 'Xếp team bên web nhân sự để tính đúng' : 'Mọi người đã có team'} />
          </div>

          <ChartCard icon={UsersRound} title="So sánh các team" subtitle={`Bấm vào team để xem từng người · ${dmy(start)} – ${dmy(end)}`}>
            {shown.length ? (
              <TableWrap minWidth={860} stickyFirst>
                <table className="tbl w-full">
                  <thead><tr>
                    <SortTh k="name" label="Team" sort={sort} align="left" />
                    <SortTh k="people" label={<span title="Người có đơn / người trong team · dòng từng người: thâm niên">Người có đơn</span>} sort={sort} />
                    <SortTh k="revenue" label="Doanh thu" sort={sort} />
                    <SortTh k="share" label="% bộ phận" sort={sort} />
                    <SortTh k="closed" label="Đơn chốt" sort={sort} />
                    <SortTh k="aov" label="GTTB" sort={sort} />
                    <SortTh k="rate" label="Tỷ lệ chốt" sort={sort} />
                    <SortTh k="perHead" label="DT / người" sort={sort} />
                  </tr></thead>
                  <tbody>
                    {shown.map((r) => {
                      const d = r.prev ? delta(r.cur.revenue, r.prev.revenue) : null;
                      const isOpen = open === r.id;
                      return (
                        <Fragment key={r.id}>
                          <tr className="cursor-pointer" onClick={() => setOpen(isOpen ? null : r.id)} aria-expanded={isOpen}>
                            <td>
                              <span className="flex items-start gap-1.5">
                                {isOpen ? <ChevronDown size={15} className="mt-0.5 shrink-0" /> : <ChevronRight size={15} className="mt-0.5 shrink-0" />}
                                <span className="min-w-0">
                                  <b className={`block font-semibold ${r.id === 'none' || r.id === UNLINKED ? 'text-bad' : ''}`}>{r.name}</b>
                                  <span className="block text-[11px] text-ink-3">{[r.office, r.leader ? `Leader ${r.leader}` : null, r.head ? `TP ${r.head}` : null].filter(Boolean).join(' · ') || (r.id === 'none' ? 'Đang nằm thẳng ở phòng, chưa xếp team' : r.id === UNLINKED ? 'Tài khoản POS chưa gắn với hồ sơ bên web nhân sự' : '—')}</span>
                                </span>
                              </span>
                            </td>
                            <td className="r num">{vi.format(r.selling)}<span className="text-ink-3">/{vi.format(r.people.filter((p) => p.active).length)}</span></td>
                            <td className="r num"><b>{shortMoney(r.cur.revenue)}</b>{d !== null && Number.isFinite(d) && <span className={`block text-[11px] ${d >= 0 ? 'text-good' : 'text-bad'}`}>{d >= 0 ? '+' : ''}{pct(d, 0)} so kỳ trước</span>}</td>
                            <td className="r num"><span className="flex items-center justify-end gap-2">{total ? pct(r.cur.revenue / total * 100, 0) : '—'}<ProgressBar value={r.cur.revenue} max={total || 1} width={56} size="sm" /></span></td>
                            <td className="r num">{vi.format(r.cur.closed)}</td>
                            <td className="r num">{shortMoney(aov(r.cur))}</td>
                            <td className="r num">{pct(rate(r.cur, ms.rateBase))}</td>
                            <td className="r num">{r.selling ? shortMoney(r.cur.revenue / r.selling) : '—'}</td>
                          </tr>
                          {isOpen && r.people.filter((p) => p.active || p.cur.closed || p.cur.orders).sort((a, b) => b.cur.revenue - a.cur.revenue).map((p) => (
                            <tr key={p.id} className="bg-surface-2/60 text-[13px]">
                              <td className="pl-8"><span className="flex items-center gap-1.5">{p.isLeader && <Crown size={13} className="text-warn" aria-label="Leader" />}{p.name}{!p.active && <span className="text-[11px] text-ink-3">(đã nghỉ)</span>}{p.level && <span className="text-[11px] text-ink-3">· {p.level}</span>}</span></td>
                              <td className="r num text-ink-3" title={p.joinedOn ? `Vào làm ${p.joinedOn.split('-').reverse().join('/')}` : 'Chưa có ngày vào trên web nhân sự'}>{tenure(p.joinedOn)}</td>
                              <td className="r num">{shortMoney(p.cur.revenue)}</td>
                              <td className="r num">{r.cur.revenue ? `${pct(p.cur.revenue / r.cur.revenue * 100, 0)} team` : '—'}</td>
                              <td className="r num">{vi.format(p.cur.closed)}</td>
                              <td className="r num">{shortMoney(aov(p.cur))}</td>
                              <td className="r num">{pct(rate(p.cur, ms.rateBase))}</td>
                              <td />
                            </tr>
                          ))}
                        </Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </TableWrap>
            ) : <EmptyState text="Chưa có team nào có số liệu trong kỳ này." />}
          </ChartCard>
          {owner && <TeamKpi team={team} teams={teamsOnly} />}
        </>
      )}
    </div>
  );
}

/** KPI tháng theo team (chủ hệ thống): đặt doanh thu / đơn chốt mục tiêu, xem tiến độ từ đầu tháng và dự báo cuối tháng. */
function TeamKpi({ team, teams }: { team: Dept; teams: Row[] }) {
  const today = todayVn();
  const [month, setMonth] = useState(today.slice(0, 7));
  const last = `${month}-${String(daysInMonth(month)).padStart(2, '0')}`;
  const end = last < today ? last : today;
  const elapsed = month < today.slice(0, 7) ? daysInMonth(month) : Math.max(1, Number(today.slice(8, 10)));
  const monthApi = useApi<OverviewReport>(month <= today.slice(0, 7)
    ? `/api/reports/overview?${new URLSearchParams({ start: `${month}-01`, end, posIds: POS.map((p) => p.id).join(','), team })}`
    : null);
  const [items, setItems] = useState<TargetItem[] | null>(null);
  const [draft, setDraft] = useState<Record<string, { revenue: string; closed: string }>>({});
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    setItems(null); setDraft({}); setErr(null);
    fetch(`/api/targets?month=${month}`, { cache: 'no-store' }).then(async (r) => {
      const b = await r.json() as { items?: TargetItem[]; error?: string };
      if (!r.ok) throw new Error(b.error ?? 'Không tải được KPI.');
      if (live) setItems(b.items ?? []);
    }).catch((e: Error) => { if (live) setErr(e.message); });
    return () => { live = false; };
  }, [month]);
  const target = (id: string) => items?.find((i) => i.scope === 'team' && i.refId === id);
  const personal = (t: Row) => (items ?? []).filter((i) => i.scope === 'employee' && t.people.some((p) => p.id === i.refId))
    .reduce((s, i) => ({ revenue: s.revenue + i.revenue, closed: s.closed + i.closedOrders }), { revenue: 0, closed: 0 });
  const done = useMemo(() => {
    const byId = new Map((monthApi.data?.current.byEmployee ?? []).map((e) => [e.sellerId, e]));
    return new Map(teams.map((t) => [t.id, t.people.reduce((s, p) => add(s, byId.get(p.id)), empty())]));
  }, [monthApi.data, teams]);
  const val = (t: Row, k: 'revenue' | 'closed') => draft[t.id]?.[k] ?? String((k === 'revenue' ? target(t.id)?.revenue : target(t.id)?.closedOrders) || '');
  const set = (id: string, k: 'revenue' | 'closed', v: string) => setDraft((d) => ({ ...d, [id]: { revenue: d[id]?.revenue ?? val(teams.find((t) => t.id === id)!, 'revenue'), closed: d[id]?.closed ?? val(teams.find((t) => t.id === id)!, 'closed'), [k]: v } }));
  const save = async () => {
    setSaving(true); setErr(null);
    try {
      const list = teams.map((t) => ({ scope: 'team' as const, refId: t.id, revenue: parseMoney(val(t, 'revenue')), closedOrders: Number(val(t, 'closed').replace(/\D/g, '')) || 0 }));
      const r = await fetch('/api/targets', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ month, only: teams.map((t) => `team:${t.id}`), items: list }) });
      const b = await r.json() as { items?: TargetItem[]; error?: string };
      if (!r.ok) throw new Error(b.error ?? 'Không lưu được.');
      setItems(b.items ?? []); setDraft({}); toast(`Đã lưu KPI team ${LABEL[team]} tháng ${month.slice(5)}/${month.slice(0, 4)}`);
    } catch (e) { setErr(e instanceof Error ? e.message : 'Không lưu được.'); } finally { setSaving(false); }
  };
  const dirty = Object.keys(draft).length > 0;

  return (
    <ChartCard icon={Target} title={`KPI tháng theo team ${LABEL[team]}`} subtitle="Chỉ chủ hệ thống xem và đặt · tiến độ tính từ đầu tháng, mọi POS"
      action={<span className="flex items-center gap-2">
        <Input type="month" className="h-8 w-40 text-[13px]" value={month} onChange={(e) => e.target.value && setMonth(e.target.value)} aria-label="Tháng" />
        <Button size="sm" disabled={!dirty || saving} onClick={() => void save()}><Save size={14} />{saving ? 'Đang lưu…' : 'Lưu'}</Button>
      </span>}>
      {err && <ErrorBox error={err} />}
      {!items ? <SkeletonTable rows={4} cols={6} /> : teams.length ? (
        <TableWrap minWidth={820}>
          <table className="tbl w-full">
            <thead><tr><th className="text-left">Team</th><th className="r">DT mục tiêu</th><th className="r">Đơn mục tiêu</th><th className="r">Đã đạt</th><th className="r">Tiến độ</th><th className="r">Dự báo cuối tháng</th><th className="r">Tổng KPI cá nhân</th></tr></thead>
            <tbody>
              {teams.map((t) => {
                const goal = parseMoney(val(t, 'revenue')), goalClosed = Number(val(t, 'closed').replace(/\D/g, '')) || 0;
                const d = done.get(t.id) ?? empty();
                const p = goal ? d.revenue / goal * 100 : null;
                const forecast = d.revenue / elapsed * daysInMonth(month);
                const pers = personal(t);
                return (
                  <tr key={t.id}>
                    <td><b className="font-semibold">{t.name}</b><span className="block text-[11px] text-ink-3">{t.leader ? `Leader ${t.leader}` : ''}</span></td>
                    <td className="r"><Input className="num ml-auto h-8 w-32 text-right" inputMode="numeric" value={val(t, 'revenue')} placeholder="vd 500tr" onChange={(e) => set(t.id, 'revenue', e.target.value)} aria-label={`Doanh thu mục tiêu ${t.name}`} /></td>
                    <td className="r"><Input className="num ml-auto h-8 w-20 text-right" inputMode="numeric" value={val(t, 'closed')} onChange={(e) => set(t.id, 'closed', e.target.value)} aria-label={`Đơn chốt mục tiêu ${t.name}`} /></td>
                    <td className="r num">{monthApi.data ? <>{shortMoney(d.revenue)}<span className="block text-[11px] text-ink-3">{vi.format(d.closed)}{goalClosed ? `/${vi.format(goalClosed)}` : ''} đơn</span></> : '…'}</td>
                    <td className="r num"><span className="flex items-center justify-end gap-2">{pct(p, 0)}<ProgressBar value={d.revenue} max={goal || 1} width={64} size="sm" color={p === null ? undefined : p >= 100 ? 'var(--good)' : p >= elapsed / daysInMonth(month) * 100 ? 'var(--t-lime)' : 'var(--warn)'} /></span></td>
                    <td className="r num">{monthApi.data ? <>{shortMoney(forecast)}{goal ? <span className={`block text-[11px] ${forecast >= goal ? 'text-good' : 'text-bad'}`}>{pct(forecast / goal * 100, 0)} mục tiêu</span> : null}</> : '…'}</td>
                    <td className="r num">{pers.revenue ? <button type="button" className="text-primary underline-offset-2 hover:underline" title="Dùng tổng KPI cá nhân làm KPI team" onClick={() => setDraft((x) => ({ ...x, [t.id]: { revenue: String(pers.revenue), closed: String(pers.closed || '') } }))}>{shortMoney(pers.revenue)}</button> : <span className="text-ink-3">—</span>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </TableWrap>
      ) : <EmptyState text="Chưa có team nào. Xếp team bên web nhân sự trước." />}
      <p className="mt-2 text-[12px] text-ink-3">Doanh thu đã đạt = doanh thu đơn chốt của người trong team từ đầu tháng tới hôm nay. Dự báo = đã đạt ÷ số ngày đã qua × số ngày trong tháng. Bấm số ở cột “Tổng KPI cá nhân” để lấy làm KPI team.</p>
    </ChartCard>
  );
}
