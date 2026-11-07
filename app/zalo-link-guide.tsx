'use client';

// Khung hướng dẫn nối Zalo: bấm "Gắn Zalo" ở Chia team thì mở luôn các bước, kèm mã 6 số của người đó (anh Vũ 07/11/2026).
// Mỗi bước là hình màn hình điện thoại có mũi tên chỉ chỗ bấm (anh Vũ 07/11/2026: "làm ảnh màn hình điện thoại thực tế, chỉ mũi tên vào").
// Link bot thật chưa có: web thật hiện chỗ chờ, bản chạy thử (demo / máy) hiện mã QR ảo để xem cách làm.
import { useMemo, type ReactNode } from 'react';
import QRCode from 'qrcode';
import { ArrowLeft, Bot, ContactRound, Ellipsis, History, Image as ImageIcon, Images, LayoutGrid, List, MessageCircle, Mic, Newspaper, Pin, Plus, ScanLine, ScanQrCode, Search, SendHorizontal, Smile, SquareUser, UserRound, X } from 'lucide-react';
import type { TeamZaloState } from '@/lib/zalo/team-link';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';

/** Link mở bot Zalo của công ty. Để trống tới khi anh gửi link thật. */
export const ZALO_BOT_LINK = '';
const DEMO_BOT_LINK = 'https://zalo.me/0000000000';

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

const ZGRAD = 'linear-gradient(100deg,#0a68fe 0%,#0a8dfd 55%,#12b4fb 100%)';
const BOT = 'Bot Quản Lý MEGATECH';

/** Khung điện thoại: viền đen, thanh giờ giống máy thật. */
function Phone({ children, dark = false }: { children: ReactNode; dark?: boolean }) {
  return (
    <div className="relative mx-auto aspect-[9/19] w-full max-w-[200px] rounded-[26px] border-[5px] border-[#1c1c1e] bg-[#1c1c1e] shadow-md">
      <div className={`relative h-full overflow-hidden rounded-[21px] text-[10px] leading-tight ${dark ? 'bg-[#2a2a2a] text-white' : 'bg-white text-[#111]'}`}>
        <div className="flex h-[18px] items-center justify-between px-3.5 text-[8.5px] font-semibold text-white" style={dark ? undefined : { background: ZGRAD }}>
          <span>11:08</span><span className="tracking-tight">▂▄▆ ◔ 52</span>
        </div>
        {children}
      </div>
    </div>
  );
}

const BotAvatar = ({ size = 28 }: { size?: number }) => (
  <span className="grid shrink-0 place-items-center rounded-full bg-[#4b7cc0] text-[#e6eefa]" style={{ width: size, height: size }}><Bot size={size * 0.56} strokeWidth={2.2} /></span>
);
const ChatRow = ({ name, text, time, color, bot, pin }: { name: string; text: string; time: string; color?: string; bot?: boolean; pin?: boolean }) => (
  <div className={`flex items-center gap-2 px-2 py-[5px] ${pin ? 'bg-[#f3f4f6]' : ''}`}>
    {bot ? <BotAvatar /> : <span className="grid size-7 shrink-0 place-items-center rounded-full text-[10px] font-semibold text-white" style={{ background: color }}>{name.split(' ').pop()?.[0]}</span>}
    <span className="min-w-0 flex-1 border-b border-[#ececec] pb-[5px]">
      <span className="flex items-center gap-1"><span className="flex-1 truncate text-[10px]">{name}</span>{pin && <Pin size={8} className="rotate-45 fill-[#9aa0a6] text-[#9aa0a6]" />}<span className="text-[8px] text-[#8a8d91]">{time}</span></span>
      <span className="block truncate text-[9px] text-[#8a8d91]">{text}</span>
    </span>
  </div>
);

