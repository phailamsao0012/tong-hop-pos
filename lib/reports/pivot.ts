export type PivotEntry<T> = { row: string; rowLabel: string; col: string; colLabel: string; data: T };

/** Giữ ô thiếu là null; tổng được tính từ dữ liệu gốc, kể cả chỉ số tỷ lệ. */
export function buildPivot<T>(entries: PivotEntry<T>[], value: (items: T[]) => number | null) {
  const rows = new Map<string, string>(), cols = new Map<string, string>();
  const cells = new Map<string, Map<string, T[]>>(), rowItems = new Map<string, T[]>(), colItems = new Map<string, T[]>();
  for (const e of entries) {
    rows.set(e.row, e.rowLabel); cols.set(e.col, e.colLabel);
    if (!cells.has(e.row)) cells.set(e.row, new Map());
    const row = cells.get(e.row)!;
    if (!row.has(e.col)) row.set(e.col, []);
    row.get(e.col)!.push(e.data);
    if (!rowItems.has(e.row)) rowItems.set(e.row, []);
    rowItems.get(e.row)!.push(e.data);
    if (!colItems.has(e.col)) colItems.set(e.col, []);
    colItems.get(e.col)!.push(e.data);
  }
  const columns = [...cols].sort(([a], [b]) => a.localeCompare(b)).map(([key, label]) => ({ key, label }));
  return {
    columns,
    rows: [...rows].map(([key, label]) => ({ key, label, values: columns.map((c) => { const items = cells.get(key)?.get(c.key); return items ? value(items) : null; }), total: value(rowItems.get(key)!) })),
    totals: columns.map((c) => value(colItems.get(c.key)!)),
    total: entries.length ? value(entries.map((e) => e.data)) : null,
  };
}

export function pivotBucket(day: string, dim: 'day' | 'week' | 'month') {
  if (dim === 'month') return day.slice(0, 7);
  if (dim === 'day') return day;
  const date = new Date(day + 'T00:00:00Z');
  date.setUTCDate(date.getUTCDate() - (date.getUTCDay() + 6) % 7);
  return date.toISOString().slice(0, 10);
}
