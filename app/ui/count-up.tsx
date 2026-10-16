'use client';

// Demo 2: show the formatted value immediately, without rolling digits.
const vi = new Intl.NumberFormat('vi-VN');

export function CountUp({ value, format = (n) => vi.format(Math.round(n)), className }: {
  value: number; format?: (n: number) => string; duration?: number; className?: string;
}) {
  return <span className={className}>{format(value)}</span>;
}
