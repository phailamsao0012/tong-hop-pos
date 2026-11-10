import Anthropic from '@anthropic-ai/sdk';
import { env } from 'cloudflare:workers';
import { isDemo } from '@/lib/demo/mode';

/** Mô hình và giá USD / một triệu token theo plan ngày 19/10/2026. */
export const CLAUDE_MODEL = 'claude-sonnet-5-5';
/** Trần câu hỏi mỗi ngày giờ Việt Nam, toàn web. */
export const ASK_DAILY_CAP = 40;
/** Trần tháng cho hỏi đáp; phân tích đêm được thêm 5 USD. */
export const AI_MONTHLY_USD_CAP = 30;
/** Độ dài câu hỏi tối đa. */
export const ASK_MAX_CHARS = 1000;
export const PRICES = { [CLAUDE_MODEL]: { input: 2, output: 10, cacheRead: 0.2, cacheWrite: 2.5 } } as const;
export type ClaudeUsage = { input: number; output: number; cacheRead: number; cacheWrite: number };
type Usage = { input_tokens?: number | null; output_tokens?: number | null; cache_read_input_tokens?: number | null; cache_creation_input_tokens?: number | null };
export function usageOf(u?: Usage | null): ClaudeUsage {
  return { input: u?.input_tokens ?? 0, output: u?.output_tokens ?? 0, cacheRead: u?.cache_read_input_tokens ?? 0, cacheWrite: u?.cache_creation_input_tokens ?? 0 };
}
export function costUsd(usage: ClaudeUsage, { batch = false }: { batch?: boolean } = {}) {
  const p = PRICES[CLAUDE_MODEL];
  return (usage.input * p.input + usage.output * p.output + usage.cacheRead * p.cacheRead + usage.cacheWrite * p.cacheWrite) / 1_000_000 * (batch ? 0.5 : 1);
}
export function claudeClient() {
  const apiKey = env.ANTHROPIC_API_KEY;
  return apiKey ? new Anthropic({ apiKey, maxRetries: 2, timeout: 120_000 }) : null;
}
export function claudeMode(): 'live' | 'demo' | 'off' {
  return env.ANTHROPIC_API_KEY ? 'live' : isDemo() ? 'demo' : 'off';
}
const vnMonth = () => new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 7);
type Spend = ClaudeUsage & { usd: number; calls: number };
export async function readSpend(db: D1Database, month: string): Promise<Spend> {
  const row = await db.prepare('SELECT value FROM app_settings WHERE key=?').bind(`ai_spend:${month}`).first<{ value: string }>();
  return row ? JSON.parse(row.value) as Spend : { usd: 0, calls: 0, ...usageOf() };
}
export async function addSpend(db: D1Database, usage: ClaudeUsage, options: { batch?: boolean; calls?: number } = {}) {
  const usd = costUsd(usage, options);
  await db.prepare(`INSERT INTO app_settings(key,value,updated_at)
    VALUES (?,json_object('usd',round(?,6),'calls',?,'input',?,'output',?,'cacheRead',?,'cacheWrite',?),datetime('now'))
    ON CONFLICT(key) DO UPDATE SET value=json_set(app_settings.value,
      '$.usd',round(json_extract(app_settings.value,'$.usd')+?,6),
      '$.calls',json_extract(app_settings.value,'$.calls')+?,
      '$.input',json_extract(app_settings.value,'$.input')+?,
      '$.output',json_extract(app_settings.value,'$.output')+?,
      '$.cacheRead',json_extract(app_settings.value,'$.cacheRead')+?,
      '$.cacheWrite',json_extract(app_settings.value,'$.cacheWrite')+?),updated_at=excluded.updated_at`)
    .bind(`ai_spend:${vnMonth()}`, usd, options.calls ?? 1, usage.input, usage.output, usage.cacheRead, usage.cacheWrite,
      usd, options.calls ?? 1, usage.input, usage.output, usage.cacheRead, usage.cacheWrite).run();
}
export const takeAskSlot = (db: D1Database, date: string) => takeSlot(db, date, 'ai_ask_count:', ASK_DAILY_CAP);
export const takeReviewSlot = (db: D1Database, date: string) => takeSlot(db, date, 'ai_review_count:', 3);
async function takeSlot(db: D1Database, date: string, prefix: string, cap: number) {
  // RETURNING lấy đúng số thứ tự của lượt này, kể cả khi có nhiều yêu cầu đồng thời.
  const row = await db.prepare(`INSERT INTO app_settings(key,value,updated_at) VALUES (?, '1', datetime('now'))
    ON CONFLICT(key) DO UPDATE SET value=CAST(app_settings.value AS INTEGER)+1,updated_at=excluded.updated_at
    WHERE CAST(app_settings.value AS INTEGER) < ? RETURNING CAST(value AS INTEGER) AS used`)
    .bind(`${prefix}${date}`, cap).first<{ used: number }>();
  return { ok: row !== null, used: row?.used ?? cap };
}
export async function budgetLeft(db: D1Database, kind: 'ask' | 'review') {
  const { usd } = await readSpend(db, vnMonth());
  const cap = AI_MONTHLY_USD_CAP + (kind === 'review' ? 5 : 0);
  return { ok: usd < cap, usd, cap };
}
export async function pruneAiRows(db: D1Database, today: string) {
  // Giữ cả hôm nay: 7 ngày nghĩa là hôm nay và 6 ngày trước.
  for (const [prefix, days] of [['ai_ask_count:', 7], ['ai_review_count:', 7], ['ai_ask:', 30], ['ai_forecast:', 60], ['ai_review:', 60], ['ai_week:', 60]] as const) {
    await db.prepare('DELETE FROM app_settings WHERE key GLOB ? AND substr(key,?,10) < date(?,?)')
      .bind(`${prefix}*`, prefix.length + 1, today, `-${days - 1} days`).run();
  }
}
