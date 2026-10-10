// Đọc thông tin hạ tầng Cloudflare cho bài test tải (chỉ đọc, chỉ in số tổng / siêu dữ liệu, không in dữ liệu trong DB):
//   node loadtest/cf-probe.mjs plan              gói tài khoản, vị trí và dung lượng hai D1 (web thật, demo), máy chạy test vào trạm Cloudflare nào
//   node loadtest/cf-probe.mjs prod [từ ISO]     (mặc định) 7 ngày qua của web thật, chỉ số đo hiệu năng Cloudflare (anh Vũ đồng ý 10/10/2026; không đọc dữ liệu
//                                                trong DB): giờ đông nhất bao nhiêu lượt, D1 bận bao lâu, câu SQL nào tốn thời gian nhất, mỗi lần bao lâu
//   node loadtest/cf-probe.mjs usage <từ ISO>    từ mốc đó tới giờ, chỉ của bản demo: số request, CPU mỗi request, D1 đọc/ghi bao nhiêu dòng, câu SQL tốn thời gian nhất
const TOKEN = process.env.CLOUDFLARE_API_TOKEN;
let ACC = process.env.CLOUDFLARE_ACCOUNT_ID;
const api = async (path) => {
  const r = await fetch(`https://api.cloudflare.com/client/v4${path}`, { headers: { authorization: `Bearer ${TOKEN}` } });
  const j = await r.json().catch(() => ({}));
  return { status: r.status, ok: r.ok && j.success !== false, result: j.result, errors: (j.errors ?? []).map((e) => `${e.code} ${e.message}`) };
};
const gql = async (query, variables) => {
  const r = await fetch('https://api.cloudflare.com/client/v4/graphql', { method: 'POST', headers: { authorization: `Bearer ${TOKEN}`, 'content-type': 'application/json' }, body: JSON.stringify({ query, variables }) });
  const j = await r.json().catch(() => ({}));
  return { status: r.status, data: j.data, errors: (j.errors ?? []).map((e) => e.message) };
};
// Repo không đặt CLOUDFLARE_ACCOUNT_ID (wrangler tự lấy tài khoản duy nhất của khoá): làm như wrangler.
if (!ACC) { const r = await fetch('https://api.cloudflare.com/client/v4/accounts', { headers: { authorization: `Bearer ${TOKEN}` } }).then((x) => x.json()).catch(() => ({})); ACC = r.result?.[0]?.id ?? ''; console.log(`Số tài khoản khoá thấy: ${r.result?.length ?? 0}`); }
const print = (label, v) => console.log(`${label}: ${JSON.stringify(v)}`);
const mode = process.argv[2];

async function d1(name) {
  const list = await api(`/accounts/${ACC}/d1/database?name=${name}`);
  const db = (list.result ?? []).find((d) => d.name === name);
  if (!db) return { name, status: list.status, errors: list.errors };
  const one = await api(`/accounts/${ACC}/d1/database/${db.uuid}`);
  const r = one.result ?? {};
  return { name, sizeMB: r.file_size ? +(r.file_size / 1e6).toFixed(1) : null, tables: r.num_tables, region: r.running_in_region ?? null, created: r.created_at, readReplication: r.read_replication?.mode ?? null, uuid: db.uuid };
}

