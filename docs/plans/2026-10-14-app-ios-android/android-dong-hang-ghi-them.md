# Ghi thêm cho Android Phần A: cột "Đang đóng hàng" thay "Đã XN kho" (web PR #79)

Tổ app viết, 16/10/2026. File này nằm trên nhánh iOS (`claude/project-thread-avd7td`), cùng thư mục với `dong-hang-giao.md`. Không sửa `android-pc-giao.md` trong worktree Android: máy kiểm phạm vi sẽ báo sai.

Script trên PC lấy file này bằng `git show origin/claude/project-thread-avd7td:docs/plans/2026-10-14-app-ios-android/android-dong-hang-ghi-them.md`, rồi nối vào lời giao:
- đoạn "Chung": nối cho mọi bước, từ A2b trở đi;
- đoạn của từng bước: chỉ nối cho đúng bước đó.

## Chung (cuối Phần 2)

> **Cột kho đã đổi trên web thật (PR #79, `origin/main` `1f6cde5`).**
> - Mọi chỗ plan.md nói "Đã XN kho", `whConfirmed`, `whRate`, `wh=1`, `selfConfirmed`, `unknownConfirmer`, `warehouseConfirmed`, `otherUnconfirmed`, `backToWaiting` hay chữ "(không tính)" của cột kho (các mục 4.2.1, 4.3, 4.4.2, 4.4.4, 4.4.6, 4.5.5 đoạn `3-xn-kho`, 5.3 A2b, A6, 6.1): **thay bằng cột "Đang đóng hàng"**.
> - Làm theo lời giao iOS `docs/plans/2026-10-14-app-ios-android/dong-hang-giao.md`, đọc bằng `git show origin/claude/project-thread-avd7td:<đường dẫn>`. Lấy các mục: "Hợp đồng API", mục 2 (ô, bảng giải thích, danh sách), mục 3 (chữ, nguyên văn), mục 5 (log), mục 6 (ca Tháng này và đối chiếu API). Đổi tên file iOS sang file Android tương ứng.
> - Mã web: `git show origin/main:app/api/reports/product-groups/route.ts`, `git show origin/main:app/product-group-blocks.tsx`, `git show origin/main:lib/van-don.ts`.
> - Mã iOS trên `origin/claude/project-thread-avd7td`:
>   - `StaffAPI.swift` đã có `packedRate`: làm theo đúng hình dạng đó.
>   - Chưa có `packedRate` (Codex iOS chưa xong lượt đổi cột): làm theo lời giao, không chép phần kho cũ của iOS.
> - Bốn trường mới (`packed`, `packedRate`, `confirmedNotPacked`, `cancelledBeforePack`) đều có thể thiếu.
>   - `org.json` thiếu thì `null`.
>   - Ô hiện `—`, không liên kết.
>   - Bảng giải thích bỏ dòng thiếu.
> - Không dòng "Khác". App không tự cộng trừ.
> - Bản demo đang chạy mã `main` `1f6cde5` (đã có bốn trường).

## A2b (Phần 3)

> - `Models.kt`:
>   - `StaffRow`, `StaffSum` có `packed`, `packedRate`, `confirmedNotPacked`, `cancelledBeforePack` (đều nullable) và `waiting`;
>   - không có các trường kho cũ;
>   - định nghĩa có `packed`;
>   - đường dẫn danh sách đơn của cột dùng `&packed=1`.
> - `ModelsTest.kt`:
>   - JSON số giả có bốn trường, mỗi trường một giá trị khác nhau, ví dụ `"packed":10,"confirmedNotPacked":1,"cancelledBeforePack":0,"packedRate":null,"waiting":1`;
>   - một JSON không có bốn trường, phải đọc được ra `null`;
>   - kiểm đường dẫn có `&packed=1`, không có `&wh=1`.

## A6 (Phần 3)

> - Cột, bảng giải thích, danh sách đơn: theo lời giao iOS mục 2 và 3. Chữ nguyên văn.
> - Lượt `xnkho`:
>   - như I3, thêm ca Tháng này như lời giao iOS mục 6 (mốc `dh-thang-nay`, `dh-thang-nay-giai-thich`, `dh-thang-nay-ds`);
>   - log `[XNK] dong=… dh=<packed>/<closed> tldh=<packedRate>`, `[XNK] ds dh=1|0 don=… du=co|khong`;
>   - `[XNKQ] path=<đường dẫn bảng>` sau mỗi lần bảng tải.
> - `android-preview.yml`, đoạn `3-xn-kho` (giữ tên đoạn):
>   - đối chiếu API, ghi `3-dong-hang-api.txt`;
>   - hai lệnh kiểm như lời giao iOS mục 6: có `ds dh=1 … du=co`; ở Tháng này có ít nhất một dòng `dh=` nhỏ hơn đơn chốt.
>   - Lỗi in `::error::3-xn-kho: <lý do, số đếm>`.

## A8a (Phần 3)

> - Dòng `[TEAM] dong=…` dùng `dh=<packed>/<closed>` (cùng dạng iOS mục 5), không dùng `xn=`.
