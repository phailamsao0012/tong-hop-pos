'use client';

// Đối chiếu POS với sheet CPQC Daily (anh Vũ 12/10/2026: "vừa kết hợp trên pos và báo cáo trên sheet xem khớp không nữa nhé").
// Sheet: cột SĐT, Đơn, DT marketer tự ghi (lib/sheet-costs.ts lưu ở sheet_mkt_stats). POS: đơn Pancake có Marketer (lib/mkt-sheet-check.ts).
// Chưa biết sheet ghi theo ngày tạo đơn hay ngày chốt, cả CSKH hay chỉ Sale: cho chọn mốc ngày và hiện POS tách New / CSKH, kèm gợi ý cột nào khớp nhất.
import { useMemo, useState, type ReactNode } from 'react';
import { CalendarDays, Check, FileSpreadsheet, UserRound, X } from 'lucide-react';
import { EmptyState, SegmentedControl, SortTh, StatusChip, TableWrap, dmy, money, shortMoney, useSort, vi } from './ui-kit';
import type { Tone } from './ui-kit';
import { useApi } from './use-api';

type PosSide = { orders: number; phones: number; closed: number; net: number; sale: number; cskh: number; other: number; saleClosed: number; cskhClosed: number };
type CheckRow = { sheet: { phones: number; orders: number; revenue: number }; confirmed: PosSide; created: PosSide };
type Data = {
  period: { start: string; end: string };
  sheet: { connected: boolean; receivedAt: string | null; hasStats: boolean };
  total: CheckRow;
  marketers: (CheckRow & { id: string; name: string; counted: boolean })[];
  days: (CheckRow & { day: string })[];
  detail: (CheckRow & { marketerId: string; day: string })[];
};
type Basis = 'confirmed' | 'created';
type View = 'marketer' | 'day';
type SortKey = 'name' | 'sPhones' | 'pPhones' | 'sOrders' | 'pOrders' | 'sRev' | 'pRev' | 'gap' | 'sale' | 'cskh';
type Target = 'net' | 'sale' | 'cskh';
const TARGETS: Target[] = ['net', 'sale', 'cskh'];
const TARGET_LABEL: Record<Target, string> = { net: 'Tổng', sale: 'New', cskh: 'CSKH' };
const TARGET_TEXT: Record<Target, string> = { net: 'tổng (mọi người bán)', sale: 'New (Sale chốt)', cskh: 'CSKH chốt' };
const TARGET_TITLE: Record<Target, string> = { net: 'Mọi đơn chốt trên data MKT', sale: 'Chỉ đơn Sale chốt (doanh thu New)', cskh: 'Chỉ đơn CSKH chốt' };
const pick = (p: PosSide, k: Target) => k === 'sale' ? { net: p.sale, closed: p.saleClosed } : k === 'cskh' ? { net: p.cskh, closed: p.cskhClosed } : { net: p.net, closed: p.closed };
const zeroPos = (): PosSide => ({ orders: 0, phones: 0, closed: 0, net: 0, sale: 0, cskh: 0, other: 0, saleClosed: 0, cskhClosed: 0 });
const zeroRow = (): CheckRow => ({ sheet: { phones: 0, orders: 0, revenue: 0 }, confirmed: zeroPos(), created: zeroPos() });
const addRow = (a: CheckRow, b: CheckRow) => {
  for (const k of ['phones', 'orders', 'revenue'] as const) a.sheet[k] += b.sheet[k];
  for (const side of ['confirmed', 'created'] as const) for (const k of Object.keys(a[side]) as (keyof PosSide)[]) a[side][k] += b[side][k] ?? 0;
};

