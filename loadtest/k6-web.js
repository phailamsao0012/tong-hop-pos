// Test tải web tổng trên bản demo (10/10/2026, anh Vũ hỏi 100–150 người cùng lúc chạy có mượt không, quá tải thì chịu tới đâu).
// Mỗi người ảo đăng nhập một tài khoản demo, mở các trang như trình duyệt (gọi song song mọi API của trang), đọc một lúc rồi mở trang khác.
// Tăng dần số người theo LEVELS; mỗi mức chạy HOLD giây. Bỏ WARM giây đầu mỗi mức (lúc mọi người cùng đăng nhập) khi tính số.
// Biến: BASE, LEVELS="1,50,100,150", HOLD=150, WARM=30, THINK="20,40" (giây giữa hai lần mở trang), CACHE=shared|bust, WRITE_P=0..1.
import http from 'k6/http';
import exec from 'k6/execution';
import { sleep } from 'k6';
import { Counter, Trend } from 'k6/metrics';

const BASE = __ENV.BASE || 'https://demo.tonghopposmegatech.io.vn';
const LEVELS = (__ENV.LEVELS || '1,50,100,150').split(',').map(Number);
const HOLD = Number(__ENV.HOLD || 150);
const WARM = Number(__ENV.WARM || 30);
const GAP = 40;
const [TMIN, TMAX] = (__ENV.THINK || '20,40').split(',').map(Number);
const CACHE = __ENV.CACHE || 'shared';
const WRITE_P = Number(__ENV.WRITE_P || 0);
const PASSWORD = 'demo@2026';
const P = 'sieu-vo-gao%2Cmgt-apex%2Cthuy-san%2Cbio-nano%2Cmegaroot%2Coxytetra';

const lvl = (n) => `lvl_${String(n).padStart(4, '0')}`;
const scenarios = {};
let at = 0;
for (const n of LEVELS) {
  scenarios[lvl(n)] = { executor: 'constant-vus', vus: n, duration: `${HOLD}s`, startTime: `${at}s`, gracefulStop: '20s', exec: 'user' };
  at += HOLD + GAP;
}

const pageMs = new Trend('page_ms', true);
const writeMs = new Trend('write_ms', true);
// forbidden: trang gọi API mà tài khoản không được cấp (web cũng ẩn phần đó), không tính là lỗi.
const KINDS = ['forbidden', 'timeout', 'cf_block', 'cpu_limit', 'd1_busy', 'app_5xx', 'app_4xx', 'edge_5xx', 'other'];
const errors = new Counter('errors');
const actions = new Counter('actions');

