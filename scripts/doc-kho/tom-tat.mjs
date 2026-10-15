import { appendFileSync, readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const SAFE_ERRORS = new Set(['Số đếm gộp không hợp lệ.', 'Khoảng thời gian không hợp lệ.', 'Mẫu số không nhất quán.', 'Thiếu bảng kết quả.', 'Kết quả D1 không hợp lệ.']);

const OTHER = 'người khác, không hậu tố';
const ACTORS = new Set(['chính Sale của đơn', 'CSKH của đơn', OTHER, 'không rõ']);

/** Chỉ xuất tỉ lệ; mẫu rỗng không được diễn giải thành 0%. */
export function percentage(n, total) {
  if (!Number.isSafeInteger(n) || !Number.isSafeInteger(total) || n < 0 || total < 0) {
    throw new Error('Số đếm gộp không hợp lệ.');
  }
  return n > total || total === 0 ? '—' : `${((n / total) * 100).toFixed(1)}%`;
}

export function actorLabel(value) {
  if (ACTORS.has(value)) return value;
  return typeof value === 'string' && /^người khác hậu tố [A-Z]{1,8}$/.test(value) ? value : OTHER;
}

/** Gộp trước khi đổi %, tránh lộ các nhãn tự do không thuộc loại người. */
export function groupLabels(rows, labelFor = actorLabel) {
  const grouped = new Map();
  for (const row of rows) {
    const label = labelFor(row.label);
    grouped.set(label, (grouped.get(label) ?? 0) + row.n);
  }
  return [...grouped].map(([label, n]) => ({ label, n }));
}

function controlCharacter(char) {
  return char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127;
}

export function safeTag(value) {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= 100
    && !/\d{6}|@|:\/\//.test(value) && !Array.from(value).some(controlCharacter)
    // Cũng bỏ số điện thoại được chèn dấu cách, dấu chấm hoặc dấu gạch.
    && (value.match(/\d/g)?.length ?? 0) < 6;
}

function cell(value) {
  return Array.from(String(value), (char) => controlCharacter(char) ? ' ' : char).join('').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    // Runner có thể nhận ::command:: ở giữa một dòng log, kể cả trong ô Markdown.
    .replaceAll(':', '&#58;').replaceAll('|', '&#124;').replaceAll('`', '&#96;');
}

function table(title, headers, rows) {
  return `\n## ${title}\n\n${rows.length ? [headers, headers.map(() => '---'), ...rows]
    .map((row) => `| ${row.map(cell).join(' | ')} |`).join('\n') : 'Không có dữ liệu đủ điều kiện.'}\n`;
}

function status(value) {
  return Number.isSafeInteger(value) ? String(value) : 'không rõ';
}

function fieldLabel(value) {
  return typeof value === 'string' && /^[A-Za-z_][A-Za-z0-9_]{0,63}$/.test(value)
    && !/\d{6}/.test(value) ? value : 'trường khác';
}

function minutes(value) {
  if (value === null) return '—';
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw new Error('Khoảng thời gian không hợp lệ.');
  }
  return `${value.toFixed(1)} phút`;
}

function sharedTotal(rows) {
  const total = rows[0]?.total ?? 0;
  for (const row of rows) {
    if (row.total !== total) throw new Error('Mẫu số không nhất quán.');
    percentage(row.n, total);
  }
  return total;
}

