// "Cách tính" lưu trên máy chủ để web, app iOS/Android và bot dùng chung (26/09/2026).
// Mỗi tài khoản một lựa chọn (metrics:user:<id>); chưa chọn thì theo mặc định công ty (metrics:default, chủ hệ thống đặt), rồi mới tới DEFAULT_METRICS.
import { env } from 'cloudflare:workers';
import { DEFAULT_METRICS, parseMetricSettings, type MetricSettings } from '@/lib/metrics';

const read = async (key: string) => {
  const row = await env.DB.prepare('SELECT value FROM app_settings WHERE key=?').bind(key).first<{ value: string }>();
  if (!row) return null;
  try { return parseMetricSettings(new URLSearchParams(JSON.parse(row.value) as Record<string, string>)); } catch { return null; }
};
const write = (key: string, m: MetricSettings) => env.DB.prepare('INSERT INTO app_settings (key,value,updated_at) VALUES (?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at')
  .bind(key, JSON.stringify(m), new Date().toISOString()).run();

export const companyMetrics = async () => (await read('metrics:default')) ?? DEFAULT_METRICS;
export async function userMetrics(userId: string) {
  const own = await read(`metrics:user:${userId}`);
  return { settings: own ?? await companyMetrics(), own: !!own };
}
export const saveUserMetrics = (userId: string, m: MetricSettings) => write(`metrics:user:${userId}`, m);
export const saveCompanyMetrics = (m: MetricSettings) => write('metrics:default', m);
export const clearUserMetrics = (userId: string) => env.DB.prepare('DELETE FROM app_settings WHERE key=?').bind(`metrics:user:${userId}`).run();
