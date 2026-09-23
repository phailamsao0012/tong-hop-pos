'use client';

import { useEffect, useMemo, useState } from 'react';
import { Plus, Save, Search, Trash2, UsersRound } from 'lucide-react';
import { Input } from '@/components/ui/input';
import type { MarketingTeam } from '@/lib/marketing-teams';
import { validateMarketingTeams } from '@/lib/marketing-teams';
import { ChartCard, ErrorBox, toast } from './ui-kit';

type Person = { id: string; name: string; department: string | null; active: boolean };

export function MarketingTeamsPanel() {
  const [teams, setTeams] = useState<MarketingTeam[]>([]);
  const [people, setPeople] = useState<Person[]>([]);
  const [selectedId, setSelectedId] = useState<string>('');
  const [query, setQuery] = useState('');
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    void fetch('/api/marketing-teams', { cache: 'no-store' }).then(async (r) => {
      const body = await r.json() as { teams?: MarketingTeam[]; people?: Person[]; error?: string };
      if (!r.ok) throw new Error(body.error ?? 'Không tải được team Marketing.');
      setTeams(body.teams ?? []); setPeople(body.people ?? []); setSelectedId(body.teams?.[0]?.id ?? '');
    }).catch((e) => setError(e instanceof Error ? e.message : 'Không tải được team Marketing.'));
  }, []);
  useEffect(() => {
    if (!dirty) return;
    const prevent = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener('beforeunload', prevent);
    return () => window.removeEventListener('beforeunload', prevent);
  }, [dirty]);

  const selected = teams.find((t) => t.id === selectedId);
  const ownerByMember = useMemo(() => new Map(teams.flatMap((t) => t.memberIds.map((id) => [id, t.name] as const))), [teams]);
  const displayPeople = useMemo(() => {
    const byId = new Map(people.map((p) => [p.id, p]));
    for (const t of teams) for (const id of t.memberIds) if (!byId.has(id)) byId.set(id, { id, name: `NV ${id.slice(0, 8)} (không còn trong danh sách Pancake)`, department: null, active: false });
    const q = query.trim().toLocaleLowerCase('vi');
    return [...byId.values()].filter((p) => !q || `${p.name} ${p.department ?? ''} ${p.id}`.toLocaleLowerCase('vi').includes(q))
      .sort((a, b) => Number(selected?.memberIds.includes(b.id)) - Number(selected?.memberIds.includes(a.id)) || a.name.localeCompare(b.name, 'vi'));
  }, [people, teams, query, selected]);
  const addTeam = () => {
    const team: MarketingTeam = { id: `mkt_${crypto.randomUUID()}`, name: `Team ${teams.length + 1}`, memberIds: [] };
    setTeams((old) => [...old, team]); setSelectedId(team.id); setDirty(true);
  };
  const rename = (name: string) => { setTeams((old) => old.map((t) => t.id === selectedId ? { ...t, name } : t)); setDirty(true); };
  const assign = (userId: string, checked: boolean) => {
    setTeams((old) => old.map((t) => ({ ...t, memberIds: checked ? (t.id === selectedId ? [...new Set([...t.memberIds, userId])] : t.memberIds.filter((id) => id !== userId)) : (t.id === selectedId ? t.memberIds.filter((id) => id !== userId) : t.memberIds) })));
    setDirty(true);
  };
  const remove = () => { setTeams((old) => old.filter((t) => t.id !== selectedId)); setSelectedId(teams.find((t) => t.id !== selectedId)?.id ?? ''); setDirty(true); };
  const save = async () => {
    const checked = validateMarketingTeams(teams);
    if (!checked.teams) { setError(checked.error ?? 'Cấu hình team không hợp lệ.'); return; }
    setSaving(true); setError(null);
    try {
      const r = await fetch('/api/marketing-teams', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ teams: checked.teams }) });
      const body = await r.json() as { error?: string };
      if (!r.ok) throw new Error(body.error ?? 'Không lưu được team Marketing.');
      setTeams(checked.teams); setDirty(false); toast('Đã lưu team Marketing.');
    } catch (e) { setError(e instanceof Error ? e.message : 'Không lưu được team Marketing.'); }
    finally { setSaving(false); }
  };

  return <ChartCard icon={UsersRound} title="Team Marketing" subtitle="Phân nhóm theo tài khoản Marketer trên Pancake. Một nhân viên thuộc một team; đổi nhóm tại đây sẽ áp dụng cho mọi báo cáo MKT."
    action={<div className="flex flex-wrap gap-2"><button type="button" className="btn" onClick={addTeam}><Plus size={14} /> Thêm team</button><button type="button" className="btn primary" onClick={() => void save()} disabled={!dirty || saving}><Save size={14} /> {saving ? 'Đang lưu…' : 'Lưu team'}</button></div>}>
    {error && <ErrorBox error={error} onRetry={() => setError(null)} className="mb-3" />}
    <div className="grid gap-4 lg:grid-cols-[250px_minmax(0,1fr)]">
      <div className="space-y-2" aria-label="Danh sách team Marketing">
        {teams.map((t) => <button key={t.id} type="button" onClick={() => setSelectedId(t.id)} className={`flex w-full items-center justify-between rounded-xl border px-3 py-2 text-left text-sm ${selectedId === t.id ? 'border-primary bg-primary/10 font-semibold text-primary' : 'border-line bg-surface hover:bg-surface-2'}`}><span className="truncate">{t.name}</span><span className="num ml-2 text-xs text-ink-3">{t.memberIds.length}</span></button>)}
        {!teams.length && <p className="rounded-xl border border-dashed border-line p-4 text-sm text-ink-3">Chưa tạo team. Bấm “Thêm team” để bắt đầu.</p>}
        <p className="text-xs text-ink-3">Người chưa phân nhóm vẫn hiện khi xem “Tất cả” hoặc “Chưa phân nhóm”.</p>
      </div>
      {selected && <div className="min-w-0 space-y-3">
        <div className="flex flex-wrap items-end gap-3">
          <label htmlFor="marketing-team-name" className="min-w-48 flex-1 text-xs font-medium text-ink-2">Tên team<Input id="marketing-team-name" className="mt-1" value={selected.name} maxLength={60} onChange={(e) => rename(e.target.value)} /></label>
          <button type="button" className="btn text-bad" onClick={remove} aria-label={`Xóa team ${selected.name}`}><Trash2 size={14} /> Xóa team</button>
        </div>
        <p className="text-xs text-ink-3">Chọn người thuộc team này. Chọn người đã ở team khác sẽ chuyển người đó sang team hiện tại.</p>
        <div className="relative"><Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-3" /><Input className="pl-9" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Tìm tên, bộ phận hoặc mã nhân viên…" aria-label="Tìm nhân viên Marketing" /></div>
        <div className="max-h-80 overflow-y-auto rounded-xl border border-line">
          {displayPeople.slice(0, 150).map((p) => <label key={p.id} className="flex cursor-pointer items-center gap-3 border-b border-line px-3 py-2 text-sm last:border-0 hover:bg-surface-2">
            <input type="checkbox" className="size-4 accent-[var(--primary)]" checked={selected.memberIds.includes(p.id)} onChange={(e) => assign(p.id, e.target.checked)} />
            <span className="min-w-0 flex-1"><span className="block truncate font-medium text-ink">{p.name}</span><span className="text-xs text-ink-3">{p.department || 'Chưa có bộ phận'}{!p.active ? ' · không còn hoạt động' : ''}</span></span>
            {ownerByMember.has(p.id) && <span className="max-w-28 truncate text-xs text-ink-3">{ownerByMember.get(p.id)}</span>}
          </label>)}
          {!displayPeople.length && <p className="p-4 text-sm text-ink-3">Không tìm thấy nhân viên.</p>}
        </div>
        {displayPeople.length > 150 && <p className="text-xs text-ink-3">Đang hiện 150 người đầu tiên; nhập tên để tìm người khác.</p>}
      </div>}
    </div>
  </ChartCard>;
}
