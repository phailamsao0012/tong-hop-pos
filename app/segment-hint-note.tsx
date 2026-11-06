'use client';

// Trang chưa có bộ lọc nhóm đơn (Marketing, Chi phí & ROAS, Vận đơn): bấm số ở Tổng quan POS khi đang lọc nhóm thì báo rõ số ở đây
// là mọi nhóm, để không tưởng nhầm hai số phải bằng nhau (đánh giá 21/10/2026). Có thêm bộ lọc nhóm cho các trang này hay không: chờ anh Vũ quyết.
import { useState } from 'react';
import { PRODUCT_SEGMENTS } from '@/lib/pancake/order-segments';
import { SEGMENT_HINT, segmentFromHint } from '@/lib/shared/drill-hint';
import { takeNavHint } from './nav-focus';

export function SegmentHintNote() {
  const [segment, setSegment] = useState(() => segmentFromHint(takeNavHint(SEGMENT_HINT)));
  if (!segment) return null;
  return (
    <output className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border border-warn/30 bg-warn-bg px-3 py-2 text-[13px] text-ink">
      <span>Ở Tổng quan POS đang lọc nhóm đơn <b>{PRODUCT_SEGMENTS[segment]}</b>. Trang này chưa có bộ lọc nhóm đơn nên số ở đây tính mọi nhóm.</span>
      <button type="button" className="link" onClick={() => setSegment(null)}>Đã hiểu</button>
    </output>
  );
}
