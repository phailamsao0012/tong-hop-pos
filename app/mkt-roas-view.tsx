'use client';

// Chi phí & ROAS (giai đoạn 3c · 26/09/2026): marketer / trưởng team nhập chi phí quảng cáo theo ngày (tay hoặc file Excel theo mẫu),
// web ghép với số và đơn chốt của từng marketer để ra ROAS, chi phí / số, chi phí / đơn chốt.
import { useTeam } from './team-store';
import { usePosIds, usePosStaffFilter } from './pos-store';
import { usePeriod } from './period-store';
import { AiPackButton } from './ai-pack';
import { useMemo, useRef, useState } from 'react';
import { FileDown, FileUp, Plus, Trash2, Wallet } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { POS } from '@/lib/shared/report-model';
import { addDays, todayVn } from '@/lib/shared/report-time';
import type { roasReport } from '@/lib/ops/ad-costs';
import { ICON } from './icons';
import { PeriodToolbar, PosChips } from './overview-view';
import { useApi } from './use-api';
import { SheetCostLink } from './sheet-cost-link';
import { Th, ChartCard, Definitions, EmptyState, ErrorBox, FoldBlock, KpiCard, PageHeader, SkeletonKpis, SkeletonTable, SortTh, TableWrap, dmy, money, pct, shortMoney, toast, useSort, vi } from './ui-kit';
import { saveXlsx } from '@/app/save-xlsx';
import { SegmentHintNote } from './segment-hint-note';
import { NumDetail } from './num-detail';
import { mktCellDetail, type MktCell, type MktNumbers } from '@/lib/shared/num-detail';
import { BOSS_CLOSE_RED, BOSS_RETURN_RED, COACH_MIN_BASE } from '@/lib/zalo/boss-report';
import { CanXemStrip, KPI_TIGHT, PageHeadMoi, WhySheet, overClose, overRet, tileGrid, type CanXemItem, type WhySpec } from './trang-moi';

type Roas = Awaited<ReturnType<typeof roasReport>>;
type Draft = { day: string; marketerId: string; amount: number; campaign?: string; note?: string };
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

