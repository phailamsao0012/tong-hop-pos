// Chế độ demo (04/10/2026, anh Vũ): cùng mã nguồn với web thật, chạy ở một Worker riêng (DEMO_MODE=1) với kho dữ liệu D1 riêng.
// Pancake POS và web nhân sự được thay bằng bản giả (lib/demo/world.ts) nên đồng bộ, số liệu ngày, KPI, báo cáo chạy đúng công thức thật
// trên người và số ảo. Không có đường nào từ bản demo chạm tới dữ liệu thật: khác Worker, khác D1, không có khóa Pancake, không nối web nhân sự.
import { env } from 'cloudflare:workers';
import { hashPassword } from '@/lib/auth';
import { ALL_VIEWS } from '@/lib/access';
import { ensureAdCostSchema } from '@/lib/ad-costs';
import { POS } from '@/lib/report-model';
import { setPancakeTransport } from '@/lib/pancake';
import { fakePancake } from './fake-pancake';
import { DEMO_START, STAFF, UNITS, addDay, dayData, hrSnapshot, toSourceOrder, vnDayOfMs } from './world';

export const isDemo = () => env.DEMO_MODE === '1';

/** Mật khẩu chung của các tài khoản demo (ghi công khai trên trang đăng nhập demo). */
export const DEMO_PASSWORD = 'demo@2026';
const staffNamed = (unit: string, level: string) => STAFF.find((s) => s.unit === unit && s.level === level)!;
const SALE_VIEWS = ['center', 'overview', 'shift', 'sale-overview', 'compare', 'batches', 'sale-analytics', 'sale-quality', 'sale-teams', 'products', 'monthly'];
const CSKH_VIEWS = ['center', 'cskh-overview', 'calls', 'care', 'repurchase', 'dormant', 'origin', 'cskh-analytics', 'cskh-teams', 'customers', 'customer360'];
export const DEMO_ACCOUNTS = [
  { email: 'chu@demo.megatech.vn', name: 'Chủ hệ thống (demo)', role: 'owner', title: 'Chủ hệ thống', team: 'all', views: null as string[] | null, note: 'Xem và cấu hình mọi thứ' },
  { email: 'giamdoc@demo.megatech.vn', name: STAFF.find((s) => s.level === 'gd')!.name, role: 'director', title: 'Giám đốc', team: 'all', views: ALL_VIEWS, note: 'Xem mọi trang số liệu, trừ KPI' },
  { email: 'truongphong@demo.megatech.vn', name: staffNamed('kd-hn', 'tp').name, role: 'lead', title: 'Trưởng phòng Kinh doanh HN', team: 'all', views: [...new Set([...SALE_VIEWS, ...CSKH_VIEWS])], note: 'Sale + CSKH' },
  { email: 'leader.sale@demo.megatech.vn', name: staffNamed('sale-hn-1', 'leader').name, role: 'lead', title: 'Leader Sale', team: 'sale', views: SALE_VIEWS, note: 'Chỉ khối Sale' },
  { email: 'leader.cskh@demo.megatech.vn', name: staffNamed('cskh-hn-1', 'leader').name, role: 'lead', title: 'Leader CSKH', team: 'cskh', views: CSKH_VIEWS, note: 'Chỉ khối CSKH' },
  { email: 'nhanvien@demo.megatech.vn', name: STAFF.find((s) => s.unit === 'sale-hn-1' && s.level === 'nv')!.name, role: 'staff', title: 'Nhân viên Sale', team: 'sale', views: ['shift', 'sale-overview', 'compare'], note: 'Vài trang Sale' },
] as const;

/** Thao tác bị khóa trong bản demo (để người thử sau không bị khóa ngoài hay mất tài khoản demo). null = được phép. */
export function demoBlocked(method: string, path: string): string | null {
  if (method === 'GET' || method === 'HEAD') return null;
  const locked = ['/api/users', '/api/auth/password', '/api/auth/totp', '/api/auth/passkey', '/api/auth/reset', '/api/auth/security', '/api/auth/setup',
    '/api/config', '/api/connection', '/api/telegram', '/api/import', '/api/dispatch', '/api/recruit'];
  return locked.some((p) => path === p || path.startsWith(`${p}/`)) ? 'Bản demo không cho đổi mục này (tài khoản, bảo mật, cấu hình kết nối). Các trang số liệu vẫn dùng bình thường.' : null;
}

