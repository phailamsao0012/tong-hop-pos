// Đoạn Apps Script dán vào một tệp script MỚI của file Google Sheet chi phí MKT (Tiện ích mở rộng → Apps Script → + Tập lệnh),
// không đụng script sẵn có của chủ file (tên đều có tiền tố thp, chỉ xoá lịch chạy của chính mình). Trang Chi phí & ROAS điền sẵn
// địa chỉ web và mã nối rồi cho sao chép; mã nối không nằm trong repo. Script gửi nguyên các tab (tiêu đề + giá trị đang hiện),
// máy chủ tự tìm hàng tiêu đề và cột (lib/sheet-costs.ts), nên đổi cách đọc không phải dán lại.
export const sheetCostScript = (endpoint: string, key: string) => `/**
 * MEGATECH · Tổng hợp POS: gửi chi phí MKT từ file này lên web (${endpoint.replace(/\/api\/.*$/, '')}).
 * File vẫn riêng tư: script chạy bằng tài khoản đang giữ file, chỉ GỬI số lên web, web không đọc được file.
 * Cài một lần: Apps Script của file → bấm dấu + cạnh "Tệp" → Tập lệnh → đặt tên (vd TongHopPOS) → dán toàn bộ
 * vào tệp mới này (KHÔNG xoá code có sẵn ở tệp khác) → Lưu → chọn hàm "thpCaiDat" → Chạy → cấp quyền.
 * Sau đó cứ mỗi giờ và mỗi khi sửa file, số mới tự lên web (gửi lại nhiều lần vẫn không bị cộng trùng).
 * Mọi tên trong tệp này bắt đầu bằng thp / THP để không đụng script sẵn có của file.
 */
var THP_CAU_HINH = {
  diaChi: '${endpoint}',
  ma: '${key}',
  // Để trống = gửi mọi tab. Nên ghi đúng tab nhập chi phí từng ngày, bỏ tab tổng / dashboard để không cộng trùng,
  // ví dụ: ['CPQC Daily'] hoặc ['Chi phí T10', 'Chi phí T9']
  chiCacTab: [],
};

/** Chạy MỘT LẦN: tạo lịch gửi mỗi giờ + khi sửa file, rồi gửi ngay lần đầu. Chỉ xoá lịch cũ của chính tệp này. */
function thpCaiDat() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    var h = t.getHandlerFunction();
    if (h === 'thpGuiChiPhi' || h === 'thpKhiSua') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('thpGuiChiPhi').timeBased().everyHours(1).create();
  ScriptApp.newTrigger('thpKhiSua').forSpreadsheet(SpreadsheetApp.getActive()).onChange().create();
  Logger.log(thpGuiChiPhi());
}

/** Khi sửa: chờ gom các lần sửa liên tiếp (tối đa một lần mỗi 2 phút). */
function thpKhiSua() {
  var p = PropertiesService.getScriptProperties();
  var last = Number(p.getProperty('thpLanGui') || 0);
  if (Date.now() - last < 2 * 60 * 1000) return;
  thpGuiChiPhi();
}

function thpGuiChiPhi() {
  var ss = SpreadsheetApp.getActive();
  var tabs = [];
  ss.getSheets().forEach(function (sh) {
    if (THP_CAU_HINH.chiCacTab.length && THP_CAU_HINH.chiCacTab.indexOf(sh.getName()) < 0) return;
    var values = sh.getDataRange().getDisplayValues();
    if (values.length < 2) return;
    // Gửi nguyên lưới giá trị đang hiện; web tự tìm hàng tiêu đề, cột ngày / tiền / người (dọc hay ngang đều được).
    tabs.push({ name: sh.getName(), values: values.filter(function (r) { return r.some(function (x) { return String(x).trim(); }); }) });
  });
  var res = UrlFetchApp.fetch(THP_CAU_HINH.diaChi, {
    method: 'post', contentType: 'application/json', muteHttpExceptions: true,
    headers: { 'X-Sheet-Key': THP_CAU_HINH.ma },
    payload: JSON.stringify({ file: { id: ss.getId(), name: ss.getName() }, tz: ss.getSpreadsheetTimeZone(), tabs: tabs }),
  });
  PropertiesService.getScriptProperties().setProperty('thpLanGui', String(Date.now()));
  var text = res.getResponseCode() + ' ' + res.getContentText();
  if (res.getResponseCode() !== 200) throw new Error('Web chưa nhận: ' + text);
  return 'Đã gửi: ' + text;
}
`;
