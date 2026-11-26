// Bảng gọn Marketing, BƯỚC 2 (plan Marketing kỳ dài nhanh, anh Vũ 26/11/2026 16h28 "điền bảng gọn ban đêm"): điền lịch sử
// mkt_orders_slim / mkt_order_items_slim theo từng (POS, tháng tạo đơn) từ bảng gốc bằng INSERT ... SELECT, đối chiếu từng tháng,
// và ghi mốc "đã điền đủ" (mkt_slim_ready_v1) khi mọi tháng khớp. Bước 3 chỉ đọc bảng gọn khi mốc này còn hiệu lực.
// - Một tháng = một lô D1 (xoá dòng gọn của tháng rồi chép lại), chạy lại bao nhiêu lần cũng không tạo trùng.
// - Ghi kèm khi đồng bộ (bước 1) giữ bảng gọn mới trong lúc điền; tắt ghi kèm thì bỏ mốc (bảng gọn sẽ cũ dần).
// - Đối chiếu: số đơn, tổng tiền, số đơn theo trạng thái, cờ lịch sử, số món, tổng số lượng / tiền món. Lệch thì bỏ mốc, dựng lại tháng,
//   đối chiếu lại; còn lệch thì ghi tháng "bad", mốc chỉ bật lại khi mọi tháng khớp.
// - Việc đêm (lib/ops/scheduler.ts) chỉ chạy khi THP_MKT_SLIM_WRITE=1 và trong 22h30–05h30 giờ VN. Chạy tay: scripts/pc/dien-bang-gon.ts.
// Không ghi mốc "dữ liệu đổi" (cache báo cáo): bảng gọn chỉ được đọc khi đã khớp bảng gốc, số trên báo cáo không đổi.
import { HAS_MARKETER, SLIM_ITEMS, SLIM_ITEM_INSERT, SLIM_ORDERS, SLIM_ORDER_INSERT, WAS_PACKED, WAS_SENT, ensureSlimSchema } from '@/lib/reports/mkt-slim';
import { VN_OFFSET_HOURS, todayVn } from '@/lib/shared/report-time';

export const SLIM_FILL_KEY = 'mkt_slim_fill_v1';
export const SLIM_READY_KEY = 'mkt_slim_ready_v1';
/** Tăng khi đổi cột / cách chép bảng gọn: mốc cũ hết hiệu lực, điền lại từ đầu. */
export const SLIM_EPOCH = 1;
/** Tháng của đơn không có ngày tạo. */
export const NO_MONTH = 'none';

type MonthState = 'ok' | 'bad';
export type SlimFillState = {
  epoch: number;
  /** Ngày VN liệt kê tháng gần nhất (mỗi đêm liệt kê lại một lần để có tháng mới). */
  listedDay: string | null;
  /** "pos:tháng" cần điền, mới trước cũ sau. */
  list: string[];
  months: Record<string, MonthState>;
  /** Vị trí đối chiếu vòng tròn sau khi đã điền đủ. */
  verifyAt: number;
  startedAt: string | null;
  readyAt: string | null;
};
const emptyState = (): SlimFillState => ({ epoch: SLIM_EPOCH, listedDay: null, list: [], months: {}, verifyAt: 0, startedAt: null, readyAt: null });

const upsert = (db: D1Database, key: string, value: string, now: string) =>
  db.prepare('INSERT INTO app_settings (key,value,updated_at) VALUES (?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at WHERE app_settings.value IS NOT excluded.value')
    .bind(key, value, now);

export async function readFillState(db: D1Database): Promise<SlimFillState> {
  const r = await db.prepare('SELECT value FROM app_settings WHERE key=?').bind(SLIM_FILL_KEY).first<{ value: string }>();
  try {
    const s = r ? JSON.parse(r.value) as SlimFillState : null;
    return s && s.epoch === SLIM_EPOCH ? { ...emptyState(), ...s } : emptyState();
  } catch { return emptyState(); }
}
const saveState = (db: D1Database, s: SlimFillState, now: string) => upsert(db, SLIM_FILL_KEY, JSON.stringify(s), now).run();

