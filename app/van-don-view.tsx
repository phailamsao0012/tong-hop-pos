'use client';
import { AdvisorPanel } from './advisor-panel';

// Bộ phận Vận đơn (anh Vũ 08/10/2026): người Vận đơn gọi khách xác nhận đơn rồi chuyển đi. Đo cả hai phía của hàng hoàn: người lên đơn (Sale / CSKH)
// và người xác nhận (Vận đơn), theo người, team, bộ phận; đơn không xác nhận được đếm theo lý do. Dữ liệu: /api/reports/van-don.
import { useMemo, useState } from 'react';
import { BadgeCheck, PhoneOff, Send, ShoppingCart, Undo2 } from 'lucide-react';
import { returnTone } from '@/lib/return-tone';
import { STATUS_NAMES } from '@/lib/order-status';
import { Button } from '@/components/ui/button';
import type { VdLine, VdReport } from '@/lib/van-don';
import { PeriodToolbar, PosChips } from './overview-view';
import { usePeriod } from './period-store';
import { usePosIds } from './pos-store';
import { unitFor, useHrUnit, withUnit, useMktTeam } from './team-store';
import { StaleChip } from './stale-chip';
import { useApi } from './use-api';
import { TrendNotes } from './overview-trends';
import { takeNavHint } from './nav-focus';
import { ChartCard, Definitions, EmptyState, ErrorBox, KpiCard, PageHeader, SegmentedControl, SkeletonKpis, SkeletonTable, SortTh, TableWrap, dmy, money, pct, shortMoney, toast, useSort, vi } from './ui-kit';
import { saveXlsx } from '@/app/save-xlsx';

type Count = { label: string; n: number };
type Report = VdReport & { period: { start: string; end: string }; syncedAt: string | null;
  /** 'sent': đơn chuyển đi / hoàn theo ngày gửi hàng (nhóm đơn khác với đơn vào Chờ XN); 'closed' hoặc thiếu (số lưu cũ): trong các đơn vào Chờ XN. */
  sentBasis?: 'sent' | 'closed';
  /** Đơn thiếu lịch sử bước gửi (giờ gửi ước tính) trong các tháng của kỳ; thiếu ở số lưu cũ. */ sentEstimated?: number; definitions: Record<string, string>; failedTags?: Count[]; failedNotes?: Count[] };
type Level = 'person' | 'team' | 'dept';
const LEVELS: { value: Level; label: string }[] = [{ value: 'person', label: 'Từng người' }, { value: 'team', label: 'Từng team' }, { value: 'dept', label: 'Từng bộ phận' }];
/** Giữ ngưỡng cũ cho tỷ lệ không xác nhận được; hoàn dùng returnClass. */
const badTone = (v: number | null) => v === null ? '' : v >= 20 ? 'text-bad' : v >= 10 ? 'text-warn' : 'text-good';
const returnClass = (v: number | null) => ({ red: 'text-bad', amber: 'text-warn', green: 'text-good', none: '' })[returnTone(v)];

