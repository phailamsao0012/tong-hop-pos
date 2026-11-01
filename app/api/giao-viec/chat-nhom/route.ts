import { bossRoute } from '../me/route';
import { saveGroup, deleteGroup } from '@/lib/zalo/zalo-chat';
export async function POST(request: Request) { return bossRoute(request, async (db, actor) => saveGroup(db, actor, await request.json() as Record<string, unknown>)); }
export async function DELETE(request: Request) { return bossRoute(request, async (db, actor) => deleteGroup(db, actor, new URL(request.url).searchParams.get('id') ?? '')); }
