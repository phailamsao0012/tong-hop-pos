# Plan cho Codex

Mỗi việc có một thư mục riêng: `docs/plans/<yyyy-mm-dd>-<việc>/`. Trong thư mục có:
- `plan.md`: plan Claude viết và anh Vũ duyệt.
- `danh-gia.md`: góp ý về độ khả thi, thường do QA viết. Không bắt buộc.

## Mẫu `plan.md`
1. **Mục tiêu**: anh muốn thấy gì. Viết bằng lời của anh.
2. **Không được đổi**: số, quyền, route, file nào phải giữ nguyên.
3. **Hiện trạng**: code liên quan đang nằm ở đâu, ghi `file:dòng`.
4. **Thiết kế**: chia theo tầng `lib/`, `app/api/`, giao diện, test.
5. **Các bước**: mỗi bước là một PR nhỏ, gồm
   - tên nhánh `codex/...`;
   - file được sửa;
   - việc cần làm;
   - tiêu chí xong;
   - cách kiểm.
6. **Kiểm thử**: test cần thêm, ảnh cần chụp, số cần so trước và sau.
7. **Rủi ro**: chỗ dễ sai và cách lùi lại.

Repo công khai: plan không chứa số thật, tên khách hay khoá bí mật.
