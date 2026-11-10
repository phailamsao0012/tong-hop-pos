import { packMetrics, type AiPack, validAiDate } from '@/lib/ai/ai-pack';
export type Insight = { date: string; model: string; summary: string; items: { dept: 'sale' | 'cskh' | 'mkt' | 'vandon' | 'company'; kind: 'hire' | 'improve' | 'budget' | 'risk'; title: string; detail: string; evidence: { metric: string; value: number; compare: number | null }[]; action: string; confidence: 'cao' | 'vừa' | 'thấp' }[]; hiring: { sale: { have: number; need: number; why: string }; cskh: { have: number; need: number; why: string } } };
const object = (x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x);
const text = (x: unknown) => typeof x === 'string' && x.trim().length > 0 && x.length <= 600 && !/[<>]|https?:\/\/|www\./i.test(x);
const number = (x: unknown) => typeof x === 'number' && Number.isFinite(x);
const keys = (x: Record<string, unknown>, allowed: string[]) => Object.keys(x).length === allowed.length && allowed.every((k) => Object.hasOwn(x, k));
export function validInsight(x: unknown): x is Insight {
  if (!object(x) || !keys(x, ['date','model','summary','items','hiring']) || typeof x.date !== 'string' || !validAiDate(x.date) || !text(x.model) || !text(x.summary) || !Array.isArray(x.items) || x.items.length > 30) return false;
  if (!x.items.every((i: unknown) => object(i) && keys(i, ['dept','kind','title','detail','evidence','action','confidence']) && ['sale','cskh','mkt','vandon','company'].includes(String(i.dept)) && ['hire','improve','budget','risk'].includes(String(i.kind)) && ['cao','vừa','thấp'].includes(String(i.confidence)) && text(i.title) && text(i.detail) && text(i.action) && Array.isArray(i.evidence) && i.evidence.length > 0 && i.evidence.length <= 30 && i.evidence.every((e: unknown) => object(e) && keys(e, ['metric','value','compare']) && text(e.metric) && number(e.value) && (e.compare === null || number(e.compare))))) return false;
  return object(x.hiring) && keys(x.hiring, ['sale','cskh']) && ['sale','cskh'].every((k) => { const h = x.hiring as Record<string, unknown>; const v = h[k]; return object(v) && keys(v, ['have','need','why']) && number(v.have) && Number.isInteger(v.have) && Number(v.have) >= 0 && number(v.need) && Number.isInteger(v.need) && Number(v.need) >= 0 && text(v.why); });
}
export function checkEvidence(insight: Insight, pack: AiPack) {
  const metrics = packMetrics(pack);
  return insight.items.map((i) => ({ ...i, verified: insight.date === pack.date && i.evidence.every((e) => Object.hasOwn(metrics, e.metric) && metrics[e.metric] === e.value && (e.compare === null || Object.values(metrics).includes(e.compare))) }));
}
export async function saveInsight(db: D1Database, insight: Insight, pack: AiPack) {
  const result = { ...insight, items: checkEvidence(insight, pack) };
  await db.batch([
    db.prepare("INSERT INTO app_settings(key,value,updated_at) VALUES (?,?,datetime('now')) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at").bind(`ai_insight:${insight.date}`, JSON.stringify(result)),
    db.prepare("DELETE FROM app_settings WHERE key GLOB 'ai_insight:*' AND substr(key,12) < date(?, '-29 days')").bind(insight.date),
  ]);
  return result;
}

/** Chỉ bổ sung tên ở phản hồi cho chủ hệ thống, không ghi vào gói gửi PC. */
export function evidenceText(e: Insight['items'][number]['evidence'][number], pack: AiPack | null, date: string, names: Record<string, string> = {}, teamNames: Record<string, string> = {}) {
  const day = (value: string) => `${value.slice(8, 10)}/${value.slice(5, 7)}`;
  const match = /^rows\.(\d+)\.metrics\.(\w+)$/.exec(e.metric);
  const row = match && pack?.date === date ? pack.rows[Number(match[1])] : undefined;
  const labels: Record<string, string> = { assigned: 'Số được chia', assignedClosed: 'Số đã chốt trong số được chia', closed: 'Đơn chốt', net: 'Doanh thu', returned: 'Đơn hoàn', closeRate: 'Tỷ lệ chốt', aov: 'AOV' };
  const key = match?.[2] ?? '';
  if (!row || !Object.hasOwn(row.metrics, key) || !labels[key]) return `số trong gói ngày ${day(date)}`;
  const format = (value: number) => key === 'closeRate'
    ? new Intl.NumberFormat('vi-VN', { style: 'percent', maximumFractionDigits: 1 }).format(value)
    : new Intl.NumberFormat('vi-VN', key === 'net' || key === 'aov' ? { style: 'currency', currency: 'VND', maximumFractionDigits: 0 } : { maximumFractionDigits: 2 }).format(value);
  return `${day(row.day)} · ${names[row.staff] || teamNames[row.team] || 'Nhân viên chưa có tên'} · ${labels[key]} ${format(e.value)}${e.compare === null ? '' : `; so với ${format(e.compare)}`}`;
}
export async function insightForDisplay(db: D1Database, insight: Insight, pack: AiPack | null, names: Record<string, string> = {}) {
  const ids = [...new Set(pack?.rows.map(r => r.staff).filter(Boolean) ?? [])];
  const teamNames: Record<string, string> = {};
  // Chia nhỏ để không vượt giới hạn số tham số của D1.
  for (let i = 0; i < ids.length; i += 80) {
    const chunk = ids.slice(i, i + 80);
    const result = await db.prepare(`SELECT pos_user_id, employee_name FROM hr_pos_team WHERE pos_user_id IN (${chunk.map(() => '?').join(',')})`).bind(...chunk).all<{ pos_user_id: string; employee_name: string | null }>();
    for (const r of result.results) if (r.employee_name) names[r.pos_user_id] = r.employee_name;
  }
  const teams = [...new Set(pack?.rows.map(r => r.team).filter(Boolean) ?? [])];
  for (let i = 0; i < teams.length; i += 80) {
    const chunk = teams.slice(i, i + 80);
    const result = await db.prepare(`SELECT id, name FROM hr_departments WHERE id IN (${chunk.map(() => '?').join(',')})`).bind(...chunk).all<{ id: string; name: string }>();
    for (const r of result.results) teamNames[r.id] = r.name;
  }
  return { ...insight, items: (pack ? checkEvidence(insight, pack) : insight.items.map(i => ({ ...i, verified: false }))).map(i => ({ ...i, evidence: i.evidence.map(e => ({ ...e, text: evidenceText(e, pack, insight.date, names, teamNames) })) })) };
}
export type DisplayInsight = Awaited<ReturnType<typeof insightForDisplay>>;
