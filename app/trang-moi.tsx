'use client';
// Bộ khung trang trong kiểu mới (cờ THP_UI_MOI, plan "giao diện mới cả trang trong" anh duyệt 27/11/2026). Chỉ trang đang bật cờ mới dùng;
// cờ tắt thì không trang nào gọi tới file này nên web thật y như cũ.
// Theo bộ thiết kế anh duyệt 28/11/2026 (bo-thiet-ke.html): thứ tự trang = đầu trang → tab → việc cần xử lý → hàng ô số → biểu đồ → bảng.
// - CanXemStrip: hàng thẻ "Việc cần xử lý", chỉ hiện khi có số vượt mốc (chốt Sale dưới 40%, hoàn từ 7%, hủy từ 5%; mốc lấy ở lib/zalo/boss-report.ts).
// - WhySheet: bấm một ô số / một việc cần xem mở khung GIỮA màn hình (Sheet đã căn giữa) "Vì sao ra số này": số gì, phạm vi, số thành phần,
//   kỳ trước, cách tính. Khung nằm trên chính trang nên bộ lọc kỳ / POS / trạng thái giữ nguyên.
import { useState, type ReactNode } from 'react';
import { AlertTriangle, Info, type LucideIcon } from 'lucide-react';
import { ICON } from './icons';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { BOSS_CANCEL_RED, BOSS_CLOSE_RED, BOSS_RETURN_RED } from '@/lib/zalo/boss-report';

/** Đầu trang kiểu mới: tên trang (21px) + phạm vi chữ phụ ngay sau tên (kỳ, POS, cách tính), chọn kỳ, nút phụ, hàng POS; màn hẹp tự xuống hàng.
 *  `tools` / `pos` là chính PeriodToolbar / PosChips của trang (không dựng bản mới). Ô bọc mang lớp phm-tools / phm-pos để globals.css
 *  (khối "Bộ thiết kế") vẽ thanh chọn kỳ phẳng trên nền trang và hàng POS thành hàng nút nền xám nhạt, mục đang chọn nổi trắng.
 *  Hàng POS (sửa 27/11/2026, máy đám mây thấy ở 1600 / 1920 hàng POS chung dòng bị cắt, chỉ thấy 2/6 POS): ô bọc không co (rộng đúng
 *  bằng cả hàng nút), nên chỉ đứng chung dòng khi đủ chỗ, thiếu chỗ thì tự xuống dòng riêng; không cắt, không cuộn ngang trang.
 *  Màn hẹp hơn cả hàng (điện thoại) thì nút tự xuống hàng trong ô.
 *  Khối tên + phạm vi tối thiểu 28rem: thiếu chỗ thì nằm riêng một dòng để dòng phạm vi giãn hết bề ngang. */
export function PageHeadMoi({ title, hint, scope, tools, pos, right }: { title: string; hint?: string; scope: string; tools?: ReactNode; pos?: ReactNode; right?: ReactNode }) {
  return (
    <header className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-2">
      <div className="flex min-w-0 flex-[1_1_28rem] flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <h1 className="ph-title text-[21px] font-bold leading-tight tracking-[-.01em] text-ink" title={hint}>{title}</h1>
        <p className="line-clamp-2 min-w-0 text-[12.5px] text-ink-3" title={scope}>{scope}</p>
      </div>
      {tools && <div className="phm-tools min-w-0 max-w-full flex-[0_1_auto]">{tools}</div>}
      {right && <div className="flex min-w-0 flex-wrap items-center gap-2">{right}</div>}
      {pos && <div className="phm-pos max-w-full flex-[1_0_auto] empty:hidden [&_.posrow]:!flex-wrap [&_.posrow]:!overflow-visible">{pos}</div>}
    </header>
  );
}

/** Đường nhỏ 74×26 của ô số: kỳ này nét đen (--chart-cur), kỳ trước nét xám #cfd6d2 (--chart-prev, tuỳ có); điểm vượt mốc chấm đỏ.
 *  Ô vượt mốc / sắp chạm mốc (KPI_RED / KPI_WARN) thì nét kỳ này đổi đỏ / vàng ở globals.css. Dùng số theo ngày trang đã tải. */
