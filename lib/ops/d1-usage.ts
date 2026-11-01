export const CYCLE_START_DAY = 17;
export type UsageDay = { day: string; writes: number; stages: Record<string, number>; sizeBytes: number | null };
const date = (day: string) => new Date(`${day}T00:00:00Z`);
const iso = (d: Date) => d.toISOString().slice(0, 10);

export function addUsage(history: UsageDay[], day: string, stages: Record<string, number>, sizeBytes: number | null): UsageDay[] {
  const rows = history.map((r) => ({ ...r, stages: { ...r.stages } }));
  let row = rows.find((r) => r.day === day);
  if (!row) { row = { day, writes: 0, stages: {}, sizeBytes: null }; rows.push(row); }
  for (const [key, value] of Object.entries(stages)) { row.stages[key] = (row.stages[key] ?? 0) + value; row.writes += value; }
  row.sizeBytes = sizeBytes;
  const latest = rows.reduce((a, r) => r.day > a ? r.day : a, day);
  const cutoff = date(latest); cutoff.setUTCDate(cutoff.getUTCDate() - 44);
  return rows.filter((r) => r.day >= iso(cutoff)).sort((a, b) => a.day.localeCompare(b.day));
}

export function cycleOf(dayUtc: string) {
  const d = date(dayUtc);
  const start = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - (d.getUTCDate() < CYCLE_START_DAY ? 1 : 0), CYCLE_START_DAY));
  const end = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, CYCLE_START_DAY - 1));
  return { start: iso(start), end: iso(end) };
}

export function cycleSummary(history: UsageDay[], today: string) {
  const { start, end } = cycleOf(today);
  const daysElapsed = Math.round((+date(today) - +date(start)) / 86400000) + 1;
  const daysTotal = Math.round((+date(end) - +date(start)) / 86400000) + 1;
  const writes = history.filter((r) => r.day >= start && r.day <= today).reduce((n, r) => n + r.writes, 0);
  const latest = history.filter((r) => r.day <= today).sort((a, b) => b.day.localeCompare(a.day))[0];
  return { start, end, daysElapsed, daysTotal, writes, projected: Math.round(writes / daysElapsed * daysTotal), sizeBytes: latest?.sizeBytes ?? null, included: { writes: 50_000_000, sizeBytes: 5 * 1024 ** 3 } };
}

/** Observe existing D1 results without changing queries or results. */
export function observeD1(db: D1Database, record: (meta: D1Meta) => void): D1Database {
  const collect = (result: D1Result) => { if (result.meta && Number(result.meta.rows_written) > 0) record(result.meta); return result; };
  const originals = new WeakMap<D1PreparedStatement, D1PreparedStatement>();
  const statement = (s: D1PreparedStatement): D1PreparedStatement => new Proxy(s, {
    get(target, key) {
      if (key === 'bind') return (...args: Parameters<D1PreparedStatement['bind']>) => wrap(target.bind(...args));
      if (key === 'run' || key === 'all') return async (...args: unknown[]) => collect(await Reflect.apply(Reflect.get(target, key), target, args));
      const value = Reflect.get(target, key); return typeof value === 'function' ? value.bind(target) : value;
    },
  });
  const wrap = (s: D1PreparedStatement): D1PreparedStatement => {
    const proxy = statement(s); originals.set(proxy, s); return proxy;
  };
  return new Proxy(db, {
    get(target, key) {
      if (key === 'prepare') return (sql: string) => wrap(target.prepare(sql));
      if (key === 'batch') return async (batch: D1PreparedStatement[]) => (await target.batch(batch.map((s) => originals.get(s) ?? s))).map(collect);
      const value = Reflect.get(target, key); return typeof value === 'function' ? value.bind(target) : value;
    },
  });
}
