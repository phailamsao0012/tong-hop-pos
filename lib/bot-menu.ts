// Menu bấm nút cho bot Telegram: /start hiện lời chào + số liệu nhanh + các nút mục; mỗi nút
// mở một báo cáo với hàng nút chọn kỳ. Cũng xử lý ghép nối chat bằng mã hiện trên web.
import { env } from 'cloudflare:workers';
import { commandText, HELP, LINE, HEADER, bar } from '@/lib/bot';
import { overviewReport } from '@/lib/overview-report';
import { CHART_KINDS, buildChart, type ChartKind } from '@/lib/bot-charts';
import { parsePeriod } from '@/lib/bot-parse';
import { todayVn, VN_OFFSET_HOURS } from '@/lib/report-time';

export type InlineKeyboard = { inline_keyboard: { text: string; callback_data: string }[][] };

const vi = new Intl.NumberFormat('vi-VN');
const money = (n: number | null | undefined) => n === null || n === undefined ? '—' : `${vi.format(Math.round(n))} đ`;
const pct = (n: number | null) => n === null ? '—' : `${n.toFixed(1).replace('.', ',')}%`;
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export const PERIODS: [string, string][] = [['homnay', 'Hôm nay'], ['homqua', 'Hôm qua'], ['tuan', 'Tuần này'], ['thang', 'Tháng này'], ['thangtruoc', 'Tháng trước']];

export const MAIN_MENU: InlineKeyboard = {
  inline_keyboard: [
    [{ text: '📊 Báo cáo tổng quan', callback_data: 'bc:homnay' }],
    [{ text: '🏪 Theo POS', callback_data: 'pos:homnay' }, { text: '🏆 Xếp hạng nhân viên', callback_data: 'top:homnay' }],
    [{ text: '🔥 Chốt nóng trong ca', callback_data: 'cn:ca' }, { text: '👤 Xem một nhân viên', callback_data: 'nv:pick:0' }],
    [{ text: '📦 Sản phẩm', callback_data: 'sp:homnay' }, { text: '🔁 Mua lại & Upsell', callback_data: 'ml:thang' }],
    [{ text: '📈 Biểu đồ', callback_data: 'chart:menu' }, { text: '🔍 Tìm khách', callback_data: 'kh:hint' }],
    [{ text: '🔄 Đồng bộ', callback_data: 'sync' }],
    [{ text: '❓ Hướng dẫn lệnh gõ tay', callback_data: 'help' }],
  ],
};

function periodRow(prefix: string, current: string) {
  return PERIODS.map(([k, label]) => ({ text: k === current ? `• ${label}` : label, callback_data: `${prefix}:${k}` }));
}
const withBack = (rows: { text: string; callback_data: string }[][]): InlineKeyboard => ({
  inline_keyboard: [...rows, [{ text: '⬅️ Menu chính', callback_data: 'menu' }]],
});

export function greeting(name: string) {
  const hour = Number(new Date(Date.now() + VN_OFFSET_HOURS * 3600000).toISOString().slice(11, 13));
  const part = hour < 12 ? 'sáng' : hour < 18 ? 'chiều' : 'tối';
  return `👋 Chào buổi ${part}, <b>${esc(name)}</b>`;
}

/** Màn hình /start: lời chào + số liệu nhanh hôm nay + menu. */
export async function startScreen(name: string) {
  const today = todayVn();
  const r = await overviewReport({ posIds: [], start: today, end: today, compare: 'previous' });
  const c = r.current.total, p = r.compare?.total;
  const d = (a: number, b: number | undefined) => b ? ` ${a >= b ? '🟢▲' : '🔴▼'}${Math.abs((a - b) / b * 100).toFixed(0)}% <i>so hôm qua</i>` : '';
  const text = [
    HEADER,
    greeting(name),
    LINE,
    `📅 <b>Hôm nay · 6 POS</b> · ⏱ ${r.syncedAt ? new Date(`${r.syncedAt}`).toLocaleTimeString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', hour: '2-digit', minute: '2-digit' }) : '—'}`,
    `🧾 Đơn tạo mới: <b>${vi.format(c.orders)}</b>${d(c.orders, p?.orders)}`,
    `✅ Đơn chốt: <b>${vi.format(c.closedOrders)}</b>${d(c.closedOrders, p?.closedOrders)}`,
    `🎯 Tỷ lệ chốt/tạo: <b>${pct(c.closeRate)}</b>  ${bar(c.closeRate)}`,
    `💰 Doanh thu: <b>${money(c.closedNet)}</b>${d(c.closedNet, p?.closedNet)}`,
    `🚚 Giao TC: ${vi.format(c.groups.delivered.orders)} · 🔁 Hoàn: ${vi.format(c.groups.returned.orders)} · ❌ Hủy: ${vi.format(c.groups.cancelled.orders)}`,
    LINE,
    '👇 Chọn mục bên dưới, hoặc gõ lệnh (ví dụ <code>/baocao thang gao</code>).',
  ].join('\n');
  return { text, keyboard: MAIN_MENU };
}

