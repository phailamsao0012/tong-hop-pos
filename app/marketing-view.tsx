'use client';

import { useEffect, useMemo, useState } from 'react';
import { BarChart3, Boxes, CheckCircle2, Megaphone, PackageCheck, Phone, Target, Truck, UsersRound, WalletCards } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { POS } from '@/lib/report-model';
import { todayVn } from '@/lib/report-time';
import type { MarketingTeam } from '@/lib/marketing-teams';
import { PeriodToolbar, PosChips, presetRange } from './overview-view';
import { ChartCard, Definitions, EmptyState, ErrorBox, KpiCard, PageHeader, ProgressBar, SkeletonKpis, SortTh, StatusChip, TableWrap, Toolbar, money, pct, shortMoney, toast, useSort, vi } from './ui-kit';
import { useApi } from './use-api';
import { StaleChip } from './stale-chip';

type Basis = 'created' | 'confirmed';
type Stage = 'all' | 'unconfirmed' | 'confirmed' | 'confirmed_now' | 'stock' | 'packing' | 'waiting' | 'shipping' | 'shipped' | 'delivered' | 'returned' | 'cancelled' | 'deleted';
type Summary = {
  orders: number; phones: number; gross: number; net: number; selectedRate: number | null; averageOrder: number | null; revenuePerPhone: number | null;
  createdOrders: number; createdPhones: number; confirmedOrders: number; confirmationRate: number | null;
  shippedOrders: number; shippingRate: number | null; deliveredOrders: number; deliveryRate: number | null;
  returnedOrders: number; cancelledOrders: number;
};
type Marketer = Summary & { marketerId: string; marketerName: string; marketingTeamName: string };
type MarketingTeamSummary = Summary & { marketingTeamId: string; marketingTeamName: string; marketerCount: number };
type Product = { productKey: string; productName: string; orders: number; phones: number; quantity: number; lineTotal: number };
type RecentOrder = { id: string; orderId: string; posName: string; phone: string | null; createdAt: string; confirmedAt: string | null; status: string; marketer: string | null; seller: string | null; care: string | null; net: number; source: string | null; note: string | null };
type Report = {
  period: { start: string; end: string }; basis: Basis; stage: Stage; summary: Summary;
  byMarketer: Marketer[]; byTeam: MarketingTeamSummary[]; byProduct: Product[]; recentOrders: RecentOrder[];
  marketerOptions: { id: string; name: string }[]; sellerOptions: { id: string; name: string }[]; careOptions: { id: string; name: string }[];
  sourceOptions: string[];
  productOptions: { key: string; name: string; orders: number }[];
  definitions: Record<string, string>;
};
type SortKey = 'name' | 'team' | 'created' | 'phones' | 'confirmed' | 'rate' | 'orders' | 'net' | 'perPhone' | 'aov' | 'shipped' | 'delivered' | 'delivery' | 'returned';

const BASES: Record<Basis, string> = { created: 'Theo ngày tạo đơn', confirmed: 'Theo ngày xác nhận' };
const STAGES: Record<Stage, string> = {
  all: 'Mọi đơn chưa xóa', unconfirmed: 'Mới / chờ xác nhận', confirmed: 'Đơn chốt (đang hiệu lực)', confirmed_now: 'Hiện đang: đã xác nhận',
  stock: 'Chờ hàng / in / đã in', packing: 'Đang đóng hàng', waiting: 'Chờ chuyển hàng', shipping: 'Đã gửi hàng · đang giao',
  shipped: 'Đã cho ĐVVC / trạng thái sau đó', delivered: 'Đã nhận / đã thu tiền', returned: 'Đang hoàn / đã hoàn', cancelled: 'Đã hủy', deleted: 'Đã xóa',
};
const SORTS: Record<SortKey, string> = {
  name: 'Tên marketer', team: 'Team Marketing', created: 'Đơn tạo', phones: 'Số điện thoại', confirmed: 'Đơn xác nhận', rate: 'Tỷ lệ xác nhận', orders: 'Đơn theo mốc', net: 'Doanh thu', perPhone: 'Doanh thu / SĐT',
  aov: 'AOV', shipped: 'Đã cho ĐVVC', delivered: 'Đã nhận', delivery: 'Tỷ lệ giao thành công', returned: 'Hoàn / hủy',
};
const TEAM_SORTS = { ...SORTS, name: 'Tên team', team: 'Tên team' };

