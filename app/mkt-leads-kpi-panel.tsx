'use client';
// KPI số đưa về của Marketing (anh Vũ 14/11/2026): đặt theo tháng hoặc theo ngày (theo ngày thì nhân đúng số ngày của tháng),
// cho cả bộ phận, từng team MKT, từng marketer. Lưu ở /api/kpi2 (trường leads, khoá "dept:mkt" / "team:<mã>" / "employee:<mã POS>").
// Báo cáo sếp qua Zalo đọc KPI này. Chỉ chủ hệ thống sửa; người khác chỉ xem.
import { useEffect, useId, useMemo, useState } from 'react';
import { Megaphone, Save } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { daysInMonthOf } from '@/lib/kpi/kpi-day';
import type { Kpi2, Kpi2Map } from '@/lib/kpi/kpi2';
import { apiJson } from './api-fetch';
import { ChartCard, ErrorBox, SkeletonTable, toast, vi } from './ui-kit';

type Team = { id: string; name: string; memberIds: string[] };
type TeamsResp = { teams: Team[]; people: { id: string; name: string }[] };
type Kpi2Resp = { items: Kpi2Map };
const mmyyyy = (m: string) => `${m.slice(5)}/${m.slice(0, 4)}`;
const parseCount = (v: string) => { const n = Number(v.replace(/[.\s]/g, '').replace(',', '.')); return Number.isFinite(n) && n > 0 ? Math.round(n) : undefined; };

export function MktLeadsKpiPanel({ month, owner }: { month: string; owner: boolean }) {
  const uid = useId(), days = daysInMonthOf(month);
  const [teams, setTeams] = useState<TeamsResp | null>(null);
  const [kpi, setKpi] = useState<Kpi2Map | null>(null);
  const [err, setErr] = useState('');
  const [reload, setReload] = useState(0);
  const [perDay, setPerDay] = useState(true);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let live = true;
    void Promise.all([apiJson<TeamsResp>('/api/marketing-teams'), apiJson<Kpi2Resp>(`/api/kpi2?month=${month}`)])
      .then(([t, k]) => { if (live) { setTeams(t); setKpi(k.items); setErr(''); } })
      .catch((e: Error) => { if (live) setErr(e.message); });
    return () => { live = false; };
  }, [month, reload]);
  const nameOf = useMemo(() => new Map((teams?.people ?? []).map((p) => [p.id, p.name])), [teams]);
  const monthly = (key: string) => kpi?.[key]?.leads;
  const shown = (key: string) => {
    if (draft[key] !== undefined) return draft[key];
    const v = monthly(key);
    return v ? vi.format(perDay ? Math.round(v / days) : v) : '';
  };
  const save = async () => {
    const keys = Object.keys(draft);
    if (!keys.length || !kpi) return;
    setBusy(true);
    try {
      const items = keys.map((key) => {
        const n = parseCount(draft[key]);
        const value: Kpi2 = { ...kpi[key] };
        if (n) value.leads = perDay ? n * days : n; else delete value.leads;
        return { key, value };
      });
      const saved = await apiJson<Kpi2Resp>('/api/kpi2', 'PUT', { month, items });
      setKpi(saved.items); setDraft({});
      toast(`Đã lưu KPI số MKT tháng ${mmyyyy(month)}`);
    } catch (e) { toast((e as Error).message, { kind: 'error' }); } finally { setBusy(false); }
  };
  const row = (key: string, label: string, strong = false) => {
    const id = `${uid}-${key}`, v = monthly(key);
    return (
      <div key={key} className="grid grid-cols-[minmax(0,1fr)_7rem_minmax(0,9rem)] items-center gap-2">
        <label htmlFor={id} className={`truncate text-[13px] ${strong ? 'font-semibold' : ''}`}>{label}</label>
        {owner
          ? <Input id={id} className="num h-8 px-2 text-right text-[13px]" inputMode="numeric" value={shown(key)} placeholder={perDay ? 'số/ngày' : 'số/tháng'}
              onChange={(e) => setDraft((d) => ({ ...d, [key]: e.target.value }))} />
          : <p id={id} className="num text-right text-[13px] font-semibold">{v ? vi.format(perDay ? Math.round(v / days) : v) : '—'}</p>}
        <span className="num text-right text-[11px] text-ink-3">{v ? `${vi.format(v)} số/tháng · ${vi.format(Math.round(v / days))}/ngày` : 'chưa đặt'}</span>
      </div>
    );
  };
  return (
    <ChartCard icon={Megaphone} title={`KPI số đưa về Marketing tháng ${mmyyyy(month)}`}
      subtitle={`Đặt theo ngày thì tự nhân ${days} ngày của tháng. Bộ phận để trống thì cộng các team; team để trống thì cộng từng người.`}
      action={(
        <fieldset data-ui="pill-group" className="flex gap-1.5">
          <legend className="sr-only">Nhập theo</legend>
          <button type="button" aria-pressed={perDay} className={`btn sm tap ${perDay ? 'primary' : ''}`} onClick={() => { setPerDay(true); setDraft({}); }}>Theo ngày</button>
          <button type="button" aria-pressed={!perDay} className={`btn sm tap ${!perDay ? 'primary' : ''}`} onClick={() => { setPerDay(false); setDraft({}); }}>Theo tháng</button>
        </fieldset>
      )}>
      {err ? <ErrorBox error={err} onRetry={() => { setErr(''); setReload((k) => k + 1); }} />
        : !teams || !kpi ? <SkeletonTable rows={4} cols={3} />
        : (
          <div className="space-y-3">
            {row('dept:mkt', 'Cả bộ phận Marketing', true)}
            {teams.teams.map((t) => (
              <details key={t.id} data-ui="tile" className="rounded-xl border border-line bg-surface p-3">
                <summary className="cursor-pointer text-sm font-semibold">{t.name} <span className="text-[11px] font-normal text-ink-3">· {t.memberIds.length} người</span></summary>
                <div className="mt-2 space-y-1.5">
                  {row(`team:${t.id}`, `Cả team ${t.name}`, true)}
                  {t.memberIds.map((m) => row(`employee:${m}`, nameOf.get(m) ?? `NV ${m.slice(0, 8)}`))}
                </div>
              </details>
            ))}
            {owner && (
              <div className="flex flex-wrap gap-2">
                <button type="button" className="btn primary" disabled={!Object.keys(draft).length || busy} onClick={() => void save()}><Save size={14} />{busy ? 'Đang lưu…' : 'Lưu KPI số'}</button>
                {Object.keys(draft).length > 0 && <button type="button" className="btn" disabled={busy} onClick={() => setDraft({})}>Bỏ thay đổi</button>}
              </div>
            )}
          </div>
        )}
    </ChartCard>
  );
}
