'use client';

// Thiết bị đang đăng nhập (25/09/2026): máy nào, ở đâu, vào bằng cách nào, lần cuối dùng; đăng xuất từng máy hoặc mọi máy khác.
// Chủ hệ thống bật "Mọi tài khoản" để xem và đăng xuất máy của bất kỳ ai.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Laptop, LogOut, MonitorSmartphone, Smartphone } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ChartCard, StatusChip, ThinkingLine, dt } from './ui-kit';

type Sess = { id: string; userId: string; name: string; email: string; client: 'web' | 'ios' | 'android'; device: string; method: string | null; methodLabel: string; ip: string | null; place: string | null; createdAt: string; lastSeenAt: string; current: boolean };
const ago = (iso: string) => {
  const m = Math.round((Date.now() - Date.parse(iso.endsWith('Z') ? iso : `${iso}Z`)) / 60000);
  return m < 2 ? 'vừa xong' : m < 60 ? `${m} phút trước` : m < 1440 ? `${Math.round(m / 60)} giờ trước` : dt(iso.slice(0, 19), true);
};
const tone = (method: string | null) => method === 'passkey' || method === 'qr' || method === 'password+app' ? 'green' : method?.startsWith('password+') ? 'blue' : 'gray';

export function SessionsCard({ owner }: { owner: boolean }) {
  const [all, setAll] = useState(false);
  const [rows, setRows] = useState<Sess[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmOthers, setConfirmOthers] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const load = useCallback(async () => {
    const r = await fetch(`/api/auth/sessions${all ? '?scope=all' : ''}`, { cache: 'no-store' });
    if (r.ok) setRows(((await r.json()) as { sessions: Sess[] }).sessions);
  }, [all]);
  useEffect(() => { void load(); }, [load]);
  const revoke = async (q: string, key: string, text: string) => {
    setBusy(key); setMsg(null);
    try { const r = await fetch(`/api/auth/sessions?${q}`, { method: 'DELETE' }); if (!r.ok) throw new Error(); setMsg(text); await load(); }
    catch { setMsg('Không đăng xuất được, thử lại.'); } finally { setBusy(null); setConfirmOthers(false); }
  };
  const groups = useMemo(() => {
    const m = new Map<string, Sess[]>();
    for (const s of rows ?? []) m.set(s.userId, [...(m.get(s.userId) ?? []), s]);
    return [...m.values()];
  }, [rows]);
  const others = (rows ?? []).filter((s) => !s.current && (!all || s.current === false)).length;

  return (
    <ChartCard icon={MonitorSmartphone} className="lg:col-span-2" title={`Thiết bị đang đăng nhập · ${rows?.length ?? '…'}`}
      subtitle="Thấy máy lạ thì bấm Đăng xuất máy đó và đổi mật khẩu. Máy lạ vào tài khoản sẽ được báo qua Telegram cho chủ hệ thống."
      action={<span className="flex flex-wrap items-center gap-2">
        {owner && <label className="flex cursor-pointer items-center gap-1.5 text-xs text-ink-2"><input type="checkbox" className="accent-[var(--primary)]" checked={all} onChange={(e) => setAll(e.target.checked)} />Mọi tài khoản</label>}
        {!all && others > 0 && (confirmOthers
          ? <><Button size="sm" variant="destructive" disabled={!!busy} onClick={() => void revoke('others=1', 'others', 'Đã đăng xuất mọi máy khác.')}>Chắc chắn đăng xuất {others} máy</Button><Button size="sm" variant="ghost" onClick={() => setConfirmOthers(false)}>Thôi</Button></>
          : <Button size="sm" variant="outline" onClick={() => setConfirmOthers(true)}><LogOut size={13} />Đăng xuất mọi máy khác</Button>)}
      </span>}>
      {!rows ? <ThinkingLine lines={['Đang tìm các máy đang đăng nhập…']} /> : (
        <div className="space-y-4">
          {groups.map((list) => (
            <div key={list[0].userId}>
              {all && <p className="mb-1.5 text-xs font-semibold text-ink-2">{list[0].name} <span className="font-normal text-ink-3">· {list[0].email} · {list.length} máy</span>
                {!list.some((s) => s.current) && <button type="button" className="link ml-2 text-bad" disabled={!!busy} onClick={() => void revoke(`userId=${encodeURIComponent(list[0].userId)}`, list[0].userId, `Đã đăng xuất mọi máy của ${list[0].name}.`)}>Đăng xuất tất cả</button>}</p>}
              <ul className="divide-y rounded-xl border">
                {list.map((s) => {
                  const Icon = s.client === 'web' ? Laptop : Smartphone;
                  return (
                    <li key={s.id} className="flex flex-wrap items-center gap-3 px-3 py-2.5 text-sm">
                      <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-surface-2 text-ink-2"><Icon size={17} /></span>
                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-center gap-1.5"><b className="text-ink">{s.device}</b>{s.current && <StatusChip tone="green">Máy này</StatusChip>}<StatusChip tone={tone(s.method)}>{s.methodLabel}</StatusChip></span>
                        <span className="block text-xs text-ink-3">{[s.place, s.ip ? `IP ${s.ip}` : null, `dùng ${ago(s.lastSeenAt)}`, `vào ${dt(s.createdAt.slice(0, 19), true)}`].filter(Boolean).join(' · ')}</span>
                      </span>
                      {!s.current && <Button size="sm" variant="ghost" className="text-bad" disabled={busy === s.id} onClick={() => void revoke(`id=${encodeURIComponent(s.id)}`, s.id, `Đã đăng xuất ${s.device}.`)}>{busy === s.id ? 'Đang…' : 'Đăng xuất'}</Button>}
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
          {msg && <p className="text-sm text-good">{msg}</p>}
        </div>
      )}
    </ChartCard>
  );
}
