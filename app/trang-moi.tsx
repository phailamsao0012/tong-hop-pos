'use client';
// Bộ khung trang trong kiểu mới (cờ THP_UI_MOI, plan "giao diện mới cả trang trong" anh duyệt 27/11/2026). Chỉ trang đang bật cờ mới dùng;
// cờ tắt thì không trang nào gọi tới file này nên web thật y như cũ.
// - CanXemStrip: dải "Cần xem", chỉ hiện khi có số vượt mốc (chốt Sale dưới 40%, hoàn từ 7%, hủy từ 5%; mốc lấy ở lib/zalo/boss-report.ts).
// - WhySheet: bấm một ô số / một việc cần xem mở khung GIỮA màn hình (Sheet đã căn giữa) "Vì sao ra số này": số gì, phạm vi, số thành phần,
//   kỳ trước, cách tính. Khung nằm trên chính trang nên bộ lọc kỳ / POS / trạng thái giữ nguyên.
import { useState, type ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';

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
