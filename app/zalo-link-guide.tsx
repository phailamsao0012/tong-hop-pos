'use client';

// Khung hướng dẫn nối Zalo: bấm "Gắn Zalo" ở Chia team thì mở luôn các bước, kèm mã 6 số của người đó (anh Vũ 07/11/2026).
// Mỗi bước là hình màn hình điện thoại có mũi tên chỉ chỗ bấm (anh Vũ 07/11/2026: "làm ảnh màn hình điện thoại thực tế, chỉ mũi tên vào").
// Link bot thật chưa có: web thật hiện chỗ chờ, bản chạy thử (demo / máy) hiện mã QR ảo để xem cách làm.
import { useMemo, type ReactNode } from 'react';
import QRCode from 'qrcode';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';

/** Link mở bot Zalo của công ty. Để trống tới khi anh gửi link thật. */
export const ZALO_BOT_LINK = '';
const DEMO_BOT_LINK = 'https://zalo.me/0000000000';
const ZBLUE = '#0068ff';

function useQr(link: string) {
  // Vẽ QR bằng ô vuông SVG ngay trên máy, không gọi dịch vụ ngoài.
  return useMemo(() => {
    if (!link) return null;
    const m = QRCode.create(link, { errorCorrectionLevel: 'M' }).modules;
    const cells: string[] = [];
    for (let y = 0; y < m.size; y++) for (let x = 0; x < m.size; x++) if (m.get(x, y)) cells.push(`M${x + 1} ${y + 1}h1v1h-1z`);
    return { size: m.size + 2, d: cells.join('') };
  }, [link]);
}
function QrSvg({ qr, className }: { qr: { size: number; d: string }; className: string }) {
  return <svg viewBox={`0 0 ${qr.size} ${qr.size}`} className={`bg-white ${className}`} shapeRendering="crispEdges"><title>Mã QR mở bot Zalo</title><path d={qr.d} fill="#000" /></svg>;
}

/** Mũi tên đỏ chỉ vào chỗ bấm: đặt bằng toạ độ % trong màn hình, `from` là phía đuôi mũi tên (br = dưới phải…). */
function Arrow({ x, y, from = 'br' }: { x: number; y: number; from?: 'br' | 'bl' | 'tl' | 'tr' }) {
  const rot = { br: 0, bl: 90, tl: 180, tr: -90 }[from];
  return (
    <span aria-hidden="true" className="pointer-events-none absolute z-10" style={{ left: `${x}%`, top: `${y}%` }}>
      <span className="absolute -left-3 -top-3 size-6 animate-ping rounded-full bg-[#ff3b30]/40" />
      <span className="absolute -left-3.5 -top-3.5 size-7 rounded-full border-[2.5px] border-[#ff3b30]" />
      <svg width="46" height="46" viewBox="0 0 46 46" className="absolute left-0 top-0" style={{ transform: `rotate(${rot}deg)`, transformOrigin: '0 0' }}>
        <path d="M40 40 L12 12" stroke="#ff3b30" strokeWidth="5" strokeLinecap="round" />
        <path d="M6 6 L24 9 L9 24 Z" fill="#ff3b30" />
      </svg>
    </span>
  );
}

/** Khung điện thoại: viền đen, tai thỏ, thanh giờ. */
function Phone({ children, dark = false }: { children: ReactNode; dark?: boolean }) {
  return (
    <div className="relative mx-auto aspect-[9/18] w-full max-w-[200px] rounded-[26px] border-[6px] border-[#1c1c1e] bg-[#1c1c1e] shadow-md">
      <div className={`relative h-full overflow-hidden rounded-[20px] text-[10px] leading-tight ${dark ? 'bg-[#111] text-white' : 'bg-white text-[#111]'}`}>
        <div className={`flex items-center justify-between px-3 pt-1.5 text-[9px] font-semibold ${dark ? 'text-white' : ''}`} style={dark ? undefined : { background: ZBLUE, color: '#fff' }}>
          <span>9:41</span><span className="h-3 w-12 rounded-full bg-black" /><span>5G ▮</span>
        </div>
        {children}
      </div>
    </div>
  );
}

