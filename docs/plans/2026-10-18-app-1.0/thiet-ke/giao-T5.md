# App iPhone 1.0.0: T5, làm đẹp hướng A (hình mẫu)

Tổ app viết, 18/10/2026, sau khi xem bằng mắt bản T4 (`4d98cc5`). Vẫn **chỉ vẽ hình mẫu**, không sửa code app.
File này: `docs/plans/2026-10-18-app-1.0/thiet-ke/giao-T5.md`. Đọc trước: `../thiet-ke-lai.md` (mọi luật ở mục 3, 4, 8 vẫn giữ), `noi-dung.md`, Hệ thiết kế A trong `index.html` (cùng thư mục này).

Hướng A (Quỹ đạo) được tổ chọn để làm tiếp (người dùng đang xem; nếu họ chọn B, tổ sẽ giao lượt khác).
Bản T4 đi đúng hướng nhưng **còn thô**, chưa đạt "đột phá". Lượt này sửa những chỗ dưới, chỉ ở các màn `A-*`.

---

## 0. Cho thread PC (người chạy script)

- Như `thiet-ke-lai.md` mục 0. Worktree `thp-app10`, nhánh máy `codex/app-1.0`. Kéo `origin/claude/project-thread-avd7td` về trước (fast-forward), đẩy fast-forward lên lại. Mọi commit kết thúc bằng ` [skip ci]`. Không chờ CI.
- **Hai bước Codex:** `T5a` → `T5b` (mục 3).
- Sau mỗi bước: máy kiểm mục 4, commit, đẩy. Đỏ: một vòng sửa, tối đa 3 vòng. Vẫn đỏ: dừng, báo điều phối.
- Hạn mức, lệnh cấm, Telegram: như lượt trước.
- Máy kiểm cũ vẫn chặn sửa file ngoài `thiet-ke/`: lượt này cũng chỉ sửa `index.html`, `ghi-chu.md` (và `noi-dung.md` nếu cần).
- Xong T5b: báo điều phối kèm commit cuối. Tổ app kiểm bằng mắt và đăng bản mới cho người dùng.

---

## 1. Chỗ còn thô (tổ thấy khi chụp màn, sáng và tối)

1. **Khối so kỳ bằng hai thanh ngang to, phẳng** (kỳ trước / kỳ này) ở Doanh thu Sale, Tỷ lệ chốt nhân viên, Vận đơn, CSKH, Marketing trong Tổng quan. Nhìn như khối màu đặt tạm, không phải biểu đồ.
2. **Cột vuông to, phẳng:** Xếp hạng Marketing (2 ô vuông), Theo POS ở Báo cáo tháng, Diễn biến Marketing.
3. **Hôm nay:** số "126 tr ₫" và dòng "120 đơn chốt · 3 POS" đè lên nét cung.
4. **Đường vùng Marketing** là một mảng xám phẳng, không có điểm, không phát sáng.
5. **Vòng "Mua lại & data"** chỉ là vòng rỗng.
6. **Danh sách khóa–giá trị dài** chiếm phần lớn mỗi màn (Hiệu suất, Hiệu quả quảng cáo, Luồng vận chuyển, Số liệu theo kỳ, NV MKT chi tiết). Nhìn vẫn như bảng tính.
7. **Màn đăng nhập, xác minh, khoá, quét mã có thanh 5 tab dưới đáy.** Chưa đăng nhập thì không có tab.
8. **Chữ thừa trong khung:** nhãn "MEGATECH · Số minh hoạ" trên mọi tiêu đề; khẩu hiệu "Nhìn rõ hôm nay. Quyết định vững vàng.", "Mỗi phòng. Một quỹ đạo.".
9. **Chữ kỹ thuật lọt ra màn:** "Nguồn dự phòng sections", "sentBasis=sent", "Shift.hourly", "bucket", "fallback", "staffTotal", "rowsTotal", "Me.canView", "hrBadge", "shownRate", "rateFrac", "T2a mới vẽ bảng".

---

## 2. Cách sửa (chỉ màn `A-*`, sáng và tối)

**2.1. Biểu đồ: mảnh, sáng, có nhãn.**
- So kỳ có chuỗi theo ngày (tên trường trong `noi-dung.md`): vẽ **đường vùng**.
  - Kỳ này: nét 2,5 điểm màu bộ phận, phát sáng nhẹ (`filter: drop-shadow`), vùng dưới chuyển màu từ 35% về 0.
  - Kỳ trước: nét đứt mờ.
  - Điểm cuối có chấm tròn và nhãn số.
- So kỳ chỉ có hai số tổng: một **viên chênh lệch** (↗ +20%) cạnh số lớn, cộng một **cặp thanh mảnh** (dày tối đa 8 điểm, bo tròn, nhãn số ở đầu thanh). Không vẽ khối màu dày.
- Cột: rộng tối đa 14 điểm, bo đầu tròn, màu chuyển từ màu bộ phận về trong suốt, nhãn số trên đầu cột, nhãn tên dưới chân. Không có ô vuông to.
- Vòng: chia đoạn có màu và nhãn, khoảng hở giữa các đoạn, số ở giữa vòng.
- Thanh ngang xếp hạng: dày 6–8 điểm, nền rãnh mờ, tên và số trên cùng một hàng với thanh.

**2.2. Hôm nay.**
- Số trong lòng cung, khoảng 44 điểm, không chạm nét. Dòng phụ nằm dưới cung, không cắt qua nét. Cung to hơn nếu cần.
- Đầu cung có chấm phát sáng. Thêm viên "so cùng giờ hôm qua" (dữ liệu đã có ở 3 bộ phận; nếu tổng không có số cùng giờ thì bỏ).

