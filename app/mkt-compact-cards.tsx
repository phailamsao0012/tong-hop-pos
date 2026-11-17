'use client';

// Hai khối cuối trang Marketing, thu gọn theo anh Vũ 12/11/2026 ("cứ thu gọn hết lại vào dòng tiêu đề của cái đấy, nào xổ ra thì có"):
// - mặc định đóng, chỉ còn dòng tiêu đề + tóm tắt; bấm mới xổ;
// - khi mở: 10 dòng đầu + "Xem thêm"; sản phẩm trùng tên gộp 1 dòng, bỏ cột SĐT; đơn gần nhất mỗi đơn 1 dòng, ghi chú bấm mới xổ.
import { Fragment, useMemo, useState } from 'react';
import { Boxes, Phone } from 'lucide-react';
import { ChartCard, EmptyState, TableWrap, Th, money, shortMoney, vi } from './ui-kit';
import { posShortName } from '@/lib/shared/pos-short';

export type McProduct = { productKey: string; productName: string; orders: number; phones: number; quantity: number; lineTotal: number };
export type McOrder = { id: string; orderId: string; posId?: string; posName: string; phone: string | null; createdAt: string; confirmedAt: string | null; status: string; marketer: string | null; seller: string | null; care: string | null; net: number; source: string | null; note: string | null };

const STEP = 10;
const MoreButton = ({ shown, total, onMore }: { shown: number; total: number; onMore: () => void }) => shown < total
  ? <button type="button" onClick={onMore} className="mt-2 text-[12.5px] font-semibold text-primary underline decoration-dotted underline-offset-2 tap">Xem thêm {Math.min(STEP, total - shown)} · còn {vi.format(total - shown)}</button>
  : null;

/** Gộp sản phẩm cùng tên (khác mã / khác POS) thành 1 dòng; giữ danh sách phần gộp để rê chuột xem. */
export function mergeProducts(rows: McProduct[]) {
  const by = new Map<string, McProduct & { parts: McProduct[] }>();
  for (const r of rows) {
    const k = r.productName.trim().toLocaleLowerCase('vi');
    const g = by.get(k);
    if (g) { g.orders += r.orders; g.phones += r.phones; g.quantity += r.quantity; g.lineTotal += r.lineTotal; g.parts.push(r); }
    else by.set(k, { ...r, parts: [r] });
  }
  return [...by.values()].sort((a, b) => b.lineTotal - a.lineTotal || b.quantity - a.quantity);
}

export function MktProductsCard({ rows, totalOrders, totalNet }: { rows: McProduct[]; totalOrders: number; totalNet: number }) {
  const merged = useMemo(() => mergeProducts(rows), [rows]);
  const [limit, setLimit] = useState(STEP);
  const totals = merged.reduce((a, r) => ({ quantity: a.quantity + r.quantity, lineTotal: a.lineTotal + r.lineTotal }), { quantity: 0, lineTotal: 0 });
  return (
    <ChartCard icon={Boxes} title="Sản phẩm do Marketing mang về" info="Từng dòng sản phẩm bán trên đơn Pancake; loại dòng đánh dấu quà tặng hoặc tên Quà Tặng. Sản phẩm trùng tên (khác mã hoặc khác POS) gộp một dòng, rê chuột để xem tách."
      collapse={{ storageKey: 'mkt-collapse-products', summary: `${vi.format(merged.length)} SP · ${shortMoney(totals.lineTotal)}` }}>
      {merged.length ? <>
        <TableWrap><table className="tbl compact"><thead><tr><Th>#</Th><Th>Sản phẩm</Th><Th className="n" hint="Số đơn có sản phẩm này.">Đơn</Th><Th className="n">SL bán</Th><Th className="n" hint="Thành tiền các dòng sản phẩm.">Tiền</Th></tr></thead>
          <tbody>{merged.slice(0, limit).map((r, i) => (
            <tr key={r.productKey}>
              <td className="num text-ink-3">{i + 1}</td>
              <td className="font-medium" title={r.parts.length > 1 ? r.parts.map((p) => `${p.productName}: ${vi.format(p.orders)} đơn · ${money(p.lineTotal)}`).join('\n') : undefined}>{r.productName}{r.parts.length > 1 && <span className="ml-1.5 text-[11px] font-normal text-ink-3">gộp {r.parts.length}</span>}</td>
              <td className="n" title={`${vi.format(r.phones)} SĐT`}>{vi.format(r.orders)}</td>
              <td className="n">{vi.format(r.quantity)}</td>
              <td className="n">{money(r.lineTotal)}</td>
            </tr>
          ))}</tbody>
          <tfoot>
            <tr><td><span className="sr-only">Tổng dòng sản phẩm</span></td><td>Tổng dòng sản phẩm</td><td className="n">—</td><td className="n">{vi.format(totals.quantity)}</td><td className="n">{money(totals.lineTotal)}</td></tr>
            <tr><td><span className="sr-only">Tổng đơn duy nhất</span></td><td>Tổng đơn duy nhất</td><td className="n">{vi.format(totalOrders)}</td><td className="n">—</td><td className="n">{money(totalNet)}</td></tr>
          </tfoot>
        </table></TableWrap>
        <MoreButton shown={limit} total={merged.length} onMore={() => setLimit((n) => n + STEP)} />
      </> : <EmptyState text="Không có sản phẩm bán phù hợp bộ lọc." />}
    </ChartCard>
  );
}