function FilterSelect({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: { id: string; name: string }[] }) {
  return <Select value={value} items={{ __all: `Tất cả ${label}`, ...Object.fromEntries(options.map((x) => [x.id, x.name])) }} onValueChange={(v) => onChange(String(v))}>
    <SelectTrigger className="min-w-44 max-w-72" aria-label={label}><SelectValue /></SelectTrigger>
    <SelectContent><SelectItem value="__all">Tất cả {label}</SelectItem>{options.map((x) => <SelectItem key={x.id} value={x.id}>{x.name}</SelectItem>)}</SelectContent>
  </Select>;
}

function MarketingTeamSelect({ teams, value, onChange, label = 'Team Marketing' }: { teams: MarketingTeam[]; value: string; onChange: (value: string) => void; label?: string }) {
  return <Select value={value} items={{ __all: 'Tất cả team MKT', __unassigned: 'Chưa phân nhóm', ...Object.fromEntries(teams.map((t) => [t.id, `${t.name} · ${t.memberIds.length} người`])) }} onValueChange={(v) => onChange(String(v))}>
    <SelectTrigger className="min-w-48" aria-label={label}><SelectValue /></SelectTrigger>
    <SelectContent><SelectItem value="__all">Tất cả team MKT</SelectItem><SelectItem value="__unassigned">Chưa phân nhóm</SelectItem>{teams.map((t) => <SelectItem key={t.id} value={t.id}>{t.name} · {t.memberIds.length} người</SelectItem>)}</SelectContent>
  </Select>;
}

