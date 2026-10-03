import { getSessionUser, unauthorized } from '@/lib/auth';
import { NO_STORE, satFetch } from '@/lib/sat-proxy';
import { satModule, visibleSatellites } from '@/lib/satellites';

// App · Thêm / Web vệ tinh: các module người dùng được xem (lib/satellites.ts), kèm trạng thái kết nối và số việc chờ.
// Hỏi số chờ của các web vệ tinh song song, mỗi web chờ tối đa 3 giây; không trả lời được thì báo 'down'.
export async function GET() {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  const modules = await Promise.all(visibleSatellites(user).map(async (s) => {
    try {
      const res = await satFetch(user, s.badgePath, {}, { sat: s.id, timeoutMs: 3000 });
      return satModule(s, res.ok ? await res.json().catch(() => null) : null);
    } catch (error) {
      console.error('satellite badge failed', s.id, error);
      return satModule(s, null);
    }
  }));
  return Response.json({ modules }, { headers: NO_STORE });
}
