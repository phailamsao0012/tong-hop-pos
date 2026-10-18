// Canh gác 24/7, phần chạy thật (plan 11/10/2026 mục 3, QA điểm 7–9). Logic thuần ở lib/watch-core.ts.
// Lớp 1: bộ hẹn giờ DO gọi runWatch sau MỌI lượt đồng bộ (thành công, bị khoá ghi, lỗi), trạng thái giữ ở bộ nhớ DO.
// Lớp 2: Cron Worker gọi checkScheduler mỗi 5 phút, báo khi chính bộ hẹn giờ im; chống trùng bằng app_settings, trần 1 tin/giờ bằng Cache API.
// Chỉ gửi tới watch_chats do chủ hệ thống đặt trên web (chat riêng). Chưa đặt thì chỉ ghi nhật ký. Bản demo không gửi Telegram (ghi log).
// D1 chỉ là nhật ký (ops_incidents), ghi lỗi vẫn gửi tin. Log chỉ ghi số đếm, thời gian, không ghi nội dung tin hay chat id.
import { sendTelegram } from '@/lib/telegram';
import {
  DEFAULT_CONFIG, SCHED_FAMILIES, TEST_TEXT, advance, backupProblems, clip, d1ReadProblem, dispatchProblems, emptyState, incidentId, markSent,
  outbox, parseChats, parseConfig, parseSchedAlert, parseSim, prune, schedDead, schedDeadText, schedResolvedText, schedStep, schedulerProblems,
  shouldMeasure, sizeProblems, syncProblems, type DispatchOff, type Incident, type PosSignal, type RunInfo, type WatchState,
} from '@/lib/watch-core';
import { POS } from '@/lib/report-model';

export const WATCH_CHATS_KEY = 'watch_chats';
export const WATCH_CONFIG_KEY = 'watch_config';
export const WATCH_SIM_KEY = 'watch_sim';
export const BACKUP_LAST_KEY = 'backup:last';
export const SCHED_ALERT_KEY = 'watch_sched_alert';
/** Mỗi câu đọc D1 của lượt canh chờ tối đa chừng này: D1 treo không giữ chân lượt alarm (QA điểm 8). */
export const READ_TIMEOUT_MS = 4000;

type Env = Pick<Cloudflare.Env, 'DB' | 'DEMO_MODE' | 'TELEGRAM_BOT_TOKEN'>;
/** Nơi giữ trạng thái: bộ nhớ DO (khoá 'watch'). */
export type WatchStore = { get(): Promise<WatchState | undefined>; put(s: WatchState): Promise<void> };

const message = (e: unknown) => e instanceof Error ? e.message : String(e);
/** Chờ p tối đa ms; quá thì ném lỗi (dọn hẹn giờ để không giữ tiến trình). */
export async function timed<T>(p: Promise<T>, ms: number, what: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try { return await Promise.race([p, new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error(`${what}: quá ${ms} ms`)), ms); })]); }
  finally { clearTimeout(timer); }
}

type Signals = { shops: PosSignal[]; dispatchOff: DispatchOff[]; settings: Map<string, string>; bytes: number | null };
const posName = (id: string, fallback?: string | null) => POS.find((p) => p.id === id)?.name ?? fallback ?? id;

/** Một lần đi D1 (batch 3 câu đọc nhỏ). Dung lượng lấy từ meta.size_after đi kèm, không tốn thêm câu. */
async function readSignals(db: D1Database): Promise<Signals> {
  // SELECT * để biết cột recent_watermark (tổ đồng bộ thêm song song) có chưa: có thì đọc, chưa thì bỏ qua kiểm "đơn về trễ".
  const [shops, off, settings] = await db.batch([
    db.prepare('SELECT * FROM pos_shops WHERE enabled=1 AND shop_id IS NOT NULL'),
    db.prepare("SELECT pos_id, updated_at, last_error, waiting FROM dispatch_pos WHERE mode='off' AND updated_by='Tự tắt'"),
    db.prepare('SELECT key, value FROM app_settings WHERE key IN (?,?,?,?)').bind(WATCH_CHATS_KEY, WATCH_CONFIG_KEY, BACKUP_LAST_KEY, WATCH_SIM_KEY),
  ]);
  const size = Number((shops.meta as { size_after?: number } | undefined)?.size_after);
  return {
    shops: (shops.results as Record<string, unknown>[])
      .filter((r) => POS.some((p) => p.id === r.id) && /^\d+$/.test((r.shop_id as string | null) ?? ''))
      .map((r) => ({ id: String(r.id), name: posName(String(r.id), r.name as string), lastSyncAt: (r.last_sync_at as string | null) ?? null,
        watermark: 'recent_watermark' in r ? (r.recent_watermark as string | null) : undefined, lastError: (r.last_error as string | null) ?? null })),
    dispatchOff: (off.results as { pos_id: string; updated_at: string; last_error: string | null; waiting: number }[])
      .map((r) => ({ posId: r.pos_id, name: posName(r.pos_id), updatedAt: r.updated_at, reason: r.last_error, waiting: Number(r.waiting) || 0 })),
    settings: new Map((settings.results as { key: string; value: string }[]).map((r) => [r.key, r.value])),
    bytes: Number.isFinite(size) && size > 0 ? size : null,
  };
}

