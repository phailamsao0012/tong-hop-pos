'use client';
// Rê chuột (điện thoại: chạm) vào ô Đơn tạo / SĐT / Đơn XN / Doanh thu ở bảng xếp hạng MKT thì hiện số tách theo sản phẩm
// (anh Vũ 07/11/2026). Chỉ gọi API ở lần rê đầu tiên của mỗi bộ lọc, để mở trang không tốn thêm lượt đọc.
import { useState, type ReactNode } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { LINE_LABEL, OTHER_LINE, PRODUCT_LINES, type LineKey, type ProductSplit, type SplitCell, type SplitCoverage } from '@/lib/reports/mkt-product-split';
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
  { key: 'phones', label: 'Số' }, { key: 'orders', label: 'Đơn tạo' }, { key: 'confirmed', label: 'Đơn XN' }, { key: 'quantity', label: 'SL' }, { key: 'revenue', label: 'Tiền hàng' },
];
const LINES: LineKey[] = [...PRODUCT_LINES.map((l) => l.key), OTHER_LINE.key];

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
      <PopoverContent side="bottom" align="end" className="w-[30rem] max-w-[92vw] p-2.5 text-xs">
        <p className="font-semibold">Tách theo sản phẩm</p>
        {state.error ? <p className="text-bad">Chưa tải được, rê lại sau.</p> : !state.data ? <p className="text-ink-3">Đang tính…</p> : rows.length || cover?.noProduct.orders ? (
          <table className="w-full tabular-nums">
            <thead><tr className="text-ink-3"><Th className="py-1 text-left font-normal">Sản phẩm</Th>{COLS.map((c) => <Th key={c.key} className={`py-1 text-right font-normal ${c.key === field ? 'text-ink font-semibold' : ''}`}>{c.label}</Th>)}</tr></thead>
            <tbody>{rows.map((k) => {
              const c = state.data![k]!;
              return <tr key={k} className="border-t border-line"><td className="py-1 pr-2">{LINE_LABEL[k]}</td>{COLS.map((col) => <td key={col.key} className={`py-1 pl-2 text-right ${col.key === field ? 'font-semibold' : ''}`}>{col.key === 'revenue' ? shortMoney(c.revenue) : vi.format(c[col.key])}</td>)}</tr>;
            })}
            {cover && <>
              {sumRow('Có sản phẩm (mỗi đơn 1 lần)', cover.withProduct, 'border-ink-3/40 font-medium', true)}
              {sumRow('Chưa có sản phẩm', cover.noProduct, 'text-warn', false)}
              {sumRow('Cộng = số trong ô', { orders: cover.withProduct.orders + cover.noProduct.orders, phones: cover.withProduct.phones + cover.noProduct.phones, confirmed: cover.withProduct.confirmed + cover.noProduct.confirmed, revenue: cover.withProduct.revenue, quantity: cover.withProduct.quantity }, 'font-semibold', true)}
            </>}</tbody>
          </table>
        ) : <p className="text-ink-3">Không có dòng sản phẩm nào.</p>}
        <p className="text-[11px] leading-snug text-ink-3">Số = SĐT trên đơn tạo trong kỳ, đã chia cho Sale. Một đơn nhiều sản phẩm nằm ở nhiều dòng sản phẩm (đơn có Gentadox kèm Bổ đậm đặc vừa ở dòng Gentadox vừa ở dòng Khác), nên chỉ cộng 2 dòng dưới: Có sản phẩm (mỗi đơn 1 lần) + Chưa có sản phẩm (Sale chưa nhập hàng trên Pancake) = số trong ô. Đơn XN = đơn tạo trong kỳ đã xác nhận, khác cột Đơn New / CSKH (đếm theo ngày chốt, kể cả đơn tạo hôm trước; đơn CSKH không vào đây). SL và tiền hàng chỉ tính đơn đã xác nhận, không tính quà tặng.</p>
      </PopoverContent>
    </Popover>
  );
}
