'use client';

// Khối "Team Sale × Team MKT" (anh Vũ 12/11/2026): đội Sale nào chốt cho team MKT nào, doanh thu, tỉ lệ chốt… ra sao.
// Dòng = team Sale (theo người bấm xác nhận đơn), cột = team MKT hoặc từng marketer; ô đậm nhạt theo giá trị; bấm ô thì lọc cả trang theo cặp đó.
// Không có chi phí (chi phí chỉ của Marketing). Mặc định thu vào dòng tiêu đề.
import { useMemo, useState } from 'react';
import { Grid3x3 } from 'lucide-react';
import { ChartCard, EmptyState, SegmentedControl, TableWrap, Th, money, pct, shortMoney, vi } from './ui-kit';
import { useApi } from './use-api';
import { cancelRateClass, closeRateClass, ratePct, ratePctCapped, returnRateClass } from '@/lib/shared/close-rate';
import type { CrossPair } from '@/lib/reports/mkt-cross';

export type SaleTeamOption = { id: string; name: string; memberRefs: { id: string; name: string }[] };
type MktTeam = { id: string; name: string; memberIds: string[] };
type Agg = { phones: number; closed: number; net: number; packed: number; cancelled: number; returned: number };
type Metric = 'net' | 'closed' | 'phones' | 'close' | 'packed' | 'go' | 'returnRate' | 'cancelRate' | 'perPhone';
const METRICS: { value: Metric; label: string }[] = [
  { value: 'net', label: 'Doanh thu' }, { value: 'closed', label: 'Đơn chốt' }, { value: 'phones', label: 'SĐT nhận' }, { value: 'close', label: 'TL chốt' },
  { value: 'packed', label: 'Đơn đi' }, { value: 'go', label: 'Tỉ lệ đi' }, { value: 'returnRate', label: 'Tỉ lệ hoàn' }, { value: 'cancelRate', label: 'Tỉ lệ hủy' }, { value: 'perPhone', label: 'DT/SĐT' },
];
const zero = (): Agg => ({ phones: 0, closed: 0, net: 0, packed: 0, cancelled: 0, returned: 0 });
const add = (a: Agg, b: Agg) => { a.phones += b.phones; a.closed += b.closed; a.net += b.net; a.packed += b.packed; a.cancelled += b.cancelled; a.returned += b.returned; };
const OUT_SALE = '__out', OUT_MKT = '__nomkt';

function value(a: Agg, m: Metric): number | null {
  switch (m) {
    case 'net': return a.net; case 'closed': return a.closed; case 'phones': return a.phones; case 'packed': return a.packed;
    case 'close': return ratePctCapped(a.closed, a.phones); case 'go': return ratePct(a.packed, a.closed);
    case 'returnRate': return ratePct(a.returned, a.packed); case 'cancelRate': return ratePct(a.cancelled, a.packed);
    case 'perPhone': return a.phones ? a.net / a.phones : null;
  }
}
const fmt = (v: number | null, m: Metric) => v === null ? '—' : m === 'net' || m === 'perPhone' ? shortMoney(v) : ['close', 'go', 'returnRate', 'cancelRate'].includes(m) ? pct(v) : vi.format(v);
const tone = (v: number | null, m: Metric) => m === 'close' ? closeRateClass(v) : m === 'returnRate' ? returnRateClass(v) : m === 'cancelRate' ? cancelRateClass(v) : '';
const tip = (row: string, col: string, a: Agg) => `${row} chốt cho ${col}: DT ${money(a.net)} · ${vi.format(a.closed)} đơn chốt / ${vi.format(a.phones)} SĐT (TL chốt ${pct(ratePctCapped(a.closed, a.phones))}) · đi ${vi.format(a.packed)} · hoàn ${vi.format(a.returned)} · hủy ${vi.format(a.cancelled)}`;

