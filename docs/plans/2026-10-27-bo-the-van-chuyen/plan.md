# Bỏ thẻ đơn vị vận chuyển (VTP, SPX) khỏi thẻ dòng sản phẩm

## 1. Mục tiêu
Anh Vũ 27/10/2026: "bỏ thẻ vtp và spx đi, đây là 2 đơn vị vận chuyển mà". Ở khối nhóm sản phẩm trang Tổng quan Sale/CSKH (chế độ "Theo nhãn đơn"), đang hiện thẻ riêng "VTP" và "SPX" (doanh thu, Đơn chốt, Số chia, Tỷ lệ chốt, GTTB). Đây là nhãn đơn vị vận chuyển trên Pancake, không phải dòng sản phẩm, nên không được thành thẻ riêng ở bất kỳ báo cáo "theo nhãn" nào.

## 2. Không được đổi
- Không đổi số tổng: đơn chỉ mang VTP/SPX vẫn được đếm, chỉ rơi vào nhóm "Chưa gắn thẻ" như đơn không có nhãn sản phẩm.
- Không đổi route, quyền, schema, migration. Không đụng nhánh demo `claude/project-thread-3ujeoc` (anh 27/10: không lên demo nữa).
- Nhãn có chữ VTP/SPX nhưng là tên khác (vd "SPX SHOP") vẫn giữ.

## 3. Hiện trạng
- `lib/product-groups.ts:9` hằng `OPERATIONAL_TAG`: regex các nhãn vận hành bị loại khỏi `productTags()` (`lib/product-groups.ts:12`).
- `productTags()` dùng ở `groupsOf()` (`lib/product-groups.ts:55`, chế độ `tag`), `app/api/reports/product-groups/route.ts:232` (danh sách thẻ), `lib/repurchase-report.ts`, `lib/shipping-lines.ts`, `lib/staff-detail.ts`. Sửa một chỗ là đủ.

## 4. Thiết kế
Thêm vào đầu regex `OPERATIONAL_TAG` một nhánh khớp TRỌN tên nhãn (đã trim, không phân biệt hoa thường) là đơn vị vận chuyển:
`^(vtp|spx|ghtk|ghn|j&t|jt|vnpost|viettel ?post|shopee ?express|ninja ?van|best ?express)$|`
Thêm một dòng chú thích ngay trên hằng: lý do và ngày (anh Vũ 27/10/2026).

## 5. Các bước (một PR)
- Nhánh: `codex/bo-the-van-chuyen-2710` (tách từ `main`).
- File sửa: `lib/product-groups.ts`; file mới `tests/product-tags.test.ts`.
- Tiêu chí xong: test mới và test cũ liên quan qua; typecheck qua.
- Cách kiểm: `pnpm exec tsx --import ./tests/support/register.mjs --test tests/product-tags.test.ts tests/repurchase*.test.ts tests/shipping*.test.ts tests/staff-detail*.test.ts`, rồi `pnpm test` và `pnpm exec tsc --noEmit`.

## 6. Kiểm thử
Test mới `tests/product-tags.test.ts` (dùng `void test(...)` như các test khác):
- `productTags('[{"name":"VTP"},{"name":"spx"},{"name":"GENTADOX"},{"name":"Chưa đối soát"},{"name":"SPX SHOP"}]')` trả `['GENTADOX','SPX SHOP']`.
- `groupsOf('[{"name":"VTP"}]', [], 'tag', 'tag')` bằng `groupsOf('[]', [], 'tag', 'tag')` (tức `['Chưa gắn thẻ']`).
Ảnh: chụp khối nhóm sản phẩm trang Tổng quan Sale ở chế độ "Theo nhãn đơn" trước và sau (chạy cục bộ, dữ liệu demo cục bộ có gắn thêm nhãn VTP/SPX vào vài đơn). Không chụp web thật.

## 7. Rủi ro
- Regex nhánh mới phải neo `^...$` để không nuốt nhãn sản phẩm chứa chữ "jt", "ghn"…
- Lùi lại: revert một commit.
