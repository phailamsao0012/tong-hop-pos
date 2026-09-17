import { redirect } from 'next/navigation';
import { getSessionUser, hasAnyUser } from '@/lib/auth';
import { AuthForm } from '../auth-form';

export const dynamic = 'force-dynamic';

export default async function LoginPage() {
  if (await getSessionUser()) redirect('/');
  if (!(await hasAnyUser())) redirect('/setup');
  return <AuthForm mode="login" />;
}
