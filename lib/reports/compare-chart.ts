export type CompareChartCell = {
  closed: number;
  closedNet: number;
  created: number;
  createdClosed: number;
};
export type CompareChartPoint = {
  closed: number;
  closedNet: number;
  closeRate: number | null;
  cumClosed: number;
  cumClosedNet: number;
};
export type CompareChart = {
  len: number;
  current: (CompareChartPoint | null)[];
  previous: (CompareChartPoint | null)[];
};

/** Dùng giờ của lần trả API, kể cả khi bản nhớ vắt qua đầu giờ. */
export const compareChartCut = (bucket: 'hour' | 'day', cutoff: string | null) =>
  bucket === 'hour' && cutoff ? Number(cutoff.slice(0, 2)) + 1 : null;

/** Gộp và cộng dồn như CompareStrip. Chuỗi từng người đã gộp thì truyền group = 1. */
export function buildCompareChart(
  current: readonly CompareChartCell[],
  previous: readonly CompareChartCell[],
  options: { bucket: 'hour' | 'day'; group: number; cutoff: string | null },
): CompareChart {
  const group = options.bucket === 'day' ? Math.max(1, options.group) : 1;
  const pack = (points: readonly CompareChartCell[]) =>
    Array.from({ length: Math.ceil(points.length / group) }, (_, i) =>
      points.slice(i * group, (i + 1) * group).reduce(
        (sum, p) => ({
          closed: sum.closed + p.closed,
          closedNet: sum.closedNet + p.closedNet,
          created: sum.created + p.created,
          createdClosed: sum.createdClosed + p.createdClosed,
        }),
        { closed: 0, closedNet: 0, created: 0, createdClosed: 0 },
      ),
    );
  const now = pack(current), before = pack(previous);
  const len = options.bucket === 'hour' ? 24 : Math.max(now.length, before.length);
  const cut = compareChartCut(options.bucket, options.cutoff);
  const side = (points: CompareChartCell[]): (CompareChartPoint | null)[] => {
    let cumClosed = 0, cumClosedNet = 0;
    return Array.from({ length: len }, (_, i) => {
      const p = points[i];
      if (!p || (cut !== null && i >= cut)) return null;
      cumClosed += p.closed;
      cumClosedNet += p.closedNet;
      return {
        closed: p.closed,
        closedNet: p.closedNet,
        closeRate: p.created ? Math.min(p.created, p.createdClosed) / p.created * 100 : null,
        cumClosed,
        cumClosedNet,
      };
    });
  };
  return { len, current: side(now), previous: side(before) };
}
