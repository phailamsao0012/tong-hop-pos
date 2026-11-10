'use client';

// KPI team (Giao việc, anh Vũ 28/10/2026): KPI doanh thu, trung bình đơn, tỉ lệ chốt cho CẢ TEAM; leader tự chia cho nhân sự, web không chia.
// KPI lưu chung một chỗ với trang KPI → Theo team và tiến độ KPI ở Tổng quan (bảng targets + app_settings target_rate / target_aov), không có
// chỗ lưu thứ hai. Chủ hệ thống đặt KPI team; leader / mentor chỉ xem KPI team mình cầm để tự chia cho từng người (anh Vũ 05/11/2026,
// API /api/targets trả dòng team và danh sách team của người xem).
// Bộ phận, chi nhánh, team: dùng nút Tất cả / Sale / CSKH và chi nhánh ở thanh trên cùng (team-store), không vẽ nút riêng.
// Mở phần tổng quan trước, ô đặt KPI sau, chữ giải thích cuối trang. Cách quy KPI tháng về kỳ: lib/kpi/team-kpi.ts.
import { useEffect, useId, useMemo, useState } from 'react';
import { Pencil, Save, Target } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { parseRate } from '@/lib/kpi/kpi-pace';
import {
  QUICK_PERIODS, elapsedShare, matchQuick, monthsBetween, percentOf, periodLabel, periodTarget, quickPeriod, teamActual, validPeriod,
  type Period, type PeriodKpi, type TeamActual,
} from '@/lib/kpi/team-kpi';
import { POS } from '@/lib/shared/report-model';
import { todayVn } from '@/lib/shared/report-time';
import type { HrTeamGroup } from '@/lib/teams/hr-teams';
import { apiJson } from './api-fetch';
import { useMetricSettings } from './metric-settings';
import type { OverviewReport } from './overview-view';
import { setPeriodRange } from './period-store';
import { setPosIds } from './pos-store';
import { parseMoney, type TargetItem } from './targets-panel';
import { setHrUnit, useBranch, useHrUnit, useTeamChoice } from './team-store';
import { ChartCard, Definitions, EmptyState, ErrorBox, SkeletonTable, pct, shortMoney, toast, vi } from './ui-kit';
import { useApi } from './use-api';
import { Kpi2Panel, ProductQtyCard } from './kpi2-panel';

