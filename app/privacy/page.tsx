import type { Metadata } from 'next';

// Trang chính sách bảo mật công khai (không cần đăng nhập). 07/10/2026: Google bắt có link này cho đăng nhập Google.
// 11/10/2026 viết lại theo Luật Bảo vệ dữ liệu cá nhân 91/2025/QH15 và Nghị định 356/2025/NĐ-CP (QA đối chiếu):
// ghi đúng dữ liệu nào, của ai, để làm gì, ai xem, gửi tới dịch vụ nào, quyền của người có dữ liệu. Liên kết từ trang đăng nhập.
export const metadata: Metadata = { title: 'Chính sách bảo mật · MEGATECH' };

// Thông tin pháp lý công ty: chờ công ty cung cấp, không tự điền. Có số thật thì thay ở đây.
const COMPANY = {
  name: 'MEGATECH (tên pháp lý đang cập nhật)',
  address: 'đang cập nhật',
  contact: 'bộ phận Nhân sự MEGATECH (email, số điện thoại riêng đang cập nhật)',
};

export default function PrivacyPage() {
  return (
    <main className="den-page den-doc-page demo2-privacy">
      <article className="den-doc">
        <h1 className="den-title">Chính sách bảo mật</h1>
        <p className="den-sub">MEGATECH · Tổng hợp POS (tonghopposmegatech.io.vn) và app MEGATECH. Cập nhật 11/10/2026.</p>

        <h2>Phạm vi</h2>
        <p>Đây là hệ thống nội bộ của MEGATECH. Chỉ người có tài khoản do chủ hệ thống cấp mới vào được, không mở đăng ký cho người ngoài. Chính sách này nói rõ hệ thống xử lý dữ liệu cá nhân của ba nhóm người: <b>khách hàng</b>, <b>nhân viên dùng hệ thống</b> và <b>ứng viên tuyển dụng</b>.</p>

        <h2>Bên chịu trách nhiệm</h2>
        <p>Bên kiểm soát dữ liệu: {COMPANY.name}. Địa chỉ trụ sở: {COMPANY.address}. Nhận yêu cầu về dữ liệu cá nhân: {COMPANY.contact}.</p>

        <h2>Dữ liệu nào, để làm gì</h2>
        <ul>
          <li><b>Khách hàng:</b> họ tên, số điện thoại, địa chỉ giao hàng, đơn đã mua, mặt hàng, số tiền, trạng thái giao hàng và ghi chú chăm sóc. Dữ liệu lấy từ phần mềm bán hàng Pancake POS. Dùng để giao hàng, chăm sóc sau bán, báo cáo doanh số và chia việc cho nhân viên. Căn cứ: để thực hiện việc mua bán, giao hàng với khách.</li>
          <li><b>Nhân viên dùng hệ thống:</b> họ tên, email, số điện thoại công việc, chức vụ, bộ phận, team, quyền được cấp, lịch sử đăng nhập (thời điểm, địa chỉ IP, thiết bị) và nhật ký thao tác. Dữ liệu lấy từ Pancake POS và web nhân sự của công ty. Dùng để đăng nhập, phân quyền, giữ an toàn tài khoản và tính số liệu công việc. Căn cứ: hợp đồng lao động và quy định pháp luật.</li>
          <li><b>Ứng viên:</b> các cột trong bảng tuyển dụng của công ty, thường gồm họ tên, số điện thoại, năm sinh, email, vị trí ứng tuyển, kinh nghiệm, ghi chú, CV và kết quả phỏng vấn mà bộ phận tuyển dụng ghi. Chỉ dùng cho việc tuyển dụng. Căn cứ: sự đồng ý của ứng viên khi nộp hồ sơ.</li>
        </ul>
        <p>Web này và app MEGATECH không lưu số căn cước, tài khoản ngân hàng, thông tin sức khoẻ hay dữ liệu sinh trắc học; bảng tuyển dụng có các cột này thì web bỏ qua khi nhận. Hồ sơ nhân sự (căn cước, tài khoản ngân hàng) do web nhân sự của công ty quản lý, chỉ bộ phận Nhân sự xem, theo thông báo riêng cho nhân viên. Face ID và vân tay nằm trên máy của bạn, web chỉ giữ khoá công khai. MEGATECH không mua bán dữ liệu cá nhân.</p>

        <h2>Ai được xem</h2>
        <ul>
          <li>Mỗi tài khoản chỉ thấy những trang, cửa hàng (POS) và bộ phận được cấp. Số điện thoại khách chỉ hiện đủ cho người cần để giao hàng, chăm sóc; ở các trang tổng hợp số được che.</li>
          <li>Hồ sơ ứng viên chỉ chủ hệ thống, giám đốc, bộ phận Nhân sự và người được cấp quyền tuyển dụng xem.</li>
          <li>Mỗi lần mở hồ sơ khách, chi tiết đơn, CV ứng viên hay tải file Excel trên web hoặc app đều được ghi vào nhật ký (ai, lúc nào, xem gì). Mở CV ngay trong Telegram thì nhật ký của web không ghi được.</li>
        </ul>

        <h2>Dữ liệu được gửi tới đâu</h2>
        <p>Hệ thống dùng các dịch vụ sau. Một số có máy chủ ở ngoài Việt Nam, nên dữ liệu có thể được lưu hoặc truyền ra nước ngoài:</p>
        <ul>
          <li><b>Cloudflare</b>: nơi chạy web và lưu cơ sở dữ liệu (đã mã hoá khi lưu và khi truyền).</li>
          <li><b>Pancake POS</b>: nguồn dữ liệu đơn hàng và khách hàng.</li>
          <li><b>Telegram</b>: bot gửi báo cáo số liệu, bảng xếp hạng (có tên nhân viên) cho người được cấp. Tra cứu khách hàng, tin tuyển dụng và tin báo đăng nhập máy mới (tên, email, địa chỉ IP, thành phố) chỉ tới chat riêng của chủ hệ thống, giám đốc, có bật chặn chuyển tiếp. File CV của ứng viên hiện được lưu trên Telegram để xem lại; công ty sẽ chuyển sang kho riêng.</li>
          <li><b>Google</b>: đăng nhập bằng Google (chỉ nhận email, tên, ảnh đại diện; không đọc Gmail hay Drive) và bảng tính Google Sheets mà công ty dùng cho chi phí quảng cáo, tuyển dụng.</li>
          <li><b>Brevo</b>: gửi email mã đăng nhập, mã đặt lại mật khẩu.</li>
          <li><b>quickchart.io</b>: vẽ ảnh biểu đồ cho tin Telegram (số liệu và tên nhân viên trên bảng xếp hạng, không có dữ liệu khách).</li>
        </ul>

        <h2>Bảo vệ dữ liệu</h2>
        <p>Kết nối luôn qua HTTPS. Mật khẩu được băm, không lưu dạng đọc được. Chủ hệ thống và giám đốc bắt buộc xác thực hai lớp. Đăng nhập sai nhiều lần bị khoá tạm. Quyền xem được giới hạn như trên và có nhật ký truy cập.</p>

        <h2>Lưu bao lâu</h2>
        <p>Dữ liệu chỉ được giữ trong thời gian cần cho mục đích nêu trên. Nhân viên đã nghỉ: số căn cước và tài khoản ngân hàng được xoá sau khi trả lương cuối (tối đa 30 ngày); hợp đồng và giấy tờ lương, thuế giữ theo luật kế toán. Công ty đang chốt thời hạn lưu cụ thể cho các loại còn lại (khách hàng, ứng viên không trúng tuyển, nhật ký) và sẽ cập nhật tại trang này. Hết thời hạn, dữ liệu sẽ được xoá hoặc ẩn danh.</p>

        <h2>Quyền của bạn</h2>
        <p>Bạn có quyền được biết dữ liệu nào của mình đang được xử lý; xem, sửa, yêu cầu xoá dữ liệu; rút lại sự đồng ý; phản đối việc dùng dữ liệu để quảng cáo; và khiếu nại theo Luật Bảo vệ dữ liệu cá nhân. Khách hàng liên hệ nhân viên đang chăm sóc mình hoặc số điện thoại của cửa hàng. Nhân viên và ứng viên liên hệ bộ phận Nhân sự MEGATECH. Công ty xác nhận đã nhận yêu cầu trong 2 ngày làm việc và trả lời trong 10 đến 20 ngày tuỳ loại yêu cầu.</p>
        <p>Nếu dùng đăng nhập Google, bạn có thể gỡ quyền của web này tại myaccount.google.com/permissions.</p>

        <h2>Khi có sự cố</h2>
        <p>Nếu phát hiện dữ liệu cá nhân bị lộ, MEGATECH khoá ngay phần bị ảnh hưởng, báo cơ quan chuyên trách bảo vệ dữ liệu cá nhân (Bộ Công an) trong 72 giờ theo quy định và báo người bị ảnh hưởng khi cần.</p>

        <p className="den-doc-back"><a href="/login">Về trang đăng nhập</a></p>
      </article>
    </main>
  );
}
