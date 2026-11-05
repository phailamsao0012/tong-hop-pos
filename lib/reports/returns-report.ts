// Tách khỏi app/api/reports/returns/route.ts (cải tổ B4, 05/11/2026): chỉ dời chỗ, câu SQL và số liệu giữ nguyên.
import { env } from 'cloudflare:workers';
import type { Team } from '@/lib/teams/team';
import { returnsQuery, packReturns, type ReturnOrder, type ReturnsReport } from '@/lib/reports/return-reasons';
const cache = new Map<string, { at: number; report: ReturnsReport }>();

/** Lý do hoàn theo bộ lọc, nhớ 10 phút theo `key` (route dựng từ người xem và bộ lọc). */
export async function returnsReport(key: string, posIds: string[], start: string, end: string, team: Team): Promise<ReturnsReport> {
  let entry = cache.get(key);
  if (!entry || Date.now()-entry.at>=600000) {
    const query = returnsQuery(posIds,start,end,team);
    const result = await env.DB.prepare(query.sql).bind(...query.binds).all<ReturnOrder>();
    entry = { at:Date.now(), report:packReturns(result.results) };
    if (cache.size>=80) cache.delete(cache.keys().next().value!);
    cache.set(key,entry);
  }
  return entry.report;
}