type Col = { key: string; label: string; get: (r: VdLine) => number | null; fmt: (v: number | null) => string; tone?: (v: number | null) => string; title?: string };
const n = (v: number | null) => v === null ? '—' : vi.format(v);
const p = (v: number | null) => pct(v);
const m = (v: number | null) => v === null ? '—' : money(v);
// Ngôn từ Vận đơn (anh Vũ 10/10/2026): Vận đơn không bán, không chốt, không có doanh thu; số của Vận đơn là "Đơn chuyển đi" và
// "Doanh số chuyển đi". Đơn Sale / CSKH đưa sang (từ Chờ xác nhận) gọi là "Đơn vào Chờ xác nhận" (như app); người Sale / CSKH trên đơn gọi là "người lên đơn", không dùng chữ bán.
const SELLER_COLS: Col[] = [
  { key: 'closed', label: 'Đơn vào Chờ XN', get: (r) => r.closed, fmt: n, title: 'Đơn người này đưa sang Vận đơn (từ Chờ xác nhận trở đi)' },
  { key: 'failed', label: 'Không XN được', get: (r) => r.failed, fmt: n, title: 'Đơn bị hủy khi đang Chờ xác nhận' },
  { key: 'failRate', label: '% không XN', get: (r) => r.failRate, fmt: p, tone: badTone },
  { key: 'self', label: 'Tự XN', get: (r) => r.self ?? 0, fmt: n, title: 'Người lên đơn tự bấm Đã xác nhận, không qua Vận đơn' },
  { key: 'sent', label: 'Đơn chuyển đi', get: (r) => r.sent, fmt: n },
  { key: 'sentNet', label: 'Doanh số chuyển đi', get: (r) => r.sentNet, fmt: m },
  { key: 'returned', label: 'Hoàn', get: (r) => r.returned, fmt: n },
  { key: 'returnRate', label: '% hoàn', get: (r) => r.returnRate, fmt: p, tone: returnClass },
  { key: 'returnedNet', label: 'Giá trị hoàn', get: (r) => r.returnedNet, fmt: m },
  { key: 'returnRateNet', label: '% hoàn theo giá trị', get: (r) => r.returnRateNet, fmt: p, tone: returnClass, title: 'Giá trị hoàn ÷ doanh số chuyển đi' },
];
const CONFIRMER_COLS: Col[] = [
  { key: 'handled', label: 'Đơn đã gọi', get: (r) => r.confirmed + r.failed, fmt: n, title: 'Đã xác nhận + không xác nhận được' },
  { key: 'confirmed', label: 'Đã XN', get: (r) => r.confirmed, fmt: n },
  { key: 'failed', label: 'Không XN được', get: (r) => r.failed, fmt: n },
  { key: 'confirmRate', label: '% XN được', get: (r) => r.confirmRate, fmt: p },
  { key: 'sent', label: 'Đơn chuyển đi', get: (r) => r.sent, fmt: n },
  { key: 'sentNet', label: 'Doanh số chuyển đi', get: (r) => r.sentNet, fmt: m },
  { key: 'returned', label: 'Hoàn', get: (r) => r.returned, fmt: n },
  { key: 'returnRate', label: '% hoàn', get: (r) => r.returnRate, fmt: p, tone: returnClass },
  { key: 'returnedNet', label: 'Giá trị hoàn', get: (r) => r.returnedNet, fmt: m },
  { key: 'returnRateNet', label: '% hoàn theo giá trị', get: (r) => r.returnRateNet, fmt: p, tone: returnClass, title: 'Giá trị hoàn ÷ doanh số chuyển đi' },
];

function LineTable({ rows, cols, level, first }: { rows: VdLine[]; cols: Col[]; level: Level; first: string }) {
  const sort = useSort<string>(cols[0].key);
  const sorted = sort.apply(rows, (r, k) => cols.find((c) => c.key === k)?.get(r) ?? null);
  if (!rows.length) return <EmptyState text="Chưa có đơn trong kỳ" />;
  return (
    <TableWrap maxHeight="32rem" sticky stickyFirst minWidth={level === 'person' ? 1080 : 900}>
      <table className="tbl sticky-first">
        <thead><tr><th>{first}</th>{level === 'person' && <><th>Team</th><th>Bộ phận</th></>}{cols.map((c) => <SortTh key={c.key} k={c.key} label={<span title={c.title}>{c.label}</span>} sort={sort} />)}</tr></thead>
        <tbody>
          {sorted.map((r, i) => (
            <tr key={r.key}>
              <td className="font-medium"><span className="num mr-1.5 inline-block w-5 text-right text-xs text-ink-4">{i + 1}</span>{r.label}</td>
              {level === 'person' && <><td className="mut text-xs" title={r.team}>{r.team?.split(' · ').pop() || '—'}</td><td className="mut text-xs">{r.dept ?? '—'}</td></>}
              {cols.map((c) => { const v = c.get(r); return <td key={c.key} className={`n ${c.tone?.(v) ?? ''}`}>{c.fmt(v)}</td>; })}
            </tr>
          ))}
        </tbody>
      </table>
    </TableWrap>
  );
}

