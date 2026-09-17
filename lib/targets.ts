import { env } from 'cloudflare:workers';

export type TargetRow = { scope: 'pos' | 'employee'; refId: string; revenue: number; closedOrders: number; updatedAt: string };
/** Mục tiêu của một tháng (YYYY-MM). */
export async function listTargets(month: string): Promise<TargetRow[]> {
  const rows = await env.DB.prepare('SELECT scope,ref_id,revenue,closed_orders,updated_at FROM targets WHERE month=?').bind(month)
    .all<{ scope: 'pos' | 'employee'; ref_id: string; revenue: number; closed_orders: number; updated_at: string }>();
  return rows.results.map((r) => ({ scope: r.scope, refId: r.ref_id, revenue: Number(r.revenue), closedOrders: Number(r.closed_orders), updatedAt: r.updated_at }));
}
