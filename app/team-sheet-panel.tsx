'use client';

// Chia team ngay trên web tổng (anh Vũ 21/10/2026: "không dùng theo crm nữa"): dán bảng chia team chép từ Google Sheet, web đọc team,
// bộ phận, chi nhánh và khớp tên với nhân viên Pancake; anh xem lại, sửa chỗ chưa khớp rồi Lưu. Đọc bảng ở lib/team-sheet.ts.
import { useEffect, useMemo, useState } from 'react';
import { ClipboardPaste, MessageCircle, Plus, Save, Trash2, UsersRound, X } from 'lucide-react';
import { matchStaff, parseTeamSheet, staffDept, type SheetDept, type StaffPerson } from '@/lib/teams/team-sheet';
import { officeList, toggleOffice, type WebTeam } from '@/lib/teams/web-teams';
import type { MarketingTeam } from '@/lib/teams/marketing-teams';
import type { TeamZaloState } from '@/lib/zalo/team-link';
import { ChartCard, ErrorBox, toast } from './ui-kit';
import { ManagerChip } from './manager-chip';
import { managedBy } from '@/lib/teams/managed-by';

// 'unset': team mới, chưa chọn bộ phận (anh Vũ 06/11/2026: chia team phải chọn bộ phận trước, chỉ hiện người bộ phận đó).
type Dept = SheetDept | 'skip' | 'unset';
type Member = { name: string; ids: string[] };
type Draft = { key: string; id: string | null; name: string; dept: Dept; office: string | null; members: Member[]; mentorUserId?: string | null; leaderUserId?: string | null; mentorPosId?: string | null; leaderPosId?: string | null };
type Account = { id: string; name: string; role: 'mentor' | 'lead' };
type Data = { source: 'hr' | 'web'; teams: WebTeam[]; mkt: MarketingTeam[]; vandon?: MarketingTeam[]; people: StaffPerson[]; accounts?: Account[]; zalo?: TeamZaloState[] };

const DEPTS: [Dept, string][] = [['sale', 'Sale'], ['cskh', 'CSKH'], ['mkt', 'MKT'], ['vandon', 'Vận đơn'], ['skip', 'Bỏ qua']];
const OWNERS = [['mentorPosId', 'mentorUserId', 'Mentor', 'mentor'], ['leaderPosId', 'leaderUserId', 'Leader', 'lead']] as const;
const uuidPrefix: Partial<Record<Dept, string>> = { mkt: 'mkt_', vandon: 'vd_' };
const OFFICES = ['Hà Nội', 'Thái Nguyên'];
const uuid = () => crypto.randomUUID();
let seq = 0;
const nextKey = () => `d${++seq}`;

