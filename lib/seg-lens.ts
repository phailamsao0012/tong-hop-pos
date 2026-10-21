// Bộ phận đang chọn ở thanh trên khi mở trang của bộ phận kia, theo từng request (xem setLensCheck ở lib/team.ts). Chỉ dùng phía máy chủ.
import { AsyncLocalStorage } from 'node:async_hooks';
import { parseTeam, setLensCheck, type Team } from './team';

const store = new AsyncLocalStorage<Exclude<Team, 'all'>>();
setLensCheck(() => store.getStore() ?? null);

/** URL báo cáo có ?seg=sale|cskh thì mọi lọc nhóm trong lần chạy này chỉ giữ người thuộc thêm bộ phận đó. */
export const withSegLens = <T>(url: URL, run: () => T): T => {
  const seg = parseTeam(url.searchParams.get('seg'));
  return seg === 'all' ? run() : store.run(seg, run);
};
