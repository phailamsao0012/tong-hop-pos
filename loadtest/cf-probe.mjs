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
// Workflow luôn gọi "plan"; plan.json {"run":"count"} đổi sang chế độ đếm (không phải sửa workflow).
const planRun = await import('node:fs').then((fs) => JSON.parse(fs.readFileSync(new URL('./plan.json', import.meta.url), 'utf8')).run).catch(() => null);
const mode = process.argv[2] === 'plan' && (planRun === 'count' || planRun === 'bill' || planRun === 'demo2off' || planRun === 'cskhhn') ? planRun : process.argv[2];

async function d1(name) {
  const list = await api(`/accounts/${ACC}/d1/database?name=${name}`);
  const db = (list.result ?? []).find((d) => d.name === name);
  if (!db) return { name, status: list.status, errors: list.errors };
  const one = await api(`/accounts/${ACC}/d1/database/${db.uuid}`);
  const r = one.result ?? {};
  return { name, sizeMB: r.file_size ? +(r.file_size / 1e6).toFixed(1) : null, tables: r.num_tables, region: r.running_in_region ?? null, created: r.created_at, readReplication: r.read_replication?.mode ?? null, uuid: db.uuid };
}

if (mode === 'cskhhn') {
  // Chia 4 team CSKH Hà Nội trên web thật (anh Vũ 23/10/2026: "ok ghi 4 team CSKH Hà Nội lên web thật"), như bấm Lưu ở Cài đặt > Chia team.
  // Repo công khai: loadtest/cskh-hn.json chỉ có mã băm (scrypt, có muối) của tên, không có tên; log chỉ in số đếm.
  // Ghi bản cũ vào web_teams_backup_v1 trước (như trang Chia team). Chỉ ghi khi mọi người đều khớp đúng một người.
  const { scryptSync, randomUUID } = await import('node:crypto');
  const spec = JSON.parse((await import('node:fs')).readFileSync(new URL('./cskh-hn.json', import.meta.url), 'utf8'));
  const db = await d1('tong-hop-pos');
  const q = async (sql, params = []) => { const j = await fetch(`https://api.cloudflare.com/client/v4/accounts/${ACC}/d1/database/${db.uuid}/query`, { method: 'POST', headers: { authorization: `Bearer ${TOKEN}`, 'content-type': 'application/json' }, body: JSON.stringify({ sql, params }) }).then((x) => x.json()); if (!j.success) throw new Error(`D1 lỗi: ${(j.errors ?? []).map((e) => e.code).join(',')}`); return j.result?.[0]?.results ?? []; };
  const clean = (v) => v.replace(/\([^)]*\)/gu, ' ').replace(/\s+/gu, ' ').trim();
  const nameKey = (n) => clean(n.normalize('NFC').toLocaleLowerCase('vi')).replace(/[-_.,]/gu, ' ').split(' ').filter((w) => w && !/^(sale|sales|cskh|mkt|marketing|tp|part|time|pt|\d+)$/u.test(w)).join(' ');
  const hash = (k) => scryptSync(k, spec.salt, 12, { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }).toString('hex');
  const set = new Map((await q("SELECT key,value FROM app_settings WHERE key IN ('web_teams_v1','marketing_teams_v1','team_source')")).map((r) => [r.key, r.value]));
  if (set.get('team_source') === 'hr') { console.log('Nguồn team đang là web nhân sự: không ghi.'); process.exit(0); }
  const before = JSON.parse(set.get('web_teams_v1') ?? '[]');
  const people = await q("SELECT user_id AS id,MAX(name) AS name,MAX(COALESCE(department,'')) AS dept FROM pos_users WHERE user_id<>'' AND name<>'' GROUP BY user_id");
  // Khớp đúng tên; không có thì khớp bỏ dấu (Pancake viết "Thuỷ"/"Thủy", "Hoà"/"Hòa"). Vẫn không có thì chỉ in số người CSKH trùng tên cuối.
  const fold = (k) => k.normalize('NFD').replace(/[̀-ͯ]/gu, '').replace(/đ/gu, 'd').normalize('NFC');
  const memo = new Map(), hk = (k) => { if (!memo.has(k)) memo.set(k, hash(k)); return memo.get(k); };
  const idx = { x: new Map(), f: new Map(), l: new Map() };
  const add = (m, h, p) => m.set(h, [...(m.get(h) ?? []), p]);
  for (const p of people) { const k = nameKey(p.name); if (!k) continue; add(idx.x, hk(k), p); add(idx.f, hk(fold(k)), p); add(idx.l, hk(fold(k).split(' ').slice(-1)[0]), p); }
  const isCskh = (p) => /cskh|chăm sóc/iu.test(`${p.name} ${p.dept}`);
  let bad = 0;
  const prefer = (all) => { const c = all.filter(isCskh); return c.length ? c : all; };
  const pick = (h, where) => {
    let list = prefer(idx.x.get(h.x) ?? []);
    if (!list.length) list = prefer(idx.f.get(h.f) ?? []);
    if (new Set(list.map((p) => nameKey(p.name))).size !== 1) { bad++; print(`${where}: ${list.length ? 'khớp nhiều tên' : 'không khớp'}, số người CSKH cùng tên cuối`, (idx.l.get(h.l) ?? []).filter(isCskh).length); }
    return list;
  };
  const teams = spec.teams.map((t, i) => {
    const mentor = pick(t.mentor, `Team ${i + 1} mentor`), members = t.members.map((m, j) => pick(m, `Team ${i + 1} người ${j + 1}`));
    print(`Team ${i + 1}: người khớp / cần`, `${[mentor, ...members].filter((x) => x.length).length}/${1 + members.length}`);
    const label = (mentor[0]?.name ?? '').replace(/\s*-?\s*(SALE|CSKH|MKT)\s*$/iu, '').trim();
    return { id: `wt_${randomUUID()}`, name: `CSKH HN Team ${i + 1} · C ${label}`, dept: 'cskh', office: 'Hà Nội', memberIds: [...new Set([mentor, ...members].flat().map((p) => p.id))] };
  });
  if (bad) { print('Số tên không khớp hoặc khớp nhiều người, không ghi', bad); process.exit(1); }
  const moved = new Set(teams.flatMap((t) => t.memberIds));
  let out = 0;
  const kept = before.filter((t) => !/^CSKH HN Team \d+ · /u.test(t.name)).map((t) => { if (t.dept !== 'cskh') return t; const ids = t.memberIds.filter((id) => !moved.has(id)); out += t.memberIds.length - ids.length; return { ...t, memberIds: ids }; });
  const dropped = kept.filter((t) => t.dept === 'cskh' && !t.memberIds.length).length;
  const after = [...kept.filter((t) => t.dept !== 'cskh' || t.memberIds.length), ...teams];
  if (after.length > 60) { console.log('Quá 60 team: không ghi.'); process.exit(1); }
  const now = new Date().toISOString();
  const put = 'INSERT INTO app_settings (key,value,updated_at) VALUES (?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at';
  await q(put, ['web_teams_backup_v1', JSON.stringify({ savedAt: now, teams: set.get('web_teams_v1') ?? null, mkt: set.get('marketing_teams_v1') ?? null, source: set.get('team_source') ?? null }), now]);
  await q(put, ['web_teams_v1', JSON.stringify(after), now]);
  if (set.get('team_source') !== 'pancake') await q(put, ['team_source', 'pancake', now]);
  print('Team Sale/CSKH trước → sau', `${before.length} → ${after.length}`);
  print('Tài khoản rút khỏi team CSKH cũ', out);
  print('Team CSKH cũ bỏ vì không còn ai', dropped);
  print('Đã ghi (bản cũ ở web_teams_backup_v1)', true);
} else if (mode === 'demo2off') {
  // Tắt đồng bộ demo2 (anh Vũ 22/10/2026 chọn "Làm cả hai": tắt đồng bộ demo2, giữ nguyên dữ liệu). Chỉ đổi cờ enabled của pos_shops trên D1 demo2;
  // bật lại: UPDATE pos_shops SET enabled=1 WHERE id IN (các mã in ra dưới đây).
  const db = await d1('tong-hop-pos-demo2');
  const q = async (sql) => (await fetch(`https://api.cloudflare.com/client/v4/accounts/${ACC}/d1/database/${db.uuid}/query`, { method: 'POST', headers: { authorization: `Bearer ${TOKEN}`, 'content-type': 'application/json' }, body: JSON.stringify({ sql }) }).then((x) => x.json())).result?.[0];
  print('Demo2: POS đang bật trước khi tắt', (await q('SELECT id FROM pos_shops WHERE enabled=1'))?.results?.map((r) => r.id));
  print('Demo2: số POS đã tắt', (await q('UPDATE pos_shops SET enabled=0 WHERE enabled=1'))?.meta?.changes);
  print('Demo2: POS còn bật', (await q('SELECT COUNT(*) AS n FROM pos_shops WHERE enabled=1'))?.results?.[0]?.n);
} else if (mode === 'bill') {
  // Hoá đơn Cloudflare (anh Vũ 22/10/2026 hỏi "sao chi phí lên nhiều vậy"): mức dùng cả tài khoản từ đầu kỳ 17/10, theo ngày và theo từng
  // Worker / D1 / Durable Object / Workers AI. Chỉ số đo của Cloudflare (không đọc dữ liệu trong DB), không in tiền, không in mã tài khoản.
  const since = '2026-10-17T00:00:00Z', until = new Date().toISOString(), d0 = since.slice(0, 10);
  const names = Object.fromEntries(((await api(`/accounts/${ACC}/d1/database?per_page=100`)).result ?? []).map((d) => [d.uuid, d.name]));
  const vars = { acc: ACC, since, until, d0 };
  const head = 'query($acc: String!, $since: Time!, $until: Time!, $d0: Date!) { viewer { accounts(filter: {accountTag: $acc}) {';
  const one = async (label, body) => { const r = await gql(`${head} ${body} } } }`, vars); if (r.errors.length) print(`Lỗi GraphQL (${label})`, r.errors); return r.errors.length ? null : r.data?.viewer?.accounts?.[0] ?? {}; };
  const table = (label, rows, cols) => { console.log(`${label} (${cols.join(' | ')}):`); for (const r of rows) console.log(`  ${cols.map((c) => r[c] ?? '-').join(' | ')}`); };
  console.log(`Khoảng đo: ${since} → ${until}`);
  const d1q = await one('D1 theo ngày', 'd1AnalyticsAdaptiveGroups(limit: 5000, orderBy: [date_ASC], filter: {datetimeHour_geq: $since, datetimeHour_leq: $until}) { sum { readQueries writeQueries rowsRead rowsWritten } dimensions { date databaseId } }');
  table('D1 theo ngày', (d1q?.d1AnalyticsAdaptiveGroups ?? []).map((x) => ({ ngay: x.dimensions.date, db: names[x.dimensions.databaseId] ?? 'khác', rowsRead: x.sum.rowsRead, rowsWritten: x.sum.rowsWritten, readQ: x.sum.readQueries, writeQ: x.sum.writeQueries })), ['ngay', 'db', 'rowsRead', 'rowsWritten', 'readQ', 'writeQ']);
  const st = await one('D1 dung lượng', 'd1StorageAdaptiveGroups(limit: 5000, orderBy: [date_ASC], filter: {date_geq: $d0}) { max { databaseSizeBytes } dimensions { date databaseId } }');
  table('D1 dung lượng MB', (st?.d1StorageAdaptiveGroups ?? []).map((x) => ({ ngay: x.dimensions.date, db: names[x.dimensions.databaseId] ?? 'khác', mb: Math.round(x.max.databaseSizeBytes / 1e6) })), ['ngay', 'db', 'mb']);
  let wk = await one('Worker theo ngày', 'workersInvocationsAdaptive(limit: 5000, orderBy: [date_ASC], filter: {datetime_geq: $since, datetime_leq: $until}) { sum { requests errors subrequests cpuTimeUs } dimensions { date scriptName } }');
  if (!wk) wk = await one('Worker theo ngày (không CPU)', 'workersInvocationsAdaptive(limit: 5000, orderBy: [date_ASC], filter: {datetime_geq: $since, datetime_leq: $until}) { sum { requests errors subrequests } dimensions { date scriptName } }');
  table('Worker theo ngày', (wk?.workersInvocationsAdaptive ?? []).map((x) => ({ ngay: x.dimensions.date, worker: x.dimensions.scriptName, requests: x.sum.requests, errors: x.sum.errors, subreq: x.sum.subrequests, cpuMs: x.sum.cpuTimeUs === undefined ? '-' : Math.round(x.sum.cpuTimeUs / 1000) })), ['ngay', 'worker', 'requests', 'errors', 'subreq', 'cpuMs']);
  const doi = await one('DO lượt gọi', 'durableObjectsInvocationsAdaptiveGroups(limit: 5000, orderBy: [date_ASC], filter: {date_geq: $d0}) { sum { requests } dimensions { date scriptName } }');
  table('Durable Object lượt gọi', (doi?.durableObjectsInvocationsAdaptiveGroups ?? []).map((x) => ({ ngay: x.dimensions.date, worker: x.dimensions.scriptName, requests: x.sum.requests })), ['ngay', 'worker', 'requests']);
  const dop = await one('DO thời gian chạy', 'durableObjectsPeriodicGroups(limit: 5000, orderBy: [date_ASC], filter: {date_geq: $d0}) { sum { activeTime cpuTime storageReadUnits storageWriteUnits } dimensions { date } }');
  table('Durable Object chạy', (dop?.durableObjectsPeriodicGroups ?? []).map((x) => ({ ngay: x.dimensions.date, activeS: Math.round(x.sum.activeTime / 1e6), cpuMs: Math.round(x.sum.cpuTime / 1000), readUnits: x.sum.storageReadUnits, writeUnits: x.sum.storageWriteUnits })), ['ngay', 'activeS', 'cpuMs', 'readUnits', 'writeUnits']);
  const ai = await one('Workers AI', 'aiInferenceAdaptiveGroups(limit: 5000, orderBy: [date_ASC], filter: {date_geq: $d0}) { count sum { totalNeurons } dimensions { date modelId } }');
  table('Workers AI', (ai?.aiInferenceAdaptiveGroups ?? []).map((x) => ({ ngay: x.dimensions.date, model: x.dimensions.modelId, lan: x.count, neurons: Math.round(x.sum.totalNeurons) })), ['ngay', 'model', 'lan', 'neurons']);
  // Câu SQL đọc nhiều dòng nhất trên web thật trong 24 giờ qua (chỉ câu lệnh có tham số, không có dữ liệu).
  // Câu SQL đọc / ghi nhiều dòng nhất 24 giờ qua theo từng DB (chỉ câu lệnh có tham số, không có dữ liệu).
  for (const [dbName, by, n] of [['tong-hop-pos', 'rowsRead', 25], ['tong-hop-pos', 'rowsWritten', 15], ['tong-hop-pos-demo2', 'rowsWritten', 10], ['tong-hop-pos-demo2', 'rowsRead', 5], ['tong-hop-pos-demo', 'rowsRead', 5]]) {
    const id = Object.entries(names).find(([, x]) => x === dbName)?.[0] ?? '';
    const q24 = await gql(`query($acc: String!, $db: String!, $s: Time!, $u: Time!) { viewer { accounts(filter: {accountTag: $acc}) { d1QueriesAdaptiveGroups(limit: ${n}, orderBy: [sum_${by}_DESC], filter: {databaseId: $db, datetime_geq: $s, datetime_leq: $u}) { count sum { rowsRead rowsWritten } dimensions { query } } } } }`,
      { acc: ACC, db: id, s: new Date(Date.now() - 86400000).toISOString(), u: until });
    if (q24.errors.length) print(`Lỗi GraphQL (${dbName} ${by})`, q24.errors);
    console.log(`${dbName} 24 giờ qua theo ${by} (dòng đọc | dòng ghi | số lần | câu):`);
    for (const x of q24.data?.viewer?.accounts?.[0]?.d1QueriesAdaptiveGroups ?? []) console.log(`  ${x.sum.rowsRead} | ${x.sum.rowsWritten} | ${x.count} | ${x.dimensions.query.replace(/\s+/g, ' ').slice(0, 260)}`);
  }
  // Tên các bộ số đo có trong API (để lượt sau sửa câu hỏi nếu tên trường đổi): chỉ là sơ đồ API công khai.
  const intro = await gql('{ __type(name: "account") { fields { name } } }');
  console.log('Bộ số đo liên quan:', (intro.data?.__type?.fields ?? []).map((f) => f.name).filter((n) => /observ|log|ai|durable|d1|workersInvocations|container|queue|kv|r2|browser|vector/i.test(n)).join(', '));
} else if (mode === 'plan') {
  const subs = await api(`/accounts/${ACC}/subscriptions`);
  print('Gói (subscriptions)', subs.ok ? (subs.result ?? []).map((s) => ({ product: s.product?.name ?? s.component_values?.map?.((c) => c.name)?.join(','), plan: s.rate_plan?.public_name ?? s.rate_plan?.id, state: s.state })) : { status: subs.status, errors: subs.errors });
  const ws = await api(`/accounts/${ACC}/workers/account-settings`);
  print('Workers account-settings', ws.ok ? ws.result : { status: ws.status, errors: ws.errors });
  for (const n of ['tong-hop-pos', 'tong-hop-pos-demo']) { const x = await d1(n); delete x.uuid; print(`D1 ${n}`, x); }
  // Bảng sản phẩm tính sẵn trên demo (số ảo, chỉ in số tổng): đã điền xong chưa, tổng 70 ngày có khớp câu đọc đơn gốc không.
  const demo = await d1('tong-hop-pos-demo');
  const q = async (sql) => { const r = await fetch(`https://api.cloudflare.com/client/v4/accounts/${ACC}/d1/database/${demo.uuid}/query`, { method: 'POST', headers: { authorization: `Bearer ${TOKEN}`, 'content-type': 'application/json' }, body: JSON.stringify({ sql }) }).then((x) => x.json()).catch((e) => ({ errors: [{ message: String(e) }] })); return r.result?.[0]?.results ?? r.errors; };
  print('Demo: cờ bảng sản phẩm tính sẵn', await q("SELECT value, updated_at FROM app_settings WHERE key='stats_seller_product_ready'"));
  print('Demo: số dòng bảng tính sẵn', await q('SELECT COUNT(*) AS n, MIN(day) AS min, MAX(day) AS max FROM stats_daily_seller_product'));
  print('Demo: tổng 70 ngày, bảng tính sẵn', await q("SELECT SUM(sale_quantity) AS qty, SUM(sale_total) AS net, SUM(closed_total) AS closed_total, COUNT(DISTINCT day) AS days FROM stats_daily_seller_product WHERE day>=date('now','+7 hours','-69 days')"));
  print('Demo: tổng 70 ngày, đơn gốc', await q("SELECT SUM(CASE WHEN i.is_bonus=0 AND i.quantity>0 THEN i.quantity ELSE 0 END) AS qty, SUM(CASE WHEN i.is_bonus=0 AND i.quantity>0 THEN i.line_total ELSE 0 END) AS net, SUM(i.line_total) AS closed_total, COUNT(DISTINCT date(datetime(o.first_closed_at,'+7 hours'))) AS days FROM raw_pos_orders o JOIN raw_pos_order_items i ON i.order_id=o.id WHERE o.first_closed_at>=strftime('%Y-%m-%dT%H:%M:%S.000Z',date('now','+7 hours','-69 days'),'-7 hours') AND o.status_code NOT IN (0,6,7)"));
  print('Demo: tổng stats_daily_product 70 ngày', await q("SELECT SUM(closed_total) AS closed_total FROM stats_daily_product WHERE day>=date('now','+7 hours','-69 days')"));
  // Rủi ro dung lượng (11/10/2026): D1 trần 10 GB. Chỉ đọc siêu dữ liệu dung lượng theo ngày của web thật (không đọc dữ liệu), và trên demo (số ảo)
  // xem bảng nào chiếm chỗ nhiều nhất để suy ra cấu trúc dung lượng.
  const real = await d1('tong-hop-pos');
  const storage = await gql('query($acc: String!, $db: String!, $since: Date!) { viewer { accounts(filter: {accountTag: $acc}) { d1StorageAdaptiveGroups(limit: 200, orderBy: [date_ASC], filter: {databaseId: $db, date_geq: $since}) { max { databaseSizeBytes } dimensions { date } } } } }',
    { acc: ACC, db: real.uuid, since: new Date(Date.now() - 28 * 86400000).toISOString().slice(0, 10) });
  const days = storage.data?.viewer?.accounts?.[0]?.d1StorageAdaptiveGroups ?? [];
  console.log(`D1 web thật: dung lượng theo ngày (MB), ${days.length} ngày${storage.errors.length ? ` · lỗi: ${storage.errors.join('; ')}` : ''}`);
  for (const d of days) console.log(`  ${d.dimensions.date} | ${(d.max.databaseSizeBytes / 1e6).toFixed(1)}`);
  // D1 không có dbstat: đếm số dòng các bảng lớn trên demo, nhân độ dài trung bình để ước bảng nào chiếm chỗ.
  print('Demo: số dòng các bảng lớn', await q("SELECT (SELECT COUNT(*) FROM raw_pos_orders) AS orders, (SELECT COUNT(*) FROM raw_pos_order_items) AS items, (SELECT COUNT(*) FROM pos_customers) AS customers, (SELECT COUNT(*) FROM customer_stats) AS customer_stats, (SELECT COUNT(*) FROM stats_daily_seller_product) AS seller_product, (SELECT COUNT(*) FROM audit_log) AS audit, (SELECT COUNT(*) FROM customer_notes) AS notes, (SELECT COUNT(*) FROM sync_runs) AS sync_runs"));
  print('Demo: số đơn và độ dài JSON trung bình mỗi đơn', await q('SELECT COUNT(*) AS n, ROUND(AVG(LENGTH(raw_json))) AS raw, ROUND(AVG(LENGTH(status_history_json))) AS hist, ROUND(AVG(LENGTH(other_history_json))) AS other, ROUND(AVG(LENGTH(item_json))) AS items FROM raw_pos_orders'));
  const trace = await (await fetch('https://demo.tonghopposmegatech.io.vn/cdn-cgi/trace')).text();
  print('Máy test vào trạm Cloudflare', Object.fromEntries(trace.trim().split('\n').map((l) => l.split('=')).filter(([k]) => ['colo', 'loc', 'http'].includes(k))));
} else if (mode === 'count') {
  // Rủi ro sót đơn + số người đã gắn hồ sơ (anh Vũ "Cho toàn bộ quyền" 10/10/2026, qua điều phối: chỉ đếm, không đọc tên hay thông tin khách, không ghi).
  // Chỉ chạy câu SELECT trả về số đếm gom nhóm; không in dòng dữ liệu nào.
  const real = await d1('tong-hop-pos');
  const q = async (sql) => {
    if (!/^\s*SELECT\b/i.test(sql) || /\b(INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|REPLACE)\b/i.test(sql)) throw new Error('chỉ được SELECT');
    const t = Date.now();
    const r = await fetch(`https://api.cloudflare.com/client/v4/accounts/${ACC}/d1/database/${real.uuid}/query`, { method: 'POST', headers: { authorization: `Bearer ${TOKEN}`, 'content-type': 'application/json' }, body: JSON.stringify({ sql }) }).then((x) => x.json()).catch((e) => ({ errors: [{ message: String(e) }] }));
    return { ms: Date.now() - t, rows: r.result?.[0]?.results ?? null, err: r.errors?.map((e) => e.message).join('; ') || null };
  };
  const show = async (label, sql) => { const r = await q(sql); console.log(`${label} (${r.ms} ms)${r.err ? ` · lỗi: ${r.err}` : ''}`); for (const row of r.rows ?? []) console.log(`  ${Object.values(row).join(' | ')}`); };
  const cut = (days) => `strftime('%Y-%m-%dT%H:%M:%S.000Z','now','-${days} days')`;
  // Lượt 2 (nhẹ): bỏ các câu quét cả bảng đơn (lượt 1 tốn 49 s + 19 s + 12 s D1), chỉ đọc sync_runs và đơn 90 ngày gần đây.
  await show('Phân bố số đơn đổi mỗi lượt đồng bộ, 7 ngày qua (pos | lượt | ≥100 | ≥150 | ≥200 | ≥250 | nhiều nhất)',
    `SELECT pos_id, COUNT(*), SUM(records>=100), SUM(records>=150), SUM(records>=200), SUM(records>=250), MAX(records) FROM sync_runs WHERE status='source_recent' AND started_at >= ${cut(7)} GROUP BY pos_id ORDER BY pos_id`);
  await show('Lượt đổi từ 150 đơn trở lên theo ngày (ngày | pos | số lượt | nhiều nhất)',
    "SELECT substr(started_at,1,10) AS day, pos_id, COUNT(*), MAX(records) FROM sync_runs WHERE status='source_recent' AND records>=150 GROUP BY day, pos_id ORDER BY day DESC LIMIT 40");
  await show('"Đang hoàn" quá 20 ngày không đổi, tạo trong 90 ngày qua (pos | số đơn)',
    `SELECT pos_id, COUNT(*) FROM raw_pos_orders WHERE status_code=4 AND updated_at < ${cut(20)} AND created_at >= ${cut(90)} GROUP BY pos_id ORDER BY pos_id`);
  await show('Đơn "Mới" quá 20 ngày không đổi, tạo trong 90 ngày qua (pos | số đơn)',
    `SELECT pos_id, COUNT(*) FROM raw_pos_orders WHERE status_code=0 AND updated_at < ${cut(20)} AND created_at >= ${cut(90)} GROUP BY pos_id ORDER BY pos_id`);
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
