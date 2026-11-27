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

/** Đầu trang kiểu mới: tên trang + một dòng phạm vi (kỳ, POS, cách tính), chọn kỳ, nút phụ, hàng POS; màn hẹp tự xuống hàng.
 *  `tools` / `pos` là chính PeriodToolbar / PosChips của trang (không dựng bản mới).
 *  Hàng POS (sửa 27/11/2026, máy đám mây thấy ở 1600 / 1920 hàng POS chung dòng bị cắt, chỉ thấy 2/6 POS): ô bọc không co (rộng đúng
 *  bằng cả hàng chip), nên chỉ đứng chung dòng khi đủ chỗ (màn ~2560), thiếu chỗ thì tự xuống dòng riêng; không cắt, không cuộn ngang trang.
 *  Màn hẹp hơn cả hàng chip (điện thoại) thì chip tự xuống hàng trong ô (bỏ cuộn ngang của .posrow kiểu mới).
 *  Khối tên + phạm vi tối thiểu 28rem: thiếu chỗ thì nằm riêng một dòng để dòng phạm vi giãn hết bề ngang. */
export function PageHeadMoi({ title, hint, scope, tools, pos, right }: { title: string; hint?: string; scope: string; tools?: ReactNode; pos?: ReactNode; right?: ReactNode }) {
  return (
    <header className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-2">
      <div className="min-w-0 flex-[1_1_28rem]">
        <h1 className="ph-title display text-lg font-semibold leading-tight tracking-[-.02em] text-ink sm:text-xl" title={hint}>{title}</h1>
        <p className="mt-0.5 line-clamp-2 text-[12px] text-ink-3" title={scope}>{scope}</p>
      </div>
      {tools && <div className="min-w-0 max-w-full flex-[0_1_auto]">{tools}</div>}
      {right && <div className="flex min-w-0 flex-wrap items-center gap-2">{right}</div>}
      {pos && <div className="max-w-full flex-[1_0_auto] empty:hidden [&_.posrow]:!flex-wrap [&_.posrow]:!overflow-visible">{pos}</div>}
    </header>
  );
}

