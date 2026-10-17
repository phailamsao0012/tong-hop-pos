import { packMetrics, type AiPack, validAiDate } from './ai-pack';
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
