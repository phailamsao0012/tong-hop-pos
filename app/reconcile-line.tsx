'use client';

// Đối chiếu hai đường tính "Đơn chốt / Doanh thu" (yêu cầu 22/09/2026): bảng tổng hợp theo ngày (stats_daily) so với
// đếm lại thẳng từ đơn gốc; và doanh số − giảm giá/quà phải ra đúng doanh thu. Lệch là hiện cảnh báo vàng thay vì im lặng.
import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import { money, vi } from './ui-kit';

export type Reconcile = { orders: number; gross: number; discount: number; net: number };
type Totals = { closedOrders: number; closedGross: number; closedDiscount: number; closedNet: number; reconcile?: Reconcile | null };

export function reconcileState(t: Totals) {
  const r = t.reconcile;
  if (!r) return null;
  const orderDiff = r.orders - t.closedOrders;
  const netDiff = r.net - t.closedNet;
  const formula = r.gross - r.discount; // doanh số − giảm giá/quà (đếm từ đơn gốc)
  const formulaDiff = formula - r.net;
  const ok = orderDiff === 0 && Math.abs(netDiff) < 1000 && Math.abs(formulaDiff) < 1000;
  return { ok, orderDiff, netDiff, formula, formulaDiff, r };
}

export function ReconcileLine({ totals, className = '' }: { totals: Totals; className?: string }) {
  const s = reconcileState(totals);
  if (!s) return null;
  const { r } = s;
  const body = <>Đếm lại từ đơn gốc: <b className="num">{vi.format(r.orders)}</b> đơn · doanh số <span className="num">{money(r.gross)}</span> − giảm giá/quà <span className="num">{money(r.discount)}</span> = <b className="num">{money(s.formula)}</b>{s.ok ? <> · khớp bảng tổng hợp ({vi.format(totals.closedOrders)} đơn · {money(totals.closedNet)})</> : null}</>;
  if (s.ok) return <p className={`flex items-start gap-1.5 text-[11.5px] leading-relaxed text-ink-3 ${className}`} role="status"><CheckCircle2 size={13} className="mt-0.5 shrink-0 text-good" aria-hidden="true" /><span>{body}</span></p>;
  return (
    <p className={`notice warn ${className}`} role="alert">
      <AlertTriangle size={15} className="mt-0.5 shrink-0" aria-hidden="true" />
      <span><b>Hai cách tính đang lệch</b> — bảng tổng hợp: {vi.format(totals.closedOrders)} đơn · {money(totals.closedNet)}; {body}.
        {s.orderDiff !== 0 && <> Lệch <b className="num">{s.orderDiff > 0 ? '+' : ''}{vi.format(s.orderDiff)}</b> đơn.</>}
        {Math.abs(s.netDiff) >= 1000 && <> Lệch doanh thu <b className="num">{money(s.netDiff)}</b>.</>}
        {Math.abs(s.formulaDiff) >= 1000 && <> Doanh số − giảm giá không bằng doanh thu (lệch {money(s.formulaDiff)}): có đơn thiếu giá sau giảm.</>}
        {' '}Thường do bảng tổng hợp đang được dựng lại sau khi đổi cách tính; tự khớp trong ít phút. Nếu kéo dài quá 1 giờ, báo người quản trị.</span>
    </p>
  );
}
