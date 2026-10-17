/** Chỉ lưu hash; không ghi khóa thiết bị vào log hoặc cơ sở dữ liệu. */
export type DevicePair = { id: string; device: 'PC'; tokenHash: string; code: string; created: number; expires: number; status: 'pending' | 'approved' | 'revoked' };
export async function tokenHash(token: string) {
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token)))].map((b) => b.toString(16).padStart(2, '0')).join('');
}
export function constantEqual(a: string, b: string) {
  let diff = a.length ^ b.length;
  for (let i = 0; i < 64; i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}
export const pairUsable = (p: DevicePair, now: number) => p.status === 'approved' && p.created <= now;
export async function listPairs(db: D1Database) {
  const rows = await db.prepare("SELECT value FROM app_settings WHERE key GLOB 'ai_pair:*'").all<{ value: string }>();
  return rows.results.map((r) => JSON.parse(r.value) as DevicePair);
}
export async function requestPair(db: D1Database, hash: string, ip: string, now = Date.now()) {
  if (!/^[a-f0-9]{64}$/.test(hash)) throw new Error('Hash không hợp lệ');
  const rateKey = `ai_pair_rate:${await tokenHash(ip)}:${Math.floor(now / 3600000)}`;
  // UPDATE nguyên tử: các yêu cầu đồng thời không vượt bộ đếm.
  const count = await db.prepare(`INSERT INTO app_settings(key,value,updated_at) VALUES (?, '1', datetime('now')) ON CONFLICT(key) DO UPDATE SET value=CAST(value AS INTEGER)+1 RETURNING value`).bind(rateKey).first<{ value: string }>();
  if (Number(count?.value) > 10) throw new Error('Quá giới hạn');
  const bytes = crypto.getRandomValues(new Uint32Array(1));
  const pair: DevicePair = { id: crypto.randomUUID(), device: 'PC', tokenHash: hash, code: String(bytes[0] % 1000000).padStart(6, '0'), created: now, expires: now + 86400000, status: 'pending' };
  const result = await db.prepare(`INSERT INTO app_settings(key,value,updated_at) SELECT ?,?,datetime('now') WHERE (SELECT COUNT(*) FROM app_settings WHERE key GLOB 'ai_pair:*' AND json_extract(value,'$.status')='pending' AND json_extract(value,'$.expires')>?)<3`).bind(`ai_pair:${pair.id}`, JSON.stringify(pair), now).run();
  if (!result.meta.changes) throw new Error('Đã có 3 yêu cầu chờ');
  return { id: pair.id, code: pair.code, expires: pair.expires };
}
export async function changePair(db: D1Database, id: string, action: 'approve' | 'revoke', now = Date.now()) {
  const result = await db.prepare(`UPDATE app_settings SET value=json_set(value,'$.status',?) WHERE key=? AND (?='revoke' OR (json_extract(value,'$.status')='pending' AND json_extract(value,'$.expires')>?))`).bind(action === 'approve' ? 'approved' : 'revoked', `ai_pair:${id}`, action, now).run();
  return !!result.meta.changes;
}
export async function authorizeDevice(db: D1Database, request: Request) {
  const path = new URL(request.url).pathname;
  if (!((path === '/api/ai/pack' && request.method === 'GET') || (path === '/api/ai/insights' && request.method === 'POST'))) return false;
  const token = request.headers.get('Authorization')?.match(/^Bearer ([a-f0-9]{64})$/)?.[1];
  if (!token) return false;
  const hash = await tokenHash(token);
  return (await listPairs(db)).some((p) => constantEqual(p.tokenHash, hash) && pairUsable(p, Date.now()));
}
