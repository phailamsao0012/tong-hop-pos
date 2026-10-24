# App iPhone 1.0.0: T6, hướng A hết chất "trang web"

Tổ app viết, 18/10/2026, sau khi soi bản T5 (`d4bbc7b`). Vẫn **chỉ vẽ hình mẫu**, không sửa code app.
File này: `docs/plans/2026-10-18-app-1.0/thiet-ke/giao-T6.md`. Đọc trước:
- `../thiet-ke-lai.md`: mọi luật ở mục 3, 4, 8 vẫn giữ.
- `giao-T5.md`: mọi luật ở mục 2 vẫn giữ.
- `soi-T5.md`: lỗi tổ soi được ở **từng màn**, kèm cách sửa gợi ý.
- `noi-dung.md`, Hệ thiết kế A trong `index.html`.

T5 đạt ở khối chính (cung Hôm nay, cặp thanh mảnh, viên chênh lệch, quầng sáng, bản sáng xanh bạc hà). Nhưng **phần dưới khối chính vẫn như trang quản trị web**, chưa ra app iPhone:
- 124 ô `<select>`, 70 ô `<details>` có tam giác ▶, một thanh trượt `<input type=range>` xanh dương.
- Số lặp lại: biểu đồ xong lại có dòng chữ "3 / 6 / 3 / 6", rồi danh sách cùng số đó.
- Danh sách khoá–giá trị dài vẫn còn (Marketing ở Tổng quan, NV MKT chi tiết 15 dòng, ...).
- Chữ ghi chú của hình mẫu lọt vào khung: "minh hoạ", "hình mẫu", "Ngày mẫu A", "Trang thuộc bước sau", "Logo mở đầu".
- Hai chỗ vỡ bố cục, vài bảng tràn mép phải, vài khối chính rỗng.

Điểm tổ chấm từng màn: 4 đến 6 trên 10. Lượt này đưa mọi màn A lên mức một app iPhone tài chính cao cấp.

---

## 0. Cho thread PC (người chạy script)

- Như `giao-T5.md` mục 0. Worktree `thp-app10`, nhánh máy `codex/app-1.0`. Kéo `origin/claude/project-thread-avd7td` về trước (fast-forward), đẩy fast-forward lên lại. Mọi commit kết thúc bằng ` [skip ci]`. Không chờ CI.
- **Hai bước Codex:** `T6a` → `T6b` (mục 3).
- Sau mỗi bước: máy kiểm mục 4, commit, đẩy. Đỏ: một vòng sửa, tối đa 3 vòng. Vẫn đỏ: dừng, báo điều phối.
- Hạn mức, lệnh cấm, Telegram: như lượt trước.
- Chỉ sửa trong `thiet-ke/`: `index.html`, `ghi-chu.md`, và `noi-dung.md` nếu cần. Không sửa `soi-T5.md`, `giao-T5.md`, `giao-T6.md`.
- Xong T6b: báo điều phối kèm commit cuối. Tổ app kiểm bằng mắt một lần và đăng bản mới.

---

## 1. Sửa trước: hai chỗ vỡ bố cục

1. **Hôm nay, thẻ "Vận đơn hôm nay":** nhãn "24" của vòng đè lên chữ "90 đã xác nhận" (đọc thành "2490"); vòng có số 90 ba chỗ. Vẽ lại: vòng 64 điểm, ba đoạn có khe hở (đã xác nhận / còn chờ / không xác nhận được), số giữa vòng, chú thích 3 dòng có chấm màu bên phải. Không đặt nhãn số sát mép vòng.
2. **Chi tiết nhân viên, khối "Trạng thái đơn chia":** chữ "Đã chốt" xếp dọc từng chữ cái, số và thanh tràn khỏi thẻ. Vẽ lại thành một hàng: tên bên trái, "12 / 30 đơn" bên phải, thanh 6–8 điểm bên dưới, tất cả nằm trong lề thẻ.

