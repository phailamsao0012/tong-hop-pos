'use client';

// Phân tích CSKH (giai đoạn 3a · 26/09/2026): đường đi sản phẩm (upsell từ nhóm nào sang nhóm nào), khách mua lần thứ mấy,
// độ đa dạng nhóm sản phẩm, độ đều doanh thu giữa nhân viên, GTTB CSKH so với Sale, và bảng từng nhân viên.
import { AiPackButton } from './ai-pack';
import { useMemo, useState } from 'react';
import { GitBranch, Layers, Scale, Users } from 'lucide-react';
import { POS } from '@/lib/report-model';
import { todayVn } from '@/lib/report-time';
import type { CskhAnalytics } from '@/lib/cskh-analytics';
import { ICON } from './icons';
import { CskhFocusBar, useCskhFocus } from './cskh-focus';
import { PeriodToolbar, PosChips, presetRange } from './overview-view';
import { useApi } from './use-api';
import { ChartCard, Definitions, EmptyState, ErrorBox, KpiCard, PageHeader, SkeletonKpis, SkeletonTable, SortTh, TableWrap, ThinkingLine, dmy, money, pct, shortMoney, useSort, vi } from './ui-kit';

const COLORS: Record<string, string> = { 'Kháng sinh': 'var(--ai-3)', 'Combo': 'var(--ai-5)', 'Khác': 'var(--ink-4)' };
const monthStart = (d: string) => `${d.slice(0, 7)}-01`;
const num = (n: number | null | undefined, d = 1) => n === null || n === undefined ? '—' : n.toFixed(d).replace('.', ',');

/** Sơ đồ dòng chảy 2 cột: nhóm của đơn trước (trái) → nhóm của đơn này (phải); bề dày dải = số đơn. */
function FlowDiagram({ flows, groups }: { flows: CskhAnalytics['flows']; groups: string[] }) {
  const W = 560, H = 260, NODE = 14, GAP = 14, PADX = 110;
  const total = flows.reduce((a, f) => a + f.n, 0);
  if (!total) return <EmptyState text="Chưa có đơn mua lại trong kỳ để vẽ đường đi." />;
  const sumBy = (side: 'from' | 'to') => groups.map((g) => flows.filter((f) => f[side] === g).reduce((a, f) => a + f.n, 0));
  const left = sumBy('from'), right = sumBy('to');
  const usable = H - GAP * (groups.length - 1);
  const scale = usable / total;
  const layout = (vals: number[]) => { let y = 0; return vals.map((v) => { const r = { y, h: Math.max(v ? 2 : 0, v * scale) }; y += r.h + GAP; return r; }); };
  const L = layout(left), R = layout(right);
  const lOff = L.map((n) => n.y), rOff = R.map((n) => n.y);
  const x0 = PADX + NODE, x1 = W - PADX - NODE;
  const bands = [...flows].sort((a, b) => groups.indexOf(a.from) - groups.indexOf(b.from) || groups.indexOf(a.to) - groups.indexOf(b.to)).map((f) => {
    const i = groups.indexOf(f.from), j = groups.indexOf(f.to), h = f.n * scale;
    const ya = lOff[i], yb = rOff[j]; lOff[i] += h; rOff[j] += h;
    const mx = (x0 + x1) / 2;
    const d = `M${x0},${ya} C${mx},${ya} ${mx},${yb} ${x1},${yb} L${x1},${yb + h} C${mx},${yb + h} ${mx},${ya + h} ${x0},${ya + h} Z`;
    return { f, d, i };
  });
  return (
    <div className="overflow-x-auto">
      <svg viewBox={`0 -6 ${W} ${H + 26}`} className="mx-auto block w-full max-w-[640px]" role="img" aria-label="Sơ đồ đường đi nhóm sản phẩm từ đơn trước sang đơn này">
        {bands.map(({ f, d, i }) => (
          <path key={`${f.from}-${f.to}`} d={d} fill={COLORS[groups[i]] ?? 'var(--ink-4)'} fillOpacity={0.28} stroke={COLORS[groups[i]]} strokeOpacity={0.4} strokeWidth={0.5}>
            <title>{`${f.from} → ${f.to}: ${vi.format(f.n)} đơn (${pct(f.n / total * 100, 0)})`}</title>
          </path>
        ))}
        {groups.map((g, i) => L[i].h > 0 && (
          <g key={`l-${g}`}>
            <rect x={PADX} y={L[i].y} width={NODE} height={L[i].h} rx={3} fill={COLORS[g]} />
            <text x={PADX - 8} y={L[i].y + L[i].h / 2} textAnchor="end" dominantBaseline="middle" fontSize="12" fill="var(--ink)">{g}<tspan fill="var(--ink-3)"> {vi.format(left[i])}</tspan></text>
          </g>
        ))}
        {groups.map((g, i) => R[i].h > 0 && (
          <g key={`r-${g}`}>
            <rect x={W - PADX - NODE} y={R[i].y} width={NODE} height={R[i].h} rx={3} fill={COLORS[g]} />
            <text x={W - PADX + 8} y={R[i].y + R[i].h / 2} dominantBaseline="middle" fontSize="12" fill="var(--ink)">{g}<tspan fill="var(--ink-3)"> {vi.format(right[i])}</tspan></text>
          </g>
        ))}
        <text x={PADX} y={H + 4} fontSize="10.5" fill="var(--ink-3)" dominantBaseline="hanging">Đơn trước</text>
        <text x={W - PADX} y={H + 4} fontSize="10.5" fill="var(--ink-3)" textAnchor="end" dominantBaseline="hanging">Đơn này</text>
      </svg>
    </div>
  );
}