let installed = false;
/** Nối Pancake POS giả: mọi lời gọi Pancake (đồng bộ, Chia số, đọc cấu hình) trả dữ liệu ảo. Gọi nhiều lần vẫn an toàn.
 * (Không thay fetch toàn cục: vinext tự bọc fetch nên thứ tự nạp module không chắc.) Telegram và gửi thư không có khóa nên không chạy. */
export function installDemo() {
  if (installed || !isDemo()) return;
  installed = true;
  setPancakeTransport(async (url, init) => {
    const [status, body] = fakePancake((init.method ?? 'GET').toUpperCase(), url);
    return Response.json(body, { status });
  });
}

/** Web nhân sự giả: chỉ có ảnh chụp /api/v1/snapshot (team, Leader, Trưởng phòng, chi nhánh). */
export function demoHrFetch(path: string): Response {
  if (path.split('?')[0] === '/api/v1/snapshot') return Response.json(hrSnapshot());
  return Response.json({ error: 'Bản demo không nối web nhân sự.' }, { status: 503 });
}

let seededAt = 0;
/** Tạo tài khoản demo, bật nguồn team theo web nhân sự, mục tiêu tháng và chi phí quảng cáo ảo. Chạy lại tối đa mỗi giờ mỗi isolate. */
export async function ensureDemoSeed() {
  if (!isDemo() || Date.now() - seededAt < 3600000) return;
  seededAt = Date.now();
  const db = env.DB;
  const now = new Date().toISOString();
  const has = await db.prepare('SELECT COUNT(*) AS n FROM users').first<{ n: number }>();
  if (!Number(has?.n)) {
    const hash = await hashPassword(DEMO_PASSWORD);
    await db.batch(DEMO_ACCOUNTS.map((a) => db.prepare('INSERT OR IGNORE INTO users (id,email,name,password_hash,role,disabled,created_at,updated_at,title,views_json,pos_ids_json,team) VALUES (?,?,?,?,?,0,?,?,?,?,?,?)')
      .bind(crypto.randomUUID(), a.email, a.name, hash, a.role, now, now, a.title, a.views ? JSON.stringify(a.views) : '', '', a.team)));
  }
  await db.prepare("INSERT INTO app_settings (key,value,updated_at) VALUES ('team_source','hr',?) ON CONFLICT(key) DO NOTHING").bind(now).run();
  await resetWorldIfChanged();
  // Tên Pancake ảo có hậu tố bộ phận từ 08/10/2026 (chỉ tính doanh số người có hậu tố): cho lượt Cron kế tiếp kéo lại danh sách nhân viên một lần.
  const names = await db.prepare("SELECT value FROM app_settings WHERE key='demo_pancake_names'").first<{ value: string }>();
  if (names?.value !== '1') {
    await db.prepare('UPDATE pos_shops SET users_synced_at=NULL').run();
    await db.prepare("INSERT INTO app_settings (key,value,updated_at) VALUES ('demo_pancake_names','1',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at").bind(now).run();
  }
  // Kéo web nhân sự giả ngay lần đầu (sau đó Cron kéo 5 phút một lần như web thật).
  const hr = await import('@/lib/hr-sync');
  if (!(await hr.hrSyncState()).pulledAt) await hr.pullHr();
  await seedAdCosts();
  await seedTargets();
}

/**
 * Phiên bản dữ liệu ảo: tăng khi đổi cách sinh đơn (lib/demo/world.ts). Khác bản đã nạp thì xóa đơn ảo và số liệu ngày rồi cho đồng bộ
 * kéo lại từ đầu, vì đơn đã nạp không tự đổi lịch sử. Chỉ chạy ở bản demo (D1 riêng, dữ liệu ảo). 2 = thêm team Vận đơn (08/10/2026).
 */
const WORLD_VERSION = '2';
async function resetWorldIfChanged() {
  const db = env.DB;
  const cur = await db.prepare("SELECT value FROM app_settings WHERE key='demo_world'").first<{ value: string }>();
  if (cur?.value === WORLD_VERSION) return;
  // Xóa theo từng POS cho nhẹ (D1 dễ quá thời gian với một câu xóa lớn).
  for (const p of POS) {
    await db.prepare('DELETE FROM raw_pos_order_items WHERE pos_id=?').bind(p.id).run();
    await db.prepare('DELETE FROM raw_pos_orders WHERE pos_id=?').bind(p.id).run();
    await db.batch(['stats_daily', 'stats_daily_product', 'customer_stats', 'customer_seller_stats'].map((t) => db.prepare(`DELETE FROM ${t} WHERE pos_id=?`).bind(p.id)));
  }
  await db.prepare('UPDATE pos_shops SET cursor=NULL').run();
  await db.prepare("INSERT INTO app_settings (key,value,updated_at) VALUES ('demo_world',?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at")
    .bind(WORLD_VERSION, new Date().toISOString()).run();
}