---

## 2. Luật chung cho mọi màn `A-*` (sáng và tối)

**2.1. Không còn điều khiển kiểu web.** Trong màn A không được có `<select>`, `<details>`, `<summary>`, `<input type="range">`, nút chữ "← Về ...", ô ngày "mm/dd/yyyy". Thay bằng kiểu iOS:
- Chọn một trong 2–4 giá trị: **segmented control** (viên bo tròn, mục đang chọn nổi lên).
- Bộ lọc nhiều mục: **một viên lọc** ("Tháng này · Mọi POS ⌄") mở tấm dưới đáy. Trong tấm: mỗi mục là một hàng, tên bên trái, giá trị đang chọn và dấu › bên phải; mục đang chọn có dấu ✓ màu thương hiệu.
- Ngày: hàng "Từ ngày  18/10/2026 ›"; khi mở thì vẽ lịch tháng kiểu iOS (ngày chọn là vòng tròn đặc màu thương hiệu).
- Nội dung phụ ("Tính riêng, ...", "Cách tính", "Nguồn") là **nút (i)** cạnh tiêu đề. Cần cho xem nội dung thì vẽ thêm một khung trạng thái có tấm nhỏ mở sẵn.
- Xem điểm trên biểu đồ: đường dọc mảnh, chấm sáng trên điểm chọn, nhãn nổi nhỏ phía trên. Không có thanh trượt.
- Quay lại: thanh điều hướng kiểu iOS, góc trái "‹ Tên màn trước".
- Nút đóng tấm: chữ "Xong" hoặc "Huỷ" ở góc trên của tấm, không vẽ thành hàng danh sách có ›.

**2.2. Mỗi số chỉ xuất hiện một lần trong một thẻ.**
- Biểu đồ đã có nhãn số thì bỏ dòng chú thích liệt kê lại ("12 / 18 / 15 ...", "3 / 6 / 3 / 6", "NV MKT A 18 · NV MKT B 12").
- Bỏ hàng danh sách lặp số đã có ở ô số hoặc biểu đồ.
- Một số nằm ở cả khối chính lẫn ô số: giữ ở khối chính.

**2.3. Mỗi thẻ có một hình.** Mỗi thẻ có ba lớp: một số lớn (kèm viên chênh lệch khi có kỳ trước), một hình (đường vùng, cặp thanh, cột, vòng chia đoạn, phễu bậc, thanh chia đoạn), và nếu cần thì ô số 2×2.
- Danh sách khoá–giá trị chỉ còn cho chi tiết thật sự phụ: tối đa 4 hàng.
- Giá trị ghép bằng dấu "/" ("60 / 6,0", "180 / 9,00 tr ₫") thì tách thành hai ô số có tên riêng.
- Dòng chảy đơn (tạo → xác nhận → giao → nhận) vẽ thành **phễu bậc mảnh**.
- Tỷ trọng (Tự upsell / Từ MKT, DT mới / DT CSKH) vẽ thành **một thanh chia đoạn 8 điểm**, có nhãn dưới từng đoạn.

**2.4. Bảng vừa khung 342 điểm.** Không chữ nào bị cắt ở mép.
- Cách 1: cột đầu hẹp, ô hai dòng (số đơn ở trên, tiền nhỏ mờ ở dưới).
- Cách 2: bảng cuộn ngang, cột đầu dính, mép phải mờ dần để báo còn cột.
- Đủ các cột mà `noi-dung.md` ghi (ví dụ "% hoàn").

**2.5. Không khối rỗng, không khoảng trống thừa.**
- Khối chính phải có số và hình: chuông Thông báo cần số chưa đọc và vòng chia theo loại; Phòng ban cần số của từng phòng; Xếp hạng Marketing cần bảng xếp hạng có thanh hoặc bục 2 bậc.
- Không chừa khoảng trống quá 48 điểm trong thẻ. Thẻ co theo nội dung.
- Không vẽ hai trang (ví dụ Tổng quan POS và Số liệu theo kỳ) có khối chính giống hệt nhau. Mỗi trang vẽ đúng chủ đề của nó.

