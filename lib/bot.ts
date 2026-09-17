// Bot Telegram: nhận lệnh qua webhook, trả lời báo cáo từ cùng bộ tính với web.
// Chỉ chat trong bảng telegram_chats (hoặc chat nhận cảnh báo) mới được dùng.
import { env } from 'cloudflare:workers';
import { customerDetail, findCustomers } from '@/lib/customer-report';
import { hotCloseByEmployee } from '@/lib/hot-close';
import { overviewReport, type OverviewReport } from '@/lib/overview-report';
import { POS } from '@/lib/report-model';
import { todayVn } from '@/lib/report-time';
import { repurchaseReport } from '@/lib/repurchase-report';
import { normalizeName } from '@/lib/shop-map';
import { loadRules, shiftWindow } from '@/lib/alerts';
import { KEYBOARD, parsePeriod, parsePos, splitMessage, type Period } from '@/lib/bot-parse';
import { CHART_KINDS, buildChart, parseChartArgs } from '@/lib/bot-charts';

export { KEYBOARD, parsePeriod, parsePos, splitMessage };

export type TelegramUpdate = {
  update_id?: number;
  message?: { message_id?: number; text?: string; chat?: { id?: number; type?: string; title?: string; first_name?: string; last_name?: string; username?: string }; from?: { id?: number; first_name?: string; username?: string } };
  callback_query?: { id?: string; data?: string; from?: { id?: number; first_name?: string }; message?: { message_id?: number; chat?: { id?: number } } };
};

const vi = new Intl.NumberFormat('vi-VN');
const money = (n: number | null | undefined) => n === null || n === undefined ? '—' : `${vi.format(Math.round(n))} đ`;
const short = (n: number) => n >= 1e9 ? `${(n / 1e9).toFixed(2)} tỷ` : n >= 1e6 ? `${(n / 1e6).toFixed(1)} tr` : vi.format(Math.round(n));
const pct = (n: number | null) => n === null ? '—' : `${n.toFixed(1).replace('.', ',')}%`;
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const dmy = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;
const norm = (s: string) => normalizeName(s);
const timeVn = (iso: string | null) => iso ? new Date(iso.endsWith('Z') ? iso : `${iso}Z`).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' }) : '—';
const delta = (a: number, b: number | undefined) => b === undefined ? '' : !b ? '' : ` (${a >= b ? '+' : ''}${((a - b) / b * 100).toFixed(0)}%)`;

async function employeeDirectory() {
  const rows = await env.DB.prepare("SELECT user_id, MAX(name) AS name, MAX(department) AS department FROM pos_users WHERE name<>'' GROUP BY user_id")
    .all<{ user_id: string; name: string; department: string | null }>();
  return rows.results;
}
function matchEmployees(dir: { user_id: string; name: string; department: string | null }[], query: string) {
  const q = norm(query);
  if (!q) return [];
  return dir.filter((e) => norm(e.name).includes(q));
}

// ---------- định dạng ----------
function overviewLines(r: OverviewReport, title: string) {
  const c = r.current.total, p = r.compare?.total;
  const lines = [
    `📊 <b>${esc(title)}</b>`,
    `Kỳ ${dmy(r.current.period.start)}${r.current.period.start !== r.current.period.end ? `–${dmy(r.current.period.end)}` : ''} · cập nhật ${timeVn(r.syncedAt)}`,
    '',
    `Đơn tạo mới: <b>${vi.format(c.orders)}</b>${delta(c.orders, p?.orders)}`,
    `Đơn chốt: <b>${vi.format(c.closedOrders)}</b>${delta(c.closedOrders, p?.closedOrders)} · tỷ lệ chốt/tạo ${pct(c.closeRate)}`,
    `Doanh thu: <b>${money(c.closedNet)}</b>${delta(c.closedNet, p?.closedNet)}`,
    `Doanh số: ${money(c.closedGross)} · giảm giá ${money(c.closedDiscount)}`,
    `GTTB: ${money(c.averageOrder)} · SL bán thực: ${vi.format(c.closedQuantity)} · khách: ${c.closedCustomers === null ? '—' : vi.format(c.closedCustomers)}`,
    `Giao TC: ${vi.format(c.groups.delivered.orders)} đơn · ${money(c.groups.delivered.net)}`,
    `Hoàn: ${vi.format(c.groups.returned.orders)} · Hủy: ${vi.format(c.groups.cancelled.orders)} · Đang giao: ${vi.format(c.groups.shipping.orders)}`,
  ];
  if (r.current.byPos.length > 1) {
    lines.push('', '<b>Theo POS</b>');
    for (const pos of [...r.current.byPos].sort((a, b) => b.closedNet - a.closedNet)) {
      const name = POS.find((x) => x.id === pos.posId)?.name ?? pos.posId;
      lines.push(`• ${esc(name)}: ${vi.format(pos.closedOrders)} chốt / ${vi.format(pos.orders)} tạo · ${short(pos.closedNet)}`);
    }
  }
  if (p) lines.push('', `<i>So với kỳ liền trước (${dmy(r.compare!.period.start)}–${dmy(r.compare!.period.end)})</i>`);
  return lines.join('\n');
}

