# Kết quả chạy liền một mạch: API cho app 15/10

Codex làm từng bước, máy kiểm sau mỗi bước. Tổ web tổng kiểm một lần sau khi đọc file này và diff.

## Tiến độ
```
15/10 05:36Z Bắt đầu ở ~/Projects/thp-api1510, nhánh codex/api-app-1510, gốc 4b61d65, tài khoản đầu codex.
15/10 05:36Z Lỗi lint ở gốc: 0.
15/10 05:36Z S1: bắt đầu (Tìm đơn, tìm khách: thoát LIKE, mã đơn theo khoá chính, SĐT nhiều dạng, nhật ký tìm).
15/10 05:36Z s1: codex hết lượt, đổi tài khoản
15/10 05:44Z S1: máy kiểm báo lỗi, giao lại vòng 1.
15/10 05:46Z S1: máy kiểm báo lỗi, giao lại vòng 2.
15/10 05:50Z S1: máy kiểm báo lỗi, giao lại vòng 3.
15/10 05:51Z DỪNG ở s1: Hết 3 vòng sửa mà máy kiểm vẫn báo lỗi (xem ~/codex-viec/api-1510/s1-loi-vong4.txt).
```

## Cảnh báo cho tổ soát
```
S1: lệnh lạ: /bin/zsh -lc "ls ~/Projects/tong-hop-pos/node_modules/.pnpm | rg '"'^(tsx|vinext|oxlint|typescript|vite@)'"' && pnpm install --offline --frozen-
S1: lệnh lạ: /bin/zsh -lc "ls ~/Projects/tong-hop-pos/node_modules/.pnpm | rg '"'^(tsx|vinext|oxlint|typescript|vite@)'"' && pnpm install --offline --frozen-
```

---

## Tóm tắt S1

### File đã đổi

Vòng này không sửa thêm file. Giữ nguyên 7 file S1 từ lần trước:

- `lib/search-query.ts`
- `lib/audit.ts`
- `app/api/raw/orders/route.ts`
- `app/api/reports/customers/route.ts`
- `lib/demo/mode.ts`
- `lib/demo/world.ts`
- `tests/search-query.test.ts`

### Lệnh đã chạy và kết quả (mã thoát từng lệnh)

| Lệnh | Mã thoát | Kết quả |
|---|---:|---|
| `pnpm typecheck` | 0 | Qua |
| `pnpm build` | 0 | Qua |
| `pnpm -s typecheck` | 2 | `unexpected argument '-s' found` |
| `pnpm -s build` | 2 | Cùng lỗi `-s` |
| `pnpm test` | 1 | Sandbox chặn socket IPC của tsx: `EPERM` |
| `node --import tsx --import ./tests/support/register.mjs --test tests/*.test.ts` | 0 | 184/184 test qua |
| `pnpm lint` | 1 | 1.158 lỗi, giống HEAD; không thêm lỗi |
| `pnpm lint` trên bản HEAD trong thư mục tạm | 1 | 1.158 lỗi |
| `git diff --check HEAD` | 0 | Qua |

### Test mới (tên test, ca nào)

Giữ nguyên 11 test S1 từ lần trước; tất cả đều qua:

- `escapeLike`: `%`, `_`, `\` chỉ khớp ký tự nguyên văn.
- `phoneVariants`: các dạng SĐT cho cùng ba biến thể.
- `orderKeys`: bỏ `#`, tạo khóa theo POS, loại ký tự không hợp lệ.
- `maskSearchTerm`: che SĐT và tên.
- `classifyApi`: GET có `q` thành `search`; `q` rỗng không thành `search`.
- `nhật ký search`: lưu loại và từ khóa đã che.
- `tìm đơn`: các dạng SĐT cùng kết quả, giữ lọc ngày.
- `tìm mã đơn`: dùng `id IN`, giữ tìm đuôi SĐT.
- `tìm tên và ký tự đặc biệt`: kiểm hai route và hai chế độ khách.
- `EXPLAIN local`: dùng khóa chính hoặc chỉ mục SĐT.
- `demo`: có đơn tháng trước và đơn Mới để thử tìm.

### Chỗ làm khác plan và lý do

Hai lỗi máy kiểm xuất phát từ `pnpm -s` trong `chay-lien-mach.sh` dòng 105 và 107. Bản pnpm trên máy không nhận `-s`; chạy đúng `pnpm typecheck` và `pnpm build` đều qua.

Không sửa script vì file này ngoài danh sách S1 được phép sửa trong CODEX.md mục 3. Chạy test trực tiếp bằng Node để tránh socket IPC bị sandbox chặn.

### Câu hỏi còn lại

Không có câu hỏi nghiệp vụ. Tổ chạy cần bỏ `-s` trong script kiểm để xử lý lỗi đã xác định. Chưa commit hoặc push.