export function MktCrossCard({ start, end, posIds, saleTeams, mktTeams, onPick }: {
  start: string; end: string; posIds: string[]; saleTeams: SaleTeamOption[]; mktTeams: MktTeam[];
  /** Bấm ô: lọc cả trang theo cặp team Sale × team MKT (null = giữ nguyên). */ onPick: (saleTeamId: string | null, mktTeamId: string | null) => void;
}) {
  const [metric, setMetric] = useState<Metric>('net');
  const [cols, setCols] = useState<'team' | 'marketer'>('team');
  const url = `/api/marketing/cross?${new URLSearchParams({ start, end, posIds: posIds.join(',') })}`;
  const { data, loading } = useApi<{ pairs: CrossPair[]; names: Record<string, string> }>(url, { keep: true });
  const grid = useMemo(() => {
    if (!data) return null;
    const saleOf = new Map<string, string>();
    for (const t of saleTeams) for (const m of t.memberRefs) if (!saleOf.has(m.id)) saleOf.set(m.id, t.id);
    const mktOf = new Map<string, string>();
    for (const t of mktTeams) for (const id of t.memberIds) if (!mktOf.has(id)) mktOf.set(id, t.id);
    const colOf = (mid: string) => cols === 'team' ? mktOf.get(mid) ?? OUT_MKT : mid;
    const cells = new Map<string, Agg>(), rowsT = new Map<string, Agg>(), colsT = new Map<string, Agg>(), total = zero();
    for (const p of data.pairs) {
      const r = saleOf.get(p.closerId) ?? OUT_SALE, c = colOf(p.marketerId);
      const a: Agg = { phones: p.phones, closed: p.closed, net: p.net, packed: p.packed, cancelled: p.cancelled, returned: p.returned };
      const k = `${r}|${c}`;
      if (!cells.has(k)) cells.set(k, zero()); add(cells.get(k)!, a);
      if (!rowsT.has(r)) rowsT.set(r, zero()); add(rowsT.get(r)!, a);
      if (!colsT.has(c)) colsT.set(c, zero()); add(colsT.get(c)!, a);
      add(total, a);
    }
    const rowIds = [...saleTeams.map((t) => t.id).filter((id) => rowsT.has(id)), ...(rowsT.has(OUT_SALE) ? [OUT_SALE] : [])];
    const colIds = [...colsT.keys()].sort((a, b) => (colsT.get(b)!.net - colsT.get(a)!.net));
    const rowName = (id: string) => id === OUT_SALE ? 'Ngoài team Sale' : saleTeams.find((t) => t.id === id)?.name ?? id;
    const colName = (id: string) => cols === 'marketer' ? data.names[id] ?? `MKT ${id.slice(0, 6)}` : id === OUT_MKT ? 'Chưa phân team' : mktTeams.find((t) => t.id === id)?.name ?? id;
    return { cells, rowsT, colsT, total, rowIds, colIds, rowName, colName };
  }, [data, saleTeams, mktTeams, cols]);
  const max = grid ? Math.max(0, ...[...grid.cells.values()].map((a) => value(a, metric) ?? 0)) : 0;
  const shade = (v: number | null) => v === null || max <= 0 || ['returnRate', 'cancelRate'].includes(metric) ? undefined : { background: `color-mix(in srgb, var(--primary) ${Math.round(4 + (v / max) * 26)}%, transparent)` };
  return (
    <ChartCard icon={Grid3x3} title="Team Sale × Team MKT" info="Dòng là team Sale (theo người bấm xác nhận đơn; người ngoài các team Sale gom vào 'Ngoài team Sale'). Cột là team MKT hoặc từng marketer. SĐT nhận: số điện thoại trên đơn MKT tạo trong kỳ, theo Sale được gán. Đơn chốt, doanh thu, đi, hoàn, hủy: đơn xác nhận trong kỳ, đã chốt là chốt. Không có chi phí. Bấm một ô để lọc cả trang theo cặp đó."
      loading={loading && !data}
      collapse={{ storageKey: 'mkt-collapse-cross', summary: grid ? `${vi.format(grid.rowIds.length)} team Sale · ${shortMoney(grid.total.net)}` : undefined }}
      action={<div className="flex flex-wrap items-center gap-2">
        <SegmentedControl<Metric> size="sm" ariaLabel="Số hiện trong ô" value={metric} onChange={setMetric} options={METRICS} />
        <SegmentedControl<'team' | 'marketer'> size="sm" ariaLabel="Cột" value={cols} onChange={setCols} options={[{ value: 'team', label: 'Theo team MKT' }, { value: 'marketer', label: 'Theo marketer' }]} />
      </div>}>
      {!grid ? null : !grid.rowIds.length ? <EmptyState text="Không có đơn Marketing trong phạm vi đang chọn." /> : (
        <TableWrap stickyFirst><table className="tbl compact">
          <thead><tr><Th>Team Sale</Th>{grid.colIds.map((c) => <Th key={c} className="n">{grid.colName(c)}</Th>)}<Th className="n">Tổng</Th></tr></thead>
          <tbody>{grid.rowIds.map((r) => (
            <tr key={r}>
              <td className="whitespace-nowrap font-semibold">{grid.rowName(r)}</td>
              {grid.colIds.map((c) => { const a = grid.cells.get(`${r}|${c}`); const v = a ? value(a, metric) : null; return (
                <td key={c} className={`n ${tone(v, metric)}`} style={shade(v)} title={a ? tip(grid.rowName(r), grid.colName(c), a) : undefined}>
                  {a ? <button type="button" className="tap w-full text-right" onClick={() => onPick(r === OUT_SALE ? null : r, cols === 'team' && c !== OUT_MKT ? c : null)}>{fmt(v, metric)}</button> : <span className="text-ink-4">—</span>}
                </td>
              ); })}
              <td className={`n font-semibold ${tone(value(grid.rowsT.get(r)!, metric), metric)}`} title={tip(grid.rowName(r), 'mọi team MKT', grid.rowsT.get(r)!)}>{fmt(value(grid.rowsT.get(r)!, metric), metric)}</td>
            </tr>
          ))}</tbody>
          <tfoot><tr><td>Tổng</td>{grid.colIds.map((c) => <td key={c} className={`n ${tone(value(grid.colsT.get(c)!, metric), metric)}`}>{fmt(value(grid.colsT.get(c)!, metric), metric)}</td>)}<td className={`n ${tone(value(grid.total, metric), metric)}`}>{fmt(value(grid.total, metric), metric)}</td></tr></tfoot>
        </table></TableWrap>
      )}
    </ChartCard>
  );
}
