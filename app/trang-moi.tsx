'use client';
// Bộ khung trang trong kiểu mới (cờ THP_UI_MOI, plan "giao diện mới cả trang trong" anh duyệt 27/11/2026). Chỉ trang đang bật cờ mới dùng;
// cờ tắt thì không trang nào gọi tới file này nên web thật y như cũ.
// - CanXemStrip: dải "Cần xem", chỉ hiện khi có số vượt mốc (chốt Sale dưới 40%, hoàn từ 7%, hủy từ 5%; mốc lấy ở lib/zalo/boss-report.ts).
// - WhySheet: bấm một ô số / một việc cần xem mở khung GIỮA màn hình (Sheet đã căn giữa) "Vì sao ra số này": số gì, phạm vi, số thành phần,
//   kỳ trước, cách tính. Khung nằm trên chính trang nên bộ lọc kỳ / POS / trạng thái giữ nguyên.
import { useState, type ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { BOSS_CANCEL_RED, BOSS_CLOSE_RED, BOSS_RETURN_RED } from '@/lib/zalo/boss-report';

/** Đầu trang kiểu mới: tên trang + một dòng phạm vi (kỳ, POS, cách tính), chọn kỳ, hàng POS và nút phụ chung một hàng; màn hẹp tự xuống hàng.
 *  `tools` / `pos` là chính PeriodToolbar / PosChips của trang (không dựng bản mới). */
export function PageHeadMoi({ title, hint, scope, tools, pos, right }: { title: string; hint?: string; scope: string; tools?: ReactNode; pos?: ReactNode; right?: ReactNode }) {
  return (
    <header className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-2">
      <div className="min-w-0 flex-[1_1_16rem]">
        <h1 className="ph-title display text-lg font-semibold leading-tight tracking-[-.02em] text-ink sm:text-xl" title={hint}>{title}</h1>
        <p className="mt-0.5 line-clamp-2 text-[12px] text-ink-3" title={scope}>{scope}</p>
      </div>
      {tools && <div className="min-w-0 max-w-full flex-[0_1_auto]">{tools}</div>}
      {pos && <div className="min-w-0 flex-[1_1_14rem] empty:hidden">{pos}</div>}
      {right && <div className="flex min-w-0 flex-wrap items-center gap-2">{right}</div>}
    </header>
  );
}

/** Lưới một hàng ô số không để ô trống: số cột chia hết số ô ở mọi bề rộng (điện thoại 2 cột; ô lẻ cuối giãn hai cột). */
const TILE_GRID: Record<number, string> = {
  1: 'grid-cols-1',
  2: 'grid-cols-2',
  3: 'grid-cols-1 sm:grid-cols-3',
  4: 'grid-cols-2 xl:grid-cols-4',
  5: 'grid-cols-2 lg:grid-cols-5 max-lg:[&>:last-child]:col-span-2',
  6: 'grid-cols-2 sm:grid-cols-3 xl:grid-cols-6',
  7: 'grid-cols-2 lg:grid-cols-7 max-lg:[&>:last-child]:col-span-2',
  8: 'grid-cols-2 sm:grid-cols-4 2xl:grid-cols-8',
};
export const tileGrid = (n: number) => `grid min-w-0 gap-3 ${TILE_GRID[n] ?? 'grid-cols-[repeat(auto-fit,minmax(min(100%,13rem),1fr))]'}`;

/** Vượt mốc tô đỏ (mốc chung ở lib/zalo/boss-report.ts, như ảnh Zalo sếp): chốt Sale dưới 40%, hoàn từ 7%, hủy từ 5%. */
export const overClose = (r: number | null | undefined) => r != null && r < BOSS_CLOSE_RED;
export const overRet = (r: number | null | undefined) => r != null && r >= BOSS_RETURN_RED;
export const overCancel = (r: number | null | undefined) => r != null && r >= BOSS_CANCEL_RED;
/** Lớp tô đỏ số trong KpiCard khi vượt mốc. */
export const KPI_RED = '[&_.val]:!text-bad';

export type WhyRow = { label: string; value: string; tone?: 'bad' | 'good'; strong?: boolean };
export type WhySpec = {
  /** Tên số, ví dụ "Tỷ lệ chốt Sale". */ title: string;
  /** Số đang hiện trên ô. */ value: string; tone?: 'bad';
  /** Phạm vi: kỳ, POS, cách tính. */ scope: string;
  /** Các số thành phần ra con số này. */ rows?: WhyRow[];
  /** Số kỳ trước (cùng cách tính). */ previous?: string;
  /** Mốc tô đỏ, ví dụ "Đỏ khi dưới 40%". */ mark?: string;
  definition?: string;
  /** Phần thêm: liên kết mở trang chi tiết, danh sách đơn… */ more?: ReactNode;
};

export function WhySheet({ spec, onClose }: { spec: WhySpec | null; onClose: () => void }) {
  // Giữ nội dung lần mở gần nhất trong lúc khung chạy hiệu ứng đóng.
  const [last, setLast] = useState<WhySpec | null>(spec);
  if (spec && spec !== last) setLast(spec);
  const s = spec ?? last;
  return (
    <Sheet open={!!spec} onOpenChange={(o) => { if (!o) onClose(); }}>
      <SheetContent className="gap-0 overflow-y-auto p-0 sm:max-w-xl">
        {s && <>
          <SheetHeader className="pr-12">
            <SheetTitle>Vì sao ra số này · {s.title}</SheetTitle>
            <SheetDescription>{s.scope}</SheetDescription>
          </SheetHeader>
          <div className="flex min-w-0 flex-col gap-3 px-4 pb-5">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <span className={`num text-3xl font-bold tracking-[-.01em] ${s.tone === 'bad' ? 'text-bad' : 'text-ink'}`}>{s.value}</span>
              {s.previous !== undefined && <span className="text-[12.5px] text-ink-3">Kỳ trước: <b className="num font-semibold text-ink-2">{s.previous}</b></span>}
            </div>
            {s.mark && <p className={`text-[12.5px] font-semibold ${s.tone === 'bad' ? 'text-bad' : 'text-ink-3'}`}>{s.mark}</p>}
            {!!s.rows?.length && (
              <table data-ui="mini-tbl" className="w-full text-[13px] tabular-nums">
                <tbody>
                  {s.rows.map((r, i) => (
                    <tr key={i} className={`border-t border-line ${r.strong ? 'font-semibold' : ''}`}>
                      <td className="py-1.5 pr-3 text-ink-2">{r.label}</td>
                      <td className={`num py-1.5 text-right ${r.tone === 'bad' ? 'text-bad' : r.tone === 'good' ? 'text-good' : 'text-ink'}`}>{r.value}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {s.definition && <p className="text-[12.5px] leading-relaxed text-ink-2"><b className="font-semibold text-ink">Cách tính:</b> {s.definition}</p>}
            {s.more}
          </div>
        </>}
      </SheetContent>
    </Sheet>
  );
}

export type CanXemItem = { key: string; text: string; onClick?: () => void };

/** Dải "Cần xem": không có số nào vượt mốc thì không hiện gì. */
export function CanXemStrip({ items, note }: { items: CanXemItem[]; note?: string }) {
  if (!items.length) return null;
  return (
    <section aria-label="Cần xem" className="card flex min-w-0 flex-wrap items-center gap-2 px-4 py-3">
      <span className="inline-flex shrink-0 items-center gap-1.5 text-[13px] font-semibold text-ink"><AlertTriangle size={15} className="text-bad" aria-hidden="true" />Cần xem</span>
      {items.map((i) => (
        <button key={i.key} type="button" onClick={i.onClick} className="tap inline-flex max-w-full items-center rounded-full bg-bad-bg px-3 py-1 text-left text-[12.5px] font-semibold text-bad">
          <span className="min-w-0 truncate">{i.text}</span>
        </button>
      ))}
      {note && <span className="text-[11.5px] text-ink-3">{note}</span>}
    </section>
  );
}
