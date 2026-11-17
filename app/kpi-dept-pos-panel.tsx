'use client';

// Cài đặt › Mục tiêu & chỉ số (anh Vũ 12/11/2026):
// 1. KPI bộ phận × POS theo tháng (Sale / CSKH / MKT trên từng POS), nhập theo triệu đồng. Lưu bằng PUT /api/targets với `only` từng khoá,
//    nên không đụng KPI khác của tháng. MKT tính trên DT New.
// 2. Ngày lễ cố định trong năm (dương hoặc âm lịch), chỉ để đánh dấu; KPI vẫn chia đều mọi ngày.
import { useEffect, useMemo, useState } from 'react';
import { CalendarHeart, Plus, Save, Target, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { POS } from '@/lib/shared/report-model';
import { posShortName } from '@/lib/shared/pos-short';
import { todayVn } from '@/lib/shared/report-time';
import { daysInMonthOf } from '@/lib/kpi/kpi-day';
import { holidayDate, type Holiday } from '@/lib/shared/holidays';
import { setHolidays } from './holidays-store';
import { apiJson } from './api-fetch';
import { ChartCard, TableWrap, Th, toast } from './ui-kit';

const DEPTS = [
  { id: 'sale', label: 'Sale', note: 'doanh thu Sale chốt' },
  { id: 'cskh', label: 'CSKH', note: 'doanh thu CSKH chốt' },
  { id: 'mkt', label: 'MKT', note: 'DT New (Sale chốt đơn MKT)' },
] as const;
type Item = { scope: string; refId: string; revenue: number };
const trieu = (v: number) => v ? String(Math.round(v / 1e5) / 10).replace('.', ',') : '';
const parseTrieu = (s: string) => { const n = Number(s.replace(/\s/g, '').replace(',', '.')); return Number.isFinite(n) && n > 0 ? Math.round(n * 1e6) : 0; };

export function DeptPosKpiPanel({ canEdit }: { canEdit: boolean }) {
  const [month, setMonth] = useState(() => todayVn().slice(0, 7));
  const [vals, setVals] = useState<Record<string, string>>({});
  const [loaded, setLoaded] = useState<Record<string, number>>({});
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let live = true;
    void apiJson<{ items: Item[] }>(`/api/targets?month=${month}`).catch(() => ({ items: [] as Item[] })).then((b) => {
      if (!live) return;
      const m = Object.fromEntries(b.items.filter((i) => i.scope === 'dept_pos').map((i) => [i.refId, i.revenue]));
      setLoaded(m);
      setVals(Object.fromEntries(Object.entries(m).map(([k, v]) => [k, trieu(v)])));
    }).catch(() => undefined);
    return () => { live = false; };
  }, [month]);
  const days = daysInMonthOf(month);
  const save = async () => {
    const keys = DEPTS.flatMap((d) => POS.map((p) => `${d.id}:${p.id}`));
    const changed = keys.filter((k) => parseTrieu(vals[k] ?? '') !== (loaded[k] ?? 0));
    if (!changed.length) { toast('Không có KPI nào thay đổi.'); return; }
    setBusy(true);
    try {
      await apiJson('/api/targets', 'PUT', { month, only: changed.map((k) => `dept_pos:${k}`), items: changed.map((k) => ({ scope: 'dept_pos', refId: k, revenue: parseTrieu(vals[k] ?? '') })) });
      setLoaded((m) => ({ ...m, ...Object.fromEntries(changed.map((k) => [k, parseTrieu(vals[k] ?? '')])) }));
      toast(`Đã lưu ${changed.length} KPI bộ phận × POS tháng ${month.slice(5)}/${month.slice(0, 4)}.`);
    } catch (e) { toast(`Chưa lưu được: ${e instanceof Error ? e.message : String(e)}`); } finally { setBusy(false); }
  };
  const total = (dept: string) => POS.reduce((a, p) => a + parseTrieu(vals[`${dept}:${p.id}`] ?? ''), 0);
  return (
    <ChartCard icon={Target} title="KPI bộ phận × POS" info={`KPI tháng của Sale / CSKH / MKT trên từng POS, nhập theo triệu đồng. Tổng quan chia đều cho ${days} ngày của tháng (Chủ nhật, lễ cũng tính) và báo thiếu / dư so với phải đạt tới hết hôm qua. Đã chốt là chốt: đơn hoàn / hủy về sau không trừ. MKT tính trên DT New.`}
      action={<div className="flex items-center gap-2"><Input type="month" value={month} onChange={(e) => e.target.value && setMonth(e.target.value)} className="h-8 w-36" aria-label="Tháng" />{canEdit && <Button size="sm" onClick={save} disabled={busy}><Save size={14} />Lưu</Button>}</div>}>
      <TableWrap><table className="tbl compact"><thead><tr><Th>Bộ phận</Th>{POS.map((p) => <Th key={p.id} className="n" title={p.name}>{posShortName(p.id, p.name)}</Th>)}<Th className="n">Tổng</Th><Th className="n" hint={`Tổng ÷ ${days} ngày`}>/ngày</Th></tr></thead>
        <tbody>{DEPTS.map((d) => (
          <tr key={d.id}>
            <td className="whitespace-nowrap font-semibold">{d.label}<span className="block text-[11px] font-normal text-ink-3">{d.note}</span></td>
            {POS.map((p) => { const k = `${d.id}:${p.id}`; return (
              <td key={p.id} className="n">{canEdit
                ? <Input inputMode="decimal" value={vals[k] ?? ''} onChange={(e) => setVals((v) => ({ ...v, [k]: e.target.value }))} placeholder="—" aria-label={`KPI ${d.label} ${posShortName(p.id, p.name)} (triệu)`} className="h-8 w-20 text-right" />
                : trieu(loaded[k] ?? 0) || '—'}</td>
            ); })}
            <td className="n">{trieu(total(d.id)) || '—'} tr</td>
            <td className="n">{total(d.id) ? `${(total(d.id) / days / 1e6).toFixed(2).replace('.', ',')} tr` : '—'}</td>
          </tr>
        ))}</tbody></table></TableWrap>
      <p className="mt-2 text-[11.5px] text-ink-3">Nhập số triệu, ví dụ 250 = 250 triệu. Để trống = chưa đặt.</p>
    </ChartCard>
  );
}