// Trang và API của từng trang (ghi lại từ trình duyệt trên demo 10/10/2026). {S}..{E}: kỳ đang xem, {E29}: 29 ngày trước {E}, {Y}: hôm qua, {M}: tháng.
const VIEWS = {
  center: ['/api/reports/live?start={T}&end={T}', '/api/reports/pancake-ref?start={S}&end={E}&posIds={P}', '/api/reports/overview?posIds={P}&team=all&start={S}&end={E}&groupBy=day&compare=previous', '/api/reports/overview?posIds={P}&team=all&start={E29}&end={T}&groupBy=day&compare=none', '/api/reports/shift?posIds={P}&team=all&date={T}&shift=auto', '/api/reports/pipeline?posIds={P}&team=all&start={S}&end={E}&basis=confirmed', '/api/reports/customers?posIds={P}&team=all&group=all&page=1&sort=spend', '/api/reports/repurchase?posIds={P}&team=all&start={S}&end={E}', '/api/reports/batches?posIds={P}&team=all&start={S}&end={E}', '/api/targets?month={M}', '/api/reports/exec?posIds={P}', '/api/ai/summary'],
  overview: ['/api/reports/live?start={T}&end={T}', '/api/ai/trends', '/api/reports/sections?start={S}&end={E}&posIds={P}&productSegment=all', '/api/reports/uncounted?start={S}&end={E}&posIds={P}', '/api/targets?month={M}', '/api/reports/overview?start={S}&end={E}&posIds={P}&groupBy=day&compare=previous&team=all&productSegment=all&orderOrigin=all&marketerId=', '/api/reports/trends?start={S}&end={E}&posIds={P}&productSegment=all', '/api/reports/pancake-ref?start={S}&end={E}&posIds={P}'],
  shift: ['/api/reports/live?start={T}&end={T}&includeHours=1', '/api/reports/shift?date={T}&shift=auto&posIds={P}&team=all'],
  'sale-overview': ['/api/reports/live?start={T}&end={T}', '/api/ai/trends', '/api/reports/overview?start={S}&end={E}&posIds={P}&team=sale&groupBy=day&compare=previous', '/api/reports/product-groups?start={S}&end={E}&posIds={P}&team=sale&dim=tag&basis=both&by=seller', '/api/reports/pancake-ref?start={S}&end={E}&posIds={P}'],
  'cskh-overview': ['/api/reports/live?start={T}&end={T}', '/api/employees?team=cskh', '/api/ai/trends', '/api/targets?month={M}', '/api/reports/overview?start={S}&end={E}&posIds={P}&groupBy=day&compare=none&team=cskh&orderOrigin=all&marketerId=', '/api/reports/overview?start={S}&end={E}&posIds={P}&team=cskh&groupBy=day&compare=previous', '/api/reports/product-groups?start={S}&end={E}&posIds={P}&team=cskh&dim=tag&basis=both&by=care', '/api/reports/calls?start={S}&end={E}&posIds={P}&team=cskh', '/api/reports/pancake-ref?start={S}&end={E}&posIds={P}', '/api/reports/cskh-origin?start={S}&end={E}&posIds={P}&dim=main&basis=both'],
  marketing: ['/api/reports/live?start={T}&end={T}', '/api/marketing/analytics?start={S}&end={E}&posIds={P}', '/api/ai/trends', '/api/marketing-teams', '/api/reports/marketing?start={S}&end={E}&posIds={P}&basis=confirmed&stage=confirmed&marketingTeamId=__all'],
  'mkt-roas': ['/api/reports/live?start={T}&end={T}', '/api/marketing/roas?start={S}&end={E}&posIds={P}', '/api/marketing/sheet'],
  compare: ['/api/reports/live?start={T}&end={T}', '/api/reports/live?start={Y}&end={Y}', '/api/reports/overview?start={S}&end={E}&posIds={P}&groupBy=day&compare=previous&team=all&orderOrigin=all&marketerId=', '/api/targets?month={M}'],
  pipeline: ['/api/reports/live?start={T}&end={T}', '/api/reports/pipeline?start={S}&end={E}&posIds={P}&basis=confirmed&team=all&orderOrigin=all&marketerId=', '/api/reports/shipping-lines?start={S}&end={E}&posIds={P}&basis=confirmed&team=all&dim=line'],
  'van-don': ['/api/reports/live?start={T}&end={T}', '/api/ai/trends', '/api/reports/van-don?start={S}&end={E}&posIds={P}'],
  customers: ['/api/reports/live?start={T}&end={T}', '/api/employees?team=all', '/api/reports/customers?posIds={P}&q=&page=1&size=50&sort=spend&sellerId=&team=all&group=all'],
  calls: ['/api/reports/live?start={T}&end={T}', '/api/employees?team=cskh', '/api/reports/calls?start={S}&end={E}&posIds={P}&team=all'],
  care: ['/api/reports/live?start={T}&end={T}', '/api/employees?team=cskh', '/api/reports/care?posIds={P}&assigned=all&q=&minDays=0&sort=note_old&size=50&page=1&team=cskh'],
};
const SHELL = ['/api/prefs/metrics', '/api/reports/cskh-badge', '/api/sync/pos'];
// Chỉ người xem được Báo cáo tùy chỉnh / chủ hệ thống mới tải các mục này.
const SHELL_ALL = ['/api/data', '/api/presets'];
const SHELL_OWNER = ['/api/config', '/api/connection'];
const ALL = Object.keys(VIEWS);
const SALE = ['center', 'overview', 'shift', 'sale-overview', 'compare'];
const CSKH = ['center', 'cskh-overview', 'calls', 'care', 'customers'];
// Cơ cấu người dùng: phần lớn nhân viên và leader, ít người xem mọi trang. 20 phần.
const ROLES = [
  ...Array(8).fill({ email: 'nhanvien@demo.megatech.vn', views: ['shift', 'sale-overview', 'compare'] }),
  ...Array(4).fill({ email: 'leader.sale@demo.megatech.vn', views: SALE }),
  ...Array(4).fill({ email: 'leader.cskh@demo.megatech.vn', views: CSKH }),
  ...Array(2).fill({ email: 'truongphong@demo.megatech.vn', views: [...SALE, ...CSKH] }),
  { email: 'giamdoc@demo.megatech.vn', views: ALL },
  { email: 'chu@demo.megatech.vn', views: ALL, owner: true },
];

