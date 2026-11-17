'use client';
import { AdvisorPanel } from './advisor-panel';

import { usePosIds, usePosStaffFilter } from './pos-store';
import { usePeriod } from './period-store';
import { ICON } from './icons';
import { useEffect, useMemo, useState } from 'react';
import { BarChart3, CheckCircle2, Megaphone, PackageCheck, Phone, Target, Truck, UsersRound } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { MarketingTeam } from '@/lib/teams/marketing-teams';
import { PeriodToolbar, PosChips } from './overview-view';
import { Th, ChartCard, Definitions, EmptyState, ErrorBox, KpiCard, PageHeader, ProgressBar, SkeletonKpis, SortTh, StatusChip, TableWrap, Toolbar, money, pct, shortMoney, toast, useSort, vi } from './ui-kit';
import { useApi } from './use-api';
import { StaleChip } from './stale-chip';
import { TrendNotes } from './overview-trends';
import { MktHeadline } from './mkt-headline';
import { MktTrendPanel } from './mkt-trend-panel';
import { useTeam, useMktTeam, setMktTeam, useBranch } from './team-store';
import { saveXlsx } from '@/app/save-xlsx';
import { RANK_STAGES, rankByStage, type RankStage, type RankRow } from '@/lib/reports/mkt-rank';
import { SegmentHintNote } from './segment-hint-note';
import { MktProductsCard, MktRecentCard } from './mkt-compact-cards';
import { MktCrossCard, type SaleTeamOption } from './mkt-cross-card';
import { MarketerDetailSheet } from './mkt-marketer-detail';
import { cancelRateClass, closeRateClass, ratePct, ratePctCapped, returnRateClass } from '@/lib/shared/close-rate';
import { ProductSplitHover, splitUrl } from './mkt-product-hover';

type Basis = 'created' | 'confirmed';
type Stage = 'all' | 'unconfirmed' | 'confirmed' | 'packed' | 'confirmed_now' | 'stock' | 'packing' | 'waiting' | 'shipping' | 'shipped' | 'delivered' | 'returned' | 'cancelled' | 'deleted';
type Summary = {
  orders: number; phones: number; gross: number; net: number; selectedRate: number | null; averageOrder: number | null; revenuePerPhone: number | null;
  createdOrders: number; createdPhones: number; createdNewPhones?: number; confirmedOrders: number; confirmationRate: number | null;
  shippedOrders: number; shippingRate: number | null; deliveredOrders: number; deliveryRate: number | null;
  returnedOrders: number; cancelledOrders: number;
  /** Tiền các đơn hoàn / hủy trong phạm vi đang xem, và doanh thu còn lại sau khi trừ. */ refundNet: number; netAfterRefund: number;
  /** Tách theo người bán: New = không thuộc CSKH (Sale chốt khách mới), CSKH = nhân viên CSKH bán. */
  newOrders: number; newNet: number; newAfterRefund: number; cskhOrders: number; cskhNet: number; cskhAfterRefund: number;
};
// Bảng xếp hạng tách New / CSKH (anh Vũ 14/11/2026, ý sếp: "số đơn không được gộp, doanh thu cũng phải tách new và cskh"):
// Đơn New = đơn chốt do người bán Sale, Đơn CSKH = do người bán CSKH. TL chốt, tỉ lệ đi / hủy / hoàn chỉ tính đơn New (khớp Pancake lọc nhân viên SALE).
type OutStats = { createdNewPhones: number; newConfirmed: number; cskhConfirmed: number; newPacked: number; newCancelled: number; newReturned: number;
  newNet: number; newOrders: number; newAfterRefund: number; cskhNet: number; cskhOrders: number; cskhAfterRefund: number };
const outRates = (x: OutStats) => ({ close: ratePctCapped(x.newConfirmed, x.createdNewPhones), go: ratePct(x.newPacked, x.newConfirmed), cancel: ratePct(x.newCancelled, x.newPacked), ret: ratePct(x.newReturned, x.newPacked) });
const NEW_FIELDS = { createdNewPhones: 0, newConfirmed: 0, cskhConfirmed: 0, newPacked: 0, newCancelled: 0, newReturned: 0 };
type Ranking = Omit<RankRow, 'rankName' | 'stageMetrics'> & { everConfirmed: number; everPacked: number; packedCancelled: number; packedReturned: number; createdNewPhones: number; newConfirmed: number; cskhConfirmed: number; newPacked: number; newCancelled: number; newReturned: number } & { stageMetrics: Record<RankStage, Partial<Summary> & { orders: number; net: number }> };
type Marketer = Summary & Ranking & { marketerId: string; marketerName: string; marketingTeamName: string };
type MarketingTeamSummary = Summary & Ranking & { marketingTeamId: string; marketingTeamName: string; marketerCount: number };
type Product = { productKey: string; productName: string; orders: number; phones: number; quantity: number; lineTotal: number };
type RecentOrder = { id: string; orderId: string; posId?: string; posName: string; phone: string | null; createdAt: string; confirmedAt: string | null; status: string; marketer: string | null; seller: string | null; care: string | null; net: number; source: string | null; note: string | null };
type Report = {
  period: { start: string; end: string }; basis: Basis; stage: Stage; summary: Summary;
  byMarketer: Marketer[]; byTeam: MarketingTeamSummary[]; stageSummary: Record<RankStage, Partial<Summary> & { orders: number; net: number }>; afterPackSummary?: { everConfirmed: number; everPacked: number; packedCancelled: number; packedReturned: number }; byProduct: Product[]; recentOrders: RecentOrder[];
  marketerOptions: { id: string; name: string }[]; sellerOptions: { id: string; name: string }[]; careOptions: { id: string; name: string }[];
  sourceOptions: string[];
  productOptions: { key: string; name: string; orders: number }[];
  definitions: Record<string, string>;
};
type SortKey = 'rank' | 'name' | 'team' | 'created' | 'phones' | 'confirmed' | 'rate' | 'atConfirmed' | 'atPacked' | 'goRate' | 'cancelRate' | 'returnRate' | 'cskhConfirmed' | 'orders' | 'net' | 'newNet' | 'cskhNet' | 'refund' | 'afterRefund' | 'perPhone' | 'aov' | 'shipped' | 'delivered' | 'delivery' | 'returned';