/** Ghi nhật ký ops_incidents (chỉ dòng vừa đổi). Lỗi thì bỏ qua: trạng thái thật nằm ở bộ nhớ DO. */
async function logIncidents(db: D1Database, list: Incident[], now: Date) {
  if (!list.length) return;
  const at = now.toISOString();
  await db.batch(list.map((i) => db.prepare(`INSERT INTO ops_incidents (id,key,severity,title,detail,opened_at,notified_at,resolved_at,resolved_notified_at,notify_count,channel,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET severity=excluded.severity,title=excluded.title,detail=excluded.detail,notified_at=excluded.notified_at,
      resolved_at=excluded.resolved_at,resolved_notified_at=excluded.resolved_notified_at,notify_count=excluded.notify_count,channel=excluded.channel,updated_at=excluded.updated_at`)
    .bind(incidentId(i), i.key, i.severity, i.title.slice(0, 200), i.detail?.slice(0, 500) ?? null, i.openedAt, i.notifiedAt, i.resolvedAt, i.resolvedNotifiedAt, i.notifyCount, i.channel, at)));
}

/** Gửi một tin tới mọi chat canh gác; true nếu ít nhất một chat nhận được. */
async function deliver(env: Env, chats: string[], text: string): Promise<{ ok: boolean; channel: string | null; failed: number }> {
  if (env.DEMO_MODE === '1') { console.log('watch demo-log: 1 tin (không gửi Telegram ở bản demo)'); return { ok: true, channel: 'demo-log', failed: 0 }; }
  const token = env.TELEGRAM_BOT_TOKEN?.trim();
  if (!chats.length || !token) return { ok: false, channel: null, failed: 0 };
  let sent = 0, failed = 0;
  for (const chat of chats) {
    try { await sendTelegram(token, chat, clip(text)); sent++; } catch { failed++; }
  }
  return { ok: sent > 0, channel: 'telegram', failed };
}

export type WatchSummary = { open: number; opened: number; resolved: number; sent: number; pending: number; readError: boolean };

/**
 * Lớp 1: một lượt canh sau lượt đồng bộ `run`. Gửi tin trước, rồi lưu trạng thái vào bộ nhớ DO, sau cùng mới thử ghi nhật ký D1.
 * D1 không đọc được: dùng bản sao chat nhận / cấu hình trong bộ nhớ DO, các kiểm tra cần D1 giữ nguyên, 2 lượt liền thì báo 🔴 d1_read.
 */
