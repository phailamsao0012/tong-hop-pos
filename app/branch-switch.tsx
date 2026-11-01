'use client';

import type { Branch } from '@/lib/teams/branch';
import { setBranch, setHrUnit, useBranch, useHrUnit, useTeam } from './team-store';
import { useApi } from './use-api';
import { SegmentedControl } from './ui-kit';

type BranchTeam = { id: string; name: string; officeId: string; dept: 'sale' | 'cskh' };
export function BranchSwitch() {
  const branch = useBranch();
  const team = useTeam();
  const unit = useHrUnit();
  const api = useApi<{ offices: Branch[]; teams: BranchTeam[] }>('/api/reports/overview?branches=1');
  const offices = api.data?.offices ?? [];
  const teams = (api.data?.teams ?? []).filter((t) => t.officeId === branch && (team === 'all' || t.dept === team));
  return <>
    {/* Tổng / Hà Nội / Thái Nguyên chung một ô như Tất cả / Sale / CSKH (anh Vũ 21/10/2026). */}
    <SegmentedControl<string> ariaLabel="Chi nhánh" size="sm" className={branch ? 'is-warn' : ''} value={branch ?? ''} onChange={(v) => setBranch(v || null)}
      options={[{ value: '', label: 'Tổng' }, ...offices.map((o) => ({ value: o.id, label: o.name }))]} />
    {branch && <select className="btn sm max-w-40" aria-label="Team trong chi nhánh" value={unit?.branchOnly ? '' : unit?.id ?? ''} onChange={(e) => setHrUnit(teams.find((t) => t.id === e.target.value) ?? null)}>
      <option value="">Mọi team</option>{teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
    </select>}
  </>;
}