/** Đường nhỏ kỳ này (đậm) / kỳ trước (xám nét đứt) cho ô số, cao 28px; điểm vượt mốc chấm đỏ. Dùng số theo ngày trang đã tải. */
export function DuoSpark({ cur, prev, bad }: { cur: (number | null)[]; prev?: (number | null)[]; bad?: (v: number | null) => boolean }) {
  if (cur.length < 2) return null;
  const all = [...cur, ...(prev ?? [])].filter((v): v is number => v != null && Number.isFinite(v));
  const max = Math.max(1e-9, ...all), min = Math.min(0, ...all);
  const n = Math.max(cur.length, prev?.length ?? 0);
  const x = (i: number) => n === 1 ? 50 : 2 + i * 96 / (n - 1), y = (v: number) => 26 - (v - min) / (max - min || 1) * 23;
  const path = (vs: (number | null)[]) => vs.map((v, i) => v == null ? '' : `${i && vs[i - 1] != null ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  return (
    <span className="relative block h-7 w-full" title="Đường đậm: kỳ này · nét xám: kỳ trước cùng thứ tự ngày">
      <svg viewBox="0 0 100 28" preserveAspectRatio="none" className="absolute inset-0 h-full w-full" aria-label="Đường đậm: kỳ này; nét xám: kỳ trước">
        {prev && <path d={path(prev)} fill="none" stroke="var(--ink-4)" strokeWidth="1.2" strokeDasharray="3 3" vectorEffect="non-scaling-stroke" />}
        <path d={path(cur)} fill="none" stroke="var(--primary)" strokeWidth="2" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
      </svg>
      {bad && cur.map((v, i) => v != null && bad(v) ? <i key={i} className="absolute size-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-bad" style={{ left: `${x(i)}%`, top: `${y(v) / 28 * 100}%` }} /> : null)}
    </span>
  );
}

/** Lớp cho KpiCard trong hàng ô số kiểu mới: bỏ chiều cao tối thiểu 56px của chỗ biểu đồ và cắt ghi chú còn tối đa 2 dòng, để mọi ô thấp gọn (~150–170px) và bằng nhau. */
export const KPI_TIGHT = '[&>span.mt-1]:!min-h-0 [&_.note]:line-clamp-2';

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

/** Một việc cần xem. `team`: số cả đội / cả trang (luôn đứng trước); `gap`: vượt mốc bao nhiêu (điểm %), lớn hơn là nặng hơn. */
export type CanXemItem = { key: string; text: string; onClick?: () => void; team?: boolean; gap?: number };

/** Dải "Cần xem": không có số nào vượt mốc thì không hiện gì.
 *  Gọn một dòng (sửa 27/11/2026, Sale từng hiện 14 nhãn): tối đa 4 nhãn, số cả đội trước rồi tới mục vượt mốc nặng nhất;
 *  còn lại gom vào chip "+N mục khác", bấm mở khung giữa màn liệt kê đủ (bấm một mục mở "Vì sao ra số này" của mục đó). Nhãn dài thì cắt "…". */
export function CanXemStrip({ items, note, max = 4 }: { items: CanXemItem[]; note?: string; max?: number }) {
  const [all, setAll] = useState(false);
  if (!items.length) return null;
  const sorted = [...items].sort((a, b) => Number(!!b.team) - Number(!!a.team) || (a.team && b.team ? 0 : (b.gap ?? 0) - (a.gap ?? 0)));
  const shown = sorted.length > max ? sorted.slice(0, max - 1) : sorted;
  const rest = sorted.length - shown.length;
  // Không cắt chữ (sửa 27/11/2026, máy đám mây thấy ở 390px nhãn còn một chữ cái): chip không co lại; từ sm hàng chip cuộn ngang
  // trong dải nếu thiếu chỗ (nhãn rất dài mới cắt "…" ở 22rem). Dưới sm chỉ hiện 1 nhãn đầy đủ (được xuống dòng) + "+N mục khác".
  const chip = 'tap inline-flex shrink-0 items-center rounded-full px-3 py-1 text-left text-[12.5px] font-semibold';
  const restSm = sorted.length - 1;
  return (
    <section aria-label="Cần xem" className="card flex min-w-0 items-center gap-2 px-4 py-3 max-sm:flex-wrap sm:flex-nowrap sm:overflow-x-auto sm:[scrollbar-width:thin]">
      <span className="inline-flex shrink-0 items-center gap-1.5 text-[13px] font-semibold text-ink" title={note}><AlertTriangle size={15} className="text-bad" aria-hidden="true" />Cần xem</span>
      {shown.map((i, n) => (
        <button key={i.key} type="button" onClick={i.onClick} title={i.text} className={`${chip} bg-bad-bg text-bad ${n ? 'max-sm:hidden' : 'max-sm:max-w-full max-sm:shrink'} sm:max-w-[22rem]`}>
          <span className="min-w-0 max-sm:whitespace-normal sm:truncate">{i.text}</span>
        </button>
      ))}
      {restSm > 0 && (
        <button type="button" onClick={() => setAll(true)} className={`${chip} border border-line bg-surface text-ink-2 sm:hidden`}>+{restSm} mục khác</button>
      )}
      {rest > 0 && (
        <button type="button" onClick={() => setAll(true)} className={`${chip} border border-line bg-surface text-ink-2 max-sm:hidden`}>+{rest} mục khác</button>
      )}
      {note && <span className="ml-auto hidden min-w-0 shrink truncate text-[11.5px] text-ink-3 2xl:inline" title={note}>{note}</span>}
      <WhySheet onClose={() => setAll(false)} spec={all ? {
        title: 'Cần xem', value: `${sorted.length} mục vượt mốc`, scope: note ?? 'Số vượt mốc trong phạm vi đang chọn',
        more: (
          <ul className="flex min-w-0 flex-col gap-1.5">
            {sorted.map((i) => (
              <li key={i.key}><button type="button" className={`${chip} max-w-full bg-bad-bg text-bad`} onClick={() => { setAll(false); i.onClick?.(); }}><span className="min-w-0 truncate">{i.text}</span></button></li>
            ))}
          </ul>
        ),
      } : null} />
    </section>
  );
}