/** Mốc "đã điền đủ": nhớ 60 giây mỗi tiến trình (như segmentStatsReady). */
let readyMemo = { value: false, at: 0, db: null as D1Database | null };
export async function slimReady(db: D1Database) {
  if (readyMemo.db === db && Date.now() - readyMemo.at < 60000) return readyMemo.value;
  let value = false;
  try {
    const r = await db.prepare('SELECT value FROM app_settings WHERE key=?').bind(SLIM_READY_KEY).first<{ value: string }>();
    value = r?.value === String(SLIM_EPOCH);
  } catch { value = false; }
  readyMemo = { value, at: Date.now(), db };
  return value;
}
/** Chỉ cho test: quên mốc đã nhớ. */
export function resetSlimReadyMemo() { readyMemo = { value: false, at: 0, db: null }; }

async function setReady(db: D1Database, on: boolean, now: string) {
  if (on) await upsert(db, SLIM_READY_KEY, String(SLIM_EPOCH), now).run();
  else await db.prepare('DELETE FROM app_settings WHERE key=?').bind(SLIM_READY_KEY).run();
  readyMemo = { value: on, at: Date.now(), db };
}

let offChecked = false;
/** Ghi kèm đang tắt: bảng gọn không còn theo kịp bảng gốc, bỏ mốc "đã điền đủ" và tiến độ (một lần mỗi tiến trình). */
export async function dropSlimReadyIfOff(db: D1Database, writeOn: boolean) {
  if (writeOn || offChecked) return;
  offChecked = true;
  try {
    await db.batch([db.prepare('DELETE FROM app_settings WHERE key=?').bind(SLIM_READY_KEY), db.prepare('DELETE FROM app_settings WHERE key=?').bind(SLIM_FILL_KEY)]);
  } catch { /* chưa có bảng app_settings (test) */ }
  readyMemo = { value: false, at: Date.now(), db };
}
/** Chỉ cho test. */
export function resetSlimOffCheck() { offChecked = false; }

/** Khoảng tháng tạo đơn trên một bảng (bí danh a): chuỗi ngày ISO UTC nên so chuỗi được, dùng chỉ mục (pos_id, created_at). */
function monthWhere(a: string, month: string): [string, string[]] {
  if (month === NO_MONTH) return [`${a}.created_at IS NULL`, []];
  const [y, m] = month.split('-').map(Number);
  const next = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;
  return [`${a}.created_at>=? AND ${a}.created_at<?`, [month, next]];
}

/** Các (POS, tháng) có đơn có Marketer ở bảng gốc, cộng các tháng đang có dòng gọn (để dọn tháng đã hết đơn có Marketer). */
export async function slimMonths(db: D1Database) {
  const rows = await db.prepare(`SELECT pos_id, month FROM (
      SELECT o.pos_id, COALESCE(substr(o.created_at,1,7),'${NO_MONTH}') AS month FROM raw_pos_orders o WHERE ${HAS_MARKETER} GROUP BY 1,2
      UNION SELECT pos_id, COALESCE(substr(created_at,1,7),'${NO_MONTH}') AS month FROM ${SLIM_ORDERS} GROUP BY 1,2
    ) ORDER BY month DESC, pos_id`).all<{ pos_id: string; month: string }>();
  return rows.results.map((r) => `${r.pos_id}:${r.month}`);
}

/** Điền lại một (POS, tháng): xoá dòng gọn của tháng rồi chép từ bảng gốc, một lô. Trả số dòng ghi. */
export async function fillSlimMonth(db: D1Database, posId: string, month: string) {
  await ensureSlimSchema(db);
  const [ws, bs] = monthWhere('s', month), [wo, bo] = monthWhere('o', month);
  const results = await db.batch([
    db.prepare(`DELETE FROM ${SLIM_ITEMS} WHERE order_id IN (SELECT s.id FROM ${SLIM_ORDERS} s WHERE s.pos_id=? AND ${ws})`).bind(posId, ...bs),
    db.prepare(`DELETE FROM ${SLIM_ORDERS} AS s WHERE s.pos_id=? AND ${ws}`).bind(posId, ...bs),
    db.prepare(`${SLIM_ORDER_INSERT} FROM raw_pos_orders o WHERE o.pos_id=? AND ${wo} AND ${HAS_MARKETER}`).bind(posId, ...bo),
    db.prepare(`${SLIM_ITEM_INSERT} FROM ${SLIM_ORDERS} s JOIN raw_pos_order_items i ON i.order_id=s.id WHERE s.pos_id=? AND ${ws}`).bind(posId, ...bs),
  ]);
  return results.reduce((n, r) => n + Number(r.meta?.rows_written ?? 0), 0);
}

