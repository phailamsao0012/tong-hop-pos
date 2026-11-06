// Phần tính thuần của Xu hướng MKT (không đọc D1): trang trình duyệt (app/mkt-trend-panel.tsx) import file này.
// Tách khỏi mkt-trend.ts vì file đó có import('cloudflare:workers'); bản dev của Vite cố tìm module này cho trình duyệt nên trang Tổng quan MKT không mở được (05/11/2026).
export type Base = { cost: number; phones: number; newOrders: number; newNet: number; coveredNet: number; coveredPhones: number };
export function metrics(x: Base) {
  return { ...x, costShare: x.coveredNet ? x.cost / x.coveredNet * 100 : null, costPerLead: x.coveredPhones ? x.cost / x.coveredPhones : null, closeRate: x.phones ? x.newOrders / x.phones * 100 : null, roas: x.cost ? x.coveredNet / x.cost : null, aov: x.newOrders ? x.newNet / x.newOrders : null };
}
export function trendChartRows(rows: (ReturnType<typeof metrics> & { key: string; partial?: boolean })[], key: keyof ReturnType<typeof metrics>) {
  return rows.map((r, index) => {
    const missingCost = r.partial && r.cost === 0 && ['cost', 'costPerLead', 'roas', 'costShare'].includes(key);
    return { ...r, complete: r.partial ? null : r[key], running: r.partial || rows[index + 1]?.partial ? (missingCost ? null : r[key]) : null };
  });
}
