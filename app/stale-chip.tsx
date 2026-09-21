'use client';

// Nhãn nhỏ cạnh tiêu đề trang: đang hiện số lưu từ lần trước (kèm giờ) trong lúc máy chủ trả số mới.
import { Check, Clock, LoaderCircle, RotateCw } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { timeOnly } from './ui-kit';

const DONE_MS = 6000;

export function StaleChip({ stale, at, loading, error, onRetry, className = '' }: { stale: boolean; at: string | null; loading: boolean; error?: string | null; onRetry?: () => void; className?: string }) {
  // Vừa có số mới (chuyển từ "số cũ · đang cập nhật" sang số mới): báo xanh "Đã cập nhật" 6 giây rồi ẩn.
  const wasStale = useRef(false);
  const [doneAt, setDoneAt] = useState<string | null>(null);
  useEffect(() => {
    if (stale) { wasStale.current = true; return; }
    if (!wasStale.current || loading || !at) return;
    wasStale.current = false;
    setDoneAt(at);
    const t = window.setTimeout(() => setDoneAt(null), DONE_MS);
    return () => window.clearTimeout(t);
  }, [stale, loading, at]);
  if (error && !loading) {
    return (
      <span className={`notice error inline-flex items-center gap-2 px-2.5 py-1 text-[11.5px] ${className}`} role="status">
        <span>{stale && at ? `Đang hiện số lúc ${timeOnly(at)} · lần cập nhật gần nhất lỗi (${error})` : `Không tải được (${error})`}</span>
        {onRetry && <button type="button" className="btn sm" onClick={onRetry}><RotateCw size={11} />Thử lại</button>}
      </span>
    );
  }
  if (!stale || !at) {
    if (doneAt && !loading) {
      return (
        <span className={`refresh-chip done ${className}`} role="status" aria-live="polite">
          <Check size={12} className="shrink-0" aria-hidden="true" />Đã cập nhật lúc <span className="num">{timeOnly(doneAt)}</span> · số mới nhất
        </span>
      );
    }
    return null;
  }
  if (loading) {
    return (
      <span className={`refresh-chip busy ${className}`} role="status" aria-live="polite">
        <LoaderCircle size={12} className="shrink-0 animate-spin" aria-hidden="true" />Đang hiện số lúc <span className="num">{timeOnly(at)}</span> · đang lấy số mới nhất…
      </span>
    );
  }
  return (
    <span className={`refresh-chip ${className}`} role="status" aria-live="polite">
      <Clock size={12} className="shrink-0" aria-hidden="true" />Số lúc <span className="num">{timeOnly(at)}</span>
    </span>
  );
}
