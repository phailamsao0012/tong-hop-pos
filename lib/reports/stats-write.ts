// Câu ghi dùng chung cho các bảng tính sẵn theo ngày (stats_daily*, stats_daily_mkt).
type Row = Record<string, string | number | null>;

/** Ghi một dòng theo khóa (id = các giá trị khóa nối bằng ':'); dòng không đổi thì không ghi. */
export function upsertStatement(
  db: D1Database,
  table: string,
  key: Record<string, string>,
  values: Record<string, number | string>,
  now: string,
) {
  const cols = [...Object.keys(key), ...Object.keys(values), 'updated_at'];
  const valueCols = Object.keys(values);
  return db
    .prepare(
      `INSERT INTO ${table} (id,${cols.join(',')}) VALUES (?${cols.map(() => ',?').join('')})
     ON CONFLICT(id) DO UPDATE SET ${valueCols.map((c) => `${c}=excluded.${c}`).join(',')},updated_at=excluded.updated_at
     WHERE ${valueCols.map((c) => `${table}.${c} IS NOT excluded.${c}`).join(' OR ')}`,
    )
    .bind(
      Object.values(key).join(':'),
      ...Object.values(key),
      ...Object.values(values),
      now,
    );
}

/** Chạy câu ghi theo lô 100, trả về số dòng ghi. */
export async function run(db: D1Database, statements: D1PreparedStatement[]) {
  let writes = 0;
  for (let i = 0; i < statements.length; i += 100) {
    const results = await db.batch(statements.slice(i, i + 100));
    for (const r of results) writes += Number(r.meta?.rows_written ?? 0);
  }
  return writes;
}

/** Câu ghi cho một khoảng ngày của bảng tính sẵn: so với dòng đang có (cột id + valueCols), chỉ ghi dòng mới / đổi và xóa dòng
 *  không còn. Mỗi lượt đồng bộ phần lớn dòng không đổi nên gần như không tốn lượt ghi. */
export function diffStatements(
  db: D1Database,
  table: string,
  keyOf: (r: Row) => Record<string, string>,
  valueCols: readonly string[],
  range: { start: string; end: string },
  rows: Row[],
  existing: Row[],
  now: string,
) {
  const statements: D1PreparedStatement[] = [];
  const old = new Map(existing.map((r) => [String(r.id), r]));
  const keep = new Set<string>();
  for (const r of rows) {
    const day = String(r.day);
    if (day < range.start || day > range.end) continue;
    const key = keyOf(r);
    const id = Object.values(key).join(':');
    keep.add(id);
    const values = Object.fromEntries(
      valueCols.map((c) => [c, Number(r[c] ?? 0)]),
    );
    const prev = old.get(id);
    if (prev && valueCols.every((c) => Number(prev[c] ?? 0) === values[c]))
      continue;
    statements.push(upsertStatement(db, table, key, values, now));
  }
  const gone = [...old.keys()].filter((id) => !keep.has(id));
  for (let i = 0; i < gone.length; i += 500)
    statements.push(
      db
        .prepare(
          `DELETE FROM ${table} WHERE id IN (SELECT value FROM json_each(?))`,
        )
        .bind(JSON.stringify(gone.slice(i, i + 500))),
    );
  return statements;
}