**2.6. Chữ trong khung là chữ của app thật.**
- Bỏ mọi chữ "minh hoạ", "hình mẫu", "mẫu", "Ngày mẫu", "Trang thuộc bước sau", "Logo mở đầu", "Kéo để làm mới trong app", và ghi chú thiết kế ("Giữ phạm vi đang chọn, không thay số bằng 0", ...).
- Trang trưng bày đã ghi một lần ở đầu: "Mọi số và tên là minh hoạ". Ghi chú cho người xem hình chỉ đặt ở dòng "đổi gì" **ngoài khung điện thoại**, và dòng đó cũng không dùng chữ "minh hoạ".
- Tên người: dùng tên Việt phổ biến tự đặt như `../thiet-ke-lai.md` mục 4 cho phép (Lê Thu Hà, Trần Minh Đức, ...), có ảnh chữ cái đầu. Không dùng "NV A", "NV MKT A". POS giữ "POS A/B/C".
- Ngày viết như thật: "18/10", "Thứ Bảy 18/10".
- Không viết "Kỳ trước" hoa giữa câu; thống nhất "so kỳ trước", "so cùng giờ hôm qua".

**2.7. Thống nhất hình khối.**
- Mọi thẻ bo 20–24 điểm. Bỏ thẻ góc vuông có sọc màu bên trái.
- Màu bộ phận giữ một màu ở mọi màn: Sale cam, CSKH xanh ngọc, Marketing hồng, Vận đơn vàng, Nhân sự tím. Ví dụ không được để CSKH lúc xanh ngọc, lúc xanh thương hiệu.
- Một kiểu hàng danh sách: biểu tượng trong ô bo 30 điểm có màu nhạt, tên, giá trị, dấu ›. Màn Thêm cũng có biểu tượng cho mọi hàng.
- Nút chính: nền màu thương hiệu đặc, chữ trắng, cao 50 điểm, ở cả sáng và tối. Không để nút chính tối trên nền tối.

**2.8. Chế độ sáng.**
- Cột và thanh dùng màu đậm của bộ phận, độ tương phản với nền thẻ ít nhất 3:1. Không để cột xanh bạc hà nhạt mờ mất chân.
- Màu chuyển dưới đường vùng đi từ màu bộ phận khoảng 25% về 0. Không phủ xám.

**2.9. Marketing: lỗi 1.4 của T5 chưa sửa.** Vùng dưới đường "Doanh thu MKT" vẫn là mảng xám. Sửa:
- Vùng chuyển màu từ hồng 35% (tối) hoặc 25% (sáng) về 0.
- Kỳ trước vẽ nét đứt mờ.
- Điểm cuối có chấm và nhãn có đơn vị.
- Viên chênh lệch đặt cạnh số lớn.

**2.10. Đăng nhập, xác minh, khoá, quét mã.**
- Không có nút về Trang chủ khi chưa đăng nhập.
- Tiêu đề không giãn chữ, không ngắt dòng xấu.
- Nút chính của tấm xác nhận phải nằm trong màn đầu.

**2.11. Dòng "đổi gì" dưới mỗi màn:** viết riêng cho từng màn, nói đúng cái màn đó đổi. Không chép một câu cho nhiều màn.

**2.12. Không đụng hướng B.** Như `giao-T5.md` mục 2.7. Máy kiểm so với `4d98cc5`.

**2.13. Lỗi nhỏ ở `soi-T5.md`:** sửa luôn khi đang sửa màn đó.

---

## 3. Các bước Codex

Với mỗi màn, làm theo thứ tự:
1. Đọc mục của màn đó trong `soi-T5.md`.
2. Sửa hết lỗi HỎNG và CHÍNH, rồi lỗi nhỏ.
3. Rà lại luật mục 2.
4. Sửa cả bản sáng lẫn bản tối.

