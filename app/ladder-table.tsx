'use client';

// Bảng bậc thang mua lại dùng chung (CSKH: theo nhóm sản phẩm của đơn đầu; Sale: theo tháng): T0 → T1 → T2… mỗi ô ghi
// số khách, % so với T0 và % so với bậc liền trước, để chụp báo cáo không cần rê chuột.
import { useState, type ReactNode } from 'react';
import { FileDown, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useApi } from './use-api';
import { EmptyState, ErrorBox, SegmentedControl, SkeletonTable, TableWrap, TipContent, Tooltip, dt, money, pct, shortMoney, toast, vi } from './ui-kit';

type Gap = { n: number; avg: number | null; median: number | null; p25: number | null; p75: number | null };
export type LadderLine = {
  t0: number; ladder: { n: number; rate: number | null; step: number | null; gap?: Gap }[];
  cross: number; crossRate: number | null; ownCustomers: number; ownOrders: number; laterOrders: number; laterNet: number; avgDaysToT1: number | null;
};
const days = (d: number | null | undefined) => d === null || d === undefined ? '—' : d < 1 ? 'dưới 1 ngày' : `${vi.format(Math.round(d))} ngày`;
const prevLabel = (i: number) => i === 0 ? 'T0' : `T${i}`;

/** Ô đang mở danh sách khách: dòng (key, hoặc null = tổng) và bậc (0 = T0, k = Tk). */
export type LadderPick = { row: string | null; label: string; step: number };

export function LadderTable({ rows, steps, first, extra = [], total, onPick, picked }: {
  rows: { key: string; label: ReactNode; sub?: ReactNode; line: LadderLine }[]; steps: number; first: string;
  /** Cột thêm sau các bậc: tiêu đề + cách lấy giá trị. */ extra?: { head: string; cell: (l: LadderLine) => ReactNode }[];
  total?: { label: string; line: LadderLine };
  /** Bấm số T0 / Tk để xem danh sách khách của ô đó. */ onPick?: (p: LadderPick) => void; picked?: LadderPick | null;
}) {
  const isOn = (row: string | null, step: number) => !!picked && picked.row === row && picked.step === step;
  const pickable = (row: string | null, label: string, step: number, n: number, child: ReactNode) => onPick && n > 0
    ? <button type="button" className={`block w-full cursor-pointer rounded-md text-right hover:underline ${isOn(row, step) ? 'outline-2 outline-primary' : ''}`} aria-pressed={isOn(row, step)}
        title={step ? `Xem khách chưa mua T${step} / đã mua T${step}` : 'Xem danh sách khách T0'} onClick={() => onPick({ row, label, step })}>{child}</button>
    : child;
  const shade = (rate: number | null) => rate === null ? 'transparent' : `color-mix(in oklab, var(--primary) ${Math.round(Math.min(32, rate * 0.5))}%, transparent)`;
  const cells = (l: LadderLine, label: string, row: string | null) => l.ladder.map((c, i) => (
    <td key={i} className="n align-middle" style={{ background: c.n ? shade(c.rate) : undefined }}>
      {l.t0 ? <Tooltip content={<TipContent title={`${label} · T${i + 1} (lần mua thứ ${i + 2})`}
        rows={[['Số khách', `${vi.format(c.n)} / ${vi.format(l.t0)} khách T0`], ['So với T0', pct(c.rate)], ['So với bậc trước', pct(c.step)],
          ...(c.gap?.n ? [[`${prevLabel(i)} → T${i + 1}: trung vị`, days(c.gap.median)], ['Trung bình', days(c.gap.avg)], ['25% nhanh nhất trong', days(c.gap.p25)], ['25% chậm nhất sau', days(c.gap.p75)]] as [string, string][] : [])]} />}>
        <span tabIndex={onPick ? -1 : 0} className="block cursor-help leading-tight">{pickable(row, label, i + 1, (i ? l.ladder[i - 1].n : l.t0), <b className="block text-ink">{vi.format(c.n)}</b>)}<span className="block text-[11px] font-normal text-ink-2">{pct(c.rate, 1)}</span><span className="block text-[10.5px] font-normal text-ink-3">{i === 0 ? 'so với T0' : `${pct(c.step, 0)} bậc trước`}</span>{c.gap?.n ? <span className="block text-[10.5px] font-normal text-ink-3">sau {days(c.gap.median)}</span> : null}</span>
      </Tooltip> : <span className="text-ink-4">—</span>}
    </td>
  ));
  return (
    <TableWrap minWidth={176 + 96 + steps * 112 + extra.length * 136} stickyFirst>
      {/* Cột cố định bề rộng, tiêu đề và số cùng căn phải, ô nào cũng 3 dòng để các hàng thẳng nhau. */}
      <table className="tbl" style={{ tableLayout: 'fixed' }}>
        <colgroup>
          <col style={{ width: 176 }} /><col style={{ width: 96 }} />
          {Array.from({ length: steps }, (_, i) => <col key={i} style={{ width: 112 }} />)}
          {extra.map((x) => <col key={x.head} style={{ width: 136 }} />)}
        </colgroup>
        <thead><tr>
          <th className="text-left">{first}</th>
          <th className="n">T0 · khách</th>
          {Array.from({ length: steps }, (_, i) => <th key={i} className="n">T{i + 1}<span className="block text-[10px] font-normal normal-case tracking-normal text-ink-3">lần {i + 2}</span></th>)}
          {extra.map((x) => <th key={x.head} className="n whitespace-normal">{x.head}</th>)}
        </tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key}>
              <td className="text-left align-middle font-medium text-ink">{r.label}{r.sub && <span className="block text-[11px] font-normal text-ink-3">{r.sub}</span>}</td>
              <td className="n align-middle font-semibold">{pickable(r.key, typeof r.label === 'string' ? r.label : r.key, 0, r.line.t0, vi.format(r.line.t0))}</td>
              {cells(r.line, typeof r.label === 'string' ? r.label : r.key, r.key)}
              {extra.map((x) => <td key={x.head} className="n align-middle">{x.cell(r.line)}</td>)}
            </tr>
          ))}
        </tbody>
        {total && (
          <tfoot><tr>
            <td className="text-left">{total.label}</td>
            <td className="n">{pickable(null, total.label, 0, total.line.t0, vi.format(total.line.t0))}</td>
            {total.line.ladder.map((c, i) => <td key={i} className="n">{pickable(null, total.label, i + 1, i ? total.line.ladder[i - 1].n : total.line.t0, vi.format(c.n))}<span className="block text-[11px] font-normal text-ink-3">{pct(c.rate, 1)}</span>{c.gap?.n ? <span className="block text-[10.5px] font-normal text-ink-3">sau {days(c.gap.median)}</span> : null}</td>)}
            {extra.map((x) => <td key={x.head} className="n">{x.cell(total.line)}</td>)}
          </tr></tfoot>
        )}
      </table>
    </TableWrap>
  );
}

