'use client';

// Khung hướng dẫn nối Zalo: bấm "Gắn Zalo" ở Chia team thì mở luôn các bước có hình, kèm mã 6 số của người đó (anh Vũ 07/11/2026).
// Link bot thật chưa có: web thật hiện chỗ chờ, bản chạy thử (demo / máy) hiện mã QR ảo để xem cách làm.
import { useMemo } from 'react';
import QRCode from 'qrcode';
import { CheckCircle2, MessageCircle, QrCode, Smartphone } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';

/** Link mở bot Zalo của công ty. Để trống tới khi anh gửi link thật. */
export const ZALO_BOT_LINK = '';
const DEMO_BOT_LINK = 'https://zalo.me/0000000000';

function Step({ n, icon: Icon, title, children }: { n: number; icon: typeof QrCode; title: string; children: React.ReactNode }) {
  return (
    <li className="flex gap-3 rounded-xl border border-line bg-surface p-3">
      <span className="grid size-7 shrink-0 place-items-center rounded-full bg-primary text-[13px] font-bold text-white">{n}</span>
      <div className="min-w-0 flex-1 space-y-2">
        <p className="flex items-center gap-1.5 font-semibold text-ink"><Icon size={15} className="text-primary" />{title}</p>
        {children}
      </div>
    </li>
  );
}

function Chat({ code, done }: { code: string; done?: boolean }) {
  return (
    <div className="space-y-1.5 rounded-lg bg-surface-2 p-2.5 text-[12.5px]">
      <p className="border-b border-line pb-1 text-[11px] font-semibold text-ink-3">Bot MEGATECH</p>
      <p className="ml-auto w-fit rounded-xl rounded-br-sm bg-tint px-3 py-1.5 font-bold tracking-[.15em] text-primary num">{code}</p>
      {done && <p className="w-fit max-w-[92%] whitespace-pre-line rounded-xl rounded-bl-sm bg-surface px-3 py-1.5 text-ink-2">{'Đã nối Zalo với hệ thống giao việc.\nCách nhắn bot…\n• việc của tôi\n• hướng dẫn'}</p>}
    </div>
  );
}

export function ZaloLinkGuide({ open, name, code, demo, onClose }: { open: boolean; name: string; code: string; demo: boolean; onClose: () => void }) {
  const link = ZALO_BOT_LINK || (demo ? DEMO_BOT_LINK : '');
  // Vẽ QR bằng ô vuông SVG ngay trên máy, không gọi dịch vụ ngoài.
  const qr = useMemo(() => {
    if (!link) return null;
    const m = QRCode.create(link, { errorCorrectionLevel: 'M' }).modules;
    const cells: string[] = [];
    for (let y = 0; y < m.size; y++) for (let x = 0; x < m.size; x++) if (m.get(x, y)) cells.push(`M${x + 1} ${y + 1}h1v1h-1z`);
    return { size: m.size + 2, d: cells.join('') };
  }, [link]);
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="pr-8 text-base font-semibold text-ink">Nối Zalo cho {name}</DialogTitle>
          <DialogDescription className="text-[12.5px] text-ink-3">Làm một lần trên điện thoại của {name}. Nối xong, báo cáo và việc được giao sẽ về Zalo.</DialogDescription>
        </DialogHeader>
        <div className="rounded-xl border border-[var(--primary)] bg-tint-2 p-3 text-center">
          <p className="text-[12px] text-ink-2">Mã nối của {name}</p>
          <p className="num text-3xl font-bold tracking-[.2em] text-primary">{code}</p>
          <p className="text-[11px] text-ink-3">Dùng một lần, hết hạn sau 24 giờ</p>
        </div>
        <ol className="m-0 list-none space-y-2.5 p-0 text-[13px]">
          <Step n={1} icon={Smartphone} title="Mở Zalo trên điện thoại">
            <p className="text-ink-2">Bấm nút quét mã QR ở góc trên Zalo (biểu tượng ô vuông cạnh ô tìm kiếm).</p>
          </Step>
          <Step n={2} icon={QrCode} title="Quét mã QR để vào bot">
            {link ? <div className="flex flex-wrap items-center gap-3">
              {qr && <svg viewBox={`0 0 ${qr.size} ${qr.size}`} className="size-32 shrink-0 rounded-lg border border-line bg-white" shapeRendering="crispEdges"><title>Mã QR mở bot Zalo</title><path d={qr.d} fill="#000" /></svg>}
              <p className="min-w-0 flex-1 text-ink-2">Quét xong bấm <b>Quan tâm</b> hoặc <b>Nhắn tin</b>.{!ZALO_BOT_LINK && <span className="mt-1 block text-[11px] text-warn">Mã QR ảo để xem cách làm.</span>}</p>
            </div> : <p className="rounded-lg border border-dashed border-line p-3 text-ink-3">Chưa có mã QR bot. Chủ hệ thống thêm link bot Zalo thì mã hiện ở đây.</p>}
          </Step>
          <Step n={3} icon={MessageCircle} title="Nhắn mã 6 số cho bot">
            <p className="text-ink-2">Gõ đúng <b className="num text-primary">{code}</b>, không thêm chữ, rồi gửi.</p>
            <Chat code={code} />
          </Step>
          <Step n={4} icon={CheckCircle2} title="Bot báo đã nối là xong">
            <Chat code={code} done />
            <p className="text-ink-2">Trên web, nút cạnh tên {name} đổi thành <b className="text-primary">Zalo</b> màu xanh. Bot báo “Mã nối sai hoặc đã hết hạn” thì bấm Gắn Zalo lại để lấy mã mới.</p>
          </Step>
        </ol>
      </DialogContent>
    </Dialog>
  );
}