export async function runWatch(env: Env, store: WatchStore, run: RunInfo, opts: { now?: Date; readTimeoutMs?: number } = {}): Promise<WatchSummary> {
  const now = opts.now ?? new Date();
  const started = Date.now();
  const prev: WatchState = { ...emptyState(), ...(await store.get()) };
  let signals: Signals | null = null, readError: string | null = null;
  try { signals = await timed(readSignals(env.DB), opts.readTimeoutMs ?? READ_TIMEOUT_MS, 'đọc D1'); } catch (e) { readError = message(e); }
  const demo = env.DEMO_MODE === '1';
  const sim = demo && signals ? parseSim(signals.settings.get(WATCH_SIM_KEY)) : {};
  const config = signals ? parseConfig(signals.settings.get(WATCH_CONFIG_KEY)) : prev.config ?? DEFAULT_CONFIG;
  const chats = signals ? parseChats(signals.settings.get(WATCH_CHATS_KEY)) : prev.chats ?? [];

  const effRun: RunInfo = { ...run, ok: run.ok && !sim.schedError, error: sim.schedError ? 'watch_sim: lỗi giả' : run.error, blocked: run.blocked || !!sim.writeBlock };
  const problems = schedulerProblems(effRun);
  const families = [...SCHED_FAMILIES, 'd1_read'];
  let sizes = prev.sizes;
  if (readError) problems.push(d1ReadProblem(readError));
  if (signals) {
    const shops = sim.posStale ? signals.shops.map((s) => s.id === sim.posStale || sim.posStale === '*' ? { ...s, lastSyncAt: new Date(now.getTime() - 30 * 60000).toISOString() } : s) : signals.shops;
    families.push('pos_stale', 'pos_lag', 'dispatch_off');
    problems.push(...syncProblems(shops, now), ...dispatchProblems(signals.dispatchOff));
    const backup = backupProblems(signals.settings.get(BACKUP_LAST_KEY), now);
    if (backup.ran) { families.push('backup'); problems.push(...backup.problems); }
    const bytes = sim.d1Mb ? sim.d1Mb * 1e6 : signals.bytes;
    if (bytes !== null && shouldMeasure(prev.sizes, now)) {
      const r = sizeProblems(bytes, prev.sizes, now, config);
      families.push('d1_size', 'd1_growth'); problems.push(...r.problems); sizes = r.sizes;
    }
  }

  const adv = advance({ now, incidents: prev.incidents, streaks: prev.streaks, problems, families });
  let incidents = adv.incidents;
  const changed = new Set(adv.changed);
  let sent = 0, pending = 0;
  for (const msg of outbox({ now, config, incidents, fresh: adv.fresh })) {
    const r = await deliver(env, chats, msg.text);
    if (!r.ok) { pending += msg.ids.length; continue; }
    sent++;
    const ids = new Set(msg.ids);
    incidents = incidents.map((i) => ids.has(incidentId(i)) ? markSent(i, msg.kind, now, r.channel!) : i);
    for (const id of ids) changed.add(id);
    if (r.failed) console.error(`watch: ${r.failed} chat không nhận được tin`);
  }
  if (pending) console.warn(`watch: ${pending} sự cố chờ báo (${chats.length ? 'gửi lỗi hoặc thiếu token bot' : 'chưa đặt chat nhận watch_chats'})`);

  await store.put({ incidents: prune(incidents, now), streaks: adv.streaks, chats, config, sizes, lastAt: now.getTime() });
  if (signals) {
    try { await timed(logIncidents(env.DB, incidents.filter((i) => changed.has(incidentId(i))), now), opts.readTimeoutMs ?? READ_TIMEOUT_MS, 'ghi nhật ký'); }
    catch (e) { console.error('watch log failed', message(e).slice(0, 120)); }
  }
  const open = incidents.filter((i) => !i.resolvedAt).length;
  const summary = { open, opened: adv.fresh.length, resolved: incidents.filter((i) => i.resolvedAt === now.toISOString()).length, sent, pending, readError: !!readError };
  console.log(`watch ${Date.now() - started}ms: ${open} mở, ${summary.opened} mới/nâng mức, ${summary.resolved} đóng, ${sent} tin`);
  return summary;
}

// ---------------- Lớp 2: Cron canh bộ hẹn giờ ----------------

/** Trần chống trùng ngoài D1: Cache API (dùng chung các isolate cùng trạm) cộng bộ nhớ isolate (phòng khi Cache API không có). */
export type Ceiling = { get(key: string): Promise<string | null>; set(key: string, value: string, ttlS: number): Promise<void>; del(key: string): Promise<void> };
const memory = new Map<string, { value: string; until: number }>();
const CACHE_ORIGIN = 'https://canh-gac.internal/';
export function cacheCeiling(): Ceiling {
  const cache = (globalThis as { caches?: { default?: Cache } }).caches?.default;
  const url = (key: string) => `${CACHE_ORIGIN}${encodeURIComponent(key)}`;
  return {
    async get(key) {
      const m = memory.get(key);
      if (m && m.until > Date.now()) return m.value;
      try { const r = await cache?.match(url(key)); return r ? await r.text() : null; } catch { return null; }
    },
    async set(key, value, ttlS) {
      memory.set(key, { value, until: Date.now() + ttlS * 1000 });
      try { await cache?.put(url(key), new Response(value, { headers: { 'Cache-Control': `max-age=${ttlS}` } })); } catch { /* chỉ còn bộ nhớ isolate */ }
    },
    async del(key) {
      memory.delete(key);
      try { await cache?.delete(url(key)); } catch { /* bỏ qua */ }
    },
  };
}

