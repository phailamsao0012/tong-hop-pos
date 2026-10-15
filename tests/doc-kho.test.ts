import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import { actorLabel, groupLabels, percentage, readD1Results, renderReport, safeTag } from '../scripts/doc-kho/tom-tat.mjs';

type SqlRow = Record<string, string | number | null>;

const sqlDir = new URL('../scripts/doc-kho/', import.meta.url);
const sqlFiles = readdirSync(sqlDir).filter((file) => file.endsWith('.sql')).sort();
const sqlTexts = sqlFiles.map((file) => readFileSync(new URL(file, sqlDir), 'utf8'));
const ago = (days: number) => new Date(Date.now() - days * 86400000).toISOString().slice(0, 19);
const users = [
  ['pos-a', 'sale-a', 'Ảo A SALE'], ['pos-a', 'sale-b', 'Ảo B SALE'],
  ['pos-a', 'care-a', 'Ảo A CSKH'], ['pos-a', 'care-b', 'Ảo B CSKH'],
  ['pos-a', 'mkt-a', 'Ảo A MKT'], ['pos-b', 'mkt-b', 'Ảo B MKT'],
  ['pos-a', 'kho-a', 'Ảo A KHO'], ['pos-b', 'kho-b', 'Ảo B KHO'],
  ['pos-a', 'solo', 'Ảo SOLO'], ['pos-a', 'lower', 'Ảo kho'],
  ['pos-a', 'unicode', 'Ảo KHÓ'], ['pos-a', 'long', 'Ảo ABCDEFGHI'],
  ['pos-a', 'dup', 'Ảo ONLY'], ['pos-b', 'dup', 'Ảo ONLY'],
  ['pos-a', 'blank', ''], ['pos-a', 'spaces', '  Ảo  C\tD\nKHO  '],
].map(([pos_id, user_id, name]) => ({ pos_id, user_id, name }));
const columns = ['id', 'pos_id', 'first_closed_at', 'status_code', 'seller_id', 'care_id',
  'status_history_json', 'tags_json', 'raw_json', 'sub_status', 'last_editor_id'];
const h = (old_status: number, status: number, editor_id: string, hour: number) => ({
  old_status, status, editor_id, updated_at: `2026-01-01T${String(hour).padStart(2, '0')}:00:00`,
});
const base = { pos_id: 'pos-a', first_closed_at: ago(1), status_code: 1, seller_id: 'sale-a', care_id: 'care-a',
  status_history_json: '[]', tags_json: '[]', raw_json: null, sub_status: null, last_editor_id: 'sale-a' };
const fixtures = {
  shops: [{ id: 'pos-a' }, { id: 'pos-b' }], users,
  orders: [
    { ...base, id: 'fake-a', sub_status: 2, status_code: 15,
      status_history_json: JSON.stringify([
        h(0, 17, 'sale-a', 0), h(17, 1, 'sale-a', 1), h(1, 8, 'kho-a', 3),
        h(8, 9, 'missing', 4), h(9, 2, 'care-a', 5), h(2, 3, 'sale-b', 6),
        h(3, 4, 'care-b', 7), h(4, 5, 'mkt-a', 8), h(5, 15, 'solo', 9),
      ]),
      tags_json: JSON.stringify([{ name: 'Gọi lại' }, { name: 'Gọi lại' }, { name: 'Thẻ 123456' }, { name: 'ĐT 12 34 56' }]),
      raw_json: JSON.stringify({ histories: [
        { field: 'sub_status', old_value: 'TUYET_DOI_KHONG_IN', new_value: 2, editor_id: 'kho-a' },
        { note: { old: 'TUYET_DOI_KHONG_IN', new: 'TUYET_DOI_KHONG_IN' }, tags: [], editor_id: 'care-a' },
        { field_name: 'sub_status', editor_id: 'sale-a' },
        { field: 'Tên khách giả', editor_id: 'missing' },
      ] }), last_editor_id: 'kho-a',
    },
    { ...base, id: 'fake-b', status_history_json: JSON.stringify([h(0, 1, 'sale-a', 0), h(1, 8, 'kho-a', 1)]),
      tags_json: 'invalid', raw_json: 'invalid', last_editor_id: 'care-a' },
    { ...base, id: 'fake-c', pos_id: 'pos-b', status_code: 17, status_history_json: 'invalid',
      raw_json: JSON.stringify({ histories: [] }), last_editor_id: 'kho-b' },
    { ...base, id: 'fake-old', first_closed_at: ago(8), sub_status: 999 },
    { ...base, id: 'fake-future', first_closed_at: ago(-1), sub_status: 999 },
    ...[0, 6, 7].map((status_code) => ({ ...base, id: `fake-excluded-${status_code}`, status_code, sub_status: 999 })),
  ],
};