const yesterdayVn = () => addDay(vnDayOfMs(Date.now()), -1);

/** Chi phí quảng cáo ảo theo marketer và ngày: số data marketer đó mang về × giá mỗi data (90–140 nghìn). */
async function seedAdCosts() {
  await ensureAdCostSchema();
  const db = env.DB;
  const last = await db.prepare("SELECT MAX(day) AS d FROM ad_costs WHERE created_by='demo'").first<{ d: string | null }>();
  const until = yesterdayVn();
  const stmts: D1PreparedStatement[] = [];
  const now = new Date().toISOString();
  for (let day = last?.d ? addDay(last.d, 1) : DEMO_START; day <= until && stmts.length < 2000; day = addDay(day, 1)) {
    const leads = new Map<string, number>();
    for (const p of POS) for (const o of dayData(p.id, day).orders) if (o.lead && o.marketerId) leads.set(o.marketerId, (leads.get(o.marketerId) ?? 0) + 1);
    for (const [marketerId, n] of leads) {
      const cpl = 90000 + (Number.parseInt(marketerId.slice(0, 4), 16) % 51) * 1000;
      stmts.push(db.prepare('INSERT INTO ad_costs (id,day,marketer_id,amount,campaign,note,created_by,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)')
        .bind(`demo:${day}:${marketerId}`, day, marketerId, Math.round(n * cpl / 1000) * 1000, 'Chiến dịch demo', null, 'demo', now, now));
    }
  }
  for (let i = 0; i < stmts.length; i += 50) await db.batch(stmts.slice(i, i + 50));
}

/** Mục tiêu tháng (POS, nhân viên, team) cho tháng trước và tháng này: lấy doanh thu chốt thực tế của dữ liệu ảo, làm tròn và nâng nhẹ. */
async function seedTargets() {
  const db = env.DB;
  const month = vnDayOfMs(Date.now()).slice(0, 7);
  const prev = addDay(`${month}-01`, -1).slice(0, 7);
  const stmts: D1PreparedStatement[] = [];
  const now = new Date().toISOString();
  for (const m of [prev, month]) {
    if (m < DEMO_START.slice(0, 7)) continue;
    const exists = await db.prepare("SELECT 1 AS x FROM targets WHERE month=? AND updated_by='demo' LIMIT 1").bind(m).first();
    if (exists) continue;
    // Doanh thu chốt cả tháng theo dữ liệu ảo (kể cả phần chưa tới), để mục tiêu sát thực tế.
    const pos = new Map<string, [number, number]>(), emp = new Map<string, [number, number]>(), team = new Map<string, [number, number]>();
    const add = (map: Map<string, [number, number]>, k: string, v: number) => { const x = map.get(k) ?? [0, 0]; x[0] += v; x[1]++; map.set(k, x); };
    for (let day = `${m}-01`; day.startsWith(m); day = addDay(day, 1)) for (const p of POS) for (const o of dayData(p.id, day).orders) {
      const src = toSourceOrder(o, Number.MAX_SAFE_INTEGER);
      if (!src || !o.events.some((e) => e.status === 1)) continue;
      const net = src.total_price_after_sub_discount ?? 0;
      add(pos, p.id, net);
      if (o.sellerId) { add(emp, o.sellerId, net); const unit = STAFF.find((s) => s.id === o.sellerId)?.unit; if (unit && UNITS[unit]?.kind === 'team') add(team, `dept-${unit}`, net); }
    }
    const round = (v: number) => Math.max(1, Math.round(v * 1.06 / 5e6)) * 5e6;
    const push = (scope: string, refId: string, [rev, n]: [number, number], workingDays: number | null) => stmts.push(db.prepare('INSERT OR IGNORE INTO targets (id,month,scope,ref_id,revenue,closed_orders,working_days,updated_by,updated_at) VALUES (?,?,?,?,?,?,?,?,?)')
      .bind(`${m}:${scope}:${refId}`, m, scope, refId, round(rev), Math.round(n * 1.05), workingDays, 'demo', now));
    for (const [k, v] of pos) push('pos', k, v, null);
    for (const [k, v] of emp) push('employee', k, v, 26);
    for (const [k, v] of team) push('team', k, v, null);
  }
  for (let i = 0; i < stmts.length; i += 50) await db.batch(stmts.slice(i, i + 50));
}
