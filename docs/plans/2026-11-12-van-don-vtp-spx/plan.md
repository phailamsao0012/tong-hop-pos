# Vận đơn: đếm đơn Viettel Post (VTP) và Shopee Express (SPX) (anh Vũ 12/11/2026)

Yêu cầu (nguyên văn): "phần vận đơn còn, tôi muốn xem được là đơn có thẻ viettel post (vtp) và đơn shopee express (spx) là bao nhiêu".

**Trạng thái: đang lên plan, chưa chốt, chưa code.** Người làm: Claude.

## Dữ liệu thật (chỉ đọc, DB PC, đơn tạo 30 ngày qua tính tới 12/11)

Có 2 nguồn khác nhau:

1. **Thẻ (tag) người dùng gắn trên Pancake** (`tags_json`): có thẻ tên đúng "VTP" và "SPX".

   | POS | VTP | SPX |
   |---|---|---|
   | Bio Nano | 751 | 485 |
   | Siêu Võ Gạo | 588 | 719 |
   | Oxytetra | 195 | 316 |
   | **Tổng** | **1.534** | **1.520** |

2. **Đơn vị vận chuyển thật trên đơn** (`raw_json.partner`), tính trên đơn đã gửi trở đi:

   | POS | VTP | SPX Express | J&T | GHN |
   |---|---|---|---|---|
   | Siêu Võ Gạo | 6.670 | 1.374 | 1.257 | 16 |
   | Bio Nano | 3.122 | 2.603 | | |
   | Oxytetra | 2.131 | 452 | | |
   | Thủy sản | 3 | | | |
   | **Tổng** | **11.926** | **4.429** | **1.257** | **16** |

Thẻ chỉ có trên một phần đơn (khoảng 3 nghìn), còn ĐVVC thật có trên mọi đơn đã gửi (khoảng 17,6 nghìn).

## Đề xuất (chờ anh chọn nguồn)

- **(A)** Đếm theo **thẻ** VTP / SPX, đúng chữ anh nói "đơn có thẻ".
- **(B)** Đếm theo **ĐVVC thật** trên đơn. Đầy đủ hơn, có cả J&T, GHN.
- **(C)** Cả hai: bảng theo ĐVVC thật, thêm cột "có thẻ" để thấy đơn gắn thẻ lệch với ĐVVC thật.

Trên trang Vận đơn thêm khối **"Theo đơn vị vận chuyển"** (thu gọn vào dòng tiêu đề như các khối khác):
- Dòng = VTP · SPX · J&T · GHN · Khác/chưa có.
- Cột = Đơn | Đang giao | Đã nhận | Hoàn | Hủy | Tỉ lệ nhận | Tỉ lệ hoàn | Doanh số chuyển đi.
- Theo quy tắc POS và kỳ đang chọn.
- Bấm 1 dòng thì danh sách đơn bên dưới lọc theo ĐVVC đó.
- Giữ nhãn Vận đơn "Doanh số chuyển đi" (có test bảo vệ).

## Cách làm

1. Thêm cột `carrier` vào bảng đơn, lấy từ `raw_json.partner` khi đồng bộ, có chỉ mục `(pos_id, carrier, …)`. Chạy một lần điền lại cho đơn cũ trên PC (sao lưu DB trước). Nếu chọn A/C thì thêm cờ thẻ `tag_vtp` / `tag_spx`.
2. `lib/reports/van-don-report.ts`: thêm nhóm theo `carrier` (và thẻ) vào câu tính sẵn có.
3. UI `app/van-don-view.tsx`: khối mới + lọc theo ĐVVC.
4. Test chuẩn hoá tên ĐVVC: "SPX Express" → SPX, "Viettel Post" / "VTP" → VTP.
5. Kiểm số trên DB thật khớp bảng trên. typecheck, test, build:pc. Gom vào đợt khởi động lại PC.
