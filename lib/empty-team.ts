// Cờ "trang bộ phận này, đang chọn bộ phận kia" theo từng request (xem setEmptyCheck ở lib/team.ts). Chỉ dùng phía máy chủ.
import { AsyncLocalStorage } from 'node:async_hooks';
import { setEmptyCheck } from './team';

const store = new AsyncLocalStorage<boolean>();
setEmptyCheck(() => store.getStore() === true);

/** URL báo cáo có ?empty=1 thì mọi lọc nhóm trong lần chạy này trả tập rỗng, số về 0. */
export const withEmptyTeam = <T>(url: URL, run: () => T): T => url.searchParams.get('empty') === '1' ? store.run(true, run) : run();