const ZHeader = ({ children }: { children: ReactNode }) => <div className="flex items-center gap-1.5 px-2 pb-2 pt-1.5 text-white" style={{ background: ZBLUE }}>{children}</div>;
const ChatRow = ({ name, text }: { name: string; text: string }) => (
  <div className="flex items-center gap-2 border-b border-[#eee] px-2 py-1.5">
    <span className="grid size-7 shrink-0 place-items-center rounded-full bg-[#dfe6ef] text-[9px] font-bold text-[#557]">{name[0]}</span>
    <span className="min-w-0"><b className="block truncate text-[10px]">{name}</b><span className="block truncate text-[9px] text-[#888]">{text}</span></span>
  </div>
);

function Screen1() {
  return (
    <Phone>
      <ZHeader>
        <span className="flex h-6 flex-1 items-center rounded-md bg-white/25 px-2 text-[9.5px]">🔍 Tìm kiếm</span>
        <span className="grid size-6 place-items-center rounded border-[1.5px] border-white text-[11px] font-bold">⌗</span>
        <span className="grid size-6 place-items-center text-[16px]">+</span>
      </ZHeader>
      <div className="flex gap-3 border-b border-[#eee] px-2 py-1 text-[9px] font-semibold"><span className="border-b-2 pb-0.5" style={{ borderColor: ZBLUE }}>Ưu tiên</span><span className="text-[#888]">Khác</span></div>
      <ChatRow name="Nhóm Sale HN" text="Chốt 3 đơn rồi nhé" /><ChatRow name="Trần Văn A" text="Ok em" /><ChatRow name="Lê Thị B" text="[Hình ảnh]" /><ChatRow name="Nhóm Kho" text="Đã gửi hàng" /><ChatRow name="Phạm Văn C" text="Mai họp 8h" />
      <Arrow x={72} y={8} from="br" />
    </Phone>
  );
}
function Screen2({ qr }: { qr: { size: number; d: string } | null }) {
  return (
    <Phone dark>
      <div className="flex items-center justify-between px-3 pt-2 text-[10px]"><span>✕</span><b>Quét mã QR</b><span>⚡</span></div>
      <div className="relative mx-auto mt-6 grid aspect-square w-[72%] place-items-center">
        {qr ? <QrSvg qr={qr} className="w-[78%] rounded" /> : <span className="h-[78%] w-[78%] rounded bg-white/80" />}
        {['left-0 top-0 border-l-4 border-t-4', 'right-0 top-0 border-r-4 border-t-4', 'bottom-0 left-0 border-b-4 border-l-4', 'bottom-0 right-0 border-b-4 border-r-4'].map((c) => <span key={c} className={`absolute size-6 rounded-sm border-white ${c}`} />)}
      </div>
      <p className="mt-4 px-3 text-center text-[9.5px] text-white/85">Đưa camera vào mã QR trên màn hình máy tính</p>
      <Arrow x={50} y={40} from="br" />
    </Phone>
  );
}
function Screen3() {
  return (
    <Phone>
      <ZHeader><span className="text-[13px]">‹</span><b className="flex-1 text-[10.5px]">Bot MEGATECH</b></ZHeader>
      <div className="h-14" style={{ background: 'linear-gradient(135deg,#cfe3ff,#e8f1ff)' }} />
      <div className="-mt-7 flex flex-col items-center gap-1 px-3 text-center">
        <span className="grid size-14 place-items-center rounded-full border-[3px] border-white bg-[#17684b] text-[20px] font-bold text-white">M</span>
        <b className="text-[11.5px]">Bot MEGATECH</b>
        <span className="text-[9px] text-[#888]">Tài khoản chính thức · Báo cáo và giao việc</span>
        <div className="mt-2 flex w-full gap-1.5">
          <span className="flex-1 rounded-full py-1.5 text-[10px] font-semibold text-white" style={{ background: ZBLUE }}>Nhắn tin</span>
          <span className="flex-1 rounded-full border border-[#ccc] py-1.5 text-[10px] font-semibold">Quan tâm</span>
        </div>
      </div>
      <Arrow x={30} y={58} from="br" />
    </Phone>
  );
}
function ChatScreen({ code, done }: { code: string; done?: boolean }) {
  return (
    <Phone>
      <ZHeader><span className="text-[13px]">‹</span><b className="flex-1 text-[10.5px]">Bot MEGATECH</b></ZHeader>
      <div className="flex h-[calc(100%-62px)] flex-col gap-1.5 bg-[#e2e9f1] p-2">
        <span className="w-fit max-w-[85%] rounded-lg bg-white px-2 py-1">Chào anh/chị. Gửi mã 6 số được cấp để nối với hệ thống giao việc.</span>
        {done && <>
          <span className="ml-auto w-fit rounded-lg bg-[#d4e6ff] px-2 py-1 font-bold tracking-[.12em]">{code}</span>
          <span className="relative w-fit max-w-[88%] rounded-lg border-2 border-[#ff3b30] bg-white px-2 py-1">✅ Đã nối Zalo với hệ thống giao việc.<br />Cách nhắn bot: việc của tôi, hướng dẫn…</span>
        </>}
      </div>
      <div className="absolute inset-x-0 bottom-0 flex items-center gap-1.5 border-t border-[#ddd] bg-white px-2 py-1.5">
        <span className={`flex-1 rounded-full bg-[#f1f3f5] px-2 py-1 ${done ? 'text-[#999]' : 'font-bold tracking-[.12em]'}`}>{done ? 'Tin nhắn' : code}</span>
        <span className="text-[14px]" style={{ color: ZBLUE }}>➤</span>
      </div>
      {done ? <Arrow x={70} y={56} from="bl" /> : <Arrow x={89} y={95} from="tl" />}
    </Phone>
  );
}

