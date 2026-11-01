import { bossRoute } from '../me/route';
import { webMeetings, createMeeting, listContacts } from '@/lib/zalo/zalo-work';
import { createZaloSender } from '@/lib/zalo/zalo';
export async function GET(request: Request) { return bossRoute(request, async db => ({ meetings: await webMeetings(db), contacts: await listContacts(db) })); }
export async function POST(request: Request) { return bossRoute(request, async (db, actor) => createMeeting(db, actor, await request.json() as Parameters<typeof createMeeting>[2], Date.now(), createZaloSender(db))); }
