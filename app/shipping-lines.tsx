'use client';

// Vận đơn theo dòng sản phẩm và team MKT (08/10/2026, anh Vũ): đơn đi, đơn hoàn, giá trị đơn chuyển, giá trị hoàn, tỷ lệ hoàn theo đơn và
// theo giá trị. Dữ liệu: /api/reports/shipping-lines (lib/shipping-lines.ts).
import { useMemo, useState } from 'react';
import { PackageX, Truck } from 'lucide-react';
import { useApi } from './use-api';
import { ChartCard, EmptyState, ErrorBox, SegmentedControl, SkeletonTable, TableWrap, money, pct, vi } from './ui-kit';

type Money = { orders: number; net: number };
type Stats = { closed: Money; pending: Money; sent: Money; delivered: Money; returned: Money; cancelled: Money };
type Row = { line: string } & Stats;
type Team = { teamId: string; teamName: string; lines: Row[]; total: Stats };
type Report = { total: Stats; lines: Row[]; teams: Team[]; teamMembers: Record<string, string[]>; definitions: Record<string, string>; otherProducts?: { name: string; orders: number }[] };
type Dim = 'line' | 'tag' | 'main' | 'product';

const DIMS: { value: Dim; label: string; title: string }[] = [
  { value: 'line', label: 'Loại đơn', title: 'Theo combo trong đơn: Oxy (kèm Bổ đậm đặc), SK + GK, Gentadox, Vita Plus, Mega Green' },
  { value: 'tag', label: 'Theo nhãn đơn', title: 'Mỗi nhãn dòng sản phẩm trên đơn Pancake (Oxy, SK + GK, Thủy sản…)' },
  { value: 'main', label: 'Nhóm chính', title: 'Kháng sinh · Combo · Khác' },
  { value: 'product', label: 'Theo sản phẩm', title: 'Từng sản phẩm trong đơn (không tính quà tặng)' },
];
const rate = (a: number, b: number) => (b ? a / b * 100 : null);

function LineTable({ rows, total, totalLabel }: { rows: Row[]; total?: Stats; totalLabel?: string }) {
  const line = (name: string, s: Stats, strong = false) => (
    <tr key={name} className={strong ? 'font-semibold' : undefined}>
      <td>{name}</td>
      <td className="n">{vi.format(s.closed.orders)}</td>
      <td className="n">{vi.format(s.sent.orders)}</td>
      <td className="n">{vi.format(s.returned.orders)}</td>
      <td className="n">{pct(rate(s.returned.orders, s.sent.orders))}</td>
      <td className="n">{money(s.sent.net)}</td>
      <td className="n">{money(s.returned.net)}</td>
      <td className="n">{pct(rate(s.returned.net, s.sent.net))}</td>
      <td className="n">{vi.format(s.delivered.orders)}</td>
      <td className="n">{vi.format(s.pending.orders)}</td>
    </tr>
  );
  return (
    <TableWrap minWidth={880} stickyFirst>
      <table className="tbl">
        <thead><tr>
          <th>Dòng sản phẩm</th><th className="n">Đơn chốt</th><th className="n">Đơn đi</th><th className="n">Đơn hoàn</th><th className="n">% hoàn (đơn)</th>
          <th className="n">Giá trị đơn chuyển</th><th className="n">Giá trị hoàn</th><th className="n">% hoàn (giá trị)</th><th className="n">Đã nhận</th><th className="n">Chưa gửi</th>
        </tr></thead>
        <tbody>
          {rows.map((r) => line(r.line, r))}
          {total && line(totalLabel ?? 'Tổng', total, true)}
        </tbody>
      </table>
    </TableWrap>
  );
}

