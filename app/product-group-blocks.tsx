'use client';

// Khối theo nhóm sản phẩm (25/09/2026): "Khách bắt nguồn từ đâu" (Tổng quan CSKH) và "Chốt theo nhóm sản phẩm" (Tổng quan Sale).
// Người xem chọn cách chia: nhóm chính (Kháng sinh · SK + GK · Khác, nhận diện theo nhãn / sản phẩm / cả hai), từng nhãn, từng sản phẩm.
import { useEffect, useMemo, useState } from 'react';
import { Layers, Sprout, Users } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { GROUP_BASES, GROUP_DIMS, type GroupBasis, type GroupDim } from '@/lib/product-groups';
import { useApi } from './use-api';
import { StaffPicker } from './staff-picker';
import { ChartCard, EmptyState, ErrorBox, SkeletonTable, TableWrap, ThinkingLine, dt, pct, shortMoney, useSort, vi, SortTh } from './ui-kit';

const GROUP_COLORS = ['var(--ai-3)', 'var(--ai-5)', 'var(--ink-4)', 'var(--ai-2)', 'var(--ai-4)', 'var(--ai-1)', 'var(--pos-2)', 'var(--pos-4)'];
// Nhóm chính luôn cùng một màu (Kháng sinh xanh dương, SK + GK hồng, Khác xám) dù đang lọc nhân viên nào.
const FIXED: Record<string, string> = { 'Kháng sinh': 'var(--ai-3)', 'SK + GK': 'var(--ai-5)', 'Khác': 'var(--ink-4)' };
const colorOf = (label: string, i: number) => FIXED[label] ?? GROUP_COLORS[(i + 3) % GROUP_COLORS.length];

export function GroupOptions({ dim, basis, onDim, onBasis }: { dim: GroupDim; basis: GroupBasis; onDim: (d: GroupDim) => void; onBasis: (b: GroupBasis) => void }) {
  return (
    <span className="flex flex-wrap items-center gap-2">
      <Select value={dim} items={GROUP_DIMS} onValueChange={(v) => onDim(v as GroupDim)}>
        <SelectTrigger className="min-w-36 text-xs" aria-label="Chia nhóm theo"><SelectValue /></SelectTrigger>
        <SelectContent>{(Object.keys(GROUP_DIMS) as GroupDim[]).map((k) => <SelectItem key={k} value={k}>{GROUP_DIMS[k]}</SelectItem>)}</SelectContent>
      </Select>
      {dim === 'main' && (
        <Select value={basis} items={GROUP_BASES} onValueChange={(v) => onBasis(v as GroupBasis)}>
          <SelectTrigger className="min-w-36 text-xs" aria-label="Nhận diện nhóm bằng"><SelectValue /></SelectTrigger>
          <SelectContent>{(Object.keys(GROUP_BASES) as GroupBasis[]).map((k) => <SelectItem key={k} value={k}>{GROUP_BASES[k]}</SelectItem>)}</SelectContent>
        </Select>
      )}
    </span>
  );
}

type Params = { start: string; end: string; posIds: string[] };

// ---------- CSKH: khách bắt nguồn từ đâu ----------
type OriginReport = { allStaff?: { staffId: string; name: string; department: string | null }[]; groups: { label: string; customers: number }[]; totalCustomers: number; staff: { staffId: string; name: string; department: string | null; customers: number; byGroup: Record<string, number> }[];
  customers: { phone: string; name: string | null; posName: string; ordersInPeriod: number; firstAt: string | null; firstPosName: string | null; firstOrderId: string | null; firstGroups: string[]; firstProducts: string[] }[] | null;
  definitions: Record<string, string> };

