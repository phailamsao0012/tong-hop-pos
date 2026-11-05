'use client';

// Ô đặt KPI tháng ngay trong trang, thay hộp window.prompt (đánh giá giao diện điện thoại 21/10/2026: hộp hỏi của trình duyệt
// che trang, không ghi được đơn vị, gõ "500.000.000" bị bỏ qua). Lưu vẫn qua /api/targets như cũ; ô này chỉ đọc số người nhập.
import { useId, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { parseRate } from '@/lib/kpi/kpi-pace';
import { parseMoney } from './targets-panel';
import { vi } from './ui-kit';

export function KpiInlineEditor({ withRate, rateHint, initialRevenue, initialRate, onSave, onCancel }: {
  /** Có ô tỉ lệ chốt mục tiêu (%) không (Sale có, CSKH chỉ doanh số). */ withRate: boolean;
  /** Chữ gợi ý dưới ô tỉ lệ, vd "bỏ trống nếu là CSKH". */ rateHint?: string;
  initialRevenue?: number | null; initialRate?: number | null;
  /** Trả về khi đã lưu xong (hoặc đã báo lỗi); ô tự mở khoá nút. */ onSave: (revenue: number, closeRate: number | null) => Promise<void> | void;
  onCancel: () => void;
}) {
  const [revenue, setRevenue] = useState(initialRevenue ? vi.format(initialRevenue) : '');
  const [rate, setRate] = useState(initialRate === null || initialRate === undefined ? '' : String(initialRate).replace('.', ','));
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const id = useId();
  const submit = async () => {
    if (!/\d/.test(revenue)) { setError('Nhập doanh thu KPI (vd 500.000.000 hoặc 500tr).'); return; }
    if (withRate && rate.trim() && parseRate(rate) === null) { setError('Tỉ lệ chốt là số lớn hơn 0, tối đa 100.'); return; }
    setError(''); setBusy(true);
    try { await onSave(parseMoney(revenue), withRate ? parseRate(rate) : null); } finally { setBusy(false); }
  };
  return (
    <form onSubmit={(event) => { event.preventDefault(); void submit(); }} className="flex flex-wrap items-end justify-end gap-2 text-left">
      <label htmlFor={`${id}-revenue`} className="grid gap-1 text-xs text-ink-3">Doanh thu KPI tháng (₫)
        <Input id={`${id}-revenue`} inputMode="decimal" value={revenue} onChange={(event) => setRevenue(event.target.value)} placeholder="vd 500tr" className="h-9 w-36" />
      </label>
      {withRate && (
        <label htmlFor={`${id}-rate`} className="grid gap-1 text-xs text-ink-3">Tỉ lệ chốt mục tiêu (%)
          <Input id={`${id}-rate`} inputMode="decimal" value={rate} onChange={(event) => setRate(event.target.value)} placeholder="vd 30" className="h-9 w-24" />
        </label>
      )}
      <Button type="submit" className="h-9" disabled={busy}>{busy ? 'Đang lưu…' : 'Lưu'}</Button>
      <Button type="button" variant="ghost" className="h-9" disabled={busy} onClick={onCancel}>Huỷ</Button>
      {(error || (withRate && rateHint)) && <p role={error ? 'alert' : undefined} className={`w-full text-right text-xs ${error ? 'text-bad' : 'text-ink-3'}`}>{error || rateHint}</p>}
    </form>
  );
}
