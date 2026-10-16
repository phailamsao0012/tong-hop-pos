'use client';

import { useEffect, useState } from 'react';
import { AlertTriangle, CalendarDays, Clock } from 'lucide-react';
import type { SessionUser } from '@/lib/auth';
import type { MyTask, TaskScope, TaskState } from '@/lib/my-tasks';
import { EmptyState, ErrorBox, KpiCard, SkeletonKpis, StatusChip, TableWrap, dt, vi } from './ui-kit';

import { CustomerDetail } from './customer-detail';

type TaskResult = { counts: Record<TaskState, number>; items: MyTask[] };
const STATES = [
  { key: 'overdue', label: 'Quá hạn', icon: AlertTriangle, tone: 'red' },
  { key: 'today', label: 'Hôm nay', icon: CalendarDays, tone: 'orange' },
  { key: 'planned', label: 'Sắp tới', icon: Clock, tone: 'blue' },
] as const;

export function TasksView({ user, onNavigate }: { user: SessionUser; onNavigate: (link: MyTask['link']) => void }) {
  const [customer, setCustomer] = useState<{ customerId: string } | null>(null);
  const [scope, setScope] = useState<TaskScope>('mine');
  const [filter, setFilter] = useState<TaskState | null>(null);
  const [result, setResult] = useState<TaskResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    const load = async () => {
      try {
        const response = await fetch('/api/tasks?scope=' + scope, { cache: 'no-store', signal: controller.signal });
        const body = await response.json() as TaskResult & { error?: string };
        if (!response.ok) throw new Error(body.error || 'Không tải được việc.');
        if (!controller.signal.aborted) { setResult(body as TaskResult); setError(null); }
      } catch (e) {
        if (!controller.signal.aborted) { setResult(null); setError(e instanceof Error ? e.message : 'Không tải được việc.'); }
      } finally { if (!controller.signal.aborted) setLoading(false); }
    };
    void load();
    const timer = window.setInterval(() => { void load(); }, 120000);
    return () => { controller.abort(); window.clearInterval(timer); };
  }, [scope, retry]);
  return (
    <section className="tasks-page space-y-4" aria-label="Việc của tôi" aria-busy={loading}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">Việc của tôi</h1>
        {user.role !== 'staff' && <fieldset className="flex flex-wrap gap-1" aria-label="Phạm vi việc">
          {(['mine', 'team', ...(user.role === 'owner' || user.role === 'director' ? ['all'] as const : [])] as TaskScope[]).map((key) => (
            <button key={key} type="button" className={'btn sm ' + (scope === key ? 'primary' : '')} aria-pressed={scope === key} onClick={() => { if (scope !== key) { setResult(null); setError(null); setLoading(true); setScope(key); } }}>
              {key === 'mine' ? 'Của tôi' : key === 'team' ? 'Cả team' : 'Tất cả'}
            </button>
          ))}
        </fieldset>}
      </div>
      {error && <ErrorBox error={error} onRetry={() => { setLoading(true); setError(null); setRetry((n) => n + 1); }} />}
      {loading && <SkeletonKpis count={3} />}
      {result && <>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {STATES.map((state) => <KpiCard key={state.key} icon={state.icon} tone={state.tone} label={state.label} value={vi.format(result.counts[state.key])} active={filter === state.key} onClick={() => setFilter((current) => current === state.key ? null : state.key)} />)}
        </div>
        {filter && <button type="button" className="btn sm" onClick={() => setFilter(null)}>Hiện tất cả trạng thái</button>}
        {!result.items.length ? <EmptyState text="Không có việc tồn" /> : !result.items.some((item) => !filter || item.state === filter) ? <EmptyState text="Không có việc trong trạng thái này" /> : STATES.filter((state) => !filter || state.key === filter).map((state) => {
          const items = result.items.filter((item) => item.state === state.key);
          if (!items.length) return null;
          return <section key={state.key} className="space-y-2" aria-label={state.label}>
            <h2 className="flex items-center gap-2 text-sm font-semibold">{state.label}<StatusChip tone={state.tone}>{vi.format(items.length)}</StatusChip></h2>
            <TableWrap><ul className="tasks-list">
              {items.map((item) => <li key={item.kind + ':' + item.id}>
                <button type="button" className="task-row" onClick={() => { if (item.kind !== 'stuck' && item.customerId) setCustomer({ customerId: item.customerId }); else onNavigate(item.link); }}>
                  <span className="min-w-0 flex-1"><span className="block font-medium">{item.title}</span><span className="block text-xs text-ink-3">{item.subtitle}</span></span>
                  <span className="text-xs text-ink-3">{item.dueAt ? dt(item.dueAt, true) : 'Chưa có ghi chú'}</span>
                  <StatusChip tone={state.tone}>{state.label}</StatusChip>
                </button>
              </li>)}
            </ul></TableWrap>
          </section>;
        })}
      </>}
      <CustomerDetail customer={customer} onClose={() => setCustomer(null)} />
    </section>
  );
}
