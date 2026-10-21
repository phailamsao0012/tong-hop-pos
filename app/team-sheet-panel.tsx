'use client';

// Chia team ngay trên web tổng (anh Vũ 21/10/2026: "không dùng theo crm nữa"): dán bảng chia team chép từ Google Sheet, web đọc team,
// bộ phận, chi nhánh và khớp tên với nhân viên Pancake; anh xem lại, sửa chỗ chưa khớp rồi Lưu. Đọc bảng ở lib/team-sheet.ts.
import { useEffect, useMemo, useState } from 'react';
import { ClipboardPaste, Plus, Save, Trash2, UsersRound, X } from 'lucide-react';
import { matchStaff, parseTeamSheet, type SheetDept, type StaffPerson } from '@/lib/team-sheet';
import type { WebTeam } from '@/lib/web-teams';
import type { MarketingTeam } from '@/lib/marketing-teams';
import { ChartCard, ErrorBox, toast } from './ui-kit';

type Dept = SheetDept | 'skip';
type Member = { name: string; ids: string[] };
type Draft = { key: string; id: string | null; name: string; dept: Dept; office: string | null; members: Member[] };
type Data = { source: 'hr' | 'web'; teams: WebTeam[]; mkt: MarketingTeam[]; people: StaffPerson[] };

const DEPTS: [Dept, string][] = [['sale', 'Sale'], ['cskh', 'CSKH'], ['mkt', 'MKT'], ['skip', 'Bỏ qua']];
const OFFICES = ['Hà Nội', 'Thái Nguyên'];
const uuid = () => crypto.randomUUID();
let seq = 0;
const nextKey = () => `d${++seq}`;

/** Gom tài khoản theo tên người (một người có tài khoản ở nhiều POS). */
function membersOf(ids: string[], nameOf: Map<string, string>): Member[] {
  const m = new Map<string, string[]>();
  for (const id of ids) { const n = nameOf.get(id) ?? id; m.set(n, [...(m.get(n) ?? []), id]); }
  return [...m].map(([name, list]) => ({ name, ids: list }));
}

/** Bảng mẫu cho bản demo, dựng từ nhân viên ảo đang có (bản demo không có người thật). */
function sampleSheet(people: StaffPerson[]) {
  const pick = (re: RegExp, from: number, n: number) => people.filter((p) => re.test(p.name)).slice(from, from + n).map((p) => p.name.replace(/\s*-?\s*(SALE|CSKH|MKT)\s*$/iu, ''));
  const block = (group: string, teams: [string, string[]][]) => teams.flatMap(([team, names], ti) => names.map((n, i) => [i === 0 && ti === 0 ? group : '', i === 0 ? `${team}: ${names.length}` : '', `${i + 1}. ${n}`]));
  const rows = [
    ...block('Marketing', [['A Minh', pick(/mkt/i, 0, 3)], ['A Hoà', pick(/mkt/i, 3, 2)]]),
    ...block('CSKH', [['Đội Hà Nội', pick(/cskh/i, 0, 4)], ['Đội Thái Nguyên', pick(/cskh/i, 4, 3)]]),
    ...block('Sale Hà Nội', [['C Lan', pick(/sale/i, 0, 3)], ['Xuân OXY', pick(/sale/i, 3, 2)]]),
    ...block('Thái Nguyên', [['Sale c Lan', pick(/sale/i, 5, 3)], ['Sale gà - C Lan', pick(/sale/i, 8, 2)]]),
  ];
  return rows.map((r) => r.join('\t')).join('\n');
}

