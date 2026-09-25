// Mã QR đăng nhập bị quét bằng camera thường (không phải app MEGATECH): chỉ hướng dẫn, không làm gì với mã.
export const dynamic = 'force-dynamic';

export default function QrLanding() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-canvas p-4">
      <div className="card w-full max-w-sm space-y-3 p-6 text-center">
        <img src="/logo.svg" alt="MEGATECH" width={48} height={48} className="mx-auto size-12 rounded-xl" />
        <h1 className="display text-[22px] font-semibold text-ink">Mở bằng app MEGATECH</h1>
        <p className="text-[13.5px] text-ink-2">Đây là mã đăng nhập máy tính. Mở app MEGATECH trên điện thoại → Thêm → <b>Quét đăng nhập máy tính</b>, rồi quét lại mã trên màn hình máy tính.</p>
        <p className="text-[12px] text-ink-3">Nếu bạn không đang đăng nhập ở đâu cả, hãy bỏ qua mã này.</p>
      </div>
    </main>
  );
}
