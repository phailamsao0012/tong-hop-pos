import { redirect } from 'next/navigation';
import { getSessionUser, hasAnyUser } from '@/lib/auth';
import Dashboard from './dashboard';

export const dynamic = 'force-dynamic';

export default async function Home() {
  const user = await getSessionUser();
  if (!user) redirect((await hasAnyUser()) ? '/login' : '/setup');
  return <Dashboard user={user} />;
}
