# Bộ luật vận hành web

Anh Vũ duyệt ngày 10/11/2026 ("ok bộ luật"). Áp dụng cho web tổng (`tong-hop-pos`), web nhân sự (`megatech-crm`), app của sếp và mọi máy chạy chúng (Cloudflare, PC văn phòng, máy chủ cửa vào).

**Cách dùng.** Gặp việc gì, tổ (Claude hoặc Codex) tra chương liên quan trước. Bộ luật đã có câu trả lời thì làm theo, không hỏi lại anh. Chỉ hỏi anh những việc ở chương 14 ("Phải hỏi anh") hoặc việc bộ luật chưa nói tới. Khi hỏi việc chưa có, hỏi xong thì thêm câu trả lời của anh vào đúng chương.

**Repo công khai.** File này chỉ ghi quy trình. Không ghi giá trị khoá, số liệu thật, tên người thật, hay lỗi bảo mật chưa sửa.

Mục lục:
1. Khoá bí mật
2. Chi phí và giới hạn gói
3. Pháp lý Việt Nam
4. Bảo mật
5. Sao lưu và khôi phục
6. Quy trình một việc
7. Kiểm thử
8. Logic số liệu
9. Theo dõi lỗi và sự cố
10. Hạ tầng và tên miền
11. Tài khoản người dùng
12. Giao diện
13. Cách báo anh
14. Tự quyết và phải hỏi anh

---

## 1. Khoá bí mật

Khoá bí mật là mọi chuỗi mở được hệ thống hoặc dữ liệu: `AUTH_SECRET`, khoá Pancake, Telegram, Zalo, Brevo, Anthropic, `HR_SHARED_SECRET`, `TELEGRAM_WEBHOOK_SECRET`, `RECRUIT_WEBHOOK_SECRET`, token Cloudflare, khoá SSH máy chủ, khoá mã hoá sao lưu, mật khẩu quản trị.

