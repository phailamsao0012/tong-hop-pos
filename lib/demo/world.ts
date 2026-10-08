// "Thế giới" ảo của chế độ demo (04/10/2026): công ty, nhân sự, sản phẩm, khách, đơn, ghi chú CSKH — sinh tất định từ hạt giống,
// theo đúng định dạng Pancake POS trả về. Bản demo không có số liệu nào được ghi sẵn: đồng bộ, số liệu ngày, KPI, báo cáo
// đều chạy bằng đúng mã của web thật trên dữ liệu này, nên công thức giữ nguyên. Hàm thuần, không phụ thuộc runtime Cloudflare.
import type { SourceCustomer, SourceItem, SourceNote, SourceOrder, SourceUser, SourceVariation } from '../pancake';
import type { HrSnapshot } from '../hr-copy';
import { POS } from '../report-model';

/** Ngày (giờ VN) bắt đầu có dữ liệu ảo. */
export const DEMO_START = '2026-06-01';
const DAY_MS = 86400000;
const VN_MS = 7 * 3600000;
const MIN = 60000;
const HOUR = 3600000;

// ---- ngẫu nhiên tất định ----
export function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
export function rng(seed: string) {
  let a = hash(seed);
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
type R = () => number;
const pick = <T,>(r: R, list: readonly T[]) => list[Math.floor(r() * list.length)];
const between = (r: R, lo: number, hi: number) => lo + r() * (hi - lo);
function weighted<T>(r: R, list: readonly T[], weight: (t: T) => number) {
  const total = list.reduce((s, t) => s + weight(t), 0);
  let x = r() * total;
  for (const t of list) { x -= weight(t); if (x <= 0) return t; }
  return list[list.length - 1];
}
const hex = (seed: string, n: number) => { let out = ''; for (let i = 0; out.length < n; i++) out += hash(`${seed}#${i}`).toString(16).padStart(8, '0'); return out.slice(0, n); };
export const uuidOf = (seed: string) => { const h = hex(seed, 32); return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`; };

// ---- thời gian ----
/** Chuỗi UTC không hậu tố như Pancake trả ("2026-09-13T01:35:44"). */
export const pancakeTime = (ms: number) => new Date(ms).toISOString().slice(0, 19);
export const vnDayStartMs = (day: string) => Date.parse(`${day}T00:00:00Z`) - VN_MS;
export const vnDayOfMs = (ms: number) => new Date(ms + VN_MS).toISOString().slice(0, 10);
export const addDay = (day: string, n: number) => new Date(Date.parse(`${day}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);
export const dayIndex = (day: string) => Math.round((Date.parse(`${day}T00:00:00Z`) - Date.parse(`${DEMO_START}T00:00:00Z`)) / DAY_MS);

// ---- công ty ----
export const SHOPS = POS.map((p, i) => ({ posId: p.id, shopId: String(1001 + i), name: p.name }));
export const shopByShopId = (shopId: string) => SHOPS.find((s) => s.shopId === shopId) ?? null;

type Dept = 'sale' | 'cskh' | 'mkt' | 'vd' | 'boss';
type Level = 'nv' | 'leader' | 'tp' | 'gd';
export type Staff = {
  key: string; id: string; name: string; email: string; phone: string; dept: Dept; branch: 'HN' | 'TN'; unit: string;
  level: Level; title: string; skill: number; joined: string; left: string | null; group: string;
};
// Tên ảo (không trùng người thật của công ty).
const PEOPLE: [string, Dept, 'HN' | 'TN', string, Level, string?, string?][] = [
  // key, phòng, chi nhánh, đơn vị (team), cấp, ngày vào, ngày nghỉ
  ['Đỗ Quang Huy', 'boss', 'HN', 'bgd', 'gd', '2025-03-01'],
  ['Phan Thị Mai Anh', 'boss', 'HN', 'kd-hn', 'tp', '2025-03-01'],
  ['Lương Văn Toàn', 'boss', 'TN', 'kd-tn', 'tp', '2025-06-01'],
  ['Nguyễn Đức Mạnh', 'sale', 'HN', 'sale-hn-1', 'leader', '2025-03-10'],
  ['Trần Thị Thu Hằng', 'sale', 'HN', 'sale-hn-1', 'nv', '2025-05-02'],
  ['Lê Minh Quân', 'sale', 'HN', 'sale-hn-1', 'nv', '2025-08-15'],
  ['Vũ Thị Ngọc Ánh', 'sale', 'HN', 'sale-hn-1', 'nv', '2026-01-05'],
  ['Hoàng Văn Kiên', 'sale', 'HN', 'sale-hn-1', 'nv', '2026-07-01'],
  ['Bùi Thanh Tùng', 'sale', 'HN', 'sale-hn-2', 'leader', '2025-04-01'],
  ['Đinh Thị Phương Thảo', 'sale', 'HN', 'sale-hn-2', 'nv', '2025-09-01'],
  ['Ngô Văn Lực', 'sale', 'HN', 'sale-hn-2', 'nv', '2025-11-11', '2026-08-20'],
  ['Phạm Thị Kim Oanh', 'sale', 'HN', 'sale-hn-2', 'nv', '2026-02-16'],
  ['Trịnh Công Sơn', 'sale', 'HN', 'sale-hn-2', 'nv', '2026-08-25'],
  ['Mai Văn Hậu', 'sale', 'TN', 'sale-tn', 'leader', '2025-06-01'],
  ['Dương Thị Hồng Nhung', 'sale', 'TN', 'sale-tn', 'nv', '2025-07-20'],
  ['Tạ Văn Bình', 'sale', 'TN', 'sale-tn', 'nv', '2025-12-01'],
  ['Hà Thị Lan Chi', 'sale', 'TN', 'sale-tn', 'nv', '2026-03-09'],
  ['Kiều Văn Phúc', 'sale', 'TN', 'sale-tn', 'nv', '2026-06-15'],
  ['Nguyễn Thị Bích Ngọc', 'cskh', 'HN', 'cskh-hn-1', 'leader', '2025-03-15'],
  ['Lê Thị Hồng Vân', 'cskh', 'HN', 'cskh-hn-1', 'nv', '2025-07-01'],
  ['Trần Văn Đạt', 'cskh', 'HN', 'cskh-hn-1', 'nv', '2026-01-12'],
  ['Phùng Thị Yến', 'cskh', 'HN', 'cskh-hn-1', 'nv', '2026-05-04'],
  ['Cao Thị Thanh Tâm', 'cskh', 'HN', 'cskh-hn-2', 'leader', '2025-05-01'],
  ['Đặng Văn Khải', 'cskh', 'HN', 'cskh-hn-2', 'nv', '2025-10-01'],
  ['Lại Thị Minh Thư', 'cskh', 'HN', 'cskh-hn-2', 'nv', '2026-02-02'],
  ['Võ Thị Diệu Linh', 'cskh', 'HN', 'cskh-hn-2', 'nv', '2026-06-01'],
  ['Chu Thị Hoài Thu', 'cskh', 'TN', 'cskh-tn', 'leader', '2025-06-10'],
  ['Âu Văn Trọng', 'cskh', 'TN', 'cskh-tn', 'nv', '2025-11-03'],
  ['Lò Thị Mỹ Duyên', 'cskh', 'TN', 'cskh-tn', 'nv', '2026-04-01'],
  ['Hứa Thị Kim Liên', 'cskh', 'TN', 'cskh-tn', 'nv', '2026-07-15'],
  ['Tô Minh Khoa', 'mkt', 'HN', 'mkt', 'leader', '2025-03-01'],
  ['Quách Thị Ngân', 'mkt', 'HN', 'mkt', 'nv', '2025-06-01'],
  ['Lâm Văn Thắng', 'mkt', 'HN', 'mkt', 'nv', '2025-10-15'],
  ['Từ Thị Hải Yến', 'mkt', 'HN', 'mkt', 'nv', '2026-03-01'],
  ['Khúc Văn Long', 'mkt', 'TN', 'mkt', 'nv', '2026-05-15'],
  // Vận đơn (08/10/2026): gọi khách xác nhận đơn Sale / CSKH đã chốt, rồi giao đi.
  ['Nghiêm Thị Thu Trang', 'vd', 'HN', 'vd-hn', 'leader', '2025-03-01'],
  ['Phí Văn Hưng', 'vd', 'HN', 'vd-hn', 'nv', '2025-08-01'],
  ['Mạc Thị Lệ Quyên', 'vd', 'HN', 'vd-hn', 'nv', '2026-01-10'],
  ['Ông Văn Tiến', 'vd', 'HN', 'vd-hn', 'nv', '2026-06-20'],
  ['Giáp Thị Hồng Hạnh', 'vd', 'TN', 'vd-tn', 'leader', '2025-06-01'],
  ['Lưu Văn Sáng', 'vd', 'TN', 'vd-tn', 'nv', '2026-03-02'],
];
export const UNITS: Record<string, { name: string; parent: string | null; kind: 'phong' | 'team'; office: 'HN' | 'TN' }> = {
  'bgd': { name: 'Ban Giám đốc', parent: null, kind: 'phong', office: 'HN' },
  'kd-hn': { name: 'Phòng Kinh doanh Hà Nội', parent: null, kind: 'phong', office: 'HN' },
  'kd-tn': { name: 'Phòng Kinh doanh Thái Nguyên', parent: null, kind: 'phong', office: 'TN' },
  'sale-hn-1': { name: 'Sale HN · Team Đại Bàng', parent: 'kd-hn', kind: 'team', office: 'HN' },
  'sale-hn-2': { name: 'Sale HN · Team Sói Xám', parent: 'kd-hn', kind: 'team', office: 'HN' },
  'cskh-hn-1': { name: 'CSKH HN · Team Hướng Dương', parent: 'kd-hn', kind: 'team', office: 'HN' },
  'cskh-hn-2': { name: 'CSKH HN · Team Bồ Công Anh', parent: 'kd-hn', kind: 'team', office: 'HN' },
  'sale-tn': { name: 'Sale TN · Team Thái Nguyên', parent: 'kd-tn', kind: 'team', office: 'TN' },
  'cskh-tn': { name: 'CSKH TN · Team Chè Xanh', parent: 'kd-tn', kind: 'team', office: 'TN' },
  'mkt': { name: 'Phòng Marketing', parent: null, kind: 'phong', office: 'HN' },
  'vd': { name: 'Phòng Vận đơn và Kho', parent: null, kind: 'phong', office: 'HN' },
  'vd-hn': { name: 'Vận đơn HN · Team Xác nhận Hà Nội', parent: 'vd', kind: 'team', office: 'HN' },
  'vd-tn': { name: 'Vận đơn TN · Team Xác nhận Thái Nguyên', parent: 'vd', kind: 'team', office: 'TN' },
};
const slug = (name: string) => name.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').toLowerCase().split(' ').filter(Boolean);
const TITLES: Record<Dept, Record<Level, string>> = {
  sale: { nv: 'Nhân viên Sale', leader: 'Leader Sale', tp: 'Trưởng phòng', gd: 'Giám đốc' },
  cskh: { nv: 'Nhân viên CSKH', leader: 'Leader CSKH', tp: 'Trưởng phòng', gd: 'Giám đốc' },
  mkt: { nv: 'Marketer', leader: 'Trưởng nhóm Marketing', tp: 'Trưởng phòng', gd: 'Giám đốc' },
  vd: { nv: 'Nhân viên Vận đơn', leader: 'Leader Vận đơn', tp: 'Trưởng phòng', gd: 'Giám đốc' },
  boss: { nv: 'Nhân viên', leader: 'Leader', tp: 'Trưởng phòng Kinh doanh', gd: 'Giám đốc' },
};
export const STAFF: Staff[] = PEOPLE.map(([name, dept, branch, unit, level, joined, left]) => {
  const parts = slug(name);
  const key = `${parts.at(-1)}.${parts.slice(0, -1).map((p) => p[0]).join('')}`;
  const r = rng(`staff:${name}`);
  return {
    key, id: uuidOf(`user:${name}`), name, email: `${key}@demo.megatech.vn`, phone: `09${String(Math.floor(r() * 1e8)).padStart(8, '0')}`,
    dept, branch, unit, level, title: TITLES[dept][level], skill: level === 'leader' ? between(r, 0.42, 0.52) : between(r, 0.26, 0.48),
    joined: joined ?? '2025-03-01', left: left ?? null,
    group: UNITS[unit].name.split(' · ')[1] ?? UNITS[unit].name,
  };
});
const activeOn = (s: Staff, day: string) => s.joined <= day && (!s.left || s.left > day);
const BY_DEPT = (dept: Dept, day: string, branch?: 'HN' | 'TN') => STAFF.filter((s) => s.dept === dept && activeOn(s, day) && (!branch || s.branch === branch));

// ---- sản phẩm (tên theo đúng các nhóm sản phẩm web thật nhận diện: Kháng sinh, Combo, Khác) ----
type Product = { key: string; name: string; price: number; tag: string | null; bonus?: boolean };
export const PRODUCTS: Product[] = [
  { key: 'gentadox', name: 'GENTADOX 100g', price: 320000, tag: 'GENTADOX' },
  { key: 'shield', name: 'BIO NANO SHIELD 1L', price: 450000, tag: 'BIO NANO SHIELD' },
  { key: 'oxy', name: 'OXY + BỔ HUYẾT 1kg', price: 380000, tag: 'OXY + BỔ HUYẾT' },
  { key: 'clean', name: 'BIO NANO CLEAN 5L', price: 690000, tag: 'BIO NANO CLEAN' },
  { key: 'godkill', name: 'GODKILL 1L', price: 520000, tag: 'GODKILL' },
  { key: 'skgk', name: 'Combo SK + GK', price: 890000, tag: 'SK + GK' },
  { key: 'megaroot', name: 'MEGAROOT kích rễ 1L', price: 280000, tag: 'MEGAROOT' },
  { key: 'apex', name: 'APEX khoáng tạt 10kg', price: 350000, tag: 'APEX' },
  { key: 'vogao', name: 'Siêu Vỏ Gạo men vi sinh 1kg', price: 240000, tag: 'SIÊU VỎ GẠO' },
  { key: 'vitc', name: 'Vitamin C tạt 1kg', price: 180000, tag: null },
  { key: 'men', name: 'Men tiêu hóa đường ruột 500g', price: 220000, tag: null },
  { key: 'gift', name: 'Quà tặng: găng tay cao su', price: 0, tag: null, bonus: true },
];
const productOf = (key: string) => PRODUCTS.find((p) => p.key === key)!;
/** Sản phẩm chủ lực của từng POS (trọng số). */
const POS_MIX: Record<string, [string, number][]> = {
  'sieu-vo-gao': [['vogao', 5], ['men', 3], ['vitc', 2], ['gentadox', 1]],
  'mgt-apex': [['apex', 5], ['gentadox', 2], ['vitc', 2], ['megaroot', 1]],
  'thuy-san': [['gentadox', 4], ['oxy', 3], ['skgk', 3], ['godkill', 2], ['clean', 1]],
  'bio-nano': [['shield', 4], ['clean', 3], ['skgk', 1], ['men', 1]],
  'megaroot': [['megaroot', 5], ['apex', 2], ['vogao', 1]],
  'oxytetra': [['oxy', 5], ['gentadox', 3], ['vitc', 1]],
};
/** Số data (đơn mới từ quảng cáo) mỗi ngày của từng POS. */
const POS_VOLUME: Record<string, number> = { 'sieu-vo-gao': 30, 'mgt-apex': 22, 'thuy-san': 40, 'bio-nano': 28, 'megaroot': 18, 'oxytetra': 20 };
const variationId = (posId: string, key: string) => uuidOf(`variation:${posId}:${key}`);
const productId = (key: string) => uuidOf(`product:${key}`);

const FAMILY = ['Nguyễn', 'Trần', 'Lê', 'Phạm', 'Hoàng', 'Vũ', 'Võ', 'Đặng', 'Bùi', 'Đỗ', 'Hồ', 'Ngô', 'Dương', 'Lý'];
const MIDDLE = ['Văn', 'Thị', 'Đức', 'Minh', 'Hữu', 'Thanh', 'Quang', 'Ngọc', 'Xuân', 'Công'];
const GIVEN = ['An', 'Bình', 'Cường', 'Dũng', 'Giang', 'Hải', 'Hiếu', 'Hùng', 'Khánh', 'Lâm', 'Long', 'Nam', 'Phong', 'Quý', 'Sang', 'Tài', 'Thắng', 'Thịnh', 'Trung', 'Tú', 'Hoa', 'Hương', 'Lan', 'Loan', 'Nga', 'Nhàn', 'Thủy', 'Tuyết', 'Xuân', 'Yến'];
const PREFIX = ['086', '096', '097', '098', '032', '033', '034', '035', '036', '037', '038', '039', '088', '091', '094', '083', '084', '085', '070', '076', '077', '078', '079', '089', '090', '093'];
const SOURCES: [string, number][] = [['Facebook', 6], ['TikTok', 3], ['Zalo', 1], ['Website', 1]];
const ASK_TAGS = ['Không nghe máy', 'Hẹn gọi lại', 'Chưa tiếp cận', 'Giá đắt'];
const NOTE_TEXTS = [
  'Gọi hỏi thăm sau khi dùng sản phẩm, khách phản hồi tôm khỏe, ăn tốt.',
  'Khách hẹn gọi lại sau 3 ngày khi xử lý xong ao.',
  'Hướng dẫn liều dùng và thời điểm tạt, khách đã hiểu.',
  'Không nghe máy, nhắn Zalo hẹn gọi lại.',
  'Khách đang thả lứa mới, tư vấn combo xử lý nước đầu vụ.',
  'Khách hỏi giá sỉ cho đại lý, đã báo leader.',
  'Nhắc khách đơn sắp hết, khách hẹn tuần sau đặt tiếp.',
  'Khách phản ánh giao chậm, đã xin lỗi và theo dõi đơn.',
  'Tư vấn thêm men tiêu hóa đi kèm, khách cân nhắc.',
  'Khách hài lòng, giới thiệu thêm người quen nuôi cùng xã.',
];

// ---- đơn ----
type Ev = { status: number; at: number; by: string | null };
export type DemoOrder = {
  posId: string; orderId: number; t0: number; phone: string; customerId: string; customerName: string;
  sellerId: string | null; assignAt: number | null; marketerId: string | null; source: string | null; creatorId: string;
  events: Ev[]; careId: string | null; careAt: number | null;
  items: { key: string; qty: number; discount: number }[]; discount: number; shipping: number; tags: string[];
  /** Thẻ gắn sau khi tạo đơn (vd lý do không xác nhận được), chỉ hiện từ thời điểm gắn. */ laterTags?: { name: string; at: number }[];
  /** Đơn mua lần đầu của khách (data từ quảng cáo). */ lead: boolean;
};
type DayData = { orders: DemoOrder[]; notes: { posId: string; customer: DemoOrder; note: SourceNote; at: number }[] };

const branchOf = (sellerId: string | null) => STAFF.find((s) => s.id === sellerId)?.branch ?? 'HN';
/** CSKH giữ khách: theo chi nhánh người bán đầu tiên, chia đều theo mã khách trong số CSKH đang làm ngày đó. */
function holderOf(customerId: string, branch: 'HN' | 'TN', day: string) {
  const list = BY_DEPT('cskh', day, branch);
  const all = list.length ? list : BY_DEPT('cskh', day);
  return all.length ? all[hash(customerId) % all.length] : null;
}

function itemsFor(r: R, posId: string, rich: boolean) {
  const mix = POS_MIX[posId];
  const lines = 1 + (r() < (rich ? 0.45 : 0.3) ? 1 : 0) + (r() < 0.08 ? 1 : 0);
  const keys = new Set<string>();
  while (keys.size < lines) keys.add(weighted(r, mix, ([, w]) => w)[0]);
  const items = [...keys].map((key) => ({ key, qty: 1 + Math.floor(r() * (rich ? 4 : 3)), discount: r() < 0.12 ? 10000 * (1 + Math.floor(r() * 3)) : 0 }));
  if (r() < 0.25) items.push({ key: 'gift', qty: 1, discount: 0 });
  return items;
}

// Lý do Vận đơn không xác nhận được (thẻ đơn "VĐ: <lý do>"); khách của người chốt kém hay đổi ý / nói không đặt.
const VD_REASONS: [string, number, number][] = [
  ['Không nghe máy', 5, 0], ['Khách đổi ý', 2, 3], ['Khách nói không đặt hàng', 1, 3], ['Sai số điện thoại', 1, 0], ['Trùng đơn', 1, 0], ['Hẹn gọi lại quá 3 lần', 1, 1],
];
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/**
 * Vòng đời một đơn sau khi chốt: Chờ xác nhận → Vận đơn gọi xác nhận (hoặc không xác nhận được) → đóng hàng → gửi → nhận (hoặc hoàn).
 * Hoàn nhiều hơn khi người chốt kém hoặc người xác nhận kém. Trả về thẻ lý do (nếu có) để gắn vào đơn.
 */
function lifecycle(r: R, closeAt: number, seller: Staff, events: Ev[]): { name: string; at: number }[] {
  const day = vnDayOfMs(closeAt);
  const vds = BY_DEPT('vd', day, seller.branch);
  const vd = vds.length ? pick(r, vds) : null;
  // Thỉnh thoảng người chốt tự bấm Đã xác nhận (không qua Vận đơn).
  if (!vd || r() < 0.05) {
    events.push({ status: 1, at: closeAt, by: seller.id });
    shipOut(r, closeAt, seller.id, seller.skill, null, events);
    return [];
  }
  events.push({ status: 17, at: closeAt, by: seller.id });
  const callAt = closeAt + between(r, 15, 300) * MIN;
  const weakSeller = clamp((0.42 - seller.skill) * 4, 0, 1);
  const fail = 0.05 + weakSeller * 0.1 + (0.45 - vd.skill) * 0.15;
  if (r() < fail) {
    const reason = weighted(r, VD_REASONS, ([, w, weak]) => w + weak * weakSeller)[0];
    events.push({ status: 6, at: callAt, by: vd.id });
    return [{ name: `VĐ: ${reason}`, at: callAt }];
  }
  events.push({ status: 1, at: callAt, by: vd.id });
  shipOut(r, callAt, vd.id, seller.skill, vd.skill, events);
  return [];
}

/** Sau khi xác nhận: đóng hàng → gửi → nhận / thu tiền (hoặc hoàn, hủy). */
function shipOut(r: R, confirmAt: number, by: string, sellerSkill: number, vdSkill: number | null, events: Ev[]) {
  const x = r();
  if (x < 0.03) { events.push({ status: 6, at: confirmAt + between(r, 2, 20) * HOUR, by }); return; }
  const pack = confirmAt + between(r, 2, 14) * HOUR;
  events.push({ status: 8, at: pack, by: null });
  const sent = pack + between(r, 4, 20) * HOUR;
  events.push({ status: 2, at: sent, by: null });
  const returnP = clamp(0.045 + (0.42 - sellerSkill) * 0.3 + (vdSkill === null ? 0.03 : (0.42 - vdSkill) * 0.35), 0.02, 0.3);
  if (r() < returnP) {
    const back = sent + between(r, 3, 6) * DAY_MS;
    events.push({ status: 4, at: back, by: null });
    events.push({ status: 5, at: back + between(r, 1, 3) * DAY_MS, by: null });
    return;
  }
  const got = sent + between(r, 1.5, 4.5) * DAY_MS;
  events.push({ status: 3, at: got, by: null });
  if (r() < 0.7) events.push({ status: 16, at: got + between(r, 1, 3) * DAY_MS, by: null });
}

/** Giờ trong ngày (VN) theo nhịp làm việc: sáng và tối đông data. */
function hourOfDay(r: R) {
  const slots: [number, number][] = [[7, 4], [8, 7], [9, 9], [10, 9], [11, 7], [12, 4], [13, 5], [14, 7], [15, 8], [16, 7], [17, 6], [18, 6], [19, 8], [20, 8], [21, 5], [22, 2]];
  const h = weighted(r, slots, ([, w]) => w)[0];
  return h + r();
}

function phoneOf(r: R) { return `${pick(r, PREFIX)}${String(Math.floor(r() * 1e7)).padStart(7, '0')}`; }
function nameOf(r: R) { return `${pick(r, FAMILY)} ${pick(r, MIDDLE)} ${pick(r, GIVEN)}`; }

// Bộ nhớ đệm có giới hạn (dùng gần đây thì giữ): Worker chỉ có 128 MB.
function lru<T>(max: number) {
  const map = new Map<string, T>();
  return {
    get(k: string) { const v = map.get(k); if (v !== undefined) { map.delete(k); map.set(k, v); } return v; },
    set(k: string, v: T) { if (map.size >= max) map.delete(map.keys().next().value!); map.set(k, v); },
  };
}
const leadCache = lru<DemoOrder[]>(500);
const dayCache = lru<DayData>(300);

/** Hệ số khối lượng của ngày (thứ trong tuần, tăng trưởng, dao động). */
function dayFactor(posId: string, day: string) {
  const di = dayIndex(day);
  const r = rng(`day:${posId}:${day}`);
  const weekday = new Date(`${day}T00:00:00Z`).getUTCDay();
  return (weekday === 0 ? 0.62 : weekday === 6 ? 0.85 : 1) * (1 + di * 0.0018) * between(r, 0.82, 1.18) * (1 + 0.12 * Math.sin(di / 9));
}

/** Data mới từ quảng cáo trong ngày (khách mua lần đầu), giao cho Sale. Không phụ thuộc ngày khác. */
function leadDay(posId: string, day: string): DemoOrder[] {
  const ck = `${posId}|${day}`;
  const hit = leadCache.get(ck);
  if (hit) return hit;
  const out: DemoOrder[] = [];
  if (day < DEMO_START) return out;
  const di = dayIndex(day);
  const start = vnDayStartMs(day);
  const sales = BY_DEPT('sale', day);
  const mkts = BY_DEPT('mkt', day);
  const leads = Math.round(POS_VOLUME[posId] * dayFactor(posId, day));
  for (let i = 0; i < leads && sales.length; i++) {
    const lr = rng(`lead:${posId}:${day}:${i}`);
    const t0 = start + hourOfDay(lr) * HOUR;
    const seller = weighted(lr, sales, (s) => (s.branch === 'HN' ? 1.15 : 0.85) * (s.level === 'leader' ? 0.7 : 1));
    const marketer = pick(lr, mkts.length ? mkts : STAFF.filter((s) => s.dept === 'mkt'));
    const assignAt = t0 + between(lr, 1, 25) * MIN;
    const phone = phoneOf(lr);
    const customerId = uuidOf(`customer:${posId}:${phone}`);
    const events: Ev[] = [{ status: 0, at: t0, by: marketer.id }];
    const items = itemsFor(lr, posId, false);
    const tags: string[] = [];
    const laterTags: { name: string; at: number }[] = [];
    // Người mới vào (dưới 45 ngày) chốt kém hơn; leader chốt tốt hơn.
    const tenure = (Date.parse(`${day}T00:00:00Z`) - Date.parse(`${seller.joined}T00:00:00Z`)) / DAY_MS;
    const p = seller.skill * (tenure < 45 ? 0.72 : 1) * (posId === 'thuy-san' ? 1.08 : 1);
    if (lr() < p) {
      // Chốt nóng: phần lớn trong 2 giờ đầu.
      const wait = lr() < 0.68 ? between(lr, 3, 120) * MIN : between(lr, 2, 52) * HOUR;
      laterTags.push(...lifecycle(lr, assignAt + wait, seller, events));
    } else if (lr() < 0.55) {
      events.push({ status: 6, at: assignAt + between(lr, 6, 72) * HOUR, by: seller.id });
    } else tags.push(pick(lr, ASK_TAGS));
    for (const it of items) { const t = productOf(it.key).tag; if (t && !tags.includes(t)) tags.push(t); }
    const delivered = events.find((e) => e.status === 3);
    const holder = delivered ? holderOf(customerId, seller.branch, vnDayOfMs(delivered.at)) : null;
    out.push({
      posId, orderId: (di + 1) * 1000 + i, t0, phone, customerId, customerName: nameOf(lr),
      sellerId: seller.id, assignAt, marketerId: marketer.id, source: weighted(lr, SOURCES, ([, w]) => w)[0], creatorId: marketer.id,
      events, careId: holder?.id ?? null, careAt: delivered && holder ? delivered.at + between(lr, 6, 30) * HOUR : null,
      items, discount: lr() < 0.08 ? 20000 * (1 + Math.floor(lr() * 3)) : 0, shipping: lr() < 0.7 ? 30000 : 0, tags, laterTags, lead: true,
    });
  }
  leadCache.set(ck, out);
  return out;
}

/** Mọi đơn tạo trong ngày `day` (giờ VN) của một POS, cùng ghi chú CSKH viết trong ngày. Tất định; không phụ thuộc "bây giờ". */
export function dayData(posId: string, day: string): DayData {
  const ck = `${posId}|${day}`;
  const hit = dayCache.get(ck);
  if (hit) return hit;
  const out: DayData = { orders: [...leadDay(posId, day)], notes: [] };
  if (day < DEMO_START) return out;
  const di = dayIndex(day);
  const start = vnDayStartMs(day);
  const factor = dayFactor(posId, day);
  const mkts = BY_DEPT('mkt', day);
  // 2) CSKH: khách cũ đã nhận hàng mua lại (tự ups) hoặc quay lại từ quảng cáo (từ MKT).
  const cskhOrders = Math.round(POS_VOLUME[posId] * 0.42 * factor);
  for (let i = 0; i < cskhOrders && di > 10; i++) {
    const cr = rng(`care:${posId}:${day}:${i}`);
    const base = pastCustomer(cr, posId, day, start);
    if (!base) continue;
    const holder = holderOf(base.customerId, branchOf(base.sellerId), day);
    if (!holder) continue;
    const t0 = start + hourOfDay(cr) * HOUR;
    const fromMkt = cr() < 0.33;
    const marketer = fromMkt ? pick(cr, mkts.length ? mkts : STAFF.filter((s) => s.dept === 'mkt')) : null;
    const events: Ev[] = [{ status: 0, at: t0, by: fromMkt ? marketer!.id : holder.id }];
    const items = itemsFor(cr, posId, true);
    const tags: string[] = [];
    const laterTags: { name: string; at: number }[] = [];
    if (cr() < (fromMkt ? 0.52 : 0.9) * (0.75 + holder.skill * 0.6)) laterTags.push(...lifecycle(cr, t0 + between(cr, fromMkt ? 10 : 2, fromMkt ? 300 : 40) * MIN, holder, events));
    else if (cr() < 0.6) events.push({ status: 6, at: t0 + between(cr, 4, 48) * HOUR, by: holder.id });
    else tags.push(pick(cr, ASK_TAGS));
    for (const it of items) { const t = productOf(it.key).tag; if (t && !tags.includes(t)) tags.push(t); }
    out.orders.push({
      posId, orderId: (di + 1) * 1000 + 500 + i, t0, phone: base.phone, customerId: base.customerId, customerName: base.customerName,
      sellerId: holder.id, assignAt: fromMkt ? t0 + between(cr, 1, 15) * MIN : null, marketerId: marketer?.id ?? null,
      source: fromMkt ? weighted(cr, SOURCES, ([, w]) => w)[0] : 'Khách cũ', creatorId: fromMkt ? marketer!.id : holder.id,
      events, careId: holder.id, careAt: t0, items, discount: cr() < 0.15 ? 30000 : 0, shipping: cr() < 0.5 ? 30000 : 0, tags, laterTags, lead: false,
    });
  }
  // 3) Ghi chú CSKH (mỗi ghi chú = một cuộc gọi chăm sóc).
  const notes = Math.round(POS_VOLUME[posId] * 1.2 * factor);
  for (let i = 0; i < notes && di > 3; i++) {
    const nr = rng(`note:${posId}:${day}:${i}`);
    const base = pastCustomer(nr, posId, day, start, 2);
    if (!base) continue;
    const holder = holderOf(base.customerId, branchOf(base.sellerId), day);
    if (!holder) continue;
    const at = start + between(nr, 8, 18) * HOUR;
    out.notes.push({
      posId, customer: base, at,
      note: { id: uuidOf(`note:${posId}:${day}:${i}`), message: pick(nr, NOTE_TEXTS), created_at: Math.floor(at / 1000), updated_at: Math.floor(at / 1000), order_id: null,
        created_by: { id: holder.id, name: pancakeName(holder), fb_name: pancakeName(holder) } },
    });
  }
  dayCache.set(ck, out);
  return out;
}

/** Một khách mua lần đầu ở ngày trước đó và đã nhận hàng trước thời điểm `before`. */
function pastCustomer(r: R, posId: string, day: string, before: number, minBack = 12): DemoOrder | null {
  for (let attempt = 0; attempt < 4; attempt++) {
    const back = Math.floor(between(r, minBack, 120));
    const d = addDay(day, -back);
    if (d < DEMO_START) continue;
    const cands = leadDay(posId, d).filter((o) => o.events.some((e) => e.status === 3 && e.at < before));
    if (cands.length) return cands[Math.floor(r() * cands.length)];
  }
  return null;
}

// ---- đổi sang định dạng Pancake ----
/** Đơn như Pancake trả ở thời điểm `now` (chỉ các sự kiện đã xảy ra). null khi đơn chưa được tạo. */
export function toSourceOrder(o: DemoOrder, now: number): SourceOrder | null {
  if (o.t0 > now) return null;
  const evs = o.events.filter((e) => e.at <= now);
  const last = evs[evs.length - 1];
  const updated = Math.max(last.at, o.assignAt && o.assignAt <= now ? o.assignAt : 0, o.careAt && o.careAt <= now ? o.careAt : 0);
  const items: SourceItem[] = o.items.map((it) => {
    const p = productOf(it.key);
    return {
      product_id: productId(it.key), variation_id: variationId(o.posId, it.key), quantity: it.qty,
      returned_count: last.status === 5 ? it.qty : 0, discount_each_product: it.discount, is_discount_percent: false,
      is_bonus_product: !!p.bonus, assigning_seller_id: o.sellerId,
      variation_info: { name: p.name, retail_price: p.price, product_id: productId(it.key), display_id: it.key.toUpperCase() },
    };
  });
  const total = items.reduce((s, i) => s + (i.variation_info!.retail_price! * i.quantity!), 0);
  const lineDiscount = items.reduce((s, i) => s + (i.discount_each_product! * i.quantity!), 0);
  const discount = o.discount + lineDiscount;
  const net = Math.max(0, total - discount);
  const assigned = o.assignAt !== null && o.assignAt <= now;
  const seller = STAFF.find((s) => s.id === o.sellerId);
  const care = o.careId && o.careAt !== null && o.careAt <= now ? STAFF.find((s) => s.id === o.careId) ?? null : null;
  return {
    id: o.orderId, bill_full_name: o.customerName, bill_phone_number: o.phone,
    inserted_at: pancakeTime(o.t0), updated_at: pancakeTime(updated), status: last.status, sub_status: null,
    assigning_seller: (o.lead ? assigned : true) && seller ? { id: seller.id, name: pancakeName(seller) } : null,
    time_assign_seller: assigned ? pancakeTime(o.assignAt!) : null,
    assigning_care: care ? { id: care.id } : null, assigning_care_id: care?.id ?? null, time_assign_care: care ? pancakeTime(o.careAt!) : null,
    marketer: o.marketerId ? { id: o.marketerId } : null, creator_id: o.creatorId, creator: { id: o.creatorId },
    last_editor_id: last.by ?? o.creatorId,
    customer: { id: o.customerId, customer_id: o.customerId, name: o.customerName },
    total_price: total, total_discount: discount, total_price_after_sub_discount: net, shipping_fee: o.shipping,
    cod: last.status === 16 ? 0 : net + o.shipping, money_to_collect: net + o.shipping,
    total_quantity: items.reduce((s, i) => s + (i.is_bonus_product ? 0 : i.quantity!), 0),
    order_sources: o.source, warehouse_id: 'kho-tong', note: null,
    tags: [...o.tags, ...(o.laterTags ?? []).filter((t) => t.at <= now).map((t) => t.name)].map((name) => ({ id: hash(name) % 100000, name })),
    status_history: evs.map((e, i) => ({ old_status: i ? evs[i - 1].status : undefined, status: e.status, editor_id: e.by ?? undefined, updated_at: pancakeTime(e.at) })),
    items,
  };
}

const updatedAtOf = (o: DemoOrder, now: number) => {
  const evs = o.events.filter((e) => e.at <= now);
  return Math.max(evs[evs.length - 1].at, o.assignAt && o.assignAt <= now ? o.assignAt : 0, o.careAt && o.careAt <= now ? o.careAt : 0);
};

function daysIn(fromMs: number, toMs: number) {
  const out: string[] = [];
  let d = vnDayOfMs(Math.max(fromMs, vnDayStartMs(DEMO_START)));
  const last = vnDayOfMs(toMs);
  for (let n = 0; d <= last && n < 4000; n++, d = addDay(d, 1)) out.push(d);
  return out;
}

/** Danh sách đơn của một POS theo tham số API Pancake /orders (lọc theo thời điểm tạo hoặc cập nhật, sắp xếp, phân trang). */
export function listOrders(posId: string, params: URLSearchParams, now: number) {
  const pageSize = Math.min(500, Math.max(1, Number(params.get('page_size') ?? 30) || 30));
  const page = Math.max(1, Number(params.get('page_number') ?? 1) || 1);
  const startSec = Number(params.get('startDateTime')), endSec = Number(params.get('endDateTime'));
  const from = Number.isFinite(startSec) && params.has('startDateTime') ? startSec * 1000 : vnDayStartMs(DEMO_START);
  const to = Math.min(now, Number.isFinite(endSec) && params.has('endDateTime') ? endSec * 1000 : now);
  const byUpdate = params.get('updateStatus') === 'updated_at';
  // Đơn có thể đổi trạng thái tới ~12 ngày sau khi tạo.
  const days = daysIn(byUpdate ? from - 14 * DAY_MS : from, to);
  let rows: { o: DemoOrder; key: number }[] = [];
  for (const d of days) for (const o of dayData(posId, d).orders) {
    if (o.t0 > now) continue;
    const key = byUpdate ? updatedAtOf(o, now) : o.t0;
    if (key >= from && key <= to) rows.push({ o, key });
  }
  const sort = params.get('option_sort') ?? '';
  rows.sort((a, b) => sort.endsWith('_asc') ? a.key - b.key || a.o.orderId - b.o.orderId : b.key - a.key || b.o.orderId - a.o.orderId);
  const total = rows.length;
  rows = rows.slice((page - 1) * pageSize, page * pageSize);
  return { success: true, data: rows.map((r) => toSourceOrder(r.o, now)!), total_entries: total, page_size: pageSize, page_number: page };
}

/** Một đơn theo mã. */
export function findOrder(posId: string, orderId: string, now: number) {
  const n = Number(orderId);
  if (!Number.isInteger(n)) return null;
  const day = addDay(DEMO_START, Math.floor(n / 1000) - 1);
  const o = dayData(posId, day).orders.find((x) => x.orderId === n);
  return o ? toSourceOrder(o, now) : null;
}

/** Khách có hoạt động (đơn mới, ghi chú) trong cửa sổ cập nhật, như /customers của Pancake. */
export function listCustomers(posId: string, params: URLSearchParams, now: number) {
  const pageSize = Math.min(500, Math.max(1, Number(params.get('page_size') ?? 30) || 30));
  const page = Math.max(1, Number(params.get('page_number') ?? 1) || 1);
  const hasWindow = params.has('start_time_updated_at');
  const from = hasWindow ? Number(params.get('start_time_updated_at')) * 1000 : vnDayStartMs(DEMO_START);
  const to = Math.min(now, hasWindow ? Number(params.get('end_time_updated_at')) * 1000 : now);
  if (!hasWindow && pageSize <= 1) {
    // Chỉ cần tổng số khách (để hiện tiến độ): đếm khách mua lần đầu.
    let n = 0;
    for (const d of daysIn(vnDayStartMs(DEMO_START), now)) n += dayData(posId, d).orders.filter((o) => o.lead && o.t0 <= now).length;
    return { success: true, data: [], total_entries: n, page_size: pageSize, page_number: page };
  }
  type Acc = { base: DemoOrder; updated: number; notes: SourceNote[]; orders: number; ok: number; amount: number; lastOrder: number };
  const acc = new Map<string, Acc>();
  const touch = (base: DemoOrder, at: number) => {
    const a = acc.get(base.customerId) ?? { base, updated: 0, notes: [], orders: 0, ok: 0, amount: 0, lastOrder: 0 };
    a.updated = Math.max(a.updated, at);
    acc.set(base.customerId, a);
    return a;
  };
  for (const d of daysIn(from, to)) {
    const data = dayData(posId, d);
    for (const o of data.orders) {
      if (o.t0 < from || o.t0 > to) continue;
      const a = touch(o, o.t0);
      a.orders++; a.lastOrder = Math.max(a.lastOrder, o.t0);
      const src = toSourceOrder(o, now);
      if (src && (src.status === 3 || src.status === 16)) { a.ok++; a.amount += src.total_price_after_sub_discount ?? 0; }
    }
    for (const n of data.notes) if (n.at >= from && n.at <= to) touch(n.customer, n.at).notes.push(n.note);
  }
  const rows = [...acc.values()].sort((a, b) => b.updated - a.updated);
  const total = rows.length;
  const data: SourceCustomer[] = rows.slice((page - 1) * pageSize, page * pageSize).map((a) => {
    const delivered = a.base.events.find((e) => e.status === 3 && e.at <= now);
    const holder = delivered ? holderOf(a.base.customerId, branchOf(a.base.sellerId), vnDayOfMs(delivered.at)) : null;
    return {
      id: a.base.customerId, customer_id: a.base.customerId, name: a.base.customerName, phone_numbers: [a.base.phone],
      assigned_user_id: holder?.id ?? a.base.sellerId, order_count: Math.max(1, a.orders), succeed_order_count: a.ok, purchased_amount: a.amount,
      last_order_at: a.lastOrder ? pancakeTime(a.lastOrder) : pancakeTime(a.base.t0), inserted_at: pancakeTime(a.base.t0), updated_at: pancakeTime(a.updated),
      tags: [], notes: a.notes,
    };
  });
  return { success: true, data, total_entries: total, page_size: pageSize, page_number: page };
}

/** Ghi chú của một khách (load_customer_notes): các ghi chú viết trong 45 ngày gần nhất. */
export function customerNotes(posId: string, customerId: string, now: number): SourceNote[] {
  const out: SourceNote[] = [];
  for (const d of daysIn(now - 45 * DAY_MS, now)) for (const n of dayData(posId, d).notes) if (n.customer.customerId === customerId && n.at <= now) out.push(n.note);
  return out;
}

/**
 * Tên trên Pancake có hậu tố bộ phận như công ty thật (Sale, CSKH, MKT), web chỉ tính doanh số người có hậu tố (lib/team.ts).
 * Hai người cố ý sót để demo thấy danh sách "Không tính doanh số": một Sale quên hậu tố, một MKT gõ nhầm "MTK".
 */
const PANCAKE_SUFFIX: Partial<Record<Dept, string>> = { sale: 'SALE', cskh: 'CSKH', mkt: 'MKT' };
const PANCAKE_NAME_OVERRIDE: Record<string, string> = { 'Kiều Văn Phúc': 'Kiều Văn Phúc', 'Khúc Văn Long': 'Khúc Văn Long MTK' };
export const pancakeName = (s: Staff) => PANCAKE_NAME_OVERRIDE[s.name] ?? (PANCAKE_SUFFIX[s.dept] ? `${s.name} ${PANCAKE_SUFFIX[s.dept]}` : s.name);

export function listUsers(posId: string): SourceUser[] {
  void posId;
  return STAFF.map((s) => ({
    user_id: s.id, role: s.dept === 'boss' ? 1 : 0, is_active: !s.left, inserted_at: `${s.joined}T02:00:00`,
    user: { id: s.id, name: pancakeName(s), email: s.email, phone_number: s.phone },
    department: { id: { sale: 1, cskh: 2, mkt: 3, boss: 4, vd: 5 }[s.dept], name: { sale: 'Sale', cskh: 'CSKH', mkt: 'Marketing', boss: 'Quản trị viên', vd: 'Vận đơn' }[s.dept] },
    sale_group: s.dept === 'sale' || s.dept === 'cskh' ? { id: hash(s.unit) % 1000, name: s.group } : null,
  }));
}

export function listVariations(posId: string): SourceVariation[] {
  return PRODUCTS.map((p) => ({
    id: variationId(posId, p.key), product_id: productId(p.key), retail_price: p.price, display_id: p.key.toUpperCase(),
    product: { id: productId(p.key), name: p.name, display_id: p.key.toUpperCase(), categories: [{ id: 1, name: p.tag ? 'Sản phẩm chính' : p.bonus ? 'Quà tặng' : 'Hỗ trợ' }] },
    name: p.name, fields: [],
  }));
}

// ---- web nhân sự ảo ----
export function hrSnapshot(): HrSnapshot {
  const emp = (s: Staff) => uuidOf(`emp:${s.key}`);
  const offices = [{ id: 'office-hn', name: 'Hà Nội' }, { id: 'office-tn', name: 'Thái Nguyên' }];
  const departments = Object.entries(UNITS).map(([id, u]) => ({
    id: `dept-${id}`, name: u.name, parent_id: u.parent ? `dept-${u.parent}` : null, kind: u.kind, office_id: u.office === 'HN' ? 'office-hn' : 'office-tn',
    director_employee_id: null, active: 1,
  }));
  const levels = [
    { id: 'lv-nv', name: 'Nhân viên', rank: 1, is_manager: 0 }, { id: 'lv-leader', name: 'Leader', rank: 2, is_manager: 1 },
    { id: 'lv-tp', name: 'Trưởng phòng', rank: 3, is_manager: 1 }, { id: 'lv-gd', name: 'Giám đốc', rank: 4, is_manager: 1 },
  ];
  const titleNames = [...new Set(STAFF.map((s) => s.title))];
  const titles = titleNames.map((name, i) => ({ id: `title-${i}`, name }));
  const gd = STAFF.find((s) => s.level === 'gd')!;
  const managerOf = (s: Staff): Staff | null => {
    if (s.level === 'gd') return null;
    if (s.level === 'tp') return gd;
    if (s.level === 'leader') return s.dept === 'mkt' || s.dept === 'vd' ? gd : STAFF.find((x) => x.level === 'tp' && x.branch === s.branch) ?? gd;
    return STAFF.find((x) => x.unit === s.unit && x.level === 'leader') ?? gd;
  };
  const employees = STAFF.map((s, i) => ({
    id: emp(s), code: `MGT${String(i + 1).padStart(3, '0')}`, full_name: s.name, email: s.email, phone: s.phone,
    office_id: s.branch === 'HN' ? 'office-hn' : 'office-tn', joined_on: s.joined, status: s.left ? 'da_nghi' : 'dang_lam', left_on: s.left, main_user_id: null,
  }));
  const assignments = STAFF.map((s) => ({
    id: uuidOf(`asg:${s.key}`), employee_id: emp(s), department_id: `dept-${s.unit}`, level_id: `lv-${s.level}`,
    title_id: titles.find((t) => t.name === s.title)!.id, manager_employee_id: managerOf(s) ? emp(managerOf(s)!) : null, is_primary: 1,
    start_on: s.joined, end_on: s.left,
  }));
  const posAccounts = STAFF.map((s) => ({ pos_user_id: s.id, employee_id: emp(s) }));
  return { offices, departments, levels, titles, employees, assignments, posAccounts, at: new Date(0).toISOString() };
}