function employeeLines(r: OverviewReport, dept: string | null, limit = 15) {
  const rows = r.current.byEmployee.filter((e) => e.sellerId && (!dept || (e.department ?? '').toLowerCase().includes(dept.toLowerCase())) && (e.assignedOrders || e.closedOrders || e.orders))
    .sort((a, b) => b.closedNet - a.closedNet).slice(0, limit);
  const lines = [`🏆 <b>Nhân viên · ${dept ? esc(dept) : 'mọi bộ phận'}</b> · ${dmy(r.current.period.start)}${r.current.period.start !== r.current.period.end ? `–${dmy(r.current.period.end)}` : ''}`, ''];
  rows.forEach((e, i) => lines.push(`${i + 1}. <b>${esc(e.name)}</b>: ${vi.format(e.closedOrders)} chốt / ${vi.format(e.assignedOrders)} chia (${pct(e.assignedCloseRate)}) · ${short(e.closedNet)}`));
  if (!rows.length) lines.push('Không có dữ liệu.');
  return lines.join('\n');
}

function oneEmployeeLines(r: OverviewReport, name: string, hot: { received: number; closed: number; rate: number | null; hotOrders: number; hotValue: number } | null, period: Period) {
  const e = r.current.byEmployee[0];
  const p = r.compare?.byEmployee[0];
  const lines = [`👤 <b>${esc(name)}</b> · ${period.label}`, ''];
  if (!e) lines.push('Không có đơn nào trong kỳ.');
  else lines.push(
    `Đơn chia: <b>${vi.format(e.assignedOrders)}</b> · Đơn chốt: <b>${vi.format(e.closedOrders)}</b> · Tỷ lệ chốt: <b>${pct(e.assignedCloseRate)}</b>`,
    `Doanh thu: <b>${money(e.closedNet)}</b>${delta(e.closedNet, p?.closedNet)} · doanh số ${money(e.closedGross)}`,
    `GTTB: ${money(e.averageOrder)} · SL bán thực: ${vi.format(e.closedQuantity)}`,
    `Đơn tạo: ${vi.format(e.orders)} · Giao TC: ${vi.format(e.groups.delivered.orders)} (${money(e.groups.delivered.net)}) · Hoàn ${vi.format(e.groups.returned.orders)} · Hủy ${vi.format(e.groups.cancelled.orders)}`,
  );
  if (hot) lines.push('', `🔥 Chốt nóng theo SĐT (${period.label}): nhận <b>${hot.received}</b> · chốt <b>${hot.closed}</b> · tỷ lệ <b>${pct(hot.rate)}</b> · ${hot.hotOrders} đơn · ${money(hot.hotValue)}`);
  return lines.join('\n');
}

// ---------- xử lý lệnh ----------
export const HELP = [
  '🤖 <b>Lệnh bot Tổng hợp POS</b>',
  '',
  '<b>/baocao</b> [kỳ] [pos] — tổng quan: đơn tạo, đơn chốt, doanh thu, GTTB, SL, khách, giao/hoàn/hủy',
  '<b>/pos</b> [kỳ] — từng POS',
  '<b>/nhanvien</b> &lt;tên&gt; [kỳ] — mọi số liệu của một nhân viên (đơn chia/chốt, tỷ lệ, doanh thu, chốt nóng)',
  '<b>/top</b> [kỳ] [bộ phận] — xếp hạng nhân viên theo doanh thu (mặc định SALE)',
  '<b>/chotnong</b> [kỳ|ca] — tỷ lệ chốt nóng theo SĐT từng nhân viên (mặc định ca hôm nay)',
  '<b>/sanpham</b> [kỳ] [pos] — sản phẩm bán chạy',
  '<b>/mualai</b> [kỳ] — mua lại &amp; Upsell',
  '<b>/khach</b> &lt;SĐT hoặc tên&gt; — hồ sơ khách',
  '<b>/bieudo</b> [loại] [kỳ] [pos] — ảnh biểu đồ: doanhthu · donchot · pos · possong · top · tyle · trangthai',
  '<b>/dongbo</b> — trạng thái đồng bộ',
  '',
  '<b>Kỳ</b>: homnay · homqua · tuan · tuantruoc · thang · thangtruoc · 7ngay · 30ngay · t8 · 15/9 · 1/9-15/9',
  '<b>POS</b>: gao · apex · thuysan · bio · megaroot · oxy',
  'Ví dụ: <code>/baocao thang gao</code> · <code>/nhanvien Huong tuan</code> · <code>/top thangtruoc CSKH</code>',
].join('\n');

