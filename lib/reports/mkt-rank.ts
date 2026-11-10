export const RANK_STAGES = ['confirmed', 'packed', 'shipped', 'delivered'] as const;
export type RankStage = typeof RANK_STAGES[number];
export type RankRow = {
  rankName: string;
  atConfirmed: number; atPacked: number; atShipped: number; atDelivered: number;
  stageMetrics: Record<RankStage, { orders: number; net: number }> & Partial<Record<MarketingStage, { orders: number; net: number }>>;
};

/** Xếp hạng trong cùng phạm vi lọc; không sửa dữ liệu đầu vào. */
export function rankByStage<T extends RankRow>(rows: readonly T[], stage: MarketingStage) {
  const metrics = (row: T, key: MarketingStage) => row.stageMetrics[key] ?? { orders: 0, net: 0 };
  const ordered = (key: MarketingStage) => [...rows].sort((a, b) =>
    metrics(b, key).orders - metrics(a, key).orders ||
    metrics(b, key).net - metrics(a, key).net ||
    a.rankName.localeCompare(b.rankName, 'vi'));
  const confirmedRanks = new Map(ordered('confirmed').map((row, i) => [row, i + 1]));
  return ordered(stage).map((row, i) => ({
    ...row, rank: i + 1, rankShift: confirmedRanks.get(row)! - i - 1,
    stageRate: row.atConfirmed ? metrics(row, stage).orders / row.atConfirmed * 100 : null,
  }));
}
import type { MarketingStage } from '@/lib/reports/marketing-report';