type Owners = { mentorUserId?: string | null; leaderUserId?: string | null; mentorPosId?: string | null; leaderPosId?: string | null };
const ownersOf = (t: Owners) => ({ mentorUserId: t.mentorUserId ?? null, leaderUserId: t.leaderUserId ?? null, mentorPosId: t.mentorPosId ?? null, leaderPosId: t.leaderPosId ?? null });

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
  // Số người mỗi tài khoản Mentor / Leader đang cầm, cộng mọi team (cả team chưa lưu) (anh Vũ 04/11/2026).
  const managed = useMemo(() => {
    const names = (t: Draft) => t.dept === 'skip' || t.dept === 'unset' ? [] : t.members.filter((m) => m.ids.length).map((m) => m.name);
    // Người quản lý: tài khoản web nếu đã gắn, chưa thì người POS được chọn.
    const key = (acc?: string | null, pos?: string | null) => acc ? `acc:${acc}` : pos ? `pos:${pos}` : null;
    return { mentorPosId: managedBy(draft, (t) => key(t.mentorUserId, t.mentorPosId), names), leaderPosId: managedBy(draft, (t) => key(t.leaderUserId, t.leaderPosId), names) };
  }, [draft]);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  // Mã nối Zalo vừa cấp, theo tài khoản (03/11/2026).
  const [zaloCode, setZaloCode] = useState<Record<string, string>>({});
  const nameOf = useMemo(() => new Map((data?.people ?? []).map((p) => [p.id, p.name])), [data]);
  const demo = typeof location !== 'undefined' && (location.hostname.startsWith('demo.') || location.hostname === 'localhost');

  useEffect(() => {
    void fetch('/api/web-teams', { cache: 'no-store' }).then(async (r) => {
      const body = await r.json() as Data & { error?: string };
      if (!r.ok) { setError(body.error ?? 'Không tải được danh sách team.'); return; }
      setData(body);
      const names = new Map(body.people.map((p) => [p.id, p.name]));
      setDraft([
        ...body.mkt.map((t): Draft => ({ key: nextKey(), id: t.id, name: t.name, dept: 'mkt', office: t.office ?? null, members: membersOf(t.memberIds, names), ...ownersOf(t) })),
        ...body.teams.map((t): Draft => ({ key: nextKey(), id: t.id, name: t.name, dept: t.dept, office: t.office, members: membersOf(t.memberIds, names), ...ownersOf(t) })),
        ...(body.vandon ?? []).map((t): Draft => ({ key: nextKey(), id: t.id, name: t.name, dept: 'vandon', office: t.office ?? null, members: membersOf(t.memberIds, names), ...ownersOf(t) })),
      ]);
    }).catch(() => setError('Không tải được danh sách team.'));
  }, []);

  const edit = (key: string, patch: Partial<Draft>) => { setDraft((d) => d.map((t) => t.key === key ? { ...t, ...patch } : t)); setDirty(true); };
  const read = (source = text) => {
    if (!data) return;
    const teams = parseTeamSheet(source);
    if (!teams.length) { toast('Chưa đọc được team nào. Anh chép cả cột tên nhóm, tên team và cột "1. Họ tên".', { kind: 'error' }); return; }
    // Dán lại bảng: team trùng tên giữ người phụ trách đã gán.
    const owners = new Map<string, Owners>([...data.teams.map((w) => [`${w.dept}:${w.name.trim().toLocaleLowerCase('vi')}`, w] as const), ...data.mkt.map((w) => [`mkt:${w.name.trim().toLocaleLowerCase('vi')}`, w] as const), ...(data.vandon ?? []).map((w) => [`vandon:${w.name.trim().toLocaleLowerCase('vi')}`, w] as const)]);
    setDraft(teams.map((t): Draft => {
      const was = owners.get(`${t.dept}:${t.name.trim().toLocaleLowerCase('vi')}`);
      return { key: nextKey(), id: null, name: t.name, dept: t.dept ?? 'skip', office: t.office, members: t.members.map((name) => ({ name, ids: matchStaff(name, t.dept, data.people) })), ...(was ? ownersOf(was) : {}) };
    }));
    setDirty(true);
    toast(`Đọc được ${teams.length} team. Anh xem lại rồi bấm Lưu.`, { kind: 'ok' });
  };
  const rematch = (t: Draft, dept: Dept) => ({ dept, members: t.members.map((m) => ({ ...m, ids: m.ids.length ? m.ids : matchStaff(m.name, dept === 'skip' || dept === 'unset' ? null : dept, data?.people ?? []) })) });

  const kept = draft.filter((t) => t.dept !== 'skip' && t.dept !== 'unset');
  const missing = kept.reduce((n, t) => n + t.members.filter((m) => !m.ids.length).length, 0);
  const placed = kept.reduce((n, t) => n + t.members.filter((m) => m.ids.length).length, 0);

  const zaloOf = (userId: string) => data?.zalo?.find((z) => z.userId === userId);
  async function linkZalo(teamId: string, userId: string) {
    try {
      const r = await fetch('/api/web-teams/zalo', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ teamId, userId }) });
      const body = await r.json() as { linked?: boolean; code?: string; teamName?: string; error?: string };
      if (!r.ok) { toast(body.error ?? 'Không gắn được Zalo.', { kind: 'error' }); return; }
      if (body.linked) { toast('Người này đã nối Zalo rồi.'); return; }
      if (body.code) setZaloCode((c) => ({ ...c, [userId]: body.code! }));
      setData((d) => d && ({ ...d, zalo: [...(d.zalo ?? []).filter((z) => z.userId !== userId), { userId, linked: false, teamName: body.teamName ?? '' }] }));
    } catch { toast('Không gắn được Zalo.', { kind: 'error' }); }
  }
  async function save() {
    const unset = draft.find((t) => t.dept === 'unset');
    if (unset) { toast(`Team "${unset.name}" chưa chọn bộ phận.`, { kind: 'error' }); return null; }
    // Mentor / Leader chỉ giữ khi người đó còn trong team.
    const owners = (t: Draft, memberIds: string[]) => ({
      mentorUserId: t.mentorUserId ?? null, leaderUserId: t.leaderUserId ?? null,
      mentorPosId: t.mentorPosId && memberIds.includes(t.mentorPosId) ? t.mentorPosId : null,
      leaderPosId: t.leaderPosId && memberIds.includes(t.leaderPosId) ? t.leaderPosId : null,
    });
    // Một người chỉ thuộc một team MKT (một team Vận đơn): gặp lần sau thì bỏ.
    const listed = (dept: 'mkt' | 'vandon') => {
      const seen = new Set<string>(), prefix = uuidPrefix[dept]!;
      return kept.filter((t) => t.dept === dept).map((t) => {
        const memberIds = t.members.flatMap((m) => m.ids).filter((id) => !seen.has(id) && !!seen.add(id));
        return { id: t.id?.startsWith(prefix) ? t.id : `${prefix}${uuid()}`, name: t.name.trim(), office: t.office, memberIds, ...owners(t, memberIds) };
      });
    };
    const mkt = listed('mkt'), vandon = listed('vandon');
    const teams = kept.filter((t) => t.dept === 'sale' || t.dept === 'cskh').map((t) => {
      const memberIds = [...new Set(t.members.flatMap((m) => m.ids))];
      return { id: t.id?.startsWith('wt_') ? t.id : `wt_${uuid()}`, name: t.name.trim(), dept: t.dept, office: t.office, memberIds, ...owners(t, memberIds) };
    });
    const savedOf = (dept: Dept) => dept === 'mkt' ? mkt : dept === 'vandon' ? vandon : teams;
    setSaving(true);
    try {
      const r = await fetch('/api/web-teams', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ teams, mkt, vandon }) });
      const body = await r.json() as { error?: string; teams?: WebTeam[]; mkt?: MarketingTeam[]; vandon?: MarketingTeam[] };
      if (!r.ok) { toast(body.error ?? 'Không lưu được.', { kind: 'error' }); return null; }
      setData((d) => d && { ...d, source: 'web', teams: body.teams ?? [], mkt: body.mkt ?? [], vandon: body.vandon ?? [] });
      setDraft((d) => d.filter((t) => t.dept !== 'skip').map((t) => ({ ...t, id: savedOf(t.dept).find((x) => x.name === t.name.trim())?.id ?? t.id })));
      setDirty(false);
      toast('Đã lưu chia team. Ô Team và các trang Sale, CSKH, MKT dùng bảng này từ giờ.', { kind: 'ok' });
      return { savedOf };
    } catch { toast('Không lưu được.', { kind: 'error' }); return null; } finally { setSaving(false); }
  }
  /** Bấm Gắn Zalo: team chưa lưu thì lưu luôn rồi cấp mã, khỏi phải bấm Lưu trước (anh Vũ 03/11/2026). */
  async function zaloFor(t: Draft, userId: string) {
    let teamId = t.id;
    if (dirty || !teamId) {
      const saved = await save();
      if (!saved) return;
      teamId = saved.savedOf(t.dept).find((x) => x.name === t.name.trim())?.id ?? null;
    }
    if (teamId) await linkZalo(teamId, userId);
  }

  // Chỉ người đúng bộ phận (hậu tố tên hoặc bộ phận trên Pancake), không lẫn bộ phận khác (anh Vũ 06/11/2026, thay nhóm "Người khác" 03/11).
  const peopleOptions = (t: Draft) => {
    const inTeam = new Set(t.members.flatMap((m) => m.ids));
    return (data?.people ?? []).filter((p) => !inTeam.has(p.id) && (t.dept === 'skip' || staffDept(p) === t.dept)).map((p) => <option key={p.id} value={p.id}>{p.name}</option>);
  };

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
              <button type="button" className="btn sm" onClick={() => { setDraft((d) => [...d, { key: nextKey(), id: null, name: 'Team mới', dept: 'unset', office: null, members: [] }]); setDirty(true); }}><Plus size={14} />Thêm team</button>
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
                    <button key={o} type="button" onClick={() => edit(t.key, { office: toggleOffice(t.office, o) })} aria-pressed={officeList(t.office).includes(o)} className={`rounded-full border px-2 py-0.5 ${officeList(t.office).includes(o) ? 'border-[var(--primary)] bg-tint font-semibold text-primary' : 'text-ink-2'}`}>{o}</button>
                  ))}
                </div>
                {t.dept === 'unset' && <p className="text-[12px] text-warn">Chọn bộ phận trước, rồi mới thêm người.</p>}
                {t.dept !== 'skip' && t.dept !== 'unset' && (
                  <div className="space-y-1 text-[12px]">
                    {OWNERS.map(([posField, accField, label, role]) => {
                      const owner = t.members.find((m) => m.ids.length && t[posField] && m.ids.includes(t[posField]!));
                      const mkey = t[accField] ? `acc:${t[accField]}` : t[posField] ? `pos:${t[posField]}` : null;
                      return (
                        <div key={posField} className="flex flex-wrap items-center gap-1 text-ink-3">
                          <span className="w-12">{label}</span>
                          <select aria-label={`${label} của ${t.name}`} value={owner ? t[posField]! : ''} onChange={(e) => edit(t.key, { [posField]: e.target.value || null })}
                            className={`max-w-40 rounded-full border bg-surface px-2 py-0.5 text-[12px] ${owner ? 'text-ink' : 'text-ink-3'}`}>
                            <option value="">chưa gán</option>
                            {t.members.filter((m) => m.ids.length).map((m) => <option key={m.ids[0]} value={m.ids[0]}>{m.name}</option>)}
                          </select>
                          {mkey && <ManagerChip onlyCount label={label} name={owner?.name ?? (data.accounts ?? []).find((a) => a.id === t[accField])?.name ?? ''} people={managed[posField].get(mkey) ?? []} />}
                          <select aria-label={`Tài khoản web của ${label} ${t.name}`} title="Tài khoản đăng nhập web (không bắt buộc, gắn sau cũng được)" value={t[accField] ?? ''} onChange={(e) => edit(t.key, { [accField]: e.target.value || null })}
                            className={`max-w-36 rounded-full border border-dashed bg-surface px-2 py-0.5 text-[11.5px] ${t[accField] ? 'text-ink' : 'text-ink-3'}`}>
                            <option value="">TK web: chưa gắn</option>
                            {(data.accounts ?? []).filter((a) => a.role === role || a.id === t[accField]).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                          </select>
                          {t[accField] && <ZaloButton linked={zaloOf(t[accField]!)} code={zaloCode[t[accField]!]} disabled={saving} label={label} onClick={() => void zaloFor(t, t[accField]!)} />}
                        </div>
                      );
                    })}
                  </div>
                )}
                {t.dept !== 'unset' && <div className="flex flex-wrap gap-1.5">
                  {t.members.map((m, i) => m.ids.length ? (
                    <span key={`${m.name}-${i}`} className="inline-flex items-center gap-1 rounded-full bg-surface-2 py-0.5 pl-2 pr-1 text-[12px] text-ink" title={m.ids.length > 1 ? `${m.ids.length} tài khoản POS` : undefined}>
                      {m.name}{m.ids.length > 1 && <span className="text-ink-3">×{m.ids.length}</span>}
                      <button type="button" aria-label={`Bỏ ${m.name}`} className="grid size-4 place-items-center rounded-full text-ink-3 hover:text-bad" onClick={() => edit(t.key, { members: t.members.filter((_, j) => j !== i), ...(m.ids.includes(t.mentorPosId ?? '') ? { mentorPosId: null } : {}), ...(m.ids.includes(t.leaderPosId ?? '') ? { leaderPosId: null } : {}) })}><X size={11} /></button>
                    </span>
                  ) : (
                    <span key={`${m.name}-${i}`} className="inline-flex items-center gap-1 rounded-full border border-[var(--bad)] py-0.5 pl-2 pr-1 text-[12px] text-bad">
                      {m.name}
                      <select aria-label={`Chọn tài khoản cho ${m.name}`} className="max-w-28 rounded bg-transparent text-[11.5px] text-ink" value="" onChange={(e) => {
                        const id = e.target.value;
                        if (id) edit(t.key, { members: t.members.map((x, j) => j === i ? { name: nameOf.get(id) ?? x.name, ids: [id] } : x) });
                      }}>
                        <option value="">chọn…</option>
                        {peopleOptions(t)}
                      </select>
                      <button type="button" aria-label={`Bỏ ${m.name}`} className="grid size-4 place-items-center rounded-full hover:text-ink" onClick={() => edit(t.key, { members: t.members.filter((_, j) => j !== i) })}><X size={11} /></button>
                    </span>
                  ))}
                  <select aria-label={`Thêm người vào ${t.name}`} className="rounded-full border bg-surface px-2 py-0.5 text-[12px] text-ink-3" value="" onChange={(e) => {
                    const id = e.target.value;
                    if (id) edit(t.key, { members: [...t.members, { name: nameOf.get(id) ?? id, ids: [id] }] });
                  }}>
                    <option value="">+ thêm người</option>
                    {peopleOptions(t)}
                  </select>
                </div>}
              </div>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button type="button" className="btn primary" disabled={!dirty || saving} onClick={() => void save()}><Save size={15} />{saving ? 'Đang lưu…' : 'Lưu chia team'}</button>
            {dirty && <span className="text-[12px] text-warn">Chưa lưu</span>}
            <span className="text-[11.5px] text-ink-3">Lưu đè cách chia cũ; bản cũ được giữ lại để lấy lại khi cần. Nhóm “Bỏ qua” (văn phòng, trực page…) không lưu. Mentor, Leader chọn trong người của team. Ô “TK web” gắn tài khoản đăng nhập (vai trò Mentor hoặc Trưởng nhóm, không bắt buộc): có tài khoản thì người đó chỉ xem team mình và nối được Zalo.</span>
          </div>
        </div>
      )}
    </ChartCard>
  );
}