const BASES: Record<Basis, string> = { created: 'Theo ngày tạo đơn', confirmed: 'Theo ngày xác nhận' };
const STAGES: Record<Stage, string> = {
  packed: 'Đóng hàng trở đi',
  all: 'Mọi đơn chưa xóa', unconfirmed: 'Mới / chờ xác nhận', confirmed: 'Đơn chốt (đang hiệu lực)', confirmed_now: 'Hiện đang: đã xác nhận',
  stock: 'Chờ hàng / in / đã in', packing: 'Đang đóng hàng', waiting: 'Chờ chuyển hàng', shipping: 'Đã gửi hàng · đang giao',
  shipped: 'Đã cho ĐVVC / trạng thái sau đó', delivered: 'Đã nhận / đã thu tiền', returned: 'Đang hoàn / đã hoàn', cancelled: 'Đã hủy', deleted: 'Đã xóa',
};
const SORTS: Record<SortKey, string> = {
  rank: 'Hạng theo mốc',
  name: 'Tên marketer', team: 'Team Marketing', created: 'Đơn tạo', phones: 'Số điện thoại', confirmed: 'Đơn xác nhận', rate: 'TL chốt', atConfirmed: 'Đơn chốt New', cskhConfirmed: 'Đơn chốt CSKH', atPacked: 'Đơn đi (New)', goRate: 'Tỉ lệ đi', cancelRate: 'Tỉ lệ hủy', returnRate: 'Tỉ lệ hoàn', orders: 'Đơn theo mốc', net: 'Doanh thu', newNet: 'Doanh thu New', cskhNet: 'Doanh thu CSKH', refund: 'Tiền hoàn / hủy', afterRefund: 'Doanh thu sau hoàn hủy', perPhone: 'Doanh thu / SĐT',
  aov: 'AOV', shipped: 'Đã cho ĐVVC', delivered: 'Đã nhận', delivery: 'Tỷ lệ giao thành công', returned: 'Hoàn / hủy',
};
const TEAM_SORTS = { ...SORTS, name: 'Tên team', team: 'Tên team' };

function FilterSelect({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: { id: string; name: string }[] }) {
  return <Select value={value} items={{ __all: `Tất cả ${label}`, ...Object.fromEntries(options.map((x) => [x.id, x.name])) }} onValueChange={(v) => onChange(String(v))}>
    <SelectTrigger className="min-w-44 max-w-72" aria-label={label}><SelectValue /></SelectTrigger>
    <SelectContent><SelectItem value="__all">Tất cả {label}</SelectItem>{options.map((x) => <SelectItem key={x.id} value={x.id}>{x.name}</SelectItem>)}</SelectContent>
  </Select>;
}

function MarketingTeamSelect({ teams, value, onChange, label = 'Team Marketing', onPos }: { teams: MarketingTeam[]; value: string; onChange: (value: string) => void; label?: string; onPos?: ((id: string) => boolean) | null }) {
  // Đang chọn POS: chỉ đếm và chỉ hiện team có người trên POS đó (anh Vũ 04/11/2026).
  const count = (t: MarketingTeam) => onPos ? t.memberIds.filter(onPos).length : t.memberIds.length;
  teams = onPos ? teams.filter((t) => count(t) > 0 || t.id === value) : teams;
  return <Select value={value} items={{ __all: 'Tất cả team MKT', __unassigned: 'Chưa phân nhóm', ...Object.fromEntries(teams.map((t) => [t.id, `${t.name} · ${count(t)} người`])) }} onValueChange={(v) => onChange(String(v))}>
    <SelectTrigger className="min-w-48" aria-label={label}><SelectValue /></SelectTrigger>
    <SelectContent><SelectItem value="__all">Tất cả team MKT</SelectItem><SelectItem value="__unassigned">Chưa phân nhóm</SelectItem>{teams.map((t) => <SelectItem key={t.id} value={t.id}>{t.name} · {count(t)} người</SelectItem>)}</SelectContent>
  </Select>;
}