1. **Tạo là cất.** Tạo hay đổi khoá nào thì ngay lúc đó cất bản sao ở 2 chỗ:
   - file trong `C:\thp\bi-mat\` trên PC văn phòng;
   - bản mã hoá trên Google Drive, cùng chỗ sao lưu đêm.
   Khoá đặt lên Cloudflare (`wrangler secret put`) không đọc lại được. Không có bản sao thì coi như mất. Bài học 10/11/2026: mất `AUTH_SECRET` gốc, mọi tài khoản phải đặt lại mật khẩu.
2. **Sổ khoá.** Giữ một danh sách: tên khoá, dùng cho web nào, ai tạo, ngày tạo, ngày đổi gần nhất, nơi cất. Sổ khoá **không ghi giá trị**. Sổ nằm trong `C:\thp\bi-mat\SO-KHOA.md` trên PC, không để trong repo.
3. **Báo anh.** Tạo, đổi hay xoá khoá thì báo anh một dòng: khoá gì, cất ở đâu. Không gửi giá trị.
4. **Không bao giờ** in giá trị khoá ra chat, log, commit, ảnh, plan, Artifact. Không nhờ anh gửi khoá qua chat. Anh cần đưa khoá vào máy thì anh tự dán vào file trên máy đó.
5. **Khoá lộ.** Thấy khoá lộ (lọt vào commit, ảnh, log công khai) thì: đổi khoá ngay, đặt khoá mới lên mọi nơi dùng, cất bản sao mới, báo anh. Xoá commit không đủ vì repo công khai đã có người đọc được.
6. **Đổi định kỳ.** Kiểm sổ khoá mỗi tháng: khoá còn dùng không, người tạo còn làm không. Người có khoá nghỉ việc thì đổi các khoá người đó biết.
7. **Đổi `AUTH_SECRET`** làm mất toàn bộ mật khẩu và xác thực 2 lớp. Chỉ đổi khi anh đồng ý, theo chương 11.

## 2. Chi phí và giới hạn gói

1. **Bảng các khoản trả tiền.** Giữ danh sách: dịch vụ, gói, giá, ngày gia hạn, tự gia hạn bật chưa, thẻ nào trả. Gồm tên miền (iNET), Cloudflare Workers Paid, máy chủ cửa vào, Google, Claude, Codex.
2. **Ước tiền trước khi làm.** Việc nào có thể làm tăng đọc, ghi, dung lượng hay số lượt chạy (bảng mới, trigger, điền lịch sử, export, cron dày hơn, thử tải) thì plan phải có một dòng "ước chi phí": tăng bao nhiêu, ra bao nhiêu tiền mỗi tháng. Không ước được thì đo thử trên PC trước.
3. **Phần có sẵn của gói Cloudflare Workers Paid** mỗi kỳ (17 tháng này tới 16 tháng sau): D1 đọc 25 tỷ dòng, ghi 50 triệu dòng, dung lượng 5 GB. Vượt thì tính thêm (đọc khoảng 0,001 USD mỗi triệu dòng). Số đo nằm ở `cf_usage` trong `app_settings` và trang Billing của Cloudflare.
4. **Mức cảnh báo.** Đo theo kỳ, so với phần có sẵn:
   - 50%: ghi vào báo cáo sáng;
   - 80%: gửi anh **một tin riêng** qua Telegram và trong thread: đã dùng bao nhiêu, ước cả kỳ bao nhiêu tiền (USD và VNĐ), cái gì tốn nhất, cách chặn;
   - 100% hoặc ước sẽ vượt: tin riêng như trên, kèm việc tổ sẽ tạm tắt nếu anh đồng ý.
   Không để số tiền lẫn trong báo cáo dài.
5. **Báo tiền mỗi sáng** cùng bản tin 7h30: số tiền ước tính cả kỳ.
6. **Không né nợ.** Không đổi tài khoản hay tạo tài khoản mới để tránh trả tiền. Hoá đơn quá hạn thì nhắc anh trả, vì dịch vụ có thể bị dừng.
7. **Việc nặng chạy đêm.** Điền lịch sử, export, sao lưu lớn chỉ chạy sau 22h giờ Việt Nam.

## 3. Pháp lý Việt Nam

Phần này là bản tóm theo bài tư vấn pháp lý đọc ngày 10/11/2026, **chưa đối chiếu văn bản gốc**. Việc có hậu quả pháp lý lớn thì hỏi anh để anh hỏi luật sư.

**Văn bản đang áp dụng**
- Luật Bảo vệ dữ liệu cá nhân số 91/2025/QH15, hiệu lực 01/01/2026.
- Nghị định 356/2025/NĐ-CP hướng dẫn, hiệu lực 01/01/2026, thay Nghị định 13/2023/NĐ-CP.
- Luật An ninh mạng số 116/2025/QH15, hiệu lực 01/07/2026. Nghị định 53/2022/NĐ-CP về lưu dữ liệu tại Việt Nam.
- Bộ luật Lao động (hồ sơ nhân sự), Luật Giao dịch điện tử (chứng từ, chữ ký điện tử).

**Dữ liệu web đang giữ**
- Nhân sự: họ tên, ngày sinh, CCCD, ngân hàng, mã số thuế, BHXH, địa chỉ, ảnh giấy tờ. Ngân hàng, thu nhập có thể là dữ liệu **nhạy cảm** (thông tin tài chính).
- Khách hàng (từ Pancake): tên, số điện thoại, địa chỉ giao hàng, đơn hàng.
- Người dùng web: email, nhật ký đăng nhập, địa chỉ IP.

**Việc phải làm**
1. **Mục đích rõ.** Dữ liệu thu cho việc gì thì chỉ dùng cho việc đó. Dữ liệu giao hàng không dùng để quảng cáo. Dùng cho việc mới thì phải xin lại đồng ý.
2. **Đồng ý.** Nhân viên ký đồng ý xử lý dữ liệu khi vào làm (phần của HR, có mẫu). Im lặng không phải là đồng ý. Người đó có quyền rút lại.
3. **Quyền của người có dữ liệu:** biết, xem, sửa, xoá, phản đối, khiếu nại. Có đường để họ yêu cầu (qua HR). Thời hạn trả lời theo Nghị định 356, khi viết tính năng thì tra số ngày ở văn bản gốc.
4. **Ít nhất có thể.** Không thu trường không dùng. Trang nào không cần số điện thoại khách thì không hiện.
5. **Giữ bao lâu.** Người nghỉ việc: xoá CCCD và ngân hàng khi đã trả lương cuối hoặc đủ 30 ngày (đang tắt, chờ anh bật). Mã số thuế, BHXH, hợp đồng giữ theo luật thuế, lao động.
6. **Dữ liệu nhạy cảm:** chỉ HR và chủ hệ thống xem, API trả bản che, xem đủ thì ghi nhật ký (đã làm ở web nhân sự).
7. **Lộ dữ liệu.** Thấy hoặc nghi lộ: dừng chỗ rò, báo anh ngay, ghi sổ sự cố. Báo cơ quan chức năng (Cục An ninh mạng, A05, Bộ Công an) trong 72 giờ. Thông báo người bị ảnh hưởng. Mẫu báo do anh và luật sư chốt.
8. **Hồ sơ đánh giá tác động và người phụ trách dữ liệu.** Doanh nghiệp nhỏ (thương mại, dịch vụ: tới 50 lao động có BHXH, doanh thu tới 100 tỷ) được chọn có làm hay không tới 31/12/2030, **trừ khi trực tiếp xử lý dữ liệu nhạy cảm** hoặc số lượng lớn. Web nhân sự có ngân hàng nên có thể vẫn phải làm. **Việc này anh quyết** (chương 14).
9. **Lưu ở nước ngoài.** Cloudflare, Google Drive đặt máy ở nước ngoài, có thể tính là chuyển dữ liệu ra nước ngoài và cần hồ sơ. Bản chạy trên PC văn phòng và máy chủ ở Việt Nam đỡ việc này. Sao lưu lên Drive phải mã hoá trước.
10. **Nhật ký** đăng nhập, thao tác giữ ít nhất 12 tháng.
11. **Trang công khai:** trang Chính sách (`/privacy`) ghi tên công ty, mục đích, quyền của người dùng, cách liên hệ. Tên miền đứng tên công ty hoặc anh.
12. **Phạt:** tới 5% doanh thu năm trước nếu chuyển dữ liệu ra nước ngoài sai, tới 3 tỷ đồng với vi phạm khác. Mua bán dữ liệu cá nhân có thể bị xử lý hình sự.

## 4. Bảo mật

1. **Đăng nhập.** Mật khẩu ít nhất 10 ký tự. Xác thực 2 lớp bắt buộc cho chủ hệ thống, giám đốc, HR, leader. Sai nhiều lần thì chặn tạm. Phiên tự hết hạn. Đặt lại mật khẩu qua mã gửi email, không dùng mật khẩu tạm gửi qua chat.
2. **Quyền tối thiểu.** Ai cần xem gì thì cho đúng phần đó. Đổi quyền xem do anh quyết. Kiểm quyền ở máy chủ (`lib/access.ts`, `guard`), không chỉ giấu nút trên giao diện.
3. **Người nghỉ việc** khoá tài khoản trong ngày HR ghi "Đã nghỉ". Phiên đang mở bị đá ra trong 60 giây.
4. **Nhật ký.** Mọi thay đổi quan trọng ghi `audit_log`: ai, lúc nào, đổi gì. Nhật ký không chứa giá trị nhạy cảm.
5. **Đường truyền.** Mọi tên miền có https. Cổng quản trị máy chủ chỉ mở bằng khoá SSH, tắt đăng nhập bằng mật khẩu. PC văn phòng không mở cổng nào ra Internet.
6. **Đầu vào.** Câu SQL dùng tham số, không ghép chuỗi. Chữ người dùng nhập phải lọc trước khi hiện. Webhook phải kiểm khoá bí mật.
7. **Thư viện.** Mỗi tháng xem cảnh báo lỗ hổng của thư viện, cập nhật bản vá. Không cài gói lạ.
8. **Repo công khai.** Trước mỗi lần đẩy code, kiểm: không khoá, không số thật, không tên, email, số điện thoại thật, không ảnh chụp dữ liệu thật. Lỗi bảo mật chưa sửa thì không ghi lên repo hay log GitHub Actions.
9. **Lớp an toàn của máy.** Lớp an toàn chặn việc gì thì dừng, báo anh, không tìm cách lách.
10. **Trước khi lên web**, việc đụng đăng nhập, quyền, dữ liệu nhạy cảm phải qua một lượt kiểm bảo mật riêng.

## 5. Sao lưu và khôi phục

1. **3-2-1:** 3 bản, trên 2 loại nơi, 1 bản ngoài văn phòng. Hiện tại: dữ liệu chạy trên PC, bản sao lưu trên PC, bản mã hoá trên Google Drive.
2. **Lịch:** sao lưu tự động 2h30 mỗi đêm. Giữ 7 ngày gần nhất và 4 Chủ nhật gần nhất.
3. **Thử khôi phục mỗi tháng** vào một thư mục riêng, so số bảng và số dòng. Bản sao lưu chưa từng khôi phục thử thì coi như chưa có.
4. **Trước khi ghi hoặc xoá dữ liệu thật:** sao lưu riêng ngay trước đó, ghi tên bản sao lưu vào plan, anh đồng ý đúng thao tác đó. Xoá phải hỏi đúng thao tác, kể cả khi đã có sao lưu.
5. **Migration** (đổi cấu trúc bảng) chỉ thêm, không sửa file cũ. Có cách quay lại hoặc có sao lưu trước khi chạy.
6. **Khoá giải mã sao lưu** cất theo chương 1, có bản ngoài PC (USB hoặc Drive riêng). Mất khoá này là mất sao lưu.
7. **Báo lỗi sao lưu.** Sao lưu đêm hỏng thì sáng báo anh qua Telegram.

## 6. Quy trình một việc

1. **Nhận việc.** Đọc kỹ. Yêu cầu hiểu được nhiều nghĩa thì hỏi anh một câu ngắn trước.
2. **Plan.** Viết plan vào `docs/plans/<ngày>-<việc>/plan.md`: làm gì, ở đâu, anh sẽ thấy gì, ước chi phí, rủi ro, cách quay lại. Gửi anh bản Artifact đọc trên điện thoại.
3. **Chờ anh đồng ý.** Không làm trước khi anh duyệt, kể cả sửa nhỏ.
4. **Làm.** Codex viết code theo từng bước nhỏ, mỗi bước có tiêu chí xong (trừ việc anh cho Claude tự code). Nhánh `codex/<việc>` hoặc `claude/<việc>`.
5. **Kiểm.** Claude kiểm bài một lần, chạy đủ 4 lệnh (chương 7), so số.
6. **Cho anh xem** bằng ảnh hoặc Artifact dữ liệu ảo. Không lên web demo.
7. **Lên web thật** chỉ khi anh nhắn "ok lên". Merge vào `main` thì web tự deploy.
8. **Theo dõi 1 giờ sau khi lên:** tỉ lệ lỗi, tốc độ, số liệu. Có vấn đề thì quay lại bản trước.
9. **Quay lại bản cũ** phải làm được trong 5 phút: revert commit trên `main` hoặc tắt cờ tính năng.
10. **Giờ lên web:** tránh giờ đông người (sáng 9h–11h, chiều 14h–17h). Việc làm web dừng thì báo trước.
11. **Ghi lại.** Lên xong ghi vào nhật ký "đã lên web thật": ngày, PR, việc gì.

## 7. Kiểm thử

1. **4 lệnh bắt buộc** trước khi nộp: `pnpm typecheck`, `pnpm test`, `pnpm lint`, `pnpm build`. Không thêm lỗi lint mới.
2. **Logic mới trong `lib/` phải có test**, chạy bằng `node:test`. Test dùng số ảo.
3. **Số liệu mới** phải so với bản cũ hoặc với Pancake trên nhiều bộ lọc (POS, bộ phận, khoảng ngày) trước khi lên. Lệch thì giải thích được từng chỗ.
4. **Không thử tải trên web thật.** Thử tải trên PC hoặc bản sao.
5. **Kiểm trên điện thoại gập** (2 màn) với trang có đổi giao diện.
6. **Test chập chờn** không phải lý do bỏ qua. Tìm gốc, sửa cho chắc.

## 8. Logic số liệu

1. **Doanh số** chỉ tính người có hậu tố MKT, CSKH hoặc SALE, cộng anh Xuân Nghĩa (người ngoài hậu tố ghi "Vẫn tính").
2. **Doanh thu** = ô "Tổng cộng" của Pancake từng POS cộng lại.
3. **Vận đơn** không gọi là bán hàng, chốt hay doanh thu. Dùng "Đơn chuyển đi", "Doanh số chuyển đi", "Đơn vào Chờ xác nhận", "Người lên đơn".
4. **Số về MKT** chỉ tính đơn chia cho Sale.
5. **Đơn thành công** = khách đã nhận.
6. **Hoàn, huỷ:** từ 7% trở lên đỏ, từ 5% vàng, dưới 5% xanh.
7. **Mỗi con số** ghi rõ là số gì, tính trong phạm vi nào. Bấm vào số thì mở trang chi tiết, giữ bộ lọc.
8. **So kỳ trước** cùng mốc giờ. Biểu đồ so kỳ dùng cộng dồn.
9. **Đổi cách tính, tên nghiệp vụ, phạm vi** do anh quyết. Quy tắc mới anh chốt thì thêm vào chương này.

## 9. Theo dõi lỗi và sự cố

1. **Đo liên tục:** tỉ lệ lỗi 500, thời gian trả trang, máy PC sống hay chết, ổ đĩa, sao lưu.
2. **Ngưỡng báo Telegram:** lỗi trên 1% trong 15 phút; trang chậm quá 5 giây; PC hoặc đường vào mất quá 5 phút; ổ đĩa đầy quá 85%.
3. **Web chết thì báo anh trong 15 phút**, lời thường: cái gì hỏng, ai bị ảnh hưởng, đang làm gì, khi nào xong.
4. **Xử lý:** ưu tiên cho web chạy lại (quay bản cũ, bật cache, tắt tính năng nặng), rồi mới tìm gốc.
5. **Sổ sự cố** cho mỗi lần web lỗi lớn: chuyện gì, mấy giờ tới mấy giờ, ai bị ảnh hưởng, gốc là gì, đã sửa thế nào, làm gì để không lặp lại. Bài học thêm vào bộ luật này.
6. **Không giấu lỗi.** Lỗi do tổ gây ra thì nói thẳng với anh.

## 10. Hạ tầng và tên miền

1. **Tên miền** bật tự gia hạn. Nhắc anh trước hạn 30 ngày. posmegatech.com hết hạn 09/11/2027.
2. **DNS:** giữ các dòng email (MX, SPF, DMARC). Tắt DNSSEC trước khi đổi nameserver. Đổi DNS thì chụp lại bảng cũ trước.
3. **Lối vào dự phòng.** Có ít nhất 2 đường vào web (máy chủ cửa vào ở Việt Nam và đường hầm Cloudflare). Hỏng một đường thì chuyển sang đường kia được trong 1 giờ.
4. **Máy PC văn phòng:** chạy 24/7, có UPS, tự bật web lại khi khởi động. Báo Telegram khi máy tắt, mất mạng, đầy ổ.
5. **Máy chủ thuê:** khoá SSH, tường lửa chỉ mở cổng cần, cập nhật bảo mật tự động.
6. **Môi trường:** web thật, bản PC chỉ xem, bản chạy thử trên máy. Không nhầm dữ liệu thật vào bản thử.

## 11. Tài khoản người dùng

1. **Tạo tài khoản:** chủ hệ thống hoặc HR tạo, gán vai trò đúng việc. Ghi nhật ký.
2. **Khoá tài khoản:** người nghỉ việc khoá trong ngày. Khoá hàng loạt chỉ khi anh bảo, có sao lưu danh sách để mở lại.
3. **Đặt lại mật khẩu:** người dùng tự làm qua "Quên mật khẩu", mã gửi về email của họ. Không ai biết mật khẩu của người khác. Không dùng mật khẩu tạm gửi qua chat.
4. **Đổi mật khẩu hàng loạt** (như đổi `AUTH_SECRET` ngày chuyển sang PC): báo trước mọi người ngày giờ và cách làm, kiểm email "Quên mật khẩu" gửi được trước, sao lưu bảng tài khoản, anh đồng ý đúng thao tác.
5. **Xác thực 2 lớp mất máy:** người đó báo chủ hệ thống, chủ hệ thống gỡ 2 lớp sau khi xác minh qua kênh khác, ghi nhật ký.

## 12. Giao diện

1. Chữ trên web viết tiếng Việt.
2. Màu chủ đạo xanh lá `#17684b`. Đồng bộ kiểu toàn web.
3. Gọn: không tiêu đề hay chữ giải thích to, ghi chú để cuối trang, không ô trống. Biểu đồ đặt vào chỗ trống sẵn có.
4. Chạy tốt trên điện thoại gập (Oppo Find N5, cả 2 màn). Không có thanh kéo ngang.
5. Chọn POS là hàng nút trên một dòng. Tổng, Hà Nội, Thái Nguyên làm giống nút Tất cả, Sale, CSKH.
6. Mọi bộ phận mở trang Tổng quan đầu tiên.
7. Đề xuất giao diện mới phải có hình cho anh xem trước.

