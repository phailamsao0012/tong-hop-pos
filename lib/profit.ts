import { RETURN_FEE_FACTOR } from './order-cost';
import { DELIVERED_CODES, RETURNED_CODES, SENT_CODES, OTHER_LINE } from './shipping-lines';

export type PfOrder = { status: number; net: number; cost: number | null; missing: number | null; fee: number | null; marketerId: string | null; posId: string; lines: string[] };
export type PfCell = { sent: number; delivered: number; returned: number; inTransit: number; inTransitNet: number;
  revenue: number; cogs: number; shipOut: number; shipBack: number; gross: number; missingCost: number; missingFee: number;
  adCost: number | null; afterAds: number | null; roasAfterReturn: number | null; roasClosed: number | null; margin: number | null };
type Options = { adCostByMarketer: Map<string, number>; roasClosedByMarketer: Map<string, number | null>; roasClosedTotal: number | null;
  allPos: boolean; teamOf: (marketerId: string) => string; teamNames: Map<string, string> };
const zero = (): PfCell => ({ sent: 0, delivered: 0, returned: 0, inTransit: 0, inTransitNet: 0, revenue: 0, cogs: 0, shipOut: 0, shipBack: 0,
  gross: 0, missingCost: 0, missingFee: 0, adCost: null, afterAds: null, roasAfterReturn: null, roasClosed: null, margin: null });
const sums = ['sent', 'delivered', 'returned', 'inTransit', 'inTransitNet', 'revenue', 'cogs', 'shipOut', 'shipBack', 'gross', 'missingCost', 'missingFee'] as const;
function add(target: PfCell, source: PfCell, share = 1) { for (const key of sums) target[key] += source[key] * share; }
function get(map: Map<string, PfCell>, id: string) { if (!map.has(id)) map.set(id, zero()); return map.get(id)!; }
function finish(cell: PfCell, cost: number | null, roas: number | null = null) {
  cell.margin = cell.revenue ? cell.gross / cell.revenue * 100 : null;
  cell.adCost = cost; cell.afterAds = cost === null ? null : cell.gross - cost;
  cell.roasAfterReturn = cost ? cell.revenue / cost : null; cell.roasClosed = roas;
  return cell;
}

export function buildProfit(orders: PfOrder[], opts: Options) {
  const total = zero(), pos = new Map<string, PfCell>(), lines = new Map<string, PfCell>(), marketers = new Map<string, PfCell>();
  for (const o of orders) {
    if (!SENT_CODES.includes(o.status)) continue;
    const c = zero(); c.sent = 1; c.missingFee = o.fee === null ? 1 : 0;
    if (o.status === 2) { c.inTransit = 1; c.inTransitNet = o.net; }
    else if (RETURNED_CODES.includes(o.status)) {
      c.returned = 1; c.shipOut = o.fee ?? 0; c.shipBack = c.shipOut * RETURN_FEE_FACTOR;
    } else if (DELIVERED_CODES.includes(o.status)) {
      c.delivered = 1;
      if (o.cost === null || o.missing === null || o.missing !== 0) c.missingCost = 1;
      else { c.revenue = o.net; c.cogs = o.cost; c.shipOut = o.fee ?? 0; }
    }
    c.gross = c.revenue - c.cogs - c.shipOut - c.shipBack;
    add(total, c); add(get(pos, o.posId), c);
    const ls = [...new Set(o.lines.length ? o.lines : [OTHER_LINE])];
    for (const line of ls) add(get(lines, line), c, 1 / ls.length);
    if (o.marketerId) add(get(marketers, o.marketerId), c);
  }
  for (const id of opts.adCostByMarketer.keys()) get(marketers, id);
  const teams = new Map<string, PfCell>(), teamCosts = new Map<string, number>();
  for (const [id, cell] of marketers) {
    const team = opts.teamOf(id); add(get(teams, team), cell);
    teamCosts.set(team, (teamCosts.get(team) ?? 0) + (opts.adCostByMarketer.get(id) ?? 0));
  }
  const byMarketer = [...marketers].map(([marketerId, cell]) => ({ marketerId,
    ...finish(cell, opts.allPos ? opts.adCostByMarketer.get(marketerId) ?? 0 : null, opts.roasClosedByMarketer.get(marketerId) ?? null) }));
  return {
    total: finish(total, opts.allPos ? [...opts.adCostByMarketer.values()].reduce((a, b) => a + b, 0) : null, opts.roasClosedTotal),
    byPos: [...pos].map(([posId, c]) => ({ posId, ...finish(c, null) })),
    byLine: [...lines].map(([line, c]) => ({ line, ...finish(c, null) })),
    byMarketer,
    byTeam: [...teams].map(([teamId, c]) => ({ teamId, label: opts.teamNames.get(teamId) ?? teamId, ...finish(c, opts.allPos ? teamCosts.get(teamId) ?? 0 : null) })),
    warnings: byMarketer.filter((c) => c.roasClosed !== null && c.roasClosed >= 2 && c.afterAds !== null && c.afterAds < 0)
      .map((c) => ({ marketerId: c.marketerId, roasClosed: c.roasClosed!, afterAds: c.afterAds! })),
  };
}