/** Đường cong Lorenz: trục ngang % nhân viên (ít → nhiều doanh thu), trục dọc % doanh thu cộng dồn; đường chéo = chia đều tuyệt đối. */
function Lorenz({ points }: { points: { people: number; share: number }[] }) {
  const S = 200, P = 34;
  const x = (v: number) => P + v / 100 * S, y = (v: number) => P + S - v / 100 * S;
  const d = points.map((p, i) => `${i ? 'L' : 'M'}${x(p.people)},${y(p.share)}`).join(' ');
  return (
    <svg viewBox={`0 0 ${S + P * 2} ${S + P * 2}`} className="mx-auto block w-full max-w-[260px]" role="img" aria-label="Đường cong phân bổ doanh thu giữa nhân viên">
      <rect x={P} y={P} width={S} height={S} fill="none" stroke="var(--line)" />
      <line x1={x(0)} y1={y(0)} x2={x(100)} y2={y(100)} stroke="var(--ink-4)" strokeDasharray="4 4" />
      <path d={`${d} L${x(100)},${y(0)} Z`} fill="var(--primary)" fillOpacity={0.12} />
      <path d={d} fill="none" stroke="var(--primary)" strokeWidth={2} />
      <text x={P} y={S + P + 16} fontSize="10" fill="var(--ink-3)">0%</text>
      <text x={S + P} y={S + P + 16} fontSize="10" fill="var(--ink-3)" textAnchor="end">100% nhân viên</text>
      <text x={P - 4} y={P + 4} fontSize="10" fill="var(--ink-3)" textAnchor="end">100%</text>
      <text x={x(52)} y={y(60)} fontSize="10" fill="var(--ink-3)" transform={`rotate(-45 ${x(52)} ${y(60)})`}>chia đều</text>
    </svg>
  );
}

