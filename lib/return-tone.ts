/** Tỷ lệ phần trăm: từ 5% cảnh báo, từ 7% màu đỏ. */
export function returnTone(rate: number | null): 'red' | 'amber' | 'none' {
  return rate !== null && rate >= 7 ? 'red' : rate !== null && rate >= 5 ? 'amber' : 'none';
}
