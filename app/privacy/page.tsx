import type { Metadata } from 'next';

// Trang chính sách bảo mật công khai (07/10/2026): Google bắt có link này mới cho "Publish app" đăng nhập bằng Google.
// Không cần đăng nhập để xem.
export const metadata: Metadata = { title: 'Chính sách bảo mật · MEGATECH' };

export default function PrivacyPage() {
  return (
    <main className="den-page den-doc-page">
      <article className="den-doc">
        <h1 className="den-title">Chính sách bảo mật</h1>
        <p className="den-sub">MEGATECH · Tổng hợp POS (tonghopposmegatech.io.vn). Cập nhật 07/10/2026.</p>

        <h2>Web này dành cho ai</h2>
        <p>Đây là web nội bộ của MEGATECH, chỉ người có tài khoản do chủ hệ thống tạo mới vào được. Web không mở đăng ký cho người ngoài.</p>

        <h2>Đăng nhập bằng Google</h2>
        <p>Khi bạn bấm “Tiếp tục với Google”, Google chỉ gửi cho web địa chỉ email, tên và ảnh đại diện của tài khoản bạn chọn. Web dùng email đó để tìm tài khoản MEGATECH có sẵn trùng email. Không trùng thì không cho vào và không tạo tài khoản mới.</p>
        <p>Web không đọc Gmail, Drive, danh bạ hay bất kỳ dữ liệu Google nào khác, và không lưu mật khẩu Google.</p>

        <h2>Dữ liệu được lưu</h2>
        <p>Web lưu phiên đăng nhập và nhật ký đăng nhập (thời điểm, cách đăng nhập, địa chỉ IP, trình duyệt) để giữ an toàn tài khoản. Số liệu bán hàng và khách hàng trên web là dữ liệu kinh doanh của MEGATECH, chỉ người được cấp quyền xem.</p>

        <h2>Chia sẻ dữ liệu</h2>
        <p>MEGATECH không bán và không chia sẻ dữ liệu của bạn cho bên thứ ba. Dữ liệu chỉ được dùng để vận hành web nội bộ này.</p>

        <h2>Xoá dữ liệu và liên hệ</h2>
        <p>Muốn xoá tài khoản hoặc hỏi về dữ liệu của mình, bạn liên hệ chủ hệ thống MEGATECH. Bạn cũng có thể gỡ quyền của web này trong tài khoản Google tại myaccount.google.com/permissions.</p>

        <p className="den-doc-back"><a href="/login">Về trang đăng nhập</a></p>
      </article>
    </main>
  );
}
