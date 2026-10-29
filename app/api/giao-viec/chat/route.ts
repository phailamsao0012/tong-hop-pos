import { bossRoute } from '../me/route';
import { listConversations } from '@/lib/zalo-chat';
export async function GET(request: Request) { return bossRoute(request, async db => ({ conversations: await listConversations(db) })); }