const ORDER_SUMS = `COUNT(*) AS n, COALESCE(SUM(current_total),0) AS cur, COALESCE(SUM(net_total),0) AS net, COALESCE(SUM(total_discount),0) AS disc,
  COUNT(first_confirmed_at) AS confirmed, COUNT(first_closed_at) AS closed, COUNT(DISTINCT marketer_id) AS mkts`;
const ITEM_SUMS = 'COUNT(*) AS n, COALESCE(SUM(i.quantity),0) AS qty, COALESCE(SUM(i.line_total),0) AS line, COALESCE(SUM(i.is_bonus),0) AS bonus';
export type SlimCompare = { ok: boolean; diff: string[] };

/** Đối chiếu một (POS, tháng) giữa bảng gốc (đơn có Marketer) và bảng gọn. diff chỉ ghi tên chỉ số lệch, không ghi số. */
export async function compareSlimMonth(db: D1Database, posId: string, month: string): Promise<SlimCompare> {
  await ensureSlimSchema(db);
  const [ws, bs] = monthWhere('s', month), [wo, bo] = monthWhere('o', month);
  const rawWhere = `o.pos_id=? AND ${wo} AND ${HAS_MARKETER}`, slimWhere = `s.pos_id=? AND ${ws}`;
  const [ro, so, rs, ss, ri, si] = await db.batch([
    db.prepare(`SELECT ${ORDER_SUMS}, COALESCE(SUM(${WAS_PACKED}),0) AS packed, COALESCE(SUM(${WAS_SENT}),0) AS sent FROM raw_pos_orders o WHERE ${rawWhere}`).bind(posId, ...bo),
    db.prepare(`SELECT ${ORDER_SUMS}, COALESCE(SUM(was_packed),0) AS packed, COALESCE(SUM(was_sent),0) AS sent FROM ${SLIM_ORDERS} s WHERE ${slimWhere}`).bind(posId, ...bs),
    db.prepare(`SELECT COALESCE(o.status_code,-1) AS st, COUNT(*) AS n FROM raw_pos_orders o WHERE ${rawWhere} GROUP BY 1 ORDER BY 1`).bind(posId, ...bo),
    db.prepare(`SELECT COALESCE(s.status_code,-1) AS st, COUNT(*) AS n FROM ${SLIM_ORDERS} s WHERE ${slimWhere} GROUP BY 1 ORDER BY 1`).bind(posId, ...bs),
    db.prepare(`SELECT ${ITEM_SUMS} FROM raw_pos_orders o JOIN raw_pos_order_items i ON i.order_id=o.id WHERE ${rawWhere}`).bind(posId, ...bo),
    db.prepare(`SELECT ${ITEM_SUMS} FROM ${SLIM_ORDERS} s JOIN ${SLIM_ITEMS} i ON i.order_id=s.id WHERE ${slimWhere}`).bind(posId, ...bs),
  ]);
  const diff: string[] = [];
  const cmp = (label: string, a: Record<string, unknown> | undefined, b: Record<string, unknown> | undefined) => {
    for (const k of new Set([...Object.keys(a ?? {}), ...Object.keys(b ?? {})])) if (Number(a?.[k] ?? 0) !== Number(b?.[k] ?? 0)) diff.push(`${label}.${k}`);
  };
  cmp('don', ro.results[0] as Record<string, unknown>, so.results[0] as Record<string, unknown>);
  const byStatus = (r: D1Result) => Object.fromEntries((r.results as { st: number; n: number }[]).map((x) => [String(x.st), x.n]));
  cmp('trang_thai', byStatus(rs), byStatus(ss));
  cmp('mon', ri.results[0] as Record<string, unknown>, si.results[0] as Record<string, unknown>);
  return { ok: diff.length === 0, diff };
}

export type FillStep = { key: string; result: MonthState; ms: number; diff: string[]; kind: 'fill' | 'verify' };
export type FillRun = { steps: FillStep[]; pending: number; bad: number; ready: boolean; writes: number };

/**
 * Một lượt điền / đối chiếu. Dừng khi hết hạn (deadline, ms Date.now), đủ maxMonths, hoặc stop() trả true (lệnh chạy tay đo /login).
 * Chưa đủ: điền các tháng chưa "ok" (mới trước cũ sau). Đủ: đối chiếu vòng tròn verifyMonths tháng mỗi lượt.
 */
