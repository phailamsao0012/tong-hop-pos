// Bộ phận đang chọn ở thanh trên khi mở trang của bộ phận kia, theo từng request (xem setLensCheck ở lib/team.ts). Chỉ dùng phía máy chủ.
// Kèm phạm vi Mentor / Leader (tham số wscope, xem setScopeCheck ở lib/team.ts).
import { AsyncLocalStorage } from 'node:async_hooks';
import { parseTeam, setLensCheck, setScopeCheck, type Team } from '@/lib/teams/team';
import { WEB_TEAM_ID } from '@/lib/teams/web-teams';

const store = new AsyncLocalStorage<Exclude<Team, 'all'>>();
setLensCheck(() => store.getStore() ?? null);
const scopeStore = new AsyncLocalStorage<string[]>();
setScopeCheck(() => scopeStore.getStore() ?? null);

/** wscope → mã team hợp lệ (ghép thẳng vào SQL nên phải qua WEB_TEAM_ID); có tham số mà không mã nào hợp lệ = không ai. */
export const parseScope = (value: string | null): string[] | null => value === null ? null : value.split(',').filter((id) => WEB_TEAM_ID.test(id));

/** URL báo cáo có ?seg=sale|cskh thì mọi lọc nhóm trong lần chạy này chỉ giữ người thuộc thêm bộ phận đó; có ?wscope thì chỉ giữ người các team đó. */
export const withSegLens = <T>(url: URL, run: () => T): T => {
  const seg = parseTeam(url.searchParams.get('seg')), scope = parseScope(url.searchParams.get('wscope'));
  const withSeg = () => seg === 'all' ? run() : store.run(seg, run);
  return scope ? scopeStore.run(scope, withSeg) : withSeg();
};
