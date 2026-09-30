import { redirect } from 'next/navigation';
import { getSessionUser, hasAnyUser } from '@/lib/auth';
import { AuthForm } from '../auth-form';
import { safeNext } from '@/lib/hr-link';

export const dynamic = 'force-dynamic';

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  if (await getSessionUser()) redirect(safeNext((await searchParams).next ?? null));
  if (!(await hasAnyUser())) redirect('/setup');
  return <AuthForm mode="login" />;
}
