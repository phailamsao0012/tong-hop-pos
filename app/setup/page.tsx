import { redirect } from 'next/navigation';
import { hasAnyUser } from '@/lib/auth';
import { AuthForm } from '../auth-form';

export const dynamic = 'force-dynamic';

export default async function SetupPage() {
  if (await hasAnyUser()) redirect('/login');
  return <AuthForm mode="setup" />;
}
