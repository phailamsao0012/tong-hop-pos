# Bấm biểu đồ mini: sửa 2 góp ý QA (14/10/2026)

Bối cảnh: commit 2539e26 đã có tính năng bấm ô mini cột So cùng kỳ (SaleGroupBlock, app/product-group-blocks.tsx) thì khung CompareStrip hiện riêng người đó, nút "Xem cả đội". QA đạt, còn 2 góp ý. Không đổi số, API, chữ hiển thị.

## S1. Cuộn lên khung so không bị thanh trên che

- Hiện tại: onClick của nút bọc CompareCell gọi `stripRef.current?.scrollIntoView({behavior:'smooth', block:'nearest'})`; div bọc có class `scroll-mt-24` nhưng QA đo đỉnh khung nằm ở 0px, bị `header.topbar` (sticky, cao 56px, 52px khi ≤900px; app/globals.css dòng ~558) che; `scroll-mt-24` không có tác dụng.
- Làm: tìm phần tử cuộn thật của trang (window hay thẻ cha nào có overflow, xem app/dashboard.tsx quanh `<header className="topbar">` và `<main>`). Cuộn sao cho đỉnh khung nằm ngay dưới đáy thanh trên + 8px: lấy đáy thanh bằng `document.querySelector('header.topbar')?.getBoundingClientRect().bottom ?? 0`, rồi scrollTo/scrollBy phần tử cuộn đó với behavior 'smooth'. Chỉ cuộn khi đỉnh khung đang bị che hoặc nằm ngoài màn hình (khung đã thấy rõ thì không cuộn). Bỏ class `scroll-mt-24` nếu không còn dùng.
- Xong khi: máy tính 1440px và điện thoại 390px, bấm ô mini ở dòng thứ 5 trở xuống thì sau khi cuộn, đỉnh khung So cùng kỳ nằm trong khoảng [đáy thanh trên, đáy thanh trên + 16px]; nút "Xem cả đội" thấy trọn.

## S2. Đổi phạm vi nhân viên thì bỏ người đang xem riêng nếu người đó không còn trong phạm vi

- Lỗi: ở CSKH đang xem riêng người X trong khung so, chọn "Xem riêng nhân viên" người Y thì khung về cả đội (đúng), nhưng bấm "Xem tất cả" thì khung lại tự quay về X vì cmpId vẫn giữ X.
- Làm: trong SaleGroupBlock, khi danh sách staffIds (focusId hoặc picked) đổi, nếu cmpId không còn thuộc phạm vi mới (staffIds khác rỗng và không chứa cmpId) thì đặt cmpId = null. KHÔNG dùng useEffect gọi setState (oxlint react-compiler EffectSetState sẽ báo lỗi mới). Dùng mẫu "chỉnh state khi prop đổi ngay lúc render" của React: lưu khoá phạm vi trước, ví dụ:

  ```ts
  const scope = staffIds.join(',');
  const [cmpScope, setCmpScope] = useState(scope);
  if (scope !== cmpScope) {
    setCmpScope(scope);
    if (cmpId && staffIds.length && !staffIds.includes(cmpId)) setCmpId(null);
  }
  ```

  Đổi kỳ ngày thì vẫn giữ người đang xem (như cũ).
- Xong khi: CSKH: xem riêng X ở khung → chọn xem riêng nhân viên Y → bấm Xem tất cả: khung là cả đội, ô X không còn viền xanh. Sale: tương tự với bộ chọn nhân viên.

## Kiểm chung

- `pnpm typecheck`, `pnpm test`, `pnpm build` đều qua.
- `pnpm lint` không thêm lỗi mới so với 2539e26 ở 2 file đã sửa (so bằng `oxlint -c .oxlintrc.json` bản cũ và bản mới, đếm theo tên luật).
- Chỉ chạy oxfmt trên file đã sửa (KHÔNG chạy `pnpm format` cả repo).

## Rủi ro / quay lại

- Chỉ đụng giao diện phía trình duyệt, không đổi số liệu hay API. Quay lại: revert commit.