type ShipKey = 'sent' | 'sentNet' | 'returned' | 'returnedNet' | 'returnRate' | 'returnRateNet';
/** Ô "bao nhiêu trên bao nhiêu": % đậm, tử / mẫu nhỏ bên dưới. */
const FracCell = ({ num, den, fmt }: { num: number; den: number; fmt: (v: number) => string }) => {
  const r = share(num, den);
  return <td className="n"><b className={`num ${returnClass(r)}`}>{pct(r)}</b><span className="num block text-[11px] text-ink-3">{fmt(num)} / {fmt(den)}</span></td>;
};
const sumLine = (rows: VdLine[]) => rows.reduce((t, r) => ({ sent: t.sent + r.sent, sentNet: t.sentNet + r.sentNet, returned: t.returned + r.returned, returnedNet: t.returnedNet + r.returnedNet }), { sent: 0, sentNet: 0, returned: 0, returnedNet: 0 });

/**
 * Đơn chuyển đi, đơn hoàn theo từng người của MỘT bộ phận (anh Vũ 09/10/2026: bảng Sale và bảng CSKH riêng): số đơn, giá trị,
 * % hoàn theo đơn và theo giá trị ghi rõ bao nhiêu trên bao nhiêu. Đơn vào Chờ xác nhận trong kỳ, xét trạng thái hiện tại.
 */
function DeptShipTable({ rows }: { rows: VdLine[] }) {
  const sort = useSort<ShipKey>('sent');
  const val = (r: VdLine, k: ShipKey) => k === 'returnRate' ? share(r.returned, r.sent) : k === 'returnRateNet' ? share(r.returnedNet, r.sentNet) : r[k];
  const sorted = sort.apply(rows, val);
  if (!rows.length) return <EmptyState text="Chưa có đơn trong kỳ" />;
  const t = sumLine(rows);
  const num = (v: number) => vi.format(v), mon = (v: number) => shortMoney(v);
  return (
    <TableWrap maxHeight="32rem" sticky stickyFirst minWidth={900}>
      <table className="tbl sticky-first">
        <thead><tr><th>Họ và tên</th><th>Team</th>
          <SortTh k="sent" label="Đơn chuyển đi" sort={sort} /><SortTh k="sentNet" label="Doanh số chuyển đi" sort={sort} />
          <SortTh k="returned" label="Số đơn hoàn" sort={sort} /><SortTh k="returnedNet" label="Giá trị hoàn" sort={sort} />
          <SortTh k="returnRate" label={<span title="Đơn hoàn ÷ đơn chuyển đi">% hoàn theo đơn</span>} sort={sort} />
          <SortTh k="returnRateNet" label={<span title="Giá trị hoàn ÷ doanh số chuyển đi">% hoàn theo giá trị</span>} sort={sort} /></tr></thead>
        <tbody>
          {sorted.map((r, i) => (
            <tr key={r.key}>
              <td className="font-medium"><span className="num mr-1.5 inline-block w-5 text-right text-xs text-ink-4">{i + 1}</span>{r.label}</td>
              <td className="mut text-xs" title={r.team}>{r.team?.split(' · ').pop() || '—'}</td>
              <td className="n">{num(r.sent)}</td><td className="n">{money(r.sentNet)}</td>
              <td className="n">{num(r.returned)}</td><td className="n">{money(r.returnedNet)}</td>
              <FracCell num={r.returned} den={r.sent} fmt={num} /><FracCell num={r.returnedNet} den={r.sentNet} fmt={mon} />
            </tr>
          ))}
          <tr className="font-semibold">
            <td>Tổng {vi.format(rows.length)} người</td><td aria-label="Team" />
            <td className="n">{num(t.sent)}</td><td className="n">{money(t.sentNet)}</td>
            <td className="n">{num(t.returned)}</td><td className="n">{money(t.returnedNet)}</td>
            <FracCell num={t.returned} den={t.sent} fmt={num} /><FracCell num={t.returnedNet} den={t.sentNet} fmt={mon} />
          </tr>
        </tbody>
      </table>
    </TableWrap>
  );
}

