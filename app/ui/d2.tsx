'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import { Chart, registerables } from 'chart.js';
import { usePeriod } from '../period-store';
import { usePosIds } from '../pos-store';
import { useScope } from '../access-store';
import { POS } from '@/lib/report-model';
import { PRESETS } from '@/lib/periods';
import { setTheme } from './theme';

Chart.register(...registerables);

export function D2ThemeButton() {
  return <button type="button" className="d2-theme-button" aria-label="Chuyển giao diện sáng / tối" onClick={() => setTheme(document.documentElement.classList.contains('dark') ? 'light' : 'dark')}><span className="d2-theme-light">☾ Tối</span><span className="d2-theme-dark">☀ Sáng</span></button>;
}

/** Presentation only: values, comparison and detail actions come from the caller. */
export type D2Metric = { id: string; label: string; value: ReactNode; change?: { label: string; direction: 'up' | 'down' | 'flat' }; onOpen: () => void };
export function D2Tray(props: { title?: string; note?: ReactNode } & ({ metrics: readonly D2Metric[] } | { children: ReactNode })) {
  const { title = 'Toàn cảnh kỳ này', note } = props;
  return <section className="d2-tray" aria-label={title}><div className="d2-tray-title"><span>{title}</span>{note}</div><div className="d2-kpis">
    {'children' in props ? props.children : props.metrics.map((m) => <button type="button" className="d2-kpi" key={m.id} onClick={m.onOpen} aria-label={`${m.label} · mở chi tiết`}><span className="d2-kpi-body"><span className="d2-kpi-label">{m.label}</span><strong className="num">{m.value}</strong></span><span className="d2-foot"><span>So kỳ trước</span>{m.change ? <b className={`d2-${m.change.direction}`}>{m.change.label}</b> : <span>—</span>}</span></button>)}
  </div></section>;
}

export function D2Section({ title, note, children, className = '' }: { title: ReactNode; note?: ReactNode; children: ReactNode; className?: string }) {
  return <section className={`d2-card d2-section ${className}`}><div className="d2-section-head"><h2>{title}</h2>{note && <div className="d2-note">{note}</div>}</div>{children}</section>;
}

export type D2Column<T> = { key: string; label: string; render: (row: T, index: number) => ReactNode; numeric?: boolean };
export function D2Table<T>(props: { title: string; note?: ReactNode; columns: readonly D2Column<T>[]; rows: readonly T[]; rowKey: (row: T) => string; name: (row: T) => ReactNode; subtitle?: (row: T) => ReactNode; status?: (row: T) => ReactNode } | { title: string; note?: ReactNode; children: ReactNode }) {
  if ('children' in props) return <D2Section title={props.title} note={props.note} className="d2-table-card">{props.children}</D2Section>;
  const { title, note, columns, rows, rowKey, name, subtitle, status } = props;
  // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- Keyboard users must be able to scroll the wide table region.
  return <D2Section title={title} note={note} className="d2-table-card"><section className="d2-table-wrap" tabIndex={0} aria-label={`Bảng ${title}, cuộn ngang trên điện thoại`}><table className="d2-table"><thead><tr><th scope="col">{title}</th>{columns.map((c) => <th key={c.key} scope="col" className={c.numeric ? 'd2-numeric' : ''}>{c.label}</th>)}{status && <th scope="col" className="d2-numeric">Trạng thái</th>}</tr></thead><tbody>
    {rows.map((r, i) => <tr key={rowKey(r)}><td><span className="d2-avatar" aria-hidden="true">{String(i + 1).padStart(2, '0')}</span><span>{name(r)}{subtitle && <span className="d2-row-sub">{subtitle(r)}</span>}</span></td>{columns.map((c) => <td key={c.key} className={c.numeric ? 'd2-numeric num' : ''}>{c.render(r, i)}</td>)}{status && <td className="d2-numeric"><span className="d2-status">{status(r)}</span></td>}</tr>)}
    {!rows.length && <tr><td colSpan={columns.length + (status ? 2 : 1)}>Chưa có dữ liệu trong kỳ này.</td></tr>}
  </tbody></table></section></D2Section>;
}

