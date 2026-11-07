'use client';

// Chỉ tiêu KPI mới của từng team và phần chia cho từng người (anh Vũ 07/11/2026: "giao tổng 1 cái cho cả team, các đầu lead và mentor
// sẽ tự chia"). Sale: số nhận, số chốt, doanh số, số đơn, số lượng sản phẩm. CSKH: doanh số, tỷ lệ tự upsell, số lượng sản phẩm.
// Chủ hệ thống đặt KPI team; Leader / Mentor đặt cho người của mình. Doanh số lưu ở bảng targets như cũ (/api/targets),
// các chỉ tiêu khác ở /api/kpi2. Không dùng bảng kéo ngang: mỗi người một khối ô xuống dòng trên điện thoại.
import { useEffect, useId, useMemo, useState } from 'react';
import { Save, UsersRound } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { parseRate } from '@/lib/kpi/kpi-pace';
import { KPI2_LINES, kpi2Value, periodGoal, splitStatus, type Kpi2, type Kpi2Map } from '@/lib/kpi/kpi2';
import { dayCount, monthDays, monthsBetween, type Period, type SellerRow } from '@/lib/kpi/team-kpi';
import { LINE_LABEL, type LineKey } from '@/lib/reports/mkt-product-split';
import { upsellOf, type UpsellRow } from '@/lib/reports/cskh-upsell';
import { qtyOf, type QtyBySeller } from '@/lib/reports/seller-product-qty';
import { apiJson } from './api-fetch';
import { parseMoney, type TargetItem } from './targets-panel';
import { ChartCard, EmptyState, ErrorBox, SkeletonTable, pct, shortMoney, toast, vi } from './ui-kit';
import { useApi } from './use-api';

type Dept = 'sale' | 'cskh';
export type Kpi2Team = { id: string; name: string; leader: string | null; members: { id: string; name: string }[] };
type Extra = { qty: QtyBySeller; prevQty: QtyBySeller; upsell: UpsellRow[]; prevPeriod: { start: string; end: string; cutoff: string | null } };
type Kpi2Resp = { items: Kpi2Map; editable?: string[] | null };

type Field = { key: string; label: string; kind: 'count' | 'money' | 'rate' };
const FIELDS: Record<Dept, Field[]> = {
  sale: [
    { key: 'assigned', label: 'Số nhận', kind: 'count' }, { key: 'closed', label: 'Số chốt', kind: 'count' },
    { key: 'revenue', label: 'Doanh số', kind: 'money' }, { key: 'orders', label: 'Số đơn', kind: 'count' },
    ...KPI2_LINES.map((l): Field => ({ key: `products.${l}`, label: LINE_LABEL[l], kind: 'count' })),
  ],
  cskh: [
    { key: 'revenue', label: 'Doanh số', kind: 'money' }, { key: 'upsellRate', label: 'Tỷ lệ tự upsell', kind: 'rate' },
    ...KPI2_LINES.map((l): Field => ({ key: `products.${l}`, label: LINE_LABEL[l], kind: 'count' })),
  ],
};
const mmyyyy = (m: string) => `${m.slice(5)}/${m.slice(0, 4)}`;
const fmt = (f: Field, n: number | null | undefined) => (n == null ? '—' : f.kind === 'money' ? shortMoney(n) : f.kind === 'rate' ? pct(n, 1) : vi.format(Math.round(n)));
const parseCount = (v: string) => { const n = Number(v.replace(/[.\s]/g, '').replace(',', '.')); return Number.isFinite(n) && n > 0 ? Math.round(n) : undefined; };

/** Đổi nháp các ô của một người thành chỉ tiêu kpi2 (bỏ doanh số, doanh số lưu ở /api/targets). */
function toKpi2(values: Record<string, string>): Kpi2 {
  const out: Kpi2 = {}, products: Partial<Record<LineKey, number>> = {};
  for (const [k, v] of Object.entries(values)) {
    if (k === 'revenue') continue;
    if (k === 'upsellRate') { const r = parseRate(v); if (r) out.upsellRate = r; continue; }
    const n = parseCount(v);
    if (!n) continue;
    if (k.startsWith('products.')) products[k.slice(9) as LineKey] = n; else (out as Record<string, number>)[k] = n;
  }
  if (Object.keys(products).length) out.products = products;
  return out;
}

