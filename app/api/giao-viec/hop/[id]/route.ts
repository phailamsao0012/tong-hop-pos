import { bossRoute } from '../../me/route';
import { cancelMeeting } from '@/lib/zalo-work';
import { createZaloSender } from '@/lib/zalo';
export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  return bossRoute(request, async (db, actor) => {
    const meeting = await db.prepare('SELECT no FROM zalo_meetings WHERE id=?').bind((await context.params).id).first<{ no: number }>();
    if (!meeting) throw new Error('Không tìm thấy họp.');
    await cancelMeeting(db, actor, meeting.no, Date.now(), createZaloSender(db));
  });
}
