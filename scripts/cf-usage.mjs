// Canh chi phí Cloudflare (anh Vũ 22/10/2026): mỗi giờ đọc số đo cả tài khoản (D1 đọc/ghi/dung lượng, Worker) từ GraphQL của Cloudflare,
// dự tính cả kỳ, ghi vào app_settings `cf_usage` của D1 web thật. Canh gác trong Worker (lib/watch.ts) đọc khoá này và nhắn Telegram.
// Repo công khai: log không in số đo, số tiền hay mã tài khoản.
import { cfEstimate } from '../lib/cf-cost.ts';

const TOKEN = process.env.CLOUDFLARE_API_TOKEN;
const api = async (path, init) => (await fetch(`https://api.cloudflare.com/client/v4${path}`, { ...init, headers: { authorization: `Bearer ${TOKEN}`, 'content-type': 'application/json' } })).json();
const gql = async (query, variables) => {
  const j = await (await fetch('https://api.cloudflare.com/client/v4/graphql', { method: 'POST', headers: { authorization: `Bearer ${TOKEN}`, 'content-type': 'application/json' }, body: JSON.stringify({ query, variables }) })).json();
  if (j.errors?.length) throw new Error(`GraphQL lỗi (${j.errors.length})`);
  return j.data.viewer.accounts[0];
};
const ACC = process.env.CLOUDFLARE_ACCOUNT_ID || (await api('/accounts')).result?.[0]?.id;
if (!ACC) throw new Error('Không thấy tài khoản Cloudflare');

// Kỳ tính tiền: ngày 17 tới ngày 16 tháng sau (thư báo của Cloudflare 22/10/2026).
const now = new Date(), DAY = 86400000;
const startD = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (now.getUTCDate() < 17 ? 1 : 0), 17));
const endD = new Date(Date.UTC(startD.getUTCFullYear(), startD.getUTCMonth() + 1, 16));
const iso = (d) => d.toISOString().slice(0, 10);
const daysTotal = Math.round((endD - startD) / DAY) + 1, elapsed = Math.max(0.5, (now - startD) / DAY);
const vars = { acc: ACC, since: startD.toISOString(), until: now.toISOString(), d1: iso(new Date(now - 2 * DAY)) };
const head = 'query($acc: String!, $since: Time!, $until: Time!, $d1: Date!) { viewer { accounts(filter: {accountTag: $acc}) {';
const a = await gql(`${head}
  d1: d1AnalyticsAdaptiveGroups(limit: 1, filter: {datetimeHour_geq: $since, datetimeHour_leq: $until}) { sum { rowsRead rowsWritten } }
  st: d1StorageAdaptiveGroups(limit: 1000, orderBy: [date_DESC], filter: {date_geq: $d1}) { max { databaseSizeBytes } dimensions { date databaseId } }
  w: workersInvocationsAdaptive(limit: 1, filter: {datetime_geq: $since, datetime_leq: $until}) { sum { requests cpuTimeUs } }
} } }`, vars);
const latest = new Map();
for (const s of a.st ?? []) if (!latest.has(s.dimensions.databaseId)) latest.set(s.dimensions.databaseId, s.max.databaseSizeBytes);
const reads = Number(a.d1?.[0]?.sum.rowsRead ?? 0), writes = Number(a.d1?.[0]?.sum.rowsWritten ?? 0);
const requests = Number(a.w?.[0]?.sum.requests ?? 0), cpuMs = Math.round(Number(a.w?.[0]?.sum.cpuTimeUs ?? 0) / 1000);
const proj = (n) => Math.round(n / elapsed * daysTotal);
const u = { at: now.toISOString(), start: iso(startD), end: iso(endD), daysElapsed: Math.ceil(elapsed), daysTotal, reads, writes,
  storageBytes: [...latest.values()].reduce((t, b) => t + Number(b), 0), requests, cpuMs,
  projReads: proj(reads), projWrites: proj(writes), projRequests: proj(requests), projCpuMs: proj(cpuMs) };
u.estUsd = Math.round(cfEstimate(u) * 100) / 100;

const db = (await api(`/accounts/${ACC}/d1/database?name=tong-hop-pos`)).result?.find((d) => d.name === 'tong-hop-pos');
if (!db) throw new Error('Không thấy D1 web thật');
const r = await api(`/accounts/${ACC}/d1/database/${db.uuid}/query`, { method: 'POST', body: JSON.stringify({
  sql: 'INSERT INTO app_settings (key,value,updated_at) VALUES (?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at',
  params: ['cf_usage', JSON.stringify(u), u.at] }) });
if (!r.success) throw new Error('Ghi cf_usage lỗi');
console.log('Đã ghi mức dùng Cloudflare (số đo không in ra log vì repo công khai).');
