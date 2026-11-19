'use client';
// Rê chuột (điện thoại: chạm) vào ô Đơn tạo / SĐT / Đơn XN / Doanh thu ở bảng xếp hạng MKT thì hiện số tách theo sản phẩm
// (anh Vũ 07/11/2026). Chỉ gọi API ở lần rê đầu tiên của mỗi bộ lọc, để mở trang không tốn thêm lượt đọc.
import { useState, type ReactNode } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { LINE_LABEL, OTHER_LINE, SPLIT_LINES, type LineKey, type ProductSplit, type SplitCell, type SplitCoverage } from '@/lib/reports/mkt-product-split';
import { Th, shortMoney, vi } from './ui-kit';
import { apiJson } from './api-fetch';

type SplitBody = { byMarketer: ProductSplit; total: Partial<Record<LineKey, SplitCell>>; coverage?: Record<string, SplitCoverage>; coverageTotal?: SplitCoverage | null };
const cache = new Map<string, Promise<SplitBody>>();
const loadSplit = (url: string) => {
  let hit = cache.get(url);
  if (!hit) {
    hit = apiJson<SplitBody>(url as `/api/${string}`);
    hit.catch(() => cache.delete(url));
    cache.set(url, hit);
  }
  return hit;
};

/** Đổi URL báo cáo MKT thành URL tách theo sản phẩm, giữ nguyên bộ lọc. */
export const splitUrl = (reportUrl: string) => reportUrl.replace('/api/reports/marketing?', '/api/reports/marketing/products?');

export type SplitField = 'phones' | 'orders' | 'confirmed' | 'revenue';
const COLS: { key: SplitField | 'quantity'; label: string }[] = [
  { key: 'phones', label: 'Số' }, { key: 'confirmed', label: 'Đơn chốt' }, { key: 'quantity', label: 'SL' }, { key: 'revenue', label: 'Tiền hàng' },
];
const LINES: LineKey[] = [...SPLIT_LINES.map((l) => l.key), OTHER_LINE.key];

export function ProductSplitHover({ url, marketerId, field, children }: { url: string; marketerId: string | null; field: SplitField; children: ReactNode }) {
  const [state, setState] = useState<{ data?: Partial<Record<LineKey, SplitCell>>; cover?: SplitCoverage | null; error?: boolean }>({});
  const open = (next: boolean) => {
    if (!next || state.data) return;
    loadSplit(url).then((b) => setState({ data: marketerId === null ? b.total : b.byMarketer[marketerId] ?? {}, cover: marketerId === null ? b.coverageTotal ?? null : b.coverage?.[marketerId] ?? null }), () => setState({ error: true }));
  };
  const rows = state.data ? LINES.filter((k) => state.data?.[k]) : [];
  const cover = state.cover;
  // Dòng cộng (Đầu não kiểm 19/11): có sản phẩm (mỗi đơn 1 lần) + chưa có sản phẩm = đúng số trong ô.
  const sumRow = (label: string, c: SplitCell, cls: string, money: boolean) => <tr key={label} className={`border-t border-line ${cls}`}><td className="py-1 pr-2">{label}</td>{COLS.map((col) => <td key={col.key} className={`py-1 pl-2 text-right ${col.key === field ? 'font-semibold' : ''}`}>{!money && (col.key === 'revenue' || col.key === 'quantity') ? '–' : col.key === 'revenue' ? shortMoney(c.revenue) : vi.format(c[col.key])}</td>)}</tr>;
  return (
    <Popover onOpenChange={open}>
      <PopoverTrigger openOnHover delay={250} render={<button type="button" className="tap cursor-help underline decoration-dotted decoration-ink-3/60 underline-offset-4" aria-label="Xem tách theo sản phẩm" />}>
        {children}
      </PopoverTrigger>
      <PopoverContent side="bottom" align="end" className="w-[27rem] max-w-[92vw] p-2.5 text-xs">
        <p className="font-semibold">Tách theo sản phẩm</p>
        {state.error ? <p className="text-bad">Chưa tải được, rê lại sau.</p> : !state.data ? <p className="text-ink-3">Đang tính…</p> : rows.length || cover?.open.phones ? (
          <table className="w-full tabular-nums">
            <thead><tr className="text-ink-3"><Th className="py-1 text-left font-normal">Sản phẩm</Th>{COLS.map((c) => <Th key={c.key} className={`py-1 text-right font-normal ${c.key === field ? 'text-ink font-semibold' : ''}`}>{c.label}</Th>)}</tr></thead>
            <tbody>{rows.map((k) => {
              const c = state.data![k]!;
              return <tr key={k} className="border-t border-line"><td className="py-1 pr-2">{k === OTHER_LINE.key ? <>Khác<span className="block text-[10px] text-ink-3">đơn có thêm món ngoài dòng chính</span></> : LINE_LABEL[k]}</td>{COLS.map((col) => <td key={col.key} className={`py-1 pl-2 text-right ${col.key === field ? 'font-semibold' : ''}`}>{col.key === 'revenue' ? shortMoney(c.revenue) : vi.format(c[col.key])}</td>)}</tr>;
            })}
            {cover && <>
              {sumRow('Số đã chốt', cover.closed, 'border-ink-3/40 font-medium', true)}
              {sumRow('Số chưa chốt (vẫn là số new)', cover.open, 'text-warn', false)}
              {sumRow('Cộng = SĐT trong ô', { orders: cover.closed.orders + cover.open.orders, phones: cover.closed.phones + cover.open.phones, confirmed: cover.closed.confirmed, revenue: cover.closed.revenue, quantity: cover.closed.quantity }, 'font-semibold', true)}
            </>}</tbody>
          </table>
        ) : <p className="text-ink-3">Không có dòng sản phẩm nào.</p>}
        <p className="text-[11px] leading-snug text-ink-3">Số = SĐT trên đơn tạo trong kỳ đã chia cho Sale. Số đã chốt (có ít nhất 1 đơn đã chốt) + Số chưa chốt (vẫn là số new) = SĐT trong ô. Đơn chốt = đơn đã chốt trên các số đó, đã chốt là chốt (kể cả sau đó huỷ / hoàn), như cột Đơn New. Một đơn có nhiều món nằm ở nhiều dòng sản phẩm (Gentadox kèm Bổ đậm đặc ở cả dòng Gentadox lẫn dòng Khác), nên không cộng các dòng sản phẩm. Oxy chỉ gồm Oxytetra; Doxytylo, Flo - Doxy ở dòng Doxy. SL và tiền hàng chỉ tính đơn đã chốt chưa huỷ, không tính quà tặng.</p>
      </PopoverContent>
    </Popover>
  );
}
