import { redirect } from 'next/navigation';
import { getSessionUser, hasAnyUser } from '@/lib/auth';
import Dashboard from './dashboard';

export const dynamic = 'force-dynamic';

export default async function Home({ searchParams }: { searchParams: Promise<{ view?: string | string[] }> }) {
  const user = await getSessionUser();
  if (!user) redirect((await hasAnyUser()) ? '/login' : '/setup');
  // Trang mở thẳng bằng ?view=: máy chủ vẽ đúng trang đó để HTML khớp với trình duyệt (menu, thanh tab bộ phận).
  const view = (await searchParams).view;
  return <Dashboard user={user} initialView={typeof view === 'string' ? view : undefined} />;
}