function Step({ n, title, note, children }: { n: number; title: string; note?: ReactNode; children: ReactNode }) {
  return (
    <li className="flex flex-col gap-2 rounded-xl border border-line bg-surface p-3">
      <p className="flex items-start gap-2 font-semibold leading-snug text-ink"><span className="grid size-6 shrink-0 place-items-center rounded-full bg-primary text-[12px] font-bold text-white">{n}</span>{title}</p>
      {children}
      {note && <p className="text-[11.5px] leading-snug text-ink-3">{note}</p>}
    </li>
  );
}

export function ZaloLinkGuide({ open, name, code, demo, onClose }: { open: boolean; name: string; code: string; demo: boolean; onClose: () => void }) {
  const link = ZALO_BOT_LINK || (demo ? DEMO_BOT_LINK : '');
  const qr = useQr(link);
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="pr-8 text-base font-semibold text-ink">Nối Zalo cho {name}</DialogTitle>
          <DialogDescription className="text-[12.5px] text-ink-3">Làm một lần bằng điện thoại của {name}. Nối xong, báo cáo và việc được giao sẽ về Zalo.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-wrap items-center justify-center gap-4 rounded-xl border border-[var(--primary)] bg-tint-2 p-3">
          {link ? (qr && <a href={link} target="_blank" rel="noreferrer" title="Đang xem trên điện thoại thì bấm vào mã để mở Zalo"><QrSvg qr={qr} className="size-32 rounded-lg border border-line p-1" /></a>)
            : <span className="grid size-32 place-items-center rounded-lg border border-dashed border-line p-2 text-center text-[11px] text-ink-3">Chưa có mã QR bot. Chủ hệ thống thêm link bot Zalo thì mã hiện ở đây.</span>}
          <div className="text-center">
            <p className="text-[12px] text-ink-2">Mã nối của {name}</p>
            <p className="num text-3xl font-bold tracking-[.2em] text-primary">{code}</p>
            <p className="text-[11px] text-ink-3">Dùng một lần, hết hạn sau 24 giờ</p>
            {link && !ZALO_BOT_LINK && <p className="mt-1 text-[11px] text-warn">Mã QR ảo để xem cách làm.</p>}
          </div>
        </div>
        <ol className="m-0 grid list-none grid-cols-1 gap-2.5 p-0 text-[13px] min-[420px]:grid-cols-2 sm:grid-cols-3">
          <Step n={1} title="Mở Zalo, bấm nút quét QR"><Screen1 /></Step>
          <Step n={2} title="Quét mã QR ở trên" note="Đang xem trên điện thoại thì bấm thẳng vào mã QR."><Screen2 qr={qr} /></Step>
          <Step n={3} title="Bấm Nhắn tin"><Screen3 /></Step>
          <Step n={4} title={`Gõ ${code} rồi bấm gửi`} note="Chỉ gõ 6 số, không thêm chữ."><ChatScreen code={code} /></Step>
          <Step n={5} title="Bot báo đã nối là xong" note={<>Trên web, nút cạnh tên đổi thành <b className="text-primary">Zalo</b> màu xanh. Bot báo “Mã nối sai hoặc đã hết hạn” thì bấm Gắn Zalo lại.</>}><ChatScreen code={code} done /></Step>
        </ol>
      </DialogContent>
    </Dialog>
  );
}