/** No fetching or aggregation: series must already use the report's comparison cutoff. */
export function D2Trend({ title, value, change, note, labels, current, previous, formatValue = String }: { title: string; value: ReactNode; change?: D2Metric['change']; note?: ReactNode; labels: readonly string[]; current: readonly (number | null)[]; previous: readonly (number | null)[]; formatValue?: (value: number) => string }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (!canvas.current) return;
    const css = getComputedStyle(document.documentElement);
    const color = (key: string) => css.getPropertyValue(key).trim();
    const chart = new Chart(canvas.current, { type: 'line', data: { labels: [...labels], datasets: [
      { label: 'Kỳ này', data: [...current], borderColor: color('--primary'), borderWidth: 2.5, pointRadius: 0, tension: .35 },
      { label: 'Kỳ trước cùng mốc giờ', data: [...previous], borderColor: color('--ink-3'), borderWidth: 2, borderDash: [5, 5], pointRadius: 0, tension: .35 },
    ] }, options: { responsive: true, maintainAspectRatio: false, animation: false, interaction: { mode: 'index', intersect: false }, plugins: { legend: { display: false }, tooltip: { callbacks: { label: (ctx) => `${ctx.dataset.label}: ${ctx.parsed.y === null ? '—' : formatValue(ctx.parsed.y)}` } } }, scales: { x: { grid: { display: false }, ticks: { color: color('--ink-3'), font: { size: 12, family: color('--font-ui') } } }, y: { grid: { color: color('--chart-grid') }, ticks: { color: color('--ink-3'), callback: (v) => formatValue(Number(v)), font: { size: 12 } }, border: { display: false } } } } });
    const observer = new MutationObserver(() => { const styles = getComputedStyle(document.documentElement); chart.data.datasets[0].borderColor = styles.getPropertyValue('--primary').trim(); chart.data.datasets[1].borderColor = styles.getPropertyValue('--ink-3').trim(); const scales = chart.options.scales!; for (const axis of ['x', 'y']) scales[axis]!.ticks!.color = styles.getPropertyValue('--ink-3').trim(); scales.y!.grid!.color = styles.getPropertyValue('--chart-grid').trim(); chart.update('none'); });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => { observer.disconnect(); chart.destroy(); };
  }, [labels, current, previous, formatValue]);
  // eslint-disable-next-line jsx-a11y/prefer-tag-over-role -- Chart.js draws into a canvas, which needs an accessible image role.
  return <section className="d2-card d2-trend"><div className="d2-trend-copy"><p className="d2-eyebrow">XU HƯỚNG TRONG KỲ</p><h2>{title}</h2><strong className="d2-big num">{value}</strong>{change && <p className={`d2-${change.direction}`}>{change.label} <span className="d2-note">so kỳ trước</span></p>}<div className="d2-note">{note ?? 'Đối chiếu cùng mốc giờ'}</div></div><div className="d2-chart"><div className="d2-chart-canvas"><canvas ref={canvas} role="img" aria-label={`${title}: kỳ này và kỳ trước cùng mốc giờ`} /></div><div className="d2-legend"><span><i />Kỳ này</span><span><i className="d2-previous" />Kỳ trước cùng mốc giờ</span></div></div></section>;
}

export function D2PageHead({ title, description, teamFilter }: { title: string; description: string; teamFilter: ReactNode }) {
  const period = usePeriod();
  const [posIds, setPosIds] = usePosIds();
  const scope = useScope();
  return <div className="d2-page-head"><div><h1 className="d2-page-title">{title}</h1><p className="d2-description">{description}</p></div><div className="d2-filters" aria-label="Phạm vi báo cáo">
    <details className="d2-period"><summary>{period.start.split('-').reverse().join('/')} – {period.end.split('-').reverse().join('/')}</summary><div className="d2-period-pop"><label>Kỳ báo cáo<select value={period.preset} onChange={(e) => period.setPreset(e.target.value)}>{Object.entries(PRESETS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label><label>Từ ngày<input type="date" value={period.start} max={period.end} onChange={(e) => period.setStart(e.target.value)} /></label><label>Đến ngày<input type="date" value={period.end} min={period.start} onChange={(e) => period.setEnd(e.target.value)} /></label></div></details>
    <details className="d2-period"><summary>{posIds.length === POS.length ? 'Tất cả POS' : `POS (${posIds.filter((id) => !scope.posIds || scope.posIds.includes(id)).length})`}</summary><div className="d2-period-pop"><button type="button" onClick={() => setPosIds(POS.map((p) => p.id))}>Tất cả POS</button>{POS.filter((p) => !scope.posIds || scope.posIds.includes(p.id)).map((p) => <label key={p.id}><input type="checkbox" checked={posIds.includes(p.id)} onChange={(e) => setPosIds(e.target.checked ? [...posIds, p.id] : posIds.filter((id) => id !== p.id))} />{p.name}</label>)}</div></details>{teamFilter}
  </div></div>;
}