export const options = {
  scenarios,
  discardResponseBodies: false,
  // Giữ cookie phiên giữa các lần mở trang (k6 mặc định xoá cookie mỗi vòng).
  noCookiesReset: true,
  batch: 20,
  batchPerHost: 20,
  summaryTrendStats: ['count', 'avg', 'med', 'p(90)', 'p(95)', 'p(99)', 'max'],
  thresholds: (() => {
    const t = {};
    for (const n of LEVELS) {
      const s = lvl(n);
      t[`http_req_duration{scenario:${s},warm:0}`] = ['max>=0'];
      t[`http_reqs{scenario:${s},warm:0}`] = ['count>=0'];
      t[`page_ms{scenario:${s},warm:0}`] = ['max>=0'];
      t[`write_ms{scenario:${s},warm:0}`] = ['max>=0'];
      t[`actions{scenario:${s},warm:0}`] = ['count>=0'];
      for (const k of KINDS) t[`errors{scenario:${s},warm:0,kind:${k}}`] = ['count>=0'];
      for (const name of NAMES()) t[`http_req_duration{scenario:${s},warm:0,name:${name}}`] = ['max>=0'];
    }
    return t;
  })(),
};
function NAMES() {
  const set = new Set(['/api/auth/login', '/api/activity', '/api/demo/order-notes', ...SHELL, ...SHELL_ALL, ...SHELL_OWNER]);
  for (const v of ALL) for (const u of VIEWS[v]) set.add(u.split('?')[0]);
  return [...set];
}

// Ngày theo giờ Việt Nam.
const DAY = 86400000;
const vnDay = (ms) => new Date(ms + 7 * 3600000).toISOString().slice(0, 10);
function period() {
  const now = Date.now();
  const T = vnDay(now);
  if (CACHE === 'bust') {
    // Mỗi lần một kỳ ngẫu nhiên trong 120 ngày qua: không ai trúng số lưu sẵn (trường hợp xấu nhất).
    const end = now - Math.floor(Math.random() * 120) * DAY;
    const len = 1 + Math.floor(Math.random() * 60);
    return { S: vnDay(end - (len - 1) * DAY), E: vnDay(end), T };
  }
  // Kỳ hay xem: tháng này (mặc định), hôm nay, hôm qua, 7 ngày, tháng trước.
  const r = Math.random();
  const monthStart = `${T.slice(0, 8)}01`;
  if (r < 0.55) return { S: monthStart, E: T, T };
  if (r < 0.7) return { S: T, E: T, T };
  if (r < 0.8) return { S: vnDay(now - DAY), E: vnDay(now - DAY), T };
  if (r < 0.92) return { S: vnDay(now - 6 * DAY), E: T, T };
  const prevEnd = Date.parse(`${monthStart}T00:00:00Z`) - DAY;
  return { S: `${new Date(prevEnd).toISOString().slice(0, 8)}01`, E: new Date(prevEnd).toISOString().slice(0, 10), T };
}
const fill = (u, p) => u.replaceAll('{P}', P).replaceAll('{S}', p.S).replaceAll('{E29}', vnDay(Date.parse(`${p.T}T00:00:00Z`) - 29 * DAY)).replaceAll('{E}', p.E)
  .replaceAll('{T}', p.T).replaceAll('{Y}', vnDay(Date.now() - DAY)).replaceAll('{M}', p.E.slice(0, 7));

function classify(r) {
  if (r.status === 0) return 'timeout';
  if (r.status < 400) return null;
  const ct = String(r.headers['Content-Type'] || '');
  const body = typeof r.body === 'string' ? r.body.slice(0, 2000) : '';
  if (r.headers['Cf-Mitigated'] || r.status === 429 && !ct.includes('json')) return 'cf_block';
  if (/1102|exceeded (resource|cpu)/i.test(body)) return 'cpu_limit';
  if (/bận|overloaded|D1_ERROR|too many requests|queue/i.test(body)) return 'd1_busy';
  if (ct.includes('json') && (r.status === 403 || r.status === 401)) return 'forbidden';
  if (ct.includes('json')) return r.status >= 500 ? 'app_5xx' : 'app_4xx';
  return r.status >= 500 ? 'edge_5xx' : 'other';
}
function track(responses, tags) {
  for (const r of responses) {
    const k = classify(r); if (!k) continue;
    errors.add(1, { ...tags, kind: k });
    if (__ENV.DEBUG && Math.random() < 0.05) console.warn(`${r.status} ${r.request.url.slice(0, 90)} ${String(r.body).slice(0, 120)}`);
  }
}
const tagsNow = () => ({ warm: Date.now() - exec.scenario.startTime < WARM * 1000 ? '1' : '0' });

