import { bossRoute } from '../me/route';
import { webTaskDetail, moveTask, editTask, addTaskNote, type Status } from '@/lib/zalo-work';
import { createZaloSender } from '@/lib/zalo';
type Context = { params: Promise<{ id: string }> };
export async function GET(request: Request, context: Context) {
  return bossRoute(request, async (db, actor) => webTaskDetail(db, actor, (await context.params).id));
}
export async function PATCH(request: Request, context: Context) {
  return bossRoute(request, async (db, actor) => {
    const { task } = await webTaskDetail(db, actor, (await context.params).id);
    const input = await request.json() as Parameters<typeof editTask>[3] & { status?: Status; reason?: string; note?: string }, send = createZaloSender(db);
    if (input.status) return moveTask(db, actor, task.no, input.status, input.reason ?? '', Date.now(), send);
    if (input.note) return addTaskNote(db, actor, task.no, input.note, Date.now(), send);
    return editTask(db, actor, task.no, input, Date.now(), send);
  });
}
