# Sửa 4 test làm đỏ bước "Run pnpm test" của Deploy demo (19/10/2026)

Tổ web tổng viết. Ba lượt Deploy demo gần nhất (commit 2fdea22, d11cd79, 3ac1a20) đều đỏ ở bước test, nên trang demo chưa lên bản mới.

## Nguyên nhân (đã đọc log CI)

Bốn test hỏng ở CI, đều cùng một lỗi:

| Test | File | Lỗi |
|---|---|---|
| G8 | `tests/g8-pending.test.ts` | `Command failed: git show fad5bb7:lib/sync.ts` — `fatal: invalid object name 'fad5bb7'` |
| K1 | `tests/k1-writes.test.ts` | như trên |
| K2 | `tests/k2-writes.test.ts` | như trên |
| K3 | `tests/k3-writes.test.ts` | như trên |

Các test này lấy bản code cũ để so số dòng ghi D1: chạy `git show fad5bb7:lib/<file>.ts` rồi chép vào `tests/support/old-write-path*/`.

- Trên máy làm, repo có đủ lịch sử nên chạy được.
- CI checkout nông (`actions/checkout@v4` mặc định chỉ lấy 1 commit), không có commit `fad5bb7`, nên lỗi.

Test không sai, chỉ phụ thuộc lịch sử git.

## Cách sửa

Đưa bản cũ vào repo làm tệp mẫu cố định. Test đọc tệp mẫu thay vì gọi git. Không sửa workflow (`.github/**` cấm).

## Bước

**T1. Tệp mẫu bản cũ thay cho git show trong test G8, K1, K2, K3**

File được sửa: `tests/g8-pending.test.ts`, `tests/k1-writes.test.ts`, `tests/k2-writes.test.ts`, `tests/k3-writes.test.ts`, `tests/fixtures/fad5bb7/*.ts.txt` (mới).

1. Tạo thư mục `tests/fixtures/fad5bb7/`. Với mỗi file các test đang lấy từ `fad5bb7`, chép nguyên văn nội dung `git show fad5bb7:lib/<file>.ts` vào `tests/fixtures/fad5bb7/<file>.ts.txt`:
   - G8: `sync`, `customers-sync`, `stats`, `customer-stats`.
   - K1: `sync`, `hr-sync`, `dispatch`, `stats`.
   - K2, K3: đọc mảng `files` trong từng test.

   Đuôi `.ts.txt` để typecheck, lint, build không đọc tới. Mỗi file chỉ một bản, các test dùng chung. Chạy `git show` để chép là được (chỉ đọc), không commit.
2. Trong 4 test, thay `execFileSync('git', ['show', \`fad5bb7:lib/${file}.ts\`], …)` bằng đọc `tests/fixtures/fad5bb7/${file}.ts.txt`.
   - Đường dẫn tính theo `import.meta.url`.
   - Không gọi git ở bất kỳ đâu trong test.
   - Bỏ import `execFileSync` nếu không còn dùng.
   - Giữ nguyên phần thay đường dẫn import và thư mục tạm `tests/support/old-write-path*/`.
3. Thiếu tệp mẫu thì test **hỏng** với lời báo rõ "thiếu tests/fixtures/fad5bb7/<file>.ts.txt". Không bỏ qua, không đánh dấu skip.
4. Không đổi gì khác trong test: số kỳ vọng, cách so, thời gian chờ giữ nguyên.

Tiêu chí xong:
- `rg -n "git', \\['show'|execFileSync\\('git'" tests` không ra dòng nào.
- Bốn lệnh typecheck, test, lint, build đạt, số test không giảm.
- Nội dung mỗi tệp mẫu giống hệt `git show fad5bb7:lib/<file>.ts` (so bằng `git show … | diff - tests/fixtures/…`, ghi kết quả vào tóm tắt).
