'use client';

// "Cách tính" dùng chung mọi trang (26/09/2026): tỷ lệ chốt so với gì, hoàn chia cho gì, mua thành công gồm gì.
// Nhớ trên máy (localStorage) vì là thói quen xem số của từng người; mặc định theo cách Pancake tính.
import { useState, useSyncExternalStore } from 'react';
import { Calculator, Check } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { DEFAULT_METRICS, RATE_BASES, RETURN_BASES, SUCCESS_BASES, type MetricSettings } from '@/lib/metrics';

const KEY = 'thp_metric_settings';
let current: MetricSettings = DEFAULT_METRICS;
if (typeof window !== 'undefined') {
  try { const v = JSON.parse(localStorage.getItem(KEY) ?? 'null'); if (v) current = { ...DEFAULT_METRICS, ...v }; } catch { /* bỏ qua */ }
}
const listeners = new Set<() => void>();
const same = (a: MetricSettings, b: MetricSettings) => a.rateBase === b.rateBase && a.returnBase === b.returnBase && a.success === b.success;
function apply(next: MetricSettings) {
  if (same(current, next)) return;
  current = next;
  try { localStorage.setItem(KEY, JSON.stringify(current)); } catch { /* bỏ qua */ }
  for (const l of listeners) l();
}
// Máy chủ giữ bản chính (theo tài khoản, app và bot đọc chung); localStorage chỉ để hiện ngay khi mở trang.
let synced = false;
export let companyDefault: MetricSettings = DEFAULT_METRICS;
function syncFromServer() {
  if (synced || typeof window === 'undefined') return;
  synced = true;
  fetch('/api/prefs/metrics', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null) as Promise<{ settings?: MetricSettings; company?: MetricSettings } | null>)
    .then((d) => { if (d?.company) { companyDefault = d.company; for (const l of listeners) l(); } if (d?.settings) apply({ ...DEFAULT_METRICS, ...d.settings }); })
    .catch(() => { synced = false; });
}
const subscribe = (l: () => void) => { listeners.add(l); syncFromServer(); return () => { listeners.delete(l); }; };
const put = (body: Record<string, string>) => fetch('/api/prefs/metrics', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  .then((r) => (r.ok ? r.json() : null) as Promise<{ company?: MetricSettings } | null>).then((d) => { if (d?.company) { companyDefault = d.company; for (const l of listeners) l(); } }).catch(() => null);
export function setMetricSettings(patch: Partial<MetricSettings>) {
  apply({ ...current, ...patch });
  void put({ ...current });
}
/** Bỏ lựa chọn riêng, theo mặc định công ty. */
export function resetMetricSettings() {
  apply(companyDefault);
  void fetch('/api/prefs/metrics', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ scope: 'reset' }) })
    .then((r) => (r.ok ? r.json() : null) as Promise<{ settings?: MetricSettings } | null>).then((d) => { if (d?.settings) apply({ ...DEFAULT_METRICS, ...d.settings }); }).catch(() => null);
}
/** Chủ hệ thống: đặt cách tính hiện tại làm mặc định công ty (bot và tài khoản chưa tự chọn). */
export const setCompanyMetrics = () => put({ ...current, scope: 'company' });
/** Mặc định công ty (đổi khi tải từ máy chủ / chủ hệ thống đặt lại) — đọc qua store để giao diện vẽ lại đúng lúc. */
export function useCompanyDefault(): MetricSettings {
  return useSyncExternalStore(subscribe, () => companyDefault, () => DEFAULT_METRICS);
}
export function useMetricSettings(): MetricSettings {
  return useSyncExternalStore(subscribe, () => current, () => DEFAULT_METRICS);
}
export const isDefaultMetrics = (m: MetricSettings) => m.rateBase === DEFAULT_METRICS.rateBase && m.returnBase === DEFAULT_METRICS.returnBase && m.success === DEFAULT_METRICS.success;

function Group<K extends string>({ title, value, options, onChange }: { title: string; value: K; options: Record<K, { label: string; hint: string }>; onChange: (k: K) => void }) {
  return (
    <div>
      <p className="px-2 pt-1 text-[11px] font-semibold uppercase tracking-wide text-ink-3">{title}</p>
      {(Object.keys(options) as K[]).map((k) => (
        <button key={k} type="button" onClick={() => onChange(k)}
          className={`flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-surface-2 ${value === k ? 'bg-tint font-semibold text-primary' : 'text-ink'}`}>
          <Check size={14} className={`mt-0.5 shrink-0 ${value === k ? '' : 'invisible'}`} />
          <span>{options[k].label}<span className="block text-[11px] font-normal text-ink-3">{options[k].hint}</span></span>
        </button>
      ))}
    </div>
  );
}

