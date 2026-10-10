'use client';

// Ô chọn một team bên web nhân sự trên thanh trên cùng (anh Vũ 10/10/2026: "xem được thông số theo team"), cạnh nút Tất cả / Sale / CSKH.
// Danh sách team lấy từ /api/teams?list=1 (đơn vị kind=team bên web nhân sự, nhóm theo bộ phận và chi nhánh).
import { Check, UsersRound } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { setHrUnit, useHrUnit, useTeam, type HrUnit } from './team-store';
import { useApi } from './use-api';

type TeamItem = { id: string; name: string; office: string | null; dept: 'sale' | 'cskh'; people: number; mentor: string | null };
const DEPT_LABEL = { sale: 'Sale', cskh: 'CSKH' } as const;
/** "Sale HN · Team Đại Bàng" → "Team Đại Bàng" cho nút nhỏ; tên đầy đủ ở danh sách. */
const shortName = (name: string) => name.split(' · ').pop() ?? name;

export function HrTeamPicker({ className = '' }: { className?: string }) {
  const unit = useHrUnit();
  const team = useTeam();
  const api = useApi<{ teams: TeamItem[] }>('/api/teams?list=1');
  const teams = api.data?.teams ?? [];
  if (!teams.length && !unit) return null;
  const depts = (['sale', 'cskh'] as const).filter((d) => team === 'all' || team === d || unit?.dept === d);
  const pick = (t: TeamItem | null) => setHrUnit(t ? { id: t.id, name: t.name, dept: t.dept } satisfies HrUnit : null);
  return (
    <Popover>
      <PopoverTrigger render={<button type="button" className={`btn sm ${unit ? 'is-warn' : ''} ${className}`} title={unit ? `Đang xem riêng team ${unit.name}` : 'Xem riêng một team (theo web nhân sự)'} />}>
        <UsersRound size={14} aria-hidden="true" />
        <span className="max-w-36 truncate">{unit ? shortName(unit.name) : 'Team'}</span>
      </PopoverTrigger>
      <PopoverContent align="end" className="max-h-[70vh] w-80 overflow-y-auto p-2">
        <button type="button" onClick={() => pick(null)}
          className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-surface-2 ${unit ? 'text-ink' : 'bg-tint font-semibold text-primary'}`}>
          <Check size={14} className={unit ? 'invisible' : ''} aria-hidden="true" />Mọi team{team !== 'all' ? ` ${DEPT_LABEL[team]}` : ''}
        </button>
        {depts.map((d) => {
          const list = teams.filter((t) => t.dept === d);
          if (!list.length) return null;
          const offices = [...new Set(list.map((t) => t.office ?? 'Khác'))].sort((a, b) => a.localeCompare(b, 'vi'));
          return offices.map((o) => (
            <div key={`${d}:${o}`}>
              <p className="mt-1 border-t px-2 pt-2 text-[11px] font-semibold uppercase tracking-wide text-ink-3">{DEPT_LABEL[d]} · {o}</p>
              {list.filter((t) => (t.office ?? 'Khác') === o).sort((a, b) => a.name.localeCompare(b.name, 'vi')).map((t) => {
                const on = unit?.id === t.id;
                return (
                  <button key={t.id} type="button" onClick={() => pick(t)}
                    className={`flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-surface-2 ${on ? 'bg-tint font-semibold text-primary' : 'text-ink'}`}>
                    <Check size={14} className={`mt-0.5 shrink-0 ${on ? '' : 'invisible'}`} aria-hidden="true" />
                    <span>{t.name}<span className="block text-[11px] font-normal text-ink-3">{t.people} người{t.mentor ? ` · Mentor ${t.mentor}` : ''}</span></span>
                  </button>
                );
              })}
            </div>
          ));
        })}
      </PopoverContent>
    </Popover>
  );
}
