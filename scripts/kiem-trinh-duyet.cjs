// Kiểm bằng trình duyệt trên bản demo vừa deploy (người và số liệu ảo): tự khóa, bấm số mở trang, biểu đồ mới, quy tắc hậu tố.
// Chạy: BASE=https://demo.tonghopposmegatech.io.vn OUT=kiem-anh node scripts/kiem-trinh-duyet.cjs (cần gói playwright).
// Chỉ in Đạt / Không đạt và số đếm, không in phiên đăng nhập hay dữ liệu đơn.
const { chromium } = require('playwright');
const fs = require('node:fs');

const BASE = (process.env.BASE || 'https://demo.tonghopposmegatech.io.vn').replace(/\/$/, '');
const OUT = process.env.OUT || 'kiem-anh';
const EMAIL = 'chu@demo.megatech.vn', PASSWORD = 'demo@2026';
const results = [];
const check = (name, ok, note = '') => { results.push({ name, ok: !!ok, note }); console.log(`${ok ? 'ĐẠT     ' : 'KHÔNG ĐẠT'} ${name}${note ? ` (${note})` : ''}`); };
const vnDate = (d) => new Date(d.getTime() + 7 * 3600000).toISOString().slice(0, 10);

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const b = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, locale: 'vi-VN' });
  // Phông Google và dịch vụ ngoài không cần cho kiểm thử, chặn để trang không treo.
  await ctx.route((url) => !url.href.startsWith(BASE), (r) => r.abort());
  const login = await ctx.request.post(`${BASE}/api/auth/login`, { data: { email: EMAIL, password: PASSWORD } });
  check('Đăng nhập tài khoản demo', login.ok(), `HTTP ${login.status()}`);
  const p = await ctx.newPage();
  const errors = [];
  p.on('pageerror', (e) => errors.push(e.message));
  const shot = (name) => p.screenshot({ path: `${OUT}/${name}.png` });
  const activeNav = async () => (await p.locator('.nav-item[aria-current="page"]').allInnerTexts()).join(' | ');
  const go = async (view) => { await p.goto(`${BASE}/?view=${view}`, { waitUntil: 'domcontentloaded' }); await p.waitForTimeout(1500); };

  // 1. Tự khóa màn hình.
  try {
    await go('security');
    const seg = p.getByRole('radiogroup', { name: 'Thời gian tự khóa' }).or(p.locator('[aria-label="Thời gian tự khóa"]')).first();
    await seg.waitFor({ timeout: 30000 });
    const labels = await seg.locator('button, [role="radio"]').allInnerTexts();
    check('Bảo mật: có chọn thời gian tự khóa (chủ hệ thống thấy "Không tự khóa")', labels.length === 5 && labels.some((l) => l.includes('Không tự khóa')), labels.join(', '));
    await seg.getByText('1 giờ', { exact: true }).click();
    const saved = await p.evaluate(() => localStorage.getItem('thp_idle_minutes'));
    check('Chọn 1 giờ được lưu trên máy', saved === '60', `thp_idle_minutes=${saved}`);
    await p.evaluate(() => { localStorage.setItem('thp_active_at', String(Date.now() - 61 * 60000)); document.dispatchEvent(new Event('visibilitychange')); });
    const lock = p.getByRole('dialog', { name: 'Web đang khóa' });
    await lock.waitFor({ timeout: 10000 });
    check('Không dùng quá 1 giờ thì khóa màn hình', await lock.isVisible(), await lock.locator('p').first().innerText());
    await shot('1-tu-khoa');
    await lock.locator('#lock-password').fill(PASSWORD);
    await lock.getByRole('button', { name: 'Mở khóa' }).click();
    await lock.waitFor({ state: 'detached', timeout: 15000 });
    check('Mở khóa bằng mật khẩu', true);
    await p.evaluate(() => localStorage.setItem('thp_idle_minutes', '30'));
  } catch (e) { check('Tự khóa màn hình', false, e.message.split('\n')[0]); }

  // 2. Tổng quan POS: ô biểu đồ bộ phận, 4 bảng, biểu đồ từng POS, ô không tính doanh số.
  try {
    await go('overview');
    await p.locator('h2', { hasText: /^Sale/ }).first().waitFor({ timeout: 60000 });
    await p.waitForTimeout(4000);
    const tiles = await p.locator('button[title^="Mở trang "]').allInnerTexts();
    check('Nhận xét xu hướng là 4 ô biểu đồ theo bộ phận', ['Sale', 'CSKH', 'MKT', 'Vận đơn'].every((d) => tiles.some((t) => t.startsWith(d))), tiles.join(', '));
    const minis = await p.locator('svg[aria-label$=" theo ngày"], svg[aria-label$=" theo tuần"], svg[aria-label$=" theo tháng"]').count();
    check('Doanh thu từng POS: mỗi POS một biểu đồ nhỏ', minis >= 2, `${minis} biểu đồ`);
    const unc = p.getByText(/Không tính doanh số: \d+ người/).first();
    check('Có dòng "Không tính doanh số" (người không có hậu tố)', await unc.isVisible().catch(() => false), await unc.innerText().catch(() => 'không thấy'));
    await shot('2-tong-quan');
    await p.locator('button[title="Mở trang Vận đơn"]').first().click();
    await p.waitForTimeout(2500);
    const nav1 = await activeNav();
    check('Bấm ô Vận đơn mở trang Vận đơn', /Vận đơn/.test(nav1), nav1);
  } catch (e) { check('Tổng quan POS', false, e.message.split('\n')[0]); }

  // 3. Bấm số ở 4 bảng mở trang đã có.
  try {
    await go('overview');
    const saleBoard = p.locator('section', { has: p.locator('h2', { hasText: /^Sale/ }) }).first();
    await saleBoard.waitFor({ timeout: 60000 });
    await saleBoard.locator('header > button').click();
    await p.waitForTimeout(2500);
    const nav2 = await activeNav();
    check('Bấm doanh thu bảng Sale mở trang Sale', /Sale/.test(nav2), nav2);
    await shot('3-bam-so-sale');
  } catch (e) { check('Bấm số ở 4 bảng', false, e.message.split('\n')[0]); }

  // 4. Trạng thái đơn theo ngày: bấm một đoạn cột mở Đơn nguồn lọc đúng ngày.
  try {
    await go('overview');
    const st = p.locator('section[aria-label="Trạng thái đơn"]');
    await st.waitFor({ timeout: 60000 });
    await st.getByText('Theo ngày', { exact: true }).click();
    await p.waitForTimeout(1500);
    const svg = st.locator('svg').first();
    await svg.scrollIntoViewIfNeeded();
    const rects = await svg.locator('rect').all();
    let target = null;
    for (const r of rects.reverse()) { const bb = await r.boundingBox(); if (bb && bb.height > 12 && bb.width > 6) { target = bb; break; } }
    if (!target) throw new Error('không thấy cột');
    await p.mouse.click(target.x + target.width / 2, target.y + target.height / 2);
    await p.waitForTimeout(4000);
    const note = p.getByText(/Đang xem đơn tạo ngày/).first();
    check('Bấm đoạn cột mở Đơn nguồn lọc theo ngày', await note.isVisible().catch(() => false), await note.innerText().catch(() => 'không thấy'));
    await p.evaluate(() => window.scrollTo(0, 0));
    await shot('4-bam-cot-ngay');
  } catch (e) { check('Trạng thái đơn theo ngày', false, e.message.split('\n')[0]); }

  // 5. Quy tắc hậu tố: số khớp nhau giữa các trang (Sale + CSKH = tổng đơn chốt), Vận đơn vẫn đếm đơn gửi.
  try {
    const end = vnDate(new Date()), start = `${end.slice(0, 8)}01`;
    const q = `start=${start}&end=${end}&posIds=`;
    const get = (path) => p.evaluate((u) => fetch(u, { cache: 'no-store' }).then((r) => r.json()), path);
    const s = await get(`/api/reports/sections?${q}&productSegment=all`);
    const o = await get(`/api/reports/overview?${q}&groupBy=day&compare=previous&team=all&productSegment=all&orderOrigin=all&marketerId=`);
    const u = await get(`/api/reports/uncounted?${q}`);
    const total = o.current?.total?.closedOrders, sum = (s.sale?.orders ?? 0) + (s.cskh?.orders ?? 0);
    check('Sale + CSKH = tổng đơn chốt Tổng quan', total !== undefined && sum === total, `${sum} / ${total}`);
    check('Có danh sách người không tính doanh số', Array.isArray(u.sellers), `${u.sellers?.length ?? 0} người bán, ${u.marketers?.length ?? 0} marketer`);
    check('Vận đơn vẫn có đơn gửi đi', (s.shipping?.total?.orders ?? 0) > 0, `${s.shipping?.total?.orders} đơn`);
  } catch (e) { check('Quy tắc hậu tố', false, e.message.split('\n')[0]); }

  check('Không có lỗi JavaScript trên trang', errors.length === 0, errors.slice(0, 3).join(' | '));
  fs.writeFileSync(`${OUT}/ket-qua.json`, JSON.stringify({ base: BASE, at: new Date().toISOString(), results }, null, 2));
  await b.close();
  const bad = results.filter((r) => !r.ok).length;
  console.log(bad ? `${bad} mục KHÔNG ĐẠT` : 'Tất cả ĐẠT');
  process.exit(bad ? 1 : 0);
})().catch((e) => { console.error(e.message); process.exit(1); });