export function Kpi2Panel({ dept, teams, rows, period, end, editMonth, owner, targets, onTargets }: {
  dept: Dept; teams: Kpi2Team[]; rows: SellerRow[] | undefined; period: Period; end: string; editMonth: string; owner: boolean;
  /** KPI doanh số các tháng (bảng targets), dùng chung với trang KPI team. */ targets: Record<string, TargetItem[]>;
  onTargets: (month: string, items: TargetItem[]) => void;
}) {
  const uid = useId(), fields = FIELDS[dept], label = dept === 'sale' ? 'Sale' : 'CSKH';
  const months = useMemo(() => monthsBetween(period.start, period.end), [period.start, period.end]);
  const [kpi, setKpi] = useState<Record<string, Kpi2Map>>({});
  const [editable, setEditable] = useState<string[] | null>(null);
  const [err, setErr] = useState('');
  const [reload, setReload] = useState(0);
  const monthsKey = months.join(',');
  useEffect(() => {
    let live = true;
    void Promise.all(monthsKey.split(',').map((m) => apiJson<Kpi2Resp>(`/api/kpi2?month=${m}`).then((b) => [m, b] as const)))
      .then((list) => { if (!live) return; setKpi((x) => ({ ...x, ...Object.fromEntries(list.map(([m, b]) => [m, b.items])) })); setEditable(list[0]?.[1].editable ?? null); setErr(''); })
      .catch((e: Error) => { if (live) setErr(e.message); });
    return () => { live = false; };
  }, [monthsKey, reload]);
  const extra = useApi<Extra>(end >= period.start ? `/api/reports/kpi-extra?${new URLSearchParams({ start: period.start, end })}` : null, { keep: false });

  // Chỉ tiêu tháng của một khoá ("team:x" / "employee:y"), doanh số đọc từ bảng targets.
  const monthValue = (m: string, key: string, field: string) => {
    if (field === 'revenue') { const at = key.indexOf(':'); return targets[m]?.find((t) => t.scope === key.slice(0, at) && t.refId === key.slice(at + 1))?.revenue || undefined; }
    return kpi2Value(kpi[m]?.[key], field);
  };
  const goalOfPeriod = (key: string, f: Field) => periodGoal(months.map((m) => {
    const from = period.start > `${m}-01` ? period.start : `${m}-01`, last = `${m}-${String(monthDays(m)).padStart(2, '0')}`, to = period.end < last ? period.end : last;
    return { month: m, value: monthValue(m, key, f.key), overlap: dayCount(from, to), days: monthDays(m) };
  }), f.kind === 'rate');
  const actual = (ids: string[], f: Field): number | null => {
    if (f.key.startsWith('products.')) return extra.data ? qtyOf(extra.data.qty, ids)[f.key.slice(9) as LineKey] ?? 0 : null;
    if (f.key === 'upsellRate') return extra.data ? upsellOf(extra.data.upsell, ids).rate : null;
    if (!rows) return null;
    const mine = rows.filter((r) => ids.includes(r.sellerId)), sum = (g: (r: SellerRow) => number | undefined) => mine.reduce((a, r) => a + (g(r) ?? 0), 0);
    return f.key === 'assigned' ? sum((r) => r.assignedOrders) : f.key === 'closed' ? sum((r) => r.assignedClosedOrders) : f.key === 'orders' ? sum((r) => r.closedOrders) : sum((r) => r.closedNet);
  };

  // Nháp theo "khoá" → ô → chữ đang gõ.
  const [draft, setDraft] = useState<Record<string, Record<string, string>>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const shown = (key: string, f: Field) => {
    const d = draft[key]?.[f.key];
    if (d !== undefined) return d;
    const v = monthValue(editMonth, key, f.key);
    return v ? (f.kind === 'rate' ? String(v).replace('.', ',') : vi.format(v)) : '';
  };
  const canEdit = (key: string) => owner || (key.startsWith('employee:') && !!editable?.includes(key.slice(9)));
  const save = async (team: Kpi2Team) => {
    const keys = [`team:${team.id}`, ...team.members.map((m) => `employee:${m.id}`)].filter((k) => draft[k] && canEdit(k));
    if (!keys.length) return;
    setBusy(team.id);
    try {
      const all = (k: string) => Object.fromEntries(fields.map((f) => [f.key, shown(k, f)]));
      const saved = await apiJson<Kpi2Resp>('/api/kpi2', 'PUT', { month: editMonth, items: keys.map((k) => ({ key: k, value: toKpi2(all(k)) })) });
      setKpi((x) => ({ ...x, [editMonth]: { ...x[editMonth], ...saved.items } }));
      // Doanh số người: lưu ở bảng targets, giữ phần khác của dòng đó (số đơn, ngày công, tỷ lệ chốt).
      const revKeys = keys.filter((k) => k.startsWith('employee:') && draft[k]?.revenue !== undefined && fields.some((f) => f.key === 'revenue'));
      if (revKeys.length) {
        const items = revKeys.map((k) => {
          const s = targets[editMonth]?.find((t) => t.scope === 'employee' && t.refId === k.slice(9));
          return { scope: 'employee' as const, refId: k.slice(9), revenue: parseMoney(draft[k].revenue), closedOrders: s?.closedOrders ?? 0, workingDays: s?.workingDays ?? null, closeRate: s?.closeRate ?? null };
        });
        const res = await apiJson<{ items: TargetItem[] }>('/api/targets', 'PUT', { month: editMonth, only: revKeys, items });
        onTargets(editMonth, res.items);
      }
      setDraft((d) => Object.fromEntries(Object.entries(d).filter(([k]) => !keys.includes(k))));
      toast(`Đã lưu chỉ tiêu ${team.name} tháng ${mmyyyy(editMonth)}`);
    } catch (e) { toast((e as Error).message, { kind: 'error' }); } finally { setBusy(null); }
  };

  // Hàm thường (không phải component) để ô nhập không bị dựng lại, mất con trỏ khi gõ.
  const cell = (k: string, f: Field, ids: string[]) => {
    const goal = goalOfPeriod(k, f), got = actual(ids, f);
    const p = got !== null && goal ? got / goal * 100 : null;
    const editableHere = canEdit(k) && !(k.startsWith('team:') && f.key === 'revenue');
    const id = `${uid}-${k}-${f.key}`;
    return (
      <div key={f.key} className="min-w-0 rounded-lg bg-surface-2 px-2 py-1.5">
        <label htmlFor={id} className="block truncate text-[11px] text-ink-3">{f.label}</label>
        {editableHere
          ? <Input id={id} className="num mt-0.5 h-7 px-1.5 text-right text-[13px]" inputMode="decimal" value={shown(k, f)} placeholder="KPI tháng"
              onChange={(e) => setDraft((d) => ({ ...d, [k]: { ...d[k], [f.key]: e.target.value } }))} />
          : <p id={id} className="num mt-0.5 text-right text-[13px] font-semibold">{fmt(f, monthValue(editMonth, k, f.key))}</p>}
        <p className="num mt-0.5 text-right text-[11px] text-ink-3">đạt {fmt(f, got)}{p !== null && <span className={p >= 100 ? 'text-good' : 'text-warn'}> · {pct(p, 0)}</span>}</p>
      </div>
    );
  };

  const ready = !err && Object.keys(kpi).length >= months.length && editable !== undefined;
  return (
    <ChartCard icon={UsersRound} title={`Chỉ tiêu team ${label} và chia cho người`} subtitle={`Ô nhập là KPI tháng ${mmyyyy(editMonth)}; "đạt" tính trong kỳ đang chọn, % so KPI quy về kỳ`}>
      {err ? <ErrorBox error={err} onRetry={() => { setErr(''); setReload((k) => k + 1); }} />
        : !ready ? <SkeletonTable rows={3} cols={4} />
        : !teams.length ? <EmptyState text={`Chưa có team ${label} trong phạm vi đang xem.`} />
        : (
          <div className="space-y-3">
            {teams.map((t, i) => {
              const teamKey = `team:${t.id}`, memberKpi = t.members.map((m) => kpi[editMonth]?.[`employee:${m.id}`]);
              const lines = splitStatus(kpi[editMonth]?.[teamKey], memberKpi);
              const revTeam = monthValue(editMonth, teamKey, 'revenue') ?? null, revSplit = t.members.reduce((a, m) => a + (monthValue(editMonth, `employee:${m.id}`, 'revenue') ?? 0), 0);
              const fieldLabel = (key: string) => fields.find((f) => f.key === key)?.label ?? key;
              const dirty = [teamKey, ...t.members.map((m) => `employee:${m.id}`)].some((k) => draft[k]);
              const anyEdit = canEdit(teamKey) || t.members.some((m) => canEdit(`employee:${m.id}`));
              return (
                <details key={t.id} open={i === 0} className="rounded-xl border border-line bg-surface p-3">
                  <summary className="flex cursor-pointer flex-wrap items-baseline justify-between gap-x-2 text-sm font-semibold">
                    <span>{t.name}</span>{t.leader && <span className="text-[11px] font-normal text-ink-3">Leader {t.leader}</span>}
                  </summary>
                  <div className="mt-3 space-y-3">
                    <section>
                      <h5 className="mb-1.5 text-[12px] font-semibold text-ink-2">KPI cả team</h5>
                      <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3 lg:grid-cols-5">{fields.map((f) => cell(teamKey, f, t.members.map((m) => m.id)))}</div>
                      {(lines.length > 0 || (revTeam && fields.some((f) => f.key === 'revenue'))) && (
                        <p className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-ink-3">
                          {fields.some((f) => f.key === 'revenue') && revTeam !== null && <span className={revSplit > revTeam ? 'font-semibold text-bad' : ''}>Doanh số đã chia {shortMoney(revSplit)} / {shortMoney(revTeam)}{revSplit > revTeam ? ' · chia vượt' : ''}</span>}
                          {lines.filter((l) => fields.some((f) => f.key === l.field)).map((l) => (
                            <span key={l.field} className={l.over ? 'font-semibold text-bad' : ''}>{fieldLabel(l.field)} đã chia {vi.format(l.split)} / {l.team === null ? 'chưa đặt' : vi.format(l.team)}{l.over ? ' · chia vượt' : ''}</span>
                          ))}
                        </p>
                      )}
                    </section>
                    {t.members.map((m) => (
                      <section key={m.id}>
                        <h5 className="mb-1.5 text-[12px] font-semibold text-ink-2">{m.name}</h5>
                        <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3 lg:grid-cols-5">{fields.map((f) => cell(`employee:${m.id}`, f, [m.id]))}</div>
                      </section>
                    ))}
                    {anyEdit && (
                      <div className="flex flex-wrap gap-2">
                        <button type="button" className="btn primary" disabled={!dirty || busy !== null} onClick={() => void save(t)}><Save size={14} />{busy === t.id ? 'Đang lưu…' : `Lưu chỉ tiêu ${t.name}`}</button>
                        {dirty && <button type="button" className="btn" disabled={busy !== null} onClick={() => setDraft((d) => Object.fromEntries(Object.entries(d).filter(([k]) => k !== teamKey && !t.members.some((mm) => k === `employee:${mm.id}`))))}>Bỏ thay đổi</button>}
                      </div>
                    )}
                  </div>
                </details>
              );
            })}
          </div>
        )}
    </ChartCard>
  );
}