/** onOpenRoas chỉ có khi người xem được trang Chi phí & ROAS; không có thì không hiện khối số chính (chi phí, ROAS). */
export function MarketingView({ onManageTeams, onOpenRoas }: { onManageTeams?: () => void; onOpenRoas?: () => void }) {
  const { preset, start, end, setPreset, setStart, setEnd } = usePeriod();
  const [posIds, setPosIds] = usePosIds();
  const team = useTeam();
  const [basis, setBasis] = useState<Basis>('confirmed');
  const [stage, setStage] = useState<Stage>('confirmed');
  const [rankStage, setRankStage] = useState<RankStage>('confirmed');
  const [otherStages, setOtherStages] = useState(false);
  const [marketerId, setMarketerId] = useState('__all');
  const selectedMkt = useMktTeam();
  const branch = useBranch();
  const marketingTeamId = selectedMkt?.id ?? '__all';
  const setMarketingTeamId = (id: string) => setMktTeam(id === '__all' ? null : { id, name: marketingTeams.find((t) => t.id === id)?.name ?? (id === '__unassigned' ? 'Không thuộc team MKT' : 'đã chọn') });
  const [rankingMode, setRankingMode] = useState<'marketer' | 'team'>('marketer');
  const [marketingTeams, setMarketingTeams] = useState<MarketingTeam[]>([]);
  const [sellerId, setSellerId] = useState('__all');
  const [careId, setCareId] = useState('__all');
  const [productKey, setProductKey] = useState('__all');
  const [source, setSource] = useState('__all');
  // Team Sale (anh Vũ 12/11/2026): lọc cả trang theo đơn do team Sale đó xác nhận; chọn team Sale thì ẩn chi phí.
  const [saleTeam, setSaleTeam] = useState('__all');
  // Bấm tên marketer mở khung chi tiết (anh Vũ 12/11/2026); hồ sơ là nút trong khung.
  const [detailId, setDetailId] = useState<string | null>(null);
  const saleTeamList = useApi<{ teams: SaleTeamOption[] }>('/api/teams?list=1&team=sale', { keep: true });
  const sort = useSort<SortKey>('rank');
  // Chọn POS nào chỉ hiện người có tài khoản trên POS đó (anh Vũ 04/11/2026: "chỉ có tên của các thành viên trong pos đó thôi");
  // tổng đơn duy nhất giữ nguyên như các mục khác (#113).
  const onPos = usePosStaffFilter();
  const saleTeams = useMemo(() => (saleTeamList.data?.teams ?? []).filter((t) => !onPos || t.memberRefs.some((m) => onPos(m.id))), [saleTeamList.data, onPos]);
  useEffect(() => {
    void fetch('/api/marketing-teams', { cache: 'no-store' }).then((r) => r.ok ? r.json() as Promise<{ teams: MarketingTeam[] }> : { teams: [] }).then((body) => setMarketingTeams(body.teams)).catch(() => undefined);
  }, []);

  const url = useMemo(() => {
    const p = new URLSearchParams({ start, end, posIds: posIds.join(','), basis, stage, marketingTeamId });
    if (marketingTeamId !== '__all') p.set('mktTeam', marketingTeamId);
    if (branch) p.set('branch', branch);
    // Nút Sale / CSKH đầu trang lọc theo người bán trên đơn (anh Vũ 12/10/2026: trước đây trang này bỏ qua nút nên Sale, CSKH ra cùng một số).
    if (team !== 'all') p.set('team', team);
    if (marketerId !== '__all') p.set('marketerId', marketerId);
    if (sellerId !== '__all') p.set('sellerId', sellerId);
    if (careId !== '__all') p.set('careId', careId);
    if (productKey !== '__all') p.set('productKey', productKey);
    if (source !== '__all') p.set('source', source);
    if (saleTeam !== '__all') p.set('saleTeam', saleTeam);
    return `/api/reports/marketing?${p}`;
  }, [start, end, posIds, team, basis, stage, branch, marketingTeamId, marketerId, sellerId, careId, productKey, source, saleTeam]);
  const { data, at, stale, loading, error, reload } = useApi<Report>(url, { keep: false });
  const productUrl = splitUrl(url);
  const s = data?.summary;
  const sortedRows = useMemo(() => sort.apply((data?.byMarketer ?? []).filter((r) => !onPos || onPos(r.marketerId)).map((r) => ({ ...r, ...(!otherStages ? r.stageMetrics[rankStage] : {}) })), (r, k) => {
    switch (k) {
      case 'name': return r.marketerName;
      case 'team': return r.marketingTeamName;
      case 'created': return r.createdOrders;
      case 'phones': return r.createdPhones;
      case 'confirmed': return r.confirmedOrders;
      case 'rate': return outRates(r).close;
      case 'atConfirmed': return r.newConfirmed;
      case 'cskhConfirmed': return r.cskhConfirmed;
      case 'atPacked': return r.newPacked;
      case 'goRate': return outRates(r).go;
      case 'cancelRate': return outRates(r).cancel;
      case 'returnRate': return outRates(r).ret;
      case 'orders': return r.orders;
      case 'net': return r.net;
      case 'newNet': return r.newNet;
      case 'cskhNet': return r.cskhNet;
      case 'refund': return r.refundNet;
      case 'afterRefund': return r.netAfterRefund;
      case 'perPhone': return r.revenuePerPhone;
      case 'aov': return r.averageOrder;
      case 'shipped': return r.shippedOrders;
      case 'delivered': return r.deliveredOrders;
      case 'delivery': return r.deliveryRate;
      case 'returned': return r.returnedOrders + r.cancelledOrders;
      default: return 0;
    }
  }), [data, sort, rankStage, otherStages, onPos]);
  const sortedTeamRows = useMemo(() => sort.apply((data?.byTeam ?? []).map((r) => {
    if (!onPos) return r;
    // Số marketer chỉ đếm người trên POS; team không còn ai trên POS và không có đơn thì ẩn.
    const configured = marketingTeams.find((t) => t.id === r.marketingTeamId);
    const inTeam = (id: string) => configured ? configured.memberIds.includes(id) : !marketingTeams.some((t) => t.memberIds.includes(id));
    const members = (data?.byMarketer ?? []).filter((m) => inTeam(m.marketerId) && onPos(m.marketerId)).length;
    const onPosMembers = configured ? configured.memberIds.filter(onPos).length : members;
    return onPosMembers || members || r.createdOrders || r.orders ? { ...r, marketerCount: members } : null;
  }).filter((r): r is NonNullable<typeof r> => !!r).map((r) => ({ ...r, ...(!otherStages ? r.stageMetrics[rankStage] : {}) })), (r, k) => {
    switch (k) {
      case 'name': case 'team': return r.marketingTeamName;
      case 'created': return r.createdOrders;
      case 'phones': return r.createdPhones;
      case 'confirmed': return r.confirmedOrders;
      case 'rate': return outRates(r).close;
      case 'atConfirmed': return r.newConfirmed;
      case 'cskhConfirmed': return r.cskhConfirmed;
      case 'atPacked': return r.newPacked;
      case 'goRate': return outRates(r).go;
      case 'cancelRate': return outRates(r).cancel;
      case 'returnRate': return outRates(r).ret;
      case 'orders': return r.orders;
      case 'net': return r.net;
      case 'newNet': return r.newNet;
      case 'cskhNet': return r.cskhNet;
      case 'refund': return r.refundNet;
      case 'afterRefund': return r.netAfterRefund;
      case 'perPhone': return r.revenuePerPhone;
      case 'aov': return r.averageOrder;
      case 'shipped': return r.shippedOrders;
      case 'delivered': return r.deliveredOrders;
      case 'delivery': return r.deliveryRate;
      case 'returned': return r.returnedOrders + r.cancelledOrders;
      default: return 0;
    }
  }), [data, sort, rankStage, otherStages, onPos, marketingTeams]);
  // Hạng theo DT New rồi đơn New ở mốc đang chọn (đơn CSKH không cộng vào hạng).
  const newOnly = <T extends { orders: number; net: number; newOrders?: number; newNet?: number }>(m: Record<string, T>) => Object.fromEntries(Object.entries(m).map(([k, v]) => [k, { ...v, orders: v.newOrders ?? 0, net: v.newNet ?? 0 }])) as Record<RankStage, T>;
  const rows = rankByStage(sortedRows.map((r) => ({ ...r, rankName: r.marketerName, stageMetrics: newOnly(otherStages ? { ...r.stageMetrics, [stage]: { orders: r.orders, net: r.net, newOrders: r.newOrders, newNet: r.newNet } } : r.stageMetrics) })), otherStages ? stage : rankStage, 'net')
    .map((r) => ({ ...r, ...(!otherStages ? r.stageMetrics[rankStage] : {}) }));
  const teamRows = rankByStage(sortedTeamRows.map((r) => ({ ...r, rankName: r.marketingTeamName, stageMetrics: newOnly(otherStages ? { ...r.stageMetrics, [stage]: { orders: r.orders, net: r.net, newOrders: r.newOrders, newNet: r.newNet } } : r.stageMetrics) })), otherStages ? stage : rankStage, 'net')
    .map((r) => ({ ...r, ...(!otherStages ? r.stageMetrics[rankStage] : {}) }));
  if (sort.key !== 'rank') {
    const marketerOrder = new Map(sortedRows.map((r, i) => [r.marketerId, i]));
    const teamOrder = new Map(sortedTeamRows.map((r, i) => [r.marketingTeamId, i]));
    rows.sort((a, b) => marketerOrder.get(a.marketerId)! - marketerOrder.get(b.marketerId)!);
    teamRows.sort((a, b) => teamOrder.get(a.marketingTeamId)! - teamOrder.get(b.marketingTeamId)!);
  }
  const rankingSummary = { ...s, ...(!otherStages ? data?.stageSummary[rankStage] : {}) } as Summary;
  const rankColumns = (r: { stageRate: number | null; rankShift: number }) => <>
    {!otherStages && rankStage !== 'confirmed' && <td className={`n ${r.rankShift > 0 ? 'text-primary' : r.rankShift < 0 ? 'text-bad' : 'text-ink-3'}`} title="Cách tính: hạng Chốt trừ hạng ở mốc đang chọn.">{r.rankShift > 0 ? `▲ ${r.rankShift}` : r.rankShift < 0 ? `▼ ${-r.rankShift}` : '–'}</td>}
  </>;
  const productTotals = useMemo(() => (data?.byProduct ?? []).reduce((a, r) => ({ quantity: a.quantity + r.quantity, lineTotal: a.lineTotal + r.lineTotal }), { quantity: 0, lineTotal: 0 }), [data]);

  // Đơn chốt / Đơn đi / TL chốt / Tỉ lệ đi / hủy / hoàn (anh Vũ 12/11/2026). Tỉ lệ dòng Tổng tính từ tổng số, không lấy trung bình.
  const outHeads = <><SortTh k="atConfirmed" label="Đơn New" hint="Đơn chốt do người bán Sale (New): xác nhận lần đầu trong kỳ, kể cả sau đó hủy / hoàn (đã chốt là chốt); trừ đơn xoá." sort={sort} /><SortTh k="cskhConfirmed" label="Đơn CSKH" hint="Đơn chốt do người bán CSKH, cùng cách đếm. Không cộng vào Đơn New." sort={sort} /><SortTh k="newNet" label="DT New" sort={sort} /><SortTh k="cskhNet" label="DT CSKH" sort={sort} /><SortTh k="atPacked" label="Đơn đi" hint="Đơn New đã vào Đang đóng hàng trở đi (đóng hàng, chờ lấy, đã gửi, đã nhận, hoàn, hủy sau đóng hàng)." sort={sort} /><SortTh k="rate" label="TL chốt" hint="Đơn New ÷ SĐT trên đơn chia cho Sale, tối đa 100% (đơn chốt trong kỳ có thể gồm đơn tạo từ kỳ trước). Dưới 40% tô đỏ." sort={sort} /><SortTh k="goRate" label="Tỉ lệ đi" hint="Đơn đi ÷ Đơn New." sort={sort} /><SortTh k="cancelRate" label="Tỉ lệ hủy" hint="Đơn đi (New) bị hủy khi chưa giao ĐVVC ÷ Đơn đi. Từ 5% tô đỏ." sort={sort} /><SortTh k="returnRate" label="Tỉ lệ hoàn" hint="(Đơn đi New đang hoàn / đã hoàn + hủy sau khi đã giao ĐVVC) ÷ Đơn đi. Từ 7% tô đỏ." sort={sort} /></>;
  const outCells = (x: OutStats) => {
    const r = outRates(x);
    const cell = (v: number | null, cls: string, title: string) => <td className={`n ${cls}`} title={title}>{v === null ? '—' : pct(v)}</td>;
    return <><td className="n">{vi.format(x.newConfirmed)}</td><td className="n">{vi.format(x.cskhConfirmed)}</td><td className="n">{money(x.newNet)}<span className="block w-0 min-w-full whitespace-normal text-[11px] font-normal text-ink-3" title={`${vi.format(x.newOrders)} đơn · sau hoàn hủy ${money(x.newAfterRefund)}`}>sau hoàn hủy {shortMoney(x.newAfterRefund)}</span></td><td className="n">{money(x.cskhNet)}<span className="block w-0 min-w-full whitespace-normal text-[11px] font-normal text-ink-3" title={`${vi.format(x.cskhOrders)} đơn · sau hoàn hủy ${money(x.cskhAfterRefund)}`}>sau hoàn hủy {shortMoney(x.cskhAfterRefund)}</span></td><td className="n">{vi.format(x.newPacked)}</td>
      {cell(r.close, closeRateClass(r.close), `${vi.format(x.newConfirmed)} đơn New / ${vi.format(x.createdNewPhones)} SĐT chia cho Sale`)}
      {cell(r.go, '', `${vi.format(x.newPacked)} đơn đi / ${vi.format(x.newConfirmed)} đơn New`)}
      {cell(r.cancel, cancelRateClass(r.cancel), `${vi.format(x.newCancelled)} đơn hủy / ${vi.format(x.newPacked)} đơn đi`)}
      {cell(r.ret, returnRateClass(r.ret), `${vi.format(x.newReturned)} đơn hoàn / ${vi.format(x.newPacked)} đơn đi`)}</>;
  };
  const outTotal: OutStats = { ...NEW_FIELDS, ...data?.afterPackSummary, createdNewPhones: s?.createdNewPhones ?? 0, newNet: rankingSummary.newNet ?? 0, newOrders: rankingSummary.newOrders ?? 0, newAfterRefund: rankingSummary.newAfterRefund ?? 0, cskhNet: rankingSummary.cskhNet ?? 0, cskhOrders: rankingSummary.cskhOrders ?? 0, cskhAfterRefund: rankingSummary.cskhAfterRefund ?? 0 };

  // Người ngoài POS này (mục F): marketer có đơn trên POS đang chọn nhưng không có tài khoản trên POS đó (bảng đã ẩn họ).
  const outside = onPos ? (data?.byMarketer ?? []).filter((r) => !onPos(r.marketerId)) : [];
  const os = outside.reduce((a, r) => ({ created: a.created + r.createdOrders, phones: a.phones + r.createdPhones, everConfirmed: a.everConfirmed + r.everConfirmed, everPacked: a.everPacked + r.everPacked,
    packedCancelled: a.packedCancelled + r.packedCancelled, packedReturned: a.packedReturned + r.packedReturned, orders: a.orders + r.orders, net: a.net + r.net, newNet: a.newNet + r.newNet, cskhNet: a.cskhNet + r.cskhNet,
    newOrders: a.newOrders + r.newOrders, cskhOrders: a.cskhOrders + r.cskhOrders, newAfterRefund: a.newAfterRefund + r.newAfterRefund, cskhAfterRefund: a.cskhAfterRefund + r.cskhAfterRefund,
    createdNewPhones: a.createdNewPhones + r.createdNewPhones, newConfirmed: a.newConfirmed + r.newConfirmed, cskhConfirmed: a.cskhConfirmed + r.cskhConfirmed, newPacked: a.newPacked + r.newPacked, newCancelled: a.newCancelled + r.newCancelled, newReturned: a.newReturned + r.newReturned,
    refundNet: a.refundNet + r.refundNet, after: a.after + r.netAfterRefund, shipped: a.shipped + r.shippedOrders, delivered: a.delivered + r.deliveredOrders, returned: a.returned + r.returnedOrders, cancelled: a.cancelled + r.cancelledOrders }),
    { created: 0, phones: 0, everConfirmed: 0, everPacked: 0, packedCancelled: 0, packedReturned: 0, orders: 0, net: 0, newNet: 0, cskhNet: 0, newOrders: 0, cskhOrders: 0, newAfterRefund: 0, cskhAfterRefund: 0, ...NEW_FIELDS, refundNet: 0, after: 0, shipped: 0, delivered: 0, returned: 0, cancelled: 0 });
  const outsideRow = outside.length && (os.created || os.everConfirmed || os.net || os.newConfirmed || os.cskhConfirmed) ? <tr className="text-ink-2" title={`Đơn trên POS đang chọn của ${outside.map((r) => r.marketerName).join(', ')} (không có tài khoản trên POS này)`}>
    <td className="num text-ink-3">–</td>{!otherStages && rankStage !== 'confirmed' && <td className="n">–</td>}
    <td className="max-w-56 whitespace-normal italic">Người ngoài POS này<span className="block text-[11px] font-normal not-italic text-ink-3">{vi.format(outside.length)} marketer không có tài khoản trên POS đang chọn</span></td>
    <td className="n">{vi.format(os.created)}</td><td className="n">{vi.format(os.phones)}</td>
    {outCells(os)}
    <td className="n text-bad">{os.refundNet ? `−${money(os.refundNet)}` : money(0)}</td><td className="n font-semibold">{money(os.after)}</td>
    <td className="n">{os.phones ? money(os.net / os.phones) : '—'}</td><td className="n">{os.orders ? money(os.net / os.orders) : '—'}</td>
    <td className="n">{vi.format(os.shipped)}</td><td className="n">{vi.format(os.delivered)}</td><td className="n">{os.shipped ? pct(os.delivered / os.shipped * 100) : '—'}</td><td className="n">{vi.format(os.returned)} / {vi.format(os.cancelled)}</td>
  </tr> : null;
  const outXlsx = (x: OutStats) => { const r = outRates(x); const p = (v: number | null) => v === null ? '' : Math.round(v * 10) / 10; return [x.newConfirmed, x.cskhConfirmed, x.newNet, x.cskhNet, x.newPacked, p(r.close), p(r.go), p(r.cancel), p(r.ret)]; };
  const exportExcel = async () => {
    if (!data) return;
    const XLSX = await import('xlsx');
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
      ['Marketer', 'Team Marketing', 'Đơn tạo', 'SĐT trên đơn', 'Đơn New', 'Đơn CSKH', 'DT New', 'DT CSKH', 'Đơn đi (New)', 'TL chốt New %', 'Tỉ lệ đi %', 'Tỉ lệ hủy %', 'Tỉ lệ hoàn %', 'Tiền hoàn / hủy', 'Doanh thu sau hoàn hủy', 'Doanh thu / SĐT', 'AOV', 'Đã cho ĐVVC', 'Đã nhận', 'Tỷ lệ giao TC %', 'Hoàn', 'Hủy'],
      ...rows.map((r) => [r.marketerName, r.marketingTeamName, r.createdOrders, r.createdPhones, ...outXlsx(r), r.refundNet, r.netAfterRefund, Math.round(r.revenuePerPhone ?? 0), Math.round(r.averageOrder ?? 0), r.shippedOrders, r.deliveredOrders, r.deliveryRate ?? '', r.returnedOrders, r.cancelledOrders]),
    ]), 'Hiệu suất marketer');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
      ['Team Marketing', 'Marketer có dữ liệu', 'Đơn tạo', 'SĐT duy nhất trong team', 'Đơn New', 'Đơn CSKH', 'DT New', 'DT CSKH', 'Đơn đi (New)', 'TL chốt New %', 'Tỉ lệ đi %', 'Tỉ lệ hủy %', 'Tỉ lệ hoàn %', 'Tiền hoàn / hủy', 'Doanh thu sau hoàn hủy', 'Doanh thu / SĐT', 'AOV', 'Đã cho ĐVVC', 'Đã nhận', 'Tỷ lệ giao TC %', 'Hoàn', 'Hủy'],
      ...teamRows.map((r) => [r.marketingTeamName, r.marketerCount, r.createdOrders, r.createdPhones, ...outXlsx(r), r.refundNet, r.netAfterRefund, Math.round(r.revenuePerPhone ?? 0), Math.round(r.averageOrder ?? 0), r.shippedOrders, r.deliveredOrders, r.deliveryRate ?? '', r.returnedOrders, r.cancelledOrders]),
      ['TỔNG ĐƠN DUY NHẤT', '', s?.createdOrders ?? 0, s?.createdPhones ?? 0, ...outXlsx(outTotal), s?.refundNet ?? 0, s?.netAfterRefund ?? 0, Math.round(s?.revenuePerPhone ?? 0), Math.round(s?.averageOrder ?? 0), s?.shippedOrders ?? 0, s?.deliveredOrders ?? 0, s?.deliveryRate ?? '', s?.returnedOrders ?? 0, s?.cancelledOrders ?? 0],
    ]), 'Hiệu suất team MKT');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
      ['Sản phẩm Pancake', 'Đơn có sản phẩm', 'SĐT', 'Số lượng bán', 'Thành tiền dòng sản phẩm'],
      ...data.byProduct.map((r) => [r.productName, r.orders, r.phones, r.quantity, r.lineTotal]),
      ['TỔNG DÒNG SẢN PHẨM', '', '', productTotals.quantity, productTotals.lineTotal],
      ['TỔNG ĐƠN DUY NHẤT', s?.orders ?? 0, s?.phones ?? 0, '', s?.net ?? 0],
    ]), 'Sản phẩm');
    saveXlsx(XLSX, wb, `marketing-pancake_${start}_${end}.xlsx`);
    toast('Đã xuất báo cáo Marketing từ dữ liệu Pancake.');
  };

  return (
    <div className="space-y-5">
      <PageHeader eyebrow="Chi phí QC + đơn marketer trên Pancake" title="Tổng quan Marketing"
        subtitle="Chi phí quảng cáo lấy từ Google Sheet CPQC Daily (và chi phí nhập tay); đơn, số, doanh thu lấy từ Pancake POS."
        badge={<StatusChip tone="green">Sheet CPQC + Pancake POS</StatusChip>}
        actions={onManageTeams ? <button type="button" className="btn" onClick={onManageTeams}><UsersRound size={14} /> Quản lý team MKT</button> : undefined} />
      <PeriodToolbar preset={preset} start={start} end={end}
        onPreset={setPreset}
        onStart={setStart} onEnd={setEnd}
        loading={loading} onReload={reload} onExport={exportExcel} exportDisabled={!data} />
      <PosChips posIds={posIds} onChange={setPosIds} />
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[12.5px] font-semibold text-ink-2">Team Sale</span>
        <Select value={saleTeam} items={{ __all: 'Tất cả team Sale', ...Object.fromEntries(saleTeams.map((t) => [t.id, t.name])) }} onValueChange={(v) => setSaleTeam(String(v))}>
          <SelectTrigger className="min-w-48" aria-label="Team Sale"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="__all">Tất cả team Sale</SelectItem>{saleTeams.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}</SelectContent>
        </Select>
        {saleTeam !== '__all' && <span className="text-[11.5px] text-ink-3">Chỉ đơn do người của team này bấm xác nhận · không hiện chi phí (chi phí là của Marketing)</span>}
      </div>
      <SegmentHintNote />
      {onOpenRoas && <MktHeadline start={start} end={end} posIds={posIds} onOpen={onOpenRoas}
        marketerId={marketerId === '__all' ? null : marketerId} onMarketer={(id) => setMarketerId(id ?? '__all')}
        teamId={marketingTeamId === '__all' ? null : marketingTeamId} onTeam={(id) => { setMarketingTeamId(id ?? '__all'); setMarketerId('__all'); }}
        saleTeam={saleTeam === '__all' ? null : saleTeam} onDetail={setDetailId} />}
      <MarketerDetailSheet marketerId={detailId} onClose={() => setDetailId(null)} posIds={posIds} page={{ start, end }} saleTeams={saleTeams} />
      {saleTeam === '__all' && <MktTrendPanel start={start} end={end} posIds={posIds} marketerId={marketerId} teamId={marketingTeamId} />}
      <AdvisorPanel dept="mkt" />
      <TrendNotes depts={['mkt']} mktTeam={marketingTeamId} />
      <Toolbar>
        <span className="px-1 text-[12.5px] font-semibold text-ink-2">Cách tính</span>
        <MarketingTeamSelect teams={marketingTeams} onPos={onPos} value={marketingTeamId} onChange={(v) => { setMarketingTeamId(v); setMarketerId('__all'); }} />
        <Select value={basis} items={BASES} onValueChange={(v) => setBasis(v as Basis)}>
          <SelectTrigger className="min-w-48" aria-label="Mốc thời gian"><SelectValue /></SelectTrigger>
          <SelectContent>{Object.entries(BASES).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}</SelectContent>
        </Select>
        <FilterSelect label="marketer" value={marketerId} onChange={setMarketerId} options={(data?.marketerOptions ?? []).filter((x) => !onPos || onPos(x.id))} />
        <FilterSelect label="Sale" value={sellerId} onChange={setSellerId} options={(data?.sellerOptions ?? []).filter((x) => !onPos || onPos(x.id))} />
        <FilterSelect label="CSKH" value={careId} onChange={setCareId} options={(data?.careOptions ?? []).filter((x) => !onPos || onPos(x.id))} />
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
          setSource('__all'); setStage('confirmed'); setBasis('confirmed'); setRankStage('confirmed'); setOtherStages(false);
        }}>Xóa bộ lọc</button>
      </Toolbar>

      {error && <ErrorBox error={error} onRetry={reload} />}
      {loading && !data ? <SkeletonKpis count={6} /> : s ? <>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-7">
          <KpiCard id="mkt-orders" icon={Megaphone} tone="green" label={STAGES[stage]} value={vi.format(s.orders)} note={BASES[basis]} tooltip="Số đơn có Marketer trên Pancake, theo mốc thời gian và trạng thái đang chọn." />
          <KpiCard icon={Phone} tone="blue" label="SĐT trên đơn" value={vi.format(s.phones)} note="SĐT duy nhất · không phải tổng lead" tooltip="Chỉ đếm số điện thoại xuất hiện trên đơn Pancake của marketer." />
          <KpiCard id="mkt-rate" icon={CheckCircle2} tone="teal" label="Tỷ lệ xác nhận" value={pct(s.confirmationRate)} note={`${vi.format(s.confirmedOrders)} / ${vi.format(s.createdOrders)} đơn`} />
          <KpiCard id="mkt-revenue" icon={ICON.revenue} tone="lime" label="Doanh thu theo mốc" value={shortMoney(s.net)} note={`AOV ${money(s.averageOrder)}`} />
          <KpiCard icon={ICON.revenue} tone="blue" label="Doanh thu / SĐT" value={money(s.revenuePerPhone)} note="Trên số điện thoại có đơn theo mốc" />
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

        <ChartCard icon={BarChart3} title={rankingMode === 'team' ? 'Xếp hạng team Marketing' : 'Xếp hạng marketer'} subtitle={`Chỉ số theo mốc: ${STAGES[otherStages ? stage : rankStage]} · phễu theo đơn tạo trong kỳ`}
          action={<div className="flex flex-wrap items-center gap-2">
            <fieldset className="flex flex-wrap rounded-lg border border-line p-0.5"><legend className="sr-only">Mốc xếp hạng</legend>
              {RANK_STAGES.map((key) => <button key={key} type="button" aria-pressed={!otherStages && rankStage === key} className={`rounded-md px-3 py-1.5 text-xs font-semibold tap ${!otherStages && rankStage === key ? 'bg-primary text-white' : 'text-ink-2 hover:bg-surface-2'}`} onClick={() => { setRankStage(key); setOtherStages(false); sort.setKey('rank'); }}>{({ confirmed: 'Chốt', packed: 'Đóng hàng', shipped: 'Đã gửi', delivered: 'Đã nhận' })[key]}</button>)}
            </fieldset>
            <Select value={stage} items={STAGES} onValueChange={(v) => { setStage(v as Stage); setOtherStages(true); }}>
              <SelectTrigger className="min-w-32" aria-label="Mốc khác"><span>Mốc khác</span></SelectTrigger>
              <SelectContent>{Object.entries(STAGES).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}</SelectContent>
            </Select>
            <fieldset className="flex rounded-lg border border-line p-0.5"><legend className="sr-only">Cấp xếp hạng</legend>
              <button type="button" className={`rounded-md px-3 py-1.5 text-xs font-semibold tap ${rankingMode === 'team' ? 'bg-primary text-white' : 'text-ink-2 hover:bg-surface-2'}`} aria-pressed={rankingMode === 'team'} onClick={() => { setRankingMode('team'); if (sort.key === 'team') sort.setKey('newNet'); }}>Theo team</button>
              <button type="button" className={`rounded-md px-3 py-1.5 text-xs font-semibold tap ${rankingMode === 'marketer' ? 'bg-primary text-white' : 'text-ink-2 hover:bg-surface-2'}`} aria-pressed={rankingMode === 'marketer'} onClick={() => setRankingMode('marketer')}>Theo nhân viên</button>
            </fieldset>
            <MarketingTeamSelect teams={marketingTeams} onPos={onPos} value={marketingTeamId} label="Lọc team trong xếp hạng" onChange={(v) => { setMarketingTeamId(v); setMarketerId('__all'); }} />
            <Select value={sort.key} items={rankingMode === 'team' ? TEAM_SORTS : SORTS} onValueChange={(v) => sort.setKey(v as SortKey)}><SelectTrigger className="min-w-44" aria-label="Sắp xếp xếp hạng Marketing"><SelectValue /></SelectTrigger><SelectContent>{Object.entries(rankingMode === 'team' ? TEAM_SORTS : SORTS).filter(([k]) => rankingMode !== 'team' || k !== 'team').map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}</SelectContent></Select>
          </div>}>
          {rankingMode === 'team' ? (teamRows.length ? <>
            <p className="mb-3 text-xs text-ink-3">Bấm tên team để xem thành viên. SĐT được đếm duy nhất trong từng team; hàng tổng đếm duy nhất trên toàn bộ phạm vi lọc.</p>
            <TableWrap><table className="tbl"><thead><tr><Th title="Cách tính: DT New tại mốc giảm dần, rồi số đơn New, rồi tên. Đơn CSKH không tính vào hạng.">Hạng</Th>{!otherStages && rankStage !== 'confirmed' && <Th className="n">Đổi hạng</Th>}<SortTh k="name" label="Team Marketing" sort={sort} align="left" /><Th className="n">Marketer</Th><SortTh k="created" label="Đơn tạo" sort={sort} /><SortTh k="phones" label="SĐT" sort={sort} />{outHeads}<SortTh k="refund" label="Hoàn / hủy (tiền)" sort={sort} /><SortTh k="afterRefund" label="Sau hoàn hủy" sort={sort} /><SortTh k="perPhone" label="DT / SĐT" sort={sort} /><SortTh k="aov" label="AOV" sort={sort} /><SortTh k="shipped" label="Đã cho ĐVVC" sort={sort} /><SortTh k="delivered" label="Đã nhận" sort={sort} /><SortTh k="delivery" label="% giao TC" sort={sort} /><SortTh k="returned" label="Hoàn / hủy" sort={sort} /></tr></thead>
              <tbody>{teamRows.map((r) => <tr key={r.marketingTeamId}><td className="num text-ink-3">{r.rank}</td>{rankColumns(r)}<td><button type="button" className="font-semibold text-primary underline-offset-2 hover:underline tap" onClick={() => { setMarketingTeamId(r.marketingTeamId); setMarketerId('__all'); setRankingMode('marketer'); }}>{r.marketingTeamName}</button></td><td className="n">{vi.format(r.marketerCount)}</td><td className="n">{vi.format(r.createdOrders)}</td><td className="n">{vi.format(r.createdPhones)}</td>{outCells(r)}<td className="n text-bad">{r.refundNet ? `−${money(r.refundNet)}` : money(0)}</td><td className="n font-semibold">{money(r.netAfterRefund)}</td><td className="n">{money(r.revenuePerPhone)}</td><td className="n">{money(r.averageOrder)}</td><td className="n">{vi.format(r.shippedOrders)}</td><td className="n">{vi.format(r.deliveredOrders)}</td><td className="n">{pct(r.deliveryRate)}</td><td className="n">{vi.format(r.returnedOrders)} / {vi.format(r.cancelledOrders)}</td></tr>)}</tbody>
              <tfoot><tr><td><span className="sr-only">Tổng</span></td>{!otherStages && rankStage !== 'confirmed' && <td className="n">–</td>}<td>Tổng đơn duy nhất</td><td className="n">{vi.format(rows.length)}</td><td className="n">{vi.format(s.createdOrders)}</td><td className="n">{vi.format(s.createdPhones)}</td>{outCells(outTotal)}<td className="n text-bad">{rankingSummary.refundNet ? `−${money(rankingSummary.refundNet)}` : money(0)}</td><td className="n font-semibold">{money(rankingSummary.netAfterRefund)}</td><td className="n">{money(rankingSummary.revenuePerPhone)}</td><td className="n">{money(rankingSummary.averageOrder)}</td><td className="n">{vi.format(s.shippedOrders)}</td><td className="n">{vi.format(s.deliveredOrders)}</td><td className="n">{pct(s.deliveryRate)}</td><td className="n">{vi.format(s.returnedOrders)} / {vi.format(s.cancelledOrders)}</td></tr></tfoot></table></TableWrap>
          </> : <EmptyState text="Không có team hoặc đơn Marketing trong phạm vi đang chọn." />) : rows.length ? <TableWrap><table className="tbl"><thead><tr><Th title="Cách tính: DT New tại mốc giảm dần, rồi số đơn New, rồi tên. Đơn CSKH không tính vào hạng.">Hạng</Th>{!otherStages && rankStage !== 'confirmed' && <Th className="n">Đổi hạng</Th>}<SortTh k="name" label="Marketer · team" sort={sort} align="left" /><SortTh k="created" label="Đơn tạo" sort={sort} /><SortTh k="phones" label="SĐT" sort={sort} />{outHeads}<SortTh k="refund" label="Hoàn / hủy (tiền)" sort={sort} /><SortTh k="afterRefund" label="Sau hoàn hủy" sort={sort} /><SortTh k="perPhone" label="DT / SĐT" sort={sort} /><SortTh k="aov" label="AOV" sort={sort} /><SortTh k="shipped" label="Đã cho ĐVVC" sort={sort} /><SortTh k="delivered" label="Đã nhận" sort={sort} /><SortTh k="delivery" label="% giao TC" sort={sort} /><SortTh k="returned" label="Hoàn / hủy" sort={sort} /></tr></thead>
            <tbody>{rows.map((r) => <tr key={r.marketerId}><td className="num text-ink-3">{r.rank}</td>{rankColumns(r)}<td className="max-w-56 whitespace-normal font-medium"><button type="button" className="text-left font-medium underline-offset-2 hover:text-primary hover:underline tap" title="Xem chi tiết marketer" onClick={() => setDetailId(r.marketerId)}>{r.marketerName}</button><span className="block text-[11px] font-normal text-ink-3">{r.marketingTeamName}</span></td><td className="n"><ProductSplitHover url={productUrl} marketerId={r.marketerId} field="orders">{vi.format(r.createdOrders)}</ProductSplitHover></td><td className="n"><ProductSplitHover url={productUrl} marketerId={r.marketerId} field="phones">{vi.format(r.createdPhones)}</ProductSplitHover></td>{outCells(r)}<td className="n text-bad">{r.refundNet ? `−${money(r.refundNet)}` : money(0)}</td><td className="n font-semibold">{money(r.netAfterRefund)}</td><td className="n">{money(r.revenuePerPhone)}</td><td className="n">{money(r.averageOrder)}</td><td className="n">{vi.format(r.shippedOrders)}</td><td className="n">{vi.format(r.deliveredOrders)}</td><td className="n">{pct(r.deliveryRate)}</td><td className="n">{vi.format(r.returnedOrders)} / {vi.format(r.cancelledOrders)}</td></tr>)}{outsideRow}</tbody>
            <tfoot><tr><td><span className="sr-only">Tổng</span></td>{!otherStages && rankStage !== 'confirmed' && <td className="n">–</td>}<td>Tổng đơn duy nhất<span className="block text-[11px] font-normal text-ink-3">{marketingTeamId === '__all' ? 'Mọi team' : marketingTeamId === '__unassigned' ? 'Chưa phân nhóm' : marketingTeams.find((t) => t.id === marketingTeamId)?.name ?? 'Team đã chọn'}</span></td><td className="n"><ProductSplitHover url={productUrl} marketerId={null} field="orders">{vi.format(s.createdOrders)}</ProductSplitHover></td><td className="n"><ProductSplitHover url={productUrl} marketerId={null} field="phones">{vi.format(s.createdPhones)}</ProductSplitHover></td>{outCells(outTotal)}<td className="n text-bad">{rankingSummary.refundNet ? `−${money(rankingSummary.refundNet)}` : money(0)}</td><td className="n font-semibold">{money(rankingSummary.netAfterRefund)}</td><td className="n">{money(rankingSummary.revenuePerPhone)}</td><td className="n">{money(rankingSummary.averageOrder)}</td><td className="n">{vi.format(s.shippedOrders)}</td><td className="n">{vi.format(s.deliveredOrders)}</td><td className="n">{pct(s.deliveryRate)}</td><td className="n">{vi.format(s.returnedOrders)} / {vi.format(s.cancelledOrders)}</td></tr></tfoot></table></TableWrap> : <EmptyState text="Không có đơn gắn Marketer trong phạm vi đang chọn." />}
        </ChartCard>

        <MktCrossCard start={start} end={end} posIds={posIds} saleTeams={saleTeams} mktTeams={marketingTeams.filter((t) => !onPos || t.memberIds.some((id) => onPos(id)))}
          onPick={(st, mt) => { setSaleTeam(st ?? '__all'); if (mt) { setMarketingTeamId(mt); setMarketerId('__all'); } window.scrollTo({ top: 0, behavior: 'smooth' }); }} />
        <MktProductsCard rows={data.byProduct} totalOrders={s.orders} totalNet={s.net} />
        <MktRecentCard rows={data.recentOrders} basis={basis} />
        <Definitions items={data.definitions} />
        <div className="flex justify-end"><StaleChip at={at} stale={stale} loading={loading} /></div>
      </> : !error ? <EmptyState text="Chưa có dữ liệu Marketing từ Pancake." /> : null}
    </div>
  );
}
