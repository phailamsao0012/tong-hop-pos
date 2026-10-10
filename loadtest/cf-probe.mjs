// Đọc thông tin hạ tầng Cloudflare cho bài test tải (chỉ đọc, chỉ in số tổng / siêu dữ liệu, không in dữ liệu trong DB):
//   node loadtest/cf-probe.mjs plan              gói tài khoản, vị trí và dung lượng hai D1 (web thật, demo), máy chạy test vào trạm Cloudflare nào
//   node loadtest/cf-probe.mjs usage <từ ISO>    từ mốc đó tới giờ, chỉ của bản demo: số request, CPU mỗi request, D1 đọc/ghi bao nhiêu dòng, câu SQL tốn thời gian nhất
const TOKEN = process.env.CLOUDFLARE_API_TOKEN, ACC = process.env.CLOUDFLARE_ACCOUNT_ID;
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
  const q = `query($acc: String!, $db: String!, $since: Time!, $until: Time!) { viewer { accounts(filter: {accountTag: $acc}) {
    d1AnalyticsAdaptiveGroups(limit: 1, filter: {databaseId: $db, datetimeMinute_geq: $since, datetimeMinute_leq: $until}) { sum { readQueries writeQueries rowsRead rowsWritten queryBatchTimeMs } }
    d1QueriesAdaptiveGroups(limit: 12, orderBy: [sum_queryDurationMs_DESC], filter: {databaseId: $db, datetime_geq: $since, datetime_leq: $until}) { count sum { queryDurationMs rowsRead rowsWritten } avg { queryDurationMs } dimensions { query } }
    workersInvocationsAdaptive(limit: 1, filter: {scriptName: "tong-hop-pos-demo", datetime_geq: $since, datetime_leq: $until}) { sum { requests errors subrequests } quantiles { cpuTimeP50 cpuTimeP90 cpuTimeP99 cpuTimeP999 durationP50 durationP99 wallTimeP50 wallTimeP99 } }
  } } }`;
  const r = await gql(q, { acc: ACC, db: db.uuid ?? '', since, until });
  if (r.errors.length) print('Lỗi GraphQL', r.errors);
  const a = r.data?.viewer?.accounts?.[0] ?? {};
  print('D1 demo tổng', a.d1AnalyticsAdaptiveGroups?.[0]?.sum ?? null);
  print('Worker demo', a.workersInvocationsAdaptive?.[0] ?? null);
  console.log('SQL tốn thời gian nhất (tổng ms, số lần, ms trung bình, dòng đọc):');
  for (const x of a.d1QueriesAdaptiveGroups ?? []) console.log(`  ${Math.round(x.sum.queryDurationMs)} | ${x.count} | ${x.avg.queryDurationMs.toFixed(1)} | ${x.sum.rowsRead} | ${x.dimensions.query.replace(/\s+/g, ' ').slice(0, 220)}`);
}