export async function runSlimFill(db: D1Database, opts: { now?: Date; deadline?: number; maxMonths?: number; verifyMonths?: number; pauseMs?: number; stop?: () => boolean | Promise<boolean>; sleep?: (ms: number) => Promise<void> } = {}): Promise<FillRun> {
  await ensureSlimSchema(db);
  const now = opts.now ?? new Date(), stamp = now.toISOString(), day = todayVn(now.getTime());
  const deadline = opts.deadline ?? Number.POSITIVE_INFINITY, maxMonths = opts.maxMonths ?? Number.POSITIVE_INFINITY;
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const s = await readFillState(db);
  if (s.listedDay !== day) {
    s.list = await slimMonths(db);
    s.listedDay = day;
    for (const k of Object.keys(s.months)) if (!s.list.includes(k)) delete s.months[k];
  }
  s.startedAt ??= stamp;
  const steps: FillStep[] = [];
  let writes = 0, done = 0;
  const more = async () => done < maxMonths && Date.now() < deadline && !(await opts.stop?.());
  const one = async (key: string, kind: FillStep['kind']) => {
    const [posId, month] = [key.slice(0, key.lastIndexOf(':')), key.slice(key.lastIndexOf(':') + 1)];
    const t0 = Date.now();
    let c: SlimCompare = { ok: false, diff: [] };
    if (kind === 'verify') {
      c = await compareSlimMonth(db, posId, month);
      // Lệch: bỏ mốc ngay (bước 3 quay về bảng gốc), rồi dựng lại tháng.
      if (!c.ok && await slimReady(db)) await setReady(db, false, stamp);
    }
    if (kind === 'fill' || !c.ok) {
      for (let attempt = 0; attempt < 2; attempt++) {
        writes += await fillSlimMonth(db, posId, month);
        c = await compareSlimMonth(db, posId, month);
        if (c.ok) break;
      }
    }
    s.months[key] = c.ok ? 'ok' : 'bad';
    steps.push({ key, result: s.months[key], ms: Date.now() - t0, diff: c.diff, kind });
    await saveState(db, s, stamp);
    done++;
  };
  const pending = () => s.list.filter((k) => s.months[k] !== 'ok');
  // Tháng "bad" thử lại sau các tháng chưa điền.
  const order = () => [...pending().filter((k) => !s.months[k]), ...pending().filter((k) => s.months[k] === 'bad')];
  for (const key of order()) {
    if (!(await more())) break;
    if (done && opts.pauseMs) await sleep(opts.pauseMs);
    await one(key, 'fill');
  }
  const ready = await slimReady(db);
  if (!pending().length && s.list.length) {
    if (!ready) { await setReady(db, true, stamp); s.readyAt = stamp; await saveState(db, s, stamp); }
    // Đã đủ: đối chiếu vòng tròn vài tháng mỗi lượt (lệch thì dựng lại, xem one()).
    const verify = Math.min(opts.verifyMonths ?? 0, s.list.length);
    for (let i = 0; i < verify && await more(); i++) {
      if (done && opts.pauseMs) await sleep(opts.pauseMs);
      const key = s.list[s.verifyAt % s.list.length];
      s.verifyAt = (s.verifyAt + 1) % s.list.length;
      await one(key, 'verify');
    }
    if (!pending().length && !(await slimReady(db))) { await setReady(db, true, stamp); s.readyAt = stamp; await saveState(db, s, stamp); }
  }
  return { steps, pending: pending().length, bad: s.list.filter((k) => s.months[k] === 'bad').length, ready: await slimReady(db), writes };
}

/** Giờ chạy việc đêm (giờ VN): 22h30 tới trước 05h30, tránh mốc báo cáo 22h và sáng 8h. */
export function inSlimNightWindow(now: Date) {
  const hm = new Date(now.getTime() + VN_OFFSET_HOURS * 3600000).toISOString().slice(11, 16);
  return hm >= '22:30' || hm < '05:30';
}

/** Việc đêm trong bộ hẹn giờ: chỉ khi bật ghi kèm (THP_MKT_SLIM_WRITE=1) và trong giờ đêm; ngắn (mặc định ≤ 8 giây) mỗi lượt. */
export async function maybeSlimFillNightly(db: D1Database, env: { THP_MKT_SLIM_WRITE?: string }, now = new Date(), budgetMs = 8000) {
  if (env.THP_MKT_SLIM_WRITE !== '1' || !inSlimNightWindow(now)) return 0;
  const r = await runSlimFill(db, { now, deadline: Date.now() + budgetMs, verifyMonths: 2 });
  for (const step of r.steps) if (step.result === 'bad') console.warn(`mkt slim ${step.kind} lệch ${step.key}: ${step.diff.join(',')}`);
  return r.writes;
}