/** Nhận đúng các bảng số đếm gộp, tuyệt đối không serialize hàng SQL hay metadata D1. */
export function renderReport(tables) {
  if (!Array.isArray(tables) || tables.length !== 8) {
    throw new Error('Thiếu bảng kết quả.');
  }
  const [transitions, paths, gaps, subStatuses, tags, histories, editors, suffixes] = tables;
  let report = '# Tìm bước kho gọi khách xác nhận\n\n'
    + 'Phạm vi bảng đơn: mọi POS; đơn có first_closed_at trong 7 ngày gần nhất, '
    + 'trạng thái hiện tại không thuộc Mới, Hủy, Xóa. Mốc lọc dùng giờ UTC của D1. '
    + 'Chỉ có tỉ lệ và nhãn gộp; dấu — là thiếu mẫu hoặc thiếu mốc giờ.\n';
  let rendered = 0;
  const render = (index, title, build) => {
    const previous = report;
    try {
      if (!Array.isArray(tables[index])) throw new Error('Thiếu bảng kết quả.');
      build();
      rendered++;
    } catch (error) {
      const message = error instanceof Error && SAFE_ERRORS.has(error.message) ? error.message : 'không rõ';
      report = previous + '\nBảng ' + title + ': lỗi ' + message + '\n';
    }
  };
  render(0, 'Chuyển trạng thái', () => {
    const transitionGroups = new Map();
    for (const row of transitions) {
      const pair = `${status(row.old_status)}→${status(row.new_status)}`;
      if (!transitionGroups.has(pair)) transitionGroups.set(pair, []);
      transitionGroups.get(pair).push(row);
    }
    const transitionRows = [];
    const transitionTotal = transitions.reduce((sum, row) => sum + row.n, 0);
    let totalsDiffer = transitions.some((row) => row.total !== transitionTotal);
    for (const [pair, rows] of transitionGroups) {
      const pairTotal = rows[0].pair_total;
      const n = rows.reduce((sum, row) => sum + row.n, 0);
      if (n !== pairTotal || rows.some((row) => row.pair_total !== pairTotal)) {
        totalsDiffer = true;
      }
      for (const actor of groupLabels(rows.map((row) => ({ label: row.actor, n: row.n })))) {
        transitionRows.push([pair, percentage(n, transitionTotal), actor.label, percentage(actor.n, n)]);
      }
    }
    report += table('Chuyển trạng thái', ['Cặp trạng thái', '% mọi lần chuyển', 'Loại người chuyển', '% trong cặp'], transitionRows);
    if (totalsDiffer) report += '\nChuyển trạng thái: tổng lệch; dùng tổng tính lại.\n';
  });
  render(1, 'Đường đi', () => {
    const pathLabels = {
      has17: 'Có vào Chờ xác nhận (17)', has1: 'Có vào Đã xác nhận (1)',
      has1_without17: 'Vào Đã xác nhận mà không thấy qua Chờ xác nhận',
      packed: 'Qua Đang đóng hàng (8) hoặc các bước gửi, giao, hoàn sau đó',
    };
    report += table('Đường đi', ['Đường đi', '% đơn trong phạm vi'], paths
      .filter((row) => Object.hasOwn(pathLabels, row.metric))
      .map((row) => [pathLabels[row.metric], percentage(row.n, row.total)]));
    report += '\nĐường đi dùng cả trạng thái cũ, mới và hiện tại; thiếu lịch sử có thể làm thiếu dấu vết Chờ xác nhận.\n';
  });
  render(2, 'Khoảng cách giờ', () => {
    report += table('Khoảng cách giờ', ['Cặp', 'Trung vị', 'Phân vị 90', '% mẫu bị bỏ'], gaps
      .filter((row) => ['17→1', '1→8'].includes(row.pair))
      .map((row) => [row.pair, minutes(row.median_minutes < 0 ? null : row.median_minutes), minutes(row.p90_minutes < 0 ? null : row.p90_minutes), percentage(row.discarded ?? 0, row.total ?? 0)]));
    report += '\nMỗi đơn lấy lần đầu vào nguồn và lần đầu vào đích; mẫu âm bị bỏ khỏi phân vị; chỉ dùng mốc giờ hợp lệ trong lịch sử. '
      + 'Trung vị lấy trung bình hai mốc giữa; phân vị 90 lấy hạng làm tròn lên.\n';
  });
  render(3, 'sub_status', () => {
    const subTotal = sharedTotal(subStatuses);
    const subRows = groupLabels(subStatuses, (value) => typeof value === 'string'
      && /^(?:-?\d{1,19}|không rõ|giá trị khác)$/.test(value) ? value : 'giá trị khác');
    report += table('sub_status', ['Giá trị', '% đơn trong phạm vi'], subRows.map((row) => [row.label, percentage(row.n, subTotal)]));
  });
  render(4, 'Thẻ đơn', () => {
    report += table('Thẻ đơn', ['Thẻ', '% đơn trong phạm vi'], tags
      .filter((row) => safeTag(row.label) && row.n * 100 >= row.total * 3)
      .map((row) => [row.label, percentage(row.n, row.total)]));
    report += '\nChỉ hiện thẻ có trên ít nhất 3% đơn; một thẻ trên một đơn chỉ tính một lần.\n';
  });
  render(5, 'raw_json.histories', () => {
    const coverageLabels = { raw_json: 'Có raw_json', histories: 'Có histories không rỗng' };
    const historyRows = histories.filter((row) => row.kind === 'coverage' && Object.hasOwn(coverageLabels, row.label))
      .map((row) => [coverageLabels[row.label], percentage(row.n, row.total), '—', '—']);
    const fields = new Map();
    for (const row of histories.filter((item) => item.kind === 'fields')) {
      const field = fieldLabel(row.label);
      if (!fields.has(field)) fields.set(field, []);
      fields.get(field).push(row);
    }
    for (const [field, rows] of fields) {
      const total = sharedTotal(rows);
      const fieldTotal = rows.reduce((sum, row) => sum + row.n, 0);
      for (const row of groupLabels(rows.map((item) => ({ label: item.actor, n: item.n })))) {
        historyRows.push([field, percentage(fieldTotal, total), row.label, percentage(row.n, fieldTotal)]);
      }
    }
    report += table('raw_json.histories', ['Dữ liệu / trường', '% đơn / % mục histories', 'Loại người sửa', '% trong trường'], historyRows);
    report += '\nMỗi mục histories tính một lần cho mỗi trường; một mục có thể chứa nhiều trường nên tổng tỉ lệ trường có thể vượt 100%. '
      + 'Không dùng last_editor_id thay người sửa bị thiếu. Code đồng bộ hiện tại bỏ histories trước khi lưu raw_json; '
      + 'bảng trống không chứng minh kho không gọi khách.\n';
  });
  render(6, 'last_editor_id', () => {
    const editorTotal = sharedTotal(editors);
    report += table('last_editor_id', ['Loại người sửa cuối', '% đơn trong phạm vi'],
      groupLabels(editors).map((row) => [row.label, percentage(row.n, editorTotal)]));
  });
  render(7, 'Hậu tố trong pos_users', () => {
    report += table('Hậu tố trong pos_users', ['Hậu tố', '% người dùng mọi POS'], suffixes
      .filter((row) => typeof row.label === 'string' && /^[A-Z]{1,8}$/.test(row.label) && row.n >= 2)
      .map((row) => [row.label, percentage(row.n, row.total)]));
    report += '\nHậu tố giữ đúng từ cuối viết hoa ASCII, tối đa 8 ký tự, có ít nhất hai user_id khác nhau. '
      + 'Mẫu số hậu tố là mọi user_id khác nhau trong pos_users, gồm người không có hậu tố hợp lệ. '
      + 'Người rỗng hoặc không tìm thấy trong pos_users được gộp không rõ.\n';
  });
  if (rendered === 0) throw new Error('Thiếu bảng kết quả.');
  return report;
}

export function readD1Results(text) {
  const payload = JSON.parse(text);
  const last = Array.isArray(payload) ? payload.findLast((part) => Array.isArray(part?.results)) : undefined;
  if (!last || last.success !== true) throw new Error('Kết quả D1 không hợp lệ.');
  return last.results;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    if (process.argv.length !== 10) throw new Error('Thiếu file kết quả.');
    const report = renderReport(process.argv.slice(2).map((file) => (() => { try { return readD1Results(readFileSync(file, 'utf8')); } catch { return null; } })()));
    if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, report);
    // Chặn cú pháp workflow command trong nhãn dữ liệu, kể cả khi hiển thị Markdown.
    process.stdout.write(report);
  } catch {
    process.stderr.write('Không tạo được báo cáo; không in dữ liệu hay lỗi gốc.\n');
    process.exitCode = 1;
  }
}