async function employeeButtons(page: number): Promise<InlineKeyboard> {
  const rows = await env.DB.prepare(
    "SELECT user_id, MAX(name) AS name, MAX(department) AS department FROM pos_users WHERE name<>'' AND is_active=1 GROUP BY user_id ORDER BY (CASE WHEN LOWER(COALESCE(department,'')) LIKE '%sale%' THEN 0 WHEN LOWER(COALESCE(department,'')) LIKE '%cskh%' THEN 1 ELSE 2 END), name",
  ).all<{ user_id: string; name: string; department: string | null }>();
  const size = 10;
  const slice = rows.results.slice(page * size, page * size + size);
  const keyboard: { text: string; callback_data: string }[][] = [];
  for (let i = 0; i < slice.length; i += 2)
    keyboard.push(slice.slice(i, i + 2).map((e) => ({ text: e.name.slice(0, 28), callback_data: `nv:id:${e.user_id.slice(0, 36)}:homnay` })));
  const nav: { text: string; callback_data: string }[] = [];
  if (page > 0) nav.push({ text: '‹ Trước', callback_data: `nv:pick:${page - 1}` });
  if ((page + 1) * size < rows.results.length) nav.push({ text: 'Sau ›', callback_data: `nv:pick:${page + 1}` });
  if (nav.length) keyboard.push(nav);
  return withBack(keyboard);
}

export type CallbackResult = { text: string; keyboard: InlineKeyboard; photo?: string };

const CHART_MENU: InlineKeyboard = withBack([
  [{ text: '💰 Doanh thu theo ngày', callback_data: 'chart:doanhthu:thang' }, { text: '✅ Đơn chốt theo ngày', callback_data: 'chart:donchot:thang' }],
  [{ text: '🏪 Doanh thu theo POS', callback_data: 'chart:pos:thang' }, { text: '📉 Từng POS theo ngày', callback_data: 'chart:possong:thang' }],
  [{ text: '🏆 Top nhân viên', callback_data: 'chart:top:thang' }, { text: '🎯 Tỷ lệ chốt NV', callback_data: 'chart:tyle:thang' }],
  [{ text: '🍩 Trạng thái đơn', callback_data: 'chart:trangthai:homnay' }],
]);