/** Nút Zalo cạnh Mentor / Leader: đã nối thì hiện dấu xanh, chưa thì bấm lấy mã 6 số nhắn cho bot. Không bắt buộc. */
function ZaloButton({ linked, code, disabled, label, onClick }: { linked?: TeamZaloState; code?: string; disabled: boolean; label: string; onClick: () => void }) {
  if (linked?.linked) return <span className="inline-flex items-center gap-0.5 rounded-full bg-tint px-1.5 tap py-0.5 text-[11px] font-semibold text-primary" title={`Đã nối Zalo · báo cáo theo ${linked.teamName}`}><MessageCircle size={11} />Zalo</span>;
  if (code) return <span className="rounded-full border border-[var(--primary)] px-1.5 py-0.5 text-[11px] text-ink" title="Nhắn mã này cho bot Zalo · hết hạn sau 24 giờ">Nhắn bot: <b className="num text-primary">{code}</b></span>;
  return (
    <button type="button" disabled={disabled} onClick={onClick} title={disabled ? `Chọn ${label} trước` : 'Lấy mã nối Zalo (tự lưu chia team nếu chưa lưu)'}
      className="inline-flex items-center gap-0.5 rounded-full border px-1.5 py-0.5 text-[11px] text-ink-2 hover:border-[var(--primary)] hover:text-primary disabled:opacity-50">
      <MessageCircle size={11} />Gắn Zalo
    </button>
  );
}
