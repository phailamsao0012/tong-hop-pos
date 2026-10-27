import { bossRoute } from './me/route';
import { listTasks, listContacts, createTask, weekSummary } from '@/lib/zalo-work';
import { createZaloSender } from '@/lib/zalo';
import { todayVn } from '@/lib/report-time';
export async function GET(request: Request) {
  return bossRoute(request, async (db, actor) => {
    const p = new URL(request.url).searchParams;
    const contacts = await listContacts(db);
    return { tasks: await listTasks(db, { actor, status: 'all', month: p.get('month') || undefined, week: p.get('week') ? Number(p.get('week')) : undefined }), contacts, summaries: await Promise.all(contacts.filter(c => c.active && c.kind === 'leader').map(async c => ({ leaderId: c.id, staff: await weekSummary(db, c.id, todayVn()) }))) };
  });
}
export async function POST(request: Request) {
  return bossRoute(request, async (db, actor) => {
    const input = await request.json() as Parameters<typeof createTask>[2];
    const task = await createTask(db, actor, input, Date.now(), createZaloSender(db));
    const recipient = (await listContacts(db)).find(c => c.id === task.assignee_id);
    return { task, message: `Đã giao V${task.no} cho ${recipient?.name}, ${recipient?.chat_id ? 'đã ghi thông báo Zalo' : 'chưa nối Zalo'}` };
  });
}