function runSql(sql: string, data = fixtures) {
  const db = new DatabaseSync(':memory:');
  try {
    // CTE giả thay bảng và chỉ mục, không ghi SQL hay sửa DB. SQL nghiệp vụ giữ nguyên.
    const input = `WITH RECURSIVE
      fixture(data) AS (VALUES (?)),
      pos_shops AS (SELECT json_extract(value, '$.id') AS id FROM fixture, json_each(data, '$.shops')),
      pos_users AS (SELECT ${['pos_id', 'user_id', 'name'].map((c) => `json_extract(value, '$.${c}') AS ${c}`).join(', ')}
        FROM fixture, json_each(data, '$.users')),
      raw_pos_orders AS (SELECT ${columns.map((c) => `json_extract(value, '$.${c}') AS ${c}`).join(', ')}
        FROM fixture, json_each(data, '$.orders')),
      ${sql.replace(/^WITH RECURSIVE\s*/, '').replaceAll(' INDEXED BY idx_raw_orders_pos_closed_status_money', '')}`;
    return db.prepare(input).all(JSON.stringify(data)) as SqlRow[];
  } finally { db.close(); }
}
const tables = sqlTexts.map((sql) => runSql(sql));

void test('doc-kho: đổi % một chữ số, mẫu rỗng và số đếm không hợp lệ', () => {
  assert.equal(percentage(1, 3), '33.3%');
  assert.equal(percentage(0, 2), '0.0%');
  assert.equal(percentage(2, 2), '100.0%');
  assert.equal(percentage(0, 0), '—');
  assert.equal(percentage(3, 2), '—');
  for (const [n, total] of [[-1, 2], [NaN, 1], [1.2, 2], [1, Infinity]]) {
    assert.throws(() => percentage(n, total));
  }
});

void test('doc-kho: gộp nhãn người, chỉ nhận loại người và hậu tố hợp lệ', () => {
  assert.equal(actorLabel('người khác hậu tố KHO'), 'người khác hậu tố KHO');
  for (const label of ['Tên người giả', 'người khác hậu tố kho', 'người khác hậu tố KHÓ', 'người khác hậu tố TOOLONGAA']) {
    assert.equal(actorLabel(label), 'người khác, không hậu tố');
  }
  assert.deepEqual(groupLabels([{ label: 'Giả A', n: 3 }, { label: 'Giả B', n: 4 }]),
    [{ label: 'người khác, không hậu tố', n: 7 }]);
});

void test('doc-kho: thẻ có chuỗi sáu chữ số, điện thoại rời, email và ký tự điều khiển bị bỏ', () => {
  for (const label of ['Đơn 123456', 'ĐT 12-34-56', '0900000001', ['a', 'example.invalid'].join('@'), 'https://example.invalid', 'A\nB', '']) {
    assert.equal(safeTag(label), false);
  }
  assert.equal(safeTag('Gọi lại'), true);
  assert.equal(safeTag('Kho 12345'), true);
});

void test('doc-kho: SQL chỉ SELECT; lọc khoảng 7 ngày theo chỉ mục POS, không quét mọi đơn', () => {
  assert.equal(sqlFiles.length, 8);
  for (const [i, sql] of sqlTexts.entries()) {
    const clean = sql.replace(/--[^\n]*/g, '');
    assert.match(clean, /^WITH RECURSIVE/);
    const tokens = clean.replace(/'(?:''|[^'])*'/g, '"string"');
    assert.doesNotMatch(tokens, /\b(?:INSERT|UPDATE|DELETE|CREATE|DROP|ALTER|REPLACE|PRAGMA|ATTACH|DETACH|VACUUM|REINDEX|ANALYZE|BEGIN|COMMIT|ROLLBACK|SAVEPOINT|RELEASE)\b/i);
    assert.equal((clean.match(/;/g) ?? []).length, 1);
    if (i < 7) {
      assert.match(sql, /CROSS JOIN raw_pos_orders o INDEXED BY idx_raw_orders_pos_closed_status_money/);
      assert.match(sql, /o\.pos_id = p\.id/);
      assert.match(sql, /o\.first_closed_at >= strftime/);
      assert.match(sql, /o\.first_closed_at < strftime/);
    }
  }
  assert.deepEqual(tables[3].map((r) => [r.label, r.n, r.total]), [['không rõ', 2, 3], ['2', 1, 3]]);
  const customStatus = structuredClone(fixtures);
  customStatus.orders[0].sub_status = 1001;
  assert.ok(runSql(sqlTexts[3], customStatus).some((row) => row.label === '1001'));
});