**2.3. Bớt danh sách.**
- Danh sách từ 5 dòng trở lên: đưa 2–4 số quan trọng nhất lên thành **ô số** (lưới 2×2, số 22–28 điểm, mỗi ô có thanh tiến độ mảnh hoặc đường nhỏ khi có dữ liệu). Phần còn lại giữ dạng hàng, đường kẻ mờ.
- Mỗi màn tối đa một danh sách thuần trong màn đầu (844 điểm).
- Bảng thật (nhiều cột) giữ dạng bảng.

**2.4. Chiều sâu.**
- Khối chính: quầng `radial-gradient` màu bộ phận ở một góc, viền sáng 1 điểm ở mép trên (giả kính), bóng mềm.
- Thẻ phụ ở chế độ tối: nền chuyển nhẹ từ trên xuống. Ở chế độ sáng: nền trắng ngà, bóng mềm, không viền xám đậm.
- Chế độ sáng phải đẹp ngang chế độ tối: khối chính nền xanh bạc hà chuyển màu, chữ xanh đậm, biểu đồ màu đậm hơn bản tối.

**2.5. Dọn chữ.**
- Bỏ nhãn "MEGATECH · Số minh hoạ" trong khung (trang trưng bày ghi một lần ở đầu trang: "Mọi số và tên là minh hoạ").
- Bỏ khẩu hiệu ở Đăng nhập, Phòng ban. Đăng nhập: logo MEGATECH, một dòng "Đăng nhập để tiếp tục".
- Chữ kỹ thuật ở mục 1.9: viết lại bằng tiếng Việt thường ("mốc", "theo ngày gửi hàng", "theo giờ trong ca"), hoặc bỏ.
- Dòng "đổi gì" dưới mỗi màn viết lại cho đúng bản mới.

**2.6. Đăng nhập, xác minh, khoá, quét mã:** bỏ thanh tab. Nút chính đặt gần đáy, trong vùng dễ chạm.

**2.7. Không đụng hướng B.**
- Không sửa nội dung các `<section data-man="B-...">`.
- CSS mới đặt dưới `[data-huong="A"]`. Hàm vẽ biểu đồ mới đặt tên mới. Không đổi cách chạy của hàm cũ mà B đang dùng.

---

## 3. Các bước Codex

- **T5a:** `A-hom-nay`, `A-dang-nhap`, `A-tong-quan`, `A-tong-quan-so-lieu`, `A-tong-quan-pos`, `A-don-hang`, `A-chi-tiet-don`, `A-phong-ban`, `A-sale`, `A-nhan-vien-bang`. Cộng phần dùng chung (CSS, hàm biểu đồ mới, câu đầu trang trưng bày).
- **T5b:** `A-chi-tiet-nhan-vien`, `A-cskh`, `A-marketing`, `A-van-don`, `A-thong-bao`, `A-them`, `A-trang-phu`, `A-nhan-su`, `A-bo-loc-trang-thai`. Cập nhật Hệ thiết kế A (kiểu biểu đồ mới) và `ghi-chu.md` (thêm mục "T5: đã sửa gì").

---

## 4. Máy kiểm sau mỗi bước

Chạy máy kiểm cũ ở bước đủ màn, rồi đoạn mới. Lưu đoạn mới thành `~/codex-viec/app-10/kiem-t5.sh`, gọi `bash ~/codex-viec/app-10/kiem-t5.sh "$BU"` từ gốc worktree (`$BU` là `T5a` hoặc `T5b`). Đạt là mã thoát 0 và không in gì.

```bash
BUOC="${1:?T5a|T5b}"
bash ~/codex-viec/app-10/kiem-thiet-ke.sh T4 || exit 1
D=docs/plans/2026-10-18-app-1.0/thiet-ke
F=$D/index.html
loi() { echo "::error::$1"; exit 1; }
khoi() { awk -v p="<section data-man=\"$1" 'index($0,p){on=1} on{print} on&&/<\/section>/{on=0}'; }
# không sửa hướng B
diff -q <(git show 4d98cc5:"$F" | khoi B-) <(khoi B- < "$F") >/dev/null || loi "không được sửa màn hướng B"
# chữ kỹ thuật và nhãn thừa không còn trong màn A đã làm
M1="A-hom-nay A-dang-nhap A-tong-quan A-tong-quan-so-lieu A-tong-quan-pos A-don-hang A-chi-tiet-don A-phong-ban A-sale A-nhan-vien-bang"
M2="A-chi-tiet-nhan-vien A-cskh A-marketing A-van-don A-thong-bao A-them A-trang-phu A-nhan-su A-bo-loc-trang-thai"
[ "$BUOC" = "T5a" ] && MAN="$M1" || MAN="$M1 $M2"
for m in $MAN; do
  chu=$(khoi "$m\"" < "$F" | sed -E 's/<[^>]*>/ /g')
  for w in sections sentBasis Shift.hourly bucket Bucket fallback staffTotal rowsTotal canView hrBadge shownRate rateFrac T2a T2b T3a T3b 'Số minh hoạ' 'Một quỹ đạo' 'Quyết định vững vàng'; do
    printf '%s' "$chu" | grep -qF -- "$w" && loi "màn $m còn chữ: $w"
  done
done
# màn đăng nhập không có thanh tab
khoi 'A-dang-nhap"' < "$F" | grep -qE 'class="[^"]*\b(tabs|bottom-nav)\b' && loi "màn A-dang-nhap còn thanh tab"
[ "$BUOC" != "T5b" ] || grep -q 'T5' "$D/ghi-chu.md" || loi "ghi-chu.md chưa có mục T5"
exit 0
```
