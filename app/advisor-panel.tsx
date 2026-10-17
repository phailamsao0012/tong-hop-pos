'use client';
import { usePeriod } from './period-store';
import { usePosIds } from './pos-store';
import { useTeam, useHrUnit, useBranch, useMktTeam, withUnit, unitFor } from './team-store';
import { useApi } from './use-api';
import type { AdvisorReport } from '@/lib/advisor';
import type { TrendDept } from '@/lib/trend-period';

export function AdvisorPanel({ dept }: { dept?: TrendDept }) {
  const { start, end, preset } = usePeriod();
  const [posIds] = usePosIds();
  const selected = useTeam(), hrUnit = useHrUnit();
  const branch = useBranch(), mkt = useMktTeam();
  const team = dept === 'sale' || dept === 'cskh' ? dept : selected;
  const p = new URLSearchParams({ start, end, preset, posIds: posIds.join(','), team, depts: dept ?? 'sale,cskh,mkt,vandon' });
  if (branch) p.set('branch', branch);
  if (mkt) p.set('mktTeam', mkt.id);
  const url = withUnit(`/api/reports/advisor?${p}`, unitFor(hrUnit, team));
  const { data, error, loading, reload } = useApi<AdvisorReport>(url);
  return <section className="rounded-2xl border border-line bg-white p-4 space-y-3">
    <h2 className="font-semibold text-ink">Dự đoán & khuyến nghị</h2>
    <p className="text-xs text-ink-3">Kỳ {start} – {end} · theo POS, bộ phận, team và chi nhánh đang chọn. Lịch sử tải Sale: 60 ngày đã kết thúc.</p>
    {loading && !data && <p className="text-sm">Đang tính…</p>}
    {error && <button type="button" onClick={reload} className="text-sm underline">Chưa tải được khuyến nghị · Thử lại</button>}
    {data?.items.map((item) => <div key={`${item.dept}:${item.title}`} className="text-sm">
      <p className="font-medium">{item.title}: {item.value}</p>
      <p className="text-xs text-ink-3" title="Cách tính">Vì sao: {item.why}</p>
    </div>)}
    {data?.reasons && <div className="text-sm">
      <p className="font-medium">Lý do không mua · {data.reasons.coverage === null ? 'Chưa đủ số' : `${(data.reasons.coverage * 100).toFixed(1)}% đơn có ghi chú phân loại được`}</p>
      <p className="text-xs text-ink-3">Vì sao: {data.reasons.classified}/{data.reasons.total} đơn. {data.reasonScope}</p>
      {(data.reasons.coverage === null || data.reasons.coverage < 0.3) && <p className="text-xs text-ink-3">Ít ghi chú, kết quả chỉ tham khảo.</p>}
      {data.reasons.groups.map((g) => <p key={g.reason}>{g.reason}: {g.count} đơn</p>)}
    </div>}
  </section>;
}