export function CskhAnalyticsView() {
  const today = todayVn();
  const [preset, setPreset] = useState('month');
  const [start, setStart] = useState(monthStart(today));
  const [end, setEnd] = useState(today);
  const [posIds, setPosIds] = useState<string[]>(POS.map((p) => p.id));
  const focus = useCskhFocus();
  const url = useMemo(() => `/api/reports/cskh-analytics?${new URLSearchParams({ start, end, posIds: posIds.join(','), ...(focus ? { staffIds: focus.id } : {}) })}`, [start, end, posIds, focus]);
  const { data: r, loading, error, reload } = useApi<CskhAnalytics>(url);
  const sort = useSort<'net' | 'customers' | 'orders' | 'aov' | 'ordersPerCustomer' | 'repeatShare' | 'avgGroups'>('net');
  const staff = useMemo(() => [...(r?.staff ?? [])].sort((a, b) => ((sort.desc ? -1 : 1) * (((a[sort.key] ?? -1) as number) - ((b[sort.key] ?? -1) as number)))), [r, sort.key, sort.desc]);
  const seq = r ? [1, 2, 3, 4].map((k) => ({ k, n: r.seqDist[k as 1 | 2 | 3 | 4] })) : [];
  const seqMax = Math.max(1, ...seq.map((x) => x.n));
  const divTotal = r ? r.diversity[1] + r.diversity[2] + r.diversity[3] : 0;
  const periodLabel = `${dmy(start)}/${start.slice(0, 4)} – ${dmy(end)}/${end.slice(0, 4)}`;
  const aovDiff = r?.total.aov && r.sale.aov ? (r.total.aov - r.sale.aov) / r.sale.aov * 100 : null;
  return (
    <div className="space-y-5">
      <PageHeader eyebrow={periodLabel} title="Phân tích CSKH" subtitle="Khách của CSKH mua lần thứ mấy, đi từ nhóm sản phẩm nào sang nhóm nào, mua đa dạng không, doanh thu có chia đều giữa nhân viên không"
        actions={<AiPackButton disabled={!r} pack={() => r && ({
          page: 'Phân tích CSKH', period: periodLabel, scope: focus ? `riêng ${focus.name}` : 'mọi nhân viên CSKH',
          facts: [['Đơn chốt', r.total.orders], ['Khách', r.total.customers], ['Doanh thu', money(r.total.net)], ['GTTB CSKH', money(r.total.aov)], ['GTTB Sale cùng kỳ', money(r.sale.aov)],
            ['% đơn là mua lại', pct(r.total.repeatShare)], ['Đơn mỗi khách', num(r.total.ordersPerCustomer, 2)], ['Chỉ số đều (0–100)', num(r.evenness.index, 0)], ['20% người đứng đầu làm ra', pct(r.evenness.top20Share)]],
          tables: [
            { title: 'Đường đi sản phẩm (nhóm đơn trước → đơn này)', columns: ['Từ', 'Sang', 'Số đơn'], rows: r.flows.map((f) => [f.from, f.to, f.n]) },
            { title: 'Khách mua lần thứ mấy', columns: ['Lần', 'Số đơn'], rows: [1, 2, 3, 4].map((k) => [k === 4 ? '4 trở lên' : String(k), r.seqDist[k as 1 | 2 | 3 | 4]]) },
            { title: 'Từng nhân viên', staffCol: 0, columns: ['Nhân viên', 'Doanh thu', 'Khách', 'Đơn', 'GTTB', 'Đơn/khách', '% mua lại', 'Nhóm/khách'], rows: r.staff.map((s) => [s.name, Math.round(s.net), s.customers, s.orders, s.aov === null ? null : Math.round(s.aov), num(s.ordersPerCustomer, 2), pct(s.repeatShare, 0), num(s.avgGroups, 1)]) },
          ],
          definitions: r.definitions,
          questions: ['CSKH đang bán thêm (upsell) tốt không? Đường đi sản phẩm nào đang mạnh, đường nào nên đẩy?', 'Nhân viên nào giỏi giữ khách mua lại, ai cần kèm? Vì sao?', 'Doanh thu có dồn vào vài người không, rủi ro gì?', 'GTTB CSKH so với Sale nói lên điều gì?'],
        })} />} />
      <CskhFocusBar />
      <PeriodToolbar preset={preset} start={start} end={end} loading={loading} onReload={reload}
        onPreset={(v) => { setPreset(v); const x = presetRange(v, today); if (x) { setStart(x.start); setEnd(x.end); } }}
        onStart={(v) => { setPreset('custom'); setStart(v); }} onEnd={(v) => { setPreset('custom'); setEnd(v); }} />
      <PosChips posIds={posIds} onChange={setPosIds} />
      {error && !r && <ErrorBox error={error} onRetry={reload} />}
      {!r && !error && <><SkeletonKpis count={4} className="xl:grid-cols-4" /><ChartCard title="Đường đi sản phẩm" subtitle="Đang tải…"><ThinkingLine lines={['Đang lấy lịch sử mua của từng khách…', 'Đang đối chiếu 6 POS…', 'Sắp xong…']} /><SkeletonTable rows={5} cols={4} /></ChartCard></>}
      {r && (
        <>
          <div className={`grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4 ${loading ? 'opacity-70' : ''}`}>
            <KpiCard icon={ICON.aov} tone="teal" label="GTTB CSKH" value={shortMoney(r.total.aov)} note={`Sale ${shortMoney(r.sale.aov)}${aovDiff === null ? '' : ` · CSKH ${aovDiff >= 0 ? 'cao hơn' : 'thấp hơn'} ${pct(Math.abs(aovDiff), 0)}`}`}
              tooltip={{ period: periodLabel, current: money(r.total.aov), previous: money(r.sale.aov), previousLabel: 'GTTB Sale cùng kỳ', definition: r.definitions.aov }} />
            <KpiCard icon={ICON.upsell} tone="green" label="Đơn là mua lại" value={pct(r.total.repeatShare, 0)} note={`${vi.format(r.total.orders - r.seqDist[1])} / ${vi.format(r.total.orders)} đơn là lần mua thứ 2 trở đi`}
              tooltip={{ period: periodLabel, current: pct(r.total.repeatShare), definition: r.definitions.seq }} />
            <KpiCard icon={ICON.customers} tone="blue" label="Đơn mỗi khách" value={num(r.total.ordersPerCustomer, 2)} note={`${vi.format(r.total.orders)} đơn · ${vi.format(r.total.customers)} khách trong kỳ`}
              tooltip={{ period: periodLabel, current: `${vi.format(r.total.orders)} đơn ÷ ${vi.format(r.total.customers)} khách`, definition: r.definitions.scope }} />
            <KpiCard icon={Scale} tone="purple" label="Chỉ số đều" value={r.evenness.index === null ? '—' : num(r.evenness.index, 0)} unit={r.evenness.index === null ? undefined : '/100'}
              note={r.evenness.top20Share === null ? 'Cần từ 2 nhân viên' : `20% người đứng đầu làm ra ${pct(r.evenness.top20Share, 0)} doanh thu`}
              tooltip={{ period: periodLabel, current: r.evenness.index === null ? '—' : `${num(r.evenness.index, 0)} / 100`, definition: r.definitions.evenness }} />
          </div>

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
            <ChartCard icon={GitBranch} title="Đường đi sản phẩm" subtitle="Nhóm của đơn liền trước → nhóm của đơn này (đơn mua lần 2 trở đi) · rê chuột vào dải để xem số" info={r.definitions.flows}>
              <FlowDiagram flows={r.flows} groups={r.groups} />
              {r.flows.length > 0 && (
                <ul className="m-0 mt-3 grid list-none gap-1.5 p-0 text-[12.5px] sm:grid-cols-2">
                  {r.flows.slice(0, 6).map((f) => (
                    <li key={`${f.from}-${f.to}`} className="flex items-center gap-2 rounded-lg bg-surface-2 px-2.5 py-1.5">
                      <i className="size-2 rounded-full" style={{ background: COLORS[f.from] }} /><span className="text-ink">{f.from}</span><span className="text-ink-4">→</span>
                      <i className="size-2 rounded-full" style={{ background: COLORS[f.to] }} /><span className="text-ink">{f.to}</span>
                      <span className="num ml-auto text-ink">{vi.format(f.n)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </ChartCard>
            <div className="grid gap-4">
              <ChartCard icon={ICON.upsell} title="Khách mua lần thứ mấy" subtitle="Số đơn trong kỳ theo thứ tự mua của khách" info={r.definitions.seq}>
                <ul className="m-0 list-none space-y-2 p-0">
                  {seq.map(({ k, n }) => (
                    <li key={k} className="grid grid-cols-[6.5rem_minmax(0,1fr)_4.5rem] items-center gap-2 text-[12.5px]">
                      <span className="text-ink-2">{k === 1 ? 'Lần 1 · khách mới' : k === 4 ? 'Lần 4 trở lên' : `Lần ${k}`}</span>
                      <span className="h-3 overflow-hidden rounded-full bg-surface-2"><i className="block h-full rounded-full bg-[var(--primary)]" style={{ width: `${n / seqMax * 100}%`, opacity: 0.45 + k * 0.14 }} /></span>
                      <span className="num text-right text-ink">{vi.format(n)} <span className="text-[11px] text-ink-3">{pct(r.total.orders ? n / r.total.orders * 100 : null, 0)}</span></span>
                    </li>
                  ))}
                </ul>
              </ChartCard>
              <ChartCard icon={Layers} title="Độ đa dạng" subtitle="Khách đã mua bao nhiêu nhóm sản phẩm khác nhau" info={r.definitions.diversity}>
                <div className="flex h-4 gap-[2px] overflow-hidden rounded-full" role="img" aria-label={`1 nhóm ${r.diversity[1]}, 2 nhóm ${r.diversity[2]}, 3 nhóm ${r.diversity[3]} khách`}>
                  {([1, 2, 3] as const).map((k) => <i key={k} className="block h-full" style={{ width: `${divTotal ? r.diversity[k] / divTotal * 100 : 0}%`, background: ['var(--ink-4)', 'var(--ai-3)', 'var(--primary)'][k - 1] }} />)}
                </div>
                <div className="mt-2 grid grid-cols-3 gap-2 text-[12px]">
                  {([1, 2, 3] as const).map((k) => (
                    <div key={k}><span className="flex items-center gap-1 text-ink-3"><i className="size-2 rounded-full" style={{ background: ['var(--ink-4)', 'var(--ai-3)', 'var(--primary)'][k - 1] }} />{k === 3 ? 'Cả 3 nhóm' : `${k} nhóm`}</span>
                      <b className="num text-ink">{vi.format(r.diversity[k])}</b> <span className="text-ink-3">{pct(divTotal ? r.diversity[k] / divTotal * 100 : null, 0)}</span></div>
                  ))}
                </div>
              </ChartCard>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
            <ChartCard icon={Scale} title="Độ đều giữa nhân viên" subtitle={`${r.evenness.people} nhân viên · đường cong càng sát đường chéo càng đều`} info={r.definitions.evenness}>
              {r.evenness.people > 1 ? <Lorenz points={r.evenness.lorenz} /> : <EmptyState text="Cần từ 2 nhân viên để so độ đều." />}
            </ChartCard>
            <ChartCard icon={Users} title={`Từng nhân viên · ${staff.length} người`} subtitle="Bấm tiêu đề cột để sắp xếp">
              {staff.length ? (
                <TableWrap minWidth={880} maxHeight="30rem" stickyFirst>
                  <table className="tbl">
                    <thead><tr>
                      <th className="text-left">Nhân viên</th>
                      <SortTh k="net" label="Doanh thu" sort={sort} />
                      <SortTh k="customers" label="Khách" sort={sort} />
                      <SortTh k="orders" label="Đơn" sort={sort} />
                      <SortTh k="aov" label="GTTB" sort={sort} />
                      <SortTh k="ordersPerCustomer" label="Đơn/khách" sort={sort} />
                      <SortTh k="repeatShare" label="% mua lại" sort={sort} />
                      <SortTh k="avgGroups" label="Nhóm/khách" sort={sort} />
                      <th className="text-left">Đường đi nhiều nhất</th>
                    </tr></thead>
                    <tbody>{staff.map((s) => (
                      <tr key={s.staffId}>
                        <td className="text-left font-medium text-ink">{s.name}{s.department && <span className="block text-[11px] font-normal text-ink-3">{s.department}</span>}</td>
                        <td className="n">{shortMoney(s.net)}<span className="block text-[11px] text-ink-3">{pct(r.total.net ? s.net / r.total.net * 100 : null, 0)}</span></td>
                        <td className="n">{vi.format(s.customers)}</td>
                        <td className="n">{vi.format(s.orders)}</td>
                        <td className="n">{shortMoney(s.aov)}</td>
                        <td className="n">{num(s.ordersPerCustomer, 2)}</td>
                        <td className="n">{pct(s.repeatShare, 0)}</td>
                        <td className="n">{num(s.avgGroups, 1)}</td>
                        <td className="text-left text-[12px] text-ink-2">{s.topFlow ? <>{s.topFlow.from} → {s.topFlow.to} <span className="text-ink-3">· {vi.format(s.topFlow.n)}</span></> : <span className="text-ink-4">—</span>}</td>
                      </tr>
                    ))}</tbody>
                  </table>
                </TableWrap>
              ) : <EmptyState text="Chưa có đơn chốt của CSKH trong kỳ." />}
            </ChartCard>
          </div>
          <Definitions items={r.definitions} />
        </>
      )}
    </div>
  );
}
