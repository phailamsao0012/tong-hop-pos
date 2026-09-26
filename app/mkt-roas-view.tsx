'use client';

// Chi phí & ROAS (giai đoạn 3c · 26/09/2026): marketer / trưởng team nhập chi phí quảng cáo theo ngày (tay hoặc file Excel theo mẫu),
// web ghép với số và đơn chốt của từng marketer để ra ROAS, chi phí / số, chi phí / đơn chốt.
import { useMemo, useRef, useState } from 'react';
import { FileDown, FileUp, Plus, Trash2, Wallet } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { POS } from '@/lib/report-model';
import { addDays, todayVn } from '@/lib/report-time';
import type { roasReport } from '@/lib/ad-costs';
import { ICON } from './icons';
import { PeriodToolbar, PosChips, presetRange } from './overview-view';
import { useApi } from './use-api';
import { ChartCard, Definitions, EmptyState, ErrorBox, KpiCard, PageHeader, SkeletonKpis, SkeletonTable, SortTh, TableWrap, dmy, money, pct, shortMoney, toast, useSort, vi } from './ui-kit';

type Roas = Awaited<ReturnType<typeof roasReport>>;
type Draft = { day: string; marketerId: string; amount: number; campaign?: string; note?: string };
const monthStart = (d: string) => `${d.slice(0, 7)}-01`;
const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').toLowerCase().replace(/\s+/g, ' ').trim();
const roasText = (v: number | null) => v === null ? '—' : `${v.toFixed(2).replace('.', ',')}×`;
const SELECT = 'h-9 rounded-md border border-line bg-surface px-2 text-sm text-ink';

/** Đọc ngày trong ô Excel: số ngày Excel, Date, "dd/mm/yyyy" hoặc "yyyy-mm-dd". */
function excelDay(v: unknown): string | null {
  if (v instanceof Date && !Number.isNaN(v.getTime())) return new Date(v.getTime() - v.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  if (typeof v === 'number') { const d = new Date(Math.round((v - 25569) * 86400000)); return d.toISOString().slice(0, 10); }
  const s = String(v ?? '').trim();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/); if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/); if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  return null;
}

