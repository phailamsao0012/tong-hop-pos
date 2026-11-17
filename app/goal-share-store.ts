'use client';

// Chia mục tiêu KPI theo POS đang chọn (quy tắc POS, anh Vũ 12/11/2026, câu 2 chọn A). Chọn đủ mọi POS thì mục tiêu giữ nguyên.
import { useMemo } from 'react';
import { POS } from '@/lib/shared/report-model';
import { shareOf, type GoalShare } from '@/lib/kpi/goal-share-calc';
import { usePosIds } from './pos-store';
import { useApi } from './use-api';

export const GOAL_SHARE_NOTE = 'mục tiêu đã chia theo POS';

export function useGoalShare(month: string) {
  const [posIds] = usePosIds();
  const active = posIds.length > 0 && posIds.length < POS.length;
  const { data } = useApi<GoalShare>(active ? `/api/targets/pos-share?${new URLSearchParams({ month, posIds: posIds.join(',') })}` : null, { keep: true });
  return useMemo(() => {
    const on = active && !!data;
    const scale = (goal: number, ids: string[]) => (on ? Math.round(goal * shareOf(data, ids)) : goal);
    const note = on ? `${GOAL_SHARE_NOTE} (${data.empPos ? 'theo KPI đặt cho từng POS; người chưa có thì theo tỉ lệ' : 'theo tỉ lệ'} doanh thu tháng ${Number(data.prevMonth.slice(5))}/${data.prevMonth.slice(0, 4)} của từng POS)` : null;
    return { active: on, scale, note };
  }, [active, data]);
}