/** Thẻ / ghi chú thật trên đơn không xác nhận được, để chốt danh sách thẻ lý do cho Vận đơn. */
function FailedList({ title, empty, items }: { title: string; empty: string; items: Count[] }) {
  return (
    <div className="min-w-0">
      <p className="mb-2 text-xs font-semibold uppercase tracking-[.05em] text-ink-3">{title}</p>
      {items.length ? (
        <ul className="max-h-72 space-y-1 overflow-y-auto pr-1 text-sm">
          {items.map((x) => <li key={x.label} className="flex items-baseline justify-between gap-3 border-b border-line/60 py-1"><span className="min-w-0 break-words text-ink-2">{x.label}</span><span className="num shrink-0 text-ink">{vi.format(x.n)}</span></li>)}
        </ul>
      ) : <p className="text-sm text-ink-3">{empty}</p>}
    </div>
  );
}

const share = (a: number, b: number) => b ? a / b * 100 : null;

/** Một phân số "bao nhiêu trên bao nhiêu": tử, mẫu ghi đủ bằng chữ, % và thanh tỷ lệ. */
function Fraction({ label, num, den, fmt, unit, tone }: { label: string; num: number; den: number; fmt: (v: number) => string; unit?: string; tone?: boolean }) {
  const r = share(num, den);
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-[12.5px] text-ink-2">{label}</span>
        <b className={`num text-[15px] font-semibold ${tone ? returnClass(r) : 'text-ink'}`}>{pct(r)}</b>
      </div>
      <p className="num text-[18px] font-semibold leading-tight text-ink">{fmt(num)} <span className="font-normal text-ink-3">/</span> {fmt(den)}{unit && <span className="ml-1 text-[12px] font-normal text-ink-3">{unit}</span>}</p>
      <span className="flex h-1.5 overflow-hidden rounded-full bg-surface-3" aria-hidden="true"><i className="chart-grow-x block h-full rounded-full bg-primary" style={{ width: `${Math.min(100, r ?? 0)}%` }} /></span>
    </div>
  );
}

/**
 * Hoàn trong kỳ (anh Vũ 09/10/2026: "bao nhiêu trên bao nhiêu"): mỗi tỷ lệ ghi đủ tử và mẫu bằng chữ.
 * Theo ngày gửi (bySent): mẫu là đơn chuyển đi trong kỳ, khác nhóm với đơn vào Chờ XN nên không ghép hai số (QA 10/10/2026).
 * Cách cũ: mẫu là đơn vào Chờ xác nhận trong kỳ và phần đã chuyển trong số đó; đơn chưa chuyển thì chưa thể hoàn.
 */
