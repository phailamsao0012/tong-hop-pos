'use client';
// Tổng quan kiểu mới (cờ THP_UI_MOI, bản demo giao diện; mẫu docs/plans/2026-11-26-tong-quan-kieu-moi/mau-bam-thu.html).
// Chỉ hiển thị số từ /api/reports/overview-moi (gom lại các hàm báo cáo đang có); không tính số nào ở đây ngoài phần trăm để vẽ.
// Mỗi con số ghi rõ là số gì; bấm việc cần xem mở trang chi tiết (bộ lọc kỳ / POS dùng chung nên giữ nguyên).
import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ArrowUpRight, ArrowDownRight, Clock, Megaphone, Percent, ShoppingCart, Sparkles, UsersRound } from 'lucide-react';
import { usePeriod } from './period-store';
import { usePosIds } from './pos-store';
import { useTeam } from './team-store';
import { useApi } from './use-api';
import { ErrorBox, SkeletonKpis, vi } from './ui-kit';
import { StaleChip } from './stale-chip';
import type { OverviewMoi } from '@/lib/reports/overview-moi';

const STATUS_LABEL: Record<string, string> = { new: 'Mới', confirmed: 'Đã xác nhận, đang xử lý', shipping: 'Đang giao', delivered: 'Giao thành công', returned: 'Hoàn', cancelled: 'Hủy, xóa' };
const STATUS_COLOR: Record<string, string> = { new: 'var(--ink-4)', confirmed: 'var(--t-blue)', shipping: 'var(--t-teal)', delivered: 'var(--primary)', returned: 'var(--warn)', cancelled: 'var(--bad)' };
const NEED_ICON = { cancel: AlertTriangle, return: AlertTriangle, close: Percent, roas: Megaphone } as const;
const p1 = (n: number | null | undefined) => n === null || n === undefined ? '—' : `${n.toFixed(1).replace('.', ',')}%`;
const trieu = (n: number) => (n / 1e6).toLocaleString('vi-VN', { maximumFractionDigits: n >= 1e9 ? 0 : 1 });
const delta = (cur: number, prev: number | null | undefined) => prev ? (cur - prev) / prev * 100 : null;
/** Tên gọi trong lời chào: tên riêng từ "NV123 - Họ Tên BỘ PHẬN"; tên khác (tài khoản chung, demo) thì không gọi tên. */
function firstName(name: string) {
  const m = name.replace(/\(.*?\)/g, '').trim().match(/^NV\d+\s*-\s*(.+)$/i);
  if (!m) return '';
  const words = m[1].split(/\s+/).filter((w) => w && !/^(CSKH|SALE|MKT)$/i.test(w));
  return words.pop() ?? '';
}
const WEEKDAY = ['Chủ nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'];

function Delta({ v, label }: { v: number | null; label: string }) {
  if (v === null) return <span className="om-pill g">{label}: chưa có số</span>;
  const Up = v >= 0 ? ArrowUpRight : ArrowDownRight;
  return <span className={`om-pill ${v >= 0 ? '' : 'a'}`}><Up size={13} aria-hidden="true" />{v >= 0 ? '+' : ''}{p1(v).replace('%', '')}% {label}</span>;
}

