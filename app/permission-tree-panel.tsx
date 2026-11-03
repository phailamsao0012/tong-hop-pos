'use client';

// Sơ đồ quyền xem (anh Vũ 03/11/2026): Giám đốc → Leader → Mentor → Team, mỗi tài khoản ghi xem được bộ phận nào, POS nào, những ai.
// Chỉ hiển thị; sửa quyền ở Chia team (gán Mentor / Leader) và Tài khoản (bộ phận, POS).
import { useMemo, useState } from 'react';
import { ChevronDown, Network, TriangleAlert } from 'lucide-react';
import { buildPermissionTree, deptLabel, posLabel, type PermissionTree, type TreeAccount, type TreeTeam, type Viewer } from '@/lib/teams/permission-tree';
import { officeLabel, type WebTeam } from '@/lib/teams/web-teams';
import { ChartCard, ErrorBox } from './ui-kit';
import { useApi } from './use-api';

type Data = { teams: WebTeam[]; people: { id: string; name: string }[]; viewers?: Viewer[] };
const ROLE: Record<string, string> = { director: 'Giám đốc', lead: 'Leader', mentor: 'Mentor', staff: 'Nhân viên' };

const TONE: Record<string, string> = { director: 'var(--primary)', lead: '#2563eb', mentor: '#b45309' };

/** Một ô trên sơ đồ: vai trò, tên, bộ phận · POS, số người; bấm ra danh sách tên. */
function Node({ a, team }: { a?: TreeAccount; team?: TreeTeam }) {
  const [open, setOpen] = useState(false);
  const people = a ? a.people : team!.people;
  const color = a ? TONE[a.role] ?? 'var(--line-3)' : 'var(--line-3)';
  const lines = a
    ? [`${deptLabel(a.dept)} · ${posLabel(a.pos)}`, ...(a.role === 'mentor' ? a.teams.map((t) => [t.name, officeLabel(t.office)].filter(Boolean).join(' · ')) : [])]
    : [officeLabel(team!.office) || ' '];
  return (
    <div className={`w-44 rounded-xl border bg-surface px-3 py-2.5 text-center ${a ? '' : 'border-dashed'}`} style={{ borderTop: `4px ${a ? 'solid' : 'dashed'} ${color}` }}>
      <span className="block text-[11px] font-bold uppercase tracking-[.05em]" style={{ color }}>{a ? ROLE[a.role] ?? a.role : 'Chưa có mentor'}</span>
      <b className="block text-[14px] font-semibold text-ink">{a ? a.name : team!.name}</b>
      {lines.map((l, i) => <span key={i} className="block text-[12px] leading-snug text-ink-3">{l}</span>)}
      <button type="button" disabled={!people?.length} onClick={() => setOpen((o) => !o)} aria-expanded={open}
        className="mt-1.5 inline-flex items-center gap-1 rounded-full bg-tint px-2.5 py-0.5 text-[12px] font-semibold text-primary disabled:cursor-default">
        {people ? `${people.length} người` : a?.role === 'director' ? 'Cả công ty' : 'Cả bộ phận'}{people?.length ? <ChevronDown size={13} className={open ? 'rotate-180' : ''} /> : null}
      </button>
      {open && people && <span className="mt-1.5 block text-left text-[12px] leading-relaxed text-ink-2">{people.join(', ')}</span>}
      {a?.warnings.map((w) => <span key={w} className="mt-1.5 flex items-start gap-1 rounded-lg bg-warn-bg px-1.5 py-1 text-left text-[11.5px] text-warn"><TriangleAlert size={13} className="mt-0.5 shrink-0" />{w}</span>)}
    </div>
  );
}

const Down = () => <span aria-hidden="true" className="mx-auto block h-4 w-0.5 bg-[var(--line-2)]" />;

/** Một nhánh: ô cha, dây xuống, các ô con xếp hàng (tự xuống dòng trên điện thoại, không kéo ngang). */
function Branch({ head, kids }: { head: React.ReactNode; kids: React.ReactNode[] }) {
  return (
    <div className="flex flex-col items-center">
      {head}
      {kids.length > 0 && <>
        <Down />
        <div className="flex flex-wrap justify-center gap-3 border-t-2 border-[var(--line-2)] px-2 pt-4">{kids}</div>
      </>}
    </div>
  );
}

export function PermissionTreeView({ tree }: { tree: PermissionTree }) {
  const leaders = tree.leaders.map((l) => {
    const covered = new Set(l.mentors.flatMap((m) => m.teams.map((t) => t.id)));
    const bare = l.teams.filter((t) => !covered.has(t.id));
    return <Branch key={l.id} head={<Node a={l} />} kids={[...l.mentors.map((m) => <Node key={m.id} a={m} />), ...bare.map((t) => <Node key={t.id} team={t} />)]} />;
  });
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-[12.5px] text-ink-3">
        {(['director', 'lead', 'mentor'] as const).map((r) => <span key={r} className="inline-flex items-center gap-1.5"><i className="size-2.5 rounded-sm" style={{ background: TONE[r] }} />{ROLE[r]}: {r === 'director' ? 'xem hết' : r === 'lead' ? 'xem các team mình quản' : 'chỉ xem team mình'}</span>)}
      </div>
      <div className="flex flex-col items-center">
        <div className="flex flex-wrap justify-center gap-3">
          {tree.top.length ? tree.top.map((a) => <Node key={a.id} a={a} />) : <div className="w-44 rounded-xl border border-dashed px-3 py-2.5 text-center text-[13px] text-ink-3">Chủ hệ thống · xem hết</div>}
        </div>
        {leaders.length > 0 && <><Down /><div className="flex flex-wrap items-start justify-center gap-6 border-t-2 border-[var(--line-2)] pt-4">{leaders}</div></>}
      </div>
      {tree.loneMentors.length > 0 && <Group title="Mentor chưa có Leader" list={tree.loneMentors} />}
      {tree.others.length > 0 && <Group title="Tài khoản khác" list={tree.others} />}
    </div>
  );
}

function Group({ title, list }: { title: string; list: TreeAccount[] }) {
  return (
    <section>
      <h3 className="mb-2 text-[11.5px] font-semibold uppercase tracking-[.07em] text-ink-3">{title}</h3>
      <div className="flex flex-wrap gap-3">{list.map((a) => <Node key={a.id} a={a} />)}</div>
    </section>
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
