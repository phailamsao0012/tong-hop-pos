/**
 * MEGATECH · Tổng hợp POS — theo dõi các file Google Sheets tuyển dụng.
 * Chạy bằng tài khoản Google của chủ web (script.google.com). Mỗi khi một file được sửa (và định kỳ 10 phút),
 * script gửi toàn bộ các tab về máy chủ web; máy chủ tự so sánh, lưu ứng viên và báo Telegram. Khi có CV mới,
 * máy chủ trả về danh sách cần tải, script lấy file trên Drive và gửi lên.
 *
 * Cài đặt (một lần): dán file này vào một dự án Apps Script mới → Services (+) thêm "Google Sheets API"
 * (để đọc được link/chip file CV trong ô) → chọn hàm `setup` → Run → cấp quyền → xong.
 */
const CONFIG = {
  endpoint: 'https://tonghopposmegatech.io.vn/api/recruit/webhook',
  secret: '__RECRUIT_SECRET__',
  files: [
    '1zOtxW5KeVI3T4a7FKgJaI-rF8qvlQYyQf5p5jcbljWM', // Theo dõi UV (Sao)
    '16p5_fi4qzP_P-x25jVkdP5cx4H-GzqfbDtYxpFqjO2A', // BẢNG TỔNG HỢP TUYỂN DỤNG (Trang)
    '1DHx19s7HB1e7WIWKuWE6YKY2g4kcAzVU3hU3vp3vDUQ', // CV MEGATECH (BYD · C Hoài)
    '1GO4xlbSaj2TTPO2BFJ85ykJ7DayanhInwp-ocP5GkVs', // Link CV Megatech (BYD · C Huệ)
  ],
};

/** Chạy MỘT LẦN sau khi dán: tạo trigger "khi file đổi" cho từng file + trigger 10 phút, rồi gửi bản đầu tiên. */
function setup() {
  ScriptApp.getProjectTriggers().forEach(function (t) { ScriptApp.deleteTrigger(t); });
  CONFIG.files.forEach(function (id) { ScriptApp.newTrigger('onAnyChange').forSpreadsheet(id).onChange().create(); });
  ScriptApp.newTrigger('syncAll').timeBased().everyMinutes(10).create();
  syncAll();
  Logger.log('Đã cài xong: ' + ScriptApp.getProjectTriggers().length + ' trigger.');
}

/** Trigger onChange của từng file: chỉ gửi file vừa đổi. */
function onAnyChange(e) {
  var id = null;
  try { id = e && e.source ? e.source.getId() : null; } catch (err) { id = null; }
  if (id) syncFile(id); else syncAll();
}

/** Trigger 10 phút và khi cài: gửi mọi file (phòng khi trigger onChange bị lỡ). */
function syncAll() {
  CONFIG.files.forEach(function (id) {
    try { syncFile(id); } catch (err) { console.error('syncFile ' + id + ': ' + err); }
  });
}

function syncFile(id) {
  var ss = SpreadsheetApp.openById(id);
  var tabs = [];
  ss.getSheets().forEach(function (sh) {
    var range = sh.getDataRange();
    var values = range.getDisplayValues();
    if (values.length < 2) return;
    // Dòng tiêu đề = dòng đầu tiên (trong 6 dòng đầu) có ≥ 3 ô có chữ.
    var h = 0;
    for (var i = 0; i < Math.min(6, values.length); i++) { if (values[i].filter(function (x) { return String(x).trim(); }).length >= 3) { h = i; break; } }
    var headers = values[h].map(function (s) { return String(s).replace(/\s+/g, ' ').trim(); });
    var links = cellLinks_(id, sh, range);
    var rows = [];
    for (var r = h + 1; r < values.length; r++) {
      var v = values[r];
      if (!v.some(function (x) { return String(x).trim(); })) continue;
      var rowLinks = {};
      for (var c = 0; c < v.length; c++) { var u = links && links[r] ? links[r][c] : null; if (u) rowLinks[String(c)] = u; }
      rows.push({ n: r + 1, v: v, links: rowLinks });
    }
    tabs.push({ name: sh.getName(), gid: sh.getSheetId(), headers: headers, rows: rows });
  });
  var res = post_({ file: { id: id, name: ss.getName() }, tabs: tabs });
  if (res && res.needCv && res.needCv.length) res.needCv.forEach(uploadCv_);
  return res;
}