function ReturnBreakdown({ t, period, bySent, estimated = 0 }: { t: VdLine; period: string; bySent: boolean; estimated?: number }) {
  const notSent = Math.max(0, t.closed - t.sent), notSentNet = Math.max(0, t.closedNet - t.sentNet);
  if (bySent) return (
    <section id="vd-return" className="card flex flex-col gap-4 p-4" aria-label="Hoàn trong kỳ">
      <header>
        <h2 className="flex items-center gap-2 text-base font-semibold text-ink"><Undo2 size={16} className="text-ink-3" aria-hidden="true" />Hoàn trong kỳ</h2>
        <p className="text-[12px] text-ink-3">Đơn chuyển đi {period} theo ngày gửi hàng, xét trạng thái hiện tại. Đơn mới gửi chưa kịp hoàn, nên kỳ ngắn hoặc gần đây (hôm nay, tuần này) tỷ lệ hoàn còn thấp, chưa so được với kỳ cũ.</p>
        {estimated > 0 && <p className="text-[12px] text-warn">{vi.format(estimated)} đơn tạo trong các tháng của kỳ thiếu lịch sử bước gửi trên Pancake: ngày gửi của các đơn này là ước tính (giờ xác nhận hoặc giờ đổi trạng thái gần nhất).</p>}
      </header>
      <div>
        <div className="flex flex-col gap-3 rounded-xl border border-line p-3">
          <p className="text-[11px] font-semibold uppercase tracking-[.07em] text-ink-3">Theo số đơn</p>
          <p className="num text-[12px] text-ink-2"><b>{vi.format(t.sent)}</b> đơn chuyển đi: <b>{vi.format(t.delivered)}</b> đã nhận, <b>{vi.format(t.returned)}</b> hoàn, <b>{vi.format(Math.max(0, t.sent - t.delivered - t.returned))}</b> đang giao</p>
        </div>
      </div>
    </section>
  );
  return (
    <section id="vd-return" className="card flex flex-col gap-4 p-4" aria-label="Hoàn trong kỳ">
      <header>
        <h2 className="flex items-center gap-2 text-base font-semibold text-ink"><Undo2 size={16} className="text-ink-3" aria-hidden="true" />Hoàn trong kỳ</h2>
        <p className="text-[12px] text-ink-3">Đơn vào Chờ xác nhận {period}, xét trạng thái hiện tại. Đơn chưa chuyển đi thì chưa thể hoàn, nên kỳ ngắn (hôm nay, tuần này) tỷ lệ hoàn thường thấp.</p>
      </header>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="flex flex-col gap-3 rounded-xl border border-line p-3">
          <p className="text-[11px] font-semibold uppercase tracking-[.07em] text-ink-3">Theo số đơn</p>
          <Fraction label="Đơn hoàn / đơn vào Chờ xác nhận" num={t.returned} den={t.closed} fmt={(v) => vi.format(v)} unit="đơn" tone />
          <p className="num text-[12px] text-ink-2"><b>{vi.format(t.closed)}</b> đơn vào Chờ xác nhận = <b>{vi.format(t.sent)}</b> đơn chuyển đi + <b>{vi.format(notSent)}</b> chưa chuyển hoặc đã hủy</p>
        </div>
        <div className="flex flex-col gap-3 rounded-xl border border-line p-3">
          <p className="text-[11px] font-semibold uppercase tracking-[.07em] text-ink-3">Theo giá trị</p>
          <Fraction label="Giá trị hoàn / giá trị đơn vào Chờ xác nhận" num={t.returnedNet} den={t.closedNet} fmt={money} tone />
          <p className="num text-[12px] text-ink-2">Giá trị đơn vào Chờ xác nhận <b>{money(t.closedNet)}</b> = doanh số chuyển đi <b>{money(t.sentNet)}</b> + chưa chuyển hoặc đã hủy <b>{money(notSentNet)}</b></p>
        </div>
      </div>
    </section>
  );
}