export function ShippingLines({ start, end, posIds, basis, team }: { start: string; end: string; posIds: string[]; basis: 'confirmed' | 'created'; team: string }) {
  const [dim, setDim] = useState<Dim>('line');
  const [teamId, setTeamId] = useState('__all');
  const url = useMemo(() => `/api/reports/shipping-lines?${new URLSearchParams({ start, end, posIds: posIds.join(','), basis, team, dim })}`, [start, end, posIds, basis, team, dim]);
  const { data, loading, error, reload } = useApi<Report>(url, { keep: false });
  const teams = data?.teams ?? [];
  const shown = teamId === '__all' ? null : teams.find((t) => t.teamId === teamId) ?? null;
  const exportExcel = async () => {
    if (!data) return;
    const XLSX = await import('xlsx');
    const head = ['Team MKT', 'Dòng sản phẩm', 'Đơn chốt', 'Đơn đi', 'Đơn hoàn', '% hoàn (đơn)', 'Giá trị đơn chuyển', 'Giá trị hoàn', '% hoàn (giá trị)', 'Đã nhận', 'Chưa gửi'];
    const r2 = (v: number | null) => (v === null ? '' : Number(v.toFixed(2)));
    const row = (t: string, l: string, s: Stats) => [t, l, s.closed.orders, s.sent.orders, s.returned.orders, r2(rate(s.returned.orders, s.sent.orders)), Math.round(s.sent.net), Math.round(s.returned.net), r2(rate(s.returned.net, s.sent.net)), s.delivered.orders, s.pending.orders];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([[`Vận đơn theo dòng sản phẩm · ${start} → ${end}`], [], head,
      ...data.lines.map((l) => row('Tất cả', l.line, l)), row('Tất cả', 'Tổng (mỗi đơn một lần)', data.total),
      ...data.teams.flatMap((t) => [...t.lines.map((l) => row(t.teamName, l.line, l)), row(t.teamName, 'Tổng', t.total)])]), 'Vận đơn');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(Object.entries(data.definitions)), 'Cách tính');
    XLSX.writeFile(wb, `van-don-dong-san-pham-${start}-${end}.xlsx`);
  };
  return (
    <ChartCard icon={Truck} title="Vận đơn theo dòng sản phẩm"
      subtitle="Mỗi dòng đi được bao nhiêu đơn, hoàn bao nhiêu, giá trị đơn chuyển và giá trị hoàn, tỷ lệ hoàn theo đơn và theo giá trị. Chọn team MKT để xem riêng từng team."
      info={data ? Object.entries(data.definitions).map(([k, v]) => `${k}: ${v}`).join('\n') : undefined}
      action={<button type="button" className="text-sm text-primary underline" onClick={exportExcel} disabled={!data}>Xuất Excel</button>}>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <SegmentedControl size="sm" ariaLabel="Cách chia dòng sản phẩm" options={DIMS} value={dim} onChange={setDim} />
        <SegmentedControl size="sm" ariaLabel="Team MKT" value={teamId} onChange={setTeamId}
          options={[{ value: '__all', label: 'Tất cả' }, ...teams.map((t) => ({ value: t.teamId, label: t.teamName, title: (data?.teamMembers[t.teamId] ?? []).join(', ') || undefined }))]} />
      </div>
      {error && <ErrorBox error={error} onRetry={reload} />}
      {!data && loading && <SkeletonTable rows={5} cols={8} />}
      {data && !data.lines.length && <EmptyState text="Không có đơn chốt trong kỳ đã chọn." />}
      {data && !!data.lines.length && (shown
        ? <>
            <p className="mb-2 flex items-center gap-2 text-sm text-ink-3"><PackageX className="size-4" />{shown.teamName}{data.teamMembers[shown.teamId]?.length ? ` · ${data.teamMembers[shown.teamId].join(', ')}` : ''}</p>
            <LineTable rows={shown.lines} total={shown.lines.length > 1 ? shown.total : undefined} totalLabel={`Tổng ${shown.teamName}`} />
          </>
        : <LineTable rows={data.lines} total={data.total} totalLabel="Tổng (mỗi đơn một lần)" />)}
      {dim === 'line' && !!data?.otherProducts?.length && (
        <details className="mt-3 text-sm text-ink-3">
          <summary className="cursor-pointer">Sản phẩm đang rơi vào dòng Khác ({data.otherProducts.length})</summary>
          <ul className="mt-2 grid gap-1 sm:grid-cols-2">
            {data.otherProducts.map((p) => <li key={p.name}>{p.name} · {p.orders} đơn</li>)}
          </ul>
        </details>
      )}
    </ChartCard>
  );
}
