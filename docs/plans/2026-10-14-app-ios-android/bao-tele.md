# Giao việc: báo tiến độ qua Telegram và tự chạy lại phần iPhone

Ba script nhỏ trên Mac. Viết cho bash 3.2 của macOS: không mảng kết hợp, không mapfile, không `${x,,}`.

Luật:
- Chỉ tạo hoặc sửa file trong `~/codex-viec/tele`.
- KHÔNG mở, đọc, `cat`, `grep` hay liệt kê `~/tele-bot/.env`, `~/.codex*`, `~/.megatech`, `~/.ssh`, `~/.config/gh`. Script chỉ đọc file khóa lúc anh tự chạy.
- Không git push. Không gọi mạng. Không `set -x`.
- Không in và không ghi khóa (token, chat id hay tên biến) ở bất kỳ đâu.

## A. `bao-tele.sh`: báo tiến độ qua Telegram

### Nguồn và lịch gửi
- Thư mục: `V="${V:-$HOME/codex-viec/app-1410}"`, trạng thái `S="${S:-$HOME/codex-viec/tele}"`.
- Theo dõi 3 file; file nào chưa có thì bỏ qua:
  - `$V/ios-tien-do.txt`: nhãn iPhone, 9 bước: i1 i2 i3 i4 i4b i7 i5a i5b i6.
  - `$V/android-tien-do.txt`: nhãn Android, 12 bước: a0 a1a a1b a1c a2a a2b a6 a7 a7c a7b a8a a8b.
  - `$V/claude-tien-do.txt`: nhãn CLAUDE.
- Mỗi dòng có dạng `dd/mm HH:MMZ <nội dung>`, giờ UTC. Đổi sang giờ Việt Nam (+7), chỉ in `HH:MM`.
- Cứ 20 giây, gửi các dòng mới:
  - Số dòng đã gửi lưu ở `$S/.da-gui-<tên>`.
  - Chỉ tăng số này sau khi gửi thành công. Gửi lỗi thì vòng sau gửi lại.
  - Giữa hai tin nghỉ 1 giây.
- Lần chạy đầu (chưa có `.da-gui-<tên>`):
  - Không gửi dòng cũ. Đặt số đã gửi bằng số dòng hiện có.
  - Gửi 1 tin mở đầu `📡 Bắt đầu báo tiến độ app qua Telegram`, kèm dòng cuối (đã rút gọn) của từng file đang có.

### Mẫu tin
- Tin Codex: `🤖 CODEX | <nhãn> <việc>, <HH:MM>, tài khoản <acc>`.
- Rút gọn `<việc>` theo bảng dưới. `k` là vị trí của `b` trong danh sách bước, `n` là tổng số bước.

| Dòng gốc | `<việc>` |
|---|---|
| `<b>: bắt đầu (<tiêu đề>).` | `bước k/n bắt đầu: <tiêu đề cắt 80 ký tự>` |
| `<b>: xong, commit <sha>.` | `✅ bước k/n xong` |
| `<b>: máy kiểm báo lỗi, giao lại vòng <v>.` | `🔁 bước k/n máy kiểm lỗi, Codex sửa lần <v>/3` |
| `<b>: đã có commit, bỏ qua.` | `bước k/n đã xong từ trước` |
| `DỪNG ở <b>: <lý do>` | `⛔ DỪNG ở bước k/n: <lý do cắt 200 ký tự>` |
| `<b>: codex thoát mã <m>` | `⚠️ bước k/n Codex lỗi (mã <m>)` |
| `<b>: <acc> hết lượt, đổi tài khoản` | `🔄 <acc> hết lượt, đổi sang <tài khoản kia>` |
| `<b>: cả hai tài khoản hết lượt, chờ 30 phút` | `⏸ cả hai tài khoản hết lượt, chờ 30 phút` |
| `Xong mọi bước…` | `🏁 xong cả phần <nhãn>` |
| `Đã đẩy lên …` | `📤 đã đẩy lên GitHub` |
| dòng khác | nguyên nội dung, cắt 300 ký tự |