export function MktRoasView({ owner = false, uiMoi = false }: { owner?: boolean; /** Cờ THP_UI_MOI: bật thì bố cục kiểu mới, tắt thì y như cũ. */ uiMoi?: boolean }) {
  // Giao diện mới: khung "Vì sao ra số này" đang mở (null = đóng).
  const [why, setWhy] = useState<WhySpec | null>(null);
  const today = todayVn();
  const team = useTeam();
  const { preset, start, end, setPreset, setStart, setEnd } = usePeriod();
  const [posIds, setPosIds] = usePosIds();
  // Không qua bộ đệm báo cáo (/api/reports/*) vì chi phí vừa nhập phải hiện ngay.
  const url = useMemo(() => `/api/marketing/roas?${new URLSearchParams({ start, end, posIds: posIds.join(','), team })}`, [start, end, posIds, team]);
  const { data: r, loading, error, reload } = useApi<Roas>(url, { keep: true });
  const [form, setForm] = useState({ day: today, marketerId: '', amount: '', campaign: '', note: '' });
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<{ rows: Draft[]; errors: string[] } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  type K = 'newNet' | 'cskhNet' | 'newOrders' | 'costShare' | 'cost' | 'net' | 'roas' | 'phones' | 'costPerLead' | 'closed' | 'costPerClosed' | 'closeRate' | 'returnRate';
  const sort = useSort<K>('net');
  // Chọn POS nào chỉ hiện người có tài khoản trên POS đó (anh Vũ 04/11/2026); tổng giữ nguyên.
  const onPos = usePosStaffFilter();
  const rows = useMemo(() => sort.apply((r?.rows ?? []).filter((x) => !onPos || onPos(x.marketerId)), (x, k) => x[k]), [r, sort, onPos]);
  const dailyMax = Math.max(1, ...(r?.daily ?? []).map((d) => d.amount));
  // Đủ mọi ngày trong kỳ (ngày chưa nhập = 0) để thanh không bị kéo giãn khi mới có vài ngày.
  const days = useMemo(() => { const out: { day: string; amount: number }[] = []; const m = new Map((r?.daily ?? []).map((d) => [d.day, d.amount]));
    for (let d = start; d <= end && out.length < 400; d = addDays(d, 1)) out.push({ day: d, amount: m.get(d) ?? 0 }); return out; }, [r, start, end]);
  const periodLabel = `${dmy(start)}/${start.slice(0, 4)} – ${dmy(end)}/${end.slice(0, 4)}`;
  // Khung chi tiết khi rê chuột vào số trong bảng (lib/shared/num-detail.ts), dựng từ số dòng đã có.
  const detailScope = `${periodLabel} · ${posIds.length >= POS.length ? 'mọi POS' : `${posIds.length}/${POS.length} POS`}`;
  const dt = (cell: MktCell, x: MktNumbers & { name: string }) => mktCellDetail(cell, x, { name: x.name, scope: detailScope });

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
    saveXlsx(XLSX, wb, 'mau-chi-phi-quang-cao.xlsx');
  };
  const upload = async (file: File) => {
    const XLSX = await import('xlsx');
    const wb = XLSX.read(await file.arrayBuffer(), { cellDates: false }); // ngày Excel là số, tự đổi (tránh lệch 1 ngày do múi giờ)
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

  // [khối chung] Các khối dùng chung cho bố cục cũ và bố cục kiểu mới (cờ THP_UI_MOI): cùng JSX, chỉ chỗ đặt khác nhau.
  // fold: chỉ bố cục mới truyền (thu gọn thẻ); bố cục cũ không truyền nên thẻ y như trước.
  const aiPack = () => (
        <AiPackButton disabled={!r} pack={() => r && ({
          page: 'Chi phí & ROAS Marketing', period: periodLabel,
          facts: [['Chi phí đã nhập', Math.round(r.total.cost)], ['Doanh thu từ số MKT', Math.round(r.total.net)], ['ROAS (marketer đã nhập chi phí)', roasText(r.total.roas)], ['Chi phí / số', r.total.costPerLead === null ? null : Math.round(r.total.costPerLead)], ['Chi phí / đơn chốt', r.total.costPerClosed === null ? null : Math.round(r.total.costPerClosed)], ['Số', r.total.phones], ['Đơn chốt', r.total.closed]],
          tables: [{ title: 'Theo marketer (— = chưa nhập chi phí)', staffCol: 0, columns: ['Marketer', 'Chi phí', 'Doanh thu', 'ROAS', 'Số', 'Chi phí/số', 'Đơn chốt', 'Chi phí/đơn', 'Chốt số', 'Hoàn'], rows: r.rows.map((x) => [x.name, x.cost ? Math.round(x.cost) : null, Math.round(x.net), roasText(x.roas), x.phones, x.costPerLead === null ? null : Math.round(x.costPerLead), x.closed, x.costPerClosed === null ? null : Math.round(x.costPerClosed), pct(x.closeRate), pct(x.returnRate)]) }],
          definitions: r.definitions,
          questions: ['Marketer nào có ROAS và chất lượng số tốt nhất, nên tăng ngân sách cho ai?', 'Ai đang đốt chi phí mà số chốt kém? Có thể do đâu?', 'Chi phí / đơn chốt bao nhiêu là hợp lý so với GTTB?', 'Những marketer chưa nhập chi phí: cần làm gì để so được?'],
        })} />
  );
  const periodBar = () => (
      <PeriodToolbar preset={preset} start={start} end={end} loading={loading} onReload={reload}
        onPreset={setPreset}
        onStart={setStart} onEnd={setEnd} />
  );
  const posNote = (/*{}*/) => (
      posIds.length < POS.length && <p className="notice m-0 text-[12.5px]">Đang xem {posIds.length}/{POS.length} POS: chi phí mỗi marketer mỗi ngày được chia theo tỉ lệ số điện thoại marketer đó về từng POS trong ngày (marketer chỉ chạy một POS thì chi phí về đúng POS đó). Chọn "Tất cả" POS để xem chi phí gốc.</p>
  );
  const newNote = (/*{}*/r: Roas) => (
          team === 'all' && <p className="text-xs text-ink-3" title="Chi phí QC chỉ so với đơn New do Sale chốt; giữ phạm vi marketer có chi phí">New {shortMoney(r.total.newNet)} · CSKH {shortMoney(r.total.cskhNet)} · Khác {shortMoney(r.total.otherNet)} · ROAS và CP/đơn theo đơn New</p>
  );
  const entryCard = (r: Roas) => (
            <ChartCard icon={Plus} title="Nhập chi phí" subtitle="Nhập từng dòng, hoặc tải file mẫu, điền rồi tải lên">
              <div className="grid gap-2 sm:grid-cols-[9rem_minmax(0,1fr)_9rem]">
                <Input id="cost-day" type="date" value={form.day} onChange={(e) => setForm({ ...form, day: e.target.value })} aria-label="Ngày" />
                <select id="cost-marketer" className={SELECT} value={form.marketerId} onChange={(e) => setForm({ ...form, marketerId: e.target.value })} aria-label="Marketer">
                  <option value="">Chọn marketer…</option>
                  {r.marketers.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                </select>
                <Input id="cost-amount" inputMode="numeric" placeholder="Chi phí (₫)" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value.replace(/[^\d]/g, '') ? vi.format(Number(e.target.value.replace(/[^\d]/g, ''))) : '' })} aria-label="Chi phí" />
                <Input id="cost-campaign" aria-label="Chiến dịch" placeholder="Chiến dịch (không bắt buộc)" value={form.campaign} onChange={(e) => setForm({ ...form, campaign: e.target.value })} className="sm:col-span-2" />
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
  );
  const dailyCard = (fold?: { storageKey: string; summary?: string }) => (
            <ChartCard collapse={fold} icon={Wallet} title="Chi phí theo ngày" subtitle="Tổng chi phí đã nhập mỗi ngày trong kỳ">
              {r.daily.length ? (
                <div className="flex h-40 items-end gap-[3px]" role="img" aria-label="Chi phí theo ngày">
                  {days.map((d) => <span key={d.day} title={`${dmy(d.day)}: ${money(d.amount)}`} className={`min-w-[3px] flex-1 rounded-t-sm ${d.amount ? 'bg-[var(--warn)]' : 'bg-surface-2'}`} style={{ height: `${d.amount ? Math.max(3, d.amount / dailyMax * 100) : 2}%` }} />)}
                </div>
              ) : <EmptyState text="Chưa nhập chi phí nào trong kỳ." />}
              {r.daily.length > 0 && <div className="mt-1 flex justify-between text-[11px] text-ink-3"><span>{dmy(start)}</span><span>{dmy(end)}</span></div>}
            </ChartCard>
  );
  const roasCard = (r: Roas) => (
          <ChartCard icon={ICON.marketing} title={`ROAS theo marketer · ${rows.length} người`} subtitle="Bấm tiêu đề cột để sắp xếp · marketer chưa nhập chi phí hiện —" info={r.definitions.quality}>
            {rows.length ? (
              <TableWrap minWidth={980} maxHeight="32rem" stickyFirst>
                <table className="tbl">
                  <thead><tr>
                    <Th className="text-left">Marketer</Th>
                    <SortTh k="cost" label="Chi phí" sort={sort} />
                    <SortTh k="net" label={team === 'all' ? 'DT MKT (chốt + CSKH + Khác)' : team === 'sale' ? 'DT chốt' : 'DT CSKH'} sort={sort} />
                    {team === 'all' && <><SortTh k="newNet" label="DT chốt" sort={sort} /><SortTh k="cskhNet" label="DT CSKH" sort={sort} /></>}
                    <SortTh k="roas" label="ROAS" sort={sort} />
                    <SortTh k="phones" label="Số" sort={sort} />
                    <SortTh k="costPerLead" label="Chi phí/số" sort={sort} />
                    <SortTh k={team === 'cskh' ? 'closed' : 'newOrders'} label={team === 'cskh' ? 'Đơn CSKH' : 'Đơn New'} sort={sort} />
                    <SortTh k="costShare" label="% chi phí / DT chốt" sort={sort} />
                    <SortTh k="costPerClosed" label="Chi phí/đơn New" sort={sort} />
                    <SortTh k="closeRate" label="Chốt số" sort={sort} />
                    <SortTh k="returnRate" label="Hoàn" sort={sort} />
                  </tr></thead>
                  <tbody>{rows.map((x) => (
                    <tr key={x.marketerId}>
                      <td className="text-left font-medium text-ink">{x.name}{x.department && <span className="block text-[11px] font-normal text-ink-3">{x.department}</span>}</td>
                      <td className="n">{x.cost ? <NumDetail spec={dt('cost', x)}>{shortMoney(x.cost)}</NumDetail> : <span className="text-ink-4">—</span>}</td>
                      <td className="n"><NumDetail spec={dt('net', x)}>{shortMoney(x.net)}</NumDetail>{team === 'all' && <small className="block text-ink-3">New {shortMoney(x.newNet)} · CSKH {shortMoney(x.cskhNet)} · Khác {shortMoney(x.otherNet)}</small>}</td>
                      {team === 'all' && <><td className="n"><NumDetail spec={dt('newNet', x)}>{shortMoney(x.newNet)}</NumDetail></td><td className="n text-ink-3"><NumDetail spec={dt('cskhNet', x)}>{shortMoney(x.cskhNet)}</NumDetail></td></>}
                      <td className={`n font-semibold ${x.roas === null ? '' : x.roas >= 3 ? 'text-good' : x.roas >= 1.5 ? 'text-warn' : 'text-bad'}`}><NumDetail spec={dt('roas', x)}>{roasText(x.roas)}</NumDetail></td>
                      <td className="n"><NumDetail spec={dt('phones', x)}>{vi.format(x.phones)}</NumDetail></td>
                      <td className="n"><NumDetail spec={dt('cpl', x)}>{shortMoney(x.costPerLead)}</NumDetail></td>
                      <td className="n">{vi.format(team === 'cskh' ? x.closed : x.newOrders)}</td>
                      <td className="n"><NumDetail spec={dt('share', x)}>{pct(x.costShare === null ? null : x.costShare * 100)}</NumDetail></td>
                      <td className="n"><NumDetail spec={dt('cpc', x)}>{shortMoney(x.costPerClosed)}</NumDetail></td>
                      <td className="n">{pct(x.closeRate)}</td>
                      <td className="n">{pct(x.returnRate)}</td>
                    </tr>
                  ))}</tbody>
                  <tfoot><tr><th>Tổng</th><td>{shortMoney(r.total.cost)}</td><td>{shortMoney(r.total.net)}</td>{team === 'all' && <><td>{shortMoney(r.total.newNet)}</td><td className="text-ink-3">{shortMoney(r.total.cskhNet)}</td></>}<td>{roasText(r.total.roas)}</td><td>{vi.format(r.total.phones)}</td><td>{shortMoney(r.total.costPerLead)}</td><td>{vi.format(team === 'cskh' ? r.total.closed : r.total.newOrders)}</td><td>{pct(r.total.costShare === null ? null : r.total.costShare * 100)}</td><td>{shortMoney(r.total.costPerClosed)}</td><td colSpan={2}>—</td></tr></tfoot>
                </table>
              </TableWrap>
            ) : <EmptyState text="Chưa có đơn nào có marketer trong kỳ." />}
            {!!r.unmatchedSheet?.length && <p className="mt-2 text-[12px] text-ink-3">Tên trên sheet chưa ghép với POS (không cộng vào chi phí, ROAS): {r.unmatchedSheet.map((u) => `${u.name} ${shortMoney(u.cost)}`).join(', ')}. Ghép tên với tài khoản POS để tính chi phí cho đúng người.</p>}
          </ChartCard>
  );
  const entriesCard = (r: Roas, fold?: { storageKey: string; summary?: string }) => (
          <ChartCard collapse={fold} icon={Wallet} title={`Các dòng chi phí · ${r.entries.length}`} subtitle="Mới nhất trước · xóa dòng nhập sai rồi nhập lại">
            {r.entries.length ? (
              <TableWrap minWidth={640} maxHeight="24rem">
                <table className="tbl text-[12.5px]">
                  <thead><tr><Th className="text-left">Ngày</Th><Th className="text-left">Marketer</Th><Th>Chi phí</Th><Th className="text-left">Chiến dịch · ghi chú</Th><th /></tr></thead>
                  <tbody>{r.entries.map((e) => (
                    <tr key={e.id}>
                      <td className="text-left num">{dmy(e.day)}</td>
                      <td className="text-left">{e.marketerName}</td>
                      <td className="n">{money(e.amount)}</td>
                      <td className="text-left text-ink-2">{[e.campaign, e.note].filter(Boolean).join(' · ') || '—'}</td>
                      <td><button type="button" aria-label="Xóa dòng" className="grid size-7 place-items-center rounded-md text-ink-3 hover:bg-bad-bg tap hover:text-bad" onClick={() => void remove(e.id)}><Trash2 size={14} /></button></td>
                    </tr>
                  ))}</tbody>
                </table>
              </TableWrap>
            ) : <EmptyState text="Chưa có dòng chi phí nào trong kỳ." />}
          </ChartCard>
  );
  // [hết khối chung]
  // Khối Nhập chi phí dùng fileRef: dựng một lần, cả hai bố cục dùng chung phần tử này (luật react-compiler).
  const entryEl = r ? entryCard(r) : null;

  // ===== Bố cục kiểu mới (cờ THP_UI_MOI; plan "giao diện mới cả trang trong" 27/11/2026). Cờ tắt thì nhánh này không chạy. =====
  // Trên xuống: đầu trang (PageHeadMoi: chọn kỳ; Gói AI; POS) → nhắc lọc nhóm đơn / chia chi phí theo POS → "Cần xem" (marketer chốt số dưới 40%,
  // hoàn từ 7%, từ 20 số / đơn) → một hàng 5 ô số (bấm mở "Vì sao ra số này") → bảng chính ROAS theo marketer → Nhập chi phí + nối sheet
  // → khối phụ thu gọn: Chi phí theo ngày, Các dòng chi phí, Cách tính.
  if (uiMoi) {
    const scope = `${periodLabel} · ${posIds.length >= POS.length ? 'mọi POS' : `${posIds.length}/${POS.length} POS`} · ROAS = doanh thu từ số MKT ÷ chi phí đã nhập`;
    const head = <PageHeadMoi title="Chi phí & ROAS" scope={scope} hint="Nhập chi phí quảng cáo theo marketer (tay hoặc Excel), web tự ghép với số và đơn chốt để ra ROAS"
      tools={periodBar()} right={aiPack()} pos={<PosChips posIds={posIds} onChange={setPosIds} />} />;
    if (!r) return <div className="min-w-0 space-y-4">{head}{error ? <ErrorBox error={error} onRetry={reload} /> : <SkeletonKpis count={5} className="lg:grid-cols-5" />}</div>;
    const t = r.total;
    const need: CanXemItem[] = [];
    for (const x of rows) {
      if (overClose(x.closeRate) && x.orders >= COACH_MIN_BASE) need.push({ key: `c-${x.marketerId}`, text: `${x.name}: chốt số ${pct(x.closeRate)}`, gap: BOSS_CLOSE_RED - (x.closeRate ?? 0),
        onClick: () => setWhy({ title: `Chốt số · ${x.name}`, value: pct(x.closeRate), tone: 'bad', scope, mark: `Đỏ khi dưới ${BOSS_CLOSE_RED}%`,
          rows: [{ label: 'Đơn tạo trong kỳ đã chốt', value: vi.format(x.closedLeads) }, { label: 'Đơn tạo trong kỳ', value: vi.format(x.orders) }], definition: 'Chốt số = đơn tạo trong kỳ nay đã chốt ÷ đơn tạo trong kỳ (không vượt 100%).' }) });
      if (overRet(x.returnRate) && x.closed >= COACH_MIN_BASE) need.push({ key: `r-${x.marketerId}`, text: `${x.name}: hoàn ${pct(x.returnRate)}`, gap: (x.returnRate ?? 0) - BOSS_RETURN_RED,
        onClick: () => setWhy({ title: `Hoàn · ${x.name}`, value: pct(x.returnRate), tone: 'bad', scope, mark: `Đỏ từ ${BOSS_RETURN_RED}%`,
          rows: [{ label: 'Đơn hoàn', value: vi.format(x.returned) }, { label: 'Đơn chốt', value: vi.format(x.closed) }], definition: 'Hoàn = đơn hoàn ÷ đơn chốt của marketer.' }) });
    }
    const topBy = (key: 'cost' | 'net') => [...rows].sort((a, b) => b[key] - a[key]).slice(0, 10).map((x) => ({ label: x.name, value: shortMoney(x[key]) }));
    const k = (s: string) => `ui-moi:mkt-roas:${s}`;
    return (
      <div className="min-w-0 space-y-4">
        {head}
        <SegmentHintNote />
        {posNote()}
        <CanXemStrip items={need} note={`Marketer chốt số dưới ${BOSS_CLOSE_RED}%, hoàn từ ${BOSS_RETURN_RED}% (từ ${COACH_MIN_BASE} số / đơn)`} />
        <div className={tileGrid(5)}>
          <KpiCard icon={Wallet} tone="orange" label="Chi phí đã nhập" className={KPI_TIGHT} value={shortMoney(t.cost)} note={`${vi.format(r.entries.length)} dòng trong kỳ`}
            onClick={() => setWhy({ title: 'Chi phí đã nhập', value: money(t.cost), scope, rows: topBy('cost'), definition: r.definitions.cost })} />
          <KpiCard icon={ICON.revenue} tone="teal" label="Doanh thu MKT" className={KPI_TIGHT} value={shortMoney(t.net)} note={`${vi.format(t.closed)} đơn chốt`}
            onClick={() => setWhy({ title: 'Doanh thu MKT', value: money(t.net), scope, rows: topBy('net'), definition: r.definitions.roas })} />
          <KpiCard icon={ICON.rate} tone="green" label="ROAS" className={KPI_TIGHT} value={roasText(t.roas)} note={team === 'cskh' ? 'Chi phí QC tính cho đơn New, xem nút Sale' : t.covered.marketers ? `Trên ${t.covered.marketers} marketer đã nhập chi phí` : 'Chưa nhập chi phí'}
            onClick={() => setWhy({ title: 'ROAS', value: roasText(t.roas), scope, rows: [{ label: 'Chi phí đã nhập', value: money(t.cost) }, { label: 'Marketer đã nhập chi phí', value: vi.format(t.covered.marketers) }], definition: r.definitions.roas })} />
          <KpiCard icon={ICON.customers} tone="blue" label="Chi phí / số" className={KPI_TIGHT} value={shortMoney(t.costPerLead)} note={`${vi.format(t.covered.phones)} số của marketer đã nhập`}
            onClick={() => setWhy({ title: 'Chi phí / số', value: money(t.costPerLead), scope, rows: [{ label: 'Chi phí đã nhập', value: money(t.cost) }, { label: 'Số của marketer đã nhập', value: vi.format(t.covered.phones) }], definition: r.definitions.leads })} />
          <KpiCard icon={ICON.closed} tone="purple" label="Chi phí / đơn New" className={KPI_TIGHT} value={shortMoney(t.costPerClosed)} note={team === 'cskh' ? 'Chi phí QC tính cho đơn New, xem nút Sale' : `${vi.format(t.covered.closed)} đơn New của marketer đã nhập`}
            onClick={() => setWhy({ title: 'Chi phí / đơn New', value: money(t.costPerClosed), scope, rows: [{ label: 'Chi phí đã nhập', value: money(t.cost) }, { label: 'Đơn New của marketer đã nhập', value: vi.format(t.covered.closed) }], definition: r.definitions.roas })} />
        </div>
        {newNote(r)}
        {roasCard(r)}
        {entryEl}
        <SheetCostLink owner={owner} onChanged={reload} />
        <div className="grid min-w-0 gap-3">
          {dailyCard({ storageKey: k('daily') })}
          {entriesCard(r, { storageKey: k('entries'), summary: `${vi.format(r.entries.length)} dòng` })}
          <FoldBlock icon={Wallet} title="Cách tính" storageKey={k('defs')}><Definitions items={r.definitions} /></FoldBlock>
        </div>
        <WhySheet spec={why} onClose={() => setWhy(null)} />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <PageHeader eyebrow={periodLabel} title="Chi phí & ROAS" subtitle="Nhập chi phí quảng cáo theo marketer (tay hoặc Excel), web tự ghép với số và đơn chốt để ra ROAS"
        actions={aiPack()} />
      {periodBar()}
      <PosChips posIds={posIds} onChange={setPosIds} />
      <SegmentHintNote />
      {error && !r && <ErrorBox error={error} onRetry={reload} />}
      {posNote()}
      {!r && !error && <><SkeletonKpis count={5} /><SkeletonTable rows={5} cols={6} /></>}
      {r && (
        <>
          <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-5">
            <KpiCard icon={Wallet} tone="orange" label="Chi phí đã nhập" value={shortMoney(r.total.cost)} note={`${vi.format(r.entries.length)} dòng trong kỳ`} tooltip={{ period: periodLabel, current: money(r.total.cost), definition: r.definitions.cost }} />
            <KpiCard icon={ICON.revenue} tone="teal" label="Doanh thu MKT" value={shortMoney(r.total.net)} note={`${vi.format(r.total.closed)} đơn chốt`} tooltip={{ period: periodLabel, current: money(r.total.net), definition: r.definitions.roas }} />
            <KpiCard icon={ICON.rate} tone="green" label="ROAS" value={roasText(r.total.roas)} note={team === 'cskh' ? 'Chi phí QC tính cho đơn New, xem nút Sale' : r.total.covered.marketers ? `Trên ${r.total.covered.marketers} marketer đã nhập chi phí` : 'Chưa nhập chi phí'} tooltip={{ period: periodLabel, current: roasText(r.total.roas), definition: r.definitions.roas }} />
            <KpiCard icon={ICON.customers} tone="blue" label="Chi phí / số" value={shortMoney(r.total.costPerLead)} note={`${vi.format(r.total.covered.phones)} số của marketer đã nhập`} tooltip={{ period: periodLabel, current: money(r.total.costPerLead), definition: r.definitions.leads }} />
            <KpiCard icon={ICON.closed} tone="purple" label="Chi phí / đơn New" value={shortMoney(r.total.costPerClosed)} note={team === 'cskh' ? 'Chi phí QC tính cho đơn New, xem nút Sale' : `${vi.format(r.total.covered.closed)} đơn New của marketer đã nhập`} tooltip={{ period: periodLabel, current: money(r.total.costPerClosed), definition: r.definitions.roas }} />
          </div>

          {newNote(r)}
          <SheetCostLink owner={owner} onChanged={reload} />

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
            {entryEl}
            {dailyCard()}
          </div>

          {roasCard(r)}

          {entriesCard(r)}
          <Definitions items={r.definitions} />
        </>
      )}
    </div>
  );
}