export const ladderExtras = {
  cross: { head: 'Up sang nhóm kia', cell: (l: LadderLine) => <>{vi.format(l.cross)}<span className="block text-[11px] font-normal text-ink-3">{pct(l.crossRate, 1)}</span></> },
  own: { head: 'Lần mua do chính NV', cell: (l: LadderLine) => <>{vi.format(l.ownOrders)} đơn<span className="block text-[11px] font-normal text-ink-3">{vi.format(l.ownCustomers)} khách</span></> },
  later: { head: 'Đơn mua tiếp', cell: (l: LadderLine) => <>{vi.format(l.laterOrders)}{l.laterNet ? <span className="block text-[11px] font-normal text-ink-3">{shortMoney(l.laterNet)}</span> : null}</> },
  days: { head: 'T0 → T1 sau', cell: (l: LadderLine) => days(l.avgDaysToT1) },
};

type Member = { phone: string; name: string; group: string; pos: string; purchases: number; t0At: string; t0Seller: string | null; lastAt: string; daysSinceLast: number; net: number; care: string | null };

/** Danh sách khách của một ô bậc thang (yêu cầu 01/10/2026): T0 → T1 có 200 khách mua lại thì 800 khách còn lại là ai; xuất Excel.
 * baseUrl = API của bảng (đã có bộ lọc); thêm step, listGroup, mode. */
