import { POS } from './report-model';
import { env } from 'cloudflare:workers';
import type Anthropic from '@anthropic-ai/sdk';
import { addDays, todayVn } from './report-time';
import { countedFilter } from './team';
import { overviewReport } from './overview-report';
import { baselineOf, decompose, personExpected, type Parts } from './forecast-day';
import { readForecast, type Forecast } from './forecast-run';
import { addSpend, budgetLeft, CLAUDE_MODEL, claudeClient, claudeMode, costUsd, takeReviewSlot, usageOf, type ClaudeUsage } from './claude';
import { fakeAnswer } from './demo/fake-claude';

type Person = Parts & { id: string };
type Expected = { id: string; assigned: number | null; closed: number | null; net: number | null };
const zero = (): Parts => ({ assigned: 0, closed: 0, net: 0 });
export function splitReview(expected: Expected[], actual: Person[], forecast: number | null, total: number) {
  const ids = [...new Set([...expected, ...actual].map(p => p.id))].sort();
  const people = ids.map(id => {
    const e = expected.find(p => p.id === id), a = actual.find(p => p.id === id) ?? { id, ...zero() };
    const prior = e?.net != null ? { assigned: e.assigned ?? 0, closed: e.closed ?? 0, net: e.net } : null;
    const group = !prior ? 'moi' : prior.assigned > 0 || prior.closed > 0 ? a.assigned === 0 && a.closed === 0 ? 'nghi' : 'binhThuong' : 'binhThuong';
    const parts = { soChia: 0, tiLeChot: 0, giaTriDon: 0, nghi: 0, moi: 0, khac: 0, chuaGan: 0 };
    if (!id) parts.chuaGan = a.net - (prior?.net ?? 0);
    else if (!prior) parts.moi = a.net;
    else if (group === 'nghi') { parts.nghi = -prior.net; parts.khac = a.net; }
    else { const d = decompose(prior, a); parts.soChia = d.soChia; parts.tiLeChot = d.tiLeChot; parts.giaTriDon = d.giaTriDon; parts.khac = d.khac; }
    return { id, group, expected: prior, actual: { assigned: a.assigned, closed: a.closed, net: a.net }, ...parts };
  });
  const parts = { soChia: 0, tiLeChot: 0, giaTriDon: 0, nghi: 0, moi: 0, khac: 0, chuaGan: 0 };
  for (const p of people) for (const k of Object.keys(parts) as (keyof typeof parts)[]) parts[k] += p[k];
  const delta = forecast === null ? null : total - forecast;
  // Dự báo toàn công ty khác tổng kỳ vọng từng người; giữ phần cầu nối ở Khác.
  parts.khac = delta === null ? parts.khac : delta - (parts.soChia + parts.tiLeChot + parts.giaTriDon + parts.nghi + parts.moi + parts.chuaGan);
  const top = people.filter(p => p.id).map(p => ({ id: p.id, tiLeChot: p.tiLeChot, giaTriDon: p.giaTriDon, impact: p.tiLeChot + p.giaTriDon }))
    .sort((a, b) => Math.abs(b.impact) - Math.abs(a.impact) || a.id.localeCompare(b.id)).slice(0, 5);
  return { forecast, actual: total, delta, parts, people, top };
}
export function accuracy(points: Forecast['points'], actual: number) {
  return ['10:00', '12:00', '15:00', '18:00'].map(t => {
    const point = points.filter(p => p.t <= t).sort((a, b) => b.t.localeCompare(a.t))[0];
    return { t, forecast: point?.today ?? null, errorPct: actual && point?.today != null ? (point.today - actual) / actual * 100 : null };
  });
}
async function readPeople(db: D1Database, start: string, end: string): Promise<Person[]> {
  const rows = await db.prepare(`SELECT COALESCE(seller_id,'') AS id,SUM(assigned_orders) AS assigned,SUM(closed_orders) AS closed,SUM(closed_net) AS net FROM stats_daily WHERE pos_id IN (${POS.map(() => '?').join(',')}) AND day>=? AND day<=?${countedFilter('seller_id')} GROUP BY COALESCE(seller_id,'') ORDER BY id`).bind(...POS.map(p => p.id), start, end).all<Person>();
  return rows.results.map(p => ({ id: p.id, assigned: Number(p.assigned), closed: Number(p.closed), net: Number(p.net) }));
}
async function company(start: string, end: string) {
  return (await overviewReport({ posIds: [], start, end })).current.total.closedNet;
}
export async function buildDayReview(db: D1Database, date: string) {
  const record = await readForecast(db, date), actual = await readPeople(db, date, date), total = await company(date, date);
  let expected: Expected[], forecast: number | null;
  if (record?.morning) { expected = record.morning.people; forecast = record.morning.total; }
  else {
    const history = await overviewReport({ posIds: [], start: addDays(date, -28), end: addDays(date, -1) });
    const totals = new Map<string, number>();
    for (const row of history.current.series) totals.set(row.bucket, (totals.get(row.bucket) ?? 0) + row.closedNet);
    forecast = baselineOf([7, 14, 21, 28].map(n => [totals.get(addDays(date, -n)) ?? 0]));
    const average = [...totals.values()].reduce((s, n) => s + n, 0) / 28, factor = average ? (forecast ?? 0) / average : 1;
    const days = await Promise.all(Array.from({ length: 28 }, (_, i) => readPeople(db, addDays(date, -28 + i), addDays(date, -28 + i))));
    expected = [...new Set(days.flat().map(p => p.id))].sort().map(id => ({ id, ...(personExpected(days.flat().filter(p => p.id === id), factor) ?? { assigned: null, closed: null, net: null }) }));
  }
  return { kind: 'review' as const, date, basis: record?.morning ? 'morning' : 'tinh-lai', ...splitReview(expected, actual, forecast, total), accuracy: accuracy(record?.points ?? [], total) };
}
export async function buildWeekReview(db: D1Database, weekStart: string) {
  const end = addDays(weekStart, 6), actual = await readPeople(db, weekStart, end);
  const weeks = await Promise.all([1, 2, 3, 4].map(n => readPeople(db, addDays(weekStart, -7 * n), addDays(end, -7 * n))));
  const expected = [...new Set(weeks.flat().map(p => p.id))].sort().map(id => ({ id, ...Object.fromEntries((['assigned', 'closed', 'net'] as const).map(k => [k, weeks.reduce((s, rows) => s + (rows.find(p => p.id === id)?.[k] ?? 0), 0) / 4])) })) as Expected[];
  const forecast = (await Promise.all([1, 2, 3, 4].map(n => company(addDays(weekStart, -7 * n), addDays(end, -7 * n))))).reduce((s, n) => s + n, 0) / 4;
  const errors: number[] = [];
  for (let i = 0; i < 7; i++) {
    const day = addDays(weekStart, i), f = await readForecast(db, day);
    const error = accuracy(f?.points ?? [], await company(day, day)).find(p => p.t === '12:00')?.errorPct;
    if (error != null) errors.push(Math.abs(error));
  }
  return { kind: 'week' as const, date: weekStart, end, basis: 'four-weeks', ...splitReview(expected, actual, forecast, await company(weekStart, end)), noonMeanErrorPct: errors.length ? errors.reduce((s, n) => s + n, 0) / errors.length : null };
}
export type DayReview = Awaited<ReturnType<typeof buildDayReview>>;
type ReviewData = DayReview | Awaited<ReturnType<typeof buildWeekReview>>;
export const REVIEW_SYSTEM = `Bạn là trợ lý phân tích bán hàng của một công ty bán thuốc thú y / thủy sản qua 6 cửa hàng Pancake POS, bộ phận Sale, CSKH, Marketing. Dữ liệu là JSON đã tính sẵn: dự báo đầu ngày, thực tế, phần chênh đã tách theo nguyên nhân và theo người.
Viết tối đa 8 gạch đầu dòng tiếng Việt, mỗi dòng một câu ngắn: chênh bao nhiêu, phần lớn nhất do đâu, ai kéo xuống, ai kéo lên, người nghỉ, một việc nên làm.
Chỉ dùng số có trong dữ liệu, viết tiền dạng '12,5 triệu'. Không tự cộng trừ ra số mới. Không đoán nguyên nhân ngoài dữ liệu. Dữ liệu thiếu thì nói rõ.
Nhắc tới nhân viên thì viết đúng dạng [[nv:MÃ]], không viết tên. Không dùng chữ 'chốt', 'doanh thu' cho Vận đơn.`;
export type ReviewRecord = { status: 'batch' | 'done' | 'error' | 'off'; data: ReviewData; at: string; attempts?: number; checkedAt?: string; batchId?: string; text?: string; error?: string; usage?: ClaudeUsage; usd?: number };
type Client = Pick<Anthropic, 'messages'>;
type Options = { mode?: 'live' | 'demo' | 'off'; client?: Client | null };
const keyOf = (kind: 'review' | 'week', date: string) => `ai_${kind}:${date}`;
const customId = (kind: 'review' | 'week', date: string) => `${kind}-${date}`;
export class ReviewError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
const polls = new WeakMap<D1Database, Map<string, number>>();
export async function readReview(db: D1Database, kind: 'review' | 'week', date: string): Promise<ReviewRecord | null> {
  const row = await db.prepare('SELECT value FROM app_settings WHERE key=?').bind(keyOf(kind, date)).first<{ value: string }>();
  return row ? JSON.parse(row.value) as ReviewRecord : null;
}
async function save(db: D1Database, record: ReviewRecord) {
  await db.prepare('INSERT INTO app_settings(key,value,updated_at) VALUES (?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at').bind(keyOf(record.data.kind, record.data.date), JSON.stringify(record), record.checkedAt ?? record.at).run();
  return record;
}
const params = (data: ReviewData) => ({ model: CLAUDE_MODEL, max_tokens: 16000, system: REVIEW_SYSTEM, messages: [{ role: 'user' as const, content: JSON.stringify(data) }], output_config: { effort: 'medium' as const } });
async function finish(db: D1Database, r: ReviewRecord, message: Anthropic.Message, batch: boolean) {
  const usage = usageOf(message.usage);
  // Usage vẫn phát sinh khi bị từ chối hoặc câu trả lời bị cắt.
  await addSpend(db, usage, { batch });
  r.usage = usage; r.usd = Number(costUsd(usage, { batch }).toFixed(6));
  if (message.stop_reason === 'refusal') { r.status = 'error'; r.error = 'Claude từ chối trả lời câu này'; }
  else if (message.stop_reason !== 'end_turn') { r.status = 'error'; r.error = 'Claude chưa trả lời đầy đủ'; }
  else { r.status = 'done'; r.text = message.content.filter(b => b.type === 'text').map(b => b.text).join('\n'); }
  return save(db, r);
}
export async function createReview(db: D1Database, kind: 'review' | 'week', date: string, now = new Date(), direct = false, options: Options = {}) {
  const existing = await readReview(db, kind, date);
  if (direct) {
    if (existing?.status === 'batch') throw new ReviewError(409, 'Đang chờ bản phân tích đêm');
    if (!(await budgetLeft(db, 'ask')).ok) throw new ReviewError(429, 'Đã chạm trần chi phí tháng này');
    if (!(await takeReviewSlot(db, todayVn())).ok) throw new ReviewError(429, 'Hôm nay đã phân tích lại đủ 3 lần');
  }
  const data = kind === 'review' ? await buildDayReview(db, date) : await buildWeekReview(db, date);
  const r: ReviewRecord = { status: 'off', data, at: now.toISOString(), attempts: direct ? 1 : (existing?.attempts ?? (existing ? 1 : 0)) + 1 };
  try {
    const mode = options.mode ?? claudeMode();
    if (mode === 'demo') { r.status = 'done'; r.text = fakeAnswer(kind, JSON.stringify(data)); r.usage = usageOf(); r.usd = 0; }
    else if (mode === 'off') r.error = 'Chưa gắn khoá Claude';
    else if (!(await budgetLeft(db, direct ? 'ask' : 'review')).ok) { r.status = 'error'; r.error = 'Đã chạm trần chi phí tháng này'; }
    else {
      const client = options.client ?? claudeClient();
      if (!client) throw new Error('off');
      if (direct) return await finish(db, r, await client.messages.create(params(data)), false);
      const batch = await client.messages.batches.create({ requests: [{ custom_id: customId(kind, date), params: params(data) }] });
      r.status = 'batch'; r.batchId = batch.id; r.checkedAt = now.toISOString();
    }
  } catch (error) { logReviewError(error); r.status = 'error'; r.error = 'Không thể phân tích bằng Claude'; }
  return save(db, r);
}
export async function pollReview(db: D1Database, r: ReviewRecord, now: Date, client: Client) {
  let checked = polls.get(db);
  if (!checked) { checked = new Map(); polls.set(db, checked); }
  const id = r.batchId!;
  if (r.status !== 'batch' || now.getTime() - (checked.get(id) ?? Date.parse(r.checkedAt ?? r.at)) < 300_000) return r;
  checked.set(id, now.getTime());
  try {
    if (now.getTime() - Date.parse(r.at) > 26 * 3600_000) { r.status = 'error'; r.error = 'Batch quá 26 giờ chưa xong'; }
    else {
      const batch = await client.messages.batches.retrieve(r.batchId!);
      if (batch.processing_status === 'ended') {
        for await (const result of await client.messages.batches.results(r.batchId!)) {
          if (result.custom_id !== customId(r.data.kind, r.data.date)) continue;
          if (result.result.type === 'succeeded') return await finish(db, r, result.result.message, true);
          r.status = 'error'; r.error = 'Batch không hoàn tất'; break;
        }
        if (r.status === 'batch') { r.status = 'error'; r.error = 'Batch thiếu kết quả tương ứng'; }
      }
    }
  } catch { r.status = 'error'; r.error = 'Không thể đọc kết quả Batch'; }
  return r.status === 'batch' ? r : save(db, r);
}
export async function maybeReviewTick(now = new Date(), options: Options = {}) {
  if (now.getUTCMinutes() % 5) return;
  const local = new Date(now.getTime() + 7 * 3600_000), today = local.toISOString().slice(0, 10), minute = local.getUTCHours() * 60 + local.getUTCMinutes();
  const db = env.DB;
  try {
    // Quét các bản chờ của cả ngày trước để không bỏ rơi Batch qua nửa đêm.
    const pending = await db.prepare("SELECT value FROM app_settings WHERE (key GLOB 'ai_review:*' OR key GLOB 'ai_week:*') AND json_extract(value,'$.status')='batch'").all<{ value: string }>();
    for (const row of pending.results) {
      const r = JSON.parse(row.value) as ReviewRecord;
      if (now.getTime() - Date.parse(r.checkedAt ?? r.at) >= 300_000) {
        const client = options.client ?? ((options.mode ?? claudeMode()) === 'live' ? claudeClient() : null);
        if (client) await pollReview(db, r, now, client);
        else if (now.getTime() - Date.parse(r.at) > 26 * 3600_000) { r.status = 'error'; r.error = 'Batch quá 26 giờ chưa xong'; await save(db, r); }
      }
    }
    for (const kind of ['review', 'week'] as const) {
      const date = addDays(today, kind === 'review' ? -1 : -7);
      if (minute < (kind === 'review' ? 20 : 40) || kind === 'week' && local.getUTCDay() !== 1) continue;
      const old = await readReview(db, kind, date);
      if (!old || old.status === 'error' && minute < 60 && (old.attempts ?? 1) < 2) {
        await createReview(db, kind, date, now, false, options);
      }
    }
  } catch (error) { logReviewError(error); }
}
export function withNames(text: string, names: Record<string, string>) {
  return text.replace(/\[\[nv:([^\]]*)\]\]/g, (_, id: string) => Object.hasOwn(names, id) ? names[id] : 'nhân viên không rõ');
}
export async function reviewForDisplay(db: D1Database, r: ReviewRecord | null) {
  if (!r?.text) return r;
  const names: Record<string, string> = Object.create(null) as Record<string, string>;
  const ids = r.data.people.map(p => p.id).filter(Boolean);
  for (let i = 0; i < ids.length; i += 80) {
    const chunk = ids.slice(i, i + 80);
    const rows = await db.prepare(`SELECT pos_user_id,employee_name FROM hr_pos_team WHERE pos_user_id IN (${chunk.map(() => '?').join(',')})`).bind(...chunk).all<{ pos_user_id: string; employee_name: string | null }>();
    for (const p of rows.results) if (p.employee_name) names[p.pos_user_id] = p.employee_name;
  }
  return { ...r, text: withNames(r.text, names) };
}
export function validReviewDate(value: unknown, kind: 'review' | 'week') {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === value && value < todayVn() && (kind === 'review' || d.getUTCDay() === 1 && addDays(value, 6) < todayVn());
}

export function logReviewError(error: unknown) {
  const e = error as { name?: unknown; status?: unknown };
  console.error('review tick failed', typeof e?.name === 'string' ? e.name.replace(/[^A-Za-z]/g, '').slice(0, 50) : 'Error', typeof e?.status === 'number' ? e.status : '');
}