/** Kết quả lệnh: chuỗi HTML, hoặc ảnh (photo:URL + chú thích) khi là biểu đồ. */
export type CommandPart = string | { photo: string; caption: string };

export const commandText = async (text: string) => { const parts = await handleCommand(text); const first = parts[0]; return typeof first === 'string' ? first : first.caption; };

export async function handleCommand(text: string): Promise<CommandPart[]> {
  const raw = text.trim();
  const [cmdRaw, ...args] = raw.split(/\s+/);
  const cmd = norm(cmdRaw.replace(/^\//, '').replace(/@\w+$/, ''));
  const { period, rest: afterPeriod } = parsePeriod(args);
  const { posIds, rest } = parsePos(afterPeriod);
  const posLabel = posIds.length ? posIds.map((id) => POS.find((p) => p.id === id)?.name ?? id).join(', ') : 'tất cả POS';

  if (['start', 'help', 'trogiup', 'menu'].includes(cmd)) return [HELP];
  if (['bieudo', 'chart', 'bd'].includes(cmd)) {
    const { kind, period, posIds: chartPos } = parseChartArgs(args, parsePos);
    const { url, caption } = await buildChart(kind, period, chartPos);
    return [{ photo: url, caption }, `Loại biểu đồ: ${Object.entries(CHART_KINDS).map(([k, v]) => `<code>${k}</code> (${v.toLowerCase()})`).join(', ')}.`];
  }

  if (['baocao', 'bc', 'tongquan', 'report'].includes(cmd)) {
    const r = await overviewReport({ posIds, start: period.start, end: period.end, compare: period.compare ?? 'none' });
    return [overviewLines(r, `Báo cáo ${period.label} · ${posLabel}`)];
  }
  if (cmd === 'pos') {
    const r = await overviewReport({ posIds: [], start: period.start, end: period.end, compare: period.compare ?? 'none' });
    const lines = [`🏪 <b>Theo POS · ${period.label}</b>`, ''];
    for (const p of POS) {
      const x = r.current.byPos.find((y) => y.posId === p.id);
      const prev = r.compare?.byPos.find((y) => y.posId === p.id);
      lines.push(x ? `<b>${esc(p.name)}</b>: ${vi.format(x.closedOrders)} chốt / ${vi.format(x.orders)} tạo · DT <b>${money(x.closedNet)}</b>${delta(x.closedNet, prev?.closedNet)} · GTTB ${short(x.averageOrder ?? 0)} · giao TC ${vi.format(x.groups.delivered.orders)} · hoàn ${vi.format(x.groups.returned.orders)}` : `<b>${esc(p.name)}</b>: không có đơn`);
    }
    return [lines.join('\n')];
  }
  if (['nhanvien', 'nv', 'sale'].includes(cmd)) {
    const dir = await employeeDirectory();
    const query = rest.join(' ');
    if (!query) return [`Cú pháp: <code>/nhanvien &lt;tên&gt; [kỳ]</code>\nVí dụ: <code>/nhanvien Huong</code>, <code>/nhanvien Quynh thang</code>`];
    const found = matchEmployees(dir, query);
    if (!found.length) return [`Không tìm thấy nhân viên tên "${esc(query)}".`];
    if (found.length > 5) return [`Có ${found.length} nhân viên khớp "${esc(query)}": ${found.slice(0, 12).map((e) => esc(e.name)).join(', ')}… Gõ tên cụ thể hơn.`];
    const out: string[] = [];
    const window = { startUtc: '', endUtc: '' };
    for (const e of found) {
      const r = await overviewReport({ posIds, start: period.start, end: period.end, employeeIds: [e.user_id], compare: period.compare ?? 'none' });
      const { vnRangeUtc } = await import('@/lib/report-time');
      const range = vnRangeUtc(period.start, period.end); window.startUtc = range.startUtc; window.endUtc = range.endUtc;
      const hot = (await hotCloseByEmployee(env.DB, posIds.length ? posIds : POS.map((p) => p.id), range.startUtc, range.endUtc, [e.user_id]))[0] ?? null;
      out.push(oneEmployeeLines(r, `${e.name}${e.department ? ` (${e.department})` : ''}`, hot, period));
    }
    return out;
  }
  if (['top', 'xephang', 'bxh'].includes(cmd)) {
    const dept = rest.join(' ') || 'sale';
    const r = await overviewReport({ posIds, start: period.start, end: period.end });
    const hasDept = r.current.byEmployee.some((e) => (e.department ?? '').toLowerCase().includes(dept.toLowerCase()));
    return [employeeLines(r, hasDept ? dept : null)];
  }
  if (['chotnong', 'cn', 'hot'].includes(cmd)) {
    const rules = await loadRules(env.DB);
    const rule = rules[0];
    const hasPeriodArg = args.some((a) => a !== rest[0]) && period.label !== 'hôm nay';
    let startUtc: string, endUtc: string, label: string;
    if (!hasPeriodArg && rule) { const w = shiftWindow(todayVn(), rule.shiftStart, rule.shiftEnd); startUtc = w.startUtc; endUtc = w.endUtc; label = `ca ${rule.shiftStart}–${rule.shiftEnd} hôm nay`; }
    else { const { vnRangeUtc } = await import('@/lib/report-time'); const w = vnRangeUtc(period.start, period.end); startUtc = w.startUtc; endUtc = w.endUtc; label = period.label; }
    const rows = await hotCloseByEmployee(env.DB, posIds.length ? posIds : POS.map((p) => p.id), startUtc, endUtc, rule?.employeeIds ?? []);
    const dir = await employeeDirectory();
    const name = (id: string) => dir.find((e) => e.user_id === id)?.name ?? `NV ${id.slice(0, 8)}`;
    const lines = [`🔥 <b>Chốt nóng theo SĐT · ${esc(label)}</b> · ${esc(posLabel)}`, ''];
    const shown = rows.filter((r) => r.received > 0).slice(0, 25);
    shown.forEach((r) => lines.push(`• <b>${esc(name(r.employeeId))}</b>: nhận ${r.received} · chốt ${r.closed} · <b>${pct(r.rate)}</b>${rule && r.rate !== null && r.received >= rule.minReceived && r.rate < rule.threshold ? ' ⚠️' : ''} · ${r.hotOrders} đơn · ${short(r.hotValue)}`));
    if (!shown.length) lines.push('Chưa có số được giao trong khung này.');
    const total = rows.reduce((a, r) => ({ received: a.received + r.received, closed: a.closed + r.closed }), { received: 0, closed: 0 });
    lines.push('', `Tổng: nhận ${total.received} · chốt ${total.closed} · ${pct(total.received ? total.closed / total.received * 100 : null)}${rule ? ` · ngưỡng ${rule.threshold}%` : ''}`);
    return [lines.join('\n')];
  }
  if (['sanpham', 'sp', 'product'].includes(cmd)) {
    const r = await overviewReport({ posIds, start: period.start, end: period.end });
    const lines = [`📦 <b>Sản phẩm · ${period.label} · ${esc(posLabel)}</b>`, ''];
    r.current.byProduct.slice(0, 15).forEach((p, i) => lines.push(`${i + 1}. ${esc(p.name)} (${esc(POS.find((x) => x.id === p.posId)?.name ?? '')}): ${vi.format(p.closedQuantity)} sp · ${short(p.closedTotal)} · giao TC ${vi.format(p.deliveredQuantity)}`));
    if (!r.current.byProduct.length) lines.push('Không có dữ liệu.');
    return [lines.join('\n')];
  }
  if (['mualai', 'upsell', 'ml'].includes(cmd)) {
    const r = await repurchaseReport(posIds, period.start, period.end);
    const lines = [`🔁 <b>Mua lại &amp; Upsell · ${period.label} · ${esc(posLabel)}</b>`, '', `Đơn mua thành công: ${vi.format(r.summary.successOrders)}`];
    for (const l of r.summary.levels) lines.push(`• ${l.label}: ${vi.format(l.customers)} khách · ${vi.format(l.orders)} đơn · ${short(l.net)}`);
    lines.push(`Khách mua lại: <b>${vi.format(r.summary.repurchase.customers)}</b> · ${money(r.summary.repurchase.net)}`);
    if (r.byEmployee.length) { lines.push('', '<b>Theo nhân viên (mua lại)</b>'); r.byEmployee.slice(0, 10).forEach((e) => lines.push(`• ${esc(e.name)}: ${vi.format(e.repurchase.customers)} khách · ${short(e.repurchase.net)}`)); }
    return [lines.join('\n')];
  }
  if (['khach', 'kh', 'customer'].includes(cmd)) {
    const query = args.join(' ').trim();
    if (!query) return ['Cú pháp: <code>/khach 0912345678</code> hoặc <code>/khach Nguyen Van A</code>'];
    const found = await findCustomers(query, 6);
    if (!found.length) return [`Không tìm thấy khách "${esc(query)}".`];
    if (found.length > 1 && !(found.length <= 6 && found.every((f) => f.phone === found[0].phone))) {
      return [`Có ${found.length} khách khớp:\n${found.map((f) => `• ${esc(f.name || 'Không tên')} · ${f.phone} · ${esc(f.posName)} · ${f.success_orders} đơn TC · ${short(f.success_net)}`).join('\n')}\nGõ đúng SĐT để xem chi tiết.`];
    }
    const out: string[] = [];
    for (const f of found) {
      const d = await customerDetail(f.pos_id, f.phone);
      const s = d.stats;
      const lines = [`👤 <b>${esc(String(s?.name || 'Khách chưa có tên'))}</b> · ${f.phone} · ${esc(f.posName)}`, ''];
      if (s) lines.push(
        `Mua thành công: <b>${s.successOrders}</b> đơn · <b>${money(Number(s.successNet))}</b> · TB ${money(s.averageOrder)}`,
        `Đơn: ${s.orders} · chốt ${s.closedOrders} · hoàn ${s.returnedOrders} · hủy ${s.cancelledOrders}`,
        `Mua đầu: ${timeVn(String(s.firstSuccessAt ?? ''))} · gần nhất: ${timeVn(String(s.lastSuccessAt ?? ''))} · phụ trách: ${esc(String(s.sellerName ?? '—'))}`,
        `Sản phẩm (${s.productKinds} loại): ${(s.products as { name: string; quantity: number }[]).slice(0, 8).map((p) => `${esc(p.name)} ×${p.quantity}`).join(', ') || '—'}`,
        '', '<b>Đơn gần đây</b>',
      );
      d.orders.slice(0, 8).forEach((o) => lines.push(`• ${timeVn(String(o.createdAt))} · ${esc(String(o.statusName))} · ${money(Number(o.net))}${o.successRank ? ` · ${o.successRank === 1 ? 'lần đầu' : `upsell ${o.successRank - 1}`}` : ''}${o.items.length ? ` · ${esc(o.items.map((i) => `${i.name} ×${i.quantity}`).join(', ')).slice(0, 80)}` : ''}`));
      out.push(lines.join('\n'));
    }
    return out;
  }
  if (['dongbo', 'sync', 'trangthai'].includes(cmd)) {
    const shops = await env.DB.prepare('SELECT id,status,last_sync_at,cursor,last_error FROM pos_shops').all<{ id: string; status: string; last_sync_at: string | null; cursor: string | null; last_error: string | null }>();
    const counts = await env.DB.prepare('SELECT pos_id, COUNT(*) AS n FROM raw_pos_orders GROUP BY pos_id').all<{ pos_id: string; n: number }>();
    const lines = ['🔄 <b>Đồng bộ Pancake</b>', ''];
    for (const p of POS) {
      const s = shops.results.find((x) => x.id === p.id);
      let cur: { month?: string; completed?: boolean } = {};
      try { cur = JSON.parse(s?.cursor ?? '{}'); } catch { /* bỏ qua */ }
      lines.push(`• ${esc(p.name)}: ${vi.format(counts.results.find((c) => c.pos_id === p.id)?.n ?? 0)} đơn · cập nhật ${timeVn(s?.last_sync_at ?? null)} · lịch sử ${cur.completed ? 'đủ' : cur.month ? `đang lấy ${cur.month}` : 'chưa'}${s?.last_error ? ` · ⚠️ ${esc(s.last_error.slice(0, 60))}` : ''}`);
    }
    return [lines.join('\n')];
  }
  return [`Không hiểu lệnh "${esc(cmdRaw)}". Gõ /help để xem danh sách lệnh.`];
}

/** Kiểm tra chat được phép: có trong telegram_chats hoặc là chat nhận cảnh báo. */
export async function chatAllowed(chatId: string) {
  const [a, b] = await env.DB.batch([
    env.DB.prepare('SELECT 1 AS x FROM telegram_chats WHERE chat_id=?').bind(chatId),
    env.DB.prepare('SELECT 1 AS x FROM alert_rules WHERE chat_id=?').bind(chatId),
  ]);
  return a.results.length > 0 || b.results.length > 0;
}

