'use client';

import type { UsageDay, cycleSummary } from '@/lib/ops/d1-usage';
const labels: Record<string, string> = { recent: 'Đơn mới/sửa', users: 'Nhân viên', products: 'Sản phẩm', customers: 'Khách mới/sửa', customers_backfill: 'Lịch sử khách', backfill: 'Lịch sử đơn', stats: 'Dựng số liệu' };
const colors = ['#17684b', '#368f79', '#64b5a0', '#e3b341', '#c58037', '#697ac4', '#a278b5'];
export type Usage = { history: UsageDay[]; cycle: ReturnType<typeof cycleSummary> };
const number = (n: number) => n.toLocaleString('vi-VN');
function Bar({ label, value, limit, size = false }: { label: string; value: number | null; limit: number; size?: boolean }) {
  const pct = (value ?? 0) / limit * 100;
  const format = (n: number) => size ? `${(n / 1024 ** 3).toLocaleString('vi-VN', { maximumFractionDigits: 2 })} GB` : `${number(n)} dòng`;
  return <div><p className="text-sm">{label}: {value === null ? 'Chưa có dữ liệu' : format(value)} / {format(limit)}</p><div className="mt-2 h-2 overflow-hidden rounded-full bg-surface-3"  aria-label={label} ><div className="h-full" style={{ width: `${Math.min(100, pct)}%`, backgroundColor: pct >= 90 ? '#c44444' : pct >= 70 ? '#d5a228' : '#17684b' }} /></div></div>;
}
export function D1UsagePanel({ usage }: { usage: Usage | null }) {
  const cycle = usage?.cycle;
  const today = new Date().toISOString().slice(0, 10);
  const days = Array.from({ length: 30 }, (_, i) => { const d = new Date(`${today}T00:00:00Z`); d.setUTCDate(d.getUTCDate() - 29 + i); return d.toISOString().slice(0, 10); });
  const rows = days.map((day) => usage?.history.find((r) => r.day === day));
  const max = Math.max(1, ...rows.map((r) => r?.writes ?? 0));
  return <section className="mb-4 rounded-xl border border-line bg-surface-2 p-4" aria-label="Mức dùng Cloudflare">
    <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-semibold">Mức dùng Cloudflare (D1 của bản này)</h3><button type="button" className="cursor-help text-xs text-ink-3" title="Đếm từ số D1 trả về sau mỗi lượt đồng bộ của bản này; chưa gồm ghi từ thao tác của người dùng và hai bản demo">Cách tính ⓘ</button></div>
    {cycle ? <><p className="mt-1 text-xs text-ink-3">Kỳ {cycle.start} – {cycle.end} (UTC)</p><div className="my-4 grid gap-4 sm:grid-cols-2"><div><Bar label="Dòng ghi kỳ này" value={cycle.writes} limit={cycle.included.writes} /><p className="mt-1 text-xs text-ink-3">Dự tính cả kỳ: {number(cycle.projected)} dòng</p></div><Bar label="Dung lượng" value={cycle.sizeBytes} limit={cycle.included.sizeBytes} size /></div></> : <p className="my-3 text-sm text-ink-3">Chưa tải được mức dùng.</p>}
    <p className="mb-2 text-xs text-ink-3">Trần ngày: 1,2 triệu dòng. Cảnh báo Telegram khi dự tính vượt 40 triệu.</p>
    <p className="text-xs text-ink-3">Dòng ghi theo khâu trong 30 ngày (UTC)</p>
    <div className="mt-2 flex h-32 items-end gap-1"  aria-label="Biểu đồ dòng ghi 30 ngày theo khâu">{days.map((day, i) => <div key={day} className="flex h-full min-w-0 flex-1 flex-col justify-end" title={`${day}: ${rows[i] ? number(rows[i]!.writes) + ' dòng' : 'Chưa có dữ liệu'}\n${Object.keys(labels).map((key) => `${labels[key]}: ${number(rows[i]?.stages[key] ?? 0)}`).join('\n')}`}>{Object.keys(labels).map((key, j) => <div key={key} style={{ height: `${(rows[i]?.stages[key] ?? 0) / max * 100}%`, backgroundColor: colors[j] }} />)}</div>)}</div>
    <div className="mt-1 flex justify-between text-[10px] text-ink-3"><span>{days[0]}</span><span>{today}</span></div>
    <div className="mt-3 flex flex-wrap gap-3 text-xs text-ink-2">{Object.entries(labels).map(([key, label], i) => <span key={key}><span className="mr-1 inline-block size-2 rounded-sm" style={{ backgroundColor: colors[i] }} />{label}</span>)}</div>
  </section>;
}
