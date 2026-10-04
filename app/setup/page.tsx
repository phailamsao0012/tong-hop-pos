import { redirect } from 'next/navigation';
import { hasAnyUser } from '@/lib/auth';
import { AuthForm } from '../auth-form';
import { isDemo } from '@/lib/demo/mode';

export const dynamic = 'force-dynamic';

export default async function SetupPage() {
  if (isDemo() || await hasAnyUser()) redirect('/login');
  return <AuthForm mode="setup" />;
}