if (mode === 'plan') {
  const subs = await api(`/accounts/${ACC}/subscriptions`);
  print('Gói (subscriptions)', subs.ok ? (subs.result ?? []).map((s) => ({ product: s.product?.name ?? s.component_values?.map?.((c) => c.name)?.join(','), plan: s.rate_plan?.public_name ?? s.rate_plan?.id, state: s.state })) : { status: subs.status, errors: subs.errors });
  const ws = await api(`/accounts/${ACC}/workers/account-settings`);
  print('Workers account-settings', ws.ok ? ws.result : { status: ws.status, errors: ws.errors });
  for (const n of ['tong-hop-pos', 'tong-hop-pos-demo']) { const x = await d1(n); delete x.uuid; print(`D1 ${n}`, x); }
  const trace = await (await fetch('https://demo.tonghopposmegatech.io.vn/cdn-cgi/trace')).text();
  print('Máy test vào trạm Cloudflare', Object.fromEntries(trace.trim().split('\n').map((l) => l.split('=')).filter(([k]) => ['colo', 'loc', 'http'].includes(k))));
} else if (mode === 'usage') {
  const since = process.argv[3], until = new Date().toISOString();
  const db = await d1('tong-hop-pos-demo');
  // Ba câu riêng: một câu lỗi (tên trường đổi) không làm mất hai câu kia.
  const vars = { acc: ACC, db: db.uuid ?? '', since, until };
  const head = 'query($acc: String!, $db: String!, $since: Time!, $until: Time!) { viewer { accounts(filter: {accountTag: $acc}) {';
  const one = async (label, body) => { const r = await gql(`${head} ${body} } } }`, vars); if (r.errors.length) print(`Lỗi GraphQL (${label})`, r.errors); return r.data?.viewer?.accounts?.[0] ?? {}; };
  const t = await one('D1 tổng', 'd1AnalyticsAdaptiveGroups(limit: 1, filter: {databaseId: $db, datetimeMinute_geq: $since, datetimeMinute_leq: $until}) { count sum { readQueries writeQueries rowsRead rowsWritten } avg { queryBatchTimeMs } quantiles { queryBatchTimeMsP50 queryBatchTimeMsP90 } }');
  print('D1 demo tổng', t.d1AnalyticsAdaptiveGroups?.[0] ?? null);
  const w = await one('Worker', 'workersInvocationsAdaptive(limit: 10, filter: {scriptName: "tong-hop-pos-demo", datetime_geq: $since, datetime_leq: $until}) { sum { requests errors subrequests } quantiles { cpuTimeP50 cpuTimeP90 cpuTimeP99 wallTimeP50 wallTimeP99 } dimensions { status } }');
  print('Worker demo theo trạng thái', w.workersInvocationsAdaptive ?? null);
  const a = await one('SQL', 'd1QueriesAdaptiveGroups(limit: 20, orderBy: [sum_queryDurationMs_DESC], filter: {databaseId: $db, datetime_geq: $since, datetime_leq: $until}) { count sum { queryDurationMs rowsRead rowsWritten } avg { queryDurationMs } dimensions { query } }');
  console.log('SQL tốn thời gian nhất (tổng ms, số lần, ms trung bình, dòng đọc):');
  for (const x of a.d1QueriesAdaptiveGroups ?? []) console.log(`  ${Math.round(x.sum.queryDurationMs)} | ${x.count} | ${x.avg.queryDurationMs.toFixed(1)} | ${x.sum.rowsRead} | ${x.dimensions.query.replace(/\s+/g, ' ').slice(0, 220)}`);
}

