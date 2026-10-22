'use client';

// Ô chọn một team bên web nhân sự trên thanh trên cùng (anh Vũ 10/10/2026: "xem được thông số theo team"), cạnh nút Tất cả / Sale / CSKH.
// Danh sách team lấy từ /api/teams?list=1 (đơn vị kind=team bên web nhân sự, nhóm theo bộ phận và chi nhánh).
import { useState } from 'react';
import { Check, ChevronDown, ChevronRight, UsersRound } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { setHrUnit, useHrUnit, useTeam, setMktTeam, useMktTeam, type HrUnit } from './team-store';
import { useApi } from './use-api';
import { pickerGroups } from '@/lib/team-picker-groups';

type TeamItem = { id: string; name: string; office: string | null; dept: 'sale' | 'cskh' | 'mkt'; people: number; mentor: string | null; members?: string[] };
const DEPT_LABEL = { mkt: 'Team MKT', sale: 'Team Sale', cskh: 'Team CSKH' } as const;
/** "Sale HN · Team Đại Bàng" → "Team Đại Bàng" cho nút nhỏ; tên đầy đủ ở danh sách. */
const shortName = (name: string) => name.split(' · ').pop() ?? name;

export function HrTeamPicker({ className = '' }: { className?: string }) {
  const selectedMkt = useMktTeam();
  const mktApi = useApi<{ teams: { id: string; name: string }[] }>('/api/marketing-teams');
  const unit = useHrUnit();
  const team = useTeam();
  const api = useApi<{ teams: TeamItem[] }>('/api/teams?list=1');
  const teams = api.data?.teams ?? [];
  if (!teams.length && !unit && !mktApi.data?.teams.length) return null;
  const depts = (['sale', 'cskh'] as const).filter((d) => team === 'all' || team === d || unit?.dept === d);
  const pick = (t: TeamItem | null) => { if (t?.dept === 'mkt') return; setHrUnit(t ? { id: t.id, name: t.name, dept: t.dept } satisfies HrUnit : null); };
  return (
    <Popover>
      <PopoverTrigger render={<button type="button" aria-label="Chọn team" className={`btn sm ${unit ? 'is-warn' : ''} ${className}`} title={unit ? `Đang xem riêng team ${unit.name}` : 'Xem riêng một team'} />}>
        <UsersRound size={14} aria-hidden="true" />
        <span className="max-w-36 truncate">{selectedMkt ? shortName(selectedMkt.name) : unit && !unit.branchOnly ? shortName(unit.name) : 'Team'}</span>
      </PopoverTrigger>
      <PopoverContent align="end" className="max-h-[70vh] w-80 overflow-y-auto p-2">
        <button type="button" onClick={() => { pick(null); setMktTeam(null); }}
          className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-surface-2 ${unit ? 'text-ink' : 'bg-tint font-semibold text-primary'}`}>
          <Check size={14} className={unit ? 'invisible' : ''} aria-hidden="true" />Mọi team{team !== 'all' ? ` ${DEPT_LABEL[team]}` : ''}
        </button>
        <p className="mt-1 border-t px-2 pt-2 text-[11px] font-semibold text-ink-3">Team MKT</p>
        {[...(mktApi.data?.teams ?? []), { id: '__unassigned', name: 'Không thuộc team MKT' }].map((t) => {
          const full = teams.find((x) => x.dept === 'mkt' && x.id === t.id);
          return <TeamRow key={t.id} t={{ office: null, people: 0, mentor: null, ...full, id: t.id, name: t.name, dept: 'mkt' }} child={false} on={selectedMkt?.id === t.id} onPick={() => setMktTeam(t)} />;
        })}
        {/* Lọc mẹ-con (anh Vũ 21/10/2026): mỗi người phụ trách là một nhóm (Team C Mơ), bấm tên nhóm xem gộp, bấm mũi tên xổ các team con (Sale HN, Sale TN của người đó).
            Nhóm theo mentor hoặc đuôi tên team, xem lib/team-picker-groups.ts. */}
        {depts.map((d) => {
          const list = teams.filter((t) => t.dept === d);
          if (!list.length) return null;
          const rows = pickerGroups(list);
          return (
            <div key={d}>
              <p className="mt-1 border-t px-2 pt-2 text-[11px] font-semibold uppercase tracking-wide text-ink-3">{DEPT_LABEL[d]}</p>
              {rows.map((g) => <TeamGroup key={`${d}:${g.key}`} label={g.label} mentor={g.mentor} teams={g.teams} unitId={unit?.id ?? null} onPick={pick} onPickGroup={(ids, name) => setHrUnit({ id: ids.join(','), name, dept: d })} />)}
            </div>
          );
        })}
      </PopoverContent>
    </Popover>
  );
}

/** Một người phụ trách và các team của họ. Một team thì hiện như một dòng thường. */
function TeamGroup({ label, mentor, teams, unitId, onPick, onPickGroup }: { label: string | null; mentor: string | null; teams: TeamItem[]; unitId: string | null; onPick: (t: TeamItem) => void; onPickGroup: (ids: string[], name: string) => void }) {
  const ids = teams.map((t) => t.id);
  const groupOn = unitId === ids.join(',');
  const childOn = !!unitId && ids.includes(unitId);
  const [open, setOpen] = useState(childOn);
  const people = teams.reduce((n, t) => n + t.people, 0);
  const row = (t: TeamItem, child: boolean) => <TeamRow key={t.id} t={t} child={child} on={unitId === t.id} onPick={onPick} />;
  if (teams.length === 1) return row(teams[0], false);
  const name = label ?? 'Team';
  return (
    <div>
      <div className={`flex w-full items-stretch rounded-md ${groupOn ? 'bg-tint text-primary' : 'text-ink'}`}>
        <button type="button" onClick={() => onPickGroup(ids, name)} className="flex min-w-0 flex-1 items-start gap-2 rounded-md px-2 py-1.5 text-left text-sm font-semibold hover:bg-surface-2" title={`Xem gộp ${teams.length} team của ${name}`}>
          <Check size={14} className={`mt-0.5 shrink-0 ${groupOn ? '' : 'invisible'}`} aria-hidden="true" />
          <span>{name}<span className="block text-[11px] font-normal text-ink-3">{teams.length} team · {people} người{mentor ? ` · Mentor ${mentor}` : ''}</span></span>
        </button>
        <button type="button" aria-expanded={open} aria-label={open ? `Thu gọn ${name}` : `Xem các team của ${name}`} onClick={() => setOpen(!open)} className="grid w-9 shrink-0 place-items-center rounded-md text-ink-3 hover:bg-surface-2 hover:text-ink">
          <ChevronRight size={16} className={`transition-transform ${open ? 'rotate-90' : ''}`} />
        </button>
      </div>
      {open && teams.map((t) => row(t, true))}
    </div>
  );
}

/** Một team: bấm tên để xem riêng, bấm mũi tên xổ tên thành viên (anh Vũ 22/10/2026: "xổ xuống sẽ thấy được tên các thành viên trong team"). */
function TeamRow({ t, child, on, onPick }: { t: TeamItem; child: boolean; on: boolean; onPick: (t: TeamItem) => void }) {
  const [open, setOpen] = useState(false);
  const members = t.members ?? [];
  return (
    <div>
      <div className={`flex w-full items-stretch rounded-md ${on ? 'bg-tint text-primary' : 'text-ink'}`}>
        <button type="button" onClick={() => onPick(t)}
          className={`flex min-w-0 flex-1 items-start gap-2 rounded-md py-1.5 pr-2 text-left text-sm hover:bg-surface-2 ${child ? 'pl-8' : 'pl-2'} ${on ? 'font-semibold' : ''}`}>
          <Check size={14} className={`mt-0.5 shrink-0 ${on ? '' : 'invisible'}`} aria-hidden="true" />
          <span>{child ? shortName(t.name) : t.name}{(t.people > 0 || t.office) && <span className="block text-[11px] font-normal text-ink-3">{t.office ? `${t.office} · ` : ''}{t.people} người{!child && t.mentor ? ` · Mentor ${t.mentor}` : ''}</span>}</span>
        </button>
        {members.length > 0 && (
          <button type="button" aria-expanded={open} aria-label={open ? `Ẩn thành viên ${t.name}` : `Xem thành viên ${t.name}`} title={open ? 'Ẩn thành viên' : 'Xem thành viên'} onClick={() => setOpen(!open)}
            className="grid w-9 shrink-0 place-items-center rounded-md text-ink-3 hover:bg-surface-2 hover:text-ink">
            <ChevronDown size={15} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
          </button>
        )}
      </div>
      {open && (
        <ol className={`mb-1 grid gap-0.5 py-1 pr-2 text-[12.5px] text-ink-2 ${child ? 'pl-14' : 'pl-8'}`}>
          {members.map((m, i) => <li key={m} className="min-w-0"><span className="mr-1.5 inline-block w-5 text-right text-ink-3 tabular-nums">{i + 1}.</span>{m}</li>)}
        </ol>
      )}
    </div>
  );
}