- Tài khoản `<acc>`:
  - Lấy từ dòng `Bắt đầu phần … tài khoản đầu <acc>.`.
  - Gặp dòng `<acc> hết lượt, đổi tài khoản` thì đổi qua lại `codex` ↔ `codex2`.
  - Lưu ở `$S/.tk-<tên>` để chạy lại không mất. Chưa biết thì ghi `?`.
- Tin Claude: `🧠 CLAUDE | <nội dung>, <HH:MM>`.

### Báo khi script ngừng giữa chừng
- Theo dõi hai thư mục khóa `$V/ios.dang-chay` và `$V/android.dang-chay`.
- Vòng trước thư mục khóa còn, vòng này mất, mà dòng cuối của file tiến độ phần đó không chứa `Xong mọi bước`, `DỪNG`, `Đã đẩy`, `Không đẩy`, `Đẩy lên` hay `rebase`: gửi `⚠️ CODEX | <nhãn> script ngừng giữa chừng, <HH:MM VN hiện tại>`.

### Khóa bot
- Đọc từ file `"${TELE_ENV:-$HOME/tele-bot/.env}"`, chỉ lúc chạy.
- Không `source`. Không in, không ghi log tên hay giá trị.
- Có biến môi trường `TELE_TOKEN_VAR` và `TELE_CHAT_VAR` thì dùng đúng hai tên đó. Không có thì tự tìm:
  - Token: dòng đầu tiên dạng `TÊN=giá trị` có giá trị khớp `^[0-9]{6,12}:[A-Za-z0-9_-]{30,}$`. Giá trị lấy sau khi bỏ ngoặc kép, ngoặc đơn và khoảng trắng hai đầu.
  - Chat: dòng đầu tiên có TÊN chứa CHAT, USER, ADMIN, OWNER hoặc ALLOWED (không phân biệt hoa thường) và giá trị là số nguyên, có thể âm. Giá trị có dấu phẩy thì lấy phần trước dấu phẩy đầu tiên.
- Không tìm thấy một trong hai thì ghi log `không tìm thấy khóa bot` và thoát mã 2.

### Gửi tin
- Token không được nằm trên dòng lệnh:
  ```
  printf 'url = "https://api.telegram.org/bot%s/sendMessage"\n' "$TOKEN" | curl -sS -m 20 -K - --data-urlencode "chat_id=$CHAT" --data-urlencode "text=$tin" -o /dev/null -w '%{http_code}'
  ```
- Mã 200 là xong. Mã khác thì thử lại sau 2, 5 và 10 giây.
- Vẫn lỗi thì ghi log `gửi lỗi mã <code>` và để vòng sau gửi lại. Không ghi URL, không ghi token.
- `TELE_GIA=1`: không gọi mạng, in tin ra stdout (dùng để thử).

### Tham số và chạy
| Tham số | Việc |
|---|---|
| (không có) | chạy vòng lặp mãi |
| `--mot-vong` | chạy một vòng rồi thoát |
| `--thu` | gửi một tin `🧪 Thử báo Telegram từ Mac, <HH:MM>` rồi thoát |

- Chỉ chạy một bản, trừ khi có `--thu` hoặc `--mot-vong`. Dùng `mkdir $S/.dang-chay`, trap xóa khi thoát. Đã có thì báo rồi thoát.
- Log ở `$S/bao-tele.log`: chỉ thời điểm và số tin gửi được hoặc lỗi.

## B. `cho-va-chay-ios.sh`: chờ máy ảo iPhone rồi chạy lại phần iPhone

### Ghi tiến độ và khóa
- Ghi tiến độ: `echo "$(date -u '+%d/%m %H:%MZ') <nội dung>" >> ~/codex-viec/app-1410/ios-tien-do.txt`.
- Đang có `~/codex-viec/app-1410/ios.dang-chay` thì ghi `iPhone đang chạy, không chạy lại` rồi thoát.