if (mode === 'prod') {
  const db = await d1('tong-hop-pos');
  // Mốc "từ" (vd. sau lần đổi code báo cáo) phải nằm trong 7 ngày qua, theo đúng phạm vi anh Vũ đồng ý.
  const floor = Date.now() - 7 * 86400000, asked = Date.parse(process.argv[3] ?? '');
  const since = new Date(Number.isFinite(asked) && asked > floor ? asked : floor).toISOString(), until = new Date().toISOString();
  const vars = { acc: ACC, db: db.uuid ?? '', since, until };
  console.log(`Khoảng đo: ${since} → ${until}`);
  const head = 'query($acc: String!, $db: String!, $since: Time!, $until: Time!) { viewer { accounts(filter: {accountTag: $acc}) {';
  const one = async (label, body) => { const r = await gql(`${head} ${body} } } }`, vars); if (r.errors.length) print(`Lỗi GraphQL (${label})`, r.errors); return r.data?.viewer?.accounts?.[0] ?? {}; };
  const hours = (await one('D1 theo giờ', 'd1AnalyticsAdaptiveGroups(limit: 200, orderBy: [count_DESC], filter: {databaseId: $db, datetimeHour_geq: $since, datetimeHour_leq: $until}) { count sum { readQueries writeQueries rowsRead rowsWritten } avg { queryBatchTimeMs } quantiles { queryBatchTimeMsP90 } dimensions { datetimeHour } }')).d1AnalyticsAdaptiveGroups ?? [];
  const busy = hours.map((x) => ({ h: x.dimensions.datetimeHour, n: x.count, q: x.sum.readQueries + x.sum.writeQueries, rows: x.sum.rowsRead, w: x.sum.rowsWritten, ms: x.count * (x.avg?.queryBatchTimeMs ?? 0), p90: x.quantiles?.queryBatchTimeMsP90 })).sort((a, b) => b.ms - a.ms);
  const tot = busy.reduce((t, x) => ({ n: t.n + x.n, rows: t.rows + x.rows, w: t.w + x.w, ms: t.ms + x.ms }), { n: 0, rows: 0, w: 0, ms: 0 });
  print('D1 web thật trong khoảng đo (lượt gọi, dòng đọc, dòng ghi, giây D1 bận)', { batches: tot.n, rowsRead: tot.rows, rowsWritten: tot.w, busySeconds: Math.round(tot.ms / 1000) });
  console.log('D1 web thật: 10 giờ bận nhất (giờ UTC | lượt gọi | giây D1 bận | % của giờ | p90 ms mỗi lượt):');
  for (const x of busy.slice(0, 10)) console.log(`  ${x.h} | ${x.n} | ${Math.round(x.ms / 1000)} | ${(x.ms / 36000).toFixed(1)}% | ${x.p90 ?? '-'}`);
  const w = (await one('Worker theo giờ', 'workersInvocationsAdaptive(limit: 200, orderBy: [sum_requests_DESC], filter: {scriptName: "tong-hop-pos", datetime_geq: $since, datetime_leq: $until}) { sum { requests errors } quantiles { cpuTimeP50 cpuTimeP99 wallTimeP50 wallTimeP99 } dimensions { datetimeHour } }')).workersInvocationsAdaptive ?? [];
  console.log('Worker web thật: 10 giờ đông nhất (giờ UTC | lượt | lỗi | CPU p50/p99 ms | thời gian p50/p99 ms):');
  const wTot = w.reduce((t, x) => t + x.sum.requests, 0);
  console.log(`Worker web thật tổng lượt trong khoảng đo: ${wTot}; trung bình D1 bận mỗi lượt: ${(tot.ms / Math.max(1, wTot)).toFixed(0)} ms`);
  for (const x of w.slice(0, 10)) console.log(`  ${x.dimensions.datetimeHour} | ${x.sum.requests} | ${x.sum.errors} | ${(x.quantiles.cpuTimeP50 / 1000).toFixed(1)}/${(x.quantiles.cpuTimeP99 / 1000).toFixed(1)} | ${Math.round(x.quantiles.wallTimeP50 / 1000)}/${Math.round(x.quantiles.wallTimeP99 / 1000)}`);
  const a = await one('SQL', 'd1QueriesAdaptiveGroups(limit: 20, orderBy: [sum_queryDurationMs_DESC], filter: {databaseId: $db, datetime_geq: $since, datetime_leq: $until}) { count sum { queryDurationMs rowsRead rowsWritten } avg { queryDurationMs } dimensions { query } }');
  console.log('SQL web thật tốn thời gian nhất trong khoảng đo (tổng giây | số lần | ms trung bình | dòng đọc mỗi lần | câu):');
  for (const x of a.d1QueriesAdaptiveGroups ?? []) console.log(`  ${Math.round(x.sum.queryDurationMs / 1000)} | ${x.count} | ${x.avg.queryDurationMs.toFixed(1)} | ${Math.round(x.sum.rowsRead / Math.max(1, x.count))} | ${x.dimensions.query.replace(/\s+/g, ' ').slice(0, 320)}`);
}
