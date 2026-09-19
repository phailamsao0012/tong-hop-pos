'use client';

// Cấu hình mục tiêu tháng: doanh thu đơn chốt và số đơn chốt cho từng POS và từng nhân viên.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Copy, Save, Target } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { POS } from '@/lib/report-model';
import { todayVn } from '@/lib/report-time';
import { ChartCard, ErrorBox, money, posColor, vi } from './ui-kit';

export type TargetItem = { scope: 'pos' | 'employee'; refId: string; revenue: number; closedOrders: number; workingDays?: number | null };
type Shift = { shiftStart: number | null; shiftEnd: number | null };
/** Số ngày trong tháng YYYY-MM (mặc định cho KPI ngày khi chưa nhập ngày làm việc). */
export const daysInMonth = (m: string) => new Date(Date.UTC(Number(m.slice(0, 4)), Number(m.slice(5, 7)), 0)).getUTCDate();
type Resp = { month: string; items: TargetItem[]; previous: { month: string; items: TargetItem[] } };
type Employee = { id: string; name: string; department: string | null; active: boolean };
const key = (scope: string, refId: string) => `${scope}:${refId}`;

/** Ô nhập tiền: gõ số thường (vd 2000000) hoặc "2tr", "1.5 tỷ". */
function parseMoney(v: string) {
  const s = v.trim().toLowerCase().replace(/\s+/g, '').replace(/,/g, '.');
  const m = s.match(/^([\d.]+)(tr|triệu|trieu|m|tỷ|ty|b)$/);
  if (!m) return Math.round(Number(v.replace(/\D/g, '')) || 0); // số thường, chấp nhận dấu chấm ngăn hàng nghìn
  const n = Number(m[1]) || 0;
  return Math.round(n * (m[2] === 'tr' || m[2] === 'triệu' || m[2] === 'trieu' || m[2] === 'm' ? 1e6 : 1e9));
}