export function MktRoasView() {
  const today = todayVn();
  const [preset, setPreset] = useState('month');
  const [start, setStart] = useState(monthStart(today));
  const [end, setEnd] = useState(today);
  const [posIds, setPosIds] = useState<string[]>(POS.map((p) => p.id));
  // Không qua bộ đệm báo cáo (/api/reports/*) vì chi phí vừa nhập phải hiện ngay.
  const url = useMemo(() => `/api/marketing/roas?${new URLSearchParams({ start, end, posIds: posIds.join(',') })}`, [start, end, posIds]);
  const { data: r, loading, error, reload } = useApi<Roas>(url, { keep: true });
  const [form, setForm] = useState({ day: today, marketerId: '', amount: '', campaign: '', note: '' });
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<{ rows: Draft[]; errors: string[] } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  type K = 'cost' | 'net' | 'roas' | 'phones' | 'costPerLead' | 'closed' | 'costPerClosed' | 'closeRate' | 'returnRate';
  const sort = useSort<K>('net');
  const rows = useMemo(() => sort.apply(r?.rows ?? [], (x, k) => x[k]), [r, sort]);
  const dailyMax = Math.max(1, ...(r?.daily ?? []).map((d) => d.amount));
  // Đủ mọi ngày trong kỳ (ngày chưa nhập = 0) để thanh không bị kéo giãn khi mới có vài ngày.
  const days = useMemo(() => { const out: { day: string; amount: number }[] = []; const m = new Map((r?.daily ?? []).map((d) => [d.day, d.amount]));
    for (let d = start; d <= end && out.length < 400; d = addDays(d, 1)) out.push({ day: d, amount: m.get(d) ?? 0 }); return out; }, [r, start, end]);
  const periodLabel = `${dmy(start)}/${start.slice(0, 4)} – ${dmy(end)}/${end.slice(0, 4)}`;

  const save = async (list: Draft[]) => {
    setBusy(true);
    try {
      const res = await fetch('/api/marketing/costs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rows: list }) });
      const body = await res.json() as { added?: number; error?: string };
      if (!res.ok) throw new Error(body.error ?? `Lỗi ${res.status}`);
      toast(`Đã lưu ${vi.format(body.added ?? list.length)} dòng chi phí`);
      reload();
      return true;
    } catch (e) { toast(e instanceof Error ? e.message : 'Không lưu được', { kind: 'error' }); return false; } finally { setBusy(false); }
  };
  const addOne = async () => {
    const amount = Number(form.amount.replace(/[^\d]/g, ''));
    if (!form.marketerId) { toast('Chọn marketer', { kind: 'error' }); return; }
    if (!amount) { toast('Nhập số tiền chi phí', { kind: 'error' }); return; }
    if (await save([{ day: form.day, marketerId: form.marketerId, amount, campaign: form.campaign, note: form.note }])) setForm((f) => ({ ...f, amount: '', campaign: '', note: '' }));
  };
  const remove = async (id: string) => {
    if (!window.confirm('Xóa dòng chi phí này?')) return;
    const res = await fetch(`/api/marketing/costs?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
    if (res.ok) { toast('Đã xóa'); reload(); } else toast('Không xóa được', { kind: 'error' });
  };
  const template = async () => {
    const XLSX = await import('xlsx');
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
      ['Ngày', 'Marketer', 'Chi phí', 'Chiến dịch', 'Ghi chú'],
      [`${dmy(today)}/${today.slice(0, 4)}`, r?.marketers[0]?.name ?? 'Tên marketer', 1500000, 'Tên chiến dịch (không bắt buộc)', ''],
    ]), 'Chi phí');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['Marketer (chép đúng tên)'], ...(r?.marketers ?? []).map((m) => [m.name])]), 'Danh sách marketer');
    XLSX.writeFile(wb, 'mau-chi-phi-quang-cao.xlsx');
  };
  const upload = async (file: File) => {
    const XLSX = await import('xlsx');
    const wb = XLSX.read(await file.arrayBuffer(), { cellDates: true });
    const data = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: true });
    const byName = new Map((r?.marketers ?? []).map((m) => [fold(m.name), m.id]));
    const out: Draft[] = [], errors: string[] = [];
    data.slice(1).forEach((row, i) => {
      if (!row || row.every((c) => c === null || c === undefined || String(c).trim() === '')) return;
      const day = excelDay(row[0]); const name = String(row[1] ?? '').trim();
      const marketerId = byName.get(fold(name)) ?? (r?.marketers.some((m) => m.id === name) ? name : '');
      const amount = typeof row[2] === 'number' ? row[2] : Number(String(row[2] ?? '').replace(/[^\d]/g, ''));
      if (!day) errors.push(`Dòng ${i + 2}: ngày "${String(row[0] ?? '')}" không đọc được`);
      else if (!marketerId) errors.push(`Dòng ${i + 2}: không tìm thấy marketer "${name}"`);
      else if (!Number.isFinite(amount) || amount < 0) errors.push(`Dòng ${i + 2}: chi phí không hợp lệ`);
      else out.push({ day, marketerId, amount, campaign: String(row[3] ?? ''), note: String(row[4] ?? '') });
    });
    setPreview({ rows: out, errors });
  };

  return (
    <div className="space-y-5">
      <PageHeader eyebrow={periodLabel} title="Chi phí & ROAS" subtitle="Nhập chi phí quảng cáo theo marketer (tay hoặc Excel), web tự ghép với số và đơn chốt để ra ROAS" />
      <PeriodToolbar preset={preset} start={start} end={end} loading={loading} onReload={reload}
        onPreset={(v) => { setPreset(v); const x = presetRange(v, today); if (x) { setStart(x.start); setEnd(x.end); } }}
        onStart={(v) => { setPreset('custom'); setStart(v); }} onEnd={(v) => { setPreset('custom'); setEnd(v); }} />
      <PosChips posIds={posIds} onChange={setPosIds} />
      {error && !r && <ErrorBox error={error} onRetry={reload} />}
      {!r && !error && <><SkeletonKpis count={5} /><SkeletonTable rows={5} cols={6} /></>}
      {r && (
        <>
          <div className={`grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-5 ${loading ? 'opacity-70' : ''}`}>
            <KpiCard icon={Wallet} tone="orange" label="Chi phí đã nhập" value={shortMoney(r.total.cost)} note={`${vi.format(r.entries.length)} dòng trong kỳ`} tooltip={{ period: periodLabel, current: money(r.total.cost), definition: r.definitions.cost }} />
            <KpiCard icon={ICON.revenue} tone="teal" label="Doanh thu từ số MKT" value={shortMoney(r.total.net)} note={`${vi.format(r.total.closed)} đơn chốt`} tooltip={{ period: periodLabel, current: money(r.total.net), definition: r.definitions.roas }} />
            <KpiCard icon={ICON.rate} tone="green" label="ROAS" value={roasText(r.total.roas)} note={r.total.covered.marketers ? `Trên ${r.total.covered.marketers} marketer đã nhập chi phí` : 'Chưa nhập chi phí'} tooltip={{ period: periodLabel, current: roasText(r.total.roas), definition: r.definitions.roas }} />
            <KpiCard icon={ICON.customers} tone="blue" label="Chi phí / số" value={shortMoney(r.total.costPerLead)} note={`${vi.format(r.total.covered.phones)} số của marketer đã nhập`} tooltip={{ period: periodLabel, current: money(r.total.costPerLead), definition: r.definitions.leads }} />
            <KpiCard icon={ICON.closed} tone="purple" label="Chi phí / đơn chốt" value={shortMoney(r.total.costPerClosed)} note={`${vi.format(r.total.covered.closed)} đơn chốt của marketer đã nhập`} tooltip={{ period: periodLabel, current: money(r.total.costPerClosed), definition: r.definitions.roas }} />
          </div>

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
            <ChartCard icon={Plus} title="Nhập chi phí" subtitle="Nhập từng dòng, hoặc tải file mẫu, điền rồi tải lên">
              <div className="grid gap-2 sm:grid-cols-[9rem_minmax(0,1fr)_9rem]">
                <Input id="cost-day" type="date" value={form.day} onChange={(e) => setForm({ ...form, day: e.target.value })} aria-label="Ngày" />
                <select id="cost-marketer" className={SELECT} value={form.marketerId} onChange={(e) => setForm({ ...form, marketerId: e.target.value })} aria-label="Marketer">
                  <option value="">Chọn marketer…</option>
                  {r.marketers.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                </select>
                <Input id="cost-amount" inputMode="numeric" placeholder="Chi phí (₫)" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value.replace(/[^\d]/g, '') ? vi.format(Number(e.target.value.replace(/[^\d]/g, ''))) : '' })} aria-label="Chi phí" />
                <Input id="cost-campaign" placeholder="Chiến dịch (không bắt buộc)" value={form.campaign} onChange={(e) => setForm({ ...form, campaign: e.target.value })} className="sm:col-span-2" />
                <Button onClick={() => void addOne()} disabled={busy}><Plus size={14} />Thêm</Button>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-line pt-3">
                <Button variant="outline" onClick={() => void template()}><FileDown size={14} />Tải file mẫu</Button>
                <Button variant="outline" onClick={() => fileRef.current?.click()}><FileUp size={14} />Tải lên Excel</Button>
                <input ref={fileRef} id="cost-file" type="file" accept=".xlsx,.xls,.csv" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) void upload(f); e.target.value = ''; }} />
                <span className="text-[11.5px] text-ink-3">Cột: Ngày · Marketer (đúng tên như danh sách) · Chi phí · Chiến dịch · Ghi chú</span>
              </div>
              {preview && (
                <div className="mt-3 rounded-xl bg-surface-2 p-3 text-[12.5px]">
                  <p className="m-0 font-semibold text-ink">Đọc được {vi.format(preview.rows.length)} dòng · tổng {money(preview.rows.reduce((t, x) => t + x.amount, 0))}{preview.errors.length ? ` · ${preview.errors.length} dòng lỗi` : ''}</p>
                  {preview.errors.length > 0 && <ul className="m-0 mt-1 max-h-28 list-disc overflow-y-auto pl-4 text-bad">{preview.errors.slice(0, 20).map((x) => <li key={x}>{x}</li>)}</ul>}
                  <div className="mt-2 flex gap-2">
                    <Button size="sm" disabled={busy || !preview.rows.length} onClick={() => void save(preview.rows).then((ok) => ok && setPreview(null))}>Lưu {vi.format(preview.rows.length)} dòng</Button>
                    <Button size="sm" variant="ghost" onClick={() => setPreview(null)}>Bỏ</Button>
                  </div>
                </div>
              )}
            </ChartCard>
            <ChartCard icon={Wallet} title="Chi phí theo ngày" subtitle="Tổng chi phí đã nhập mỗi ngày trong kỳ">
              {r.daily.length ? (
                <div className="flex h-40 items-end gap-[3px]" role="img" aria-label="Chi phí theo ngày">
                  {days.map((d) => <span key={d.day} title={`${dmy(d.day)}: ${money(d.amount)}`} className={`min-w-[3px] flex-1 rounded-t-sm ${d.amount ? 'bg-[var(--warn)]' : 'bg-surface-2'}`} style={{ height: `${d.amount ? Math.max(3, d.amount / dailyMax * 100) : 2}%` }} />)}
                </div>
              ) : <EmptyState text="Chưa nhập chi phí nào trong kỳ." />}
              {r.daily.length > 0 && <div className="mt-1 flex justify-between text-[11px] text-ink-3"><span>{dmy(start)}</span><span>{dmy(end)}</span></div>}
            </ChartCard>
          </div>

          <ChartCard icon={ICON.marketing} title={`ROAS theo marketer · ${rows.length} người`} subtitle="Bấm tiêu đề cột để sắp xếp · marketer chưa nhập chi phí hiện —" info={r.definitions.quality}>
            {rows.length ? (
              <TableWrap minWidth={980} maxHeight="32rem" stickyFirst>
                <table className="tbl">
                  <thead><tr>
                    <th className="text-left">Marketer</th>
                    <SortTh k="cost" label="Chi phí" sort={sort} />
                    <SortTh k="net" label="Doanh thu" sort={sort} />
                    <SortTh k="roas" label="ROAS" sort={sort} />
                    <SortTh k="phones" label="Số" sort={sort} />
                    <SortTh k="costPerLead" label="Chi phí/số" sort={sort} />
                    <SortTh k="closed" label="Đơn chốt" sort={sort} />
                    <SortTh k="costPerClosed" label="Chi phí/đơn chốt" sort={sort} />
                    <SortTh k="closeRate" label="Chốt số" sort={sort} />
                    <SortTh k="returnRate" label="Hoàn" sort={sort} />
                  </tr></thead>
                  <tbody>{rows.map((x) => (
                    <tr key={x.marketerId}>
                      <td className="text-left font-medium text-ink">{x.name}{x.department && <span className="block text-[11px] font-normal text-ink-3">{x.department}</span>}</td>
                      <td className="n">{x.cost ? shortMoney(x.cost) : <span className="text-ink-4">—</span>}</td>
                      <td className="n">{shortMoney(x.net)}</td>
                      <td className={`n font-semibold ${x.roas === null ? '' : x.roas >= 3 ? 'text-good' : x.roas >= 1.5 ? 'text-warn' : 'text-bad'}`}>{roasText(x.roas)}</td>
                      <td className="n">{vi.format(x.phones)}</td>
                      <td className="n">{shortMoney(x.costPerLead)}</td>
                      <td className="n">{vi.format(x.closed)}</td>
                      <td className="n">{shortMoney(x.costPerClosed)}</td>
                      <td className="n">{pct(x.closeRate)}</td>
                      <td className="n">{pct(x.returnRate)}</td>
                    </tr>
                  ))}</tbody>
                </table>
              </TableWrap>
            ) : <EmptyState text="Chưa có đơn nào có marketer trong kỳ." />}
          </ChartCard>

          <ChartCard icon={Wallet} title={`Các dòng chi phí · ${r.entries.length}`} subtitle="Mới nhất trước · xóa dòng nhập sai rồi nhập lại">
            {r.entries.length ? (
              <TableWrap minWidth={640} maxHeight="24rem">
                <table className="tbl text-[12.5px]">
                  <thead><tr><th className="text-left">Ngày</th><th className="text-left">Marketer</th><th>Chi phí</th><th className="text-left">Chiến dịch · ghi chú</th><th /></tr></thead>
                  <tbody>{r.entries.map((e) => (
                    <tr key={e.id}>
                      <td className="text-left num">{dmy(e.day)}</td>
                      <td className="text-left">{e.marketerName}</td>
                      <td className="n">{money(e.amount)}</td>
                      <td className="text-left text-ink-2">{[e.campaign, e.note].filter(Boolean).join(' · ') || '—'}</td>
                      <td><button type="button" aria-label="Xóa dòng" className="grid size-7 place-items-center rounded-md text-ink-3 hover:bg-bad-bg hover:text-bad" onClick={() => void remove(e.id)}><Trash2 size={14} /></button></td>
                    </tr>
                  ))}</tbody>
                </table>
              </TableWrap>
            ) : <EmptyState text="Chưa có dòng chi phí nào trong kỳ." />}
          </ChartCard>
          <Definitions items={r.definitions} />
        </>
      )}
    </div>
  );
}
