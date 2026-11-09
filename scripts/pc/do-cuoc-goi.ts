// Chỉ đo SELECT trên bản sao PC; không in dữ liệu hay tham số nghiệp vụ.
import { writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { openD1 } from '../../pc/d1';
import { env } from 'cloudflare:workers';
import { callsReport } from '../../lib/reports/calls-report';

const db = await openD1(process.argv[2] ?? 'C:\\thp\\db-thu\\thp.sqlite', { readers: 0 });
type Query = { sql: string; args: unknown[] };
const lines = ['# Đo Cuộc gọi trên bản sao PC', '', 'Mỗi câu chạy một lượt làm nóng rồi 3 lượt lấy trung vị. EXPLAIN QUERY PLAN chỉ cho đường truy cập/chỉ mục, KHÔNG cho số dòng thực đọc. rows_read của pc/d1-core.ts là số dòng kết quả nên không dùng thay số dòng đọc D1. Không ghi số liệu kinh doanh hay tham số vào báo cáo.', '', '| Kỳ | Team | Câu | Trung vị ms | Đường truy cập |', '|---|---|---|---:|---|'];
try {
  await db.exec('CREATE TEMP TABLE calls_coverage_pos (pos_id TEXT PRIMARY KEY,customers INTEGER,notes INTEGER,first_note TEXT,last_fetch TEXT)');
  if (process.argv.includes('--candidate')) {
    // Bảng TEMP chỉ ở RAM/kết nối này, không sửa bản sao DB bên ngoài workspace.
    await db.exec('CREATE TEMP TABLE pos_customers AS SELECT * FROM main.pos_customers');
    const indexes = await db.prepare("SELECT sql FROM main.sqlite_master WHERE type='index' AND tbl_name='pos_customers' AND sql IS NOT NULL").all<{ sql: string }>();
    for (const index of indexes.results) await db.exec(index.sql.replace(/^(CREATE\s+(?:UNIQUE\s+)?INDEX\s+)(?:IF NOT EXISTS\s+)?(\S+)/i, '$1IF NOT EXISTS temp.$2'));
    await db.exec('CREATE INDEX IF NOT EXISTS temp.idx_pos_customers_assigned_pos ON pos_customers(assigned_user_id,pos_id) WHERE assigned_user_id IS NOT NULL');
    await db.exec('ANALYZE temp.pos_customers');
    await db.exec(`INSERT INTO calls_coverage_pos SELECT s.id,(SELECT COUNT(*) FROM pos_customers WHERE pos_id=s.id),COUNT(n.id),MIN(n.created_at),MAX(n.fetched_at) FROM pos_shops s LEFT JOIN customer_notes n ON n.pos_id=s.id GROUP BY s.id`);
  }
  if (process.argv.includes('--candidate')) {
    await db.exec('CREATE TEMP TABLE marketer_ids (marketer_id TEXT PRIMARY KEY)');
    for (const pos of (await db.prepare('SELECT id FROM pos_shops').all<{ id: string }>()).results) {
      await db.prepare("INSERT INTO marketer_ids SELECT DISTINCT TRIM(marketer_id) FROM raw_pos_orders WHERE pos_id=? AND marketer_id IS NOT NULL AND TRIM(marketer_id)<>'' ON CONFLICT DO NOTHING").bind(pos.id).run();
    }
    await db.exec("INSERT INTO marketer_ids VALUES ('__kiem_bai_ao__') ON CONFLICT DO NOTHING");
    await db.exec("DELETE FROM marketer_ids WHERE marketer_id NOT IN (SELECT DISTINCT TRIM(marketer_id) FROM raw_pos_orders WHERE marketer_id IS NOT NULL AND TRIM(marketer_id)<>'')");
    const actual = await db.prepare('SELECT marketer_id FROM marketer_ids ORDER BY marketer_id').all();
    const expected = await db.prepare("SELECT DISTINCT TRIM(marketer_id) AS marketer_id FROM raw_pos_orders WHERE marketer_id IS NOT NULL AND TRIM(marketer_id)<>'' ORDER BY marketer_id").all();
    assert.ok(JSON.stringify(actual.results) === JSON.stringify(expected.results), 'Danh s?ch MKT sau d?n ph?i b?ng DISTINCT c?');
    lines.push('', 'Danh s?ch MKT sau ?i?n t?ng POS v? d?n ??m kh?p DISTINCT c?; kh?ng xu?t ID.', '');
  }
  const posIds = (await db.prepare('SELECT id FROM pos_shops ORDER BY id').all<{ id: string }>()).results.map(r => r.id);
  if (posIds.length !== 6) throw new Error('Bản sao không có đúng 6 POS');
  for (const [period, start] of [['Hôm nay', '2026-11-09'], ['7 ngày', '2026-11-03'], ['Tháng này', '2026-11-01']]) for (const team of ['all', 'cskh'] as const) {
    const queries: Query[] = [];
    const capture = { prepare(sql: string) {
      const q: Query = { sql, args: [] };
      const s = { bind(...args: unknown[]) { q.args = args; return s; }, async first() { queries.push(q); return process.argv.includes('--candidate') && sql.includes('FROM calls_coverage_pos') ? { ready: posIds.length, customers: 0, notes: 0, first_note: null, last_fetch: null } : null; }, async run() { return {}; } };
      return Object.assign(s, { q });
    }, async batch(statements: { q: Query }[]) { queries.push(...statements.map(s => s.q)); return statements.map(() => ({ results: [] })); } };
    env.DB = capture as unknown as D1Database;
    await callsReport({ posIds, start, end: '2026-11-09', team, unit: null });
    for (const [i, q] of queries.entries()) {
      if (!/^SELECT/i.test(q.sql.trim())) continue;
      const st = db.prepare(q.sql).bind(...q.args);
      if (process.argv.includes('--candidate') && q.sql.includes('AS assigned FROM pos_customers')) {
        const old = await db.prepare(q.sql.replace('FROM pos_customers', 'FROM main.pos_customers')).bind(...q.args).all();
        assert.deepEqual((await st.all()).results, old.results, 'Số được phân công phải bằng đường cũ');
      }
      if (process.argv.includes('--candidate') && q.sql.includes('FROM calls_coverage_pos')) {
        const ph = posIds.map(() => '?').join(',');
        const old = await db.prepare(`SELECT (SELECT COUNT(*) FROM main.pos_customers WHERE pos_id IN (${ph})) AS customers, COUNT(*) AS notes, MIN(created_at) AS first_note, MAX(fetched_at) AS last_fetch FROM main.customer_notes WHERE pos_id IN (${ph})`).bind(...posIds, ...posIds).first();
        const row = await st.first<Record<string, unknown>>();
        assert.ok(row);
        const { ready: _ready, ...cov } = row;
        assert.deepEqual(cov, old, 'Coverage phải bằng đường cũ');
      }
      await st.all();
      const times: number[] = [];
      for (let j = 0; j < 3; j++) { const t = performance.now(); await st.all(); times.push(performance.now() - t); }
      const plan = await db.prepare('EXPLAIN QUERY PLAN ' + q.sql).bind(...q.args).all<{ detail: string }>();
      lines.push(`| ${period} | ${team} | Q${i + 1} | ${times.sort((a,b) => a-b)[1].toFixed(2)} | ${plan.results.map(r => r.detail).join('; ').replaceAll('|', '/')} |`);
    }
  }
  lines.push('', 'Mỗi câu xuất hiện một lần/lượt mở trang. Q1–Q6: batch daily/orders/names/assigned/cursors/unknownAuthors; Q7: pendingCustomers; Q8: bảng coverage mới. Khi chưa sẵn sàng: Q9 cache coverage, Q10 coverage trực tiếp khi cả hai cache hết hạn. Candidate dùng bảng TEMP/chỉ mục mới, không sửa DB nguồn.');
  if (process.argv.includes('--candidate')) lines.push('', 'Đã đối chiếu Q4 và coverage với đường cũ trên bản sao PC, cả 6 tổ hợp đều khớp; không xuất số liệu kinh doanh.');
  writeFileSync(process.argv[3] ?? 'docs/plans/2026-11-09-giam-tai-2/do-cuoc-goi.md', lines.join('\n') + '\n');
} finally { await db.close(); }
