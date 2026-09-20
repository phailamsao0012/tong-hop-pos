'use client';

// Nhãn nhỏ cạnh tiêu đề trang: đang hiện số lưu từ lần trước (kèm giờ) trong lúc máy chủ trả số mới.
import { Clock, RotateCw } from 'lucide-react';
import { timeOnly } from './ui-kit';

export function StaleChip({ stale, at, loading, error, onRetry, className = '' }: { stale: boolean; at: string | null; loading: boolean; error?: string | null; onRetry?: () => void; className?: string }) {
  if (error && !loading) {
    return (
      <span className={`notice error inline-flex items-center gap-2 px-2.5 py-1 text-[11.5px] ${className}`} role="status">
        <span>{stale && at ? `Đang hiện số lúc ${timeOnly(at)} · lần cập nhật gần nhất lỗi (${error})` : `Không tải được (${error})`}</span>
        {onRetry && <button type="button" className="btn sm" onClick={onRetry}><RotateCw size={11} />Thử lại</button>}
      </span>
    );
  }
  if (!stale || !at) return null;
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border border-line bg-surface-2 px-2.5 py-1 text-[11.5px] text-ink-2 ${className}`} role="status" aria-live="polite">
      <Clock size={11} className="shrink-0" /><span className="num">Số lúc {timeOnly(at)}</span>
      {loading && <span className="inline-flex items-center gap-1"><span className="skel inline-block h-2 w-2 rounded-full" aria-hidden="true" />đang cập nhật…</span>}
    </span>
  );
}