export function CskhOriginBlock({ start, end, posIds, focusId = null }: Params & { focusId?: string | null }) {
  const [dim, setDim] = useState<GroupDim>('main');
  const [basis, setBasis] = useState<GroupBasis>('both');
  const [pick, setPick] = useState<{ staffId: string; name: string; group: string | null } | null>(null);
  const [pickedIds, setStaffIds] = useState<string[]>([]);
  // Đang "xem riêng" một nhân viên (thanh trên đầu trang CSKH) thì chỉ tính người đó.
  const staffIds = useMemo(() => focusId ? [focusId] : pickedIds, [focusId, pickedIds]);
  useEffect(() => { setPick(focusId ? { staffId: focusId, name: '', group: null } : null); }, [focusId]);
  const q = useMemo(() => new URLSearchParams({ start, end, posIds: posIds.join(','), dim, basis, ...(staffIds.length ? { staffIds: staffIds.join(',') } : {}) }).toString(), [start, end, posIds, dim, basis, staffIds]);
  const api = useApi<OriginReport>(`/api/reports/cskh-origin?${q}`);
  const list = useApi<OriginReport>(pick ? `/api/reports/cskh-origin?${q}&${new URLSearchParams({ staffId: pick.staffId, ...(pick.group ? { group: pick.group } : {}) })}` : null, { keep: false });
  const r = api.data;
  const labels = r?.groups.map((g) => g.label) ?? [];
  const sort = useSort<string>('customers');
  const rows = useMemo(() => [...(r?.staff ?? [])].sort((a, b) => {
    const v = (x: typeof a) => sort.key === 'customers' ? x.customers : x.byGroup[sort.key] ?? 0;
    return sort.desc ? v(b) - v(a) : v(a) - v(b);
  }), [r, sort.key, sort.desc]);
  const cell = (staffId: string, name: string, group: string | null, n: number) => (
    <button type="button" disabled={!n} onClick={() => setPick({ staffId, name, group })}
      className={`num rounded-md px-1.5 py-0.5 hover:bg-tint-2 disabled:cursor-default disabled:hover:bg-transparent ${pick?.staffId === staffId && pick.group === group ? 'bg-tint-2 font-semibold' : ''}`}>
      {n ? vi.format(n) : <span className="text-ink-4">0</span>}
    </button>
  );
  return (
    <ChartCard icon={Sprout} title="Khách bắt nguồn từ đâu" subtitle="Đếm KHÁCH (không phải đơn) của từng nhân viên CSKH trong kỳ, xếp theo sản phẩm của đơn ĐẦU TIÊN khách từng mua (cả 6 POS) — khác bảng đơn phía trên · bấm số để xem khách"
      info={r ? Object.values(r.definitions).join(' ') : undefined} loading={api.loading && !r}
      action={<span className="flex flex-wrap items-center gap-2">
        {!focusId && <StaffPicker idKey="staffId" staff={r?.allStaff ?? []} value={staffIds} onChange={(v) => { setStaffIds(v); setPick(v.length === 1 ? { staffId: v[0], name: r?.allStaff?.find((x) => x.staffId === v[0])?.name ?? '', group: null } : null); }} />}
        <GroupOptions dim={dim} basis={basis} onDim={(d) => { setDim(d); setPick(null); }} onBasis={(b) => { setBasis(b); setPick(null); }} />
      </span>}>
      {api.error && !r ? <ErrorBox error={api.error} onRetry={api.reload} /> : !r ? <><ThinkingLine lines={['Đang tìm đơn đầu tiên của từng khách…', 'Đang đối chiếu 6 POS…', 'Sắp xong…']} /><SkeletonTable rows={5} cols={5} /></> : !r.staff.length ? <EmptyState text="Chưa có khách nào của CSKH trong kỳ." /> : (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {r.groups.map((g, i) => (
              <span key={g.label} className="flex items-center gap-2 rounded-xl border border-line bg-surface-2 px-3 py-2 text-sm">
                <i className="size-2.5 rounded-full" style={{ background: colorOf(g.label, i) }} /><b className="text-ink">{g.label}</b>
                <span className="num text-ink">{vi.format(g.customers)}</span><span className="text-xs text-ink-3">{pct(r.totalCustomers ? g.customers / r.totalCustomers * 100 : null, 0)}</span>
              </span>
            ))}
            <span className="self-center text-xs text-ink-3">trên {vi.format(r.totalCustomers)} khách{staffIds.length ? ` của ${staffIds.length === 1 ? r.allStaff?.find((x) => x.staffId === staffIds[0])?.name ?? '1 nhân viên' : `${staffIds.length} nhân viên`}` : ''}</span>
          </div>
          <div className="grid gap-4 2xl:grid-cols-[minmax(0,1fr)_26rem]">
            <TableWrap minWidth={560 + labels.length * 90} maxHeight="34rem" stickyFirst>
              <table className="tbl">
                <thead><tr>
                  <th className="text-left">Nhân viên CSKH</th>
                  <SortTh k="customers" label="Khách" sort={sort} />
                  {labels.map((l) => <SortTh key={l} k={l} label={l} sort={sort} />)}
                  <th>Tỷ trọng</th>
                </tr></thead>
                <tbody>
                  {rows.map((s) => (
                    <tr key={s.staffId}>
                      <td className="text-left font-medium text-ink">{s.name}{s.department && <span className="block text-[11px] font-normal text-ink-3">{s.department}</span>}</td>
                      <td className="n">{cell(s.staffId, s.name, null, s.customers)}</td>
                      {labels.map((l) => <td key={l} className="n">{cell(s.staffId, s.name, l, s.byGroup[l] ?? 0)}</td>)}
                      <td><span className="flex h-2 w-32 overflow-hidden rounded-full bg-surface-2">{labels.map((l, i) => <i key={l} className="block h-full" style={{ width: `${s.customers ? (s.byGroup[l] ?? 0) / s.customers * 100 : 0}%`, background: colorOf(l, i) }} />)}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableWrap>
            <div className="rounded-xl border border-line p-3">
              <p className="text-sm font-semibold text-ink">{pick ? `${pick.name || r?.allStaff?.find((x) => x.staffId === pick.staffId)?.name || ''} · ${pick.group ?? 'tất cả khách'}` : 'Danh sách khách'}</p>
              <p className="mb-2 text-xs text-ink-3">{pick ? `${list.data?.customers?.length ?? '…'} khách · sắp theo ngày mua đầu` : 'Bấm một con số trong bảng để xem khách và đơn đầu tiên của họ.'}</p>
              {pick && (list.error ? <ErrorBox error={list.error} onRetry={list.reload} /> : !list.data?.customers ? <SkeletonTable rows={4} cols={2} /> : (
                <ul className="m-0 max-h-[30rem] list-none space-y-2 overflow-y-auto p-0">
                  {list.data.customers.map((c) => (
                    <li key={c.phone} className="rounded-lg bg-surface-2 p-2.5 text-xs">
                      <div className="flex gap-2"><b className="text-ink">{c.name || 'Khách'}</b><span className="text-ink-3">{c.phone}</span><span className="ml-auto text-ink-3">{c.ordersInPeriod} đơn trong kỳ</span></div>
                      <div className="mt-1 text-ink-2">Đơn đầu {dt(c.firstAt, true)} · {c.firstPosName}{c.firstOrderId ? ` · #${c.firstOrderId}` : ''}</div>
                      <div className="mt-0.5 text-ink-3">{c.firstGroups.join(', ')}{c.firstProducts.length ? ` · ${[...new Set(c.firstProducts)].slice(0, 3).join(', ')}` : ''}</div>
                    </li>
                  ))}
                </ul>
              ))}
            </div>
          </div>
        </div>
      )}
    </ChartCard>
  );
}

// ---------- Sale: chốt theo nhóm sản phẩm ----------
type Cell = { closed: number; closedNet: number; created: number; closeRate: number | null; aov: number | null };
type GroupOrder = { id: string; source_order_id: string; posName: string; phone: string | null; customer_name: string | null; status_code: number; created_at: string; first_confirmed_at: string | null; net: number; products: string[]; groups: string[]; tags: string[] };
type GroupReport = { total: Cell; groups: (Cell & { label: string })[]; staff: (Cell & { sellerId: string; name: string; department: string | null; byGroup: Record<string, Cell> })[]; orders?: GroupOrder[] | null; definitions: Record<string, string> };

export function SaleGroupBlock({ start, end, posIds, team = 'sale', by = 'seller', focusId = null, title = 'Chốt theo nhóm sản phẩm',
  subtitle = 'Tỷ lệ chốt = đơn chốt ÷ đơn lên của nhóm, cùng cách tính với POS · một đơn có cả hai loại tính ở cả hai nhóm · bấm số để xem từng đơn' }: Params & {
  team?: 'sale' | 'cskh' | 'all'; by?: 'seller' | 'care'; focusId?: string | null; title?: string; subtitle?: string;
}) {
  const [dim, setDim] = useState<GroupDim>('main');
  const [basis, setBasis] = useState<GroupBasis>('both');
  const [metric, setMetric] = useState<'closed' | 'closedNet' | 'closeRate'>('closed');
  const q = useMemo(() => new URLSearchParams({ start, end, posIds: posIds.join(','), team, dim, basis, by }).toString(), [start, end, posIds, team, dim, basis, by]);
  const api = useApi<GroupReport>(`/api/reports/product-groups?${q}`);
  const [picked, setStaffIds] = useState<string[]>([]);
  // Đang "Xem riêng nhân viên" (CSKH): chỉ còn người đó, ẩn bộ chọn để ảnh chụp không lộ người khác.
  const staffIds = focusId ? [focusId] : picked;
  const [pick, setPick] = useState<{ staffId: string; name: string; group: string | null } | null>(null);
  useEffect(() => { setPick(null); }, [q, focusId]);
  const list = useApi<GroupReport>(pick ? `/api/reports/product-groups?${q}&${new URLSearchParams({ staffId: pick.staffId, ...(pick.group ? { group: pick.group } : {}) })}` : null, { keep: false });
  const raw = api.data;
  // Chọn nhân viên: mỗi đơn chỉ có một người bán nên cộng số của những người được chọn là đúng.
  const r = useMemo(() => {
    if (!raw || !staffIds.length) return raw;
    const staff = raw.staff.filter((x) => staffIds.includes(x.sellerId));
    type Sum = { closed: number; closedNet: number; created: number };
    const add = (a: Sum, b: Sum | undefined): Sum => b ? { closed: a.closed + b.closed, closedNet: a.closedNet + b.closedNet, created: a.created + b.created } : a;
    const fin = (c: { closed: number; closedNet: number; created: number }): Cell => ({ ...c, closeRate: c.created ? c.closed / c.created * 100 : null, aov: c.closed ? c.closedNet / c.closed : null });
    const zero = { closed: 0, closedNet: 0, created: 0 };
    return { ...raw, staff, total: fin(staff.reduce((a, x) => add(a, x), zero)),
      groups: raw.groups.map((g) => ({ label: g.label, ...fin(staff.reduce((a, x) => add(a, x.byGroup[g.label]), zero)) })).filter((g) => g.closed || g.created) };
  }, [raw, staffIds]);
  const labels = r?.groups.map((g) => g.label) ?? [];
  const sort = useSort<string>('closedNet');
  const rows = useMemo(() => [...(r?.staff ?? [])].sort((a, b) => {
    const v = (x: typeof a) => sort.key === 'closedNet' ? x.closedNet : sort.key === 'closed' ? x.closed : x.byGroup[sort.key]?.[metric] ?? -1;
    return sort.desc ? (v(b) ?? -1) - (v(a) ?? -1) : (v(a) ?? -1) - (v(b) ?? -1);
  }), [r, sort.key, sort.desc, metric]);
  const pickCls = (sid: string, g: string | null) => `num rounded-md px-1.5 py-0.5 hover:bg-tint-2 ${pick?.staffId === sid && pick.group === g ? 'bg-tint-2 font-semibold' : ''}`;
  const fmt = (c: Cell | undefined) => !c ? <span className="text-ink-4">—</span> : metric === 'closed' ? vi.format(c.closed) : metric === 'closedNet' ? shortMoney(c.closedNet) : pct(c.closeRate);
  return (
    <ChartCard icon={Layers} title={title} subtitle={subtitle}
      info={r ? Object.values(r.definitions).join(' ') : undefined}
      action={<span className="flex flex-wrap items-center gap-2">
        {!focusId && <StaffPicker staff={raw?.staff ?? []} value={staffIds} onChange={setStaffIds} />}
        <GroupOptions dim={dim} basis={basis} onDim={setDim} onBasis={setBasis} />
      </span>}>
      {api.error && !r ? <ErrorBox error={api.error} onRetry={api.reload} /> : !r ? <><ThinkingLine /><SkeletonTable rows={4} cols={5} /></> : !r.groups.length ? <EmptyState text="Chưa có đơn trong kỳ." /> : (
        <div className="space-y-4">
          <div className={`grid gap-3 ${labels.length > 3 ? 'sm:grid-cols-2 xl:grid-cols-4' : 'sm:grid-cols-3'}`}>
            {r.groups.slice(0, dim === 'main' ? 6 : 8).map((g, i) => (
              <div key={g.label} className="rounded-xl border border-line p-3">
                <div className="flex items-center gap-2 text-xs font-semibold text-ink-2"><i className="size-2.5 rounded-full" style={{ background: colorOf(g.label, i) }} /><span className="truncate">{g.label}</span></div>
                <div className="num mt-1 text-xl text-ink">{shortMoney(g.closedNet)}</div>
                <div className="mt-1 grid grid-cols-3 gap-1 text-[11px] text-ink-3">
                  <span>Đơn chốt<b className="num block text-[13px] text-ink">{vi.format(g.closed)}</b></span>
                  <span>Đơn lên<b className="num block text-[13px] text-ink">{vi.format(g.created)}</b></span>
                  <span>Tỷ lệ chốt<b className="num block text-[13px] text-ink">{pct(g.closeRate)}</b></span>
                </div>
                <div className="mt-1 text-[11px] text-ink-3">GTTB {shortMoney(g.aov)} · {pct(r.total.closed ? g.closed / r.total.closed * 100 : null, 0)} đơn chốt</div>
              </div>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <Users size={14} className="text-ink-3" /><b className="text-ink-2">Từng nhân viên:</b>
            {([['closed', 'Đơn chốt'], ['closedNet', 'Doanh thu'], ['closeRate', 'Tỷ lệ chốt']] as const).map(([k, l]) => (
              <button key={k} type="button" onClick={() => setMetric(k)} className={`rounded-md px-2.5 py-1 font-semibold ${metric === k ? 'bg-primary text-[var(--primary-ink)]' : 'text-ink-2 hover:bg-surface-2'}`}>{l}</button>
            ))}
          </div>
          <TableWrap minWidth={560 + labels.length * 100} maxHeight="34rem" stickyFirst>
            <table className="tbl">
              <thead><tr>
                <th className="text-left">Nhân viên</th>
                <SortTh k="closed" label="Tổng chốt" sort={sort} />
                <SortTh k="closedNet" label="Doanh thu" sort={sort} />
                {labels.map((l) => <SortTh key={l} k={l} label={l} sort={sort} />)}
              </tr></thead>
              <tbody>
                {rows.map((s) => (
                  <tr key={s.sellerId}>
                    <td className="text-left font-medium text-ink">{s.name}{s.department && <span className="block text-[11px] font-normal text-ink-3">{s.department}</span>}</td>
                    <td className="n"><button type="button" onClick={() => setPick({ staffId: s.sellerId, name: s.name, group: null })} className={pickCls(s.sellerId, null)}>{vi.format(s.closed)}</button><span className="block text-[11px] text-ink-3">{pct(s.closeRate)} chốt</span></td>
                    <td className="n">{shortMoney(s.closedNet)}</td>
                    {labels.map((l) => <td key={l} className="n">{s.byGroup[l]?.closed ? <button type="button" onClick={() => setPick({ staffId: s.sellerId, name: s.name, group: l })} className={pickCls(s.sellerId, l)}>{fmt(s.byGroup[l])}</button> : fmt(s.byGroup[l])}{metric !== 'closeRate' && s.byGroup[l] && <span className="block text-[11px] text-ink-3">{pct(s.closed ? s.byGroup[l].closed / s.closed * 100 : null, 0)}</span>}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
          {pick && (
            <div className="rounded-xl border border-line p-3">
              <div className="flex flex-wrap items-baseline gap-2">
                <p className="text-sm font-semibold text-ink">{pick.name} · {pick.group ?? 'tất cả đơn chốt'}</p>
                <span className="text-xs text-ink-3">{list.data?.orders ? `${vi.format(list.data.orders.length)} đơn · mới nhất trước` : 'Đang tải…'}</span>
                <button type="button" className="ml-auto text-xs text-ink-3 hover:text-primary" onClick={() => setPick(null)}>Đóng</button>
              </div>
              {list.error ? <ErrorBox error={list.error} onRetry={list.reload} /> : !list.data?.orders ? <SkeletonTable rows={4} cols={4} /> : (
                <TableWrap minWidth={760} maxHeight="26rem">
                  <table className="tbl text-[12.5px]">
                    <thead><tr><th className="text-left">Đơn</th><th className="text-left">Khách</th><th className="text-left">Sản phẩm</th><th className="text-left">Nhóm</th><th>Tiền</th></tr></thead>
                    <tbody>{list.data.orders.map((o) => (
                      <tr key={o.id}>
                        <td className="text-left"><b className="text-ink">#{o.source_order_id}</b><span className="block text-[11px] text-ink-3">{o.posName} · chốt {dt(o.first_confirmed_at ?? o.created_at, true)}</span></td>
                        <td className="text-left">{o.customer_name || 'Khách'}<span className="block text-[11px] text-ink-3">{o.phone}</span></td>
                        <td className="max-w-[22rem] text-left text-ink-2">{[...new Set(o.products)].slice(0, 4).join(', ') || '—'}{o.tags.length ? <span className="block text-[11px] text-ink-3">Nhãn: {o.tags.join(', ')}</span> : null}</td>
                        <td className="text-left">{o.groups.map((g, i) => <span key={g} className="mr-1 inline-flex items-center gap-1 whitespace-nowrap text-[11.5px]"><i className="size-2 rounded-full" style={{ background: colorOf(g, i) }} />{g}</span>)}</td>
                        <td className="n">{shortMoney(o.net)}</td>
                      </tr>
                    ))}</tbody>
                  </table>
                </TableWrap>
              )}
            </div>
          )}
        </div>
      )}
    </ChartCard>
  );
}