export function MarketingView({ onManageTeams }: { onManageTeams?: () => void }) {
  const today = todayVn();
  const [preset, setPreset] = useState('month');
  const [start, setStart] = useState(`${today.slice(0, 7)}-01`);
  const [end, setEnd] = useState(today);
  const [posIds, setPosIds] = useState<string[]>(POS.map((p) => p.id));
  const [basis, setBasis] = useState<Basis>('confirmed');
  const [stage, setStage] = useState<Stage>('confirmed');
  const [marketerId, setMarketerId] = useState('__all');
  const [marketingTeamId, setMarketingTeamId] = useState('__all');
  const [rankingMode, setRankingMode] = useState<'marketer' | 'team'>('marketer');
  const [marketingTeams, setMarketingTeams] = useState<MarketingTeam[]>([]);
  const [sellerId, setSellerId] = useState('__all');
  const [careId, setCareId] = useState('__all');
  const [productKey, setProductKey] = useState('__all');
  const [source, setSource] = useState('__all');
  const sort = useSort<SortKey>('net');
  useEffect(() => {
    void fetch('/api/marketing-teams', { cache: 'no-store' }).then((r) => r.ok ? r.json() as Promise<{ teams: MarketingTeam[] }> : { teams: [] }).then((body) => setMarketingTeams(body.teams)).catch(() => undefined);
  }, []);

  const url = useMemo(() => {
    const p = new URLSearchParams({ start, end, posIds: posIds.join(','), basis, stage, marketingTeamId });
    if (marketerId !== '__all') p.set('marketerId', marketerId);
    if (sellerId !== '__all') p.set('sellerId', sellerId);
    if (careId !== '__all') p.set('careId', careId);
    if (productKey !== '__all') p.set('productKey', productKey);
    if (source !== '__all') p.set('source', source);
    return `/api/reports/marketing?${p}`;
  }, [start, end, posIds, basis, stage, marketingTeamId, marketerId, sellerId, careId, productKey, source]);
  const { data, at, stale, loading, error, reload } = useApi<Report>(url, { keep: false });
  const s = data?.summary;
  const rows = useMemo(() => sort.apply(data?.byMarketer ?? [], (r, k) => {
    switch (k) {
      case 'name': return r.marketerName;
      case 'team': return r.marketingTeamName;
      case 'created': return r.createdOrders;
      case 'phones': return r.createdPhones;
      case 'confirmed': return r.confirmedOrders;
      case 'rate': return r.confirmationRate;
      case 'orders': return r.orders;
      case 'net': return r.net;
      case 'perPhone': return r.revenuePerPhone;
      case 'aov': return r.averageOrder;
      case 'shipped': return r.shippedOrders;
      case 'delivered': return r.deliveredOrders;
      case 'delivery': return r.deliveryRate;
      case 'returned': return r.returnedOrders + r.cancelledOrders;
      default: return 0;
    }
  }), [data, sort]);
  const teamRows = useMemo(() => sort.apply(data?.byTeam ?? [], (r, k) => {
    switch (k) {
      case 'name': case 'team': return r.marketingTeamName;
      case 'created': return r.createdOrders;
      case 'phones': return r.createdPhones;
      case 'confirmed': return r.confirmedOrders;
      case 'rate': return r.confirmationRate;
      case 'orders': return r.orders;
      case 'net': return r.net;
      case 'perPhone': return r.revenuePerPhone;
      case 'aov': return r.averageOrder;
      case 'shipped': return r.shippedOrders;
      case 'delivered': return r.deliveredOrders;
      case 'delivery': return r.deliveryRate;
      case 'returned': return r.returnedOrders + r.cancelledOrders;
      default: return 0;
    }
  }), [data, sort]);
  const productTotals = useMemo(() => (data?.byProduct ?? []).reduce((a, r) => ({ quantity: a.quantity + r.quantity, lineTotal: a.lineTotal + r.lineTotal }), { quantity: 0, lineTotal: 0 }), [data]);

  const exportExcel = async () => {
    if (!data) return;
    const XLSX = await import('xlsx');
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
      ['Marketer', 'Team Marketing', 'Đơn tạo', 'SĐT trên đơn', 'Đơn xác nhận', 'Tỷ lệ xác nhận %', `Đơn: ${STAGES[stage]}`, 'Doanh thu theo mốc', 'Doanh thu / SĐT', 'AOV', 'Đã cho ĐVVC', 'Đã nhận', 'Tỷ lệ giao TC %', 'Hoàn', 'Hủy'],
      ...rows.map((r) => [r.marketerName, r.marketingTeamName, r.createdOrders, r.createdPhones, r.confirmedOrders, r.confirmationRate ?? '', r.orders, r.net, Math.round(r.revenuePerPhone ?? 0), Math.round(r.averageOrder ?? 0), r.shippedOrders, r.deliveredOrders, r.deliveryRate ?? '', r.returnedOrders, r.cancelledOrders]),
    ]), 'Hiệu suất marketer');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
      ['Team Marketing', 'Marketer có dữ liệu', 'Đơn tạo', 'SĐT duy nhất trong team', 'Đơn xác nhận', 'Tỷ lệ xác nhận %', `Đơn: ${STAGES[stage]}`, 'Doanh thu theo mốc', 'Doanh thu / SĐT', 'AOV', 'Đã cho ĐVVC', 'Đã nhận', 'Tỷ lệ giao TC %', 'Hoàn', 'Hủy'],
      ...teamRows.map((r) => [r.marketingTeamName, r.marketerCount, r.createdOrders, r.createdPhones, r.confirmedOrders, r.confirmationRate ?? '', r.orders, r.net, Math.round(r.revenuePerPhone ?? 0), Math.round(r.averageOrder ?? 0), r.shippedOrders, r.deliveredOrders, r.deliveryRate ?? '', r.returnedOrders, r.cancelledOrders]),
      ['TỔNG ĐƠN DUY NHẤT', '', s?.createdOrders ?? 0, s?.createdPhones ?? 0, s?.confirmedOrders ?? 0, s?.confirmationRate ?? '', s?.orders ?? 0, s?.net ?? 0, Math.round(s?.revenuePerPhone ?? 0), Math.round(s?.averageOrder ?? 0), s?.shippedOrders ?? 0, s?.deliveredOrders ?? 0, s?.deliveryRate ?? '', s?.returnedOrders ?? 0, s?.cancelledOrders ?? 0],
    ]), 'Hiệu suất team MKT');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
      ['Sản phẩm Pancake', 'Đơn có sản phẩm', 'SĐT', 'Số lượng bán', 'Thành tiền dòng sản phẩm'],
      ...data.byProduct.map((r) => [r.productName, r.orders, r.phones, r.quantity, r.lineTotal]),
      ['TỔNG DÒNG SẢN PHẨM', '', '', productTotals.quantity, productTotals.lineTotal],
      ['TỔNG ĐƠN DUY NHẤT', s?.orders ?? 0, s?.phones ?? 0, '', s?.net ?? 0],
    ]), 'Sản phẩm');
    XLSX.writeFile(wb, `marketing-pancake_${start}_${end}.xlsx`);
    toast('Đã xuất báo cáo Marketing từ dữ liệu Pancake.');
  };

  return (
    <div className="space-y-5">
      <PageHeader eyebrow="Dữ liệu marketer trên đơn Pancake" title="Tổng quan Marketing"
        subtitle="Chỉ dùng dữ liệu Pancake có đầy đủ; không ước tính chi phí Ads hoặc khách chưa tạo đơn."
        badge={<StatusChip tone="green">Nguồn Pancake POS</StatusChip>}
        actions={onManageTeams ? <button type="button" className="btn" onClick={onManageTeams}><UsersRound size={14} /> Quản lý team MKT</button> : undefined} />
      <PeriodToolbar preset={preset} start={start} end={end}
        onPreset={(v) => { setPreset(v); const r = presetRange(v, today); if (r) { setStart(r.start); setEnd(r.end); } }}
        onStart={(v) => { setPreset('custom'); setStart(v); }} onEnd={(v) => { setPreset('custom'); setEnd(v); }}
        loading={loading} onReload={reload} onExport={exportExcel} exportDisabled={!data} />
      <PosChips posIds={posIds} onChange={setPosIds} />
      <Toolbar>
        <span className="px-1 text-[12.5px] font-semibold text-ink-2">Cách tính</span>
        <MarketingTeamSelect teams={marketingTeams} value={marketingTeamId} onChange={(v) => { setMarketingTeamId(v); setMarketerId('__all'); }} />
        <Select value={basis} items={BASES} onValueChange={(v) => setBasis(v as Basis)}>
          <SelectTrigger className="min-w-48" aria-label="Mốc thời gian"><SelectValue /></SelectTrigger>
          <SelectContent>{Object.entries(BASES).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}</SelectContent>
        </Select>
        <Select value={stage} items={STAGES} onValueChange={(v) => setStage(v as Stage)}>
          <SelectTrigger className="min-w-56" aria-label="Trạng thái hoặc mốc đơn"><SelectValue /></SelectTrigger>
          <SelectContent>{Object.entries(STAGES).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}</SelectContent>
        </Select>
        <FilterSelect label="marketer" value={marketerId} onChange={setMarketerId} options={data?.marketerOptions ?? []} />
        <FilterSelect label="Sale" value={sellerId} onChange={setSellerId} options={data?.sellerOptions ?? []} />
        <FilterSelect label="CSKH" value={careId} onChange={setCareId} options={data?.careOptions ?? []} />
        <Select value={productKey} items={{ __all: 'Tất cả sản phẩm', ...Object.fromEntries((data?.productOptions ?? []).map((x) => [x.key, x.name])) }} onValueChange={(v) => setProductKey(String(v))}>
          <SelectTrigger className="min-w-56" aria-label="Sản phẩm"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="__all">Tất cả sản phẩm</SelectItem>{(data?.productOptions ?? []).map((x) => <SelectItem key={x.key} value={x.key}>{x.name} · {vi.format(x.orders)} đơn</SelectItem>)}</SelectContent>
        </Select>
      </Toolbar>
      <Toolbar>
        <span className="px-1 text-[12.5px] font-semibold text-ink-2">Nguồn đơn</span>
        <FilterSelect label="nguồn đơn" value={source} onChange={setSource} options={(data?.sourceOptions ?? []).map((v) => ({ id: v, name: v }))} />
        <span className="text-xs text-ink-3">Page, bài viết và mã quảng cáo chưa có trường chuẩn cho toàn bộ lịch sử đơn.</span>
        <button type="button" className="rounded-lg border border-line px-3 py-2 text-xs font-medium text-ink-2 hover:bg-surface-2" onClick={() => {
          setMarketingTeamId('__all'); setMarketerId('__all'); setSellerId('__all'); setCareId('__all'); setProductKey('__all');
          setSource('__all'); setStage('confirmed'); setBasis('confirmed');
        }}>Xóa bộ lọc</button>
      </Toolbar>

      {error && <ErrorBox error={error} onRetry={reload} />}
      {loading && !data ? <SkeletonKpis count={6} /> : s ? <>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-7">
          <KpiCard icon={Megaphone} tone="green" label={STAGES[stage]} value={vi.format(s.orders)} note={BASES[basis]} tooltip="Số đơn có Marketer trên Pancake, theo mốc thời gian và trạng thái đang chọn." />
          <KpiCard icon={Phone} tone="blue" label="SĐT trên đơn" value={vi.format(s.phones)} note="SĐT duy nhất · không phải tổng lead" tooltip="Chỉ đếm số điện thoại xuất hiện trên đơn Pancake của marketer." />
          <KpiCard icon={CheckCircle2} tone="teal" label="Tỷ lệ xác nhận" value={pct(s.confirmationRate)} note={`${vi.format(s.confirmedOrders)} / ${vi.format(s.createdOrders)} đơn`} />
          <KpiCard icon={WalletCards} tone="lime" label="Doanh thu theo mốc" value={shortMoney(s.net)} note={`AOV ${money(s.averageOrder)}`} />
          <KpiCard icon={Target} tone="blue" label="Doanh thu / SĐT" value={money(s.revenuePerPhone)} note="Trên số điện thoại có đơn theo mốc" />
          <KpiCard icon={Truck} tone="orange" label="Đã cho ĐVVC" value={vi.format(s.shippedOrders)} note={`${pct(s.shippingRate)} trên đơn xác nhận`} />
          <KpiCard icon={PackageCheck} tone="purple" label="Đã nhận / thu tiền" value={vi.format(s.deliveredOrders)} note={`${pct(s.deliveryRate)} trên đơn đã gửi`} />
        </div>

        <ChartCard icon={Target} title="Phễu đơn Marketing" subtitle="Cohort đơn có Marketer được tạo trong kỳ · trạng thái hiện tại trên Pancake">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {[
              ['Đơn tạo', s.createdOrders, 100, 'gray'], ['Đã xác nhận', s.confirmedOrders, s.confirmationRate, 'blue'],
              ['Đã cho ĐVVC', s.shippedOrders, s.createdOrders ? s.shippedOrders / s.createdOrders * 100 : null, 'orange'],
              ['Đã nhận / thu tiền', s.deliveredOrders, s.createdOrders ? s.deliveredOrders / s.createdOrders * 100 : null, 'green'],
              ['Hoàn / hủy', s.returnedOrders + s.cancelledOrders, s.createdOrders ? (s.returnedOrders + s.cancelledOrders) / s.createdOrders * 100 : null, 'red'],
            ].map(([label, value, rate, tone]) => <div key={String(label)} className="rounded-xl border border-line bg-surface-2 p-4">
              <div className="text-xs font-medium text-ink-3">{label}</div><div className="num mt-1 text-2xl text-ink">{vi.format(Number(value))}</div>
              <div className="mt-2 flex items-center gap-2"><ProgressBar value={Number(rate ?? 0)} max={100} width={72} color={`var(--t-${tone})`} /><span className="num text-xs text-ink-3">{pct(Number(rate ?? 0))}</span></div>
            </div>)}
          </div>
        </ChartCard>

        <ChartCard icon={BarChart3} title={rankingMode === 'team' ? 'Xếp hạng team Marketing' : 'Xếp hạng marketer'} subtitle={`Chỉ số theo mốc: ${STAGES[stage]} · phễu theo đơn tạo trong kỳ`}
          action={<div className="flex flex-wrap items-center gap-2">
            <fieldset className="flex rounded-lg border border-line p-0.5"><legend className="sr-only">Cấp xếp hạng</legend>
              <button type="button" className={`rounded-md px-3 py-1.5 text-xs font-semibold ${rankingMode === 'team' ? 'bg-primary text-white' : 'text-ink-2 hover:bg-surface-2'}`} aria-pressed={rankingMode === 'team'} onClick={() => { setRankingMode('team'); if (sort.key === 'team') sort.setKey('net'); }}>Theo team</button>
              <button type="button" className={`rounded-md px-3 py-1.5 text-xs font-semibold ${rankingMode === 'marketer' ? 'bg-primary text-white' : 'text-ink-2 hover:bg-surface-2'}`} aria-pressed={rankingMode === 'marketer'} onClick={() => setRankingMode('marketer')}>Theo nhân viên</button>
            </fieldset>
            <MarketingTeamSelect teams={marketingTeams} value={marketingTeamId} label="Lọc team trong xếp hạng" onChange={(v) => { setMarketingTeamId(v); setMarketerId('__all'); }} />
            <Select value={sort.key} items={rankingMode === 'team' ? TEAM_SORTS : SORTS} onValueChange={(v) => sort.setKey(v as SortKey)}><SelectTrigger className="min-w-44" aria-label="Sắp xếp xếp hạng Marketing"><SelectValue /></SelectTrigger><SelectContent>{Object.entries(rankingMode === 'team' ? TEAM_SORTS : SORTS).filter(([k]) => rankingMode !== 'team' || k !== 'team').map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}</SelectContent></Select>
          </div>}>
          {rankingMode === 'team' ? (teamRows.length ? <>
            <p className="mb-3 text-xs text-ink-3">Bấm tên team để xem thành viên. SĐT được đếm duy nhất trong từng team; hàng tổng đếm duy nhất trên toàn bộ phạm vi lọc.</p>
            <TableWrap><table className="tbl"><thead><tr><th>#</th><SortTh k="name" label="Team Marketing" sort={sort} align="left" /><th className="n">Marketer</th><SortTh k="created" label="Đơn tạo" sort={sort} /><SortTh k="phones" label="SĐT" sort={sort} /><SortTh k="confirmed" label="Đơn XN" sort={sort} /><SortTh k="rate" label="Tỷ lệ XN" sort={sort} /><SortTh k="orders" label="Đơn theo mốc" sort={sort} /><SortTh k="net" label="Doanh thu" sort={sort} /><SortTh k="perPhone" label="DT / SĐT" sort={sort} /><SortTh k="aov" label="AOV" sort={sort} /><SortTh k="shipped" label="Đã cho ĐVVC" sort={sort} /><SortTh k="delivered" label="Đã nhận" sort={sort} /><SortTh k="delivery" label="% giao TC" sort={sort} /><SortTh k="returned" label="Hoàn / hủy" sort={sort} /></tr></thead>
              <tbody>{teamRows.map((r, i) => <tr key={r.marketingTeamId}><td className="num text-ink-3">{i + 1}</td><td><button type="button" className="font-semibold text-primary underline-offset-2 hover:underline" onClick={() => { setMarketingTeamId(r.marketingTeamId); setMarketerId('__all'); setRankingMode('marketer'); }}>{r.marketingTeamName}</button></td><td className="n">{vi.format(r.marketerCount)}</td><td className="n">{vi.format(r.createdOrders)}</td><td className="n">{vi.format(r.createdPhones)}</td><td className="n">{vi.format(r.confirmedOrders)}</td><td className="n">{pct(r.confirmationRate)}</td><td className="n">{vi.format(r.orders)}</td><td className="n">{money(r.net)}</td><td className="n">{money(r.revenuePerPhone)}</td><td className="n">{money(r.averageOrder)}</td><td className="n">{vi.format(r.shippedOrders)}</td><td className="n">{vi.format(r.deliveredOrders)}</td><td className="n">{pct(r.deliveryRate)}</td><td className="n">{vi.format(r.returnedOrders)} / {vi.format(r.cancelledOrders)}</td></tr>)}</tbody>
              <tfoot><tr><td><span className="sr-only">Tổng</span></td><td>Tổng đơn duy nhất</td><td className="n">{vi.format(rows.length)}</td><td className="n">{vi.format(s.createdOrders)}</td><td className="n">{vi.format(s.createdPhones)}</td><td className="n">{vi.format(s.confirmedOrders)}</td><td className="n">{pct(s.confirmationRate)}</td><td className="n">{vi.format(s.orders)}</td><td className="n">{money(s.net)}</td><td className="n">{money(s.revenuePerPhone)}</td><td className="n">{money(s.averageOrder)}</td><td className="n">{vi.format(s.shippedOrders)}</td><td className="n">{vi.format(s.deliveredOrders)}</td><td className="n">{pct(s.deliveryRate)}</td><td className="n">{vi.format(s.returnedOrders)} / {vi.format(s.cancelledOrders)}</td></tr></tfoot></table></TableWrap>
          </> : <EmptyState text="Không có team hoặc đơn Marketing trong phạm vi đang chọn." />) : rows.length ? <TableWrap><table className="tbl"><thead><tr><th>#</th><SortTh k="name" label="Marketer" sort={sort} align="left" /><SortTh k="team" label="Team" sort={sort} align="left" /><SortTh k="created" label="Đơn tạo" sort={sort} /><SortTh k="phones" label="SĐT" sort={sort} /><SortTh k="confirmed" label="Đơn XN" sort={sort} /><SortTh k="rate" label="Tỷ lệ XN" sort={sort} /><SortTh k="orders" label="Đơn theo mốc" sort={sort} /><SortTh k="net" label="Doanh thu" sort={sort} /><SortTh k="perPhone" label="DT / SĐT" sort={sort} /><SortTh k="aov" label="AOV" sort={sort} /><SortTh k="shipped" label="Đã cho ĐVVC" sort={sort} /><SortTh k="delivered" label="Đã nhận" sort={sort} /><SortTh k="delivery" label="% giao TC" sort={sort} /><SortTh k="returned" label="Hoàn / hủy" sort={sort} /></tr></thead>
            <tbody>{rows.map((r, i) => <tr key={r.marketerId}><td className="num text-ink-3">{i + 1}</td><td className="font-medium">{r.marketerName}</td><td className="whitespace-nowrap text-xs text-ink-2">{r.marketingTeamName}</td><td className="n">{vi.format(r.createdOrders)}</td><td className="n">{vi.format(r.createdPhones)}</td><td className="n">{vi.format(r.confirmedOrders)}</td><td className="n">{pct(r.confirmationRate)}</td><td className="n">{vi.format(r.orders)}</td><td className="n">{money(r.net)}</td><td className="n">{money(r.revenuePerPhone)}</td><td className="n">{money(r.averageOrder)}</td><td className="n">{vi.format(r.shippedOrders)}</td><td className="n">{vi.format(r.deliveredOrders)}</td><td className="n">{pct(r.deliveryRate)}</td><td className="n">{vi.format(r.returnedOrders)} / {vi.format(r.cancelledOrders)}</td></tr>)}</tbody>
            <tfoot><tr><td><span className="sr-only">Tổng</span></td><td>Tổng đơn duy nhất</td><td>{marketingTeamId === '__all' ? 'Mọi team' : marketingTeamId === '__unassigned' ? 'Chưa phân nhóm' : marketingTeams.find((t) => t.id === marketingTeamId)?.name ?? 'Team đã chọn'}</td><td className="n">{vi.format(s.createdOrders)}</td><td className="n">{vi.format(s.createdPhones)}</td><td className="n">{vi.format(s.confirmedOrders)}</td><td className="n">{pct(s.confirmationRate)}</td><td className="n">{vi.format(s.orders)}</td><td className="n">{money(s.net)}</td><td className="n">{money(s.revenuePerPhone)}</td><td className="n">{money(s.averageOrder)}</td><td className="n">{vi.format(s.shippedOrders)}</td><td className="n">{vi.format(s.deliveredOrders)}</td><td className="n">{pct(s.deliveryRate)}</td><td className="n">{vi.format(s.returnedOrders)} / {vi.format(s.cancelledOrders)}</td></tr></tfoot></table></TableWrap> : <EmptyState text="Không có đơn gắn Marketer trong phạm vi đang chọn." />}
        </ChartCard>

        <ChartCard icon={Boxes} title="Sản phẩm do Marketing mang về" subtitle="Từng dòng sản phẩm bán trên đơn Pancake · loại dòng đánh dấu quà tặng hoặc tên Quà Tặng">
          {data.byProduct.length ? <TableWrap><table className="tbl"><thead><tr><th>#</th><th>Sản phẩm</th><th className="n">Đơn có SP</th><th className="n">SĐT</th><th className="n">SL bán</th><th className="n">Thành tiền dòng SP</th></tr></thead><tbody>
            {data.byProduct.map((r, i) => <tr key={r.productKey}><td className="num text-ink-3">{i + 1}</td><td className="font-medium">{r.productName}</td><td className="n">{vi.format(r.orders)}</td><td className="n">{vi.format(r.phones)}</td><td className="n">{vi.format(r.quantity)}</td><td className="n">{money(r.lineTotal)}</td></tr>)}
          </tbody><tfoot><tr><td><span className="sr-only">Tổng dòng sản phẩm</span></td><td>Tổng dòng sản phẩm</td><td className="n">—</td><td className="n">—</td><td className="n">{vi.format(productTotals.quantity)}</td><td className="n">{money(productTotals.lineTotal)}</td></tr><tr><td><span className="sr-only">Tổng đơn duy nhất</span></td><td>Tổng đơn duy nhất</td><td className="n">{vi.format(s.orders)}</td><td className="n">{vi.format(s.phones)}</td><td className="n">—</td><td className="n">{money(s.net)}</td></tr></tfoot></table></TableWrap> : <EmptyState text="Không có sản phẩm bán phù hợp bộ lọc." />}
        </ChartCard>
        <ChartCard icon={Phone} title="Đơn gần nhất" subtitle="60 đơn mới nhất khớp mọi bộ lọc · ghi chú khách chi tiết xem tại Cuộc gọi CSKH">
          {data.recentOrders.length ? <TableWrap><table className="tbl"><thead><tr>
            <th>Mã đơn</th><th>POS</th><th>SĐT</th><th>Marketer</th><th>Sale</th><th>CSKH</th><th>Trạng thái</th><th>Nguồn</th><th>Ghi chú đơn</th><th className="n">Doanh thu</th>
          </tr></thead><tbody>{data.recentOrders.map((r) => <tr key={r.id}>
            <td className="font-medium">{r.orderId}<div className="text-xs font-normal text-ink-3">{(basis === 'confirmed' ? r.confirmedAt : r.createdAt)?.slice(0, 16).replace('T', ' ')}</div></td>
            <td>{r.posName}</td><td className="num">{r.phone ?? '—'}</td><td>{r.marketer ?? '—'}</td><td>{r.seller ?? '—'}</td><td>{r.care ?? '—'}</td><td>{r.status}</td><td>{r.source ?? '—'}</td>
            <td className="max-w-72 whitespace-normal text-xs text-ink-2">{r.note ?? 'Chưa có ghi chú'}</td><td className="n">{money(r.net)}</td>
          </tr>)}</tbody></table></TableWrap> : <EmptyState text="Không có đơn trong phạm vi bộ lọc." />}
        </ChartCard>
        <Definitions items={data.definitions} />
        <div className="flex justify-end"><StaleChip at={at} stale={stale} loading={loading} /></div>
      </> : !error ? <EmptyState text="Chưa có dữ liệu Marketing từ Pancake." /> : null}
    </div>
  );
}