/** "09/11 08:40" theo giờ VN (ghép tay để thứ tự cố định, không phụ thuộc trình duyệt). */
const vnParts = (iso: string) => {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Ho_Chi_Minh', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(iso)).map((x) => [x.type, x.value]));
  return { date: `${p.day}/${p.month}`, time: `${p.hour}:${p.minute}` };
};
const hhmm = (iso: string | null) => { if (!iso) return ''; const v = vnParts(iso); return `${v.date} ${v.time}`; };
const validSource = (s: string | null) => !!s && s.trim() !== '' && s.trim() !== '-1';

export function MktRecentCard({ rows, basis }: { rows: McOrder[]; basis: 'created' | 'confirmed' }) {
  const [limit, setLimit] = useState(STEP);
  const [open, setOpen] = useState<string | null>(null);
  const timeOf = (r: McOrder) => (basis === 'confirmed' ? r.confirmedAt : r.createdAt) ?? r.createdAt;
  const showSource = rows.some((r) => validSource(r.source));
  const cols = showSource ? 8 : 7;
  const latest = rows[0] ? hhmm(timeOf(rows[0])) : null;
  return (
    <ChartCard icon={Phone} title="Đơn gần nhất" info="Đơn mới nhất khớp mọi bộ lọc (tối đa 60). Ghi chú khách chi tiết xem tại Cuộc gọi CSKH. Bấm một dòng để xem đủ ghi chú đơn."
      collapse={{ storageKey: 'mkt-collapse-recent', summary: `${vi.format(rows.length)} đơn${latest ? ` · mới nhất ${latest}` : ''}` }}>
      {rows.length ? <>
        <TableWrap><table className="tbl compact"><thead><tr>
          <Th>Mã đơn</Th><Th>POS</Th><Th>SĐT</Th><Th hint="Marketer; dòng nhỏ: Sale / CSKH.">Người</Th><Th>Trạng thái</Th>{showSource && <Th>Nguồn</Th>}<Th>Ghi chú</Th><Th className="n">DT</Th>
        </tr></thead><tbody>{rows.slice(0, limit).map((r) => (
          <Fragment key={r.id}>
            <tr className="cursor-pointer" onClick={() => setOpen(open === r.id ? null : r.id)} aria-expanded={open === r.id}>
              <td className="whitespace-nowrap font-medium">{r.orderId}<span className="block text-[11px] font-normal text-ink-3">{hhmm(timeOf(r))}</span></td>
              <td className="whitespace-nowrap">{posShortName(r.posId ?? '', r.posName.replace(/\s*-\s*Megatech$/i, ''))}</td>
              <td className="num whitespace-nowrap">{r.phone ?? '—'}</td>
              <td className="whitespace-nowrap">{r.marketer ?? '—'}{(r.seller || r.care) && <span className="block text-[11px] text-ink-3">{[r.seller, r.care].filter(Boolean).join(' / ')}</span>}</td>
              <td className="whitespace-nowrap">{r.status}</td>
              {showSource && <td className="whitespace-nowrap">{validSource(r.source) ? r.source : '—'}</td>}
              <td className="max-w-[22rem] truncate text-xs text-ink-2" title={r.note ?? undefined}>{r.note ?? <span className="text-ink-3">Chưa có ghi chú</span>}</td>
              <td className="n">{money(r.net)}</td>
            </tr>
            {open === r.id && r.note && <tr><td colSpan={cols} className="whitespace-pre-wrap bg-surface-2 text-xs text-ink-2">{r.note}</td></tr>}
          </Fragment>
        ))}</tbody></table></TableWrap>
        <MoreButton shown={limit} total={rows.length} onMore={() => setLimit((n) => n + STEP)} />
      </> : <EmptyState text="Không có đơn trong phạm vi bộ lọc." />}
    </ChartCard>
  );
}