/** Bảng số lượng sản phẩm tháng này của Sale / CSKH, so cùng mốc kỳ trước, để cân nên bán gì. */
export function ProductQtyCard({ dept, teams, period, end }: { dept: Dept; teams: Kpi2Team[]; period: Period; end: string }) {
  const extra = useApi<Extra>(end >= period.start ? `/api/reports/kpi-extra?${new URLSearchParams({ start: period.start, end })}` : null, { keep: false });
  const label = dept === 'sale' ? 'Sale' : 'CSKH';
  const ids = teams.flatMap((t) => t.members.map((m) => m.id));
  const lines: LineKey[] = [...KPI2_LINES, 'khac'];
  const cur = extra.data ? qtyOf(extra.data.qty, ids) : null, prev = extra.data ? qtyOf(extra.data.prevQty, ids) : null;
  const sorted = cur ? [...lines].sort((a, b) => (cur[b] ?? 0) - (cur[a] ?? 0)) : lines;
  const max = cur ? Math.max(1, ...lines.map((l) => cur[l] ?? 0)) : 1;
  const pp = extra.data?.prevPeriod;
  return (
    <ChartCard icon={UsersRound} title={`Số lượng sản phẩm ${label} bán`} subtitle={pp ? `Hộp / chai trên đơn chốt, so ${pp.start.slice(8)}/${pp.start.slice(5, 7)} – ${pp.end.slice(8)}/${pp.end.slice(5, 7)}${pp.cutoff ? ` tới ${pp.cutoff}` : ''}` : undefined}>
      {extra.error && !extra.data ? <ErrorBox error={extra.error} onRetry={extra.reload} /> : !cur || !prev ? <SkeletonTable rows={4} cols={3} /> : (
        <ul className="space-y-2">
          {sorted.map((l) => {
            const c = cur[l] ?? 0, p = prev[l] ?? 0, d = p ? (c - p) / p * 100 : null;
            return (
              <li key={l} className="grid grid-cols-[7.5rem_minmax(0,1fr)_auto] items-center gap-2 text-[13px]">
                <span className="truncate">{LINE_LABEL[l]}</span>
                <span className="h-2 overflow-hidden rounded-full bg-surface-2"><i className="block h-full rounded-full bg-primary" style={{ width: `${c / max * 100}%` }} /></span>
                <span className="num text-right"><b>{vi.format(c)}</b> <span className="text-[11px] text-ink-3">trước {vi.format(p)}{d !== null && <span className={d >= 0 ? 'text-good' : 'text-bad'}> {d >= 0 ? '+' : '−'}{pct(Math.abs(d), 0)}</span>}</span></span>
              </li>
            );
          })}
        </ul>
      )}
    </ChartCard>
  );
}
