'use client';

// Sơ đồ quyền xem (anh Vũ 03/11/2026): Giám đốc → Leader → Mentor → Team, mỗi tài khoản ghi xem được bộ phận nào, POS nào, những ai.
// Chỉ hiển thị; sửa quyền ở Chia team (gán Mentor / Leader) và Tài khoản (bộ phận, POS).
import { useMemo, useState } from 'react';
import { ChevronDown, Network, TriangleAlert } from 'lucide-react';
import { buildPermissionTree, deptLabel, posLabel, type PermissionTree, type TreeAccount, type Viewer } from '@/lib/teams/permission-tree';
import { officeLabel, type WebTeam } from '@/lib/teams/web-teams';
import { ChartCard, ErrorBox } from './ui-kit';
import { useApi } from './use-api';

type Data = { teams: WebTeam[]; people: { id: string; name: string }[]; viewers?: Viewer[] };
const ROLE: Record<string, string> = { director: 'Giám đốc', lead: 'Leader', mentor: 'Mentor', staff: 'Nhân viên' };

function Account({ a, depth, children }: { a: TreeAccount; depth: number; children?: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <li className="relative" style={{ paddingLeft: depth ? 20 : 0 }}>
      {depth > 0 && <span aria-hidden="true" className="absolute left-2 top-0 h-full w-px bg-[var(--line)]" />}
      <div className="rounded-xl border bg-surface p-3">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <b className="text-[14px] font-semibold text-ink">{a.name}</b>
          <span className="rounded-full bg-tint px-2 py-0.5 text-[11.5px] font-semibold text-primary">{ROLE[a.role] ?? a.role}</span>
          <span className="text-[12.5px] text-ink-3">{deptLabel(a.dept)} · {posLabel(a.pos)} · {a.people ? `${a.people.length} người` : 'cả bộ phận'}</span>
          {a.people && a.people.length > 0 && (
            <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="ml-auto inline-flex items-center gap-1 text-[12px] text-ink-3 hover:text-ink">
              Xem người <ChevronDown size={14} className={open ? 'rotate-180' : ''} />
            </button>
          )}
        </div>
        {a.teams.length > 0 && (
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {a.teams.map((t) => <span key={t.id} className="rounded-full border px-2 py-0.5 text-[12px] text-ink-2">{t.name}{t.office ? ` · ${officeLabel(t.office)}` : ''}{t.mentor && a.role !== 'mentor' ? ` · Mentor ${t.mentor}` : ''}</span>)}
          </div>
        )}
        {open && a.people && <p className="mt-1.5 text-[12.5px] leading-relaxed text-ink-2">{a.people.join(', ')}</p>}
        {a.warnings.map((w) => <p key={w} className="mt-1.5 flex items-start gap-1.5 text-[12.5px] text-warn"><TriangleAlert size={14} className="mt-0.5 shrink-0" />{w}</p>)}
      </div>
      {children && <ul className="mt-2 space-y-2">{children}</ul>}
    </li>
  );
}

export function PermissionTreeView({ tree }: { tree: PermissionTree }) {
  return (
    <ul className="space-y-2">
      <li className="rounded-xl border border-dashed p-3 text-[13px] text-ink-2"><b className="font-semibold text-ink">Chủ hệ thống</b> · xem và sửa mọi thứ</li>
      {tree.top.map((a) => <Account key={a.id} a={a} depth={0} />)}
      {tree.leaders.map((l) => (
        <Account key={l.id} a={l} depth={0}>
          {l.mentors.map((m) => <Account key={m.id} a={m} depth={1} />)}
        </Account>
      ))}
      {tree.loneMentors.length > 0 && <li className="pt-1 text-[11.5px] font-semibold uppercase tracking-[.07em] text-ink-3">Mentor chưa có Leader</li>}
      {tree.loneMentors.map((m) => <Account key={m.id} a={m} depth={0} />)}
      {tree.others.length > 0 && <li className="pt-1 text-[11.5px] font-semibold uppercase tracking-[.07em] text-ink-3">Tài khoản khác</li>}
      {tree.others.map((a) => <Account key={a.id} a={a} depth={0} />)}
    </ul>
  );
}

export function PermissionTreePanel() {
  const { data, error } = useApi<Data>('/api/web-teams');
  const tree = useMemo(() => data && buildPermissionTree(data.viewers ?? [], data.teams, new Map(data.people.map((p) => [p.id, p.name]))), [data]);
  return (
    <ChartCard icon={Network} title="Sơ đồ quyền" subtitle="Ai xem được bộ phận, POS và người nào. Sửa ở Chia team (Mentor, Leader) và Tài khoản (bộ phận, POS).">
      {error ? <ErrorBox error={error} /> : !tree ? <p className="text-sm text-ink-3">Đang tải…</p> : (
        <PermissionTreeView tree={tree} />
      )}
    </ChartCard>
  );
}
