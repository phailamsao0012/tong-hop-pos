import { redirect } from 'next/navigation';
import { getSessionUser, hasAnyUser } from '@/lib/auth';
import { AuthForm } from '../auth-form';
import { safeNext } from '@/lib/hr-link';
import { DEMO_ACCOUNTS, DEMO_PASSWORD, ensureDemoSeed, isDemo } from '@/lib/demo/mode';

export const dynamic = 'force-dynamic';

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  if (await getSessionUser()) redirect(safeNext((await searchParams).next ?? null));
  if (isDemo()) {
    await ensureDemoSeed();
    return <AuthForm mode="login" demo={{ password: DEMO_PASSWORD, accounts: DEMO_ACCOUNTS.map(({ email, name, title, note }) => ({ email, name, title, note })) }} />;
  }
  if (!(await hasAnyUser())) redirect('/setup');
  return <AuthForm mode="login" />;
}