function Screen1() {
  return (
    <Phone>
      <div className="flex items-center gap-2 px-2.5 pb-2 pt-1 text-white" style={{ background: ZGRAD }}>
        <Search size={13} /><span className="flex-1 text-[10.5px] text-white/75">Tìm kiếm</span><span className="relative grid"><ScanQrCode size={14} /><Arrow x={50} y={50} from="br" /></span><Plus size={15} />
      </div>
      <div className="flex gap-4 border-b border-[#e5e5e5] px-2.5 pt-1.5 text-[10px] font-semibold"><span className="border-b-2 border-[#111] pb-1">Ưu tiên</span><span className="text-[#8a8d91]">Khác</span></div>
      <ChatRow bot pin name={BOT} text="[Hình ảnh] 📊 Báo cáo 8h" time="23 giờ" />
      <ChatRow name="Nhóm Sale HN" text="An: chốt 3 đơn rồi nhé" time="5 phút" color="#e8833a" />
      <ChatRow name="Trần Văn An" text="Bạn: ok em" time="11 phút" color="#3a9d6b" />
      <ChatRow name="Lê Thị Bình" text="[Hình ảnh]" time="16 phút" color="#c0568a" />
      <ChatRow name="Nhóm Kho" text="Đã gửi hàng chiều nay" time="37 phút" color="#7b68c4" />
      <ChatRow name="Phạm Văn Cường" text="Mai họp 8h nhé" time="1 giờ" color="#4c8fd6" />
      <div className="absolute inset-x-0 bottom-0 flex items-end justify-around border-t border-[#e5e5e5] bg-white px-1 pb-2.5 pt-1.5 text-[#555]">
        <span className="flex flex-col items-center text-[7.5px] font-semibold text-[#0a68fe]"><MessageCircle size={13} className="fill-[#0a8dfd] text-[#0a8dfd]" />Tin nhắn</span>
        <ContactRound size={13} /><LayoutGrid size={13} /><Newspaper size={13} /><UserRound size={13} />
      </div>
    </Phone>
  );
}
function Screen2({ qr }: { qr: { size: number; d: string } | null }) {
  return (
    <Phone dark>
      <div className="absolute inset-0 -z-0" style={{ background: 'radial-gradient(ellipse at 50% 45%,#5a5d63 0%,#2f3033 55%,#1a1a1b 100%)' }} />
      <div className="relative flex items-center justify-between px-2.5 pt-1.5">
        <span className="grid size-6 place-items-center rounded-full bg-white/20"><X size={12} /></span>
        <span className="flex items-center gap-1 rounded-full bg-white/20 px-2.5 py-1 text-[9px]"><SquareUser size={10} />Mã QR của tôi</span>
        <span className="grid size-6 place-items-center rounded-full bg-white/20"><Ellipsis size={12} /></span>
      </div>
      <p className="relative mt-5 text-center text-[10px] font-medium">Quét mọi mã QR</p>
      <div className="relative mx-auto mt-3 grid aspect-square w-[70%] place-items-center">
        <span className="grid size-[74%] place-items-center rounded bg-white p-1 shadow-[0_0_0_6px_rgba(20,20,20,.55)]">{qr ? <QrSvg qr={qr} className="size-full" /> : null}</span>
        {['left-0 top-0 border-l-[3px] border-t-[3px] rounded-tl-lg', 'right-0 top-0 border-r-[3px] border-t-[3px] rounded-tr-lg', 'bottom-0 left-0 border-b-[3px] border-l-[3px] rounded-bl-lg', 'bottom-0 right-0 border-b-[3px] border-r-[3px] rounded-br-lg'].map((c) => <span key={c} className={`absolute size-6 border-white/90 ${c}`} />)}
        <Arrow x={52} y={55} from="br" />
      </div>
      <div className="absolute inset-x-0 bottom-3 flex justify-around px-1 text-center text-[7.5px] text-white/90">
        {[{ i: <Images size={12} />, t: 'Ảnh có sẵn' }, { i: <ScanLine size={12} />, t: 'QR chuyển khoản' }, { i: <History size={12} />, t: 'Gần đây' }].map((b) => (
          <span key={b.t} className="flex w-1/3 flex-col items-center gap-1"><span className="grid size-7 place-items-center rounded-full bg-white/20">{b.i}</span>{b.t}</span>
        ))}
      </div>
    </Phone>
  );
}
function Screen3() {
  return (
    <Phone>
      <div className="relative h-[70px]" style={{ background: 'linear-gradient(160deg,#9cc6ff 0%,#cfe4ff 60%,#eef5ff 100%)' }}>
        <div className="flex items-center justify-between px-2 pt-1.5 text-white"><ArrowLeft size={14} /><Ellipsis size={14} /></div>
      </div>
      <div className="relative -mt-8 flex flex-col items-center gap-1 px-3 text-center">
        <span className="rounded-full border-[3px] border-white"><BotAvatar size={58} /></span>
        <b className="mt-0.5 text-[11.5px]">{BOT}</b>
        <span className="rounded bg-[#e8f1ff] px-1.5 py-0.5 text-[8.5px] font-medium text-[#0a68fe]">Tài khoản Bot</span>
        <span className="text-[9px] text-[#6b6f75]">Báo cáo doanh số và giao việc cho nhân viên MEGATECH</span>
        <span className="relative mt-2.5 w-full rounded-full py-[7px] text-[10.5px] font-semibold text-white" style={{ background: '#0a68fe' }}>Nhắn tin<Arrow x={74} y={70} from="br" /></span>
      </div>
      <div className="mt-3 border-t-[6px] border-[#f2f3f5] px-3 pt-2 text-[9px] text-[#6b6f75]">
        <p className="font-semibold text-[#111]">Thông tin</p>
        <p className="mt-1">Tự động gửi báo cáo 8h, 12h, 17h, 22h</p>
        <p className="mt-0.5">Nhận việc và báo hoàn thành ngay trên Zalo</p>
      </div>
    </Phone>
  );
}
function ChatScreen({ code, done }: { code: string; done?: boolean }) {
  return (
    <Phone>
      <div className="flex items-center gap-2 px-2 pb-1.5 pt-1 text-white" style={{ background: ZGRAD }}>
        <ArrowLeft size={14} />
        <span className="min-w-0 flex-1"><b className="block truncate text-[10.5px]">{BOT}</b><span className="block text-[8px] text-white/80">Tài khoản Bot</span></span>
        <List size={14} />
      </div>
      <div className="flex h-full flex-col gap-1.5 bg-[#e2e8ef] p-2">
        <span className="mx-auto rounded-full bg-[#b9bec6]/80 px-2 py-0.5 text-[8px] text-white">09:15 07/11/2026</span>
        <span className="w-fit max-w-[85%] rounded-lg bg-white px-2 py-1 shadow-sm">Chào anh/chị. Gửi mã 6 số được cấp để nối với hệ thống giao việc.</span>
        {done && <>
          <span className="ml-auto w-fit rounded-lg bg-[#d5e9ff] px-2 py-1 font-semibold tracking-[.12em] shadow-sm">{code}</span>
          <span className="relative w-fit max-w-[88%] rounded-lg border-2 border-[#ff3b30] bg-white px-2 py-1 shadow-sm">✅ Đã nối Zalo với hệ thống giao việc.<br /><span className="text-[#555]">Nhắn “việc của tôi” để xem việc đang có.</span><Arrow x={55} y={100} from="br" /></span>
        </>}
      </div>
      <div className="absolute inset-x-0 bottom-0 flex items-center gap-1.5 border-t border-[#e3e3e3] bg-white px-2 pb-2.5 pt-1.5 text-[#6b6f75]">
        <Smile size={14} />
        <span className={`flex-1 text-[10px] ${done ? 'text-[#9a9da2]' : 'font-semibold tracking-[.12em] text-[#111]'}`}>{done ? 'Tin nhắn' : code}</span>
        {done ? <><Ellipsis size={13} /><Mic size={13} /><ImageIcon size={14} className="text-[#f39c34]" /></> : <span className="relative grid"><SendHorizontal size={15} className="fill-[#0a68fe] text-[#0a68fe]" /><Arrow x={50} y={50} from="tl" /></span>}
      </div>
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

/** Nút nối Zalo dùng chung ở Chia team và Tài khoản: đã nối → chip Zalo xanh; đang có mã → bấm xem lại hướng dẫn. */
export function ZaloButton({ linked, code, disabled, label, onClick, onGuide, hint = 'Lấy mã nối Zalo (tự lưu chia team nếu chưa lưu)' }: { linked?: TeamZaloState; code?: string; disabled: boolean; label: string; onClick: () => void; onGuide: () => void; hint?: string }) {
  if (linked?.linked) return <span className="inline-flex items-center gap-0.5 rounded-full bg-tint px-1.5 tap py-0.5 text-[11px] font-semibold text-primary" title={linked.teamName ? `Đã nối Zalo · báo cáo theo ${linked.teamName}` : 'Đã nối Zalo · nhận việc qua Zalo'}><MessageCircle size={11} />Zalo</span>;
  if (code) return <button type="button" onClick={onGuide} className="rounded-full border border-[var(--primary)] px-1.5 py-0.5 text-[11px] text-ink hover:bg-tint-2" title="Bấm xem lại cách nối · mã hết hạn sau 24 giờ">Nhắn bot: <b className="num text-primary">{code}</b></button>;
  return (
    <button type="button" disabled={disabled} onClick={onClick} title={disabled ? `Chọn ${label} trước` : hint}
      className="inline-flex items-center gap-0.5 rounded-full border px-1.5 py-0.5 text-[11px] text-ink-2 hover:border-[var(--primary)] hover:text-primary disabled:opacity-50">
      <MessageCircle size={11} />Gắn Zalo
    </button>
  );
}