void test('doc-kho: SQL phân loại chính Sale, CSKH và hậu tố; người thiếu hoặc sai POS là không rõ', () => {
  const actorFor = (oldStatus: number) => tables[0].find((r) => r.old_status === oldStatus)?.actor;
  assert.equal(actorFor(17), 'chính Sale của đơn');
  assert.equal(actorFor(1), 'người khác hậu tố KHO');
  assert.equal(actorFor(8), 'không rõ');
  assert.equal(actorFor(9), 'CSKH của đơn');
  assert.equal(actorFor(2), 'người khác hậu tố SALE');
  assert.equal(actorFor(3), 'người khác hậu tố CSKH');
  assert.equal(actorFor(4), 'người khác hậu tố MKT');
  assert.equal(actorFor(5), 'người khác, không hậu tố');
  const suffixes = tables[7].map((r) => r.label);
  assert.deepEqual([...suffixes].sort((a, b) => String(a).localeCompare(String(b))), ['CSKH', 'KHO', 'MKT', 'SALE']);
  assert.equal(tables[7].find((r) => r.label === 'KHO')?.n, 3);
  const changed = structuredClone(fixtures);
  changed.orders[0].last_editor_id = 'sale-a';
  changed.orders[0].care_id = 'sale-a';
  assert.equal(runSql(sqlTexts[6], changed).find((r) => r.label === 'chính Sale của đơn')?.n, 1);
  changed.orders[0].last_editor_id = '';
  changed.orders[2].last_editor_id = 'sale-a';
  assert.equal(runSql(sqlTexts[6], changed).find((r) => r.label === 'không rõ')?.n, 2);
});

void test('doc-kho: đường đi không dùng so sánh số trạng thái; thời gian trung vị và p90 đúng', () => {
  assert.deepEqual(tables[1].map((r) => [r.metric, r.n, r.total]), [
    ['has17', 2, 3], ['has1', 2, 3], ['has1_without17', 1, 3], ['packed', 2, 3],
  ]);
  const gap = tables[2].find((r) => r.pair === '1→8')!;
  assert.ok(Math.abs(Number(gap.median_minutes) - 90) < 0.001);
  assert.ok(Math.abs(Number(gap.p90_minutes) - 120) < 0.001);
  const sparse = structuredClone(fixtures);
  sparse.orders[0].status_history_json = JSON.stringify([h(17, 1, 'sale-a', 1), h(1, 8, 'kho-a', 0)]);
  assert.equal(runSql(sqlTexts[2], sparse).find((r) => r.pair === '17→1')?.median_minutes, null);
});

void test('doc-kho: đếm thẻ theo đơn, histories chỉ trường và loại người; không lấy giá trị sửa', () => {
  assert.deepEqual(tables[4].map((r) => [r.label, r.n, r.total]), [['Gọi lại', 1, 3]]);
  const histories = tables[5];
  assert.equal(histories.find((r) => r.kind === 'coverage' && r.label === 'histories')?.n, 1);
  assert.equal(histories.find((r) => r.kind === 'coverage' && r.label === 'raw_json')?.n, 3);
  assert.equal(histories.filter((r) => r.label === 'sub_status').length, 2);
  assert.ok(histories.some((r) => r.label === 'note' && r.actor === 'CSKH của đơn'));
  assert.ok(histories.some((r) => r.label === 'tags'));
  assert.doesNotMatch(JSON.stringify(histories), /TUYET_DOI_KHONG_IN|Tên khách giả|kho-a/);
});

