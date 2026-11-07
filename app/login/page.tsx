import { env } from 'cloudflare:workers';
import { redirect } from 'next/navigation';
import { getSessionUser, hasAnyUser } from '@/lib/auth/auth';
import { AuthForm } from '../auth-form';
import { safeNext } from '@/lib/teams/hr-link';
import { mainHandoffUrl, pcLoginError } from '@/lib/auth/pc-link';
import { isReadOnly } from '@/lib/ops/read-only';
import { DEMO_ACCOUNTS, DEMO_PASSWORD, ensureDemoSeed, isDemo } from '@/lib/demo/mode';

export const dynamic = 'force-dynamic';

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; pc?: string }> }) {
  const sp = await searchParams;
  if (await getSessionUser()) redirect(safeNext(sp.next ?? null));
  // Bản PC không kiểm được mật khẩu (không có chìa của web chính): chỉ hiện nút đăng nhập qua web chính (lib/auth/pc-link.ts).
  if (isReadOnly()) return <AuthForm mode="login" intro viaMain={{ href: mainHandoffUrl(), error: pcLoginError(sp.pc) }} />;
  if (isDemo()) {
    await ensureDemoSeed();
    return <AuthForm mode="login" intro demo={{ password: DEMO_PASSWORD, accounts: DEMO_ACCOUNTS.map(({ email, name, title, note }) => ({ email, name, title, note })) }} />;
  }
  if (!(await hasAnyUser())) redirect('/setup');
  // Màn mở đầu logo + linh vật Megatech: anh Vũ chốt ok 09/10, bật cả web thật.
  return <AuthForm mode="login" intro google={!!env.GOOGLE_CLIENT_ID?.trim()} />;
}