export function MetricSettingsButton({ className = '' }: { className?: string }) {
  const m = useMetricSettings();
  const company = useCompanyDefault();
  const changed = !same(m, company);
  return (
    <Popover>
      <PopoverTrigger render={<button type="button" className={`btn sm ${changed ? 'is-warn' : ''} ${className}`} title="Cách tính tỷ lệ chốt, hoàn, mua thành công" aria-label="Cách tính" />}>
        <Calculator size={14} aria-hidden="true" /><span className="hidden 2xl:inline">Cách tính</span>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 max-h-[75vh] space-y-2 overflow-y-auto p-2">
        <Group title="Tỷ lệ chốt so với" value={m.rateBase} options={RATE_BASES} onChange={(rateBase) => setMetricSettings({ rateBase })} />
        <Group title="Tỷ lệ hoàn chia cho" value={m.returnBase} options={RETURN_BASES} onChange={(returnBase) => setMetricSettings({ returnBase })} />
        <Group title="Mua thành công gồm" value={m.success} options={SUCCESS_BASES} onChange={(success) => setMetricSettings({ success })} />
        <p className="border-t px-2 pt-2 text-[11px] text-ink-3">Lưu theo tài khoản: web, app iPhone/Android dùng chung. Khối "Số tham chiếu Pancake" luôn giữ nguyên cách Pancake tính để đối chiếu.</p>
        {changed && <button type="button" className="w-full rounded-md px-2 py-1.5 text-sm font-medium text-primary hover:bg-surface-2" onClick={resetMetricSettings}>Về mặc định công ty</button>}
      </PopoverContent>
    </Popover>
  );
}

// Bảng "trước / sau" cho sếp (Hệ thống): chỉ số nào đã thống nhất cách tính từ 26/09/2026 và giờ chọn được ở đâu.
const CHANGES: { metric: string; before: string; after: string }[] = [
  { metric: 'Tỷ lệ chốt', before: 'Mỗi trang một kiểu: đơn chốt ÷ đơn lên, ÷ đơn được chia, ÷ số điện thoại…', after: 'Một công thức cho mọi trang; nút "Cách tính" chọn so với đơn lên (mặc định, như Pancake) hoặc đơn được chia.' },
  { metric: 'Tỷ lệ hoàn', before: 'Có trang chia cho đơn đã giao, có trang chia cho đơn chốt.', after: 'Chọn được: ÷ đơn đã giao ĐVVC (mặc định), ÷ đơn chốt, ÷ đơn lên.' },
  { metric: 'Tỷ lệ hủy', before: 'Có trang tính cả đơn xóa.', after: 'Đơn hủy (không tính đơn xóa) ÷ đơn lên, mọi trang giống nhau.' },
  { metric: 'Mua thành công (mua lại, khách)', before: 'Cố định: đã giao ĐVVC trở đi.', after: 'Chọn được: đã nhận hàng (mặc định) hoặc đã giao ĐVVC trở đi.' },
  { metric: 'GTTB ở Báo cáo tháng', before: 'Tên "Giá trị trung bình đơn" nhưng tính trên đơn giao thành công.', after: 'Đổi tên đúng nghĩa: "GTTB giao thành công".' },
  { metric: 'Số tham chiếu Pancake', before: 'Chưa có.', after: 'Khối luôn hiện ở Tổng quan POS, Điều hành, Tổng quan bộ phận: lấy thẳng từ Pancake, không đổi theo "Cách tính".' },
];
export function MetricChangesCard() {
  const m = useMetricSettings();
  const [busy, setBusy] = useState(false);
  const company = useCompanyDefault();
  const isCompany = same(m, company);
  return (
    <section className="card p-5">
      <h3 className="text-base font-semibold text-ink">Chỉ số đã thống nhất cách tính</h3>
      <p className="mt-0.5 text-[11.5px] text-ink-3">Từ 26/09/2026. Cách đang dùng trên máy này: tỷ lệ chốt = {RATE_BASES[m.rateBase].short} · tỷ lệ hoàn = {RETURN_BASES[m.returnBase].short} · mua thành công = {SUCCESS_BASES[m.success].label}.</p>
      <div className="mt-3 flex flex-wrap items-center gap-2 rounded-lg bg-surface-2 px-3 py-2 text-[12.5px] text-ink-2">
        <span className="min-w-0 flex-1">Mặc định công ty (bot Telegram và tài khoản chưa tự chọn): tỷ lệ chốt = {RATE_BASES[company.rateBase].short} · hoàn = {RETURN_BASES[company.returnBase].short} · mua thành công = {SUCCESS_BASES[company.success].label}.</span>
        <button type="button" className="btn sm" disabled={busy || isCompany} onClick={() => { setBusy(true); void setCompanyMetrics().finally(() => setBusy(false)); }}>{isCompany ? 'Đang là mặc định' : 'Đặt cách của tôi làm mặc định'}</button>
      </div>
      <div className="tbl-wrap mt-3">
        <table className="w-full min-w-[640px] text-left text-[13px]">
          <thead><tr className="border-b border-line text-[11.5px] text-ink-3"><th className="py-2 pr-3 font-medium">Chỉ số</th><th className="py-2 pr-3 font-medium">Trước</th><th className="py-2 font-medium">Bây giờ</th></tr></thead>
          <tbody>{CHANGES.map((c) => (
            <tr key={c.metric} className="border-b border-line/60 align-top last:border-0">
              <td className="py-2 pr-3 font-semibold text-ink">{c.metric}</td><td className="py-2 pr-3 text-ink-3">{c.before}</td><td className="py-2 text-ink-2">{c.after}</td>
            </tr>
          ))}</tbody>
        </table>
      </div>
    </section>
  );
}
