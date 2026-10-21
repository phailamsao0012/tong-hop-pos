/** Tỷ lệ phần trăm: từ 7% đỏ, từ 5% vàng, dưới 5% xanh (anh Vũ 21/10/2026). */
export function returnTone(rate: number | null): 'red' | 'amber' | 'green' | 'none' {
  return rate === null ? 'none' : rate >= 7 ? 'red' : rate >= 5 ? 'amber' : 'green';
}