export function DuoSpark({ cur, prev, bad }: { cur: (number | null)[]; prev?: (number | null)[]; bad?: (v: number | null) => boolean }) {
  if (cur.length < 2) return null;
  const all = [...cur, ...(prev ?? [])].filter((v): v is number => v != null && Number.isFinite(v));
  const max = Math.max(1e-9, ...all), min = Math.min(0, ...all);
  const n = Math.max(cur.length, prev?.length ?? 0);
  const x = (i: number) => n === 1 ? 50 : 2 + i * 96 / (n - 1), y = (v: number) => 26 - (v - min) / (max - min || 1) * 23;
  const path = (vs: (number | null)[]) => vs.map((v, i) => v == null ? '' : `${i && vs[i - 1] != null ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  return (
    <span className="duo-spark relative block h-7 w-full" title="Nét đen: kỳ này · nét xám: kỳ trước cùng thứ tự ngày">
      <svg viewBox="0 0 100 28" preserveAspectRatio="none" className="absolute inset-0 h-full w-full" aria-label="Nét đen: kỳ này; nét xám: kỳ trước">
        {prev && <path d={path(prev)} fill="none" stroke="var(--chart-prev, var(--ink-4))" strokeWidth="1.4" strokeLinecap="round" vectorEffect="non-scaling-stroke" />}
        <path className="cur" d={path(cur)} fill="none" stroke="var(--chart-cur, var(--ink))" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
      </svg>
      {bad && cur.map((v, i) => v != null && bad(v) ? <i key={i} className="absolute size-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-bad" style={{ left: `${x(i)}%`, top: `${y(v) / 28 * 100}%` }} /> : null)}
    </span>
  );
}

/** Lớp cho KpiCard trong hàng ô số kiểu mới: bỏ chiều cao tối thiểu 56px của chỗ biểu đồ và cắt ghi chú còn tối đa 2 dòng, để mọi ô thấp gọn và bằng nhau.
 *  Ô có DuoSpark thì globals.css đưa đường nhỏ sang góc phải dưới (74×26), ngang chân ô như bộ thiết kế. */
export const KPI_TIGHT = '[&>span.mt-1]:!min-h-0 [&_.note]:line-clamp-2';

/** Ô số vừa lọc vừa có giải thích (anh duyệt 27/11/2026): bấm ô thì lọc như bố cục cũ (ô đang chọn sáng lên, KpiCard active),
 *  nút "i" nhỏ ở góc phải trên mở "Vì sao ra số này" mà không lọc. Nút i là nút riêng nằm cạnh ô (không lồng trong nút của ô). */
export function WhyTile({ label, onWhy, children }: { label: string; onWhy: () => void; children: ReactNode }) {
  return (
    // Ô bấm được là <button> (KpiCard), mặc định chỉ rộng theo nội dung, và .kpi có @container nên co hẳn còn dải hẹp: ép w-full h-full
    // để ô chiếm trọn ô lưới như KPI_TIGHT các trang khác. Icon góc phải của ô ẩn đi (giữ chỗ) để nút "i" nằm đúng chỗ đó (icon 18px ở 14/16px), không chồng nhau.
    <div className="relative h-full min-w-0 [&>.kpi]:block [&>.kpi]:h-full [&>.kpi]:w-full [&>.kpi_.tile]:invisible">
      {children}
      <button type="button" onClick={onWhy} aria-label={`Vì sao ra số này: ${label}`} title="Vì sao ra số này"
        className="tap absolute right-[13px] top-[11px] z-[1] grid size-6 place-items-center rounded-full text-ink-3 transition-colors hover:bg-surface-2 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <Info size={16} aria-hidden="true" />
      </button>
    </div>
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
/** Lớp tô đỏ số trong KpiCard khi vượt mốc; kpi-bad đổi viền / nền ô sang đỏ nhạt như bộ thiết kế (globals.css). */
export const KPI_RED = 'kpi-bad [&_.val]:!text-bad';
/** Lớp ô sắp chạm mốc: viền / nền vàng nhạt, đường nhỏ vàng (globals.css). Trang tự quyết khi nào là "sắp chạm", không đổi mốc đỏ. */
export const KPI_WARN = 'kpi-warn';

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
  /** Nút chính (đen) cạnh "Đóng", ví dụ "Mở danh sách đơn". Không có thì chỉ hiện "Đóng". */ action?: { label: string; onClick: () => void };
};

/** Khung giữa màn "Vì sao ra số này" theo bộ thiết kế: bo 18, tên + phạm vi chữ phụ, số to, bảng tính viền mảnh (dòng tổng nền xám nhạt),
 *  cách tính, rồi hàng nút "Đóng" (viền) + một nút chính đen nếu có. */
export function WhySheet({ spec, onClose }: { spec: WhySpec | null; onClose: () => void }) {
  // Giữ nội dung lần mở gần nhất trong lúc khung chạy hiệu ứng đóng.
  const [last, setLast] = useState<WhySpec | null>(spec);
  if (spec && spec !== last) setLast(spec);
  const s = spec ?? last;
  return (
    <Sheet open={!!spec} onOpenChange={(o) => { if (!o) onClose(); }}>
      <SheetContent className="gap-0 overflow-y-auto rounded-[18px] p-0 sm:max-w-[30rem]">
        {s && <>
          <SheetHeader className="gap-0.5 px-[22px] pb-3 pr-12 pt-[22px]">
            <SheetTitle className="text-[17px] font-bold leading-snug text-ink">Vì sao ra số này · {s.title}</SheetTitle>
            <SheetDescription className="text-[13px] text-ink-3">{s.scope}</SheetDescription>
          </SheetHeader>
          <div className="flex min-w-0 flex-col gap-3 px-[22px] pb-[22px]">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <span className={`num text-[27px] font-bold leading-tight tracking-[-.02em] ${s.tone === 'bad' ? 'text-bad' : 'text-ink'}`}>{s.value}</span>
              {s.previous !== undefined && <span className="text-[12.5px] text-ink-3">Kỳ trước: <b className="num font-semibold text-ink-2">{s.previous}</b></span>}
            </div>
            {s.mark && <p className={`text-[12.5px] font-semibold ${s.tone === 'bad' ? 'text-bad' : 'text-ink-3'}`}>{s.mark}</p>}
            {!!s.rows?.length && (
              <div data-ui="calc" className="overflow-hidden rounded-xl border border-line text-[13.5px] tabular-nums">
                {s.rows.map((r, i) => (
                  <div key={i} className={`flex items-baseline justify-between gap-3 px-3 py-[9px] ${i ? 'border-t border-line' : ''} ${r.strong ? 'bg-surface-2 font-bold' : ''}`}>
                    <span className="min-w-0 text-ink-2">{r.label}</span>
                    <span className={`num shrink-0 text-right ${r.strong ? 'font-bold' : 'font-semibold'} ${r.tone === 'bad' ? 'text-bad' : r.tone === 'good' ? 'text-good' : 'text-ink'}`}>{r.value}</span>
                  </div>
                ))}
              </div>
            )}
            {s.definition && <p className="text-[12.5px] leading-relaxed text-ink-2"><b className="font-semibold text-ink">Cách tính:</b> {s.definition}</p>}
            {s.more}
            <div className="mt-1 flex flex-wrap items-center justify-between gap-2">
              <button type="button" className="btn" onClick={onClose}>Đóng</button>
              {s.action && <button type="button" className="btn primary" onClick={s.action.onClick}>{s.action.label}</button>}
            </div>
          </div>
        </>}
      </SheetContent>
    </Sheet>
  );
}

/** Một việc cần xem. `team`: số cả đội / cả trang (luôn đứng trước); `gap`: vượt mốc bao nhiêu (điểm %), lớn hơn là nặng hơn.
 *  `why`: câu vì sao (không có thì tự ghi số điểm cách mốc + mốc của đúng số đó, xem whyOf); `action`: chữ trên nút (mặc định "Xem vì sao"); `tone: 'warn'`: sắp chạm mốc (vàng). */
export type CanXemItem = { key: string; text: string; onClick?: () => void; team?: boolean; gap?: number; why?: string; action?: string; tone?: 'warn' };

/** Loại số của một việc, đoán từ chữ sau dấu ":" mà chỗ gọi đã viết ("Đội Sale: hủy sau chốt 6,1%", "Team B: chốt 36%"…).
 *  Thứ tự hoàn → hủy → chốt ("hủy sau chốt" là hủy). Không khớp (vd "khách ít quay lại", "quá tải") thì null: dùng icon cảnh báo và ghi chú chung. */
type CanXemKind = 'chot' | 'huy' | 'hoan';
const kindOf = (text: string): CanXemKind | null => {
  const s = text.slice(text.lastIndexOf(':') + 1);
  return /hoàn/i.test(s) ? 'hoan' : /hủy/i.test(s) ? 'huy' : /chốt|xác nhận/i.test(s) ? 'chot' : null;
};
const KIND_ICON: Record<CanXemKind, LucideIcon> = { chot: ICON.rate, huy: ICON.cancelled, hoan: ICON.returned };
const KIND_MARK: Record<CanXemKind, string> = { chot: `Mốc: chốt dưới ${BOSS_CLOSE_RED}%`, huy: `Mốc: hủy từ ${BOSS_CANCEL_RED}%`, hoan: `Mốc: hoàn từ ${BOSS_RETURN_RED}%` };
/** Icon thẻ theo loại số (icon truyền qua prop, không chọn component trong lúc vẽ). */
function TodoIcon({ icon: Icon }: { icon: LucideIcon }) {
  return <Icon size={18} />;
}
/** Dòng vì sao riêng từng thẻ: `why` của chỗ gọi; không có thì số điểm cách mốc (gap chỗ gọi đã tính) + mốc của đúng số đó; loại lạ thì ghi chú chung. */
const whyOf = (i: CanXemItem, k: CanXemKind | null, note: string | undefined) => {
  if (i.why) return i.why;
  if (!k) return note;
  const far = i.gap != null && i.gap > 0 ? `${k === 'chot' ? 'Dưới' : 'Trên'} mốc ${i.gap.toFixed(1).replace('.', ',')} điểm · ` : '';
  return `${far}${KIND_MARK[k]}`;
};

/** Hàng thẻ "Việc cần xử lý" (bộ thiết kế 28/11/2026): không có số nào vượt mốc thì không hiện gì.
 *  Mỗi thẻ: ô icon đỏ nhạt (vàng nhạt nếu sắp chạm), chuyện gì (đậm), vì sao (chữ phụ), một nút nhỏ đen đi thẳng tới chỗ xem; nhãn trạng thái bên phải (màn ≥ 2xl).
 *  Tối đa 3 thẻ, số cả đội trước rồi tới mục vượt mốc nặng nhất; còn lại gom vào nút "+N mục khác", bấm mở khung giữa màn liệt kê đủ
 *  (bấm một mục mở "Vì sao ra số này" của mục đó). Điện thoại chỉ hiện thẻ đầu + "+N mục khác". */
export function CanXemStrip({ items, note, max = 3 }: { items: CanXemItem[]; note?: string; max?: number }) {
  const [all, setAll] = useState(false);
  if (!items.length) return null;
  const sorted = [...items].sort((a, b) => Number(!!b.team) - Number(!!a.team) || (a.team && b.team ? 0 : (b.gap ?? 0) - (a.gap ?? 0)));
  const shown = sorted.slice(0, max);
  const rest = sorted.length - shown.length;
  const restSm = sorted.length - 1;
  const pillOf = (i: CanXemItem) => i.tone === 'warn' ? <span className="pill warn">Sắp chạm</span> : <span className="pill bad">Vượt mốc</span>;
  return (
    <section aria-label="Việc cần xử lý" className="flex min-w-0 flex-wrap items-stretch gap-3">
      {shown.map((i, n) => {
        const k = kindOf(i.text), why = whyOf(i, k, note);
        return (
          <article key={i.key} className={`todo flex-[1_1_18rem] ${i.tone === 'warn' ? 'is-warn' : ''} ${n ? 'max-sm:hidden' : ''}`}>
            <span className="todo-ic" aria-hidden="true"><TodoIcon icon={k ? KIND_ICON[k] : AlertTriangle} /></span>
            <div className="min-w-0 flex-1">
              <b className="block text-[14px] font-semibold leading-snug text-ink" title={i.text}>{i.text}</b>
              {why && <p className="mb-2.5 mt-0.5 line-clamp-2 text-[12.5px] text-ink-3" title={why}>{why}</p>}
              {i.onClick && <button type="button" className="btn sm primary" onClick={i.onClick}>{i.action ?? 'Xem vì sao'}</button>}
            </div>
            <span className="shrink-0 max-2xl:hidden">{pillOf(i)}</span>
          </article>
        );
      })}
      {restSm > 0 && <button type="button" onClick={() => setAll(true)} className="btn self-center sm:hidden">+{restSm} mục khác</button>}
      {rest > 0 && <button type="button" onClick={() => setAll(true)} className="btn self-center max-sm:hidden">+{rest} mục khác</button>}
      <WhySheet onClose={() => setAll(false)} spec={all ? {
        title: 'Việc cần xử lý', value: `${sorted.length} mục`, scope: note ?? 'Số vượt mốc trong phạm vi đang chọn',
        more: (
          <ul className="flex min-w-0 flex-col gap-1.5">
            {sorted.map((i) => (
              <li key={i.key}>
                <button type="button" className="tap flex w-full min-w-0 items-center justify-between gap-3 rounded-[10px] border border-line px-3 py-2 text-left text-[13px] transition-colors hover:bg-surface-2"
                  onClick={() => { setAll(false); i.onClick?.(); }}>
                  <span className="min-w-0 truncate font-semibold text-ink">{i.text}</span>{pillOf(i)}
                </button>
              </li>
            ))}
          </ul>
        ),
      } : null} />
    </section>
  );
}