const BASIS_TEXT: Record<Basis, string> = { confirmed: 'ngày xác nhận', created: 'ngày tạo đơn' };
const range = (a: string, b: string) => a === b ? dmy(a) : `${dmy(a)}–${dmy(b)}`;
/** Lệch = sheet − POS, tính % trên số POS. */
const gapOf = (sheet: number, pos: number) => ({ diff: sheet - pos, pct: pos ? (sheet - pos) / pos * 100 : sheet ? 100 : 0 });
const verdict = (pct: number): { tone: Tone; text: string } => Math.abs(pct) <= 2 ? { tone: 'green', text: 'Khớp' } : Math.abs(pct) <= 10 ? { tone: 'orange', text: 'Lệch nhẹ' } : { tone: 'red', text: 'Lệch nhiều' };
const pctText = (p: number) => `${p > 0 ? '+' : ''}${p.toFixed(1).replace('.', ',')}%`;
const signed = (n: number, fmt: (n: number) => string) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${fmt(Math.abs(n))}`;

function Tile({ label, sheet, pos, posLabel, fmt, extra }: { label: string; sheet: number; pos: number; posLabel: string; fmt: (n: number) => string; extra?: ReactNode }) {
  const g = gapOf(sheet, pos), v = verdict(g.pct);
  return (
    <div className="flex min-w-0 flex-col gap-2 rounded-xl border border-line bg-surface p-4">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[13px] font-semibold text-ink-2">{label}</span>
        <StatusChip tone={v.tone}>{v.text}</StatusChip>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="min-w-0"><span className="block text-[11.5px] text-ink-3">Sheet ghi</span><span className="num block truncate text-[1.45rem] font-bold leading-tight tracking-[-.02em] text-ink">{fmt(sheet)}</span></div>
        <div className="min-w-0"><span className="block text-[11.5px] text-ink-3">{posLabel}</span><span className="num block truncate text-[1.45rem] font-bold leading-tight tracking-[-.02em] text-ink">{fmt(pos)}</span></div>
      </div>
      <span className="num text-[12px] text-ink-3">Lệch (sheet − POS): <b className="font-semibold text-ink-2">{signed(g.diff, fmt)}</b> · {pctText(g.pct)}</span>
      {extra}
    </div>
  );
}

export function MktSheetCheck({ start, end, posIds }: { start: string; end: string; posIds: string[] }) {
  // null = theo gợi ý (cột POS khớp sheet nhất); người xem bấm chọn thì giữ lựa chọn đó.
  const [basisPick, setBasis] = useState<Basis | null>(null);
  const [targetPick, setTarget] = useState<Target | null>(null);
  const [view, setView] = useState<View>('marketer');
  const [picked, setPicked] = useState<string | null>(null);
  const url = useMemo(() => `/api/marketing/sheet-check?${new URLSearchParams({ start, end, posIds: posIds.join(',') })}`, [start, end, posIds]);
  const { data, loading, error, reload } = useApi<Data>(url, { keep: true });
  const sort = useSort<SortKey>('sRev');

  if (!data) {
    return (
      <section className={`card p-5 ${loading ? 'is-loading' : ''}`} aria-busy={loading}>
        {error ? <p className="text-[13px] text-bad">Không tải được bảng đối chiếu sheet. <button type="button" className="underline" onClick={reload}>Tải lại</button></p>
          : <div className="skel h-40 rounded-2xl" />}
      </section>
    );
  }
  // Một phạm vi cho ô tổng, gợi ý và bảng theo ngày (QA 12/10): chỉ marketer POS có tính doanh thu. Người chưa có hậu tố MKT
  // hoặc tên trên sheet chưa ghép thì POS luôn 0, vẫn hiện ở bảng Marketer với ghi chú nhưng không cộng vào đây.
  const fairIds = new Set(data.marketers.filter((m) => m.counted).map((m) => m.id));
  const left = data.marketers.filter((m) => !m.counted && (m.sheet.revenue || m.sheet.orders || m.sheet.phones || m.created.orders));
  const t = zeroRow();
  for (const m of data.marketers) if (fairIds.has(m.id)) addRow(t, m);
  const candidates = (['confirmed', 'created'] as const).flatMap((b) => TARGETS.map((k) => ({ b, k, v: pick(t[b], k).net }))).filter((c) => c.v > 0);
  const best = t.sheet.revenue > 0 ? candidates.map((c) => ({ ...c, pct: gapOf(t.sheet.revenue, c.v).pct })).sort((a, b) => Math.abs(a.pct) - Math.abs(b.pct))[0] : undefined;
  const basis: Basis = basisPick ?? best?.b ?? 'confirmed';
  const target: Target = targetPick ?? best?.k ?? 'net';
  const pt = pick(t[basis], target);
  const pickedName = picked ? data.marketers.find((m) => m.id === picked)?.name ?? picked : null;

  type Line = CheckRow & { id: string; name: string; counted?: boolean };
  const dayLines = () => {
    const byDay = new Map<string, CheckRow>();
    for (const d of data.detail) {
      if (picked ? d.marketerId !== picked : !fairIds.has(d.marketerId)) continue;
      if (!byDay.has(d.day)) byDay.set(d.day, zeroRow());
      addRow(byDay.get(d.day)!, d);
    }
    return [...byDay.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([day, x]) => ({ ...x, id: day, name: dmy(day) }));
  };
  const lines: Line[] = view === 'marketer' ? data.marketers.map((m) => ({ ...m })) : dayLines();
  const val = (r: Line, k: SortKey) => {
    const p = r[basis], q = pick(p, target);
    switch (k) {
      case 'name': return view === 'day' ? r.id : r.name;
      case 'sPhones': return r.sheet.phones; case 'pPhones': return r.created.phones;
      case 'sOrders': return r.sheet.orders; case 'pOrders': return q.closed;
      case 'sRev': return r.sheet.revenue; case 'pRev': return q.net;
      case 'gap': return Math.abs(r.sheet.revenue - q.net);
      case 'sale': return p.sale; case 'cskh': return p.cskh;
    }
  };
  const shown = view === 'day' && sort.key === 'sRev' && sort.desc ? lines : sort.apply(lines, val);
  const posLabel = `POS ${TARGET_TEXT[target]} (theo ${BASIS_TEXT[basis]})`;

  return (
    <section className={`card flex flex-col gap-4 p-5 max-sm:gap-3 max-sm:rounded-xl max-sm:p-4 ${loading ? 'is-loading' : ''}`} aria-label="Đối chiếu POS với sheet">
      <header className="flex flex-col gap-2">
        <div className="min-w-0">
          <h2 className="display flex items-center gap-2 text-lg font-semibold leading-tight tracking-[-.015em] text-ink"><FileSpreadsheet size={18} className="text-primary" />Đối chiếu POS với sheet CPQC Daily <span className="num font-medium text-ink-3">· {range(data.period.start, data.period.end)}</span></h2>
          <p className="mt-0.5 max-w-[80ch] text-[12px] text-ink-3">Sheet: cột SĐT, Đơn, DT marketer tự ghi mỗi ngày. POS: đơn Pancake có Marketer, doanh thu sau giảm trừ, chỉ marketer có hậu tố MKT. Số SĐT POS là số khác nhau trên đơn tạo, đếm từng ngày rồi cộng như sheet. Lệch = sheet − POS.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[12.5px] font-semibold text-ink-2">So sheet với</span>
          <SegmentedControl<Target> size="sm" ariaLabel="So sheet với doanh thu POS nào" value={target} onChange={setTarget} options={TARGETS.map((k) => ({ value: k, label: TARGET_LABEL[k], title: TARGET_TITLE[k] }))} />
          <SegmentedControl<Basis> size="sm" ariaLabel="POS tính theo" value={basis} onChange={setBasis} options={[
            { value: 'confirmed', label: 'Ngày xác nhận', title: 'Đơn chốt và doanh thu tính vào ngày đơn được xác nhận lần đầu (như ô Doanh thu MKT)' },
            { value: 'created', label: 'Ngày tạo đơn', title: 'Đơn tạo trong ngày, tính phần tới nay đã chốt' },
          ]} />
          {(basisPick || targetPick) && best && <button type="button" onClick={() => { setBasis(null); setTarget(null); }} className="text-[12px] text-ink-3 underline-offset-2 hover:text-primary hover:underline">Theo gợi ý</button>}
        </div>
      </header>

      {!data.sheet.hasStats && (
        <p className="rounded-lg border border-line bg-surface-2 px-3 py-2 text-[12.5px] leading-snug text-ink-2">
          {data.sheet.connected
            ? 'Sheet chưa có số SĐT / Đơn / DT trong khoảng ngày này. Web đọc các cột này từ lần gửi kế tiếp của sheet (script gửi mỗi giờ), không cần dán lại script.'
            : 'Chưa nối Google Sheet chi phí. Nối ở trang Chi phí & ROAS.'}
        </p>
      )}

      {best && (
        <p className="rounded-lg bg-tint-2 px-3 py-2 text-[12.5px] leading-snug text-ink-2">
          Gợi ý: DT trên sheet gần nhất với <b>POS {TARGET_TEXT[best.k]}, theo {BASIS_TEXT[best.b]}</b> (lệch {pctText(best.pct)}){basisPick || targetPick ? '' : ', nên đang so theo cột này'}.{Math.abs(best.pct) > 10 ? ' Vẫn lệch nhiều: xem từng marketer, từng ngày ở bảng dưới.' : ''}
        </p>
      )}
      <div className="grid gap-3 md:grid-cols-3">
        <Tile label="Số điện thoại" sheet={t.sheet.phones} pos={t.created.phones} posLabel="POS (SĐT trên đơn tạo)" fmt={(n) => vi.format(n)} />
        <Tile label="Đơn chốt" sheet={t.sheet.orders} pos={pt.closed} posLabel={posLabel} fmt={(n) => vi.format(n)} />
        <Tile label="Doanh thu" sheet={t.sheet.revenue} pos={pt.net} posLabel={posLabel} fmt={shortMoney}
          extra={<span className="num text-[12px] leading-snug text-ink-3">POS theo {BASIS_TEXT[basis]}: New <b className="font-semibold text-ink-2">{shortMoney(t[basis].sale)}</b> · CSKH <b className="font-semibold text-ink-2">{shortMoney(t[basis].cskh)}</b>{t[basis].other ? <> · người bán chưa có hậu tố {shortMoney(t[basis].other)}</> : null}</span>} />
      </div>
      {left.length > 0 && (
        <p className="text-[12px] leading-snug text-ink-3">Ba ô trên và bảng theo ngày không tính {left.map((m) => m.name).join(', ')}: POS không tính doanh thu của {left.length > 1 ? 'những người này' : 'người này'} (xem ghi chú ở bảng Marketer).</p>
      )}

      <div className="flex min-w-0 flex-col gap-3 border-t border-line pt-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-base font-semibold text-ink">Chi tiết</h3>
            {pickedName && <button type="button" onClick={() => setPicked(null)} className="inline-flex items-center gap-1.5 rounded-full border border-primary/40 bg-tint-2 px-2.5 py-1 text-[12.5px] font-semibold text-primary hover:border-primary" title="Bỏ lọc"><UserRound size={13} />{pickedName}<X size={13} /></button>}
          </div>
          <SegmentedControl<View> size="sm" ariaLabel="Xem chi tiết theo" value={view} onChange={setView} options={[{ value: 'marketer', label: 'Marketer', icon: UserRound }, { value: 'day', label: 'Ngày', icon: CalendarDays }]} />
        </div>
        {!lines.length ? <EmptyState text="Không có số trên sheet hay đơn Marketing trong khoảng ngày này." /> : (
          <TableWrap stickyFirst><table className="tbl">
            <thead>
              <tr><SortTh k="name" label={view === 'marketer' ? 'Marketer' : 'Ngày'} sort={sort} align="left" /><SortTh k="sPhones" label="SĐT sheet" sort={sort} /><SortTh k="pPhones" label="SĐT POS" sort={sort} /><SortTh k="sOrders" label="Đơn sheet" sort={sort} /><SortTh k="pOrders" label={`Đơn POS ${TARGET_LABEL[target]}`} sort={sort} /><SortTh k="sRev" label="DT sheet" sort={sort} /><SortTh k="pRev" label={`DT POS ${TARGET_LABEL[target]}`} sort={sort} /><SortTh k="gap" label="Lệch DT" sort={sort} /><SortTh k="sale" label="POS New" sort={sort} /><SortTh k="cskh" label="POS CSKH" sort={sort} /></tr>
            </thead>
            <tbody>{shown.map((r) => {
              const p = r[basis], q = pick(p, target), g = gapOf(r.sheet.revenue, q.net), v = verdict(g.pct);
              const unmatched = view === 'marketer' && r.id.startsWith('sheet:');
              const notCounted = view === 'marketer' && !unmatched && r.counted === false;
              return (
                <tr key={r.id} className={picked === r.id ? 'bg-tint-2' : ''}>
                  <td className="min-w-40">
                    {view === 'marketer'
                      ? <button type="button" onClick={() => { setPicked(r.id === picked ? null : r.id); if (r.id !== picked) setView('day'); }} className="flex items-center gap-1.5 text-left font-semibold text-ink hover:text-primary" title="Bấm để xem từng ngày của người này">
                          {picked === r.id && <Check size={14} className="shrink-0 text-primary" />}{r.name}
                        </button>
                      : <span className="num font-semibold">{r.name}</span>}
                    {unmatched && <span className="block max-w-60 whitespace-normal text-[11px] font-normal leading-snug text-ink-3">Tên trên sheet chưa ghép với nhân viên POS (ghép ở trang Chi phí &amp; ROAS)</span>}
                    {notCounted && <span className="block max-w-60 whitespace-normal text-[11px] font-normal leading-snug text-warn">Tên POS chưa có hậu tố MKT nên POS không tính doanh thu (trang Doanh thu ngoài hậu tố)</span>}
                  </td>
                  <td className="n">{vi.format(r.sheet.phones)}</td>
                  <td className="n">{vi.format(r.created.phones)}</td>
                  <td className="n">{vi.format(r.sheet.orders)}</td>
                  <td className="n">{vi.format(q.closed)}</td>
                  <td className="n font-semibold">{money(r.sheet.revenue)}</td>
                  <td className="n font-semibold">{money(q.net)}</td>
                  <td className="n">{unmatched || notCounted ? <span className="text-[11.5px] text-ink-3">không so</span> : r.sheet.revenue || q.net ? <span className="inline-flex flex-col items-end gap-0.5"><span className="num">{signed(g.diff, (n) => money(n))}</span><StatusChip tone={v.tone}>{v.text} {pctText(g.pct)}</StatusChip></span> : '—'}</td>
                  <td className="n">{money(p.sale)}</td>
                  <td className="n">{money(p.cskh)}</td>
                </tr>
              );
            })}</tbody>
          </table></TableWrap>
        )}
      </div>
    </section>
  );
}