export function TargetsPanel({ canEdit }: { canEdit: boolean }) {
  const today = todayVn();
  const [month, setMonth] = useState(today.slice(0, 7));
  const [items, setItems] = useState<Record<string, TargetItem>>({});
  const [previous, setPrevious] = useState<Resp['previous'] | null>(null);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [department, setDepartment] = useState('all');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [shifts, setShifts] = useState<Record<string, Shift>>({});
  const [shiftsDirty, setShiftsDirty] = useState(false);
  useEffect(() => { void fetch('/api/staff-settings', { cache: 'no-store' }).then((r) => r.ok ? r.json() as Promise<{ items: (Shift & { userId: string })[] }> : { items: [] }).then((b) => setShifts(Object.fromEntries(b.items.map((i) => [i.userId, { shiftStart: i.shiftStart, shiftEnd: i.shiftEnd }])))).catch(() => undefined); }, []);
  const setShift = (userId: string, field: keyof Shift, raw: string) => {
    const v = raw === '' ? null : Math.max(0, Math.min(field === 'shiftEnd' ? 24 : 23, Math.round(Number(raw) || 0)));
    setShifts((s) => ({ ...s, [userId]: { shiftStart: s[userId]?.shiftStart ?? null, shiftEnd: s[userId]?.shiftEnd ?? null, [field]: v } }));
    setShiftsDirty(true); setDirty(true);
  };

  useEffect(() => { void fetch('/api/employees').then((r) => r.ok ? r.json() as Promise<Employee[]> : []).then(setEmployees).catch(() => undefined); }, []);
  const load = useCallback(async () => {
    setError(null); setMessage(null);
    try {
      const r = await fetch(`/api/targets?month=${month}`, { cache: 'no-store' });
      const body = await r.json() as Resp & { error?: string };
      if (!r.ok) throw new Error(body.error ?? 'Không tải được mục tiêu.');
      setItems(Object.fromEntries(body.items.map((i) => [key(i.scope, i.refId), i])));
      setPrevious(body.previous); setDirty(false); setDraft({});
    } catch (e) { setError(e instanceof Error ? e.message : 'Không tải được mục tiêu.'); }
  }, [month]);
  useEffect(() => { void load(); }, [load]);

  const set = (scope: 'pos' | 'employee', refId: string, field: 'revenue' | 'closedOrders' | 'workingDays', value: number | null) => {
    setItems((s) => ({ ...s, [key(scope, refId)]: { scope, refId, revenue: s[key(scope, refId)]?.revenue ?? 0, closedOrders: s[key(scope, refId)]?.closedOrders ?? 0, workingDays: s[key(scope, refId)]?.workingDays ?? null, [field]: value } }));
    setDirty(true);
  };
  const save = async () => {
    setSaving(true); setError(null);
    try {
      const r = await fetch('/api/targets', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ month, items: Object.values(items) }) });
      const body = await r.json() as { error?: string };
      if (!r.ok) throw new Error(body.error ?? 'Không lưu được.');
      if (shiftsDirty) {
        const rs = await fetch('/api/staff-settings', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ items: Object.entries(shifts).map(([userId, s]) => ({ userId, ...s })) }) });
        if (!rs.ok) throw new Error(((await rs.json().catch(() => ({}))) as { error?: string }).error ?? 'Không lưu được ca làm việc.');
        setShiftsDirty(false);
      }
      setDirty(false); setMessage(`Đã lưu mục tiêu tháng ${month.slice(5)}/${month.slice(0, 4)}.`);
    } catch (e) { setError(e instanceof Error ? e.message : 'Không lưu được.'); }
    finally { setSaving(false); }
  };
  const copyPrevious = () => {
    if (!previous?.items.length) return;
    setItems(Object.fromEntries(previous.items.map((i) => [key(i.scope, i.refId), { ...i }])));
    setDraft({}); setDirty(true); setMessage(`Đã sao chép từ tháng ${previous.month.slice(5)}/${previous.month.slice(0, 4)}, bấm Lưu để áp dụng.`);
  };
  const departments = useMemo(() => [...new Set(employees.map((e) => e.department).filter(Boolean))].sort() as string[], [employees]);
  useEffect(() => { const sale = departments.find((d) => /^sale$/i.test(d)) ?? departments.find((d) => /sale/i.test(d)); if (sale) setDepartment(sale); }, [departments]);
  // Bỏ tài khoản hệ thống của Pancake (API_CONNECTION…); mặc định hiện bộ phận Sale nếu có.
  const isSystem = (e: Employee) => /api[_ ]?connection|^api\b|webhook|system/i.test(e.name);
  const visibleEmployees = employees.filter((e) => !isSystem(e) && (e.active || items[key('employee', e.id)])).filter((e) => department === 'all' || e.department === department)
    .sort((a, b) => a.name.localeCompare(b.name, 'vi'));
  const posTotal = POS.reduce((a, p) => a + (items[key('pos', p.id)]?.revenue ?? 0), 0);
  const empTotal = employees.reduce((a, e) => a + (items[key('employee', e.id)]?.revenue ?? 0), 0);

  const moneyInput = (scope: 'pos' | 'employee', refId: string) => {
    const k = key(scope, refId);
    const shown = draft[k] ?? (items[k]?.revenue ? vi.format(items[k].revenue) : '');
    return (
      <Input inputMode="numeric" className="h-8 w-36 text-right" placeholder="0" disabled={!canEdit} value={shown}
        onChange={(e) => setDraft((d) => ({ ...d, [k]: e.target.value }))}
        onBlur={(e) => { const v = parseMoney(e.target.value); set(scope, refId, 'revenue', v); setDraft((d) => { const n = { ...d }; delete n[k]; return n; }); }} />
    );
  };
  const ordersInput = (scope: 'pos' | 'employee', refId: string) => (
    <Input type="number" min={0} className="h-8 w-24 text-right" placeholder="0" disabled={!canEdit} value={items[key(scope, refId)]?.closedOrders || ''}
      onChange={(e) => set(scope, refId, 'closedOrders', Math.max(0, Math.round(Number(e.target.value) || 0)))} />
  );

  return (
    <ChartCard icon={Target} title="Mục tiêu tháng" subtitle="KPI tháng cho từng POS và nhân viên. KPI ngày = mục tiêu ÷ số ngày làm việc (mặc định = số ngày của tháng). Ca làm việc theo giờ, đổi được bất kỳ lúc nào."
      action={
        <div className="flex flex-wrap items-center gap-2">
          <Input type="month" className="w-auto" value={month} onChange={(e) => e.target.value && setMonth(e.target.value)} />
          {canEdit && <Button variant="outline" size="sm" onClick={copyPrevious} disabled={!previous?.items.length} title={previous ? `Tháng ${previous.month}` : ''}><Copy size={14} />Sao chép tháng trước</Button>}
          {canEdit && <Button size="sm" onClick={save} disabled={!dirty || saving}><Save size={14} />{saving ? 'Đang lưu…' : 'Lưu mục tiêu'}</Button>}
        </div>
      }>
      {error && <ErrorBox error={error} onRetry={() => void load()} />}
      {message && <p className="mb-3 rounded-xl border border-[#b6e2bd] bg-[#e5f7e8] px-3 py-2 text-sm text-[#195b35]">{message}</p>}
      {!canEdit && <p className="mb-3 text-xs text-[#7d9184]">Chỉ quản trị viên mới sửa được mục tiêu.</p>}
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        <div>
          <h4 className="mb-2 text-sm font-semibold">Theo POS <span className="text-xs font-normal text-[#7d9184]">· tổng {money(posTotal)}</span></h4>
          <table className="w-full text-sm [&_td]:px-2 [&_th]:px-2">
            <thead className="text-left text-xs text-[#7d9184]"><tr><th className="py-1.5">POS</th><th className="text-right">Doanh thu (đ)</th><th className="text-right">Đơn chốt</th></tr></thead>
            <tbody>
              {POS.map((p) => (
                <tr key={p.id} className="border-t">
                  <td className="whitespace-nowrap py-1.5 font-medium"><span className="mr-2 inline-block size-2.5 rounded-full" style={{ background: posColor(p.id) }} />{p.name}</td>
                  <td className="text-right">{moneyInput('pos', p.id)}</td>
                  <td className="text-right">{ordersInput('pos', p.id)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-2 text-xs text-[#7d9184]">Nhập số thường (2000000) hoặc viết tắt: <code>2tr</code>, <code>1.5 tỷ</code>.</p>
        </div>
        <div>
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <h4 className="text-sm font-semibold">Theo nhân viên <span className="text-xs font-normal text-[#7d9184]">· tổng {money(empTotal)} · {visibleEmployees.length} người</span></h4>
            <Select value={department} items={{ all: 'Tất cả bộ phận', ...Object.fromEntries(departments.map((d) => [d, d])) }} onValueChange={(v) => setDepartment(String(v))}>
              <SelectTrigger className="min-w-40 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="all">Tất cả bộ phận</SelectItem>{departments.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="max-h-[28rem] overflow-auto rounded-xl border">
            <table className="w-full text-sm [&_td]:px-2 [&_th]:px-2">
              <thead className="sticky top-0 bg-white text-left text-xs text-[#7d9184]"><tr><th className="py-1.5">Nhân viên</th><th>Bộ phận</th><th className="text-right">Doanh thu (đ)</th><th className="text-right">Đơn chốt</th><th className="text-right" title="Số ngày làm việc trong tháng, để chia KPI ngày">Ngày làm</th><th title="Ca làm việc: giờ bắt đầu – giờ kết thúc (0–24)">Ca (giờ)</th></tr></thead>
              <tbody>
                {visibleEmployees.map((e) => (
                  <tr key={e.id} className="border-t">
                    <td className="whitespace-nowrap py-1.5 font-medium">{e.name}</td>
                    <td className="text-xs text-[#7d9184]">{e.department ?? '—'}</td>
                    <td className="text-right">{moneyInput('employee', e.id)}</td>
                    <td className="text-right">{ordersInput('employee', e.id)}</td>
                    <td className="text-right"><Input type="number" min={1} max={31} className="h-8 w-16 text-right" placeholder={String(daysInMonth(month))} disabled={!canEdit} value={items[key('employee', e.id)]?.workingDays ?? ''}
                      onChange={(ev) => set('employee', e.id, 'workingDays', ev.target.value === '' ? null : Math.max(1, Math.min(31, Math.round(Number(ev.target.value) || 0))))} /></td>
                    <td className="whitespace-nowrap"><Input type="number" min={0} max={23} className="inline-block h-8 w-14 text-right" placeholder="8" disabled={!canEdit} value={shifts[e.id]?.shiftStart ?? ''} onChange={(ev) => setShift(e.id, 'shiftStart', ev.target.value)} /><span className="px-1 text-xs text-[#7d9184]">–</span><Input type="number" min={1} max={24} className="inline-block h-8 w-14 text-right" placeholder="17" disabled={!canEdit} value={shifts[e.id]?.shiftEnd ?? ''} onChange={(ev) => setShift(e.id, 'shiftEnd', ev.target.value)} /></td>
                  </tr>
                ))}
                {!visibleEmployees.length && <tr><td colSpan={6} className="py-4 text-center text-xs text-[#7d9184]">Chưa có nhân viên (danh sách lấy từ Pancake sau khi đồng bộ).</td></tr>}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-xs text-[#7d9184]">Đối chiếu bằng doanh thu đơn chốt (đã bàn giao ĐVVC) của nhân viên trong tháng. KPI ngày hôm nay = doanh thu chốt trong ngày ÷ (mục tiêu ÷ ngày làm việc); ngày vượt 300% hay ngày 0% đều bình thường, KPI chấm theo tháng. Ca làm việc dùng ở trang Điều hành trong ca (chọn "Ca cá nhân").</p>
        </div>
      </div>
    </ChartCard>
  );
}

/** Tải mục tiêu một tháng thành bản đồ { 'pos:id' | 'employee:id' → mục tiêu } (dùng cho các trang báo cáo). */
export async function fetchTargets(month: string): Promise<Record<string, TargetItem>> {
  try {
    const r = await fetch(`/api/targets?month=${month}`, { cache: 'no-store' });
    if (!r.ok) return {};
    const body = await r.json() as Resp;
    return Object.fromEntries(body.items.map((i) => [key(i.scope, i.refId), i]));
  } catch { return {}; }
}
