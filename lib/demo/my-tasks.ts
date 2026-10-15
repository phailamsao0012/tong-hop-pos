import { allowedPos } from '../access';
import { scopeAllowed, type TaskData, type TaskScope, type TaskUser } from '../my-tasks';

const DAY = 86400000;
/** Việc ảo riêng, không ghi vào đơn hoặc làm đổi số báo cáo demo. */
export function demoTaskData(user: TaskUser, scope: TaskScope, now = Date.now()): TaskData {
  const data: TaskData = { stuck: [], callback: [], dormant: [] };
  if (!scopeAllowed(user, scope) || !allowedPos(user).some((p) => p !== '__none__')) return data;
  const at = (days: number) => new Date(now - days * DAY).toISOString();
  const n = scope === 'mine' ? 1 : scope === 'team' ? 2 : 3;
  for (let i = 0; i < n; i++) {
    data.stuck.push({ id: 'demo-order-' + i, code: 'DEMO-' + (i + 1), createdAt: at(i ? 1.5 : 3) });
    data.callback.push({ id: 'demo-customer-' + i, phone: '090000000' + (i + 1), lastNoteAt: at(i ? 17 : 21) });
    data.dormant.push({ phone: '090000000' + (i + 4), lastAt: at(i ? 17 : 20), gap: 20 });
  }
  return data;
}