/** URL trong từng ô (link thường, HYPERLINK, hoặc chip file Drive). Ưu tiên Sheets API (đọc được chip); không có thì đọc rich text. */
function cellLinks_(id, sh, range) {
  var n = range.getNumRows(), m = range.getNumColumns();
  var out = [];
  try {
    var resp = Sheets.Spreadsheets.get(id, { ranges: [sh.getName()], fields: 'sheets(data(rowData(values(hyperlink,chipRuns(chip(richLinkProperties(uri)))))))' });
    var rowData = (resp.sheets && resp.sheets[0] && resp.sheets[0].data && resp.sheets[0].data[0] && resp.sheets[0].data[0].rowData) || [];
    for (var r = 0; r < n; r++) {
      var row = rowData[r] && rowData[r].values ? rowData[r].values : [];
      var line = [];
      for (var c = 0; c < m; c++) {
        var cell = row[c] || {};
        var chip = cell.chipRuns && cell.chipRuns[0] && cell.chipRuns[0].chip && cell.chipRuns[0].chip.richLinkProperties ? cell.chipRuns[0].chip.richLinkProperties.uri : null;
        line.push(cell.hyperlink || chip || null);
      }
      out.push(line);
    }
    return out;
  } catch (err) {
    // Chưa bật Google Sheets API trong Services: đọc link thường qua rich text.
    var rich = range.getRichTextValues(), formulas = range.getFormulas();
    for (var r2 = 0; r2 < n; r2++) {
      var line2 = [];
      for (var c2 = 0; c2 < m; c2++) {
        var url = null, rt = rich[r2][c2];
        if (rt) { url = rt.getLinkUrl(); if (!url) { var runs = rt.getRuns(); for (var k = 0; k < runs.length; k++) { var u2 = runs[k].getLinkUrl(); if (u2) { url = u2; break; } } } }
        if (!url && formulas[r2][c2]) { var mm = String(formulas[r2][c2]).match(/HYPERLINK\("([^"]+)"/i); if (mm) url = mm[1]; }
        line2.push(url);
      }
      out.push(line2);
    }
    return out;
  }
}

function post_(payload) {
  var r = UrlFetchApp.fetch(CONFIG.endpoint, {
    method: 'post', contentType: 'application/json', payload: JSON.stringify(payload),
    headers: { 'X-Recruit-Secret': CONFIG.secret }, muteHttpExceptions: true,
  });
  if (r.getResponseCode() >= 300) { console.error('webhook ' + r.getResponseCode() + ': ' + r.getContentText()); return null; }
  return JSON.parse(r.getContentText());
}

/** Tải một CV lên máy chủ (máy chủ gửi Telegram và giữ bản xem trên web). Google Docs → xuất PDF. */
function uploadCv_(item) {
  try {
    var file = DriveApp.getFileById(item.fileId);
    var blob = file.getBlob();
    if (String(file.getMimeType()).indexOf('application/vnd.google-apps') === 0) blob = file.getAs('application/pdf');
    if (blob.getBytes().length > 19 * 1024 * 1024) { console.error('CV quá 19 MB: ' + item.fileId); return; }
    var r = UrlFetchApp.fetch(CONFIG.endpoint, {
      method: 'post', payload: { candidateId: item.id, driveFileId: item.fileId, url: item.url, file: blob },
      headers: { 'X-Recruit-Secret': CONFIG.secret }, muteHttpExceptions: true,
    });
    if (r.getResponseCode() >= 300) console.error('cv ' + r.getResponseCode() + ': ' + r.getContentText());
  } catch (err) { console.error('cv ' + item.fileId + ': ' + err); }
}
