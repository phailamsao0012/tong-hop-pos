'use client';

import { Children, Fragment, isValidElement, type ComponentProps, type ReactNode } from 'react';
import type { OverviewReport } from '../overview-view';
import { ChartCard, KpiCard, delta, dmy, pct, shortMoney } from '../ui-kit';
import { peopleTrendSeries } from './d2-people-data';
import { D2Section, D2Table, D2Tray, D2Trend } from './d2';

const flatten = (children: ReactNode): ReactNode[] => Children.toArray(children).flatMap((child) => isValidElement<{ children?: ReactNode }>(child) && child.type === Fragment ? flatten(child.props.children) : [child]);

/** Keep existing KPI tooltips, IDs and actions while sharing the sample's tray. */
export function D2PeopleTray({ children }: { children: ReactNode }) {
  const cards = flatten(children);
  return <div className="d2-people-tray"><D2Tray>{cards.slice(0, 4)}</D2Tray></div>;
}

export function D2PeopleExtra({ children }: { children: ReactNode }) {
  const cards = flatten(children).slice(4);
  return cards.length ? <D2Section title="Chỉ số bổ sung"><div className="d2-people-extra">{cards}</div></D2Section> : null;
}

export function D2PeopleKpi(props: ComponentProps<typeof KpiCard>) {
  const difference = props.delta;
  return <div className="d2-people-metric"><KpiCard {...props} /><div className="d2-foot"><span>So kỳ trước</span><b className={difference == null ? 'd2-flat' : difference > 0 ? 'd2-up' : difference < 0 ? 'd2-down' : 'd2-flat'}>{difference == null ? '—' : !Number.isFinite(difference) ? 'Mới' : `${difference > 0 ? '+' : ''}${pct(difference)}`}</b></div></div>;
}

/** Preserve sortable headers, footers, selection and export controls in existing tables. */
export function D2PeopleSection({ title, subtitle, action, info, children, className = '', id, loading, bodyClassName = '', more, table }: ComponentProps<typeof ChartCard> & { table?: boolean }) {
  const note = <>{subtitle}{action && <div className="d2-people-actions">{action}</div>}{more && (more.href ? <a href={more.href}>{more.label ?? 'Xem thêm'}</a> : <button type="button" onClick={more.onClick}>{more.label ?? 'Xem thêm'}</button>)}</>;
  const content = <>{info && <details className="d2-people-definition"><summary>Cách đọc số</summary>{info}</details>}<div aria-busy={loading} className={`d2-people-body ${bodyClassName}`}>{children}</div></>;
  return <div id={id} className={`d2-people-section-wrap ${className}`}>{table ? <D2Table title={title} note={note}>{content}</D2Table> : <D2Section title={title} note={note} className="d2-people-section">{content}</D2Section>}</div>;
}

export function D2PeopleTrend({ report, title = 'Doanh thu', value, employeeIds }: { report: OverviewReport; title?: string; value?: ReactNode; employeeIds?: readonly string[] }) {
  const series = peopleTrendSeries(report, employeeIds);
  const difference = employeeIds ? null : delta(report.current.total.closedNet, report.compare?.total.closedNet);
  return <D2Trend title={title} value={value ?? shortMoney(report.current.total.closedNet)} change={difference === null ? undefined : { label: !Number.isFinite(difference) ? 'Mới' : `${difference > 0 ? '+' : ''}${pct(difference)}`, direction: difference > 0 ? 'up' : difference < 0 ? 'down' : 'flat' }} labels={series.labels.map(dmy)} current={series.current} previous={series.previous} formatValue={shortMoney} note={employeeIds && !series.labels.length ? 'Báo cáo hiện có chưa cung cấp chuỗi theo ngày cho phạm vi nhân viên này.' : 'Đối chiếu kỳ trước cùng mốc giờ'} />;
}
