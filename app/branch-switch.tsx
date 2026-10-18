'use client';

import type { Branch } from '@/lib/branch';
import { setBranch, setHrUnit, useBranch, useHrUnit, useTeam } from './team-store';
import { useApi } from './use-api';

type BranchTeam = { id: string; name: string; officeId: string; dept: 'sale' | 'cskh' };
export function BranchSwitch() {
  const branch = useBranch();
  const team = useTeam();
  const unit = useHrUnit();
  const api = useApi<{ offices: Branch[]; teams: BranchTeam[] }>('/api/reports/overview?branches=1');
  const offices = api.data?.offices ?? [];
  const teams = (api.data?.teams ?? []).filter((t) => t.officeId === branch && (team === 'all' || t.dept === team));
  return <>
    <fieldset className="hidden items-center gap-1 md:flex" aria-label="Chi nhánh">
      {[{ id: '', name: 'Tổng' }, ...offices].map((o) => <button key={o.id} type="button" className={`btn sm ${branch === (o.id || null) ? 'is-on' : ''}`} aria-pressed={branch === (o.id || null)} onClick={() => setBranch(o.id || null)}>{o.name}</button>)}
    </fieldset>
    <select className="btn sm md:hidden" aria-label="Chi nhánh" value={branch ?? ''} onChange={(e) => setBranch(e.target.value || null)}>
      <option value="">Tổng</option>{offices.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
    </select>
    {branch && <select className="btn sm max-w-40" aria-label="Team trong chi nhánh" value={unit?.branchOnly ? '' : unit?.id ?? ''} onChange={(e) => setHrUnit(teams.find((t) => t.id === e.target.value) ?? null)}>
      <option value="">Mọi team</option>{teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
    </select>}
  </>;
}