### Chờ bộ máy ảo
- Đã có khi `xcrun simctl list runtimes 2>/dev/null | grep -q '^iOS '`.
- Chưa có:
  - Ghi `Đang chờ tải bộ máy ảo iPhone`.
  - Nếu `pgrep -f 'xcodebuild -downloadPlatform'` trống thì tự chạy `xcodebuild -downloadPlatform iOS >> ~/codex-viec/app-1410/tai-may-ao.log 2>&1`.
  - Cứ 60 giây kiểm lại, tối đa 4 giờ. Vẫn chưa có thì ghi `DỪNG: chưa có bộ máy ảo iPhone` rồi thoát 1.
- Có rồi thì ghi `Đã có bộ máy ảo iPhone`.

### Lấy script mới
```
cd ~/Projects/tong-hop-pos && git fetch -q origin && git show origin/claude/project-thread-avd7td:docs/plans/2026-10-14-app-ios-android/chay-lien-mach.sh > ~/codex-viec/app-1410/chay-v2.sh
```
Lỗi thì ghi `DỪNG: không lấy được script` rồi thoát 1.

### Build thử một lần
- Chép đúng lệnh `xcodebuild` iOS trong hàm `kiem()` của `chay-v2.sh`: cùng thư mục, cùng tham số, SDK `iphoneos` không ký.
- Chạy ở `~/Projects/thp-app-ios`, đưa toàn bộ output vào `~/codex-viec/app-1410/ios-build-thu.log`.
- Lỗi thì ghi `DỪNG: build thử iPhone lỗi, xem ios-build-thu.log` rồi thoát 1.
- Đạt thì ghi `Build thử iPhone đạt, chạy lại phần iPhone`.

### Chạy lại
Cuối cùng: `exec bash ~/codex-viec/app-1410/chay-v2.sh ios ~/Projects/thp-app-ios codex`.

## C. `khoi-dong.sh`: anh tự chạy một lần

In ra màn hình từng dòng tiếng Việt ngắn. Các bước:
1. Nếu chưa có `~/codex-viec/app-1410/ios.dang-chay` và chưa có tiến trình `cho-va-chay-ios.sh`:
   ```
   nohup caffeinate -is bash ~/codex-viec/tele/cho-va-chay-ios.sh > ~/codex-viec/app-1410/ios-chay.log 2>&1 &
   ```
   In `Đã bật chạy lại iPhone (chờ máy ảo, build thử, rồi chạy)`.
2. Chạy `bash ~/codex-viec/tele/bao-tele.sh --thu`.
   - Lỗi thì in `Gửi thử Telegram lỗi, xem ~/codex-viec/tele/bao-tele.log` và thoát 1.
   - Đạt thì in `Đã gửi tin thử Telegram`.
3. Nếu `bao-tele.sh` chưa chạy:
   ```
   nohup bash ~/codex-viec/tele/bao-tele.sh > /dev/null 2>&1 &
   ```
   In `Đã bật báo tiến độ qua Telegram`.

## Kiểm trước khi xong
- Chạy `bash -n` cả ba file. Máy có shellcheck thì chạy thêm shellcheck.
- Thử `bao-tele.sh` bằng dữ liệu GIẢ trong `~/codex-viec/tele/thu/`:
  - Tạo một file `.env` giả, có token giả đúng dạng, một biến chat giả, và vài biến khác gây nhiễu.
  - Tạo `ios-tien-do.txt` mẫu đủ mọi loại dòng ở bảng trên, có một dòng qua nửa đêm UTC.
  - Chạy `TELE_GIA=1 TELE_ENV=… V=… S=… bash bao-tele.sh --mot-vong`. Thêm dòng vào file mẫu rồi chạy lại.
  - Dán phần in ra vào tóm tắt.
- KHÔNG chạy `cho-va-chay-ios.sh` và `khoi-dong.sh`.
- Viết tóm tắt ngắn, mở đầu bằng `# Tóm tắt`: có những file nào, cách chạy, kết quả thử.
