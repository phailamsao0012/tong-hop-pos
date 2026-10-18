import { STATUS_PRESETS } from './order-status';

export type StuckAlertConfig = { enabled: boolean; hours: number; chatId: string; perSellerMax: number };
export const STUCK_DEFAULTS: StuckAlertConfig = { enabled: false, hours: 24, chatId: '', perSellerMax: 5 };
const CONFIG = 'odoo.stuck_alert';
const LAST = CONFIG + '.last';
const THREE_HOURS = 3 * 3600000;
export function parseStuckConfig(value: unknown): StuckAlertConfig {
  const c = value as StuckAlertConfig;
  if (!c || typeof c.enabled !== 'boolean' || !Number.isInteger(c.hours) || c.hours < 1 || c.hours > 720
    || typeof c.chatId !== 'string' || (c.chatId !== '' && !/^-?\d{4,20}$/.test(c.chatId))
    || (c.enabled && !c.chatId) || !Number.isInteger(c.perSellerMax) || c.perSellerMax < 1 || c.perSellerMax > 200) throw new Error('Cấu hình báo đơn kẹt không hợp lệ.');
  return { enabled: c.enabled, hours: c.hours, chatId: c.chatId, perSellerMax: c.perSellerMax };
}
export async function readStuckConfig(db: D1Database) {
  const row = await db.prepare('SELECT value FROM app_settings WHERE key=?').bind(CONFIG).first<{ value: string }>();
  if (!row) return { ...STUCK_DEFAULTS };
  return parseStuckConfig(JSON.parse(row.value));
}
export async function saveStuckConfig(db: D1Database, config: StuckAlertConfig) {
  await db.prepare('INSERT INTO app_settings (key,value,updated_at) VALUES (?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at')
    .bind(CONFIG, JSON.stringify(parseStuckConfig(config)), new Date().toISOString()).run();
}
export type StuckRow = { id: string; seller: string; name: string };
export function buildStuckMessage(rows: StuckRow[], config: StuckAlertConfig) {
  const groups = new Map<string, { name: string; count: number }>();
  for (const row of rows) {
    const group = groups.get(row.seller) ?? { name: row.name, count: 0 };
    group.count++; groups.set(row.seller, group);
  }
  // Chỉ chiếu tên nhân viên + số lượng, không đưa đối tượng đơn/khách vào tin.
  const escape = (s: string) => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]!));
  const lines = [...groups].sort(([a], [b]) => a.localeCompare(b)).map(([, g]) =>
    escape((g.name || 'Chưa gán người lên đơn').slice(0, 80)) + ': ' + g.count + ' đơn');
  const shown: string[] = [];
  for (const line of lines) { if (shown.join('\n').length + line.length > 3000) break; shown.push(line); }
  if (shown.length < lines.length) shown.push('… còn ' + (lines.length - shown.length) + ' người.');
  return 'Báo đơn kẹt Mới / Chờ xác nhận quá ' + config.hours + ' giờ\n'
    + shown.join('\n') + '\nTổng: ' + rows.length + ' đơn (30 ngày gần nhất, tối đa 200 đơn).';
}
export function shouldSendStuck(last: { signature: string; at: number } | null, signature: string, now: number) {
  return !last || last.signature !== signature || now - last.at >= THREE_HOURS;
}
export async function runStuckAlert(db: D1Database, options: { demo: boolean; dry?: boolean; now?: number; config?: StuckAlertConfig; send?: (chatId: string, message: string) => Promise<unknown> }) {
  const config = options.config ?? await readStuckConfig(db);
  const now = options.now ?? Date.now();
  if (!options.dry && !config.enabled) return { sent: false, reason: 'disabled', message: '' };
  const utc = (at: number) => new Date(at).toISOString().slice(0, 19);
  const codes = [...STATUS_PRESETS.new.codes, STATUS_PRESETS.processing.codes[0]].join(',');
  const rows = options.demo ? [{ id: 'demo-1', seller: 'nv-a', name: 'NV A' }, { id: 'demo-2', seller: 'nv-a', name: 'NV A' }]
    : (await db.prepare(`SELECT t.id,t.pos_id || ':' || COALESCE(NULLIF(t.seller_id,''),t.creator_id,'') AS seller,
      COALESCE((SELECT u.name FROM pos_users u WHERE u.pos_id=t.pos_id AND u.user_id=COALESCE(NULLIF(t.seller_id,''),t.creator_id) LIMIT 1),'Chưa gán người lên đơn') AS name
      FROM raw_pos_orders t INDEXED BY idx_raw_orders_pos_status_origin
      WHERE t.pos_id IN (SELECT id FROM pos_shops) AND t.status_code IN (${codes}) AND t.created_at>=? AND t.created_at<?
      ORDER BY t.created_at,t.id LIMIT 200`).bind(utc(now - 30 * 86400000), utc(now - config.hours * 3600000)).all<StuckRow>()).results;
  const message = rows.length ? buildStuckMessage(rows, config) : 'Không có đơn kẹt.';
  if (options.demo || options.dry || !rows.length) return { sent: false, reason: options.demo ? 'demo' : options.dry ? 'dry' : 'empty', message };
  if (!options.send) return { sent: false, reason: 'no-transport', message };
  const bytes = new TextEncoder().encode(JSON.stringify([config.chatId, config.hours, rows.map((r) => [r.id, r.seller]).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)))]));
  const signature = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), (b) => b.toString(16).padStart(2, '0')).join('');
  const old = await db.prepare('SELECT value FROM app_settings WHERE key=?').bind(LAST).first<{ value: string }>();
  const last = old ? JSON.parse(old.value) as { signature: string; at: number } : null;
  if (!shouldSendStuck(last, signature, now)) return { sent: false, reason: 'duplicate', message };
  const value = JSON.stringify({ signature, at: now });
  // So sánh và giữ chỗ nguyên tử: hai lượt cron cùng đọc một dấu chỉ một lượt được gửi.
  const claimed = await db.prepare('INSERT INTO app_settings (key,value,updated_at) VALUES (?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at WHERE app_settings.value=?')
    .bind(LAST, value, new Date(now).toISOString(), old?.value ?? '').run();
  if (!claimed.meta.changes) return { sent: false, reason: 'duplicate', message };
  try { await options.send(config.chatId, message); }
  catch (error) {
    if (old) await db.prepare('UPDATE app_settings SET value=? WHERE key=? AND value=?').bind(old.value, LAST, value).run();
    else await db.prepare('DELETE FROM app_settings WHERE key=? AND value=?').bind(LAST, value).run();
    throw error;
  }
  return { sent: true, reason: 'sent', message };
}
export async function maybeStuckAlert(at: number) {
  if (new Date(at).getUTCMinutes() % 30 !== 0) return;
  const { env } = await import('cloudflare:workers');
  return runStuckAlert(env.DB, { now: at, demo: env.DEMO_MODE === '1', send: env.TELEGRAM_BOT_TOKEN ? async (chat, message) => {
    const { sendTelegram } = await import('./telegram');
    return sendTelegram(env.TELEGRAM_BOT_TOKEN!, chat, message);
  } : undefined });
}