const CEIL_SENT = 'sched_dead_sent';
const CEIL_RPC = 'sched_rpc_fail';
const CEIL_CHATS = 'watch_chats';
const HOUR_S = 3600;

/**
 * Lớp 2 (Cron, mỗi 5 phút): bộ hẹn giờ im quá 15 phút, hoặc gọi RPC lỗi 2 lần liền (cách nhau ≤ 15 phút), thì gửi 🔴 thẳng từ Worker.
 * Báo một lần (app_settings watch_sched_alert, ghi được thì ghi) và "✅ Đã ổn lại" khi chạy lại; dù D1 lỗi vẫn không quá 1 tin mỗi giờ (Cache API).
 */
export async function checkScheduler(env: Env, getStatus: () => Promise<{ lastRunAt: number | null }>, opts: { now?: Date; ceiling?: Ceiling; timeoutMs?: number } = {}) {
  const now = opts.now ?? new Date();
  const ceiling = opts.ceiling ?? cacheCeiling();
  const ms = opts.timeoutMs ?? 5000;
  let lastRunAt: number | null = null, rpcError: string | null = null;
  try { lastRunAt = (await timed(getStatus(), ms, 'gọi bộ hẹn giờ')).lastRunAt; } catch (e) { rpcError = message(e); }

  let prev: ReturnType<typeof parseSchedAlert> | undefined, chats: string[], sim = parseSim(null);
  try {
    const rows = await timed(env.DB.prepare('SELECT key, value FROM app_settings WHERE key IN (?,?,?)').bind(SCHED_ALERT_KEY, WATCH_CHATS_KEY, WATCH_SIM_KEY).all<{ key: string; value: string }>(), ms, 'đọc D1');
    const map = new Map(rows.results.map((r) => [r.key, r.value]));
    prev = parseSchedAlert(map.get(SCHED_ALERT_KEY));
    chats = parseChats(map.get(WATCH_CHATS_KEY));
    if (env.DEMO_MODE === '1') sim = parseSim(map.get(WATCH_SIM_KEY));
    await ceiling.set(CEIL_CHATS, JSON.stringify(chats), 7 * 24 * HOUR_S);
  } catch {
    prev = undefined;
    chats = parseChats(await ceiling.get(CEIL_CHATS));
  }

  let dead = schedDead(lastRunAt, now) || !!sim.schedDead;
  if (rpcError) {
    if (await ceiling.get(CEIL_RPC)) dead = true;
    else await ceiling.set(CEIL_RPC, now.toISOString(), 15 * 60);
  } else await ceiling.del(CEIL_RPC);

  const step = schedStep(prev, dead, now);
  let next = step.next;
  let sent: 'alert' | 'resolved' | null = null;
  if (step.send === 'alert' && !(await ceiling.get(CEIL_SENT))) {
    const r = await deliver(env, chats, schedDeadText(lastRunAt, rpcError, now));
    if (r.ok) { sent = 'alert'; await ceiling.set(CEIL_SENT, now.toISOString(), HOUR_S); if (next) next = { ...next, notifiedAt: now.toISOString() }; }
  } else if (step.send === 'resolved' && next) {
    const r = await deliver(env, chats, schedResolvedText(next));
    if (r.ok) { sent = 'resolved'; await ceiling.del(CEIL_SENT); } else next = { ...next, resolvedAt: null }; // gửi lỗi: lượt sau thử lại
  }
  if (next && JSON.stringify(next) !== JSON.stringify(prev ?? null)) {
    try {
      await timed(env.DB.prepare('INSERT INTO app_settings (key,value,updated_at) VALUES (?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at')
        .bind(SCHED_ALERT_KEY, JSON.stringify(next), now.toISOString()).run(), ms, 'ghi D1');
    } catch (e) { console.error('watch sched state write failed', message(e).slice(0, 120)); }
  }
  if (dead || sent) console.log(`watch sched: ${dead ? 'im' : 'chạy lại'}${rpcError ? ', RPC lỗi' : ''}, tin: ${sent ?? 'không'}`);
  return { dead, sent };
}

/** Nút "Gửi thử canh gác" trên trang Cấu hình. */
export async function sendWatchTest(env: Env, chats: string[]) {
  let sent = 0, failed = 0;
  const token = env.TELEGRAM_BOT_TOKEN?.trim();
  if (!token) throw new Error('Chưa có token bot Telegram.');
  for (const chat of chats) { try { await sendTelegram(token, chat, TEST_TEXT); sent++; } catch { failed++; } }
  return { sent, failed };
}
