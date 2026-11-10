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

// Ô gọn của Xu hướng MKT (anh chọn "Thu gọn 1 hàng" 06/11/2026): đường nhỏ 14 đoạn đã đủ gần nhất,
// đoạn đủ cuối so đoạn đủ ngay trước (bỏ đoạn đang chạy để không so nửa ngày với cả ngày).
export function trendTile(rows: (ReturnType<typeof metrics> & { key: string; partial?: boolean })[], key: keyof ReturnType<typeof metrics>) {
  const done = rows.filter(r => !r.partial).map(r => ({ key: r.key, value: r[key] }));
  const spark = done.slice(-14).map(r => r.value);
  const last = done.at(-1) ?? null, prev = done.at(-2) ?? null;
  const change = last?.value != null && prev?.value != null && prev.value !== 0 ? (last.value - prev.value) / Math.abs(prev.value) * 100 : null;
  return { spark, lastKey: last?.key ?? null, last: last?.value ?? null, prevKey: prev?.key ?? null, prev: prev?.value ?? null, change };
}
