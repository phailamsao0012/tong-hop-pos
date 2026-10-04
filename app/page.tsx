import { redirect } from 'next/navigation';
import { getSessionUser, hasAnyUser } from '@/lib/auth';
import Dashboard from './dashboard';
import { ensureDemoSeed, isDemo } from '@/lib/demo/mode';

export const dynamic = 'force-dynamic';

export default async function Home({ searchParams }: { searchParams: Promise<{ view?: string | string[] }> }) {
  const demo = isDemo();
  if (demo) await ensureDemoSeed();
  const user = await getSessionUser();
  if (!user) redirect(demo || (await hasAnyUser()) ? '/login' : '/setup');
  // Trang mở thẳng bằng ?view=: máy chủ vẽ đúng trang đó để HTML khớp với trình duyệt (menu, thanh tab bộ phận).
  const view = (await searchParams).view;
  const dashboard = <Dashboard user={user} initialView={typeof view === 'string' ? view : undefined} demo={demo} />;
  return demo ? <>{dashboard}<div className="demo-ribbon" role="note">Bản demo · người và số liệu ảo</div></> : dashboard;
}