export function HolidaysPanel({ canEdit }: { canEdit: boolean }) {
  const [list, setList] = useState<Holiday[]>([]);
  const [saved, setSaved] = useState(true);
  const [busy, setBusy] = useState(false);
  const year = Number(todayVn().slice(0, 4));
  useEffect(() => { void apiJson<{ holidays: Holiday[]; saved: boolean }>('/api/holidays').then((b) => { setList(b.holidays); setSaved(b.saved); }).catch(() => undefined); }, []);
  const set = (i: number, patch: Partial<Holiday>) => setList((l) => l.map((h, j) => j === i ? { ...h, ...patch } : h));
  const dates = useMemo(() => list.map((h) => [holidayDate(h, year), holidayDate(h, year + 1)]), [list, year]);
  const save = async () => {
    setBusy(true);
    try {
      const b = await apiJson<{ holidays?: Holiday[] }>('/api/holidays', 'PUT', { holidays: list });
      setHolidays(b.holidays ?? list); setSaved(true);
      toast(`Đã lưu ${list.length} ngày lễ.`);
    } catch (e) { toast(`Chưa lưu được: ${e instanceof Error ? e.message : String(e)}`); } finally { setBusy(false); }
  };
  const ddmm = (d: string | null) => d ? `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}` : '—';
  return (
    <ChartCard icon={CalendarHeart} title="Ngày lễ cố định trong năm" info="Chỉ để đánh dấu ngày lễ trên KPI, biểu đồ, báo cáo (biết vì sao hôm đó số thấp). KPI vẫn chia đều mọi ngày. Ngày âm lịch tự đổi sang ngày dương của từng năm."
      action={canEdit ? <div className="flex items-center gap-2"><Button size="sm" variant="outline" onClick={() => setList((l) => [...l, { name: '', kind: 'solar', month: 1, day: 1 }])}><Plus size={14} />Thêm</Button><Button size="sm" onClick={save} disabled={busy}><Save size={14} />Lưu</Button></div> : undefined}>
      {!saved && <p className="mb-2 text-[11.5px] text-warn">Đang hiện danh sách gợi ý, chưa lưu. Sửa rồi bấm Lưu để dùng.</p>}
      <TableWrap><table className="tbl compact"><thead><tr><Th>Tên</Th><Th>Lịch</Th><Th className="n">Ngày</Th><Th className="n">Tháng</Th><Th className="n">{`Năm ${year}`}</Th><Th className="n">{`Năm ${year + 1}`}</Th>{canEdit && <Th><span className="sr-only">Xoá</span></Th>}</tr></thead>
        <tbody>{list.map((h, i) => (
          <tr key={i}>
            <td>{canEdit ? <Input value={h.name} onChange={(e) => set(i, { name: e.target.value })} className="h-8 min-w-40" aria-label="Tên ngày lễ" /> : h.name}</td>
            <td>{canEdit ? <select value={h.kind} onChange={(e) => set(i, { kind: e.target.value as Holiday['kind'] })} className="h-8 rounded-md border border-line bg-surface px-2 text-[13px]" aria-label="Âm hay dương lịch"><option value="solar">Dương</option><option value="lunar">Âm</option></select> : h.kind === 'lunar' ? 'Âm' : 'Dương'}</td>
            <td className="n">{canEdit ? <Input inputMode="numeric" value={String(h.day)} onChange={(e) => set(i, { day: Number(e.target.value) || 0 })} className="h-8 w-14 text-right" aria-label="Ngày" /> : h.day}</td>
            <td className="n">{canEdit ? <Input inputMode="numeric" value={String(h.month)} onChange={(e) => set(i, { month: Number(e.target.value) || 0 })} className="h-8 w-14 text-right" aria-label="Tháng" /> : h.month}</td>
            <td className="n">{ddmm(dates[i]?.[0] ?? null)}</td>
            <td className="n">{ddmm(dates[i]?.[1] ?? null)}</td>
            {canEdit && <td><button type="button" onClick={() => setList((l) => l.filter((_, j) => j !== i))} className="grid size-7 place-items-center rounded-md text-ink-3 hover:bg-bad-bg hover:text-bad" aria-label={`Xoá ${h.name}`}><Trash2 size={14} /></button></td>}
          </tr>
        ))}</tbody></table></TableWrap>
    </ChartCard>
  );
}