export function TeamSheetPanel() {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState('');
  const [text, setText] = useState('');
  const [draft, setDraft] = useState<Draft[]>([]);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const nameOf = useMemo(() => new Map((data?.people ?? []).map((p) => [p.id, p.name])), [data]);
  const demo = typeof location !== 'undefined' && (location.hostname.startsWith('demo.') || location.hostname === 'localhost');

  useEffect(() => {
    void fetch('/api/web-teams', { cache: 'no-store' }).then(async (r) => {
      const body = await r.json() as Data & { error?: string };
      if (!r.ok) { setError(body.error ?? 'Không tải được danh sách team.'); return; }
      setData(body);
      const names = new Map(body.people.map((p) => [p.id, p.name]));
      setDraft([
        ...body.mkt.map((t): Draft => ({ key: nextKey(), id: t.id, name: t.name, dept: 'mkt', office: null, members: membersOf(t.memberIds, names) })),
        ...body.teams.map((t): Draft => ({ key: nextKey(), id: t.id, name: t.name, dept: t.dept, office: t.office, members: membersOf(t.memberIds, names) })),
      ]);
    }).catch(() => setError('Không tải được danh sách team.'));
  }, []);

  const edit = (key: string, patch: Partial<Draft>) => { setDraft((d) => d.map((t) => t.key === key ? { ...t, ...patch } : t)); setDirty(true); };
  const read = (source = text) => {
    if (!data) return;
    const teams = parseTeamSheet(source);
    if (!teams.length) { toast('Chưa đọc được team nào. Anh chép cả cột tên nhóm, tên team và cột "1. Họ tên".', { kind: 'error' }); return; }
    setDraft(teams.map((t): Draft => ({ key: nextKey(), id: null, name: t.name, dept: t.dept ?? 'skip', office: t.office, members: t.members.map((name) => ({ name, ids: matchStaff(name, t.dept, data.people) })) })));
    setDirty(true);
    toast(`Đọc được ${teams.length} team. Anh xem lại rồi bấm Lưu.`, { kind: 'ok' });
  };
  const rematch = (t: Draft, dept: Dept) => ({ dept, members: t.members.map((m) => ({ ...m, ids: m.ids.length ? m.ids : matchStaff(m.name, dept === 'skip' ? null : dept, data?.people ?? []) })) });

  const kept = draft.filter((t) => t.dept !== 'skip');
  const missing = kept.reduce((n, t) => n + t.members.filter((m) => !m.ids.length).length, 0);
  const placed = kept.reduce((n, t) => n + t.members.filter((m) => m.ids.length).length, 0);

  async function save() {
    // Một người chỉ thuộc một team MKT: gặp lần sau thì bỏ.
    const mktSeen = new Set<string>();
    const mkt = kept.filter((t) => t.dept === 'mkt').map((t) => ({
      id: t.id?.startsWith('mkt_') ? t.id : `mkt_${uuid()}`, name: t.name.trim(),
      memberIds: t.members.flatMap((m) => m.ids).filter((id) => !mktSeen.has(id) && !!mktSeen.add(id)),
    }));
    const teams = kept.filter((t) => t.dept === 'sale' || t.dept === 'cskh').map((t) => ({
      id: t.id?.startsWith('wt_') ? t.id : `wt_${uuid()}`, name: t.name.trim(), dept: t.dept, office: t.office, memberIds: [...new Set(t.members.flatMap((m) => m.ids))],
    }));
    setSaving(true);
    try {
      const r = await fetch('/api/web-teams', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ teams, mkt }) });
      const body = await r.json() as { error?: string; teams?: WebTeam[]; mkt?: MarketingTeam[] };
      if (!r.ok) { toast(body.error ?? 'Không lưu được.', { kind: 'error' }); return; }
      setData((d) => d && { ...d, source: 'web', teams: body.teams ?? [], mkt: body.mkt ?? [] });
      setDraft((d) => d.filter((t) => t.dept !== 'skip').map((t) => ({ ...t, id: (t.dept === 'mkt' ? mkt : teams).find((x) => x.name === t.name.trim())?.id ?? t.id })));
      setDirty(false);
      toast('Đã lưu chia team. Ô Team và các trang Sale, CSKH, MKT dùng bảng này từ giờ.', { kind: 'ok' });
    } finally { setSaving(false); }
  }

  const peopleFor = (dept: Dept) => (data?.people ?? []).filter((p) => dept === 'skip' || new RegExp(dept === 'mkt' ? 'mkt|marketing' : dept === 'cskh' ? 'cskh|chăm sóc' : 'sale|bán hàng', 'iu').test(`${p.name} ${p.department ?? ''}`));

  return (
    <ChartCard icon={UsersRound} title="Chia team" subtitle={data?.source === 'hr' ? 'Đang lấy team từ web nhân sự. Lưu ở đây thì chuyển sang chia trên web tổng.' : 'Team Sale, CSKH, MKT chia trên web tổng'}>
      {error && <ErrorBox error={error} />}
      {data && (
        <div className="space-y-4">
          <div className="space-y-2">
            <label htmlFor="team-sheet" className="block text-[12.5px] font-semibold text-ink-2">Dán bảng chia team từ Google Sheet (bôi đen cả cột nhóm, cột team và cột “1. Họ tên”, Ctrl+C rồi dán vào đây)</label>
            <textarea id="team-sheet" value={text} onChange={(e) => setText(e.target.value)} rows={4} placeholder="Marketing: 20	A Đăng: 10	1. Họ tên…"
              className="w-full rounded-lg border bg-surface px-3 py-2 font-mono text-[12px] text-ink outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]" />
            <div className="flex flex-wrap gap-2">
              <button type="button" className="btn sm primary" onClick={() => {
                // Dán thẳng từ bộ nhớ (đã bấm Chép ở trang bảng chia team); trình duyệt không cho thì dán tay vào ô.
                void navigator.clipboard?.readText().then((v) => { if (v.trim()) { setText(v); read(v); } else toast('Bộ nhớ đang trống.', { kind: 'error' }); })
                  .catch(() => toast('Trình duyệt chưa cho đọc bộ nhớ. Anh bấm vào ô trên rồi Ctrl+V.', { kind: 'error' }));
              }}><ClipboardPaste size={14} />Dán bảng đã chép</button>
              <button type="button" className="btn sm" disabled={!text.trim()} onClick={() => read()}>Đọc bảng trong ô</button>
              {demo && <button type="button" className="btn sm" onClick={() => { const s = sampleSheet(data.people); setText(s); read(s); }}>Dán bảng mẫu (demo)</button>}
              <button type="button" className="btn sm" onClick={() => { setDraft((d) => [...d, { key: nextKey(), id: null, name: 'Team mới', dept: 'sale', office: null, members: [] }]); setDirty(true); }}><Plus size={14} />Thêm team</button>
            </div>
          </div>

          {!!draft.length && (
            <p className="text-[12.5px] text-ink-2">
              {kept.length} team · {placed} người đã khớp{missing ? <> · <b className="text-bad">{missing} người chưa khớp</b> (chọn tay ở ô đỏ, hoặc bỏ)</> : ''}
            </p>
          )}

          <div className="grid gap-3 grid-cols-[repeat(auto-fill,minmax(min(100%,20rem),1fr))]">
            {draft.map((t) => (
              <div key={t.key} className={`space-y-2 rounded-xl border p-3 ${t.dept === 'skip' ? 'opacity-55' : ''}`}>
                <div className="flex items-center gap-2">
                  <input aria-label="Tên team" value={t.name} onChange={(e) => edit(t.key, { name: e.target.value })} className="min-w-0 flex-1 rounded-md border bg-surface px-2 py-1 text-sm font-semibold text-ink" />
                  <button type="button" aria-label={`Xoá team ${t.name}`} className="grid size-7 place-items-center rounded-md text-ink-3 hover:bg-surface-2 hover:text-bad" onClick={() => { setDraft((d) => d.filter((x) => x.key !== t.key)); setDirty(true); }}><Trash2 size={14} /></button>
                </div>
                <div className="flex flex-wrap items-center gap-1.5 text-[12px]">
                  {DEPTS.map(([v, label]) => (
                    <button key={v} type="button" onClick={() => edit(t.key, rematch(t, v))} className={`rounded-full border px-2 py-0.5 ${t.dept === v ? 'border-[var(--primary)] bg-tint font-semibold text-primary' : 'text-ink-2'}`}>{label}</button>
                  ))}
                  <span className="mx-1 h-4 w-px bg-[var(--line)]" />
                  {OFFICES.map((o) => (
                    <button key={o} type="button" onClick={() => edit(t.key, { office: t.office === o ? null : o })} className={`rounded-full border px-2 py-0.5 ${t.office === o ? 'border-[var(--primary)] bg-tint font-semibold text-primary' : 'text-ink-2'}`}>{o}</button>
                  ))}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {t.members.map((m, i) => m.ids.length ? (
                    <span key={`${m.name}-${i}`} className="inline-flex items-center gap-1 rounded-full bg-surface-2 py-0.5 pl-2 pr-1 text-[12px] text-ink" title={m.ids.length > 1 ? `${m.ids.length} tài khoản POS` : undefined}>
                      {m.name}{m.ids.length > 1 && <span className="text-ink-3">×{m.ids.length}</span>}
                      <button type="button" aria-label={`Bỏ ${m.name}`} className="grid size-4 place-items-center rounded-full text-ink-3 hover:text-bad" onClick={() => edit(t.key, { members: t.members.filter((_, j) => j !== i) })}><X size={11} /></button>
                    </span>
                  ) : (
                    <span key={`${m.name}-${i}`} className="inline-flex items-center gap-1 rounded-full border border-[var(--bad)] py-0.5 pl-2 pr-1 text-[12px] text-bad">
                      {m.name}
                      <select aria-label={`Chọn tài khoản cho ${m.name}`} className="max-w-28 rounded bg-transparent text-[11.5px] text-ink" value="" onChange={(e) => {
                        const id = e.target.value;
                        if (id) edit(t.key, { members: t.members.map((x, j) => j === i ? { name: nameOf.get(id) ?? x.name, ids: [id] } : x) });
                      }}>
                        <option value="">chọn…</option>
                        {peopleFor(t.dept).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                      </select>
                      <button type="button" aria-label={`Bỏ ${m.name}`} className="grid size-4 place-items-center rounded-full hover:text-ink" onClick={() => edit(t.key, { members: t.members.filter((_, j) => j !== i) })}><X size={11} /></button>
                    </span>
                  ))}
                  <select aria-label={`Thêm người vào ${t.name}`} className="rounded-full border bg-surface px-2 py-0.5 text-[12px] text-ink-3" value="" onChange={(e) => {
                    const id = e.target.value;
                    if (id) edit(t.key, { members: [...t.members, { name: nameOf.get(id) ?? id, ids: [id] }] });
                  }}>
                    <option value="">+ thêm người</option>
                    {peopleFor(t.dept).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </div>
              </div>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button type="button" className="btn primary" disabled={!dirty || saving} onClick={() => void save()}><Save size={15} />{saving ? 'Đang lưu…' : 'Lưu chia team'}</button>
            {dirty && <span className="text-[12px] text-warn">Chưa lưu</span>}
            <span className="text-[11.5px] text-ink-3">Lưu đè cách chia cũ; bản cũ được giữ lại để lấy lại khi cần. Nhóm “Bỏ qua” (văn phòng, trực page…) không lưu.</span>
          </div>
        </div>
      )}
    </ChartCard>
  );
}