export function VanDonView() {
  const { preset, start, end, setPreset, setStart, setEnd } = usePeriod();
  const [posIds, setPosIds] = usePosIds();
  // Mở từ bảng Vận đơn ở Tổng quan POS thì xem sẵn theo bộ phận (nav-focus.ts).
  const [level, setLevel] = useState<Level>(() => { const h = takeNavHint('van-don.level'); return h === 'team' || h === 'dept' || h === 'person' ? h : 'person'; });
  // Đang chọn một team (thanh trên cùng): chỉ đơn có người lên đơn thuộc team đó.
  const unit = unitFor(useHrUnit(), 'all');
  const mktLens = useMktTeam();
  const url = useMemo(() => withUnit(`/api/reports/van-don?${new URLSearchParams({ start, end, posIds: posIds.join(',') })}`, unit), [start, end, posIds, unit]);
  const { data: report, at, stale, loading, error, reload } = useApi<Report>(url, { keep: false });
  const period = `${dmy(start)}/${start.slice(0, 4)} – ${dmy(end)}/${end.slice(0, 4)}`;
  const t = report?.total;
  const [card, setCard] = useState<string | null>(null);
  const [offset, setOffset] = useState(0);
  const drill = useApi<{ orders: { id: string; orderId: string; status: number; net: number }[]; more: boolean }>(card ? `${url}&card=${card}&offset=${offset}` : null, { keep: false });
  const openCard = (key: string) => { setCard(key); setOffset(0); };
  const bySent = report?.sentBasis === 'sent';
  const sellers = report ? level === 'person' ? report.sellers : level === 'team' ? report.sellerTeams : report.sellerDepts : [];
  const confirmers = report ? level === 'person' ? report.confirmers : level === 'team' ? report.confirmerTeams : report.confirmerDepts : [];
  const first = level === 'person' ? 'Họ và tên' : level === 'team' ? 'Team' : 'Bộ phận';
  const maxReason = Math.max(1, ...(report?.reasons ?? []).map((r) => r.n));

  async function exportExcel() {
    if (!report) return;
    try {
      const XLSX = await import('xlsx');
      const wb = XLSX.utils.book_new();
      const sheet = (rows: VdLine[], cols: Col[], person: boolean) => XLSX.utils.aoa_to_sheet([
        ['Tên', ...(person ? ['Team', 'Bộ phận'] : []), ...cols.map((c) => c.label)],
        ...rows.map((r) => [r.label, ...(person ? [r.team ?? '', r.dept ?? ''] : []), ...cols.map((c) => c.get(r) ?? '')]),
      ]);
      XLSX.utils.book_append_sheet(wb, sheet(report.sellers, SELLER_COLS, true), 'Người lên đơn');
      for (const d of ['Sale', 'CSKH'] as const) XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
        ['Họ và tên', 'Team', 'Đơn chuyển đi', 'Doanh số chuyển đi', 'Số đơn hoàn', 'Giá trị hoàn', '% hoàn theo đơn', '% hoàn theo giá trị'],
        ...report.sellers.filter((r) => r.dept === d).map((r) => [r.label, r.team ?? '', r.sent, r.sentNet, r.returned, r.returnedNet, share(r.returned, r.sent) ?? '', share(r.returnedNet, r.sentNet) ?? '']),
      ]), `Chuyển đi và hoàn ${d}`);
      XLSX.utils.book_append_sheet(wb, sheet(report.sellerTeams, SELLER_COLS, false), 'Team lên đơn');
      XLSX.utils.book_append_sheet(wb, sheet(report.sellerDepts, SELLER_COLS, false), 'Bộ phận lên đơn');
      XLSX.utils.book_append_sheet(wb, sheet(report.confirmers, CONFIRMER_COLS, true), 'Người xác nhận');
      XLSX.utils.book_append_sheet(wb, sheet(report.confirmerTeams, CONFIRMER_COLS, false), 'Team xác nhận');
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['Lý do', 'Số đơn', 'Người xác nhận'], ...report.reasons.map((r) => [r.reason, r.n, r.byConfirmer.map((c) => `${c.label} (${c.n})`).join(', ')])]), 'Lý do không XN');
      // Cách tính đi kèm file (QA 10/10/2026): đơn chuyển đi theo ngày gửi hàng hay trong các đơn vào Chờ XN, cùng các định nghĩa trên trang.
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
        ['Kỳ', period],
        ['Đơn chuyển đi tính theo', report.sentBasis === 'sent' ? 'Ngày gửi hàng (lần đầu giao cho đơn vị vận chuyển)' : 'Các đơn vào Chờ xác nhận trong kỳ'],
        ...Object.entries(report.definitions),
      ]), 'Định nghĩa');
      saveXlsx(XLSX, wb, `van-don-${start}-${end}.xlsx`);
    } catch { toast('Không xuất được file Excel.', { kind: 'error' }); }
  }

  return (
    <div className="space-y-5">
      <PageHeader eyebrow={period} title="Vận đơn" subtitle="Gọi xác nhận, chuyển đơn đi và hàng hoàn: do người lên đơn hay do người xác nhận"
        badge={<StaleChip stale={stale} at={at} loading={loading} error={report ? error : null} onRetry={reload} />}
        actions={<Button onClick={exportExcel} disabled={!report}>Xuất Excel</Button>} />
      <PeriodToolbar preset={preset} start={start} end={end} onPreset={setPreset} onStart={setStart} onEnd={setEnd} loading={loading} onReload={reload}
        extra={<><span className="px-1 text-xs font-semibold text-ink-2">Xem theo</span><SegmentedControl<Level> ariaLabel="Xem theo" size="sm" value={level} onChange={setLevel} options={LEVELS} /></>} />
      <PosChips posIds={posIds} onChange={setPosIds} />
      {!mktLens && <TrendNotes depts={['vandon']} />}
      {error && !report && <ErrorBox error={error} onRetry={reload} />}
      {!report && !error && <><SkeletonKpis count={5} className="xl:grid-cols-5" /><SkeletonTable rows={8} /></>}
      {report && t && (
        <>
          <div className="stagger grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-5" aria-busy={loading || undefined}>
            {/* Ngoại lệ tên thẻ do anh đặt trong plan A3 ngày 17/10/2026. */}
            {[
              { key: 'confirmed', label: 'Đơn chốt', icon: BadgeCheck, count: t.confirmed, net: t.confirmedNet, at: t.atConfirmed, prev: t.closed, base: 'đơn vào Chờ xác nhận', definition: 'Đơn vào Chờ xác nhận trong kỳ đã qua Đã xác nhận, kể cả hủy sau đó. Doanh số là tổng giá trị các đơn này.' },
              { key: 'packed', label: 'Đơn xác nhận', icon: BadgeCheck, count: t.packed, net: t.packedNet, at: t.atPacked, prev: t.confirmed, base: 'Đơn chốt', definition: 'Đơn vào Chờ xác nhận trong kỳ đã qua Đang đóng hàng, kể cả hủy sau đóng hàng. Doanh số là tổng giá trị các đơn này.' },
              { key: 'sent', label: 'Đơn chuyển', icon: Send, count: t.sent, net: t.sentNet, at: t.atSent, prev: t.packed, base: 'Đơn xác nhận', definition: bySent ? 'Đơn giao ĐVVC lần đầu trong kỳ, theo ngày gửi hàng; khác nhóm hai thẻ trước nên tỷ lệ có thể vượt 100%. Doanh số là tổng giá trị các đơn này.' : 'Đã giao ĐVVC trong các đơn vào Chờ xác nhận trong kỳ. Doanh số là tổng giá trị các đơn này.' },
              { key: 'delivered', label: 'Đơn nhận', icon: ShoppingCart, count: t.delivered, net: t.deliveredNet, at: t.atDelivered, prev: t.sent, base: 'Đơn chuyển', definition: 'Đã nhận hoặc đã thu tiền; cùng cơ sở kỳ với Đơn chuyển. Doanh số là tổng giá trị các đơn này.' },
              { key: 'returned', label: 'Đơn hoàn', icon: Undo2, count: t.returned, net: t.returnedNet, at: t.atReturned, prev: t.delivered, base: 'Đơn nhận', definition: 'Đang hoàn, hoàn một phần hoặc đã hoàn; cùng cơ sở kỳ với Đơn chuyển. Theo đơn = hoàn ÷ đơn chuyển; theo doanh số = giá trị hoàn ÷ doanh số chuyển.' },
            ].map((c) => <KpiCard key={c.key} icon={c.icon} label={c.label} value={vi.format(c.count)} onClick={() => openCard(c.key)} active={card === c.key} tooltip={{ definition: c.definition, period }} note={<>
              <span className="block">Doanh số {money(c.net)}</span>
              <span className="block">{pct(share(c.count, c.prev))} so với {c.base}</span>
              <span className="block">Đang nằm ở bước này: {vi.format(c.at)}</span>
              {c.key === 'returned' && <><span className="block">Theo đơn: {pct(t.returnRate)} · hoàn ÷ đơn chuyển</span><span className="block">Theo doanh số: {pct(t.returnRateNet)} · giá trị hoàn ÷ doanh số chuyển</span></>}
            </>} />)}
          </div>
          <AdvisorPanel dept="vandon" />
          <p className="text-xs text-ink-3"><button type="button" className="underline" onClick={() => openCard('waiting')}>Còn chờ xác nhận {vi.format(t.waiting)}</button> · <button type="button" className="underline" onClick={() => openCard('failed')}>Không xác nhận được {vi.format(t.failed)}</button></p>
          {card && <ChartCard title="Danh sách đơn tính ra số đã chọn" subtitle={period}>
            <Button onClick={() => setCard(null)}>Đóng</Button>
            {drill.error ? <ErrorBox error={drill.error} onRetry={drill.reload} /> : !drill.data ? <SkeletonTable rows={5} /> : <>
              <TableWrap><table className="tbl"><thead><tr><th>Mã đơn</th><th>Trạng thái</th><th>Doanh số</th></tr></thead><tbody>{drill.data.orders.map((o) => <tr key={o.id}><td>{o.orderId}</td><td>{STATUS_NAMES[o.status] ?? 'Chưa rõ'}</td><td>{money(o.net)}</td></tr>)}</tbody></table></TableWrap>
              {!drill.data.orders.length && <EmptyState text="Không có đơn" />}
              <Button disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - 100))}>Trước</Button><Button disabled={!drill.data.more} onClick={() => setOffset(offset + 100)}>Tiếp</Button>
            </>}
          </ChartCard>}

          <ReturnBreakdown t={t} period={period} bySent={bySent} estimated={report?.sentEstimated} />

          {(['Sale', 'CSKH'] as const).map((d) => (
            <ChartCard key={d} id={`vd-dept-${d.toLowerCase()}`} icon={Undo2} title={`${d} · đơn chuyển đi và đơn hoàn theo người`}
              subtitle={`Đơn vào Chờ xác nhận ${period} từ người thuộc bộ phận ${d}, xét trạng thái hiện tại. Bấm tiêu đề cột để sắp xếp.`}>
              <DeptShipTable rows={report.sellers.filter((r) => r.dept === d)} />
            </ChartCard>
          ))}

          <ChartCard id="vd-sellers" icon={ShoppingCart} title="Phía lên đơn (Sale, CSKH)" subtitle="Hoàn cao và nhiều đơn không xác nhận được ở người lên đơn là dấu hiệu lên đơn kém." info={report.definitions['Người lên đơn']}>
            <LineTable rows={sellers} cols={SELLER_COLS} level={level} first={first} />
          </ChartCard>

          <ChartCard icon={BadgeCheck} title="Phía xác nhận (Vận đơn)" subtitle="Hoàn cao ở đơn một người đã xác nhận là dấu hiệu gọi xác nhận kém." info={report.definitions['Người xác nhận']}>
            <LineTable rows={confirmers} cols={CONFIRMER_COLS} level={level} first={first} />
          </ChartCard>

          <ChartCard icon={PhoneOff} title="Lý do không xác nhận được" subtitle={`${vi.format(t.failed)} đơn bị hủy khi đang Chờ xác nhận`} info={report.definitions['Không xác nhận được']}>
            {report.reasons.length ? (
              <ul className="space-y-2.5">
                {report.reasons.map((r) => (
                  <li key={r.reason}>
                    <div className="flex items-baseline justify-between gap-3 text-sm"><span className="font-medium text-ink">{r.reason}</span><span className="num text-ink-2">{vi.format(r.n)} đơn · {pct(t.failed ? r.n / t.failed * 100 : null, 0)}</span></div>
                    <span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-surface-3" aria-hidden="true"><i className="block h-full rounded-full bg-t-orange" style={{ width: `${r.n / maxReason * 100}%` }} /></span>
                    <p className="mt-0.5 text-xs text-ink-3">{r.byConfirmer.slice(0, 5).map((c) => `${c.label} ${vi.format(c.n)}`).join(' · ')}</p>
                  </li>
                ))}
              </ul>
            ) : <EmptyState text="Không có đơn nào bị hủy khi đang Chờ xác nhận" />}
            {!!t.failed && (
              <div className="mt-5 grid gap-4 border-t border-line pt-4 md:grid-cols-2">
                <FailedList title="Thẻ đang gắn trên các đơn này" empty="Các đơn này chưa gắn thẻ nào" items={report.failedTags ?? []} />
                <FailedList title="Ghi chú trên các đơn này" empty="Các đơn này không có ghi chú" items={report.failedNotes ?? []} />
              </div>
            )}
          </ChartCard>

          <Definitions items={Object.entries(report.definitions).map(([term, def]) => `${term}: ${def}`)} />
        </>
      )}
    </div>
  );
}
