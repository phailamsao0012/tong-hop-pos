// Giá và phần gói Workers Paid (5 USD/tháng), dùng chung cho canh gác (lib/watch-core.ts) và workflow canh-chi-phi (scripts/cf-usage.mjs).
// Không import gì để script Node chạy thẳng được.
export const CF_INCLUDED = { reads: 25e9, writes: 50e6, storageBytes: 5e9, requests: 10e6, cpuMs: 30e6, planUsd: 5 };
export const CF_PRICE = { reads: 0.001 / 1e6, writes: 1 / 1e6, storageGb: 0.75, requests: 0.3 / 1e6, cpuMs: 0.02 / 1e6 };
/** Tiền dự tính cả kỳ (USD): 5 USD gói + phần vượt từng khoản. */
export function cfEstimate(u: { projReads: number; projWrites: number; storageBytes: number; projRequests: number; projCpuMs: number }) {
  const over = (v: number, inc: number) => Math.max(0, v - inc);
  return CF_INCLUDED.planUsd + over(u.projReads, CF_INCLUDED.reads) * CF_PRICE.reads + over(u.projWrites, CF_INCLUDED.writes) * CF_PRICE.writes
    + over(u.storageBytes, CF_INCLUDED.storageBytes) / 1e9 * CF_PRICE.storageGb + over(u.projRequests, CF_INCLUDED.requests) * CF_PRICE.requests
    + over(u.projCpuMs, CF_INCLUDED.cpuMs) * CF_PRICE.cpuMs;
}