export function LadderMembers({ baseUrl, pick, onClose, title }: { baseUrl: string; pick: LadderPick; onClose: () => void; title: string }) {
  const [mode, setMode] = useState<'stopped' | 'reached'>('stopped');
  const k = pick.step;
  const url = `${baseUrl}${baseUrl.includes('?') ? '&' : '?'}${new URLSearchParams({ step: String(k), mode: k ? mode : 'stopped', ...(pick.row ? { listGroup: pick.row } : {}) })}`;
  const api = useApi<{ total: number; customers: Member[] }>(url, { keep: false });
  const list = api.data?.customers;
  const what = !k ? `khách T0 (${pick.label})` : mode === 'stopped' ? `khách đã có ${k === 1 ? 'T0' : `T${k - 1}`} nhưng chưa mua T${k} (${pick.label})` : `khách đã mua T${k} (${pick.label})`;
  const exportXlsx = async () => {
    if (!list?.length) return;
    const XLSX = await import('xlsx');
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
      ['Tên khách', 'SĐT', 'Nhóm đơn đầu', 'POS đơn đầu', 'Số lần đã nhận', 'Ngày T0', 'Người bán T0', 'Lần nhận gần nhất', 'Số ngày từ lần gần nhất', 'Tổng tiền đã nhận', 'Đang cầm (CSKH)'],
      ...list.map((c) => [c.name, c.phone, c.group, c.pos, c.purchases, dt(c.t0At), c.t0Seller ?? '', dt(c.lastAt), c.daysSinceLast, Math.round(c.net), c.care ?? '']),
    ]), 'Khách');
    XLSX.writeFile(wb, `${title}_${pick.label}_${k ? `${mode === 'stopped' ? 'chua-mua' : 'da-mua'}-T${k}` : 'T0'}.xlsx`.replace(/[\\/:*?"<>|\s]+/g, '-'));
    toast(`Đã xuất ${vi.format(list.length)} khách`);
  };
  return (
    <div className="mt-4 rounded-xl border border-line bg-surface-2 p-3">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div className="text-sm font-semibold text-ink">{api.data ? `${vi.format(api.data.total)} ` : ''}{what}{api.data && api.data.total > (list?.length ?? 0) ? <span className="block text-xs font-normal text-ink-3">Hiện {vi.format(list?.length ?? 0)} khách mua gần nhất; chọn một nhân viên hoặc kỳ ngắn hơn để xem đủ.</span> : null}</div>
        <div className="flex flex-wrap items-center gap-2">
          {k > 0 && <SegmentedControl size="sm" ariaLabel="Khách chưa mua hay đã mua bậc này" value={mode} onChange={setMode}
            options={[{ value: 'stopped', label: `Chưa mua T${k}` }, { value: 'reached', label: `Đã mua T${k}` }]} />}
          <Button size="sm" variant="outline" disabled={!list?.length} onClick={() => void exportXlsx()}><FileDown size={14} />Xuất Excel</Button>
          <Button size="sm" variant="ghost" aria-label="Đóng danh sách" onClick={onClose}><X size={14} /></Button>
        </div>
      </div>
      {api.error && !list ? <ErrorBox error={api.error} onRetry={api.reload} /> : !list ? <SkeletonTable rows={5} cols={7} /> : !list.length ? <EmptyState text="Không có khách nào." /> : (
        <TableWrap maxHeight="28rem" minWidth={860} sticky>
          <table className="tbl">
            <thead><tr><th>Khách</th><th>Nhóm · POS</th><th className="n">Lần đã nhận</th><th>Ngày T0 · người bán</th><th>Lần nhận gần nhất</th><th className="n">Tổng đã nhận</th><th>Đang cầm</th></tr></thead>
            <tbody>
              {list.map((c) => (
                <tr key={c.phone}>
                  <td><div className="font-medium text-ink">{c.name || 'Khách chưa có tên'}</div><div className="num text-[11px] text-ink-3">{c.phone}</div></td>
                  <td className="text-xs">{c.group}<div className="text-ink-3">{c.pos}</div></td>
                  <td className="n">{vi.format(c.purchases)}</td>
                  <td className="text-xs"><span className="num">{dt(c.t0At)}</span><div className="text-ink-3">{c.t0Seller ?? '—'}</div></td>
                  <td className="text-xs"><span className="num">{dt(c.lastAt)}</span><div className="text-ink-3"><span className="num">{vi.format(c.daysSinceLast)}</span> ngày trước</div></td>
                  <td className="n">{money(c.net)}</td>
                  <td className="text-xs">{c.care ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableWrap>
      )}
    </div>
  );
}