type Dept = 'sale' | 'cskh';
const LABEL: Record<Dept, string> = { sale: 'Sale', cskh: 'CSKH' };
type Team = { id: string; name: string; leader: string | null; ids: string[]; members: { id: string; name: string }[] };
type Target = TargetItem & { aov?: number | null };
type TargetsResp = { items: Target[]; teams?: string[] | null };
type Field = 'revenue' | 'aov' | 'rate';
type Branches = { offices: { id: string; name: string }[]; teams: { id: string; officeId: string }[] };
const mmyyyy = (m: string) => `${m.slice(5)}/${m.slice(0, 4)}`;
const dmy = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`;
/** Ô tiền: "450k", "450.000", "1,2tr", "500tr" → đồng. */
const parseAmount = (v: string) => {
  const k = v.trim().toLowerCase().replace(/\s+/g, '').match(/^([\d.,]+)(k|nghìn|nghin|ngàn|ngan)$/);
  return k ? Math.round((Number(k[1].replace(/\./g, '').replace(',', '.')) || 0) * 1000) : parseMoney(v);
};

/** Vạch tiến độ doanh thu: phần đã đạt và vạch đen "đúng tiến độ" (phần kỳ đã qua). */
function PaceBar({ p, pace }: { p: number | null; pace: number }) {
  const ahead = (p ?? 0) >= pace * 100;
  return (
    <div className="relative mt-1.5" title={`Đúng tiến độ: ${pct(pace * 100, 0)} KPI`}>
      <div className="h-2 overflow-hidden rounded-full bg-surface-2">
        <i className="block h-full rounded-full" style={{ width: `${Math.min(100, Math.max(0, p ?? 0))}%`, background: ahead ? 'var(--good)' : 'var(--warn)' }} />
      </div>
      {pace > 0 && pace < 1 && <span className="absolute -top-0.5 h-3 w-0.5 rounded bg-ink" style={{ left: `calc(${pace * 100}% - 1px)` }} aria-hidden="true" />}
    </div>
  );
}

/** Một dòng chỉ số: số thật / KPI kỳ · % đạt. pace = chỉ số cộng dồn (doanh thu), so với tiến độ thay vì 100%. onOpen: bấm số mở trang tính ra số. */
function KpiLine({ label, value, goal, p, pace, onOpen }: { label: string; value: string; goal: string | null; p: number | null; pace?: number; onOpen?: () => void }) {
  const ok = p !== null && p >= (pace === undefined ? 100 : Math.min(100, pace * 100));
  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-x-2 text-[13px]">
        <span className="text-ink-2">{label}</span>
        <span className="num font-semibold text-ink">
          {onOpen
            ? <button type="button" className="font-semibold underline-offset-2 hover:text-primary hover:underline" title="Mở Tổng quan của team này, cùng kỳ, mọi POS" onClick={onOpen}>{value}</button>
            : value}
          <span className="font-normal text-ink-3"> / {goal ?? 'chưa đặt KPI'}</span>
          {p !== null && <span className={`ml-1.5 ${ok ? 'text-good' : 'text-warn'}`}>{pct(p, 0)}</span>}
        </span>
      </div>
      {pace !== undefined && goal !== null && <PaceBar p={p} pace={pace} />}
    </div>
  );
}

function TeamCard({ team, actual, goal, sale, pace, onOpen }: { team: Team; actual: TeamActual | null; goal: PeriodKpi; sale: boolean; pace: number; onOpen?: () => void }) {
  return (
    <article className="rounded-xl border border-line bg-surface p-3">
      <header className="mb-2 flex flex-wrap items-baseline justify-between gap-x-2">
        <h4 className="text-sm font-semibold text-ink">{team.name}</h4>
        {team.leader && <span className="text-[11px] text-ink-3">Leader {team.leader}</span>}
      </header>
      <div className="space-y-2">
        <KpiLine label="Doanh thu đơn chốt" value={actual ? shortMoney(actual.revenue) : '—'} goal={goal.revenue === null ? null : shortMoney(goal.revenue)}
          p={actual ? percentOf(actual.revenue, goal.revenue) : null} pace={pace} onOpen={actual ? onOpen : undefined} />
        <KpiLine label="TB đơn chốt" value={actual?.aov == null ? '—' : shortMoney(actual.aov)} goal={goal.aov === null ? null : shortMoney(goal.aov)}
          p={actual ? percentOf(actual.aov, goal.aov) : null} onOpen={actual ? onOpen : undefined} />
        {sale && (
          <KpiLine label="Tỉ lệ chốt" value={actual ? pct(actual.closeRate, 1) : '—'} goal={goal.closeRate === null ? null : pct(goal.closeRate, 1)}
            p={actual ? percentOf(actual.closeRate, goal.closeRate) : null} onOpen={actual ? onOpen : undefined} />
        )}
      </div>
      <p className="mt-2 text-[11px] text-ink-3">{actual ? `${vi.format(actual.orders)} đơn chốt · ${actual.people}/${team.ids.length} người có đơn trong kỳ` : 'Kỳ chưa tới, chưa có số'}</p>
    </article>
  );
}

/** Số cộng các team không có KPI riêng (TB đơn, tỉ lệ chốt đặt theo từng team). */
function SumStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-surface-2 p-3 text-[13px]">
      <div className="flex flex-wrap items-baseline justify-between gap-x-2"><span className="text-ink-2">{label}</span><span className="num font-semibold text-ink">{value}</span></div>
      <p className="mt-0.5 text-[11px] text-ink-3">KPI đặt riêng từng team</p>
    </div>
  );
}

function AmountField({ id, label, value, onChange, placeholder, inputMode = 'numeric' }: {
  id: string; label: string; value: string; onChange: (v: string) => void; placeholder: string; inputMode?: 'numeric' | 'decimal';
}) {
  return (
    <label htmlFor={id} className="flex min-w-0 flex-col gap-1 text-[12px] text-ink-2">
      {label}
      <Input id={id} className="num h-9 text-right" inputMode={inputMode} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}

/** Danh sách team và số thật của một bộ phận trong kỳ (url null = không tải). */
function useDept(enabled: boolean, dept: Dept, reportUrl: string | null) {
  const teams = useApi<{ teams: HrTeamGroup[] }>(enabled ? `/api/teams?team=${dept}` : null, { keep: false });
  // keep: false — đổi kỳ / bộ phận thì không hiện số của kỳ cũ trong lúc chờ.
  const report = useApi<OverviewReport>(enabled ? reportUrl : null, { keep: false });
  return { dept, teams, report };
}

export function GiaoViecKpiView({ owner, onOpen }: { owner: boolean; onOpen?: (view: 'sale-overview' | 'cskh-overview') => void }) {
  const today = todayVn(), uid = useId();
  const choice = useTeamChoice(), branch = useBranch(), unit = useHrUnit();
  const [period, setPeriod] = useState<Period>(() => quickPeriod('month', today));
  const ms = useMetricSettings();
  const ok = validPeriod(period), future = ok && period.start > today, end = period.end < today ? period.end : today;
  const monthsKey = ok ? monthsBetween(period.start, period.end).join(',') : '';
  const months = useMemo(() => (monthsKey ? monthsKey.split(',') : []), [monthsKey]);
  const reportUrl = (dept: Dept) => (ok && !future
    ? `/api/reports/overview?${new URLSearchParams({ start: period.start, end, posIds: POS.map((p) => p.id).join(','), team: dept, compare: 'none' })}`
    : null);
  const depts = [useDept(choice !== 'cskh', 'sale', reportUrl('sale')), useDept(choice !== 'sale', 'cskh', reportUrl('cskh'))]
    .filter((d) => (d.dept === 'sale' ? choice !== 'cskh' : choice !== 'sale'));

  // Chi nhánh / team chọn ở thanh trên: chỉ hiện team thuộc phạm vi đó.
  const branches = useApi<Branches>(branch ? '/api/reports/overview?branches=1' : null);
  const picked = unit && !unit.branchOnly ? unit : null;
  const scopeReady = !branch || !!branches.data;
  // Người không phải chủ: chỉ team mình cầm (máy chủ trả danh sách).
  const [mine, setMine] = useState<string[] | null>(null);
  const inScope = (id: string) => (!owner && !mine?.includes(id) ? false : picked ? picked.id.split(',').includes(id) : branch ? !!branches.data?.teams.some((t) => t.id === id && t.officeId === branch) : true);
  const scopeName = picked ? picked.name : branch ? branches.data?.offices.find((o) => o.id === branch)?.name ?? '' : '';
  const teamsOf = (d: (typeof depts)[number]): Team[] => (d.teams.data?.teams ?? []).filter((t) => t.id !== 'none' && t.id !== 'unlinked' && inScope(t.id))
    .map((t) => ({ id: t.id, name: t.name, leader: t.leader, ids: t.members.map((m) => m.posUserId), members: t.members.map((m) => ({ id: m.posUserId, name: m.name })) }));

  // KPI các tháng của kỳ (mỗi tháng một lần đọc /api/targets).
  const [targets, setTargets] = useState<Record<string, Target[]>>({});
  const [targetError, setTargetError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);
  useEffect(() => {
    if (!monthsKey) return;
    let live = true;
    void Promise.all(monthsKey.split(',').map((m) => apiJson<TargetsResp>(`/api/targets?month=${m}`).then((b) => [m, b] as const)))
      .then((list) => {
        if (!live) return;
        setTargets((x) => ({ ...x, ...Object.fromEntries(list.map(([m, b]) => [m, b.items])) }));
        setMine(list[0]?.[1].teams ?? null); setTargetError('');
      })
      .catch((e: Error) => { if (live) setTargetError(e.message); });
    return () => { live = false; };
  }, [monthsKey, reloadKey]);
  const targetsReady = months.every((m) => targets[m]) && (owner || mine !== null);
  const stored = (month: string, teamId: string) => targets[month]?.find((i) => i.scope === 'team' && i.refId === teamId);
  const goalOf = (teamId: string) => periodTarget(Object.fromEntries(months.map((m) => [m, stored(m, teamId)])), period);
  const pace = elapsedShare(period, today);

  // Ô đặt KPI: tháng đang sửa (kỳ đi qua nhiều tháng thì chọn tháng), nháp theo "tháng:team".
  const [pickMonth, setPickMonth] = useState<string | null>(null);
  const editMonth = pickMonth && months.includes(pickMonth) ? pickMonth : months.includes(today.slice(0, 7)) ? today.slice(0, 7) : months[0];
  const [draft, setDraft] = useState<Record<string, Partial<Record<Field, string>>>>({});
  const [busy, setBusy] = useState<Dept | null>(null);
  const shown = (t: Team, f: Field) => {
    const v = draft[`${editMonth}:${t.id}`]?.[f];
    if (v !== undefined) return v;
    const s = stored(editMonth, t.id);
    if (f === 'rate') return s?.closeRate ? String(s.closeRate).replace('.', ',') : '';
    const n = f === 'revenue' ? s?.revenue : s?.aov;
    return n ? vi.format(n) : '';
  };
  const edit = (t: Team, f: Field, v: string) => setDraft((d) => ({ ...d, [`${editMonth}:${t.id}`]: { ...d[`${editMonth}:${t.id}`], [f]: v } }));
  const dropDraft = (teams: Team[]) => setDraft((d) => Object.fromEntries(Object.entries(d).filter(([k]) => !teams.some((t) => k === `${editMonth}:${t.id}`))));
  const save = async (dept: Dept, teams: Team[]) => {
    setBusy(dept);
    try {
      const items = teams.map((t) => {
        const s = stored(editMonth, t.id);
        // Giữ nguyên phần trang này không sửa: số đơn chốt, chi phí trần, tỉ lệ chốt của CSKH.
        return {
          scope: 'team' as const, refId: t.id, revenue: parseMoney(shown(t, 'revenue')), closedOrders: s?.closedOrders ?? 0, costCeiling: s?.costCeiling ?? null,
          closeRate: dept === 'sale' ? parseRate(shown(t, 'rate')) : s?.closeRate ?? null, aov: parseAmount(shown(t, 'aov')) || null,
        };
      });
      const saved = await apiJson<{ items: Target[] }>('/api/targets', 'PUT', { month: editMonth, only: teams.map((t) => `team:${t.id}`), items });
      setTargets((x) => ({ ...x, [editMonth]: saved.items }));
      dropDraft(teams);
      toast(`Đã lưu KPI team ${LABEL[dept]} tháng ${mmyyyy(editMonth)}`);
    } catch (e) { toast((e as Error).message, { kind: 'error' }); } finally { setBusy(null); }
  };
  // Bấm số của một team: mở Tổng quan Sale / CSKH của team đó, cùng kỳ, mọi POS (số ở đó tính cùng cách).
  const open = (dept: Dept, t: Team) => (onOpen && !future ? () => {
    setPosIds(POS.map((p) => p.id)); setPeriodRange(period.start, end); setHrUnit({ id: t.id, name: t.name, dept });
    onOpen(dept === 'sale' ? 'sale-overview' : 'cskh-overview');
  } : undefined);

  const quick = matchQuick(period, today);
  return (
    <section className="min-w-0 space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <fieldset className="flex flex-wrap gap-1.5">
          <legend className="sr-only">Kỳ KPI</legend>
          {QUICK_PERIODS.map((q) => (
            <button key={q.value} type="button" aria-pressed={quick === q.value} className={`btn sm tap ${quick === q.value ? 'primary' : ''}`}
              onClick={() => setPeriod(quickPeriod(q.value, today))}>{q.label}</button>
          ))}
        </fieldset>
        <div className="flex flex-wrap items-center gap-2 text-[13px] text-ink-2">
          <label htmlFor={`${uid}-from`}>Từ</label>
          <Input id={`${uid}-from`} type="date" className="h-8 w-[9.5rem]" value={period.start} onChange={(e) => e.target.value && setPeriod((p) => ({ ...p, start: e.target.value }))} />
          <label htmlFor={`${uid}-to`}>đến</label>
          <Input id={`${uid}-to`} type="date" className="h-8 w-[9.5rem]" value={period.end} onChange={(e) => e.target.value && setPeriod((p) => ({ ...p, end: e.target.value }))} />
        </div>
      </div>
      {!ok && <ErrorBox error="Kỳ không hợp lệ: ngày bắt đầu phải trước ngày kết thúc, dài tối đa một năm." />}

      {depts.map((d) => {
        const sale = d.dept === 'sale', label = LABEL[d.dept], teams = teamsOf(d);
        const rows = ok && !future ? d.report.data?.current.byEmployee : undefined;
        const actualOf = (ids: string[]) => (rows ? teamActual(rows, ids, ms.rateBase) : null);
        const total = actualOf(teams.flatMap((t) => t.ids));
        const goals = teams.map((t) => goalOf(t.id).revenue);
        const totalGoal = goals.length && goals.every((g) => g !== null) ? goals.reduce<number>((a, g) => a + (g ?? 0), 0) : null;
        const missing = targetsReady ? months.filter((m) => !teams.some((t) => stored(m, t.id)?.revenue)) : [];
        const sumName = scopeName ? 'các team đang xem' : 'cả bộ phận';
        return (
          <ChartCard key={d.dept} icon={Target} title={`Tổng quan KPI ${label}`}
            subtitle={ok ? `${periodLabel(period)} · ${future ? 'kỳ chưa tới' : `số tới ${dmy(end)}`} · mọi POS${scopeName ? ` · ${scopeName}` : ''}` : undefined}>
            {d.teams.error && !d.teams.data ? <ErrorBox error={d.teams.error} onRetry={d.teams.reload} />
              : d.report.error && !d.report.data ? <ErrorBox error={d.report.error} onRetry={d.report.reload} />
              : targetError ? <ErrorBox error={targetError} onRetry={() => { setTargetError(''); setReloadKey((k) => k + 1); }} />
              : !ok ? null
              : !d.teams.data || !targetsReady || !scopeReady || (!future && !rows) ? <SkeletonTable rows={3} cols={3} />
              : !teams.length ? <EmptyState text={!owner ? `Chưa có team ${label} nào anh / chị cầm. Team gán ở Cài đặt → Team hoặc theo Leader bên web nhân sự.` : scopeName ? `Không có team ${label} trong phạm vi đang chọn ở thanh trên.` : `Chưa có team ${label}. Chia team ở Cài đặt → Chia team hoặc bên web nhân sự trước.`} />
              : (
                <div className="space-y-4">
                  <div className={`grid gap-3 ${sale ? 'sm:grid-cols-3' : 'sm:grid-cols-2'}`}>
                    <div className="rounded-xl bg-surface-2 p-3">
                      <KpiLine label={`Doanh thu đơn chốt ${sumName}`} value={total ? shortMoney(total.revenue) : '—'} goal={totalGoal === null ? null : shortMoney(totalGoal)}
                        p={total ? percentOf(total.revenue, totalGoal) : null} pace={pace} />
                    </div>
                    <SumStat label={`TB đơn chốt ${sumName}`} value={total?.aov == null ? '—' : shortMoney(total.aov)} />
                    {sale && <SumStat label={`Tỉ lệ chốt ${sumName}`} value={total ? pct(total.closeRate, 1) : '—'} />}
                  </div>
                  {missing.length > 0 && <p className="text-[12px] text-warn">Chưa đặt KPI doanh thu team {label} tháng {missing.map(mmyyyy).join(', ')}.</p>}
                  <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                    {teams.map((t) => <TeamCard key={t.id} team={t} actual={actualOf(t.ids)} goal={goalOf(t.id)} sale={sale} pace={pace} onOpen={open(d.dept, t)} />)}
                  </div>
                </div>
              )}
          </ChartCard>
        );
      })}

      {/* Chỉ tiêu mới (07/11/2026): KPI team và phần Leader / Mentor chia cho từng người, rồi số lượng sản phẩm để cân nên bán gì. */}
      {ok && !future && targetsReady && scopeReady && editMonth && depts.map((d) => {
        const teams = teamsOf(d);
        if (!teams.length || !d.teams.data) return null;
        return (
          <div key={`kpi2-${d.dept}`} className="space-y-4">
            <Kpi2Panel dept={d.dept} teams={teams} rows={d.report.data?.current.byEmployee} period={period} end={end} editMonth={editMonth} owner={owner}
              targets={targets} onTargets={(m, items) => setTargets((x) => ({ ...x, [m]: items }))} />
            <ProductQtyCard dept={d.dept} teams={teams} period={period} end={end} />
          </div>
        );
      })}

      {owner && ok && targetsReady && scopeReady && editMonth && depts.map((d) => {
        const sale = d.dept === 'sale', label = LABEL[d.dept], teams = teamsOf(d);
        if (!teams.length) return null;
        const dirty = teams.some((t) => draft[`${editMonth}:${t.id}`]);
        return (
          <ChartCard key={`edit-${d.dept}`} icon={Pencil} title={`Đặt KPI team ${label} tháng ${mmyyyy(editMonth)}`} subtitle="KPI cả team; leader tự chia cho từng người"
            action={months.length > 1 ? (
              <fieldset className="flex flex-wrap gap-1.5">
                <legend className="sr-only">Tháng đặt KPI</legend>
                {months.map((m) => <button key={m} type="button" aria-pressed={m === editMonth} className={`btn sm tap ${m === editMonth ? 'primary' : ''}`} onClick={() => setPickMonth(m)}>{mmyyyy(m)}</button>)}
              </fieldset>
            ) : undefined}>
            <div className="divide-y divide-line">
              {teams.map((t) => (
                <div key={t.id} className={`grid grid-cols-2 gap-2 py-2.5 ${sale ? 'sm:grid-cols-[minmax(0,1fr)_10rem_9rem_7rem]' : 'sm:grid-cols-[minmax(0,1fr)_10rem_9rem]'} sm:items-end`}>
                  <div className="col-span-2 self-center text-sm font-semibold text-ink sm:col-span-1">{t.name}</div>
                  <AmountField id={`${uid}-${t.id}-rev`} label="Doanh thu tháng" value={shown(t, 'revenue')} placeholder="vd 500tr" onChange={(v) => edit(t, 'revenue', v)} />
                  <AmountField id={`${uid}-${t.id}-aov`} label="TB đơn" value={shown(t, 'aov')} placeholder="vd 450k" onChange={(v) => edit(t, 'aov', v)} />
                  {sale && <AmountField id={`${uid}-${t.id}-rate`} label="Tỉ lệ chốt %" value={shown(t, 'rate')} placeholder="vd 35" inputMode="decimal" onChange={(v) => edit(t, 'rate', v)} />}
                </div>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <button type="button" className="btn primary" disabled={!dirty || busy !== null} onClick={() => void save(d.dept, teams)}>
                <Save size={14} />{busy === d.dept ? 'Đang lưu…' : `Lưu KPI ${label} tháng ${mmyyyy(editMonth)}`}
              </button>
              {dirty && <button type="button" className="btn" disabled={busy !== null} onClick={() => dropDraft(teams)}>Bỏ thay đổi</button>}
            </div>
          </ChartCard>
        );
      })}

      <Definitions items={[
        'KPI đặt theo tháng cho cả team (doanh thu, trung bình đơn, tỉ lệ chốt); leader tự chia cho từng người, web không chia.',
        'Chỉ tiêu mới (07/11/2026): Sale có Số nhận (số được chia), Số chốt (chốt từ số được chia), Doanh số, Số đơn (đơn chốt), số lượng từng sản phẩm; CSKH có Doanh số, Tỷ lệ tự upsell, số lượng từng sản phẩm. Chủ hệ thống đặt KPI cả team, Leader / Mentor chia cho người của mình; chia vượt KPI team thì hiện chữ đỏ.',
        'Tỷ lệ tự upsell = khách do Marketing mang về có CSKH nhận chăm sóc trên đơn, sau đó chính CSKH đó bán thêm được đơn chốt ÷ số khách đó. Số lượng sản phẩm = hộp / chai trên đơn chốt, không tính quà tặng.',
        'Chủ hệ thống đặt KPI team. Leader / mentor chỉ xem KPI các team mình cầm (gán ở Cài đặt → Team, hoặc là Leader bên web nhân sự).',
        'KPI lưu chung với trang KPI → Theo team, tiến độ KPI ở Tổng quan và báo cáo Zalo buổi sáng: sửa ở đây thì các nơi đó đổi theo.',
        'Bộ phận, chi nhánh, team: theo nút Tất cả / Sale / CSKH và chi nhánh ở thanh trên cùng.',
        'Doanh thu đơn chốt: của người trong team, cộng mọi POS, từ ngày đầu kỳ tới hôm nay, cùng cách tính với Tổng quan Sale / CSKH. Dòng tổng = cộng các team đang hiện.',
        'KPI doanh thu của kỳ = KPI tháng × số ngày của tháng nằm trong kỳ ÷ số ngày của tháng. Vạch đen = phần kỳ đã qua (đúng tiến độ).',
        'TB đơn chốt = doanh thu đơn chốt ÷ số đơn chốt. Tỉ lệ chốt theo cách tính đang chọn ở Cấu hình chỉ số. KPI hai số này của kỳ = trung bình KPI các tháng theo số ngày.',
        'Kỳ có tháng chưa đặt KPI thì ô KPI để trống, không tự đoán. CSKH không đặt KPI tỉ lệ chốt (anh Vũ 02/11/2026).',
        'Bấm số của một team: mở Tổng quan Sale / CSKH của team đó, cùng kỳ, mọi POS.',
        'Ô tiền nhận "500tr", "1,2 tỷ", "450k" hoặc số đủ. Để trống TB đơn hay tỉ lệ chốt = bỏ KPI đó.',
      ]} />
    </section>
  );
}