void test('doc-kho: báo cáo chỉ tỉ lệ, phút và nhãn an toàn; không in số đếm hay metadata', () => {
  const report = renderReport(tables);
  assert.match(report, /33\.3%/);
  assert.match(report, /90\.0 phút/);
  assert.doesNotMatch(report, /fake-a|sale-a|TUYET_DOI_KHONG_IN|123456|Tên khách giả/);
  assert.equal((report.match(/^## /gm) ?? []).length, 8);
  const huge = Array.from({ length: 8 }, () => []) as SqlRow[][];
  huge[6] = [{ label: 'chính Sale của đơn', n: 1234567, total: 2469134, secret: 'CẤM_IN' }];
  const output = renderReport(huge);
  assert.match(output, /50\.0%/);
  assert.doesNotMatch(output, /1234567|2469134|CẤM_IN/);
  huge[4] = [{ label: '<b>Gọi|lại</b>', n: 3, total: 100 }, { label: 'Dưới ngưỡng', n: 2, total: 100 }];
  assert.match(renderReport(huge), /&lt;b&gt;Gọi&#124;lại/);
  assert.doesNotMatch(renderReport(huge), /Dưới ngưỡng/);
  huge[4] = [{ label: '::error::Thẻ giả', n: 3, total: 100 }];
  assert.match(renderReport(huge), /&#58;&#58;error&#58;&#58;Thẻ giả/);
  assert.doesNotMatch(renderReport(huge), /::error::/);
});

void test('doc-kho: mọi bảng rỗng, JSON lỗi và kết quả D1 thất bại không bị in thô', () => {
  assert.doesNotThrow(() => renderReport(sqlTexts.map((sql) => runSql(sql, { ...fixtures, orders: [] }))));
  assert.deepEqual(readD1Results('[{"success":true,"results":[],"meta":{"rows_read":1234567}}]'), []);
  for (const payload of ['invalid', '[]', '[{"success":false,"error":"CẤM_IN"}]', '{}']) {
    assert.throws(() => readD1Results(payload));
  }
  const taskTmp = mkdtempSync(join(tmpdir(), 'doc-kho-test-'));
  try {
    const inputs = tables.map((results, i) => {
      const file = join(taskTmp, `${i}.json`);
      writeFileSync(file, JSON.stringify([{ success: true, results, meta: { rows_read: 1234567 } }]));
      return file;
    });
    const summary = join(taskTmp, 'summary.md');
    const child = spawnSync(process.execPath, ['scripts/doc-kho/tom-tat.mjs', ...inputs], {
      encoding: 'utf8', env: { PATH: process.env.PATH, NODE_ENV: 'test', GITHUB_STEP_SUMMARY: summary },
    });
    assert.equal(child.status, 0);
    assert.equal(child.stdout, readFileSync(summary, 'utf8'));
    assert.doesNotMatch(child.stdout + child.stderr, /1234567|fake-a|TUYET_DOI_KHONG_IN/);
    writeFileSync(inputs[0], 'CẤM_IN');
    const failed = spawnSync(process.execPath, ['scripts/doc-kho/tom-tat.mjs', ...inputs], { encoding: 'utf8' });
    assert.equal(failed.status, 0);
    assert.match(failed.stdout, /Bảng Chuyển trạng thái: lỗi không phải JSON/);
    assert.equal((failed.stdout.match(/^## /gm) ?? []).length, 7);
    assert.doesNotMatch(failed.stderr, /CẤM_IN|SyntaxError|\.json/);
  } finally { rmSync(taskTmp, { recursive: true, force: true }); }
});

void test('doc-kho: SQL chạy với toàn bộ migration thật; kế hoạch dùng khoảng chỉ mục theo POS', () => {
  const db = new DatabaseSync(':memory:');
  try {
    const migrations = new URL('../drizzle/', import.meta.url);
    for (const file of readdirSync(migrations).filter((name) => name.endsWith('.sql')).sort()) {
      // Chỉ dùng migration có sẵn để dựng schema cục bộ, không thêm câu SQL ghi mới.
      db.exec(readFileSync(new URL(file, migrations), 'utf8'));
    }
    for (const [i, sql] of sqlTexts.entries()) {
      assert.doesNotThrow(() => db.prepare(sql).all());
      if (i < 7) {
        const plan = db.prepare(`EXPLAIN QUERY PLAN ${sql}`).all().map((row) => String(row.detail)).join('\n');
        assert.match(plan, /SEARCH o USING (?:COVERING )?INDEX idx_raw_orders_pos_closed_status_money \(pos_id=\? AND first_closed_at>\? AND first_closed_at<\?\)/);
      }
    }
  } finally { db.close(); }
});

void test('doc-kho: job chỉ đọc đúng nhánh; log chỉ báo cáo, lỗi gốc được giữ kín và file tạm được xoá', () => {
  const workflow = readFileSync(new URL('../.github/workflows/doc-kho-1510.yml', import.meta.url), 'utf8');
  assert.match(workflow, /branches: \[codex\/doc-kho-1510\]/);
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /if: github\.ref == 'refs\/heads\/codex\/doc-kho-1510'/);
  assert.match(workflow, /contents: read/);
  assert.doesNotMatch(workflow, /set -x|upload-artifact|wrangler deploy|db:migrate/);
  assert.doesNotMatch(workflow, /--remote[^\n]*--file/);
  assert.match(workflow, /--remote --json --command "\$\(cat "\$query"\)"/);
  const run = workflow.match(/        run: \|\n((?:          .*\n?)+)/)?.[1]
    .replace(/^          /gm, '');
  assert.ok(run);
  assert.equal(spawnSync('bash', ['-n'], { input: run, encoding: 'utf8' }).status, 0);
  const taskTmp = mkdtempSync(join(tmpdir(), 'doc-kho-job-test-'));
  try {
    // Giả CLI ngay tại ranh giới mạng: không gọi Cloudflare, chỉ trả số gộp giả.
    const fakePnpm = join(taskTmp, 'pnpm');
    writeFileSync(fakePnpm, `#!${process.execPath}
      const fs = require('node:fs');
      const path = require('node:path');
      const args = process.argv.slice(2);
      const expected = ['exec', 'wrangler', 'd1', 'execute', 'DB', '--remote', '--json', '--command'];
      if (JSON.stringify(args.slice(0, 8)) !== JSON.stringify(expected) || args.length !== 9) process.exit(2);
      fs.writeFileSync(process.env.DOC_KHO_MARKER, path.dirname(process.env.WRANGLER_LOG_PATH));
      if (process.env.DOC_KHO_FAIL === 'yes') {
        process.stdout.write('RAW_DATA_MUST_STAY_PRIVATE');
        process.stderr.write('RAW_ERROR_MUST_STAY_PRIVATE');
        process.exit(1);
      }
      const data = JSON.parse(fs.readFileSync(process.env.DOC_KHO_FIXTURES, 'utf8'));
      process.stdout.write(JSON.stringify([{ success: true, results: data[Object.keys(data).find((file) => fs.readFileSync(path.join('scripts/doc-kho', file), 'utf8').trimEnd() === args[8])],
        meta: { rows_read: 1234567 } }]));
    `);
    chmodSync(fakePnpm, 0o700);
    const input = join(taskTmp, 'fixtures.json');
    writeFileSync(input, JSON.stringify(Object.fromEntries(sqlFiles.map((file, i) => [file, tables[i]]))));
    const summary = join(taskTmp, 'summary.md');
    const marker = join(taskTmp, 'marker');
    const jobEnv: NodeJS.ProcessEnv = {
      PATH: `${taskTmp}:${process.env.PATH}`, NODE_ENV: 'test', GITHUB_STEP_SUMMARY: summary,
      DOC_KHO_FIXTURES: input, DOC_KHO_MARKER: marker,
    };
    const ok = spawnSync('bash', ['-c', run], { encoding: 'utf8', env: jobEnv });
    assert.equal(ok.status, 0, ok.stderr);
    assert.equal(ok.stdout, renderReport(tables));
    assert.equal(readFileSync(summary, 'utf8'), ok.stdout);
    assert.equal(existsSync(readFileSync(marker, 'utf8')), false);
    rmSync(summary);
    const failed = spawnSync('bash', ['-c', run], {
      encoding: 'utf8', env: { ...jobEnv, DOC_KHO_FAIL: 'yes' },
    });
    assert.equal(failed.status, 1);
    assert.doesNotMatch(failed.stdout + failed.stderr, /RAW_DATA|RAW_ERROR|1234567/);
    assert.equal(existsSync(summary), false);
    assert.equal(existsSync(readFileSync(marker, 'utf8')), false);
  } finally { rmSync(taskTmp, { recursive: true, force: true }); }
});

void test('doc-kho R1B: từng bảng lỗi độc lập và thông điệp lạ bị che', () => {
  for (let i = 0; i < 8; i++) {
    const broken = tables.map((rows) => [...rows]);
    broken[i] = [null] as unknown as SqlRow[];
    const report = renderReport(broken);
    assert.equal((report.match(/^## /gm) ?? []).length, 7);
    assert.match(report, /: lỗi không rõ/);
    assert.doesNotMatch(report, /TypeError|stack|Cannot read/);
  }
  const broken = tables.map((rows) => [...rows]);
  broken[6] = [{ label: 'không rõ', n: -1, total: 3 }];
  assert.match(renderReport(broken), /Bảng last_editor_id: lỗi Số đếm gộp không hợp lệ\./);
  const unknown = new Error('DU_LIEU_CAM');
  broken[6] = [{ get label(): string { throw unknown; }, n: 1, total: 3 }];
  assert.doesNotMatch(renderReport(broken), /DU_LIEU_CAM/);
  assert.match(renderReport(broken), /lỗi không rõ/);
});

void test('doc-kho R1B: tổng cặp lệch dùng tổng tính lại, n vượt mẫu là dấu gạch', () => {
  const changed = tables.map((rows) => [...rows]);
  changed[0] = [
    { old_status: 17, new_status: 1, actor: 'không rõ', n: 1, pair_total: 90, total: 99 },
    { old_status: 1, new_status: 8, actor: 'không rõ', n: 3, pair_total: 80, total: 99 },
  ];
  changed[1] = [{ metric: 'has17', n: 4, total: 3 }];
  const report = renderReport(changed);
  assert.match(report, /25\.0%/);
  assert.match(report, /75\.0%/);
  assert.match(report, /tổng lệch/);
  assert.match(report, /Có vào Chờ xác nhận \(17\) \| —/);
});

void test('doc-kho R1B: mẫu âm bị bỏ khỏi phân vị và hiển thị tỉ lệ bỏ', () => {
  const changed = structuredClone(fixtures);
  changed.orders[0].status_history_json = JSON.stringify([h(0, 1, 'sale-a', 3), h(1, 8, 'kho-a', 1)]);
  const gaps = runSql(sqlTexts[2], changed);
  const gap = gaps.find((row) => row.pair === '1→8')!;
  assert.equal(gap.total, 2);
  assert.equal(gap.discarded, 1);
  assert.ok(Math.abs(Number(gap.median_minutes) - 60) < 0.001);
  assert.ok(Math.abs(Number(gap.p90_minutes) - 60) < 0.001);
  const changedTables = tables.map((rows) => [...rows]);
  changedTables[2] = gaps;
  assert.match(renderReport(changedTables), /% mẫu bị bỏ/);
  assert.match(renderReport(changedTables), /60\.0 phút \| 60\.0 phút \| 50\.0%/);
});

void test('doc-kho R1B: D1 lấy phần tử cuối có results', () => {
  assert.deepEqual(readD1Results(JSON.stringify([
    { success: true, results: [{ n: 1 }] }, { success: true, results: [{ n: 2 }] }, { meta: {} },
  ])), [{ n: 2 }]);
  assert.throws(() => readD1Results(JSON.stringify([{ success: true, results: [] }, { success: false, results: [] }])));
});

void test('doc-kho R1C: ba lý do đọc lỗi cố định, từng file lỗi vẫn in bảy bảng và summary', () => {
  const cases = [
    ['DU_LIEU_CAM', 'không phải JSON'],
    [JSON.stringify([{ success: true, meta: { private: 'DU_LIEU_CAM' } }]), 'không có results'],
    [JSON.stringify([{ success: true, results: [{ 'Total queries executed': 8, private: 'DU_LIEU_CAM' }] }]), 'chỉ có thống kê nhập file, không có hàng'],
  ];
  const taskTmp = mkdtempSync(join(tmpdir(), 'doc-kho-r1c-'));
  try {
    const inputs = tables.map((results, i) => {
      const file = join(taskTmp, i + '.json');
      writeFileSync(file, JSON.stringify([{ success: true, results }]));
      return file;
    });
    const summary = join(taskTmp, 'summary.md');
    for (const [payload, reason] of cases) {
      assert.throws(() => readD1Results(payload), { message: reason });
      for (let i = 0; i < inputs.length; i++) {
        writeFileSync(inputs[i], payload);
        writeFileSync(summary, '');
        const child = spawnSync(process.execPath, ['scripts/doc-kho/tom-tat.mjs', ...inputs], {
          encoding: 'utf8', env: { PATH: process.env.PATH, NODE_ENV: 'test', GITHUB_STEP_SUMMARY: summary },
        });
        assert.equal(child.status, 0);
        assert.equal((child.stdout.match(/^## /gm) ?? []).length, 7);
        assert.ok(child.stdout.includes(': lỗi ' + reason));
        assert.equal(child.stdout, readFileSync(summary, 'utf8'));
        assert.equal(child.stderr, '');
        assert.doesNotMatch(child.stdout, /DU_LIEU_CAM|Total queries executed/);
        writeFileSync(inputs[i], JSON.stringify([{ success: true, results: tables[i] }]));
      }
    }
  } finally { rmSync(taskTmp, { recursive: true, force: true }); }
});
