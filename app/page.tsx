import { redirect } from 'next/navigation';
import { getSessionUser, hasAnyUser } from '@/lib/auth/auth';
import Dashboard from './dashboard';
import { ensureDemoSeed, isDemo } from '@/lib/demo/mode';
import { isOwner } from '@/lib/auth/access';
import { CritterPreview } from './loading-critter/preview';
import { StickPreview } from './stickman/preview';

export const dynamic = 'force-dynamic';

export default async function Home({ searchParams }: { searchParams: Promise<{ view?: string | string[]; 'xem-thu'?: string | string[] }> }) {
  const demo = isDemo();
  if (demo) await ensureDemoSeed();
  const user = await getSessionUser();
  if (!user) redirect(demo || (await hasAnyUser()) ? '/login' : '/setup');
  const sp = await searchParams;
  // Trang xem thử con vật chờ tải: chỉ bản demo và chủ hệ thống; web thật bỏ qua tham số này (QA A7).
  if (demo && sp['xem-thu'] === 'con-vat' && isOwner(user)) return <><CritterPreview /><div className="demo-ribbon" role="note">Bản demo · người và số liệu ảo</div></>;
  if (demo && sp['xem-thu'] === 'nguoi-que' && isOwner(user)) return <><StickPreview /><div className="demo-ribbon" role="note">Bản demo · người và số liệu ảo</div></>;
  // Trang mở thẳng bằng ?view=: máy chủ vẽ đúng trang đó để HTML khớp với trình duyệt (menu, thanh tab bộ phận).
  const view = sp.view;
  const dashboard = <Dashboard user={user} initialView={typeof view === 'string' ? view : undefined} demo={demo} />;
  return demo ? <>{dashboard}<div className="demo-ribbon" role="note">Bản demo · người và số liệu ảo</div></> : dashboard;
}