export function OverviewMoiView({ onNavigate, userName }: { onNavigate: (view: string) => void; userName: string }) {
  const { preset, start, end, setPreset } = usePeriod();
  // Mở trang Tổng quan mới: kỳ mặc định 7 ngày (chọn kỳ khác thì giữ trong lúc ở trang).
  useEffect(() => { setPreset('week'); }, [setPreset]);
  const [posIds] = usePosIds();
  const team = useTeam();
  const url = useMemo(() => `/api/reports/overview-moi?${new URLSearchParams({ start, end, posIds: posIds.join(','), team })}`, [start, end, posIds, team]);
  const { data, at, stale, loading, error, reload } = useApi<OverviewMoi>(url, { refreshMs: 10 * 60000, keep: false });
  const [seen, setSeen] = useState<Record<string, boolean>>({});
  const [hourPick, setHourPick] = useState<number | null>(null);
  const [heatPick, setHeatPick] = useState<{ d: string; h: number; v: number } | null>(null);
  // Giờ Việt Nam lấy từ máy chủ (data.now), không đọc đồng hồ trong lúc vẽ.
  const now = data ? new Date(Date.parse(data.now) + 7 * 3600e3) : null;
  const hourNow = now ? now.getUTCHours() : 12;
  const greet = hourNow < 11 ? 'Chào buổi sáng' : hourNow < 14 ? 'Chào buổi trưa' : hourNow < 18 ? 'Chào buổi chiều' : 'Chào buổi tối';
  const first = firstName(userName);

  const seg = (
    <fieldset className="om-seg"><legend className="sr-only">Kỳ xem</legend>
      {([['today', 'Hôm nay'], ['week', '7 ngày'], ['month', 'Tháng này']] as const).map(([k, l]) => (
        <button key={k} type="button" className={preset === k ? 'on' : ''} aria-pressed={preset === k} onClick={() => setPreset(k)}>{l}</button>
      ))}
    </fieldset>
  );
  const head = (
    <>
      <div className="om-eyebrow">{now ? `${WEEKDAY[now.getUTCDay()]}, ${now.getUTCDate()} tháng ${now.getUTCMonth() + 1}` : '\u00a0'}</div>
      <div className="om-h1"><span>{greet}{first ? `, ${first}` : ''}</span><span className="flex items-center gap-2">{seg}<StaleChip at={at} stale={stale} loading={loading} error={data ? error : null} onRetry={reload} /></span></div>
    </>
  );
  if (!data) return <div className="om-page">{head}{error ? <ErrorBox error={error} onRetry={reload} /> : <SkeletonKpis count={4} />}</div>;

  const r = data.revenue, s = data.sale;
  const needs = data.needs.filter((n) => !seen[n.key]);
  const statusTotal = data.status.reduce((t, x) => t + x.orders, 0);
  const maxBar = Math.max(1, ...data.hours.map((h) => Math.max(h.today, h.usual ?? 0)));
  const doneHours = data.hours.filter((h) => h.hour <= hourNow);
  const todaySoFar = doneHours.reduce((t, h) => t + h.today, 0), usualSoFar = doneHours.reduce((t, h) => t + (h.usual ?? 0), 0);
  // Độ đậm theo thấp nhất..cao nhất của chính bảng: ô thấp nhất gần trắng (0,08), cao nhất đậm hẳn (1).
  const heatVals = data.heat.flatMap((w) => w.cells), heatMin = Math.min(...heatVals), heatMax = Math.max(...heatVals);
  const heatOpacity = (v: number) => heatMax > heatMin ? 0.08 + 0.92 * (v - heatMin) / (heatMax - heatMin) : 0.5;
  const open = Math.max(0, s.assigned - s.closedFromAssigned);
  const closedShare = s.assigned ? s.closedFromAssigned / s.assigned : 0;
  const C = 2 * Math.PI * 68;
  const pickHour = hourPick === null ? null : data.hours.find((h) => h.hour === hourPick) ?? null;

  return (
    <div className="om-page">
      {head}
      <div className="om-body">
        <main className="min-w-0">
          <section className="om-card" aria-label="Tóm tắt">
            <div className="om-brief">
              <span className="om-big"><Sparkles size={18} aria-hidden="true" /></span>
              <div><small><u>Tóm tắt</u>Sinh bằng luật từ số trên web, không dùng AI</small><b>{data.brief}</b></div>
            </div>
            {data.needs.length > 0 && (
              <div className="om-need">
                {data.needs.map((n) => {
                  const Icon = NEED_ICON[n.key];
                  return (
                    <button key={n.key} type="button" onClick={() => onNavigate(n.view)}>
                      <span className={`om-tile ${n.tone}`}><Icon size={16} aria-hidden="true" /></span>
                      <span><b>{n.title}</b><span className="om-mute">{n.detail}</span></span>
                    </button>
                  );
                })}
              </div>
            )}
          </section>

          <section className="om-card mt" aria-label="Doanh thu chốt">
            <div className="om-herow">
              <div>
                <div className="om-lab">Doanh thu chốt trong kỳ</div>
                <div className="om-hero">{trieu(r.closedNet)}<small>triệu</small> <Delta v={delta(r.closedNet, r.prevClosedNet)} label="kỳ trước" /></div>
                <div className="om-sub">{vi.format(r.closedOrders)} đơn chốt, trung bình {r.averageOrder ? `${vi.format(Math.round(r.averageOrder / 1000))} nghìn` : '—'} mỗi đơn · theo ngày chốt, như Tổng quan POS</div>
              </div>
              <div className="om-kpis">
                <div><span className="t"><ShoppingCart size={15} aria-hidden="true" />Đơn chốt</span><b>{vi.format(r.closedOrders)}</b><Delta v={delta(r.closedOrders, r.prevClosedOrders)} label="kỳ trước" /></div>
                <div><span className="t"><Percent size={15} aria-hidden="true" />TL chốt data Sale</span><b className={s.dataRate !== null && s.dataRate < 40 ? 'text-bad' : ''}>{p1(s.dataRate)}</b><span className="om-pill g">{vi.format(s.closedFromAssigned)} / {vi.format(s.assigned)} số</span></div>
                <div><span className="t"><AlertTriangle size={15} aria-hidden="true" />Việc cần xem</span><b>{needs.length}</b><span className={`om-pill ${needs.length ? 'a' : 'g'}`}>{needs.length ? 'vượt mốc' : 'chưa có'}</span></div>
              </div>
            </div>
            <div className="om-strow"><b>Đơn tạo trong kỳ đang ở đâu</b><span className="om-mute">{vi.format(statusTotal)} đơn · trạng thái hiện tại</span></div>
            <div className="om-stack" aria-hidden="true">
              {data.status.filter((x) => x.orders > 0).map((x) => <i key={x.key} style={{ width: `${x.orders / Math.max(1, statusTotal) * 100}%`, background: STATUS_COLOR[x.key] }} />)}
            </div>
            <div className="om-leg">
              {data.status.map((x) => <span key={x.key}><i style={{ background: STATUS_COLOR[x.key] }} />{STATUS_LABEL[x.key]}<b>{vi.format(x.orders)}</b>{statusTotal ? p1(x.orders / statusTotal * 100) : '—'}</span>)}
            </div>
          </section>

          <div className="om-row mt">
            <section className="om-card" aria-label="Đơn chốt theo giờ hôm nay">
              <div className="flex flex-wrap justify-between gap-2"><span className="om-ct">Đơn chốt Sale theo giờ, hôm nay</span><span className="om-leg"><span><i style={{ background: 'var(--primary)' }} />Hôm nay</span><span><i style={{ background: 'var(--t-teal)' }} />Thường ngày</span></span></div>
              <div className="my-2"><b className="text-xl">{vi.format(todaySoFar)}</b> <span className="text-ink-2">đơn đến {hourNow}h</span> <Delta v={usualSoFar ? delta(todaySoFar, usualSoFar) : null} label="thường ngày" /></div>
              <div className="om-mute">Thường ngày = trung bình cùng thứ 4 tuần trước, cùng khung giờ (Phân tích Sale).</div>
              <div className="om-bars" onMouseLeave={() => setHourPick(null)}>
                {data.hours.map((h) => (
                  <button key={h.hour} type="button" className={`om-bc ${h.hour === hourNow ? 'now' : ''} ${hourPick === h.hour ? 'on' : ''}`} onMouseEnter={() => setHourPick(h.hour)} onClick={() => setHourPick(h.hour)}
                    aria-label={`${h.hour}h: hôm nay ${h.today} đơn, thường ngày ${h.usual ?? '—'} đơn`}>
                    <span className="om-tr">
                      {h.usual !== null && h.hour >= hourNow && <i className="e" style={{ height: `${h.usual / maxBar * 100}%` }} />}
                      {/* Giờ đã qua: chỉ hôm nay; giờ hiện tại: chồng hai màu; giờ chưa tới: chỉ thường ngày. */}
                      {h.hour <= hourNow && h.today > 0 && <i className="f" style={{ height: `${h.today / maxBar * 100}%` }} />}
                    </span>
                    <span className="lb">{h.hour % 3 === 0 || h.hour === 20 ? `${h.hour}h` : ''}</span>
                  </button>
                ))}
              </div>
              <div className="om-mute mt-2" aria-live="polite">{pickHour ? `${pickHour.hour}h: hôm nay ${vi.format(pickHour.today)} đơn · thường ngày ${pickHour.usual === null ? '—' : vi.format(pickHour.usual)} đơn` : 'Rê chuột hoặc chạm một cột để xem số.'}</div>
            </section>
            <section className="om-card" aria-label="Số về đi đâu">
              <span className="om-ct">Số về Sale đi đâu</span>
              <div className="om-mute mt-1">{vi.format(s.assigned)} số chia cho Sale trong kỳ</div>
              <div className="om-dwrap">
                <svg width="160" height="160" viewBox="0 0 160 160" aria-hidden="true">
                  <circle cx="80" cy="80" r="68" stroke="var(--surface-3)" />
                  <circle cx="80" cy="80" r="68" stroke="var(--chart-ky-nay, var(--primary))" style={{ strokeDasharray: `${Math.max(0, closedShare * C - 2)} ${C}` }} />
                </svg>
                <div className="om-dmid"><span><b>{s.assigned ? Math.round(closedShare * 100) : 0}%</b><span className="om-mute">đã chốt</span></span></div>
              </div>
              <div className="om-li"><i style={{ background: 'var(--primary)' }} /><span>Đã chốt</span><b>{vi.format(s.closedFromAssigned)}</b><em>{p1(s.dataRate)}</em></div>
              <div className="om-li"><i style={{ background: 'var(--surface-3)' }} /><span>Chưa chốt</span><b>{vi.format(open)}</b><em>{s.assigned ? p1(open / s.assigned * 100) : '—'}</em></div>
              <div className="om-ins">Web chưa tách “đang chăm” và “không chốt” nên chỉ chia hai phần.</div>
            </section>
          </div>

          <div className="om-row mt">
            <section className="om-card" aria-label="Số về lúc nào">
              <span className="om-ct">Số về lúc nào</span>
              <div className="om-mute mb-2 mt-1" aria-live="polite">{heatPick ? <><b className="text-ink">{heatPick.d}, {heatPick.h}h–{heatPick.h + 2}h</b> · trung bình {vi.format(heatPick.v)} số mỗi ngày</> : 'Số chia cho Sale trung bình mỗi ngày, mỗi ô 2 giờ · 4 tuần gần nhất · bấm một ô để xem'}</div>
              {data.heat.map((w) => (
                <div key={w.label} className="om-hr"><span>{w.label}</span>
                  {w.cells.map((v, i) => (
                    <button key={i} type="button" style={{ opacity: heatOpacity(v) }} className={heatPick?.d === w.label && heatPick.h === data.heatHours[i] ? 'on' : ''}
                      onMouseEnter={() => setHeatPick({ d: w.label, h: data.heatHours[i], v })} onClick={() => setHeatPick({ d: w.label, h: data.heatHours[i], v })}
                      aria-label={`${w.label} ${data.heatHours[i]} giờ: ${v} số`} />
                  ))}
                </div>
              ))}
              <div className="om-hr mt-2"><span />{data.heatHours.map((h) => <em key={h}>{h}h</em>)}</div>
            </section>
            <section className="om-card" aria-label="Hủy sau chốt">
              <div className="flex justify-between"><span className="om-ct">Hủy sau chốt (Sale)</span><button type="button" className="font-semibold text-primary" onClick={() => onNavigate('sale-analytics')}>Xem chi tiết ›</button></div>
              <div className="my-2"><b className={`text-xl ${s.cancelRate !== null && s.cancelRate >= 5 ? 'text-bad' : ''}`}>{p1(s.cancelRate)}</b> <span className="text-ink-2">đơn đã xác nhận rồi hủy</span></div>
              <div className="om-mute">Hoàn: {p1(s.returnRate)} đơn chốt · mốc đỏ hủy 5%, hoàn 7%</div>
              {data.cancelStaff.length ? (
                <div className="om-call">
                  <div className="font-semibold">{data.cancelStaff.length} người bán hủy từ 5% trở lên</div>
                  {data.cancelStaff.map((x) => <div key={x.id} className="om-li"><i style={{ background: 'var(--bad)' }} /><span>{x.name}</span><b>{p1(x.rate)}</b><em>{vi.format(x.closed)} đơn</em></div>)}
                  <button type="button" onClick={() => onNavigate('sale-analytics')}>Mở Phân tích Sale</button>
                </div>
              ) : <div className="om-ins mt-3">Không có người bán nào (từ 10 đơn chốt) hủy từ 5%.</div>}
            </section>
          </div>
          <details className="om-missing mt">
            <summary>Bản thử chưa có</summary>
            <ul>{data.missing.map((m) => <li key={m}>{m}</li>)}</ul>
          </details>
        </main>

        <aside className="om-rail">
          <section className="om-card" aria-label="Cần xử lý">
            <span className="om-ct">Cần xử lý</span>
            <div className="om-mute mb-1 mt-1">{needs.length} việc vượt mốc · bấm dấu để đánh dấu đã xem (chỉ trên máy này)</div>
            {data.needs.length ? data.needs.map((n) => {
              const Icon = NEED_ICON[n.key];
              return (
                <div key={n.key} className={`om-ri ${seen[n.key] ? 'gone' : ''}`}>
                  <button type="button" className="flex min-w-0 flex-1 items-center gap-3 text-left" onClick={() => onNavigate(n.view)}><span className="om-tile round"><Icon size={16} aria-hidden="true" /></span><span className="min-w-0"><b>{n.title}</b><span className="om-mute">{n.detail}</span></span></button>
                  <button type="button" className="om-check" aria-pressed={!!seen[n.key]} aria-label={seen[n.key] ? 'Bỏ đánh dấu đã xem' : 'Đánh dấu đã xem'} onClick={() => setSeen((v) => ({ ...v, [n.key]: !v[n.key] }))}>✓</button>
                </div>
              );
            }) : <div className="om-mute py-2">Chưa có việc nào vượt mốc.</div>}
          </section>
          <section className="om-card mt" aria-label="Hôm nay">
            <span className="om-ct">Hôm nay</span>
            <div className="om-mute mb-1 mt-1">Từ 0h đến giờ</div>
            <button type="button" className="om-ri" onClick={() => onNavigate('sale-analytics')}><span className="om-tile round"><UsersRound size={16} aria-hidden="true" /></span><span><b>Sale</b><span className="om-mute">{vi.format(data.todaySale.assigned)} số về · {vi.format(data.todaySale.closed)} đơn chốt</span></span></button>
            {data.cost && <button type="button" className="om-ri" onClick={() => onNavigate('mkt-roas')}><span className="om-tile round"><Megaphone size={16} aria-hidden="true" /></span><span><b>Marketing (cả kỳ)</b><span className="om-mute">chi {trieu(data.cost.cost)}tr · ROAS {data.cost.roas === null ? '—' : data.cost.roas.toFixed(2).replace('.', ',')}</span></span></button>}
            <div className="om-ri"><span className="om-tile round"><Clock size={16} aria-hidden="true" /></span><span><b>CSKH</b><span className="om-mute">chưa có mốc gọi, xem trang Cuộc gọi</span></span></div>
          </section>
        </aside>
      </div>
    </div>
  );
}