## 13. Cách báo anh

1. Tiếng Việt, ngắn, lời thường. Anh không rành từ chuyên ngành: thay bằng lời dễ hiểu.
2. Báo tiến độ khoảng 10 phút một lần ở project chat khi đang làm việc anh giao.
3. Báo cáo, ảnh, plan gửi bằng Artifact (anh xem trên điện thoại, không mở được file).
4. Câu hỏi trả lời được bằng một chữ, mỗi lựa chọn một dòng, có đề xuất của tổ.
5. Không nhờ anh dán lệnh. Không chỉ anh sửa cài đặt để lách lớp an toàn.
6. Không chạy ngầm việc anh không giao. Không tự chuyển việc giữa các tổ khi anh vắng.

## 14. Tự quyết và phải hỏi anh

**Phải hỏi anh (chờ anh nhắn đồng ý):**
- Lên web thật (merge `main`), deploy từ PC.
- Ghi hoặc xoá dữ liệu thật, khoá tài khoản hàng loạt, đổi `AUTH_SECRET`.
- Việc tốn tiền thêm, mua hay thuê dịch vụ, vượt gói.
- Đổi quyền xem, cách tính số, tên nghiệp vụ.
- Gửi tin ra ngoài công ty, gửi tin hàng loạt cho nhân viên.
- Đổi DNS, tên miền, bật tắt Cloudflare.
- Việc pháp lý: hồ sơ đánh giá tác động, người phụ trách dữ liệu, báo cơ quan chức năng, bật tự xoá dữ liệu người nghỉ.
- Mọi việc mới anh giao: plan trước, anh duyệt rồi mới làm.

**Tổ tự quyết theo bộ luật (làm xong báo anh):**
- Cách cất khoá, ghi sổ khoá, đổi khoá bị lộ (báo ngay).
- Lịch sao lưu, thử khôi phục.
- Mức cảnh báo và gửi cảnh báo.
- Các bước kiểm, cách viết test, cách viết báo cáo.
- Quay lại bản cũ khi web lỗi nặng sau khi lên (báo ngay).
- Sửa chỗ viết sai trong bộ luật này. Thêm luật mới thì báo anh.