Bước:
- **T6a:** mục 1 (hai chỗ vỡ). Rồi các màn `A-hom-nay`, `A-dang-nhap`, `A-tong-quan`, `A-tong-quan-so-lieu`, `A-tong-quan-pos`, `A-don-hang`, `A-chi-tiet-don`, `A-phong-ban`, `A-sale`, `A-nhan-vien-bang`. Cộng phần dùng chung: CSS cho segmented control, viên lọc, tấm dưới đáy, hàng có biểu tượng, phễu bậc, thanh chia đoạn, lịch tháng.
- **T6b:** các màn `A-chi-tiet-nhan-vien`, `A-cskh`, `A-marketing`, `A-van-don`, `A-thong-bao`, `A-them`, `A-trang-phu`, `A-nhan-su`, `A-bo-loc-trang-thai`. Rồi cập nhật Hệ thiết kế A (thêm các thành phần mới), và `ghi-chu.md` (thêm mục "T6: đã sửa gì", liệt kê theo màn).

---

## 4. Máy kiểm sau mỗi bước

Lưu đoạn dưới thành `~/codex-viec/app-10/kiem-t6.sh`. Gọi `bash ~/codex-viec/app-10/kiem-t6.sh "$BU"` từ gốc worktree, với `$BU` là `T6a` hoặc `T6b`.
- Đoạn này chạy lại `kiem-t5.sh T5b` trước. Script đó gồm máy kiểm T4, kiểm B không đổi, kiểm chữ kỹ thuật và kiểm thanh tab ở Đăng nhập.
- Đạt là mã thoát 0 và không in gì.

```bash
BUOC="${1:?T6a|T6b}"
bash ~/codex-viec/app-10/kiem-t5.sh T5b || exit 1
D=docs/plans/2026-10-18-app-1.0/thiet-ke
F=$D/index.html
loi() { echo "::error::$1"; exit 1; }
khoi() { awk -v p="<section data-man=\"$1" 'index($0,p){on=1} on{print} on&&/<\/section>/{on=0}'; }
G6=$(git log --format=%H -n1 --fixed-strings --grep='App iPhone 1.0.0: lời giao T6')
[ -n "$G6" ] || loi "không thấy commit lời giao T6"
for g in soi-T5.md giao-T5.md giao-T6.md; do
  git diff --quiet "$G6" -- "$D/$g" || loi "không được sửa $g"
done
M1="A-hom-nay A-dang-nhap A-tong-quan A-tong-quan-so-lieu A-tong-quan-pos A-don-hang A-chi-tiet-don A-phong-ban A-sale A-nhan-vien-bang"
M2="A-chi-tiet-nhan-vien A-cskh A-marketing A-van-don A-thong-bao A-them A-trang-phu A-nhan-su A-bo-loc-trang-thai"
[ "$BUOC" = "T6a" ] && MAN="$M1" || MAN="$M1 $M2"
for m in $MAN; do
  k=$(khoi "$m\"" < "$F")
  printf '%s' "$k" | grep -qiE '<(select|details|summary)\b|type="range"|type="date"' && loi "màn $m còn điều khiển kiểu web (select, details, range, date)"
  chu=$(printf '%s' "$k" | sed -E 's/<[^>]*>/ /g')
  for w in 'minh hoạ' 'minh họa' 'Minh hoạ' 'hình mẫu' 'Hình mẫu' 'Ngày mẫu' 'iPhone mẫu' '← Về' 'Logo mở đầu' 'bước sau' 'mm/dd' 'NV A' 'NV B' 'NV MKT A'; do
    printf '%s' "$chu" | grep -qF -- "$w" && loi "màn $m còn chữ: $w"
  done
done
[ "$BUOC" != "T6b" ] || grep -q 'T6' "$D/ghi-chu.md" || loi "ghi-chu.md chưa có mục T6"
exit 0
```