const state = { role: null, logged: false };
export function user() {
  if (!state.role) state.role = ROLES[(exec.vu.idInTest - 1) % ROLES.length];
  const role = state.role;
  if (!state.logged) {
    // Mỗi mức là một nhóm người mới: đăng nhập, mở trang chính (khung web) rồi vào trang đầu.
    http.cookieJar().clear(BASE);
    const t = tagsNow();
    const r = http.post(`${BASE}/api/auth/login`, JSON.stringify({ email: role.email, password: PASSWORD }), { headers: { 'content-type': 'application/json' }, tags: { ...t, name: '/api/auth/login' }, timeout: '60s' });
    track([r], t);
    if (r.status !== 200) { sleep(5); return; }
    state.logged = true;
    // Đặt lại cookie phiên không cờ Secure để chạy thử được cả trên máy (http://127.0.0.1); trên https không đổi gì.
    const sid = r.cookies.thp_session?.[0]?.value; if (sid) http.cookieJar().set(BASE, 'thp_session', sid);
    const shell = (role.owner ? [...SHELL, ...SHELL_ALL, ...SHELL_OWNER] : role.views === ALL ? [...SHELL, ...SHELL_ALL] : SHELL).map((u) => ['GET', `${BASE}${u}`, null, { tags: { ...t, name: u.split('?')[0] }, timeout: '60s' }]);
    track(http.batch(shell), t);
  }
  const t = tagsNow();
  const write = WRITE_P > 0 && Math.random() < WRITE_P;
  if (write) {
    // Ghi chép lên đơn: lưu ghi chú rồi hiện lại danh sách ghi chú của đơn (một lần gọi).
    const r = http.post(`${BASE}/api/demo/order-notes`, JSON.stringify({ note: `Khách hẹn gọi lại lúc ${Math.floor(Math.random() * 12) + 8}h, cần tư vấn thêm liều dùng (test tải)` }),
      { headers: { 'content-type': 'application/json' }, tags: { ...t, name: '/api/demo/order-notes' }, timeout: '60s' });
    track([r], t);
    writeMs.add(r.timings.duration, t);
  } else {
    const view = role.views[Math.floor(Math.random() * role.views.length)];
    const p = period();
    const reqs = VIEWS[view].map((u) => ['GET', `${BASE}${fill(u, p)}`, null, { tags: { ...t, name: u.split('?')[0] }, timeout: '60s' }]);
    reqs.push(['POST', `${BASE}/api/activity`, JSON.stringify({ view }), { headers: { 'content-type': 'application/json' }, tags: { ...t, name: '/api/activity' }, timeout: '60s' }]);
    const t0 = Date.now();
    const res = http.batch(reqs);
    pageMs.add(Date.now() - t0, { ...t, view });
    track(res, t);
  }
  actions.add(1, t);
  sleep(TMIN + Math.random() * (TMAX - TMIN));
}

export function handleSummary(data) {
  const m = data.metrics;
  const get = (k) => m[k]?.values ?? null;
  const out = { levels: [], think: [TMIN, TMAX], cache: CACHE, writeP: WRITE_P, hold: HOLD, warm: WARM };
  const secs = HOLD - WARM;
  for (const n of LEVELS) {
    const s = lvl(n);
    const d = get(`http_req_duration{scenario:${s},warm:0}`) || {};
    const pg = get(`page_ms{scenario:${s},warm:0}`) || {};
    const wr = get(`write_ms{scenario:${s},warm:0}`) || {};
    const reqs = get(`http_reqs{scenario:${s},warm:0}`)?.count ?? 0;
    const err = {}; let errTotal = 0;
    for (const k of KINDS) { const c = get(`errors{scenario:${s},warm:0,kind:${k}}`)?.count ?? 0; if (c) { err[k] = c; if (k !== 'forbidden') errTotal += c; } }
    const names = [];
    for (const name of NAMES()) { const v = get(`http_req_duration{scenario:${s},warm:0,name:${name}}`); if (v && v.count) names.push({ name, n: v.count, med: Math.round(v.med), p95: Math.round(v['p(95)']), max: Math.round(v.max) }); }
    names.sort((a, b) => b.p95 - a.p95);
    const r0 = (x) => (x == null ? null : Math.round(x));
    out.levels.push({ users: n, reqs, rps: +(reqs / secs).toFixed(1), actions: get(`actions{scenario:${s},warm:0}`)?.count ?? 0,
      req: { med: r0(d.med), p90: r0(d['p(90)']), p95: r0(d['p(95)']), p99: r0(d['p(99)']), max: r0(d.max) },
      page: { n: pg.count ?? 0, med: r0(pg.med), p95: r0(pg['p(95)']), max: r0(pg.max) },
      write: { n: wr.count ?? 0, med: r0(wr.med), p95: r0(wr['p(95)']), max: r0(wr.max) },
      errors: err, errRate: reqs ? +(100 * errTotal / reqs).toFixed(2) : 0, slowest: names.slice(0, 12) });
  }
  const lines = ['users | req/s | req med | req p95 | page med | page p95 | write med | write p95 | lỗi %'];
  for (const l of out.levels) lines.push(`${l.users} | ${l.rps} | ${l.req.med} | ${l.req.p95} | ${l.page.med} | ${l.page.p95} | ${l.write.med ?? '-'} | ${l.write.p95 ?? '-'} | ${l.errRate} ${JSON.stringify(l.errors)}`);
  return { stdout: `${lines.join('\n')}\n===KETQUA===\n${JSON.stringify(out)}\n===HET===\n`, 'ket-qua.json': JSON.stringify(out, null, 1) };
}
