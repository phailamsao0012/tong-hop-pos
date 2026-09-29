'use client';

// Bảng bậc thang mua lại dùng chung (CSKH: theo nhóm sản phẩm của đơn đầu; Sale: theo tháng): T0 → T1 → T2… mỗi ô ghi
// số khách, % so với T0 và % so với bậc liền trước, để chụp báo cáo không cần rê chuột.
import type { ReactNode } from 'react';
import { TableWrap, TipContent, Tooltip, pct, shortMoney, vi } from './ui-kit';

export type LadderLine = {
  t0: number; ladder: { n: number; rate: number | null; step: number | null }[];
  cross: number; crossRate: number | null; ownCustomers: number; ownOrders: number; laterOrders: number; laterNet: number; avgDaysToT1: number | null;
};
const days = (d: number | null) => d === null ? '—' : d < 1 ? 'dưới 1 ngày' : `${vi.format(Math.round(d))} ngày`;

export function LadderTable({ rows, steps, first, extra = [], total }: {
  rows: { key: string; label: ReactNode; sub?: ReactNode; line: LadderLine }[]; steps: number; first: string;
  /** Cột thêm sau các bậc: tiêu đề + cách lấy giá trị. */ extra?: { head: string; cell: (l: LadderLine) => ReactNode }[];
  total?: { label: string; line: LadderLine };
}) {
  const shade = (rate: number | null) => rate === null ? 'transparent' : `color-mix(in oklab, var(--primary) ${Math.round(Math.min(60, rate * 0.9))}%, transparent)`;
  const cells = (l: LadderLine, label: string) => l.ladder.map((c, i) => (
    <td key={i} className="n" style={{ background: c.n ? shade(c.rate) : undefined }}>
      {l.t0 ? <Tooltip content={<TipContent title={`${label} · T${i + 1} (lần mua thứ ${i + 2}${i + 1 === steps ? ' trở lên' : ''})`}
        rows={[['Số khách', `${vi.format(c.n)} / ${vi.format(l.t0)} khách T0`], ['So với T0', pct(c.rate)], ['So với bậc trước', pct(c.step)]]} />}>
        <span tabIndex={0} className="cursor-help"><b className="text-ink">{vi.format(c.n)}</b><span className="block text-[11px] font-normal text-ink-2">{pct(c.rate, 1)}</span>{i > 0 && <span className="block text-[10.5px] font-normal text-ink-3">{pct(c.step, 0)} bậc trước</span>}</span>
      </Tooltip> : <span className="text-ink-4">—</span>}
    </td>
  ));
  return (
    <TableWrap minWidth={640 + steps * 80 + extra.length * 110} stickyFirst>
      <table className="tbl">
        <thead><tr>
          <th className="text-left">{first}</th>
          <th>T0 · khách</th>
          {Array.from({ length: steps }, (_, i) => <th key={i}>T{i + 1}{i + 1 === steps ? '+' : ''}<span className="block text-[10px] font-normal normal-case tracking-normal text-ink-3">lần {i + 2}{i + 1 === steps ? '+' : ''}</span></th>)}
          {extra.map((x) => <th key={x.head}>{x.head}</th>)}
        </tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key}>
              <td className="text-left font-medium text-ink">{r.label}{r.sub && <span className="block text-[11px] font-normal text-ink-3">{r.sub}</span>}</td>
              <td className="n font-semibold">{vi.format(r.line.t0)}</td>
              {cells(r.line, typeof r.label === 'string' ? r.label : r.key)}
              {extra.map((x) => <td key={x.head} className="n">{x.cell(r.line)}</td>)}
            </tr>
          ))}
        </tbody>
        {total && (
          <tfoot><tr>
            <td className="text-left">{total.label}</td>
            <td className="n">{vi.format(total.line.t0)}</td>
            {total.line.ladder.map((c, i) => <td key={i} className="n">{vi.format(c.n)}<span className="block text-[11px] font-normal text-ink-3">{pct(c.rate, 1)}</span></td>)}
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