/** Xử lý dữ liệu nút bấm → nội dung + bàn phím mới (hoặc ảnh biểu đồ). */
export async function handleCallback(data: string, userName: string): Promise<CallbackResult> {
  const [kind, a, b, c] = data.split(':');
  if (kind === 'chart') {
    if (a === 'menu') return { text: '📈 <b>Chọn biểu đồ</b> (mặc định tháng này; đổi kỳ ở dưới ảnh)', keyboard: CHART_MENU };
    const chartKind = (a in CHART_KINDS ? a : 'doanhthu') as ChartKind;
    const { period } = parsePeriod([b || 'thang']);
    const { url, caption } = await buildChart(chartKind, period, []);
    return { text: caption, photo: url, keyboard: withBack([periodRow(`chart:${chartKind}`, b || 'thang'), [{ text: '📈 Biểu đồ khác', callback_data: 'chart:menu' }]]) };
  }
  if (kind === 'menu') return startScreen(userName);
  if (kind === 'help') return { text: HELP, keyboard: withBack([]) };
  if (kind === 'sync') return { text: (await commandText('/dongbo')), keyboard: withBack([[{ text: '🔄 Làm mới', callback_data: 'sync' }]]) };
  if (kind === 'kh') return { text: 'Gõ: <code>/khach 0912345678</code> hoặc <code>/khach Tên khách</code> để xem hồ sơ khách và các đơn gần đây.', keyboard: withBack([]) };
  if (kind === 'bc') return { text: (await commandText(`/baocao ${a}`)), keyboard: withBack([periodRow('bc', a)]) };
  if (kind === 'pos') return { text: (await commandText(`/pos ${a}`)), keyboard: withBack([periodRow('pos', a)]) };
  if (kind === 'top') return { text: (await commandText(`/top ${a}`)), keyboard: withBack([periodRow('top', a), [{ text: 'Bộ phận CSKH', callback_data: `topd:${a}:cskh` }, { text: 'Bộ phận SALE', callback_data: `topd:${a}:sale` }]]) };
  if (kind === 'topd') return { text: (await commandText(`/top ${a} ${b}`)), keyboard: withBack([periodRow('top', a)]) };
  if (kind === 'sp') return { text: (await commandText(`/sanpham ${a}`)), keyboard: withBack([periodRow('sp', a)]) };
  if (kind === 'ml') return { text: (await commandText(`/mualai ${a}`)), keyboard: withBack([periodRow('ml', a)]) };
  if (kind === 'cn') {
    const period = a === 'ca' ? '' : a;
    return { text: (await commandText(`/chotnong ${period}`)), keyboard: withBack([[{ text: a === 'ca' ? '• Ca hôm nay' : 'Ca hôm nay', callback_data: 'cn:ca' }, ...periodRow('cn', a).slice(0, 3)]]) };
  }
  if (kind === 'nv' && a === 'pick') return { text: '👤 <b>Chọn nhân viên</b> (SALE trước, rồi CSKH)', keyboard: await employeeButtons(Number(b) || 0) };
  if (kind === 'nv' && a === 'id') {
    const row = await env.DB.prepare("SELECT MAX(name) AS name FROM pos_users WHERE user_id=?").bind(b).first<{ name: string }>();
    const name = row?.name ?? '';
    const period = c || 'homnay';
    const text = name ? (await commandText(`/nhanvien ${name} ${period}`)) : 'Không tìm thấy nhân viên.';
    return { text, keyboard: withBack([periodRow(`nv:id:${b}`, period).map((x) => ({ ...x, callback_data: `nv:id:${b}:${x.callback_data.split(':').pop()}` })), [{ text: '👥 Chọn người khác', callback_data: 'nv:pick:0' }]]) };
  }
  return { text: 'Nút này không còn hiệu lực, hãy mở lại menu.', keyboard: MAIN_MENU };
}

/** Mã ghép nối trong ngày (hiện trên web): SHA-256(AUTH_SECRET + ngày) → 6 chữ số. */
export async function pairingCode(dayOffset = 0) {
  const day = new Date(Date.now() + VN_OFFSET_HOURS * 3600000 - dayOffset * 86400000).toISOString().slice(0, 10);
  const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${env.AUTH_SECRET ?? ''}:${day}`)));
  return String(((bytes[0] << 16) | (bytes[1] << 8) | bytes[2]) % 1000000).padStart(6, '0');
}

/** /start <mã>: cho phép chat này dùng bot và đặt làm nơi nhận cảnh báo nếu chưa có. */
export async function tryPairing(chatId: string, chatName: string, code: string) {
  if (code !== await pairingCode(0) && code !== await pairingCode(1)) return false;
  const now = new Date().toISOString();
  await env.DB.batch([
    env.DB.prepare('INSERT INTO telegram_chats (chat_id,name,added_by,added_at) VALUES (?,?,?,?) ON CONFLICT(chat_id) DO UPDATE SET name=excluded.name')
      .bind(chatId, chatName.slice(0, 100), 'pairing', now),
    env.DB.prepare("UPDATE alert_rules SET chat_id=?, updated_at=? WHERE chat_id IS NULL OR chat_id='' OR chat_id NOT GLOB '-[0-9]*' AND chat_id NOT GLOB '[0-9]*'").bind(chatId, now),
  ]);
  return true;
}
