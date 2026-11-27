'use client';

// Bảo mật của tôi: đổi mật khẩu, mã ứng dụng (TOTP), passkey, thiết bị đã tin cậy. Ai cũng thấy trang này.
import { useCallback, useEffect, useState } from 'react';
import { startRegistration } from '@simplewebauthn/browser';
import { KeyRound, Lock, ShieldCheck, Smartphone } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { SessionUser } from '@/lib/auth/auth';
import { ROLE_LABELS } from '@/lib/auth/access';
import { ChartCard, FoldBlock, PageHeader, SegmentedControl, StatusChip, dt } from './ui-kit';
import { PageHeadMoi } from './trang-moi';
import { SessionsCard } from './sessions-card';
import { IDLE_OPTIONS, idleMinutes, setIdleMinutes } from './idle-lock';

type Status = { totpEnabled: boolean; passkeys: { id: string; name: string; device_type: string | null; backed_up: number; created_at: string; last_used_at: string | null }[]; devices: { id: string; created_at: string; last_used_at: string | null; user_agent: string | null; current: boolean }[]; mfaRequired: boolean; mfaEnabled: boolean; mailConfigured: boolean };

export function SecurityPanel({ user, gate = false, uiMoi = false }: { user: SessionUser; gate?: boolean; /** Cờ THP_UI_MOI: bật thì bố cục kiểu mới, tắt thì y như cũ. */ uiMoi?: boolean }) {
  const [status, setStatus] = useState<Status | null>(null);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [setup, setSetup] = useState<{ secret: string; uri: string; qr: string } | null>(null);
  const [code, setCode] = useState('');
  const [pw, setPw] = useState({ current: '', next: '' });
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => { const r = await fetch('/api/auth/security', { cache: 'no-store' }); if (r.ok) setStatus(await r.json() as Status); }, []);
  useEffect(() => { void load(); }, [load]);
  const post = async (url: string, body: unknown) => {
    const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({})) as { error?: string } & Record<string, unknown>;
    if (!r.ok) throw new Error(j.error ?? `Lỗi ${r.status}.`);
    return j;
  };
  const run = async (fn: () => Promise<string>) => { setBusy(true); setMsg(null); try { setMsg({ text: await fn(), ok: true }); await load(); } catch (e) { setMsg({ text: e instanceof Error ? e.message : 'Lỗi.', ok: false }); } finally { setBusy(false); } };
  const startTotp = () => void run(async () => {
    const j = await post('/api/auth/totp', { action: 'setup' }) as { secret: string; uri: string };
    const QR = await import('qrcode');
    setSetup({ secret: j.secret, uri: j.uri, qr: await QR.toDataURL(j.uri, { width: 200, margin: 1 }) });
    return 'Quét mã QR bằng ứng dụng xác thực rồi nhập mã 6 số để bật.';
  });
  const enableTotp = () => void run(async () => { await post('/api/auth/totp', { action: 'enable', code }); setSetup(null); setCode(''); if (gate) window.location.reload(); return 'Đã bật mã ứng dụng.'; });
  const disableTotp = () => { const c = window.prompt('Nhập mã ứng dụng hiện tại để tắt:'); if (c) void run(async () => { await post('/api/auth/totp', { action: 'disable', code: c }); return 'Đã tắt mã ứng dụng.'; }); };
  const addPasskey = () => void run(async () => {
    const name = window.prompt('Đặt tên cho passkey (VD: iPhone của Vũ, MacBook):', '') ?? '';
    const j = await post('/api/auth/passkey', { action: 'register-options' }) as { challengeId: string; options: unknown };
    const response = await startRegistration({ optionsJSON: j.options as Parameters<typeof startRegistration>[0]['optionsJSON'] });
    await post('/api/auth/passkey', { action: 'register-verify', challengeId: j.challengeId, response, name });
    if (gate) window.location.reload();
    return 'Đã thêm passkey.';
  });
  const [canPasskey, setCanPasskey] = useState(false);
  useEffect(() => { setCanPasskey(!!window.PublicKeyCredential); }, []);
  const compliant = !status || !status.mfaRequired || status.mfaEnabled;

  // [khối chung] Các khối dùng chung cho bố cục cũ và bố cục kiểu mới (cờ THP_UI_MOI): cùng JSX, chỉ chỗ đặt khác nhau.
  // fold: chỉ bố cục mới truyền (thu gọn thẻ); bố cục cũ không truyền nên thẻ y như trước.
  const mfaWarn = () => (
        <div data-ui="round" className="rounded-2xl border border-warn/30 bg-warn-bg p-4 text-sm text-warn">
          <strong>Vai trò {ROLE_LABELS[user.role]} bắt buộc bật xác thực 2 lớp.</strong> Bật mã ứng dụng hoặc thêm một passkey bên dưới; sau đó các trang báo cáo mới mở.
        </div>
  );
  const mailWarn = () => (
        <p data-ui="round" className="rounded-xl border border-warn/30 bg-warn-bg px-4 py-2.5 text-sm text-warn">Chưa cấu hình gửi thư (BREVO_API_KEY, MAIL_FROM trên Cloudflare), nên chưa gửi được mã OTP về email khi đăng nhập ở thiết bị mới.</p>
  );
  const totpCard = () => (
        <ChartCard icon={Smartphone} title="Mã ứng dụng (Google Authenticator, 1Password…)" subtitle={status?.totpEnabled ? 'Đang bật · mỗi lần đăng nhập cần mã 6 số' : 'Chưa bật'}
          action={status?.totpEnabled ? <Button size="sm" variant="outline" disabled={busy} onClick={disableTotp}>Tắt</Button> : <Button size="sm" disabled={busy} onClick={startTotp}>Bật mã ứng dụng</Button>}>
          {setup ? (
            <div className="flex flex-wrap items-start gap-4">
              <img src={setup.qr} alt="QR" width={160} height={160} className="rounded-lg border" />
              <div className="min-w-0 flex-1 space-y-2 text-sm">
                <p>Mở ứng dụng xác thực, quét mã QR (hoặc nhập khóa <code className="rounded bg-surface-3 px-1">{setup.secret}</code>), rồi nhập mã 6 số:</p>
                <div className="flex gap-2"><Input inputMode="numeric" maxLength={7} className="w-36 text-center text-lg tracking-[.3em]" value={code} onChange={(e) => setCode(e.target.value)} /><Button disabled={busy || code.replace(/\D/g, '').length !== 6} onClick={enableTotp}>Xác nhận và bật</Button></div>
              </div>
            </div>
          ) : <p className="text-sm text-ink-2">{status?.totpEnabled ? 'Mất điện thoại thì đăng nhập bằng passkey hoặc nhờ chủ hệ thống đặt lại.' : 'Mã 6 số đổi mỗi 30 giây trên điện thoại, không cần internet, không cần email.'}</p>}
        </ChartCard>
  );
  const passkeyCard = () => (
        <ChartCard icon={KeyRound} title={`Passkey · ${status?.passkeys.length ?? 0}`} subtitle="Face ID, Touch ID, Windows Hello hoặc khóa bảo mật; đăng nhập không cần mật khẩu"
          action={canPasskey ? <Button size="sm" disabled={busy} onClick={addPasskey}>Thêm passkey</Button> : <span className="text-xs text-ink-3">Trình duyệt này không hỗ trợ</span>}>
          {status?.passkeys.length ? (
            <ul className="space-y-1.5 text-sm">{status.passkeys.map((k) => <li key={k.id} data-ui="round" className="flex items-center justify-between gap-2 rounded-lg border px-3 py-2"><span><strong>{k.name}</strong> <span className="text-xs text-ink-3">· thêm {dt(k.created_at.slice(0, 19))} · dùng gần nhất {k.last_used_at ? dt(k.last_used_at.slice(0, 19), true) : 'chưa'}</span></span><Button size="sm" variant="ghost" className="text-destructive" disabled={busy} onClick={() => { if (window.confirm(`Gỡ passkey "${k.name}"?`)) void run(async () => { await fetch(`/api/auth/passkey?id=${encodeURIComponent(k.id)}`, { method: 'DELETE' }); return 'Đã gỡ passkey.'; }); }}>Gỡ</Button></li>)}</ul>
          ) : <p className="text-sm text-ink-2">Chưa có passkey. Thêm trên mỗi thiết bị bạn hay dùng.</p>}
        </ChartCard>
  );
  const devicesCard = (fold?: { storageKey: string; summary?: string }) => (
        <ChartCard collapse={fold} icon={ShieldCheck} title={`Thiết bị đã tin cậy · ${status?.devices.length ?? 0}`} subtitle="Thiết bị đã xác minh, đăng nhập lại không cần mã OTP email trong 180 ngày">
          {status?.devices.length ? (
            <ul className="space-y-1.5 text-sm">{status.devices.map((d) => <li key={d.id} data-ui="round" className="flex items-center justify-between gap-2 rounded-lg border px-3 py-2"><span className="min-w-0 truncate" title={d.user_agent ?? ''}>{d.current && <StatusChip tone="green">Thiết bị này</StatusChip>} <span className="text-xs text-ink-3">xác minh {dt(d.created_at.slice(0, 19), true)} · dùng {d.last_used_at ? dt(d.last_used_at.slice(0, 19), true) : '—'}</span></span><Button size="sm" variant="ghost" disabled={busy} onClick={() => void run(async () => { await fetch(`/api/auth/security?device=${encodeURIComponent(d.id)}`, { method: 'DELETE' }); return 'Đã gỡ thiết bị.'; })}>Gỡ</Button></li>)}</ul>
          ) : <p className="text-sm text-ink-2">Chưa có thiết bị nào (mã OTP email chỉ hoạt động khi chủ hệ thống đã cấu hình gửi thư).</p>}
        </ChartCard>
  );
  const passwordCard = (fold?: { storageKey: string; summary?: string }) => (
        <ChartCard collapse={fold} icon={KeyRound} title="Đổi mật khẩu" subtitle="Đổi xong sẽ đăng xuất mọi phiên">
          <div className="space-y-2">
            <Input type="password" placeholder="Mật khẩu hiện tại" value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} autoComplete="current-password" />
            <Input type="password" placeholder="Mật khẩu mới (từ 10 ký tự)" value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} autoComplete="new-password" />
            <Button variant="outline" disabled={pw.next.length < 10 || busy} onClick={() => void run(async () => { await fetch('/api/auth/password', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(pw) }).then(async (r) => { if (!r.ok) throw new Error(((await r.json()) as { error?: string }).error ?? 'Lỗi.'); }); window.location.href = '/login'; return 'Đã đổi.'; })}>Đổi mật khẩu</Button>
          </div>
        </ChartCard>
  );
  const msgEl = (msg: { text: string; ok: boolean }) => (
      <p className={`text-sm ${msg.ok ? 'text-good' : 'text-bad'}`}>{msg.text}</p>
  );
  // [hết khối chung]

  // ===== Bố cục kiểu mới (cờ THP_UI_MOI; plan "giao diện mới cả trang trong" 27/11/2026). Cờ tắt thì nhánh này không chạy. =====
  // Trang cài đặt: đầu trang PageHeadMoi → nhắc bắt buộc 2 lớp / chưa cấu hình thư (nếu có) → khối chính xác thực 2 lớp:
  // Mã ứng dụng + Passkey → khối phụ thu gọn: Phiên đăng nhập, Thiết bị đã tin cậy, Tự khóa màn hình, Đổi mật khẩu.
  if (uiMoi) {
    const k = (s: string) => `ui-moi:security:${s}`;
    return (
      <div className="min-w-0 space-y-4">
        <PageHeadMoi title="Bảo mật tài khoản" scope={`${user.displayName} · ${user.title || ROLE_LABELS[user.role]} · thiết bị đang đăng nhập, Face ID / passkey, mã ứng dụng, mật khẩu`} />
        {!compliant && mfaWarn()}
        {status && !status.mailConfigured && user.role === 'owner' && mailWarn()}
        <div className="grid min-w-0 grid-cols-1 gap-4 lg:grid-cols-2">
          {totpCard()}
          {passkeyCard()}
        </div>
        {msg && msgEl(msg)}
        <div className="grid min-w-0 gap-3">
          {!gate && <FoldBlock icon={ShieldCheck} title="Phiên đăng nhập" storageKey={k('sessions')}><SessionsCard owner={user.role === 'owner'} /></FoldBlock>}
          {devicesCard({ storageKey: k('devices'), summary: `${status?.devices.length ?? 0} thiết bị` })}
          {!gate && <FoldBlock icon={Lock} title="Tự khóa màn hình" storageKey={k('idle')}><IdleCard owner={user.role === 'owner'} /></FoldBlock>}
          {passwordCard({ storageKey: k('password') })}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <PageHeader eyebrow={`${user.displayName} · ${user.title || ROLE_LABELS[user.role]}`} title="Bảo mật tài khoản" subtitle="Thiết bị đang đăng nhập, Face ID / passkey, mã ứng dụng, mật khẩu" />
      {!compliant && mfaWarn()}
      {status && !status.mailConfigured && user.role === 'owner' && mailWarn()}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {!gate && <SessionsCard owner={user.role === 'owner'} />}
        {totpCard()}
        {passkeyCard()}
        {devicesCard()}
        {!gate && <IdleCard owner={user.role === 'owner'} />}
        {passwordCard()}
      </div>
      {msg && msgEl(msg)}
    </div>
  );
}

/** Thời gian tự khóa màn hình trên máy này (anh Vũ 08/10/2026). Chỉ chủ hệ thống được chọn "Không tự khóa". */
function IdleCard({ owner }: { owner: boolean }) {
  const [value, setValue] = useState(30);
  useEffect(() => { setValue(idleMinutes(owner)); }, [owner]);
  const options = IDLE_OPTIONS.filter((o) => !o.ownerOnly || owner);
  return (
    <ChartCard icon={Lock} title="Tự khóa màn hình" subtitle="Không dùng quá thời gian này thì web che số liệu, mở lại bằng Face ID hoặc mật khẩu. Áp dụng cho trình duyệt trên máy này.">
      <SegmentedControl ariaLabel="Thời gian tự khóa" value={String(value)} onChange={(v) => { setIdleMinutes(Number(v)); setValue(Number(v)); }}
        options={options.map((o) => ({ value: String(o.value), label: o.label }))} />
    </ChartCard>
  );
}
